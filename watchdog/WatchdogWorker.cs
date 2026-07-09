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
                        if (restrict)
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
                        if (restrict)
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
