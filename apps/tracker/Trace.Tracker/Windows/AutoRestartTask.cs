using System.Diagnostics;
using System.Security;
using System.Security.Principal;
using System.Text;
using Trace.Tracker.Protection;

namespace Trace.Tracker.Windows;

/// <summary>
/// A per-user scheduled task, "Trace Recorder", that starts the tracker at
/// sign-in and every minute after.
///
/// The task runs the tracker itself, with "do not start a new instance" set,
/// so while Trace runs each minute's trigger is ignored. Once the process is
/// ended, from Task Manager or anywhere else, the next trigger starts it again.
/// A trigger that finds Trace started some other way launches a copy that
/// sees the running one and exits at once, without writing a log line.
///
/// Visible on purpose: it is listed in Task Scheduler under its own name with
/// a description saying what made it and how to turn it off. It needs no
/// administrator rights and runs as you, never elevated.
/// </summary>
internal sealed class AutoRestartTask : IAutoRestart
{
    public const string TaskName = "Trace Recorder";
    public const string WatchdogArgument = "--watchdog";

    private static readonly string Schtasks = Path.Combine(Environment.SystemDirectory, "schtasks.exe");

    private readonly string _name;
    private readonly string? _executable;

    /// <param name="name">Another name and program only for the opt-in check against real Windows.</param>
    public AutoRestartTask(string name = TaskName, string? executable = null)
    {
        _name = name;
        _executable = executable;
    }

    private string? Executable => _executable ?? Environment.ProcessPath;

    public bool IsActive()
    {
        var (exitCode, output) = Run("/Query", "/TN", _name, "/XML");
        if (exitCode != 0)
        {
            return false;
        }

        var executable = Executable ?? string.Empty;

        // The task's own <Settings><Enabled>, and the action pointing at this
        // tracker. A task switched off, or edited to run something else,
        // does not count.
        return !output.Contains("<Enabled>false</Enabled>", StringComparison.OrdinalIgnoreCase)
               && output.Contains(SecurityElement.Escape(executable), StringComparison.OrdinalIgnoreCase);
    }

    public void Install()
    {
        var executable = Executable
                         ?? throw new InvalidOperationException("The tracker's own path is unknown.");
        var file = Path.Combine(Path.GetTempPath(), $"trace-task-{Guid.NewGuid():N}.xml");
        try
        {
            // schtasks reads task XML as UTF-16.
            File.WriteAllText(file, Definition(executable), Encoding.Unicode);
            var (exitCode, output) = Run("/Create", "/TN", _name, "/XML", file, "/F");
            if (exitCode != 0)
            {
                throw new InvalidOperationException($"schtasks /Create failed ({exitCode}): {output.Trim()}");
            }
        }
        finally
        {
            File.Delete(file);
        }
    }

    public void Disable() => Run("/Change", "/TN", _name, "/DISABLE");

    public void Remove() => Run("/Delete", "/TN", _name, "/F");

    internal static string Definition(string executable)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var sid = identity.User?.Value ?? throw new InvalidOperationException("The current user has no SID.");
        var command = SecurityElement.Escape(executable);

        return $"""
            <?xml version="1.0" encoding="UTF-16"?>
            <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
              <RegistrationInfo>
                <Author>Trace</Author>
                <Description>Keeps Trace recording: starts it when you sign in, and again within a minute if it is ended. Created by Trace's protection. Turn it off in Trace, Protection.</Description>
              </RegistrationInfo>
              <Triggers>
                <LogonTrigger>
                  <Enabled>true</Enabled>
                  <UserId>{sid}</UserId>
                </LogonTrigger>
                <TimeTrigger>
                  <StartBoundary>2000-01-01T00:00:00</StartBoundary>
                  <Enabled>true</Enabled>
                  <Repetition>
                    <Interval>PT1M</Interval>
                    <StopAtDurationEnd>false</StopAtDurationEnd>
                  </Repetition>
                </TimeTrigger>
              </Triggers>
              <Principals>
                <Principal id="Author">
                  <UserId>{sid}</UserId>
                  <LogonType>InteractiveToken</LogonType>
                  <RunLevel>LeastPrivilege</RunLevel>
                </Principal>
              </Principals>
              <Settings>
                <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                <AllowHardTerminate>true</AllowHardTerminate>
                <StartWhenAvailable>true</StartWhenAvailable>
                <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
                <IdleSettings>
                  <StopOnIdleEnd>false</StopOnIdleEnd>
                  <RestartOnIdle>false</RestartOnIdle>
                </IdleSettings>
                <AllowStartOnDemand>true</AllowStartOnDemand>
                <Enabled>true</Enabled>
                <Hidden>false</Hidden>
                <RunOnlyIfIdle>false</RunOnlyIfIdle>
                <WakeToRun>false</WakeToRun>
                <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                <Priority>7</Priority>
              </Settings>
              <Actions Context="Author">
                <Exec>
                  <Command>{command}</Command>
                  <Arguments>{WatchdogArgument}</Arguments>
                </Exec>
              </Actions>
            </Task>
            """;
    }

    private static (int ExitCode, string Output) Run(params string[] arguments)
    {
        var start = new ProcessStartInfo(Schtasks)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start)
                            ?? throw new InvalidOperationException("schtasks.exe could not be started.");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(15_000))
        {
            process.Kill();
            throw new InvalidOperationException("schtasks.exe did not answer.");
        }

        return (process.ExitCode, output.GetAwaiter().GetResult() + error.GetAwaiter().GetResult());
    }
}
