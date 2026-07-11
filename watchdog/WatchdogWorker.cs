using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Management;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;

namespace AlamsDaemon
{
    public class WatchdogWorker : BackgroundService
    {
        private const string ClientProcessName = "AlamsClient";
        private const string DesktopProcessName = "explorer";
        private const string ConfigPath = @"C:\ProgramData\ALAMS\config.json";
        private const string IpcPipeName = "AlamsIpcPipe";

        private readonly HttpClient _httpClient = new HttpClient();
        private string _serverUrl = "http://localhost:5000";
        private string _computerId = "";

        private int _heartbeatCounter = 0;
        private float _currentCpuUsage = 0;
        private float _currentRamUsage = 0;
        private string _loggedStudent = "None";
        private bool _isLocked = true;

        // Custom policy settings from central server (Phase 4 Upgrades)
        private bool _usbBlocked = false;
        private bool _cmdBlocked = false;
        private bool _taskMgrBlocked = false;
        private string _wallpaperUrl = "";
        private string _softwareBlocklist = "";

        public WatchdogWorker()
        {
            LoadConfiguration();
            LoadPlugins();
        }

        private void LoadConfiguration()
        {
            try
            {
                if (File.Exists(ConfigPath))
                {
                    string json = File.ReadAllText(ConfigPath);
                    using (JsonDocument doc = JsonDocument.Parse(json))
                    {
                        var root = doc.RootElement;
                        if (root.TryGetProperty("serverUrl", out var urlVal))
                        {
                            _serverUrl = urlVal.GetString() ?? "http://localhost:5000";
                        }
                        if (root.TryGetProperty("computerId", out var idVal))
                        {
                            _computerId = idVal.GetString() ?? "";
                        }
                    }
                }
            }
            catch
            {
                // Fall back to default
            }
        }

