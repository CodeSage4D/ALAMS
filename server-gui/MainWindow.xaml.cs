using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
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
        private bool _isClosingAllowed = false; // Used if we want to bypass it programmatically, but block user close by default

        public MainWindow()
        {
            InitializeComponent();

            // Set up monitoring timer (every 3 seconds)
            _monitorTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            _monitorTimer.Tick += MonitorTimer_Tick;
            _monitorTimer.Start();

            AppendLog("[SYSTEM] Console Initialized. Ready to manage ALAMS Server.");
        }

        private void AppendLog(string text)
        {
            Dispatcher.Invoke(() =>
            {
                LogTextBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {text}\n");
                LogScrollViewer.ScrollToEnd();
            });
        }

        private async void MonitorTimer_Tick(object? sender, EventArgs e)
        {
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

                if (online)
                {
                    var greenBrush = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#22C55E");
                    ServerStatusIndicator.Fill = greenBrush;
                    ServerStatusIndicatorGlow.Color = System.Windows.Media.Colors.Green;
                    ServerStatusText.Text = "SERVER ONLINE (PORT 5000)";
                    ServerStatusText.Foreground = greenBrush;

                    StartServerBtn.IsEnabled = false;
                    StopServerBtn.IsEnabled = true;
                    RestartServerBtn.IsEnabled = true;
                }
                else
                {
                    var redBrush = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#EF4444");
                    ServerStatusIndicator.Fill = redBrush;
                    ServerStatusIndicatorGlow.Color = System.Windows.Media.Colors.Red;
                    ServerStatusText.Text = "SERVER OFFLINE";
                    ServerStatusText.Foreground = redBrush;

                    StartServerBtn.IsEnabled = true;
                    StopServerBtn.IsEnabled = false;
                    RestartServerBtn.IsEnabled = false;
                }

                ActiveClientsCountText.Text = activeClients.ToString();
                TotalSessionsCountText.Text = activeSessions.ToString();
                DbStatusText.Text = dbStatus;

                if (dbStatus == "CONNECTED")
                {
                    DbStatusText.Foreground = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#22C55E");
                }
                else
                {
                    DbStatusText.Foreground = (System.Windows.Media.SolidColorBrush)new System.Windows.Media.BrushConverter().ConvertFromString("#EF4444");
                }
            });
        }

        private string FindServerDirectory()
        {
            string[] possiblePaths = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..\\..\\..\\..\\server"), // Dev debug mode
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..\\..\\server"),         // Sibling inside publish folder
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..\\server"),             // Direct sibling
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server"),                 // Child directory
                AppDomain.CurrentDomain.BaseDirectory                                          // Current directory fallback
            };

            foreach (var path in possiblePaths)
            {
                string fullPath = Path.GetFullPath(path);
                if (Directory.Exists(fullPath) && File.Exists(Path.Combine(fullPath, "package.json")))
                {
                    return fullPath;
                }
            }

            // Ultimate fallback
            return Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server"));
        }

        private void StartServerBtn_Click(object sender, RoutedEventArgs e)
        {
            if (_isServerRunning)
            {
                AppendLog("[WARN] Server is already running.");
                return;
            }

            AppendLog("[INFO] Launching Node.js Express server process...");

            try
            {
                string serverDir = FindServerDirectory();

                AppendLog($"[INFO] Target server working directory: {serverDir}");

                _serverProcess = new Process();
                _serverProcess.StartInfo.FileName = "cmd.exe";
                _serverProcess.StartInfo.Arguments = "/c npm start";
                _serverProcess.StartInfo.WorkingDirectory = serverDir;
                _serverProcess.StartInfo.UseShellExecute = false;
                _serverProcess.StartInfo.RedirectStandardOutput = true;
                _serverProcess.StartInfo.RedirectStandardError = true;
                _serverProcess.StartInfo.CreateNoWindow = true;

                _serverProcess.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[STDOUT] {ev.Data}"); };
                _serverProcess.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[STDERR] {ev.Data}"); };

                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();

                AppendLog("[SUCCESS] Server process spawned. Waiting for health check to confirm status...");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Failed to start server: {ex.Message}");
            }
        }

        private void StopServerBtn_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Stopping ALAMS Central Server service...");
            KillNodeProcesses();
            AppendLog("[SUCCESS] Server process terminated.");
        }

        private void RestartServerBtn_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Restarting ALAMS Central Server...");
            StopServerBtn_Click(sender, e);
            Task.Delay(2000).ContinueWith(_ => Dispatcher.Invoke(() => StartServerBtn_Click(sender, e)));
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

                // Force kill any orphaned node instances running from the directory
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
                AppendLog($"[WARN] Error cleaning up node processes: {ex.Message}");
            }
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (!_isClosingAllowed)
            {
                e.Cancel = true;
                MessageBox.Show(
                    "ALAMS Server Service cannot be manually closed from this window to prevent accidental university lab lockouts.\n\nTo close the server, please use Windows Task Manager to terminate the AlamsServerConsole.exe process.", 
                    "Action Blocked", 
                    MessageBoxButton.OK, 
                    MessageBoxImage.Warning);
            }
        }

        private void ApplyFirewallRules_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Requesting Administrator privileges to apply firewall rules...");
            RunPowerShellAsAdmin(
                "New-NetFirewallRule -DisplayName 'ALAMS Port 5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow; " +
                "New-NetFirewallRule -DisplayName 'ALAMS Port 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow; " +
                "New-NetFirewallRule -DisplayName 'ALAMS UDP Beacon' -Direction Inbound -Protocol UDP -LocalPort 35200 -Action Allow",
                "Firewall Rules Applied Successfully"
            );
        }

        private void RemoveFirewallRules_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Requesting Administrator privileges to remove firewall rules...");
            RunPowerShellAsAdmin(
                "Remove-NetFirewallRule -DisplayName 'ALAMS Port 5000'; " +
                "Remove-NetFirewallRule -DisplayName 'ALAMS Port 3000'; " +
                "Remove-NetFirewallRule -DisplayName 'ALAMS UDP Beacon'",
                "Firewall Rules Removed Successfully"
            );
        }

        private void RunPowerShellAsAdmin(string script, string successMessage)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{script}\"",
                    Verb = "runas", // Triggers UAC prompt for Admin elevation
                    UseShellExecute = true
                };

                var process = Process.Start(startInfo);
                process?.WaitForExit();
                AppendLog($"[SUCCESS] {successMessage}");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Elevation/Firewall rule adjustment failed: {ex.Message}");
            }
        }

        private void FreshDbReset_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to perform a FRESH DATABASE RESET?\n\nThis will clear all registered devices, attendance logs, and sessions!", 
                "Database Reset Confirmation", 
                MessageBoxButton.YesNo, 
                MessageBoxImage.Warning);

            if (result == MessageBoxResult.Yes)
            {
                AppendLog("[INFO] Commencing database fresh reset...");
                RunNpmScriptInServer("run prisma:generate", "Database schema synced");
                RunNpmScriptInServer("run prisma:seed", "Database reset & pilot accounts seeded");
            }
        }

        private void SeedDatabase_Click(object sender, RoutedEventArgs e)
        {
            AppendLog("[INFO] Running database seed task...");
            RunNpmScriptInServer("run prisma:seed", "Database default records seeded");
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

                proc.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[DB-LOG] {ev.Data}"); };
                proc.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLog($"[DB-ERR] {ev.Data}"); };

                proc.Start();
                proc.BeginOutputReadLine();
                proc.BeginErrorReadLine();
                proc.WaitForExit();

                AppendLog($"[SUCCESS] {successMessage}");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] DB Command failed: {ex.Message}");
            }
        }

        private async void LoadExcelCsv_Click(object sender, RoutedEventArgs e)
        {
            OpenFileDialog openFileDialog = new OpenFileDialog();
            openFileDialog.Filter = "CSV files (*.csv)|*.csv|Text files (*.txt)|*.txt|All files (*.*)|*.*";
            if (openFileDialog.ShowDialog() == true)
            {
                AppendLog($"[INFO] Reading student list from: {openFileDialog.FileName}");
                try
                {
                    string[] lines = File.ReadAllLines(openFileDialog.FileName);
                    int count = 0;
                    int failed = 0;

                    foreach (var line in lines)
                    {
                        if (string.IsNullOrWhiteSpace(line)) continue;
                        // Skip headers if present
                        if (line.Contains("enrollmentNumber", StringComparison.OrdinalIgnoreCase) || line.Contains("Email", StringComparison.OrdinalIgnoreCase)) continue;

                        string[] parts = line.Split(',');
                        if (parts.Length < 3)
                        {
                            AppendLog($"[WARN] Skipping malformed line: {line}");
                            continue;
                        }

                        string enrollment = parts[0].Trim();
                        string name = parts[1].Trim();
                        string email = parts[2].Trim();
                        string pin = parts.Length >= 4 ? parts[3].Trim() : "123456"; // Default PIN
                        string password = parts.Length >= 5 ? parts[4].Trim() : "Student@2026!"; // Default Password

                        // Register via Node.js auth API
                        bool success = await RegisterStudentOnServerAsync(enrollment, name, email, pin, password);
                        if (success)
                        {
                            count++;
                        }
                        else
                        {
                            failed++;
                        }
                    }

                    AppendLog($"[SUCCESS] Loaded {count} student records from CSV. Errors/Existing: {failed}.");
                }
                catch (Exception ex)
                {
                    AppendLog($"[ERROR] Failed to read or parse file: {ex.Message}");
                }
            }
        }

        private async Task<bool> RegisterStudentOnServerAsync(string enrollment, string name, string email, string pin, string password)
        {
            try
            {
                // We use the signup endpoint for registration
                var payload = new
                {
                    enrollmentNumber = enrollment,
                    fullName = name,
                    password = password,
                    pin = pin,
                    role = "STUDENT"
                };

                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync("http://localhost:5000/api/v1/auth/signup", content);

                if (response.IsSuccessStatusCode)
                {
                    AppendLog($"[SUCCESS] Registered: {name} ({enrollment}) - Email: {email}");
                    return true;
                }
                else
                {
                    string errJson = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(errJson);
                    string error = doc.RootElement.TryGetProperty("error", out var val) ? (val.GetString() ?? "Signup failed") : "Signup failed";
                    AppendLog($"[WARN] Failed for {name} ({enrollment}): {error}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Connection error registering {name}: {ex.Message}");
                return false;
            }
        }

        private void OpenWebConsole_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://localhost:3000",
                    UseShellExecute = true
                });
                AppendLog("[INFO] Opened browser to http://localhost:3000");
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Failed to open Web Console: {ex.Message}");
            }
        }

        private async void ForceShutdownAllBtn_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to FORCE SHUT DOWN all connected client PCs?\nThis will broadcast a force shutdown signal to all workstations.",
                "Confirm Remote Power Down Command",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning
            );

            if (result != MessageBoxResult.Yes) return;

            AppendLog("[COMMAND] Initiating force remote shutdown on all workstations...");
            try
            {
                var content = new StringContent("", Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync("http://localhost:5000/api/v1/admin/computers/remote-shutdown-all", content);

                if (response.IsSuccessStatusCode)
                {
                    string jsonRes = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(jsonRes);
                    string msg = doc.RootElement.GetProperty("message").GetString() ?? "Shutdown command dispatched";
                    AppendLog($"[SUCCESS] {msg}");
                    MessageBox.Show(msg, "Remote Command Sent", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    string errRes = await response.Content.ReadAsStringAsync();
                    AppendLog($"[ERROR] Remote shutdown failed with status code {response.StatusCode}: {errRes}");
                    MessageBox.Show("Failed to trigger remote shutdown. Check server daemon status.", "Command Failed", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                AppendLog($"[ERROR] Connection error during remote shutdown request: {ex.Message}");
                MessageBox.Show($"Connection error: {ex.Message}", "Command Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
