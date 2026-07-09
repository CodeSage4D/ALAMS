using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace AlamsBootstrap
{
    class Program
    {
        private static readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        private static string _serverUrl = "http://localhost:5000";
        private static string _wsUrl = "ws://localhost:5000";
        private static string _computerId = "";
        private static string _macAddress = "";
        private static string _fingerprint = "";
        
        static async Task Main(string[] args)
        {
            Console.Clear();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("=====================================================================");
            Console.WriteLine("          ALAMS WORKSTATION BOOTSTRAP INSTALLER & WIZARD             ");
            Console.WriteLine("=====================================================================");
            Console.ResetColor();
            Console.WriteLine();

            try
            {
                // STEP 1: Detect Windows Environment
                if (!ExecuteStep1_EnvironmentCheck())
                {
                    TerminateInstaller(false);
                    return;
                }

                // STEP 2: Locate ALAMS Server
                if (!await ExecuteStep2_LocateServerAsync())
                {
                    TerminateInstaller(false);
                    return;
                }

                // STEP 3: Collect Device Information
                var specs = ExecuteStep3_CollectDeviceInfo();

                // STEP 4: Register Device
                if (!await ExecuteStep4_RegisterDeviceAsync(specs))
                {
                    TerminateInstaller(false);
                    return;
                }

                // STEP 5: Configure Workstation
                if (!ExecuteStep5_ConfigureWorkstation())
                {
                    TerminateInstaller(false);
                    return;
                }

                // STEP 6: Execute Self-Test
                if (!await ExecuteStep6_ExecuteSelfTestAsync())
                {
                    TerminateInstaller(false);
                    return;
                }

                TerminateInstaller(true);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"\n[FATAL ERROR] An unhandled exception occurred: {ex.Message}");
                Console.ResetColor();
                TerminateInstaller(false);
            }
        }

        private static bool ExecuteStep1_EnvironmentCheck()
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("--- STEP 1: DETECT WINDOWS ENVIRONMENT ---");
            Console.ResetColor();

            // 1. Verify Admin Permissions
            bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            if (!isAdmin)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("  [FAIL] Administrator privileges are required. Please run this command as Admin.");
                Console.ResetColor();
                return false;
            }
            Console.WriteLine("  [PASS] Administrator privileges verified.");

            // 2. Verify .NET Runtime
            string netVersion = Environment.Version.ToString();
            Console.WriteLine($"  [PASS] .NET Runtime detected (v{netVersion}).");

            // 3. Detect Existing Config
            const string configPath = @"C:\ProgramData\ALAMS\config.json";
            if (File.Exists(configPath))
            {
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("  [INFO] Existing ALAMS client configuration found.");
                Console.ResetColor();
                try
                {
                    string json = File.ReadAllText(configPath);
                    using (JsonDocument doc = JsonDocument.Parse(json))
                    {
                        if (doc.RootElement.TryGetProperty("serverUrl", out var urlProp))
                        {
                            _serverUrl = urlProp.GetString() ?? _serverUrl;
                            Console.WriteLine($"         Previously configured server URL: {_serverUrl}");
                        }
                        if (doc.RootElement.TryGetProperty("computerId", out var idProp))
                        {
                            _computerId = idProp.GetString() ?? "";
                            Console.WriteLine($"         Workstation ID: {_computerId}");
                        }
                    }
                }
                catch { }
            }

            Console.WriteLine();
            return true;
        }

        private static async Task<bool> ExecuteStep2_LocateServerAsync()
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("--- STEP 2: LOCATE ALAMS CENTRAL SERVER ---");
            Console.ResetColor();

            bool discoverySuccess = false;

            // 1. Attempt Auto-discovery on localhost:5000
            Console.WriteLine("  Attempting automatic server discovery on local loopback...");
            try
            {
                var response = await _httpClient.GetAsync("http://localhost:5000/health");
                if (response.IsSuccessStatusCode)
                {
                    _serverUrl = "http://localhost:5000";
                    discoverySuccess = true;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("  [PASS] Automatically located local ALAMS Server.");
                    Console.ResetColor();
                }
            }
            catch { }

            // 2. Fallback: Prompt for Server URL
            if (!discoverySuccess)
            {
                Console.ForegroundColor = ConsoleColor.Magenta;
                Console.WriteLine("  [WARN] Automatic server discovery on localhost:5000 failed.");
                Console.Write("         Enter server address (e.g., http://192.168.128.73:5000): ");
                string input = Console.ReadLine()?.Trim() ?? "";
                Console.ResetColor();
                if (!string.IsNullOrEmpty(input))
                {
                    _serverUrl = input;
                }
            }

            if (_serverUrl.EndsWith("/"))
            {
                _serverUrl = _serverUrl.Substring(0, _serverUrl.Length - 1);
            }

            // Sync WS URL
            if (_serverUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                _wsUrl = "wss://" + _serverUrl.Substring(8);
            }
            else if (_serverUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            {
                _wsUrl = "ws://" + _serverUrl.Substring(7);
            }

            // 3. Verify HTTP connectivity
            Console.WriteLine($"  Verifying connection to API endpoint: {_serverUrl}/health ...");
            try
            {
                var healthResp = await _httpClient.GetAsync($"{_serverUrl}/health");
                if (!healthResp.IsSuccessStatusCode)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"  [FAIL] Server returned unsuccessful status: {healthResp.StatusCode}");
                    Console.ResetColor();
                    return false;
                }
                Console.WriteLine("  [PASS] API server health status check passed.");
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"  [FAIL] Connection to server API failed: {ex.Message}");
                Console.ResetColor();
                return false;
            }

            // 4. Verify WebSocket connectivity
            Console.WriteLine($"  Verifying WebSocket handshake: {_wsUrl} ...");
            using (var ws = new ClientWebSocket())
            {
                try
                {
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                    {
                        await ws.ConnectAsync(new Uri(_wsUrl), cts.Token);
                    }
                    Console.WriteLine("  [PASS] WebSocket server handshake validated.");
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"  [FAIL] Connection to server WebSocket failed: {ex.Message}");
                    Console.ResetColor();
                    return false;
                }
            }

            Console.WriteLine();
            return true;
        }

        private static DeviceSpecs ExecuteStep3_CollectDeviceInfo()
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("--- STEP 3: COLLECT DEVICE AUDIT SPECIFICATIONS ---");
            Console.ResetColor();

            _macAddress = GetMacAddress();

            string motherboardSerial = GetWmiProperty("Win32_BaseBoard", "SerialNumber");
            string biosSerial = GetWmiProperty("Win32_BIOS", "SerialNumber");
            string cpuId = GetWmiProperty("Win32_Processor", "ProcessorId");
            string computerUuid = GetWmiProperty("Win32_ComputerSystemProduct", "UUID");
            string machineGuid = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography", "MachineGuid", "")?.ToString() ?? "N/A";
            string ram = GetTotalRamGB();
            string storage = GetTotalStorageGB();
            string osVersion = $"{GetWmiProperty("Win32_OperatingSystem", "Caption")} (v{GetWmiProperty("Win32_OperatingSystem", "Version")})";
            string ipv4 = GetLocalIPv4Address();

            _fingerprint = GenerateDeviceFingerprint(motherboardSerial, biosSerial, cpuId, machineGuid);

            Console.WriteLine($"  Host Name   : {Environment.MachineName}");
            Console.WriteLine($"  OS Version  : {osVersion}");
            Console.WriteLine($"  MAC Address : {_macAddress}");
            Console.WriteLine($"  IP Address  : {ipv4}");
            Console.WriteLine($"  System UUID : {computerUuid}");
            Console.WriteLine($"  Fingerprint : {_fingerprint.Substring(0, 16).ToUpper()}...");
            Console.WriteLine($"  RAM/Storage : {ram} / {storage}");
            Console.WriteLine();

            return new DeviceSpecs
            {
                macAddress = _macAddress,
                deviceName = Environment.MachineName,
                ipAddress = ipv4,
                fingerprint = _fingerprint,
                computerUuid = computerUuid,
                machineGuid = machineGuid,
                motherboardSerial = motherboardSerial,
                cpuId = cpuId,
                biosSerial = biosSerial,
                ram = ram,
                storage = storage,
                osVersion = osVersion,
                clientVersion = "1.0.0"
            };
        }

        private static async Task<bool> ExecuteStep4_RegisterDeviceAsync(DeviceSpecs specs)
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("--- STEP 4: WORKSTATION AUTO-REGISTRATION ---");
            Console.ResetColor();

            Console.WriteLine("  Connecting to server WebSocket to submit device specifications...");
            using (var ws = new ClientWebSocket())
            {
                try
                {
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                    {
                        await ws.ConnectAsync(new Uri(_wsUrl), cts.Token);
                    }

                    var registerMsg = new
                    {
                        type = "register",
                        macAddress = specs.macAddress,
                        deviceName = specs.deviceName,
                        ipAddress = specs.ipAddress,
                        fingerprint = specs.fingerprint,
                        computerUuid = specs.computerUuid,
                        machineGuid = specs.machineGuid,
                        motherboardSerial = specs.motherboardSerial,
                        cpuId = specs.cpuId,
                        biosSerial = specs.biosSerial,
                        ram = specs.ram,
                        storage = specs.storage,
                        osVersion = specs.osVersion,
                        clientVersion = specs.clientVersion
                    };

                    string json = JsonSerializer.Serialize(registerMsg);
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);

                    // Wait for registration state confirmation
                    byte[] buffer = new byte[4096];
                    WebSocketReceiveResult result;
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                    {
                        result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
                    }

                    string message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    using (JsonDocument doc = JsonDocument.Parse(message))
                    {
                        var root = doc.RootElement;
                        string type = root.GetProperty("type").GetString() ?? "";

                        if (type == "pending_approval")
                        {
                            _computerId = root.GetProperty("computerId").GetString() ?? "";
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("  [PASS] Device registered. Status: PENDING APPROVAL on dashboard.");
                            Console.ResetColor();
                            Console.WriteLine($"         Assigned Workstation ID: {_computerId}");
                        }
                        else if (type == "registered")
                        {
                            _computerId = root.GetProperty("computerId").GetString() ?? "";
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("  [PASS] Device registered. Status: APPROVED & PAIRED.");
                            Console.ResetColor();
                            Console.WriteLine($"         Assigned Workstation ID: {_computerId}");
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine($"  [FAIL] Unexpected server registration response: {type}");
                            Console.ResetColor();
                            return false;
                        }
                    }

                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"  [FAIL] Workstation registration transaction failed: {ex.Message}");
                    Console.ResetColor();
                    return false;
                }
            }

            Console.WriteLine();
            return true;
        }

        private static bool ExecuteStep5_ConfigureWorkstation()
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("--- STEP 5: WORKSTATION LOCAL PROVISIONING ---");
            Console.ResetColor();

            const string installDir = @"C:\Program Files\ALAMS";
            const string configDir = @"C:\ProgramData\ALAMS";

            try
            {
                // Create directories
                if (!Directory.Exists(installDir)) Directory.CreateDirectory(installDir);
                if (!Directory.Exists(configDir)) Directory.CreateDirectory(configDir);
                Console.WriteLine("  [PASS] Installation folders initialized.");

                // Write config.json
                var configObj = new
                {
                    serverUrl = _serverUrl,
                    computerId = _computerId
                };
                string json = JsonSerializer.Serialize(configObj, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(Path.Combine(configDir, "config.json"), json);
                Console.WriteLine("  [PASS] Provisioned C:\\ProgramData\\ALAMS\\config.json configuration.");

                // Check binaries exist
                string clientPath = Path.Combine(installDir, "AlamsClient.exe");
                string watchdogPath = Path.Combine(installDir, "AlamsWatchdog.exe");

                // Note: Copy them if they exist in build folders
                string currentDir = AppDomain.CurrentDomain.BaseDirectory;
                
                // Attempt local copies from deployment directory
                if (File.Exists(Path.Combine(currentDir, "AlamsClient.exe")))
                {
                    File.Copy(Path.Combine(currentDir, "AlamsClient.exe"), clientPath, true);
                    Console.WriteLine("  [PASS] Copied AlamsClient binary to C:\\Program Files\\ALAMS\\");
                }
                if (File.Exists(Path.Combine(currentDir, "AlamsWatchdog.exe")))
                {
                    File.Copy(Path.Combine(currentDir, "AlamsWatchdog.exe"), watchdogPath, true);
                    Console.WriteLine("  [PASS] Copied AlamsWatchdog service binary to C:\\Program Files\\ALAMS\\");
                }

                // Check overall file presence
                bool clientExists = File.Exists(clientPath);
                bool watchdogExists = File.Exists(watchdogPath);

                if (clientExists && watchdogExists)
                {
                    Console.WriteLine("  [PASS] Installation integrity verified.");
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("  [INFO] Workstation files will be deployed via client setup scripts.");
                    Console.ResetColor();
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"  [FAIL] Failed to apply local configurations: {ex.Message}");
                Console.ResetColor();
                return false;
            }

            Console.WriteLine();
            return true;
        }

        private static async Task<bool> ExecuteStep6_ExecuteSelfTestAsync()
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("--- STEP 6: WORKSTATION INTEGRATED SELF-TEST ---");
            Console.ResetColor();

            bool allPassed = true;

            // 1. Validate HTTP Endpoint
            try
            {
                var resp = await _httpClient.GetAsync($"{_serverUrl}/health");
                if (resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("  [PASS] HTTP Server API Communication");
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("  [FAIL] HTTP Server API Communication");
                    Console.ResetColor();
                    allPassed = false;
                }
            }
            catch
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("  [FAIL] HTTP Server API Communication");
                Console.ResetColor();
                allPassed = false;
            }

            // 2. Validate DB diagnostics
            try
            {
                var resp = await _httpClient.GetAsync($"{_serverUrl}/api/v1/health/diagnostics");
                if (resp.IsSuccessStatusCode)
                {
                    Console.WriteLine("  [PASS] Database Connectivity");
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("  [FAIL] Database Connectivity");
                    Console.ResetColor();
                    allPassed = false;
                }
            }
            catch
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("  [FAIL] Database Connectivity");
                Console.ResetColor();
                allPassed = false;
            }

            // 3. Validate WS server endpoint
            using (var ws = new ClientWebSocket())
            {
                try
                {
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                    {
                        await ws.ConnectAsync(new Uri(_wsUrl), cts.Token);
                    }
                    Console.WriteLine("  [PASS] WebSocket Server Connection");
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                }
                catch
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("  [FAIL] WebSocket Server Connection");
                    Console.ResetColor();
                    allPassed = false;
                }
            }

            // 4. Validate Configuration loading
            const string configPath = @"C:\ProgramData\ALAMS\config.json";
            if (File.Exists(configPath) && !string.IsNullOrEmpty(_computerId))
            {
                Console.WriteLine("  [PASS] Configuration Loading & Local ID Pair");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("  [FAIL] Configuration Loading & Local ID Pair");
                Console.ResetColor();
                allPassed = false;
            }

            // 5. Check Watchdog Service status
            var watchdogSvc = GetServiceStatus("AlamsWatchdog");
            if (watchdogSvc != null)
            {
                Console.WriteLine($"  [PASS] Watchdog Service Registered (Status: {watchdogSvc})");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("  [INFO] Watchdog Service check bypassed (not registered yet; will be completed upon silent install).");
                Console.ResetColor();
            }

            // 6. Check Shell configuration
            var shellReg = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Winlogon", "Shell", null);
            if (shellReg != null && shellReg.ToString()!.Contains("AlamsClient.exe"))
            {
                Console.WriteLine("  [PASS] Registry Restricted Student Shell Override");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine("  [INFO] Shell override check bypassed (will be enabled when Restricting shell for student user).");
                Console.ResetColor();
            }

            Console.WriteLine();
            return allPassed;
        }

        private static string GetMacAddress()
        {
            try
            {
                string mac = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(nic => nic.OperationalStatus == OperationalStatus.Up && 
                                  nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    .Select(nic => nic.GetPhysicalAddress().ToString())
                    .FirstOrDefault() ?? "001A2B3C4D5E";

                if (mac.Length == 12)
                {
                    mac = string.Join(":", Enumerable.Range(0, 6).Select(i => mac.Substring(i * 2, 2)));
                }
                return mac;
            }
            catch
            {
                return "00:1A:2B:3C:4D:5E";
            }
        }

        private static string GetLocalIPv4Address()
        {
            try
            {
                return NetworkInterface.GetAllNetworkInterfaces()
                    .Where(nic => nic.OperationalStatus == OperationalStatus.Up && 
                                  nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
                    .Where(ua => ua.Address.AddressFamily == AddressFamily.InterNetwork)
                    .Select(ua => ua.Address.ToString())
                    .FirstOrDefault() ?? "127.0.0.1";
            }
            catch
            {
                return "127.0.0.1";
            }
        }

        private static string GetWmiProperty(string wmiClass, string propertyName)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher($"SELECT {propertyName} FROM {wmiClass}"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        var val = obj[propertyName]?.ToString();
                        if (!string.IsNullOrEmpty(val)) return val.Trim();
                    }
                }
            }
            catch { }
            return "N/A";
        }

        private static string GetTotalRamGB()
        {
            try
            {
                long totalBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Capacity FROM Win32_PhysicalMemory"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        if (long.TryParse(obj["Capacity"]?.ToString(), out long capacity))
                        {
                            totalBytes += capacity;
                        }
                    }
                }
                if (totalBytes > 0) return $"{totalBytes / (1024 * 1024 * 1024)} GB";
            }
            catch { }
            return "N/A";
        }

        private static string GetTotalStorageGB()
        {
            try
            {
                long totalBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Size FROM Win32_DiskDrive"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        if (long.TryParse(obj["Size"]?.ToString(), out long size))
                        {
                            totalBytes += size;
                        }
                    }
                }
                if (totalBytes > 0) return $"{totalBytes / (1024 * 1024 * 1024)} GB";
            }
            catch { }
            return "N/A";
        }

        private static string GenerateDeviceFingerprint(string motherboardSerial, string biosSerial, string cpuId, string machineGuid)
        {
            try
            {
                string combined = $"{motherboardSerial}|{biosSerial}|{cpuId}|{machineGuid}|{_macAddress}";
                using (var sha256 = SHA256.Create())
                {
                    byte[] bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(combined));
                    return string.Concat(bytes.Select(b => b.ToString("x2")));
                }
            }
            catch
            {
                return Guid.NewGuid().ToString().Replace("-", "");
            }
        }

        private static string? GetServiceStatus(string serviceName)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher($"SELECT State FROM Win32_Service WHERE Name='{serviceName}'"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        return obj["State"]?.ToString();
                    }
                }
            }
            catch { }
            return null;
        }

        private static void TerminateInstaller(bool success)
        {
            Console.WriteLine();
            if (success)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("=====================================================================");
                Console.WriteLine("      ✔ ALAMS WORKSTATION BOOTSTRAP PROVISIONING COMPLETE (GO)       ");
                Console.WriteLine("=====================================================================");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("=====================================================================");
                Console.WriteLine("      ✖ ALAMS WORKSTATION BOOTSTRAP PROVISIONING FAILED (NO-GO)      ");
                Console.WriteLine("=====================================================================");
            }
            Console.ResetColor();
            Console.WriteLine("\nPress any key to exit...");
            try { Console.ReadKey(); } catch { }
        }
    }

    class DeviceSpecs
    {
        public string macAddress { get; set; } = "";
        public string deviceName { get; set; } = "";
        public string ipAddress { get; set; } = "";
        public string fingerprint { get; set; } = "";
        public string computerUuid { get; set; } = "";
        public string machineGuid { get; set; } = "";
        public string motherboardSerial { get; set; } = "";
        public string cpuId { get; set; } = "";
        public string biosSerial { get; set; } = "";
        public string ram { get; set; } = "";
        public string storage { get; set; } = "";
        public string osVersion { get; set; } = "";
        public string clientVersion { get; set; } = "";
    }
}
