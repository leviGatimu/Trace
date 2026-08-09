using System.Runtime.InteropServices;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Windows;

/// <summary>
/// Turns Windows foreground and title-change events into signals.
///
/// This is event-driven rather than polled, per DOCS/project-architecture.md §6:
/// Windows tells us when the foreground changes instead of us asking hundreds of
/// times a minute.
///
/// Two hooks are installed:
///
///  * <b>EVENT_SYSTEM_FOREGROUND</b> — a different window came to the front.
///
///  * <b>EVENT_OBJECT_NAMECHANGE</b>, scoped to the current foreground process —
///    the title changed without the window changing. This is what catches a
///    browser tab switch or an editor moving between files, which is most of
///    what makes window sessions useful (DOCS/MVP.md §4). It is deliberately
///    scoped to one process: a machine-wide name-change hook fires constantly
///    for windows nobody is looking at.
///
/// Must be constructed on the thread that owns the message pump, and both hooks
/// are WINEVENT_OUTOFCONTEXT so the callback runs on that thread rather than
/// inside other processes — no DLL is ever injected anywhere.
/// </summary>
internal sealed class ForegroundWatcher : IDisposable
{
    private readonly IClock _clock;
    private readonly Action<Signal> _emit;

    // Delegates must stay rooted for as long as the hooks are installed. If
    // these are locals, the GC collects them and the first callback tears the
    // process down inside unmanaged code — a classic and very confusing crash.
    private readonly NativeMethods.WinEventProc _foregroundProc;
    private readonly NativeMethods.WinEventProc _nameChangeProc;
    private readonly IntPtr _foregroundProcPtr;
    private readonly IntPtr _nameChangeProcPtr;

    private IntPtr _foregroundHook;
    private IntPtr _nameChangeHook;
    private IntPtr _trackedWindow;
    private uint _trackedProcessId;
    private bool _disposed;

    public ForegroundWatcher(IClock clock, Action<Signal> emit)
    {
        _clock = clock;
        _emit = emit;

        _foregroundProc = OnForegroundEvent;
        _nameChangeProc = OnNameChangeEvent;
        _foregroundProcPtr = Marshal.GetFunctionPointerForDelegate(_foregroundProc);
        _nameChangeProcPtr = Marshal.GetFunctionPointerForDelegate(_nameChangeProc);
    }

    /// <summary>The window currently believed to be in the foreground.</summary>
    public IntPtr CurrentWindow => _trackedWindow;

    public void Start()
    {
        _foregroundHook = NativeMethods.SetWinEventHook(
            NativeMethods.EVENT_SYSTEM_FOREGROUND,
            NativeMethods.EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero,
            _foregroundProcPtr,
            idProcess: 0,
            idThread: 0,
            NativeMethods.WINEVENT_OUTOFCONTEXT | NativeMethods.WINEVENT_SKIPOWNPROCESS);

        if (_foregroundHook == IntPtr.Zero)
        {
            throw new InvalidOperationException(
                "SetWinEventHook failed for EVENT_SYSTEM_FOREGROUND; Trace cannot detect application switches.");
        }

        // Seed from the current state so a tracker started mid-session knows
        // what is already in front instead of waiting for the next switch.
        AdoptForegroundWindow(NativeMethods.GetForegroundWindow(), emitSignal: true);
    }

    private void OnForegroundEvent(
        IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild,
        uint eventThread, uint eventTimeMs)
    {
        if (idObject != NativeMethods.OBJID_WINDOW || idChild != NativeMethods.CHILDID_SELF)
        {
            return;
        }

        AdoptForegroundWindow(hwnd, emitSignal: true);
    }

    private void OnNameChangeEvent(
        IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild,
        uint eventThread, uint eventTimeMs)
    {
        // Only the foreground window's own title matters. Menus, tooltips and
        // child controls also raise NAMECHANGE and must be ignored.
        if (idObject != NativeMethods.OBJID_WINDOW
            || idChild != NativeMethods.CHILDID_SELF
            || hwnd != _trackedWindow)
        {
            return;
        }

        _emit(new WindowTitleChanged(_clock.UtcNowMs, hwnd));
    }

    /// <summary>
    /// Re-points the title hook at whatever is now in front, and optionally
    /// reports the change. Callable from outside to re-seed after unlock or
    /// resume, when Windows sends no foreground event but the front window may
    /// well have changed (DOCS/Tracking.md §I, §J).
    /// </summary>
    public void AdoptForegroundWindow(IntPtr hwnd, bool emitSignal)
    {
        if (hwnd == IntPtr.Zero || !NativeMethods.IsWindow(hwnd))
        {
            return;
        }

        var stamp = _clock.UtcNowMs;
        _trackedWindow = hwnd;

        if (NativeMethods.GetWindowThreadProcessId(hwnd, out var processId) != 0 && processId != 0)
        {
            RescopeNameChangeHook(processId);
        }

        if (emitSignal)
        {
            _emit(new ForegroundChanged(stamp, hwnd));
        }
    }

    /// <summary>
    /// Re-installs the title hook against a new process. Cheap, and it keeps the
    /// hook from firing for every window on the machine.
    /// </summary>
    private void RescopeNameChangeHook(uint processId)
    {
        if (processId == _trackedProcessId && _nameChangeHook != IntPtr.Zero)
        {
            return;
        }

        if (_nameChangeHook != IntPtr.Zero)
        {
            NativeMethods.UnhookWinEvent(_nameChangeHook);
            _nameChangeHook = IntPtr.Zero;
        }

        _nameChangeHook = NativeMethods.SetWinEventHook(
            NativeMethods.EVENT_OBJECT_NAMECHANGE,
            NativeMethods.EVENT_OBJECT_NAMECHANGE,
            IntPtr.Zero,
            _nameChangeProcPtr,
            processId,
            idThread: 0,
            NativeMethods.WINEVENT_OUTOFCONTEXT);

        if (_nameChangeHook == IntPtr.Zero)
        {
            // Non-fatal: application sessions stay accurate, only in-place title
            // changes are missed. Worth knowing about, not worth stopping for.
            Log.Warn($"Could not hook title changes for pid {processId}; window detail may be coarser.");
        }

        _trackedProcessId = processId;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_nameChangeHook != IntPtr.Zero)
        {
            NativeMethods.UnhookWinEvent(_nameChangeHook);
            _nameChangeHook = IntPtr.Zero;
        }

        if (_foregroundHook != IntPtr.Zero)
        {
            NativeMethods.UnhookWinEvent(_foregroundHook);
            _foregroundHook = IntPtr.Zero;
        }

        GC.KeepAlive(_foregroundProc);
        GC.KeepAlive(_nameChangeProc);
    }
}
