using System.Threading.Channels;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Engine;

/// <summary>
/// The single entrance to the session engine.
///
/// Producers (Win32 hooks, the message-only window, the idle timer, the tray,
/// IPC handlers) call <see cref="Post"/> from whatever thread they happen to be
/// on. One consumer drains the queue in order. That is what makes the engine
/// single-threaded and therefore lock-free, and it is what lets the entire
/// DOCS/Tracking.md rules table be tested by feeding a scripted signal list with
/// no Windows involved.
///
/// The queue is unbounded but ordered. Unbounded is safe here because signals
/// are produced by real user actions — an alarming burst would be a few hundred
/// window switches, not millions — and dropping a transition would silently
/// corrupt the history, which is worse than a momentary backlog.
/// </summary>
internal sealed class SignalQueue : IAsyncDisposable
{
    private readonly Channel<Signal> _channel = Channel.CreateUnbounded<Signal>(
        new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
            AllowSynchronousContinuations = false,
        });

    private readonly CancellationTokenSource _shutdown = new();
    private Task? _consumer;

    /// <summary>
    /// Enqueues a signal. Never blocks and never throws: a Win32 callback that
    /// throws takes the process down inside unmanaged code.
    /// </summary>
    public void Post(Signal signal)
    {
        if (!_channel.Writer.TryWrite(signal))
        {
            Log.Warn($"Dropped {signal.GetType().Name}: signal queue is closed.");
        }
    }

    /// <summary>
    /// Starts draining. <paramref name="handle"/> runs on a single dedicated
    /// task and is the only code permitted to mutate engine state.
    /// </summary>
    public void Start(Func<Signal, CancellationToken, Task> handle)
    {
        if (_consumer is not null)
        {
            throw new InvalidOperationException("Signal queue is already running.");
        }

        _consumer = Task.Run(async () =>
        {
            try
            {
                await foreach (var signal in _channel.Reader.ReadAllAsync(_shutdown.Token))
                {
                    try
                    {
                        await handle(signal, _shutdown.Token);
                    }
                    catch (Exception ex)
                    {
                        // One bad signal must not kill the consumer, or every
                        // later transition would be lost silently.
                        Log.Error($"Failed to process {signal.GetType().Name}.", ex);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Normal shutdown.
            }
        });
    }

    /// <summary>
    /// Stops accepting signals and drains what is already queued, so a pending
    /// transition is not lost on the way out.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        _channel.Writer.TryComplete();

        if (_consumer is not null)
        {
            var drained = await Task.WhenAny(_consumer, Task.Delay(TimeSpan.FromSeconds(5)));
            if (drained != _consumer)
            {
                Log.Warn("Signal queue did not drain within 5s; cancelling.");
                await _shutdown.CancelAsync();
            }
        }

        _shutdown.Dispose();
    }
}
