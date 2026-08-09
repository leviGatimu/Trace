using Trace.Tracker.Tray;

namespace Trace.Tracker.Tests;

/// <summary>
/// Where the tray looks for the dashboard.
///
/// This shipped broken: a tracker running from anywhere other than an install
/// directory found nothing, and "Open Trace" reported that the window "could
/// not be found" while the installed one sat there unopened.
/// </summary>
public class TrayIconTests
{
    private const string Installed = @"C:\Users\test\AppData\Local\Programs\Trace\Trace.exe";

    [Fact]
    public void Finds_the_dashboard_two_levels_up_when_installed_normally()
    {
        // <install>\resources\tracker\TraceTracker.exe -> <install>\Trace.exe
        var tracker = @"C:\Users\test\AppData\Local\Programs\Trace\resources\tracker";
        var expected = @"C:\Users\test\AppData\Local\Programs\Trace\Trace.exe";

        var resolved = TrayIcon.ResolveDashboardPath(tracker, Installed, path => path == expected);

        Assert.Equal(expected, resolved);
    }

    [Fact]
    public void Finds_the_dashboard_sitting_beside_the_tracker()
    {
        var tracker = @"C:\Portable\Trace";
        var expected = @"C:\Portable\Trace\Trace.exe";

        var resolved = TrayIcon.ResolveDashboardPath(tracker, Installed, path => path == expected);

        Assert.Equal(expected, resolved);
    }

    [Fact]
    public void Falls_back_to_the_installed_dashboard_when_the_tracker_runs_from_elsewhere()
    {
        // The case that was broken: a build tree, where nothing sits beside the
        // tracker and nothing is two levels up either.
        var tracker = @"C:\repo\apps\tracker\Trace.Tracker\bin\Debug\net10.0-windows\win-x64";

        var resolved = TrayIcon.ResolveDashboardPath(tracker, Installed, path => path == Installed);

        Assert.Equal(Installed, resolved);
    }

    [Fact]
    public void Returns_null_when_no_dashboard_exists_anywhere()
    {
        // The tracker must still say something useful rather than silently
        // doing nothing, so the caller needs to be able to tell.
        var resolved = TrayIcon.ResolveDashboardPath(@"C:\somewhere", Installed, _ => false);

        Assert.Null(resolved);
    }

    [Fact]
    public void Still_finds_the_installed_dashboard_with_no_tracker_directory()
    {
        var resolved = TrayIcon.ResolveDashboardPath(null, Installed, path => path == Installed);

        Assert.Equal(Installed, resolved);
    }

    [Fact]
    public void Prefers_the_neighbouring_dashboard_over_the_installed_one()
    {
        // A portable copy should open its own window, not another installation's.
        var tracker = @"C:\Portable\Trace\resources\tracker";
        var neighbour = @"C:\Portable\Trace\Trace.exe";

        var resolved = TrayIcon.ResolveDashboardPath(
            tracker, Installed, path => path == neighbour || path == Installed);

        Assert.Equal(neighbour, resolved);
    }
}
