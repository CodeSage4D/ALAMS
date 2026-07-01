using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;

namespace AlamsClient
{
    public partial class SessionWidget : Window
    {
        private readonly string _computerId;
        private readonly string _sessionId;
        private readonly string _enrollmentNumber;
        private readonly MainWindow _mainWindow;
        private readonly DispatcherTimer _durationTimer;
        private readonly DateTime _loginTime;
        private readonly HttpClient _httpClient = new HttpClient();

        private string ServerHttpUrl => _mainWindow.ServerHttpUrl;

        public SessionWidget(string computerId, string sessionId, string enrollmentNumber, MainWindow mainWindow)
        {
            InitializeComponent();
            
            _computerId = computerId;
            _sessionId = sessionId;
            _enrollmentNumber = enrollmentNumber;
            _mainWindow = mainWindow;
            
            _loginTime = DateTime.Now;
            EnrollmentText.Text = $"Student: {_enrollmentNumber}";

            _durationTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(1) };
            _durationTimer.Tick += DurationTimer_Tick;
            _durationTimer.Start();
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
            {
                this.DragMove(); // Allow dragging the floating widget anywhere
            }
        }

        private void DurationTimer_Tick(object? sender, EventArgs e)
        {
            int elapsedMinutes = (int)(DateTime.Now - _loginTime).TotalMinutes;
            ElapsedText.Text = $"Logged in: {elapsedMinutes} min{(elapsedMinutes == 1 ? "" : "s")}";
        }

        private async void LogoutButton_Click(object sender, RoutedEventArgs e)
        {
            LogoutButton.IsEnabled = false;
            LogoutButton.Content = "Syncing...";

            try
            {
                var payload = new
                {
                    computerId = _computerId,
                    sessionId = _sessionId
                };

                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                // Notify server about logout
                await _httpClient.PostAsync($"{ServerHttpUrl}/api/v1/client/logout", content);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Logout API call failed: {ex.Message}");
            }
            finally
            {
                // Lock PC and close widget
                _durationTimer.Stop();
                _mainWindow.LockWorkstation();
                this.Close();
            }
        }
    }
}
