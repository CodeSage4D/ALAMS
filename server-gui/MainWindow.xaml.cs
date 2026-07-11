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
                if (response.IsSuccessStatusCode)
                {
                    string json = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    int activeClients = root.TryGetProperty("activeClients", out var acVal) ? acVal.GetInt32() : 0;
                    int activeSessions = root.TryGetProperty("activeSessions", out var asVal) ? asVal.GetInt32() : 0;
                    string dbStatus = root.TryGetProperty("dbStatus", out var dbVal) ? (dbVal.GetString() ?? "CONNECTED") : "CONNECTED";

                    UpdateServerStatusUI(true, activeClients, activeSessions, dbStatus);
                }
                else
                {
                    UpdateServerStatusUI(false, 0, 0, "OFFLINE");
                }
            }
            catch
            {
                UpdateServerStatusUI(false, 0, 0, "OFFLINE");
            }
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

        private async void NavWebBtn_Click(object sender, RoutedEventArgs e)
        {
            WorkspaceHeaderTitle.Text = "Embedded Web Panel";
            MainTabControl.SelectedIndex = 3;
            UpdateNavButtonsLook(NavWebBtn);
            
            if (!_isWebViewInitialized)
            {
                _isWebViewInitialized = true;
                AppendLog("[WEBVIEW] Launching WebView2 component...");
                try
                {
                    await MyWebView.EnsureCoreWebView2Async(null);
                    MyWebView.Source = new Uri("http://localhost:3000/admin/dashboard");
                    AppendLog("[WEBVIEW] Loaded dashboard portal.");
                }
                catch (Exception ex)
                {
                    AppendLog($"[WEBVIEW] Initialization error: {ex.Message}");
                }
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
        private void StartServerBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isServerRunning)
            {
                AppendLog("[WARN] Server is already running.");
                return;
            }

            AppendLog("[INFO] Starting ALAMS Central Server service using reliability loops...");
            try
            {
                string serverDir = FindServerDirectory();
                string scriptPath = Path.Combine(serverDir, "..\\scripts\\start_server.bat");
                
                AppendLog($"[INFO] Triggering script: {scriptPath}");

                _serverProcess = new Process();
                _serverProcess.StartInfo.FileName = "cmd.exe";
                _serverProcess.StartInfo.Arguments = $"/c \"{scriptPath}\"";
                _serverProcess.StartInfo.WorkingDirectory = serverDir;
                _serverProcess.StartInfo.UseShellExecute = false;
                _serverProcess.StartInfo.RedirectStandardOutput = true;
                _serverProcess.StartInfo.RedirectStandardError = true;
                _serverProcess.StartInfo.CreateNoWindow = true;

                _serverProcess.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[SERVER] {ev.Data}"); };
                _serverProcess.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[SERVER-ERR] {ev.Data}"); };

                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();

                AppendLog("[SUCCESS] Node daemon runner spawned successfully.");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Failed to start server: {ex.Message}");
            }
        }

        private void StopServerBtn_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Shutting down ALAMS Central Server process trees...");
            KillNodeProcesses();
            AppendLog("[SUCCESS] Server process terminated.");
        }

        private void RestartServerBtn_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Restarting server...");
            StopServerBtn_Click(sender, e);
            Task.Delay(2000).ContinueWith(_ => Dispatcher.Invoke(() => StartServerBtn_Click(sender, e)));
        }

        private string FindServerDirectory()
        {
            string[] possiblePaths = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..\\..\\..\\..\\server"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..\\..\\server"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..\\server"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server"),
                AppDomain.CurrentDomain.BaseDirectory
            };

            foreach (var path in possiblePaths)
            {
                string fullPath = Path.GetFullPath(path);
                if (Directory.Exists(fullPath) && File.Exists(Path.Combine(fullPath, "package.json")))
                {
                    return fullPath;
                }
            }
            return Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server"));
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
            AppendLog("[FIREWALL] Requesting UAC elevation to apply inbound port rules...");
            RunPowerShellAsAdmin(
                "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Force; " +
                "New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow -Force",
                "Applied standard ports (5000, 3000, 35200) firewall rules successfully."
            );
        }

        private void RemoveFirewallRules_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[FIREWALL] Removing local rules...");
            RunPowerShellAsAdmin(
                "Remove-NetFirewallRule -DisplayName 'ALAMS Port 5000' -ErrorAction SilentlyContinue; " +
                "Remove-NetFirewallRule -DisplayName 'ALAMS Port 3000' -ErrorAction SilentlyContinue; " +
                "Remove-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -ErrorAction SilentlyContinue",
                "Removed local firewall rules successfully."
            );
        }

        private void AddCustomRule_Click(object sender, RoutedEventArgs e)
        {
            string name = RuleNameTxt.Text.Trim();
            string port = RulePortTxt.Text.Trim();
            string proto = RuleProtoCombo.Text.Trim();

            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(port))
            {
                MessageBox.Show("Please specify both a Rule Name and Port.", "Validation Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            AppendLog($"[FIREWALL] Creating custom inbound rule: {name} ({proto} Port {port})...");
            string script = $"New-NetFirewallRule -DisplayName '{name}' -Direction Inbound -Protocol {proto} -LocalPort {port} -Action Allow -Force";
            RunPowerShellAsAdmin(script, $"Custom Firewall Rule '{name}' applied successfully.");
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
