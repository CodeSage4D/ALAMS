using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;
using System.Management;
using System.Net;
using System.Net.Sockets;
using QRCoder;

namespace AlamsClient
{
    public partial class MainWindow : Window
    {
        private readonly HttpClient _httpClient = new HttpClient();
        private ClientWebSocket? _webSocket;
        private CancellationTokenSource? _wsCts;
        private DispatcherTimer? _qrTimer;
        private DispatcherTimer? _heartbeatTimer;
        private DispatcherTimer? _uiCountdownTimer;
        private System.IO.Pipes.NamedPipeClientStream? _ipcClient;
        private System.IO.StreamWriter? _ipcWriter;
        private CancellationTokenSource? _ipcCts;

        public string ServerHttpUrl { get; private set; } = "http://localhost:5000";
        public string ServerWsUrl { get; private set; } = "ws://localhost:5000";
        private const string ConfigPath = @"C:\ProgramData\ALAMS\config.json";
        
        private string _computerId = "";
        private string _deviceName = "";
        private string _pcNumber = "";
        private string _qrSeed = "";
        private bool _fallbackEnabled = true;
        private string _currentQrToken = "";
        private string _activeSessionId = "";

        private int _qrCountdown = 30;
        private bool _isUnlocked = false;
        private bool _isOnline = false;

        public MainWindow()
        {
            InitializeComponent();
            
            // Setup timers
            _qrTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
            _qrTimer.Tick += QrTimer_Tick;

            _uiCountdownTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _uiCountdownTimer.Tick += UiCountdownTimer_Tick;

            _heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
            _heartbeatTimer.Tick += HeartbeatTimer_Tick;
        }

        private void LoadConfiguration()
        {
            try
            {
                if (System.IO.File.Exists(ConfigPath))
                {
                    string json = System.IO.File.ReadAllText(ConfigPath);
                    using (JsonDocument doc = JsonDocument.Parse(json))
                    {
                        var root = doc.RootElement;
                        if (root.TryGetProperty("serverUrl", out var urlVal))
                        {
                            string url = urlVal.GetString() ?? "http://localhost:5000";
                            if (url.EndsWith("/"))
                            {
                                url = url.Substring(0, url.Length - 1);
                            }
                            ServerHttpUrl = url;

                            if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                            {
                                ServerWsUrl = "wss://" + url.Substring(8);
                            }
                            else if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                            {
                                ServerWsUrl = "ws://" + url.Substring(7);
                            }
                        }
                        if (root.TryGetProperty("computerId", out var idVal))
                        {
                            _computerId = idVal.GetString() ?? "";
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Failed to load configuration: {ex.Message}");
            }
        }

        private async Task<string?> ListenForUdpBeaconWithTimeoutAsync(int timeoutSeconds = 5)
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
            using var udpClient = new UdpClient();
            udpClient.ExclusiveAddressUse = false;
            udpClient.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            udpClient.Client.Bind(new IPEndPoint(IPAddress.Any, 35200));

            try
            {
                var receiveResult = await udpClient.ReceiveAsync(cts.Token);
                string json = Encoding.UTF8.GetString(receiveResult.Buffer);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("type", out var typeVal) && typeVal.GetString() == "ALAMS_SERVER_BEACON")
                {
                    return root.GetProperty("serverUrl").GetString();
                }
            }
            catch (OperationCanceledException)
            {
                // Timeout reached
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"UDP discovery error: {ex.Message}");
            }
            return null;
        }

        private async Task<string?> ScanSubnetForServerAsync(string clientIp, int port = 5000)
        {
            int lastDot = clientIp.LastIndexOf('.');
            if (lastDot == -1) return null;
            string subnetPrefix = clientIp.Substring(0, lastDot + 1);

            var tcs = new TaskCompletionSource<string?>();
            int completedCount = 0;
            bool found = false;

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

            var tasks = Enumerable.Range(1, 254).Select(async i =>
            {
                if (found) return;
                string targetIp = subnetPrefix + i;
                if (targetIp == clientIp) return;

                try
                {
                    using var client = new HttpClient();
                    client.Timeout = TimeSpan.FromMilliseconds(800);
                    var response = await client.GetAsync($"http://{targetIp}:{port}/health", cts.Token);
                    if (response.IsSuccessStatusCode)
                    {
                        string resStr = await response.Content.ReadAsStringAsync();
                        if (resStr.Contains("healthy"))
                        {
                            found = true;
                            tcs.TrySetResult($"http://{targetIp}:{port}");
                        }
                    }
                }
                catch
                {
                    // Ignore connection failures
                }
                finally
                {
                    int count = Interlocked.Increment(ref completedCount);
                    if (count == 254)
                    {
                        tcs.TrySetResult(null);
                    }
                }
            }).ToArray();

            return await tcs.Task;
        }

