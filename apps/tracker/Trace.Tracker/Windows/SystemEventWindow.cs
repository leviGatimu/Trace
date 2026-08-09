using System.Windows.Forms;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Windows;

/// <summary>
/// A hidden, message-only window. It renders nothing and is never shown; it
/// exists because several of the notifications Trace depends on are delivered
/// only as window messages:
///
///   WM_WTSSESSION_CHANGE  lock / unlock          (DOCS/Tracking.md §I)
///   WM_POWERBROADCAST     suspend / resume       (DOCS/Tracking.md §J)
///   WM_QUERYENDSESSION    shutdown / logoff      (DOCS/Windows Integration §24)
///
/// Getting the clean shutdown message matters more than it looks: it is the
/// difference between recording a session that ended tidily at SYSTEM_SHUTDOWN
/// and one that has to be recovered as CRASH_RECOVERY on next boot, losing up to
/// a heartbeat interval of real usage.
/// </summary>
internal sealed class SystemEventWindow : NativeWindow, IDisposable
{
    private const string ShutdownBlockReason = "Trace is saving your activity history.";

    private readonly IClock _clock;
    private readonly Action<Signal> _emit;
    private readonly Func<Task> _flushAsync;
    private bool _registeredForSessionNotifications;
    private bool _disposed;

    /// <param name="flushAsync">
    /// Closes the open session and checkpoints the database. Invoked
    /// synchronously from the shutdown message handler, because once
    /// WM_ENDSESSION returns Windows may terminate the process at any moment.
    /// </param>
    public SystemEventWindow(IClock clock, Action<Signal> emit, Func<Task> flushAsync)
    {
        _clock = clock;
        _emit = emit;
        _flushAsync = flushAsync;

        CreateHandle(new CreateParams
        {
            Caption = "TraceTrackerSystemEvents",
            // HWND_MESSAGE: a message-only window. It never appears in the
            // taskbar, Alt-Tab, or on any monitor, and cannot be focused — so
            // Trace can never appear in its own foreground history.
            Parent = new IntPtr(-3),
        });

        _registeredForSessionNotifications = NativeMethods.WTSRegisterSessionNotification(
            Handle, NativeMethods.NOTIFY_FOR_THIS_SESSION);

        if (!_registeredForSessionNotifications)
        {
            Log.Warn("WTSRegisterSessionNotification failed; lock/unlock will not be detected.");
        }
    }

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            case NativeMethods.WM_WTSSESSION_CHANGE:
                HandleSessionChange(m.WParam.ToInt32());
                break;

            case NativeMethods.WM_POWERBROADCAST:
                HandlePowerBroadcast(m.WParam.ToInt32());
                break;

            case NativeMethods.WM_QUERYENDSESSION:
                // Never veto a shutdown. Ask for a brief window to finish
                // writing, then allow it.
                NativeMethods.ShutdownBlockReasonCreate(Handle, ShutdownBlockReason);
                HandleShutdown();
                NativeMethods.ShutdownBlockReasonDestroy(Handle);
                m.Result = new IntPtr(1);
                return;

            case NativeMethods.WM_ENDSESSION:
                // Belt and braces: some shutdown paths skip QUERYENDSESSION.
                // HandleShutdown is idempotent.
                if (m.WParam != IntPtr.Zero)
                {
                    HandleShutdown();
                }

                break;
        }

        base.WndProc(ref m);
    }

    private void HandleSessionChange(int reason)
    {
        switch (reason)
        {
            case NativeMethods.WTS_SESSION_LOCK:
                Log.Info("Windows session locked.");
                _emit(new SessionLocked(_clock.UtcNowMs));
                break;

            case NativeMethods.WTS_SESSION_UNLOCK:
                Log.Info("Windows session unlocked.");
                _emit(new SessionUnlocked(_clock.UtcNowMs));
                break;

            case NativeMethods.WTS_SESSION_LOGOFF:
                Log.Info("Windows session logging off.");
                _emit(new SystemShuttingDown(_clock.UtcNowMs));
                break;
        }
    }

    private void HandlePowerBroadcast(int eventCode)
    {
        switch (eventCode)
        {
            case NativeMethods.PBT_APMSUSPEND:
                // Delivered before the machine actually sleeps, which is what
                // makes a clean close possible rather than a nine-hour session.
                Log.Info("System suspending.");
                _emit(new SystemSuspending(_clock.UtcNowMs));
                break;

            case NativeMethods.PBT_APMRESUMESUSPEND:
            case NativeMethods.PBT_APMRESUMEAUTOMATIC:
                Log.Info("System resumed.");
                _emit(new SystemResumed(_clock.UtcNowMs));
                break;
        }
    }

    private void HandleShutdown()
    {
        Log.Info("Windows is ending the session; closing tracking state.");
        _emit(new SystemShuttingDown(_clock.UtcNowMs));

        try
        {
            // Blocking is correct here. Returning before the write completes
            // risks the process being killed mid-transaction.
            _flushAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            Log.Error("Failed to flush state during shutdown.", ex);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_registeredForSessionNotifications && Handle != IntPtr.Zero)
        {
            NativeMethods.WTSUnRegisterSessionNotification(Handle);
            _registeredForSessionNotifications = false;
        }

        if (Handle != IntPtr.Zero)
        {
            DestroyHandle();
        }
    }
}
