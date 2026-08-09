using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Trace.Contracts;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Ipc;

/// <summary>
/// The named-pipe server the dashboard talks to.
///
/// A pipe rather than a localhost HTTP port, deliberately (implementation plan
/// §5). A TCP listener is reachable by every process on the machine and, via
/// DNS rebinding, by web pages in the browser; binding one can also raise a
/// Windows Firewall prompt, which is an absurd first-run experience for a
/// product that never touches the network. A pipe with a DACL is reachable only
/// by the user who owns the history.
///
/// Protocol: newline-delimited JSON, one object per line, defined in
/// <c>packages/contracts/ipc-contract.md</c>.
/// </summary>
internal sealed class PipeServer : IAsyncDisposable
{
    private const int MaxConcurrentClients = 8;

    private readonly string _pipeName;
    private readonly RequestRouter _router;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly List<PipeConnection> _connections = [];
    private readonly Lock _connectionsGate = new();

    private Task? _acceptLoop;

    public PipeServer(RequestRouter router)
    {
        _router = router;
        _pipeName = PipeNameForCurrentUser();
    }

    /// <summary>
    /// <c>Trace.&lt;SID&gt;</c>. Naming the pipe after the user makes the
    /// per-user isolation of DOCS/Windows Integration §26 structural: two
    /// Windows accounts cannot even name each other's pipe by accident.
    /// </summary>
    public static string PipeNameForCurrentUser()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var sid = identity.User?.Value ?? identity.Name.Replace('\\', '_');
        return ContractInfo.PipeNamePrefix + sid;
    }

    public void Start()
    {
        _acceptLoop = Task.Run(() => AcceptLoopAsync(_shutdown.Token));
        Log.Info($"IPC listening on \\\\.\\pipe\\{_pipeName}");
    }

    /// <summary>Sends an event to every connected client. Never throws.</summary>
    public void Broadcast(string eventName, object data)
    {
        PipeConnection[] targets;
        lock (_connectionsGate)
        {
            targets = [.. _connections];
        }

        if (targets.Length == 0)
        {
            return;
        }

        var line = JsonSerializer.Serialize(new IpcPush(eventName, data), ContractJson.Options);

        foreach (var connection in targets)
        {
            _ = connection.SendAsync(line);
        }
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        var isFirstInstance = true;

        while (!cancellationToken.IsCancellationRequested)
        {
            NamedPipeServerStream stream;

            try
            {
                stream = CreateStream(isFirstInstance);
            }
            catch (IOException ex) when (isFirstInstance)
            {
                // FirstPipeInstance failed: something already owns this name.
                // Refuse loudly rather than fall back to an unprotected pipe and
                // let a squatter impersonate the tracker.
                Log.Error(
                    $"Could not claim the pipe '{_pipeName}'. Another process is using it. " +
                    "Trace will not serve IPC.", ex);
                return;
            }

            isFirstInstance = false;

            try
            {
                await stream.WaitForConnectionAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                await stream.DisposeAsync();
                return;
            }
            catch (IOException ex)
            {
                Log.Warn("A client connection failed before it was established.", ex);
                await stream.DisposeAsync();
                continue;
            }

            var connection = new PipeConnection(stream);

            lock (_connectionsGate)
            {
                _connections.Add(connection);
            }

            _ = ServeAsync(connection, cancellationToken);
        }
    }

    private NamedPipeServerStream CreateStream(bool isFirstInstance)
    {
        var security = new PipeSecurity();

        using var identity = WindowsIdentity.GetCurrent();
        if (identity.User is { } user)
        {
            security.AddAccessRule(
                new PipeAccessRule(user, PipeAccessRights.FullControl, AccessControlType.Allow));
        }

        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            PipeAccessRights.FullControl,
            AccessControlType.Allow));

        var options = PipeOptions.Asynchronous
                      | (isFirstInstance ? PipeOptions.FirstPipeInstance : PipeOptions.None);

        return NamedPipeServerStreamAcl.Create(
            _pipeName,
            PipeDirection.InOut,
            MaxConcurrentClients,
            PipeTransmissionMode.Byte,
            options,
            inBufferSize: 0,
            outBufferSize: 0,
            security);
    }

    private async Task ServeAsync(PipeConnection connection, CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var line in connection.ReadLinesAsync(cancellationToken))
            {
                var response = _router.Handle(line);
                await connection.SendAsync(response);
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException
                                       or ObjectDisposedException)
        {
            // A dashboard being closed is the normal way a connection ends.
        }
        catch (Exception ex)
        {
            Log.Error("IPC connection failed unexpectedly.", ex);
        }
        finally
        {
            lock (_connectionsGate)
            {
                _connections.Remove(connection);
            }

            await connection.DisposeAsync();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _shutdown.CancelAsync();

        PipeConnection[] open;
        lock (_connectionsGate)
        {
            open = [.. _connections];
            _connections.Clear();
        }

        foreach (var connection in open)
        {
            await connection.DisposeAsync();
        }

        if (_acceptLoop is not null)
        {
            await Task.WhenAny(_acceptLoop, Task.Delay(TimeSpan.FromSeconds(2)));
        }

        _shutdown.Dispose();
    }
}

/// <summary>
/// One connected client. Reads are driven by the serving task; writes can also
/// come from a broadcast on another thread, so they are serialised.
/// </summary>
internal sealed class PipeConnection : IAsyncDisposable
{
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    private readonly NamedPipeServerStream _stream;
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private bool _disposed;

    public PipeConnection(NamedPipeServerStream stream)
    {
        _stream = stream;
    }

    public async IAsyncEnumerable<string> ReadLinesAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation]
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(_stream, Utf8, leaveOpen: true);

        while (!cancellationToken.IsCancellationRequested && _stream.IsConnected)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null)
            {
                yield break; // client closed
            }

            if (line.Length == 0)
            {
                continue;
            }

            if (line.Length > ContractInfo.MaxFrameBytes)
            {
                Log.Warn("Dropping an oversized IPC frame and closing the connection.");
                yield break;
            }

            yield return line;
        }
    }

    public async Task SendAsync(string line)
    {
        if (_disposed)
        {
            return;
        }

        await _writeGate.WaitAsync();

        try
        {
            if (!_stream.IsConnected)
            {
                return;
            }

            var bytes = Utf8.GetBytes(line + "\n");
            await _stream.WriteAsync(bytes);
            await _stream.FlushAsync();
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException)
        {
            // The client went away mid-write. Nothing to do and nothing worth
            // logging: it is how every dashboard close looks from here.
        }
        finally
        {
            _writeGate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        try
        {
            if (_stream.IsConnected)
            {
                _stream.Disconnect();
            }
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException)
        {
        }

        await _stream.DisposeAsync();
        _writeGate.Dispose();
    }
}