        private async Task DiscoverAndConnectServerAsync(string mac)
        {
            UpdateStatus("Discovering central server...", isError: false);
            DeviceNameText.Text = "Listening for Server Discovery Beacon...";

            string? serverUrl = await ListenForUdpBeaconWithTimeoutAsync(5);

            if (serverUrl == null)
            {
                DeviceNameText.Text = "No beacon found. Running active subnet scan...";
                UpdateStatus("Running Subnet Scan...", isError: false);

                string ipv4, ipv6, gateway, dns, adapterName, domainWorkgroup;
                DiscoverNetworkSettings(out ipv4, out ipv6, out gateway, out dns, out adapterName, out domainWorkgroup);

                if (ipv4 != "N/A" && ipv4 != "127.0.0.1")
                {
                    serverUrl = await ScanSubnetForServerAsync(ipv4);
                }
            }

            if (serverUrl != null)
            {
                ServerHttpUrl = serverUrl;
                if (serverUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    ServerWsUrl = "wss://" + serverUrl.Substring(8);
                }
                else if (serverUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                {
                    ServerWsUrl = "ws://" + serverUrl.Substring(7);
                }

                UpdateStatus("Server discovered successfully", isError: false);
                DeviceNameText.Text = $"Connected to discovered server: {ServerHttpUrl}";
            }
            else
            {
                UpdateStatus("Server discovery failed. Using configured default.", isError: true);
                LoadConfiguration();
            }

            await ConnectWebSocketAsync(mac);
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            LoadConfiguration();
            UpdateStatus("Connecting...", isError: false);
            string mac = GetMacAddress();
            DeviceNameText.Text = $"MAC: {mac} | Initializing connections...";
            
            // Initialize and start Named Pipe IPC Client to communicate with Daemon
            _ipcCts = new CancellationTokenSource();
            _ = RunIpcClientAsync(_ipcCts.Token);

            // Auto-discover server and connect
            await DiscoverAndConnectServerAsync(mac);
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            // Block closing lock screen to prevent escape
            if (!_isUnlocked)
            {
                e.Cancel = true;
                UpdateStatus("Closing locked workstation is disabled.", isError: true);
            }
            else
            {
                _ipcCts?.Cancel();
            }
        }

        private string GetMacAddress()
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

        private string GenerateDeviceFingerprint(string motherboardSerial, string biosSerial, string cpuId, string machineGuid)
        {
            try
            {
                string mac = GetMacAddress();
                string combined = $"{motherboardSerial}|{biosSerial}|{cpuId}|{machineGuid}|{mac}";

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

        private string GetServiceStatus(string serviceName)
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey($@"SYSTEM\CurrentControlSet\Services\{serviceName}"))
                {
                    if (key == null) return "Not Registered";
                    var process = new System.Diagnostics.Process
                    {
                        StartInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = "sc.exe",
                            Arguments = $"query {serviceName}",
                            RedirectStandardOutput = true,
                            UseShellExecute = false,
                            CreateNoWindow = true
                        }
                    };
                    process.Start();
                    string output = process.StandardOutput.ReadToEnd();
                    process.WaitForExit();
                    if (output.Contains("RUNNING")) return "RUNNING";
                    if (output.Contains("STOPPED")) return "STOPPED";
                    return "UNKNOWN";
                }
            }
            catch
            {
                return "ERROR";
            }
        }

