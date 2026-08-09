using Trace.Tracker.Engine;

namespace Trace.Tracker.Windows;

/// <summary>
/// Detects whether the user is interacting with the computer.
///
/// Windows offers no event for "the user went idle", so this is the one place
/// Trace polls. It is cheap — GetLastInputInfo is a single call returning a tick
/// count — and it is the minimum possible collection: no key, no button, no
/// coordinate, no content. Just "how long since the last input?"
/// (DOCS/Privacy.md §3.)
///
/// The important behaviour is backdating. When a 2-second poll notices that the
/// 5-minute threshold has been crossed, idle did not begin now — it began when
/// the user last touched the machine. Reporting detection time instead would
/// credit every idle period with a full threshold of active time the user never
/// spent, which is exactly the fabrication DOCS/data and database.md §28 forbids.
/// </summary>
internal sealed class IdleWatcher : IDisposable
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(2);

    private readonly IClock _clock;
    private readonly Action<Signal> _emit;

    // Fully qualified: the project references WindowsForms, so a bare `Timer`
    // is ambiguous with System.Windows.Forms.Timer, which is UI-thread bound.
    private readonly System.Threading.Timer _timer;

    private int _thresholdSeconds;
    private bool _enabled;
    private bool _isIdle;
    private bool _disposed;

    public IdleWatcher(IClock clock, Action<Signal> emit, int thresholdSeconds, bool enabled)
    {
        _clock = clock;
        _emit = emit;
        _thresholdSeconds = thresholdSeconds;
        _enabled = enabled;
        _timer = new System.Threading.Timer(
            _ => Poll(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
    }

    public bool IsIdle => _isIdle;

    public void Start() => _timer.Change(PollInterval, PollInterval);

    /// <summary>
    /// Applies changed settings. Disabling idle detection while idle ends the
    /// idle period rather than leaving the engine stuck in a state nothing will
    /// ever clear.
    /// </summary>
    public void Configure(int thresholdSeconds, bool enabled)
    {
        _thresholdSeconds = thresholdSeconds;

        if (_enabled == enabled)
        {
            return;
        }

        _enabled = enabled;

        if (!enabled && _isIdle)
        {
            _isIdle = false;
            _emit(new IdleEnded(_clock.UtcNowMs));
        }
    }

    /// <summary>
    /// Clears idle state without emitting a signal. Used when lock, suspend or
    /// pause takes over: those states supersede idle, and the engine must not
    /// then receive a stale IdleEnded that reopens time accounting.
    /// </summary>
    public void ResetSilently() => _isIdle = false;

    /// <summary>Seconds since the last keyboard or mouse input, or null if unavailable.</summary>
    public int? SecondsSinceLastInput()
    {
        var info = new NativeMethods.LASTINPUTINFO
        {
            cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<NativeMethods.LASTINPUTINFO>(),
        };

        if (!NativeMethods.GetLastInputInfo(ref info))
        {
            return null;
        }

        // Both values are 32-bit tick counts that wrap every ~49.7 days.
        // Unchecked subtraction in uint space stays correct across the wrap.
        var elapsedMs = unchecked((uint)_clock.TickCountMs - info.dwTime);
        return (int)(elapsedMs / 1000);
    }

    private void Poll()
    {
        if (_disposed || !_enabled)
        {
            return;
        }

        var idleSeconds = SecondsSinceLastInput();
        if (idleSeconds is not { } seconds)
        {
            return;
        }

        var now = _clock.UtcNowMs;

        if (!_isIdle && seconds >= _thresholdSeconds)
        {
            _isIdle = true;
            _emit(new IdleStarted(now, SinceUtcMs: now - ((long)seconds * 1000)));
        }
        else if (_isIdle && seconds < _thresholdSeconds)
        {
            _isIdle = false;
            _emit(new IdleEnded(now));
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _timer.Dispose();
    }
}
