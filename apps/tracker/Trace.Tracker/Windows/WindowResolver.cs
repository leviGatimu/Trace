using Trace.Tracker.Engine;

namespace Trace.Tracker.Windows;

/// <summary>
/// Production implementation of <see cref="IWindowResolver"/> — the thin seam
/// between the session engine and Windows.
///
/// It exists so the engine can be tested against a scripted screen rather than
/// a real desktop. Everything it does lives in <see cref="ProcessIdentity"/> and
/// <see cref="NativeMethods"/>; this class adds no logic of its own, which is
/// the point: there is nothing here that could behave differently in a test.
/// </summary>
internal sealed class WindowResolver : IWindowResolver
{
    public static readonly WindowResolver Instance = new();

    private WindowResolver()
    {
    }

    public TrackedApplication? Resolve(IntPtr hwnd) => ProcessIdentity.Resolve(hwnd);

    public string? GetTitle(IntPtr hwnd) => ProcessIdentity.GetWindowTitle(hwnd);

    public IntPtr GetForegroundWindow() => NativeMethods.GetForegroundWindow();
}
