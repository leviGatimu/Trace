using Microsoft.Win32;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Windows;

/// <summary>
/// Registers the tracker to start when the user signs in.
///
/// HKCU rather than HKLM, and the Run key rather than a service or a scheduled
/// task, for three reasons that all matter to this product:
///
///  * it needs no administrator rights, so installing and enabling startup
///    never shows a UAC prompt (DOCS/Windows Integration §14);
///  * it is per-user, which keeps two Windows accounts independent as §26
///    requires;
///  * it is visible in Task Manager's Startup tab, where the user can see and
///    disable it. A background activity recorder that hides how it starts would
///    contradict the no-stealth rule in DOCS/Privacy.md §12.
///
/// The tracker is registered, never the dashboard: after a reboot Trace should
/// be recording quietly, not opening a window (§7).
/// </summary>
internal static class StartupRegistration
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "Trace";

    public static bool IsRegistered()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            return key?.GetValue(ValueName) is string value && value.Length > 0;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            Log.Warn("Could not read the Windows startup entry.", ex);
            return false;
        }
    }

    /// <summary>
    /// Brings the registry into line with the setting. Returns false if Windows
    /// refused, so the caller can tell the user rather than showing a toggle
    /// that silently did nothing.
    /// </summary>
    public static bool Apply(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
            if (key is null)
            {
                return false;
            }

            if (!enabled)
            {
                key.DeleteValue(ValueName, throwOnMissingValue: false);
                Log.Info("Removed the Windows startup entry.");
                return true;
            }

            var executable = Environment.ProcessPath;
            if (string.IsNullOrEmpty(executable))
            {
                Log.Warn("Could not determine the tracker's own path; startup not registered.");
                return false;
            }

            // Quoted: the install path contains spaces under Program Files, and
            // an unquoted path there is a classic way to launch the wrong thing.
            key.SetValue(ValueName, $"\"{executable}\"", RegistryValueKind.String);
            Log.Info("Registered Trace to start with Windows.");
            return true;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException
                                       or System.Security.SecurityException)
        {
            Log.Warn("Could not update the Windows startup entry.", ex);
            return false;
        }
    }
}
