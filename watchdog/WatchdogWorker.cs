using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;

namespace AlamsWatchdog
{
    public class WatchdogWorker : BackgroundService
    {
        private const string ClientProcessName = "AlamsClient";
        private const string DesktopProcessName = "explorer";
        private const string ConfigPath = @"C:\ProgramData\ALAMS\config.json";
        
        private readonly HttpClient _httpClient = new HttpClient();
        private string _serverUrl = "http://localhost:5000";
        private string _computerId = "";
        
        private int _heartbeatCounter = 0;

        public WatchdogWorker()
        {
            LoadConfiguration();
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
                // Fall back to default localhost server port
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            Console.WriteLine("[ALAMS WATCHDOG] Running background service monitoring...");

            while (!stoppingToken.IsCancellationRequested)
            {
                // Reload configuration periodically to sync computerId changes
                LoadConfiguration();

                var clientProcesses = Process.GetProcessesByName(ClientProcessName);
                var desktopProcesses = Process.GetProcessesByName(DesktopProcessName);

                bool isClientRunning = clientProcesses.Length > 0;
                bool isDesktopActive = desktopProcesses.Length > 0;

                // HEURISTIC: If explorer (desktop) is running, but the lockscreen is NOT running,
                // it implies the student bypassed, closed, or crashed the ALAMS Client.
                if (isDesktopActive && !isClientRunning)
                {
                    Console.WriteLine("[WARNING] Bypass detected! Explorer running without ALAMS Client. Terminating session...");
                    
                    // 1. Report Security Event to Central Server
                    await ReportBypassViolationAsync();

                    // 2. Force Windows Logoff immediately
                    ForceWindowsLogoff();
                }

                // Heartbeat dispatch scheduler (every 10 seconds / 5 ticks)
                _heartbeatCounter++;
                if (_heartbeatCounter >= 5)
                {
                    _heartbeatCounter = 0;
                    await SendWatchdogHeartbeatAsync();
                }

                // Poll every 2 seconds
                await Task.Delay(2000, stoppingToken);
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
                // Forceful logoff command logs off the current interactive user
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "shutdown.exe",
                    Arguments = "/l /f", // /l = logoff, /f = force running processes to close without warning
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
