using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Win32;

namespace AlamsServerConsole
{
    public partial class MainWindow : Window
    {
        private Process? _serverProcess;
        private DispatcherTimer? _monitorTimer;
        private readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        private bool _isServerRunning = false;
        private bool _isClosingAllowed = false;
        private bool _isWebViewInitialized = false;
        private bool _isServerShutdownManually = false;
        private int _autoStartAttempts = 0;
        private DateTime _lastAutoStartAttempt = DateTime.MinValue;
        private const int MaxAutoStartAttempts = 3;
        private static readonly TimeSpan AutoStartCooldown = TimeSpan.FromSeconds(20);

        public MainWindow()
        {
            InitializeComponent();

            // Set up monitoring timer (every 3 seconds)
            _monitorTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            _monitorTimer.Tick += MonitorTimer_Tick;
            _monitorTimer.Start();

            // Set active sidebar navigation bar look initially
            UpdateNavButtonsLook(NavOpsBtn);
            
            AdminPasscodeBox.Focus();
            AppendLog("[SYSTEM] ALAMS Command Center Initialized. Passcode required.");
        }

        private void AppendLog(string text)
        {
            Dispatcher.Invoke(() =>
            {
                if (LogTextBox == null || LogScrollViewer == null) return;
                LogTextBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {text}\n");
                LogScrollViewer.ScrollToEnd();
            });
        }


        private void AuthenticateBtn_Click(object sender, RoutedEventArgs e)
        {
            string password = AdminPasscodeBox.Password;
            if (password == "Admin@ALAMS2026!" || password == "Pilot@2026!" || password == "112233")
            {
                LockOverlay.Visibility = Visibility.Collapsed;
                AppendLog("[SECURITY] Administrator authenticated successfully. Access Granted.");
                
                // Set green glow status indicators
                var greenBrush = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#22C55E");
                IndicatorDot.Background = greenBrush;
                IndicatorDotGlow.Color = System.Windows.Media.Colors.Green;

                // Pre-warm local node process start check
                MonitorTimer_Tick(null, null);
            }
            else
            {
                MessageBox.Show("Invalid Administrator Passcode. Access Denied.", "Security Alert", MessageBoxButton.OK, MessageBoxImage.Error);
                AdminPasscodeBox.Clear();
                AdminPasscodeBox.Focus();
            }
        }

