using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;
using Trace.Contracts;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Tray;

/// <summary>
/// The tray icon, and the only part of Trace that is always on screen.
///
/// It belongs to the tracker rather than to Electron, which is the decision in
/// implementation plan §10. Two consequences follow, and both are the point:
/// pausing still works when the dashboard has crashed or was never opened, and
/// Trace does not keep 150 MB of browser resident purely to draw a 16-pixel
/// icon.
///
/// The menu is native Win32 chrome rather than the dashboard's design language.
/// That is deliberate — a tray menu that does not look like every other tray
/// menu is a worse tray menu.
/// </summary>
internal sealed class TrayIcon : IDisposable
{
    private readonly NotifyIcon _icon;
    private readonly ToolStripMenuItem _status;
    private readonly ToolStripMenuItem _pauseResume;
    private readonly Icon _tracking;
    private readonly Icon _paused;

    private readonly Action _onPause;
    private readonly Action _onResume;
    private readonly Action _onQuit;

    private bool _isPaused;
    private bool _disposed;

    public TrayIcon(Action onPause, Action onResume, Action onQuit)
    {
        _onPause = onPause;
        _onResume = onResume;
        _onQuit = onQuit;

        _tracking = LoadIcon("trace-tray.ico");
        _paused = LoadIcon("trace-tray-paused.ico");

        _status = new ToolStripMenuItem("Tracking") { Enabled = false };
        _pauseResume = new ToolStripMenuItem("Pause Tracking", null, (_, _) => TogglePause());

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(
        [
            _status,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Open Trace", null, (_, _) => OpenDashboard(null))
            {
                Font = new Font(SystemFonts.MenuFont!, FontStyle.Bold),
            },
            new ToolStripMenuItem("Today's Activity", null, (_, _) => OpenDashboard("/")),
            _pauseResume,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Settings", null, (_, _) => OpenDashboard("/settings")),
            new ToolStripSeparator(),
            new ToolStripMenuItem("Quit Trace", null, (_, _) => _onQuit()),
        ]);

        _icon = new NotifyIcon
        {
            Icon = _tracking,
            Text = "Trace — tracking",
            ContextMenuStrip = menu,
            Visible = true,
        };

        // Double-click is what people try first on a tray icon.
        _icon.DoubleClick += (_, _) => OpenDashboard(null);
    }

    /// <summary>
    /// Reflects the tracker's state in the icon and its tooltip.
    ///
    /// DOCS/Privacy.md §11: the answer to "is this thing recording me?" must
    /// always be available without opening anything.
    /// </summary>
    public void Update(TrackingState state, bool trackingEnabled)
    {
        if (_disposed)
        {
            return;
        }

        _isPaused = !trackingEnabled;

        var description = !trackingEnabled
            ? "paused"
            : state switch
            {
                TrackingState.IDLE => "tracking · idle",
                TrackingState.LOCKED => "tracking · locked",
                TrackingState.SUSPENDED => "tracking · asleep",
                TrackingState.DEGRADED => "not recording · database unavailable",
                _ => "tracking",
            };

        _icon.Icon = trackingEnabled ? _tracking : _paused;
        _icon.Text = $"Trace — {description}";

        _status.Text = trackingEnabled ? Capitalise(description) : "Paused";
        _pauseResume.Text = trackingEnabled ? "Pause Tracking" : "Resume Tracking";
    }

    /// <summary>
    /// Says, once, that closing the window did not stop the recording.
    ///
    /// Windows 11 puts new tray icons in the hidden overflow, so from the
    /// user's side closing the dashboard is indistinguishable from quitting —
    /// the window disappears and there is nothing left to see. A product that
    /// keeps recording after you close it has an obligation to say so.
    /// </summary>
    public void ShowBackgroundNotice()
    {
        if (_disposed)
        {
            return;
        }

        _icon.ShowBalloonTip(
            8000,
            "Trace is still recording",
            "Closing the window does not stop tracking. Trace runs here in the notification area — "
                + "open it, pause it, or quit from this icon.",
            ToolTipIcon.None);
    }

    private void TogglePause()
    {
        if (_isPaused)
        {
            _onResume();
        }
        else
        {
            _onPause();
        }
    }

    /// <summary>
    /// Launches the dashboard, optionally at a particular page.
    ///
    /// If it is already running, Electron's single-instance lock hands the
    /// arguments to the running copy, which focuses itself and navigates — so
    /// "Settings" from the tray goes to Settings whether or not a window is
    /// already open.
    /// </summary>
    private void OpenDashboard(string? route)
    {
        var executable = ResolveDashboardPath();

        if (executable is null)
        {
            Log.Warn("Could not find Trace.exe next to the tracker; cannot open the dashboard.");
            _icon.ShowBalloonTip(
                5000, "Trace", "The Trace window could not be found.", ToolTipIcon.Warning);
            return;
        }

        try
        {
            var arguments = route is null ? string.Empty : $"--route={route}";
            Process.Start(new ProcessStartInfo(executable, arguments) { UseShellExecute = true });
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or IOException)
        {
            Log.Warn("Could not start the Trace dashboard.", ex);
        }
    }

    /// <summary>
    /// Finds Trace.exe.
    ///
    /// Installed, the tracker sits at <c>&lt;install&gt;\resources\tracker\</c>
    /// and the dashboard at <c>&lt;install&gt;\Trace.exe</c>. The other paths
    /// cover running from a build tree during development.
    /// </summary>
    private static string? ResolveDashboardPath()
    {
        var directory = Path.GetDirectoryName(Environment.ProcessPath);
        if (directory is null)
        {
            return null;
        }

        string[] candidates =
        [
            Path.Combine(directory, "..", "..", "Trace.exe"),
            Path.Combine(directory, "Trace.exe"),
        ];

        return candidates.Select(Path.GetFullPath).FirstOrDefault(File.Exists);
    }

    /// <summary>
    /// Loads a tray icon at the size Windows will actually draw it.
    ///
    /// <c>new Icon(stream)</c> takes whichever frame the file happens to list
    /// first, which for a multi-resolution .ico is usually 256×256 — Windows
    /// then squashes it into the notification area and the result is a soft,
    /// slightly wrong-looking blob. Asking for the small-icon metric picks the
    /// frame drawn for that size, which is the whole reason the file carries
    /// several.
    /// </summary>
    private static Icon LoadIcon(string name)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream($"Trace.Tracker.{name}")
                           ?? throw new InvalidOperationException(
                               $"The icon '{name}' is missing from the build.");

        return new Icon(stream, SystemInformation.SmallIconSize);
    }

    private static string Capitalise(string value) =>
        value.Length == 0 ? value : char.ToUpperInvariant(value[0]) + value[1..];

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        // Hidden before disposal, or Windows leaves a ghost icon in the tray
        // until the user hovers over it.
        _icon.Visible = false;
        _icon.Dispose();
        _tracking.Dispose();
        _paused.Dispose();
    }
}
