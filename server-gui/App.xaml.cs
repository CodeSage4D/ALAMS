using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace AlamsServerConsole
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, args) =>
            {
                LogCrash("AppDomain", args.ExceptionObject as Exception);
            };

            DispatcherUnhandledException += (s, args) =>
            {
                LogCrash("Dispatcher", args.Exception);
                args.Handled = true;
            };

            base.OnStartup(e);
        }

        private static void LogCrash(string source, Exception? ex)
        {
            try
            {
                string log = $"[{DateTime.Now}] Crash from {source}: {ex?.Message}\n{ex?.ToString()}\n\n";
                File.AppendAllText("server_gui_crash.log", log);
            }
            catch { }

            MessageBox.Show(
                $"ALAMS Server Console encountered a startup error:\n\n{ex?.Message}\n\nCheck server_gui_crash.log for details.",
                "ALAMS Server Console Startup Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }
    }
}