        private void AdminPasscodeBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                AuthenticateBtn_Click(sender, e);
            }
        }

        private async void MonitorTimer_Tick(object? sender, EventArgs e)
        {
            if (LockOverlay.Visibility == Visibility.Visible) return;

            try
            {
                var response = await _httpClient.GetAsync("http://localhost:5000/health");
                // If we got any HTTP response, the process is active on port 5000
                string json = await response.Content.ReadAsStringAsync();
                int activeClients = 0;
                int activeSessions = 0;
                string dbStatus = "DISCONNECTED";

                try
                {
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    activeClients = root.TryGetProperty("activeClients", out var acVal) ? acVal.GetInt32() : 0;
                    activeSessions = root.TryGetProperty("activeSessions", out var asVal) ? asVal.GetInt32() : 0;
                    dbStatus = root.TryGetProperty("dbStatus", out var dbVal) ? (dbVal.GetString() ?? "CONNECTED") : "CONNECTED";
                }
                catch
                {
                    dbStatus = "UNKNOWN";
                }

                UpdateServerStatusUI(true, activeClients, activeSessions, dbStatus);
                if (dbStatus == "CONNECTED")
                {
                    _autoStartAttempts = 0; // Reset auto start attempts when database is fully online
                }
            }
            catch (HttpRequestException)
            {
                // Connection refused/failed - process is offline
                UpdateServerStatusUI(false, 0, 0, "OFFLINE");
                HandleAutoStart();
            }
            catch (Exception)
            {
                // Other unexpected errors
                UpdateServerStatusUI(false, 0, 0, "OFFLINE");
                HandleAutoStart();
            }
        }

        private void HandleAutoStart()
        {
            if (_isServerShutdownManually) return;
            if (AutoHealCheckBox != null && AutoHealCheckBox.IsChecked == false) return;

            if (_autoStartAttempts >= MaxAutoStartAttempts)
            {
                if (DateTime.Now - _lastAutoStartAttempt > TimeSpan.FromMinutes(2))
                {
                    AppendLog("[AUTO-HEAL] Resetting auto-start lockout block after time elapsed.");
                    _autoStartAttempts = 0;
                }
                else
                {
                    return;
                }
            }

            if (DateTime.Now - _lastAutoStartAttempt < AutoStartCooldown) return;

            _lastAutoStartAttempt = DateTime.Now;
            _autoStartAttempts++;
            AppendLog($"[AUTO-HEAL] Server is OFFLINE. Triggering self-healing startup sequence (Attempt {_autoStartAttempts}/{MaxAutoStartAttempts})...");
            
            Task.Run(() => Dispatcher.Invoke(() => StartServerInternal()));
        }

        private void UpdateServerStatusUI(bool online, int activeClients, int activeSessions, string dbStatus)
        {
            Dispatcher.Invoke(() =>
            {
                _isServerRunning = online;

                TopClientsCount.Text = activeClients.ToString();
                TopSessionsCount.Text = activeSessions.ToString();
                DbStatusText.Text = dbStatus;

                if (online)
                {
                    var greenBrush = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#22C55E");
                    DbStatusText.Foreground = greenBrush;
                    StartServerBtn.IsEnabled = false;
                    StopServerBtn.IsEnabled = true;
                    RestartServerBtn.IsEnabled = true;
                }
                else
                {
                    var redBrush = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#EF4444");
                    DbStatusText.Foreground = redBrush;
                    StartServerBtn.IsEnabled = true;
                    StopServerBtn.IsEnabled = false;
                    RestartServerBtn.IsEnabled = false;
                }
            });
        }

        // --- SIDEBAR TABS SWITCH HANDLING ---
        private void NavOpsBtn_Click(object sender, RoutedEventArgs e)
        {
            WorkspaceHeaderTitle.Text = "Operations Center";
            MainTabControl.SelectedIndex = 0;
            UpdateNavButtonsLook(NavOpsBtn);
        }

        private void NavFirewallBtn_Click(object sender, RoutedEventArgs e)
        {
            WorkspaceHeaderTitle.Text = "Windows Firewall";
            MainTabControl.SelectedIndex = 1;
            UpdateNavButtonsLook(NavFirewallBtn);
        }

        private void NavBackupBtn_Click(object sender, RoutedEventArgs e)
        {
            WorkspaceHeaderTitle.Text = "Backup & Recovery";
            MainTabControl.SelectedIndex = 2;
            UpdateNavButtonsLook(NavBackupBtn);
        }

        private void NavWebBtn_Click(object sender, RoutedEventArgs e)
        {
            WorkspaceHeaderTitle.Text = "Embedded Web Panel";
            MainTabControl.SelectedIndex = 3;
            UpdateNavButtonsLook(NavWebBtn);
        }

        private void OpenWebPortalBrowser_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://localhost:3000/admin/dashboard",
                    UseShellExecute = true
                });
                AppendLog("[WEBPORTAL] Launched admin web console in browser (http://localhost:3000).");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Could not launch browser: {ex.Message}");
            }
        }


        private void UpdateNavButtonsLook(Button activeBtn)
        {
            Button[] buttons = new[] { NavOpsBtn, NavFirewallBtn, NavBackupBtn, NavWebBtn };
            foreach (var btn in buttons)
            {
                if (btn == activeBtn)
                {
                    btn.Foreground = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#F43F5E");
                    btn.Background = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#1E293B");
                }
                else
                {
                    btn.Foreground = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#94A3B8");
                    btn.Background = System.Windows.Media.Brushes.Transparent;
                }
            }
        }

        // --- SERVER LIFECYCLE MANAGEMENT ---
        // --- SERVER LIFECYCLE MANAGEMENT ---
        private void StartServerBtn_Click(object sender, RoutedEventArgs e)
        {
            _isServerShutdownManually = false;
            _autoStartAttempts = 0;
            if (AutoHealCheckBox != null)
            {
                AutoHealCheckBox.IsChecked = true;
            }
            StartServerInternal();
        }

        private void StartServerInternal()
        {
            if (_isServerRunning)
            {
                AppendLog("[WARN] Server is already running.");
                return;
            }

            AppendLog("[INFO] Starting ALAMS Central Server service...");
            try
            {
                string serverDir = FindServerDirectory();
                AppendLog($"[INFO] Server directory resolved to: {serverDir}");

                if (!Directory.Exists(serverDir))
                {
                    AppendLog($"[ERROR] Server directory not found: {serverDir}");
                    AppendLog("[HINT] Create 'alams.config' next to this EXE with the line: ServerPath=D:\\path\\to\\ALAMS\\server");
                    return;
                }

                // Auto-build dist if missing
                if (!File.Exists(Path.Combine(serverDir, "dist", "index.js")))
                {
                    AppendLog("[WARN] dist/index.js not found. Running npm run build first...");
                    var buildProc = new Process();
                    buildProc.StartInfo.FileName = "cmd.exe";
                    buildProc.StartInfo.Arguments = "/c npm run build";
                    buildProc.StartInfo.WorkingDirectory = serverDir;
                    buildProc.StartInfo.UseShellExecute = false;
                    buildProc.StartInfo.CreateNoWindow = true;
                    buildProc.StartInfo.RedirectStandardOutput = true;
                    buildProc.StartInfo.RedirectStandardError = true;
                    buildProc.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[BUILD] {ev.Data}"); };
                    buildProc.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[BUILD-ERR] {ev.Data}"); };
                    buildProc.Start();
                    buildProc.BeginOutputReadLine();
                    buildProc.BeginErrorReadLine();
                    buildProc.WaitForExit();

                    if (!File.Exists(Path.Combine(serverDir, "dist", "index.js")))
                    {
                        AppendLog("[ERROR] Build failed. Cannot start server.");
                        return;
                    }
                    AppendLog("[INFO] Build succeeded.");
                }

                // Prefer start_server.bat; fall back to node.exe directly
                string scriptPath = Path.GetFullPath(Path.Combine(serverDir, "..", "scripts", "start_server.bat"));
                bool useScript = File.Exists(scriptPath);

                _serverProcess = new Process();
                _serverProcess.StartInfo.WorkingDirectory = serverDir;
                _serverProcess.StartInfo.UseShellExecute = true;
                _serverProcess.StartInfo.CreateNoWindow = false;

                if (useScript)
                {
                    AppendLog($"[INFO] Launching visible script console: {scriptPath}");
                    _serverProcess.StartInfo.FileName = "cmd.exe";
                    _serverProcess.StartInfo.Arguments = $"/k \"\"{scriptPath}\"\"";
                }
                else
                {
                    AppendLog("[INFO] Launching visible Node console: node dist/index.js");
                    _serverProcess.StartInfo.FileName = "cmd.exe";
                    _serverProcess.StartInfo.Arguments = "/k node dist/index.js";
                }

                _serverProcess.Start();
                AppendLog("[SUCCESS] Server console window opened and process started.");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Failed to start server: {ex.Message}");
            }
        }

        private void StopServerBtn_Click(object sender, RoutedEventArgs e)
        {
            _isServerShutdownManually = true;
            if (AutoHealCheckBox != null)
            {
                AutoHealCheckBox.IsChecked = false;
            }
            AppendLog("[INFO] Shutting down ALAMS Central Server process trees manually...");
            KillNodeProcesses();
            AppendLog("[SUCCESS] Server process terminated.");
        }

        private void RestartServerBtn_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Restarting server...");
            _isServerShutdownManually = false;
            _autoStartAttempts = 0;
            if (AutoHealCheckBox != null)
            {
                AutoHealCheckBox.IsChecked = true;
            }
            KillNodeProcesses();
            Task.Delay(2000).ContinueWith(_ => Dispatcher.Invoke(() => StartServerInternal()));
        }

        private string FindServerDirectory()
        {
            // Strategy 1: Read from alams.config placed next to the EXE
            string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "alams.config");
            if (File.Exists(configPath))
            {
                foreach (string line in File.ReadAllLines(configPath))
                {
                    if (line.StartsWith("ServerPath=", StringComparison.OrdinalIgnoreCase))
                    {
                        string customPath = line.Substring("ServerPath=".Length).Trim();
                        if (Directory.Exists(customPath) && File.Exists(Path.Combine(customPath, "package.json")))
                        {
                            AppendLog($"[CONFIG] Server path loaded from alams.config: {customPath}");
                            return customPath;
                        }
                    }
                }
            }

            // Strategy 2: Walk UP from EXE directory
            string current = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            for (int depth = 0; depth < 10; depth++)
            {
                string possibleServer = Path.Combine(current, "server");
                if (Directory.Exists(possibleServer) && File.Exists(Path.Combine(possibleServer, "package.json")))
                    return Path.GetFullPath(possibleServer);

                if (File.Exists(Path.Combine(current, "package.json")) &&
                    string.Equals(Path.GetFileName(current), "server", StringComparison.OrdinalIgnoreCase))
                    return Path.GetFullPath(current);

                string? parent = Directory.GetParent(current)?.FullName;
                if (string.IsNullOrEmpty(parent) || parent == current) break;
                current = parent;
            }

            // Strategy 3: Known install paths
            string[] candidates = new[]
            {
                @"D:\Project Data Aurxon\ALAMS\server",
                @"C:\ALAMS\server",
                @"C:\Program Files\ALAMS\server",
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "server"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "server"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "server"),
            };

            foreach (var path in candidates)
            {
                string full = Path.GetFullPath(path);
                if (Directory.Exists(full) && File.Exists(Path.Combine(full, "package.json")))
                    return full;
            }

            return Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server"));
        }

        private void AutoHeal_Checked(object sender, RoutedEventArgs e)
        {
            _isServerShutdownManually = false;
            _autoStartAttempts = 0;
            AppendLog("[SYSTEM] Auto-Healing and Auto-Startup enabled.");
        }

        private void AutoHeal_Unchecked(object sender, RoutedEventArgs e)
        {
            _isServerShutdownManually = true;
            AppendLog("[SYSTEM] Auto-Healing disabled. Server will remain in manual control mode.");
        }

        private void KillNodeProcesses()
        {
            try
            {
                if (_serverProcess != null && !_serverProcess.HasExited)
                {
                    _serverProcess.Kill(true);
                    _serverProcess.Dispose();
                    _serverProcess = null;
                }

                var startInfo = new ProcessStartInfo
                {
                    FileName = "taskkill",
                    Arguments = "/f /im node.exe",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(startInfo)?.WaitForExit();
            }
            catch (Exception ex)
            {
                AppendLog($"[WARN] Node cleanup encountered warning: {ex.Message}");
            }
        }

        // --- FIREWALL UTILITIES ---
        private void ApplyFirewallRules_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[FIREWALL] Requesting UAC elevation to apply full Server Firewall rules...");
            RunPowerShellAsAdmin(
                "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS PostgreSQL 5432' -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS HTTP 80' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS HTTPS 443' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS ICMP Echo' -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow -Force",
                "Applied dedicated Server firewall rules (5000, 3000, 5432, 80, 443, 35200, ICMP) successfully."
            );
            RefreshFirewallRules_Click(sender, e);
        }

        private void RemoveFirewallRules_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[FIREWALL] Removing all ALAMS firewall rules...");
            RunPowerShellAsAdmin(
                "Get-NetFirewallRule -DisplayName 'ALAMS*' | Remove-NetFirewallRule -ErrorAction SilentlyContinue",
                "Removed all ALAMS firewall rules successfully."
            );
            RefreshFirewallRules_Click(sender, e);
        }

        private void ApplyLanSubnetRule_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[FIREWALL] Applying LAN-Only Subnet Rule (restricts inbound access to LAN)...");
            RunPowerShellAsAdmin(
                "New-NetFirewallRule -DisplayName 'ALAMS Subnet Restrict' -Direction Inbound -RemoteAddress LocalSubnet -Action Allow -Force",
                "Applied LAN Subnet restriction rule successfully."
            );
            RefreshFirewallRules_Click(sender, e);
        }

        private void AddCustomRule_Click(object sender, RoutedEventArgs e)
        {
            string name = RuleNameTxt.Text.Trim();
            string port = RulePortTxt.Text.Trim();
            string proto = (RuleProtoCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "TCP";
            string direction = (RuleDirectionCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Inbound";
            string action = (RuleActionCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Allow";

            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(port))
            {
                MessageBox.Show("Please specify both a Rule Name and Port Number.", "Validation Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            AppendLog($"[FIREWALL] Creating custom {direction} rule: {name} ({proto} Port {port}, {action})...");
            string script = $"New-NetFirewallRule -DisplayName '{name}' -Direction {direction} -Protocol {proto} -LocalPort {port} -Action {action} -Force";
            RunPowerShellAsAdmin(script, $"Custom Firewall Rule '{name}' applied successfully.");
            RefreshFirewallRules_Click(sender, e);
        }

        private void RefreshFirewallRules_Click(object? sender, RoutedEventArgs? e)
        {
            AppendLog("[FIREWALL] Querying active ALAMS firewall rules...");
            try
            {
                var proc = new Process();
                proc.StartInfo.FileName = "powershell.exe";
                proc.StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"Get-NetFirewallRule -DisplayName 'ALAMS*' -ErrorAction SilentlyContinue | Select-Object DisplayName, Direction, Action, Enabled | ConvertTo-Json\"";
                proc.StartInfo.UseShellExecute = false;
                proc.StartInfo.RedirectStandardOutput = true;
                proc.StartInfo.CreateNoWindow = true;

                proc.Start();
                string json = proc.StandardOutput.ReadToEnd();
                proc.WaitForExit();

                FirewallRulesListBox.Items.Clear();

                if (string.IsNullOrWhiteSpace(json) || json.Trim() == "null")
                {
                    FirewallRulesListBox.Items.Add("No active ALAMS Firewall rules found. Click 'Apply Server Firewall Preset' above.");
                    return;
                }

                if (json.Trim().StartsWith("{"))
                {
                    json = "[" + json.Trim() + "]";
                }

                using var doc = JsonDocument.Parse(json);
                foreach (var element in doc.RootElement.EnumerateArray())
                {
                    string name = element.GetProperty("DisplayName").GetString() ?? "Unknown";
                    string dir = element.GetProperty("Direction").GetInt32() == 1 ? "Inbound" : "Outbound";
                    string act = element.GetProperty("Action").GetInt32() == 2 ? "ALLOW" : "BLOCK";
                    bool enabled = element.GetProperty("Enabled").GetInt32() == 1;

                    FirewallRulesListBox.Items.Add($"[{act}] {name} ({dir}) - Enabled: {enabled}");
                }

                AppendLog($"[FIREWALL] Displaying {FirewallRulesListBox.Items.Count} active firewall rules.");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Failed to query firewall rules: {ex.Message}");
            }
        }

        private void RemoveSelectedRule_Click(object sender, RoutedEventArgs e)
        {
            var selected = FirewallRulesListBox.SelectedItem?.ToString();
            if (string.IsNullOrEmpty(selected) || selected.StartsWith("No active") || selected.StartsWith("Click"))
            {
                MessageBox.Show("Please select an active firewall rule from the list to remove.", "Selection Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            // Extract display name from format: "[ALLOW] ALAMS Port 5000 (Inbound) - Enabled: True"
            int startIdx = selected.IndexOf(']') + 2;
            int endIdx = selected.IndexOf('(') - 1;
            if (startIdx > 0 && endIdx > startIdx)
            {
                string ruleName = selected.Substring(startIdx, endIdx - startIdx).Trim();
                AppendLog($"[FIREWALL] Removing selected firewall rule: '{ruleName}'...");
                RunPowerShellAsAdmin($"Remove-NetFirewallRule -DisplayName '{ruleName}' -ErrorAction SilentlyContinue", $"Rule '{ruleName}' removed successfully.");
                RefreshFirewallRules_Click(sender, e);
            }
        }

        private async void RemoteSyncFirewall_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[FIREWALL] Remote-syncing firewall rule configurations to active fleet endpoints...");
            try
            {
                var payload = new
                {
                    action = "ADD",
                    ruleName = "ALAMS Inbound Port",
                    port = "5000",
                    protocol = "TCP",
                    direction = "Inbound",
                    ruleAction = "Allow"
                };
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                
                // Trigger central broadcast remote command
                var response = await _httpClient.PostAsync("http://localhost:5000/api/v1/admin/computers/remote-sync-firewall", content);
                if (response.IsSuccessStatusCode)
                {
                    AppendLog("[SUCCESS] Remote firewall sync commands broadcasted successfully.");
                }
                else
                {
                    AppendLog("[WARN] Remote firewall broadcast returned status: " + response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                AppendLog("[ERROR] Failed to dispatch remote firewall command: " + ex.Message);
            }
        }


        private void RunPowerShellAsAdmin(string script, string successMessage)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{script}\"",
                    Verb = "runas",
                    UseShellExecute = true
                };

                var process = Process.Start(startInfo);
                process?.WaitForExit();
                AppendLog($"[SUCCESS] {successMessage}");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Elevated operation failed: {ex.Message}");
            }
        }

        // --- BACKUP & RECOVERY UTILITIES ---
        private void BackupDb_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[BACKUP] Initiating database dump process...");
            try
            {
                string serverDir = FindServerDirectory();
                string scriptPath = Path.Combine(serverDir, "..\\scripts\\backup_database.bat");

                Process proc = new Process();
                proc.StartInfo.FileName = "cmd.exe";
                proc.StartInfo.Arguments = $"/c \"{scriptPath}\"";
                proc.StartInfo.WorkingDirectory = serverDir;
                proc.StartInfo.UseShellExecute = false;
                proc.StartInfo.RedirectStandardOutput = true;
                proc.StartInfo.RedirectStandardError = true;
                proc.StartInfo.CreateNoWindow = true;

                proc.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[DB-BACKUP] {ev.Data}"); };
                proc.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[DB-BACKUP-ERR] {ev.Data}"); };

                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Backup trigger failed: {ex.Message}");
            }
        }

        private void BackupConfigs_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[BACKUP] Backing up environment and configuration settings...");
            try
            {
                string serverDir = FindServerDirectory();
                string envFile = Path.Combine(serverDir, ".env");
                string backupDir = Path.Combine(serverDir, "..\\backups");
                
                if (!Directory.Exists(backupDir)) Directory.CreateDirectory(backupDir);

                if (File.Exists(envFile))
                {
                    string target = Path.Combine(backupDir, $"config_backup_{DateTime.Now:yyyyMMdd_HHmmss}.env");
                    File.Copy(envFile, target);
                    AppendLog($"[SUCCESS] Configurations backed up to: {Path.GetFileName(target)}");
                }
                else
                {
                    AppendLog("[ERROR] .env file not found. Nothing to backup.");
                }
            }
            catch (Exception ex)
            {
                AppendLog("[ERROR] Configurations backup failed: " + ex.Message);
            }
        }

        private void BrowseBackup_Click(object sender, RoutedEventArgs e)
        {
            string serverDir = FindServerDirectory();
            string backupDir = Path.GetFullPath(Path.Combine(serverDir, "..\\backups"));

            OpenFileDialog ofd = new OpenFileDialog();
            ofd.InitialDirectory = Directory.Exists(backupDir) ? backupDir : serverDir;
            ofd.Filter = "SQL Backup Files (*.sql)|*.sql|All Files (*.*)|*.*";

            if (ofd.ShowDialog() == true)
            {
                BackupFileNameTxt.Text = Path.GetFileName(ofd.FileName);
            }
        }

        private void RestoreDb_Click(object sender, RoutedEventArgs e)
        {
            string backupFile = BackupFileNameTxt.Text.Trim();
            if (string.IsNullOrEmpty(backupFile))
            {
                MessageBox.Show("Please specify a backup SQL file to restore.", "Disaster Recovery", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var confirm = MessageBox.Show(
                $"Warning! You are performing a full database restore from: {backupFile}.\nAll current sessions and records will be overwritten! Proceed?",
                "Database Restore Confirmation",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning
            );

            if (confirm != MessageBoxResult.Yes) return;

            AppendLog($"[RESTORE] Initiating database restore from: {backupFile}...");
            try
            {
                string serverDir = FindServerDirectory();
                string scriptPath = Path.Combine(serverDir, "..\\scripts\\restore_database.bat");

                Process proc = new Process();
                proc.StartInfo.FileName = "cmd.exe";
                proc.StartInfo.Arguments = $"/c \"{scriptPath}\" \"{backupFile}\"";
                proc.StartInfo.WorkingDirectory = serverDir;
                proc.StartInfo.UseShellExecute = false;
                proc.StartInfo.RedirectStandardOutput = true;
                proc.StartInfo.RedirectStandardError = true;
                proc.StartInfo.CreateNoWindow = true;

                proc.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[DB-RESTORE] {ev.Data}"); };
                proc.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[DB-RESTORE-ERR] {ev.Data}"); };

                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Restore failed: {ex.Message}");
            }
        }

        private void FreshDbReset_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to perform a database reset and run Prisma migrations?",
                "Database Migration Reset",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning
            );

            if (result == MessageBoxResult.Yes)
            {
                AppendLog("[INFO] Triggering Prisma schema push...");
                RunNpmScriptInServer("run prisma:generate", "Prisma client compiled successfully.");
                RunNpmScriptInServer("run prisma:seed", "Database reset and default seeds compiled.");
            }
        }

        private void RunNpmScriptInServer(string args, string successMessage)
        {
            try
            {
                string serverDir = FindServerDirectory();
                var proc = new Process();
                proc.StartInfo.FileName = "cmd.exe";
                proc.StartInfo.Arguments = $"/c npm {args}";
                proc.StartInfo.WorkingDirectory = serverDir;
                proc.StartInfo.UseShellExecute = false;
                proc.StartInfo.RedirectStandardOutput = true;
                proc.StartInfo.RedirectStandardError = true;
                proc.StartInfo.CreateNoWindow = true;

                proc.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[NP-LOG] {ev.Data}"); };
                proc.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[NP-ERR] {ev.Data}"); };

                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                proc.WaitForExit();

                AppendLog($"[SUCCESS] {successMessage}");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] NPM script execution failed: {ex.Message}");
            }
        }

        private async void ForceShutdownAllBtn_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Force shutdown all connected endpoints?",
                "Confirm Fleet Shutdown",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning
            );

            if (result != MessageBoxResult.Yes) return;

            AppendLog("[COMMAND] Dispatching force shutdown commands...");
            try
            {
                var content = new StringContent("", Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync("http://localhost:5000/api/v1/admin/computers/remote-shutdown-all", content);
                if (response.IsSuccessStatusCode)
                {
                    AppendLog("[SUCCESS] Shutdown command sent successfully.");
                }
                else
                {
                    AppendLog("[ERROR] Failed to send shutdown: " + response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                AppendLog("[ERROR] Connection error during command: " + ex.Message);
            }
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (!_isClosingAllowed)
            {
                e.Cancel = true;
                MessageBox.Show(
                    "ALAMS Command Center cannot be closed from this window to protect the central database service.\n\nPlease close the server via Task Manager.",
                    "Process Safe Exit Mode",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning
                );
            }
        }
    }
}
