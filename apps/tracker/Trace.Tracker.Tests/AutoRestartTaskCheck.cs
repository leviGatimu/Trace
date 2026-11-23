using Trace.Tracker.Windows;

namespace Trace.Tracker.Tests;

/// <summary>
/// Registers the real task definition with Windows under a throwaway name,
/// pointing at whoami.exe (which ignores the argument and exits), then removes
/// it. Opt-in because it changes the machine's task list for a moment: set
/// TRACE_REAL_TASK=1.
/// </summary>
public class AutoRestartTaskCheck
{
    [Fact]
    public void Windows_accepts_the_task_and_it_can_be_switched_off_and_removed()
    {
        if (Environment.GetEnvironmentVariable("TRACE_REAL_TASK") != "1")
        {
            return;
        }

        var task = new AutoRestartTask(
            "Trace Recorder (test, safe to delete)",
            Path.Combine(Environment.SystemDirectory, "whoami.exe"));
        try
        {
            task.Install();
            Assert.True(task.IsActive());

            task.Disable();
            Assert.False(task.IsActive());

            task.Install();
            Assert.True(task.IsActive());
        }
        finally
        {
            task.Remove();
        }

        Assert.False(task.IsActive());
    }
}