        private string GetWmiProperty(string wmiClass, string propertyName)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher($"SELECT {propertyName} FROM {wmiClass}"))
                {
                    foreach (var obj in searcher.Get())
                    {
                        var val = obj[propertyName]?.ToString();
                        if (!string.IsNullOrEmpty(val))
                        {
                            return val.Trim();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"WMI Query failed for {wmiClass} - {propertyName}: {ex.Message}");
            }
            return "N/A";
        }

        private string GetTotalRamGB()
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
                if (totalBytes > 0)
                {
                    return $"{(totalBytes / (1024 * 1024 * 1024))} GB";
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"RAM Query failed: {ex.Message}");
            }
            return "N/A";
        }

        private string GetTotalStorageGB()
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
                if (totalBytes > 0)
                {
                    return $"{(totalBytes / (1024 * 1024 * 1024))} GB";
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Storage Query failed: {ex.Message}");
            }
            return "N/A";
        }

        private void DiscoverNetworkSettings(
            out string ipv4,
            out string ipv6,
            out string gateway,
            out string dns,
            out string adapterName,
            out string domainWorkgroup)
        {
            ipv4 = "N/A";
            ipv6 = "N/A";
            gateway = "N/A";
            dns = "N/A";
            adapterName = "N/A";
            domainWorkgroup = "WORKGROUP";

            try
            {
                var activeAdapter = NetworkInterface.GetAllNetworkInterfaces()
                    .FirstOrDefault(nic => nic.OperationalStatus == OperationalStatus.Up &&
                                           nic.NetworkInterfaceType != NetworkInterfaceType.Loopback);

                if (activeAdapter != null)
                {
                    adapterName = activeAdapter.Name;
                    var ipProps = activeAdapter.GetIPProperties();

                    var ipv4Addr = ipProps.UnicastAddresses
                        .FirstOrDefault(ua => ua.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString();
                    var ipv6Addr = ipProps.UnicastAddresses
                        .FirstOrDefault(ua => ua.Address.AddressFamily == AddressFamily.InterNetworkV6)?.Address.ToString();

                    if (!string.IsNullOrEmpty(ipv4Addr)) ipv4 = ipv4Addr;
                    if (!string.IsNullOrEmpty(ipv6Addr)) ipv6 = ipv6Addr;

                    var gatewayAddr = ipProps.GatewayAddresses.FirstOrDefault()?.Address.ToString();
                    if (!string.IsNullOrEmpty(gatewayAddr)) gateway = gatewayAddr;

                    var dnsAddrs = ipProps.DnsAddresses.Select(d => d.ToString());
                    if (dnsAddrs.Any()) dns = string.Join(", ", dnsAddrs);
                }

                var domain = IPGlobalProperties.GetIPGlobalProperties().DomainName;
                if (!string.IsNullOrEmpty(domain))
                {
                    domainWorkgroup = domain;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Network discovery failed: {ex.Message}");
            }
        }

        private void SaveConfiguration()
        {
            try
            {
                string dir = Path.GetDirectoryName(ConfigPath) ?? "";
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var config = new
                {
                    serverUrl = ServerHttpUrl,
                    computerId = _computerId
                };

                string json = JsonSerializer.Serialize(config);
                File.WriteAllText(ConfigPath, json);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to save local config: {ex.Message}");
            }
        }

        private async Task ConnectWebSocketAsync(string mac)
        {
            _wsCts = new CancellationTokenSource();
            _webSocket = new ClientWebSocket();

            try
            {
                Uri serverUri = new Uri(ServerWsUrl);
                await _webSocket.ConnectAsync(serverUri, _wsCts.Token);
                
                SetOnlineStatus(true);

                // Query WMI system specifications
                string motherboardSerial = GetWmiProperty("Win32_BaseBoard", "SerialNumber");
                string biosSerial = GetWmiProperty("Win32_BIOS", "SerialNumber");
                string cpuId = GetWmiProperty("Win32_Processor", "ProcessorId");
                string computerUuid = GetWmiProperty("Win32_ComputerSystemProduct", "UUID");
                string machineGuid = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography", "MachineGuid", "")?.ToString() ?? "N/A";
                string ram = GetTotalRamGB();
                string storage = GetTotalStorageGB();
                string osVersion = $"{GetWmiProperty("Win32_OperatingSystem", "Caption")} (v{GetWmiProperty("Win32_OperatingSystem", "Version")})";
                string clientVersion = "1.0.0";

                string ipv4, ipv6, gateway, dns, adapterName, domainWorkgroup;
                DiscoverNetworkSettings(out ipv4, out ipv6, out gateway, out dns, out adapterName, out domainWorkgroup);

                string fingerprint = GenerateDeviceFingerprint(motherboardSerial, biosSerial, cpuId, machineGuid);

                // Register PC via WS with hardware and network specs
                var registerMessage = new
                {
                    type = "register",
                    macAddress = mac,
                    deviceName = Environment.MachineName,
                    ipAddress = ipv4,
                    fingerprint = fingerprint,
                    computerUuid = computerUuid,
                    machineGuid = machineGuid,
                    motherboardSerial = motherboardSerial,
                    cpuId = cpuId,
                    biosSerial = biosSerial,
                    ram = ram,
                    storage = storage,
                    osVersion = osVersion,
                    clientVersion = clientVersion,
                    ipv6Address = ipv6,
                    gateway = gateway,
                    dnsServers = dns,
                    networkAdapter = adapterName,
                    domainWorkgroup = domainWorkgroup
                };

                string json = JsonSerializer.Serialize(registerMessage);
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _wsCts.Token);

                // Start listening loop
                _ = ListenWebSocketAsync();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"WS connection failed: {ex.Message}");
                SetOnlineStatus(false);
                UpdateStatus("Could not connect to central server. Running offline mode.", isError: true);
                
                // Allow offline input if server offline
                PcNumberText.Text = "OFFLINE MODE";
                DeviceNameText.Text = "Please enter enrollment and PIN credentials to unlock.";
                QrLoaderText.Text = "Workstation Offline";
            }
        }

        private async Task ListenWebSocketAsync()
        {
            byte[] buffer = new byte[4096];
            while (_webSocket != null && _webSocket.State == WebSocketState.Open && !_wsCts!.IsCancellationRequested)
            {
                try
                {
                    var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), _wsCts.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                        SetOnlineStatus(false);
                        break;
                    }

                    string message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    var doc = JsonDocument.Parse(message);
                    var root = doc.RootElement;
                    string type = root.GetProperty("type").GetString() ?? "";

                    if (type == "pending_approval")
                    {
                        string fingerprint = root.TryGetProperty("fingerprint", out var val) ? val.GetString() ?? "" : "";
                        _computerId = root.TryGetProperty("computerId", out var cVal) ? cVal.GetString() ?? "" : "";
                        
                        Dispatcher.Invoke(() =>
                        {
                            PcNumberText.Text = "UNPAIRED";
                            DeviceNameText.Text = "Workstation Pending Pairing Approval";
                            QrLoaderText.Text = $"PENDING REGISTRATION\n\nFingerprint:\n{fingerprint.Substring(0, 16).ToUpper()}";
                            QrLoaderText.Visibility = Visibility.Visible;
                            QrCodeImage.Source = null;

                            // Block inputs until approved by an administrator
                            EnrollmentInput.IsEnabled = false;
                            PinInput.IsEnabled = false;
                            UnlockButton.IsEnabled = false;
                        });
                    }
                    else if (type == "registered")
                    {
                        _computerId = root.GetProperty("computerId").GetString() ?? "";
                        _deviceName = root.GetProperty("deviceName").GetString() ?? "";
                        _pcNumber = root.GetProperty("pcNumber").GetString() ?? "";
                        _fallbackEnabled = root.GetProperty("fallbackEnabled").GetBoolean();
                        _qrSeed = root.GetProperty("qrSeed").GetString() ?? "";

                        // Save pairing configuration locally
                        SaveConfiguration();

                        Dispatcher.Invoke(() =>
                        {
                            PcNumberText.Text = _pcNumber;
                            DeviceNameText.Text = $"{_deviceName} | Online";
                            QrLoaderText.Visibility = Visibility.Collapsed;

                            // Unlock inputs
                            EnrollmentInput.IsEnabled = true;
                            PinInput.IsEnabled = true;
                            UnlockButton.IsEnabled = true;
                        });

                        // Start QR generator loop
                        _qrTimer?.Start();
                        _uiCountdownTimer?.Start();
                        QrTimer_Tick(null, null); // Load first QR immediately
                    }
                    else if (type == "config_profile")
                    {
                        int qrLifetime = root.TryGetProperty("qrLifetime", out var qlVal) ? qlVal.GetInt32() : 60;
                        int heartbeatInterval = root.TryGetProperty("heartbeatInterval", out var hbVal) ? hbVal.GetInt32() : 30;
                        bool offlinePinEnabled = root.TryGetProperty("offlinePinEnabled", out var opVal) ? opVal.GetBoolean() : true;

                        Dispatcher.Invoke(() =>
                        {
                            if (_qrTimer != null)
                            {
                                _qrTimer.Interval = TimeSpan.FromSeconds(qrLifetime);
                            }
                            if (_heartbeatTimer != null)
                            {
                                _heartbeatTimer.Interval = TimeSpan.FromSeconds(heartbeatInterval);
                            }
                            _qrCountdown = qrLifetime;
                            
                            PinInput.IsEnabled = offlinePinEnabled;
                            EnrollmentInput.IsEnabled = offlinePinEnabled;
                            UnlockButton.IsEnabled = offlinePinEnabled;
                        });

                        // Forward custom policies to Daemon over Named Pipe IPC
                        if (root.TryGetProperty("gpoPolicies", out var gpoVal))
                        {
                            _ = SendIpcMessageAsync(new { type = "apply_policies", policies = gpoVal });
                        }
                    }
                    else if (type == "unlock")
                    {
                        string enrollment = root.TryGetProperty("enrollmentNumber", out var val) ? val.GetString() ?? "" : "";
                        Dispatcher.Invoke(() => UnlockWorkstation(enrollment));
                    }
                    else if (type == "lock")
                    {
                        Dispatcher.Invoke(LockWorkstation);
                    }
                    else if (type == "command")
                    {
                        string command = root.GetProperty("command").GetString() ?? "";
                        string commandId = root.GetProperty("commandId").GetString() ?? "";
                        string parameters = root.TryGetProperty("parameters", out var pVal) ? pVal.GetString() ?? "" : "";
                        _ = ProcessRemoteCommandAsync(commandId, command, parameters);
                    }
                    else if (type == "heartbeat_ack")
                    {
                        Debug.WriteLine("Heartbeat acknowledged by server.");
                    }
                    else if (type == "request_diagnostics")
                    {
                        string serviceStatus = GetServiceStatus("AlamsWatchdog") ?? "Not Registered";
                        string shellStatus = "BYPASSED";
                        var shellReg = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Winlogon", "Shell", null);
                        if (shellReg != null && shellReg.ToString().Contains("AlamsClient.exe"))
                        {
                            shellStatus = "OK";
                        }
                        
                        var diagResponse = new
                        {
                            type = "diagnostics_response",
                            computerId = _computerId,
                            diagnostics = new
                            {
                                configurationStatus = File.Exists(ConfigPath) ? "OK" : "MISSING",
                                serviceStatus = serviceStatus,
                                wmiStatus = !string.IsNullOrEmpty(GetWmiProperty("Win32_BaseBoard", "SerialNumber")) ? "OK" : "ERROR",
                                qrStatus = !string.IsNullOrEmpty(_currentQrToken) ? "OK" : "PENDING",
                                shellStatus = shellStatus,
                                explorerStatus = Process.GetProcessesByName("explorer").Length > 0 ? "RUNNING" : "TERMINATED",
                                networkStatus = _isOnline ? "ONLINE" : "OFFLINE",
                                serverConnectivity = "OK",
                                webSocketConnectivity = "OK"
                            }
                        };
                        
                        string diagJson = JsonSerializer.Serialize(diagResponse);
                        byte[] diagBytes = Encoding.UTF8.GetBytes(diagJson);
                        await _webSocket.SendAsync(new ArraySegment<byte>(diagBytes), WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"WS receive error: {ex.Message}");
                    SetOnlineStatus(false);
                    break;
                }
            }
        }

        private async void QrTimer_Tick(object? sender, EventArgs? e)
        {
            if (string.IsNullOrEmpty(_computerId)) return;

            try
            {
                string url = $"{ServerHttpUrl}/api/v1/client/qr-token?computerId={_computerId}";
                string response = await _httpClient.GetStringAsync(url);
                var doc = JsonDocument.Parse(response);
                _currentQrToken = doc.RootElement.GetProperty("token").GetString() ?? "";

                string serverHost = "localhost";
                try
                {
                    serverHost = new Uri(ServerHttpUrl).Host;
                }
                catch
                {
                    // Fallback to localhost if ServerHttpUrl is invalid URI
                }
                string mobileUrl = $"http://{serverHost}:3000/unlock?token={_currentQrToken}";
                
                using (QRCodeGenerator qrGenerator = new QRCodeGenerator())
                using (QRCodeData qrCodeData = qrGenerator.CreateQrCode(mobileUrl, QRCodeGenerator.ECCLevel.Q))
                using (PngByteQRCode qrCode = new PngByteQRCode(qrCodeData))
                {
                    byte[] qrCodeAsPngByteArr = qrCode.GetGraphic(20);
                    
                    var bitmapImage = new BitmapImage();
                    using (var stream = new System.IO.MemoryStream(qrCodeAsPngByteArr))
                    {
                        bitmapImage.BeginInit();
                        bitmapImage.CacheOption = BitmapCacheOption.OnLoad;
                        bitmapImage.StreamSource = stream;
                        bitmapImage.EndInit();
                    }
                    bitmapImage.Freeze();
                    QrCodeImage.Source = bitmapImage;
                }

                _qrCountdown = 30;
                QrProgressBar.Value = 100;
                TimerText.Text = "30s";
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Error fetching QR token: {ex.Message}");
            }
        }

        private void UiCountdownTimer_Tick(object? sender, EventArgs e)
        {
            if (_qrCountdown > 0)
            {
                _qrCountdown--;
                TimerText.Text = $"{_qrCountdown}s";
                QrProgressBar.Value = (_qrCountdown / 30.0) * 100.0;
            }
        }

        private async void HeartbeatTimer_Tick(object? sender, EventArgs e)
        {
            if (_webSocket != null && _webSocket.State == WebSocketState.Open)
            {
                try
                {
                    var heartbeat = new
                    {
                        type = "heartbeat",
                        status = _isUnlocked ? "in_use" : "locked"
                    };
                    string json = JsonSerializer.Serialize(heartbeat);
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                }
                catch
                {
                    SetOnlineStatus(false);
                }
            }
        }

        private async void UnlockButton_Click(object sender, RoutedEventArgs e)
        {
            string enrollment = EnrollmentInput.Text.Trim();
            string pin = PinInput.Password.Trim();

            if (string.IsNullOrEmpty(enrollment) || string.IsNullOrEmpty(pin))
            {
                UpdateStatus("Please enter enrollment and passcode", isError: true);
                return;
            }

            UpdateStatus("Verifying credentials...", isError: false);

            if (_isOnline)
            {
                try
                {
                    var payload = new { enrollmentNumber = enrollment, pin = pin, computerId = _computerId };
                    string json = JsonSerializer.Serialize(payload);
                    var content = new StringContent(json, Encoding.UTF8, "application/json");
                    var response = await _httpClient.PostAsync($"{ServerHttpUrl}/api/v1/client/fallback-auth", content);

                    if (response.IsSuccessStatusCode)
                    {
                        string body = await response.Content.ReadAsStringAsync();
                        var doc = JsonDocument.Parse(body);
                        _activeSessionId = doc.RootElement.GetProperty("sessionId").GetString() ?? "";
                        UnlockWorkstation(enrollment);
                    }
                    else
                    {
                        string errBody = await response.Content.ReadAsStringAsync();
                        var doc = JsonDocument.Parse(errBody);
                        string err = doc.RootElement.TryGetProperty("error", out var val) ? val.GetString() ?? "Invalid PIN" : "Invalid PIN";
                        UpdateStatus(err, isError: true);

                        // Call failed-login API to record audit logs
                        try
                        {
                            var failPayload = new { computerId = _computerId, enrollmentAttempt = enrollment, method = "PIN_FALLBACK" };
                            var failContent = new StringContent(JsonSerializer.Serialize(failPayload), Encoding.UTF8, "application/json");
                            await _httpClient.PostAsync($"{ServerHttpUrl}/api/v1/client/failed-login", failContent);
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"Failed to post login failure alert: {ex.Message}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    UpdateStatus($"Connection error: {ex.Message}", isError: true);
                }
            }
            else
            {
                // Resilient Offline PIN fallback validation (mocking database hash decrypt match)
                // In production, this decrypts the local SQLCipher cache matching the enrollment.
                if (enrollment.StartsWith("ENR") && pin == "123456")
                {
                    _activeSessionId = Guid.NewGuid().ToString();
                    UnlockWorkstation(enrollment + " (OFFLINE)");
                }
                else
                {
                    UpdateStatus("Invalid credentials or user not cached locally.", isError: true);
                }
            }
        }

        private void StartExplorer()
        {
            try
            {
                if (Process.GetProcessesByName("explorer").Length == 0)
                {
                    string windir = Environment.GetEnvironmentVariable("windir") ?? "C:\\Windows";
                    string explorerPath = System.IO.Path.Combine(windir, "explorer.exe");
                    if (System.IO.File.Exists(explorerPath))
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
                Debug.WriteLine($"Failed to start explorer: {ex.Message}");
            }
        }

        private void UnlockWorkstation(string studentEnrollment)
        {
            _isUnlocked = true;
            
            // Notify Daemon to lift restrictions and launch desktop
            _ = SendIpcMessageAsync(new { type = "unlock", enrollment = studentEnrollment });

            this.Hide(); // Hide locked UI shell
            
            // Stop lock-screen UI timers
            _qrTimer?.Stop();
            _uiCountdownTimer?.Stop();

            // Start heartbeat scheduler
            _heartbeatTimer?.Start();

            MessageBox.Show($"Access Granted!\nWelcome, Student: {studentEnrollment}.\nUse the desktop environment responsibly.", "ALAMS Access Authenticated", MessageBoxButton.OK, MessageBoxImage.Information);
            
            // Create a small float window for session tracking / logout
            SessionWidget widget = new SessionWidget(_computerId, _activeSessionId, studentEnrollment, this);
            widget.Show();
        }

        private void TerminateExplorer()
        {
            try
            {
                foreach (var process in Process.GetProcessesByName("explorer"))
                {
                    process.Kill();
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to terminate explorer: {ex.Message}");
            }
        }

        public void LockWorkstation()
        {
            _isUnlocked = false;
            _activeSessionId = "";
            EnrollmentInput.Text = "";
            PinInput.Password = "";
            StatusMessageText.Text = "";

            // Notify Daemon to apply restrictions and kill explorer
            _ = SendIpcMessageAsync(new { type = "lock" });

            this.Show();
            this.Topmost = true;
            this.WindowState = WindowState.Maximized;

            _heartbeatTimer?.Stop();
            
            if (_isOnline)
            {
                _qrTimer?.Start();
                _uiCountdownTimer?.Start();
                QrTimer_Tick(null, null);
            }
        }

        private void SetOnlineStatus(bool online)
        {
            _isOnline = online;
            Dispatcher.Invoke(() =>
            {
                if (online)
                {
                    var emeraldBrush = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#10B981");
                    NetworkIndicator.Fill = emeraldBrush;
                    NetworkStatusText.Text = "ONLINE";
                    NetworkStatusText.Foreground = emeraldBrush;
                }
                else
                {
                    NetworkIndicator.Fill = System.Windows.Media.Brushes.Red;
                    NetworkStatusText.Text = "OFFLINE";
                    NetworkStatusText.Foreground = System.Windows.Media.Brushes.Red;
                    _qrTimer?.Stop();
                    _uiCountdownTimer?.Stop();
                }
            });
        }

        private void UpdateStatus(string message, bool isError)
        {
            Dispatcher.Invoke(() =>
            {
                StatusMessageText.Text = message;
                StatusMessageText.Foreground = isError ? 
                    System.Windows.Media.Brushes.Tomato : 
                    System.Windows.Media.Brushes.LightSkyBlue;
            });
        }

        private void ShowPinOverlayButton_Click(object sender, RoutedEventArgs e)
        {
            PinOverlayGrid.Visibility = Visibility.Visible;
            OverlayOneTimePinInput.Password = "";
            OverlayOneTimePinInput.Focus();
        }

        private void CancelPinOverlay_Click(object sender, RoutedEventArgs e)
        {
            PinOverlayGrid.Visibility = Visibility.Collapsed;
            OverlayOneTimePinInput.Password = "";
        }

        private async void VerifyOverlayPin_Click(object sender, RoutedEventArgs e)
        {
            string otp = OverlayOneTimePinInput.Password.Trim();
            if (string.IsNullOrEmpty(otp) || otp.Length != 6 || !otp.All(char.IsDigit))
            {
                UpdateStatus("Enter a valid 6-digit numeric verification PIN.", isError: true);
                return;
            }

            if (string.IsNullOrEmpty(_computerId))
            {
                UpdateStatus("Workstation is not paired or approved.", isError: true);
                return;
            }

            VerifyOverlayPinButton.IsEnabled = false;
            UpdateStatus("Verifying session PIN...", isError: false);

            try
            {
                var payload = new
                {
                    computerId = _computerId,
                    oneTimePin = otp
                };

                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                HttpResponseMessage response = await _httpClient.PostAsync($"{ServerHttpUrl}/api/v1/client/verify-session-pin", content);

                if (response.IsSuccessStatusCode)
                {
                    string resJson = await response.Content.ReadAsStringAsync();
                    using (JsonDocument doc = JsonDocument.Parse(resJson))
                    {
                        var root = doc.RootElement;
                        string enrollment = root.GetProperty("enrollmentNumber").GetString() ?? "Student";
                        _activeSessionId = root.GetProperty("sessionId").GetString() ?? "";
                        
                        OverlayOneTimePinInput.Password = "";
                        PinOverlayGrid.Visibility = Visibility.Collapsed;
                        UnlockWorkstation(enrollment);
                    }
                }
                else
                {
                    string errJson = await response.Content.ReadAsStringAsync();
                    string errorMsg = "Verification failed.";
                    try
                    {
                        using (JsonDocument errDoc = JsonDocument.Parse(errJson))
                        {
                            errorMsg = errDoc.RootElement.GetProperty("error").GetString() ?? errorMsg;
                        }
                    }
                    catch { }

                    UpdateStatus(errorMsg, isError: true);
                }
            }
            catch (Exception ex)
            {
                UpdateStatus($"Network connection error: {ex.Message}", isError: true);
            }
            finally
            {
                VerifyOverlayPinButton.IsEnabled = true;
            }
        }

        private async Task RunIpcClientAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    _ipcClient = new System.IO.Pipes.NamedPipeClientStream(".", "AlamsIpcPipe", System.IO.Pipes.PipeDirection.InOut, System.IO.Pipes.PipeOptions.Asynchronous);
                    await _ipcClient.ConnectAsync(2000, token);

                    _ipcWriter = new System.IO.StreamWriter(_ipcClient, Encoding.UTF8) { AutoFlush = true };
                    using (var reader = new System.IO.StreamReader(_ipcClient, Encoding.UTF8))
                    {
                        // Send initial synchronization message
                        await SendIpcMessageAsync(new { type = _isUnlocked ? "unlock" : "lock", enrollment = _isUnlocked ? EnrollmentInput.Text.Trim() : "None" });

                        while (_ipcClient.IsConnected && !token.IsCancellationRequested)
                        {
                            string? line = await reader.ReadLineAsync();
                            if (line == null) break;

                            using (var doc = JsonDocument.Parse(line))
                            {
                                var root = doc.RootElement;
                                double cpu = root.TryGetProperty("cpuUsage", out var cpuVal) ? cpuVal.GetDouble() : 0;
                                double ram = root.TryGetProperty("ramUsage", out var ramVal) ? ramVal.GetDouble() : 0;

                                // Send telemetry to central server via WebSocket
                                await ForwardTelemetryToServerAsync(cpu, ram);
                            }
                        }
                    }
                }
                catch (Exception)
                {
                    // Failed to connect/disconnected; retry after delay
                }
                finally
                {
                    _ipcWriter?.Dispose();
                    _ipcWriter = null;
                    _ipcClient?.Dispose();
                    _ipcClient = null;
                }
                await Task.Delay(3000, token);
            }
        }

        private async Task SendIpcMessageAsync(object message)
        {
            if (_ipcWriter != null && _ipcClient != null && _ipcClient.IsConnected)
            {
                try
                {
                    string json = JsonSerializer.Serialize(message);
                    await _ipcWriter.WriteLineAsync(json);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[IPC CLIENT] Failed to send message: {ex.Message}");
                }
            }
        }

        private async Task ForwardTelemetryToServerAsync(double cpu, double ram)
        {
            if (_webSocket != null && _webSocket.State == WebSocketState.Open)
            {
                try
                {
                    var telemetry = new
                    {
                        type = "telemetry",
                        cpuUsage = cpu,
                        ramUsage = ram,
                        loggedStudent = _isUnlocked ? EnrollmentInput.Text.Trim() : "None",
                        policyStatus = "Enforced",
                        installedVersion = "1.0.0"
                    };
                    string json = JsonSerializer.Serialize(telemetry);
                    byte[] bytes = Encoding.UTF8.GetBytes(json);
                    await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[WS TELEMETRY] Failed to dispatch: {ex.Message}");
                }
            }
        }

        private async Task ProcessRemoteCommandAsync(string commandId, string command, string parameters)
        {
            bool success = false;
            string? error = null;

            try
            {
                if (command.Equals("LOCK", StringComparison.OrdinalIgnoreCase))
                {
                    Dispatcher.Invoke(LockWorkstation);
                    success = true;
                }
                else if (command.Equals("UNLOCK", StringComparison.OrdinalIgnoreCase))
                {
                    Dispatcher.Invoke(() => UnlockWorkstation("ADMIN_OVERRIDE"));
                    success = true;
                }
                else if (command.Equals("SHUTDOWN", StringComparison.OrdinalIgnoreCase))
                {
                    Process.Start("shutdown.exe", "/s /t 0 /f");
                    success = true;
                }
                else if (command.Equals("REBOOT", StringComparison.OrdinalIgnoreCase))
                {
                    Process.Start("shutdown.exe", "/r /t 0 /f");
                    success = true;
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            if (_webSocket != null && _webSocket.State == WebSocketState.Open)
            {
                var result = new
                {
                    type = "command_result",
                    commandId = commandId,
                    status = success ? "EXECUTED" : "FAILED",
                    error = error
                };
                byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(result));
                await _webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
            }
        }
    }
}
