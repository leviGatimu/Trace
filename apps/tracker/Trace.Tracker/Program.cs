using System.Security.Principal;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker;

internal static class Program
{
    /// <summary>
    /// Local\ scope makes the mutex per-session as well as per-user, which is
    /// what we want: one tracker per interactive Windows session.
    /// </summary>
    private static string MutexName => $@"Local\Trace.Tracker.{CurrentUserSid()}";

    [STAThread]
    private static int Main(string[] args)
    {
        var mode = LaunchMode.Parse(args);

        if (mode.ShowHelp)
        {
            ConsoleBridge.WriteHelp();
            return ExitCodes.Ok;
        }

        // --dump only reads, so it must not be blocked by the running tracker
        // and has no reason to open the log for writing.
        if (mode.Kind == LaunchKind.Dump)
        {
            return DumpCommand.Run();
        }

        // --probe is an IPC client: it runs alongside the tracker it is probing,
        // so it takes neither the single-instance mutex nor the log file.
        if (mode.Kind == LaunchKind.Probe)
        {
            return ProbeCommand.Run();
        }

        Log.Initialise();

        // Single instance. Two trackers writing one SQLite file would be the
        // fastest possible route to inconsistent history.
        using var instanceLock = new Mutex(initiallyOwned: true, MutexName, out var isOnlyInstance);
        if (!isOnlyInstance)
        {
            Log.Warn("Another Trace tracker is already running for this user. Exiting.");
            ConsoleBridge.WriteLine("Trace is already running.");
            return ExitCodes.AlreadyRunning;
        }

        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        try
        {
            return mode.Kind switch
            {
                LaunchKind.Diagnose => DiagnoseCommand.Run(),
                LaunchKind.Normal => TrackerHost.Run(),
                _ => ExitCodes.BadArguments,
            };
        }
        catch (Exception ex)
        {
            Log.Error("Fatal error; tracker is exiting.", ex);
            return ExitCodes.Fatal;
        }
        finally
        {
            Log.Info("--- Trace Tracker stopped ---");
            instanceLock.ReleaseMutex();
        }
    }

    /// <summary>
    /// An unhandled exception means the in-memory session state can no longer be
    /// trusted. TrackerHost's shutdown path closes the open session as
    /// CRASH_RECOVERY and checkpoints, then we exit non-zero rather than keep
    /// writing from a state we cannot vouch for.
    /// </summary>
    private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        Log.Error("Unhandled exception on a background thread.", e.ExceptionObject as Exception);
        TrackerHost.RequestEmergencyShutdown();
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        Log.Error("Unobserved task exception.", e.Exception);
        e.SetObserved();
    }

    private static string CurrentUserSid()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return identity.User?.Value ?? identity.Name.Replace('\\', '_');
    }
}

internal enum LaunchKind
{
    Normal,
    Diagnose,
    Dump,
    Probe,
}

/// <summary>Command-line surface. Kept tiny on purpose — this is a background service, not a CLI.</summary>
internal sealed record LaunchMode(LaunchKind Kind, bool ShowHelp)
{
    public static LaunchMode Parse(string[] args)
    {
        foreach (var arg in args)
        {
            switch (arg.ToLowerInvariant())
            {
                case "--diagnose":
                    return new LaunchMode(LaunchKind.Diagnose, false);
                case "--dump":
                    return new LaunchMode(LaunchKind.Dump, false);
                case "--probe":
                    return new LaunchMode(LaunchKind.Probe, false);
                case "--help":
                case "-h":
                case "/?":
                    return new LaunchMode(LaunchKind.Normal, true);
            }
        }

        return new LaunchMode(LaunchKind.Normal, false);
    }
}

internal static class ExitCodes
{
    public const int Ok = 0;
    public const int BadArguments = 1;
    public const int AlreadyRunning = 2;
    public const int Fatal = 3;
}