        private void LoadPlugins()
        {
            string pluginsDir = @"C:\Program Files\ALAMS\plugins";
            if (!Directory.Exists(pluginsDir))
            {
                try { Directory.CreateDirectory(pluginsDir); } catch { return; }
            }

            try
            {
                string[] files = Directory.GetFiles(pluginsDir, "*.dll");
                foreach (string file in files)
                {
                    try
                    {
                        var assembly = System.Reflection.Assembly.LoadFrom(file);
                        foreach (Type type in assembly.GetTypes())
                        {
                            if (typeof(IPlugin).IsAssignableFrom(type) && !type.IsInterface && !type.IsAbstract)
                            {
                                var plugin = (IPlugin?)Activator.CreateInstance(type);
                                if (plugin != null)
                                {
                                    Console.WriteLine($"[DAEMON] Loaded plugin: {plugin.Name}");
                                    plugin.Initialize(@"C:\ProgramData\ALAMS");
                                    plugin.Execute();
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[DAEMON] Failed to load plugin DLL {file}: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] Plugin directory scan error: {ex.Message}");
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[ALAMS DAEMON] Daemon background service monitoring initialized.");
            
            // Apply registry lockdown on start if not already unlocked
            if (_isLocked)
            {
                SetRestrictions(true);
            }

            // Start IPC Pipe Server
            _ = RunIpcServerAsync(stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                LoadConfiguration();

                var clientProcesses = Process.GetProcessesByName(ClientProcessName);
                var desktopProcesses = Process.GetProcessesByName(DesktopProcessName);

                bool isClientRunning = clientProcesses.Length > 0;
                bool isDesktopActive = desktopProcesses.Length > 0;

                // Collect System Telemetry (CPU & RAM)
                _currentCpuUsage = GetCpuUsage();
                _currentRamUsage = GetRamUsage();

                // Enforce central policy settings
                EnforceLocalPolicies();

                // If explorer is active but ALAMS lockscreen is terminated, bypass has occurred
                if (isDesktopActive && !isClientRunning && _isLocked)
                {
                    Console.WriteLine("[WARNING] Bypass detected! Explorer running without ALAMS Client in lock state. Terminating session...");
                    await ReportBypassViolationAsync();
                    ForceWindowsLogoff();
                }

                // Heartbeat dispatch scheduler (every 10 seconds / 5 ticks)
                _heartbeatCounter++;
                if (_heartbeatCounter >= 5)
                {
                    _heartbeatCounter = 0;
                    await SendWatchdogHeartbeatAsync();
                }

                await Task.Delay(2000, stoppingToken);
            }
        }

        private async Task RunIpcServerAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    using (var pipeServer = new NamedPipeServerStream(IpcPipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous))
                    {
                        await pipeServer.WaitForConnectionAsync(token);

                        using (var reader = new StreamReader(pipeServer, Encoding.UTF8))
                        using (var writer = new StreamWriter(pipeServer, Encoding.UTF8) { AutoFlush = true })
                        {
                            while (pipeServer.IsConnected && !token.IsCancellationRequested)
                            {
                                string? line = await reader.ReadLineAsync();
                                if (line == null) break;

                                using (var doc = JsonDocument.Parse(line))
                                {
                                    var message = doc.RootElement;
                                    string type = message.GetProperty("type").GetString() ?? "";

                                    if (type == "lock")
                                    {
                                        _isLocked = true;
                                        _loggedStudent = "None";
                                        SetRestrictions(true);
                                        TerminateExplorer();
                                    }
                                    else if (type == "unlock")
                                    {
                                        _isLocked = false;
                                        _loggedStudent = message.TryGetProperty("enrollment", out var eVal) ? eVal.GetString() ?? "Student" : "Student";
                                        SetRestrictions(false);
                                        StartExplorer();
                                    }
                                    else if (type == "apply_policies")
                                    {
                                        if (message.TryGetProperty("policies", out var pVal))
                                        {
                                            ApplyCustomPolicies(pVal);
                                        }
                                    }
                                    else if (type == "apply_profile_policies")
                                    {
                                        _usbBlocked = message.TryGetProperty("usbBlocked", out var usb) && usb.GetBoolean();
                                        _cmdBlocked = message.TryGetProperty("cmdBlocked", out var cmd) && cmd.GetBoolean();
                                        _taskMgrBlocked = message.TryGetProperty("taskMgrBlocked", out var tm) && tm.GetBoolean();
                                        _wallpaperUrl = message.TryGetProperty("wallpaperUrl", out var wp) ? wp.GetString() ?? "" : "";
                                        _softwareBlocklist = message.TryGetProperty("softwareBlocklist", out var bl) ? bl.GetString() ?? "" : "";
                                        
                                        SetRestrictions(_isLocked);
                                        EnforceWallpaper(_wallpaperUrl);
                                    }
                                    else if (type == "admin_task")
                                    {
                                        string taskName = message.GetProperty("task").GetString() ?? "";
                                        string paramsStr = message.TryGetProperty("parameters", out var p) ? p.GetString() ?? "" : "";
                                        _ = ExecuteAdminTaskAsync(taskName, paramsStr);
                                    }
                                }

                                // Send back status update
                                var response = new
                                {
                                    cpuUsage = _currentCpuUsage,
                                    ramUsage = _currentRamUsage,
                                    loggedStudent = _loggedStudent,
                                    isLocked = _isLocked
                                };
                                await writer.WriteLineAsync(JsonSerializer.Serialize(response));
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[IPC SERVER] Named Pipe Server exception: {ex.Message}");
                }
                await Task.Delay(1000, token);
            }
        }

        private Microsoft.Win32.RegistryKey? GetActiveUserRegistryKey()
        {
            try
            {
                string[] subKeys = Microsoft.Win32.Registry.Users.GetSubKeyNames();
                foreach (string key in subKeys)
                {
                    // Match standard active user profiles (skipping System profiles and Classes suffixes)
                    if (key.StartsWith("S-1-5-21-") && !key.EndsWith("_Classes"))
                    {
                        return Microsoft.Win32.Registry.Users.OpenSubKey(key, true);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error finding active user SID key: {ex.Message}");
            }
            return null;
        }

        private void SetRestrictions(bool restrict)
        {
            try
            {
                using (var userKey = GetActiveUserRegistryKey())
                {
                    if (userKey == null) return;

                    using (var sysKey = userKey.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Policies\System", true))
                    {
                        if (restrict || _taskMgrBlocked)
                        {
                            sysKey.SetValue("DisableTaskMgr", 1, Microsoft.Win32.RegistryValueKind.DWord);
                            sysKey.SetValue("DisableRegistryTools", 1, Microsoft.Win32.RegistryValueKind.DWord);
                        }
                        else
                        {
                            sysKey.DeleteValue("DisableTaskMgr", false);
                            sysKey.DeleteValue("DisableRegistryTools", false);
                        }
                    }

                    using (var cmdKey = userKey.CreateSubKey(@"Software\Policies\Microsoft\Windows\System", true))
                    {
                        if (_cmdBlocked)
                        {
                            cmdKey.SetValue("DisableCMD", 1, Microsoft.Win32.RegistryValueKind.DWord);
                        }
                        else
                        {
                            cmdKey.DeleteValue("DisableCMD", false);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] Policy restriction update failed: {ex.Message}");
            }
        }

        private void ApplyCustomPolicies(JsonElement policies)
        {
            try
            {
                using (var userKey = GetActiveUserRegistryKey())
                {
                    if (userKey == null) return;

                    foreach (var policy in policies.EnumerateArray())
                    {
                        string keyPath = policy.GetProperty("key").GetString() ?? "";
                        string valName = policy.GetProperty("valueName").GetString() ?? "";
                        string valType = policy.GetProperty("valueType").GetString() ?? "DWORD";
                        string value = policy.GetProperty("value").GetString() ?? "0";

                        using (var subKey = userKey.CreateSubKey(keyPath, true))
                        {
                            if (valType.Equals("DWORD", StringComparison.OrdinalIgnoreCase))
                            {
                                subKey.SetValue(valName, int.Parse(value), Microsoft.Win32.RegistryValueKind.DWord);
                            }
                            else
                            {
                                subKey.SetValue(valName, value, Microsoft.Win32.RegistryValueKind.String);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] Custom policies update failed: {ex.Message}");
            }
        }

        private float GetCpuUsage()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT PercentProcessorTime FROM Win32_PerfFormattedData_PerfOS_Processor WHERE Name='_Total'"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        return Convert.ToSingle(obj["PercentProcessorTime"]);
                    }
                }
            }
            catch {}
            return 0;
        }

        private float GetRamUsage()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        ulong free = Convert.ToUInt64(obj["FreePhysicalMemory"]);
                        ulong total = Convert.ToUInt64(obj["TotalVisibleMemorySize"]);
                        if (total > 0)
                        {
                            return (float)((total - free) * 100.0 / total);
                        }
                    }
                }
            }
            catch {}
            return 0;
        }

        private void StartExplorer()
        {
            try
            {
                if (Process.GetProcessesByName(DesktopProcessName).Length == 0)
                {
                    string windir = Environment.GetEnvironmentVariable("windir") ?? "C:\\Windows";
                    string explorerPath = Path.Combine(windir, "explorer.exe");
                    if (File.Exists(explorerPath))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = explorerPath,
                            UseShellExecute = true,
                            WorkingDirectory = windir
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to start explorer: {ex.Message}");
            }
        }

        private void TerminateExplorer()
        {
            try
            {
                foreach (var process in Process.GetProcessesByName(DesktopProcessName))
                {
                    process.Kill();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to terminate explorer: {ex.Message}");
            }
        }

        private async Task SendWatchdogHeartbeatAsync()
        {
            if (string.IsNullOrEmpty(_computerId)) return;

            try
            {
                var payload = new { computerId = _computerId };
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                await _httpClient.PostAsync($"{_serverUrl}/api/v1/client/watchdog-heartbeat", content);
            }
            catch
            {
                // Fail silently offline
            }
        }

        private async Task ReportBypassViolationAsync()
        {
            if (string.IsNullOrEmpty(_computerId)) return;

            try
            {
                var payload = new
                {
                    computerId = _computerId,
                    alertType = "watchdog_kill",
                    severity = "CRITICAL",
                    details = "ALAMS Client UI process was terminated while workstation was active."
                };

                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                await _httpClient.PostAsync($"{_serverUrl}/api/v1/client/watchdog-alert", content);
            }
            catch
            {
                // Fail silently offline
            }
        }

        private void EnforceLocalPolicies()
        {
            try
            {
                // 1. USB Storage Blocker (HKLM registry requires admin)
                using (var localKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\USBSTOR", true))
                {
                    if (localKey != null)
                    {
                        int expectedValue = _usbBlocked ? 4 : 3;
                        int currentValue = Convert.ToInt32(localKey.GetValue("Start", 3));
                        if (currentValue != expectedValue)
                        {
                            localKey.SetValue("Start", expectedValue, Microsoft.Win32.RegistryValueKind.DWord);
                            Console.WriteLine($"[DAEMON] USB storage state updated to: {(expectedValue == 4 ? "BLOCKED" : "ENABLED")}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] USB policy enforcement failed: {ex.Message}");
            }

            try
            {
                // 2. Kill Blocked Software processes
                if (!string.IsNullOrEmpty(_softwareBlocklist))
                {
                    string[] blockedNames = _softwareBlocklist.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (string name in blockedNames)
                    {
                        string cleanName = name.Trim().Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
                        var procs = Process.GetProcessesByName(cleanName);
                        foreach (var p in procs)
                        {
                            try
                            {
                                p.Kill(true);
                                Console.WriteLine($"[DAEMON] Killed blocklisted software: {cleanName}");
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"[DAEMON] Failed to kill blocklisted process {cleanName}: {ex.Message}");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                 Console.WriteLine($"[DAEMON] Software blocklist audit failed: {ex.Message}");
            }
        }

        private void EnforceWallpaper(string pathOrUrl)
        {
            if (string.IsNullOrEmpty(pathOrUrl)) return;
            try
            {
                using (var userKey = GetActiveUserRegistryKey())
                {
                    if (userKey == null) return;
                    using (var wallKey = userKey.CreateSubKey(@"Control Panel\Desktop", true))
                    {
                        string current = wallKey.GetValue("Wallpaper")?.ToString() ?? "";
                        if (current != pathOrUrl)
                        {
                            wallKey.SetValue("Wallpaper", pathOrUrl, Microsoft.Win32.RegistryValueKind.String);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] Wallpaper policy update failed: {ex.Message}");
            }
        }

        private async Task ExecuteAdminTaskAsync(string taskName, string parameters)
        {
            try
            {
                Console.WriteLine($"[DAEMON] Received administrative task: {taskName} | Parameters: {parameters}");
                
                if (taskName.Equals("RENAME_COMPUTER", StringComparison.OrdinalIgnoreCase))
                {
                    string script = $"Rename-Computer -NewName '{parameters}' -Force";
                    RunPowerShellCommand(script);
                }
                else if (taskName.Equals("SET_STATIC_IP", StringComparison.OrdinalIgnoreCase))
                {
                    using (JsonDocument doc = JsonDocument.Parse(parameters))
                    {
                        var root = doc.RootElement;
                        string ip = root.GetProperty("ipAddress").GetString() ?? "";
                        string gateway = root.GetProperty("gateway").GetString() ?? "";
                        string dns = root.GetProperty("dnsServers").GetString() ?? "";
                        int prefix = root.TryGetProperty("prefixLength", out var pr) ? pr.GetInt32() : 24;

                        string script = $"$adapter = Get-NetAdapter | Where-Object {{ $_.Status -eq 'Up' }} | Select-Object -First 1; " +
                                       $"if ($adapter) {{ " +
                                       $"  New-NetIPAddress -InterfaceAlias $adapter.Name -IPAddress '{ip}' -PrefixLength {prefix} -DefaultGateway '{gateway}' -Force; " +
                                       $"  Set-DnsClientServerAddress -InterfaceAlias $adapter.Name -ServerAddresses '{dns}' " +
                                       $"}}";
                        RunPowerShellCommand(script);
                    }
                }
                else if (taskName.Equals("MANAGE_FIREWALL", StringComparison.OrdinalIgnoreCase))
                {
                    using (JsonDocument doc = JsonDocument.Parse(parameters))
                    {
                        var root = doc.RootElement;
                        string action = root.GetProperty("action").GetString() ?? ""; // "ADD", "REMOVE", "TOGGLE"
                        string ruleName = root.GetProperty("ruleName").GetString() ?? "";
                        
                        string script = "";
                        if (action.Equals("ADD", StringComparison.OrdinalIgnoreCase))
                        {
                            string port = root.GetProperty("port").GetString() ?? "5000";
                            string proto = root.GetProperty("protocol").GetString() ?? "TCP";
                            string dir = root.GetProperty("direction").GetString() ?? "Inbound";
                            string act = root.GetProperty("ruleAction").GetString() ?? "Allow";
                            script = $"New-NetFirewallRule -DisplayName '{ruleName}' -Direction {dir} -Protocol {proto} -LocalPort {port} -Action {act} -Force";
                        }
                        else if (action.Equals("REMOVE", StringComparison.OrdinalIgnoreCase))
                        {
                            script = $"Remove-NetFirewallRule -DisplayName '{ruleName}' -ErrorAction SilentlyContinue";
                        }
                        else if (action.Equals("TOGGLE", StringComparison.OrdinalIgnoreCase))
                        {
                            bool enabled = root.GetProperty("enabled").GetBoolean();
                            script = $"Set-NetFirewallRule -DisplayName '{ruleName}' -Enabled {(enabled ? "True" : "False")}";
                        }
                        
                        if (!string.IsNullOrEmpty(script))
                        {
                            RunPowerShellCommand(script);
                        }
                    }
                }
                else if (taskName.Equals("RESTART_SERVICE", StringComparison.OrdinalIgnoreCase))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c choice /t 2 /d y /n >nul && net stop AlamsWatchdog && net start AlamsWatchdog",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] Admin task execution failed: {ex.Message}");
            }
            await Task.CompletedTask;
        }

        private void RunPowerShellCommand(string script)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{script}\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DAEMON] PowerShell execution error: {ex.Message}");
            }
        }

        private void ForceWindowsLogoff()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "shutdown.exe",
                    Arguments = "/l /f",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to execute force logoff: {ex.Message}");
            }
        }
    }
}
