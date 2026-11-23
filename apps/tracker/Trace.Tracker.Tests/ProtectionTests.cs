using Trace.Contracts;
using Trace.Tracker.Engine;
using Trace.Tracker.Protection;
using Trace.Tracker.Settings;
using static Trace.Tracker.Tests.IpcTests;

namespace Trace.Tracker.Tests;

/// <summary>
/// The Trace PIN, enforced in the tracker: what needs it, what never does,
/// the lockout, putting back a hand-edited settings.json, and the tamper log.
/// </summary>
public class ProtectionTests
{
    private const string Pin = "2580";

    [Fact]
    public void Without_a_pin_nothing_is_guarded()
    {
        using var world = new World();

        Ok<TrackerStatus>(world.Router, IpcMethods.TrackingPause);

        Assert.False(world.Trace.Settings.Current.TrackingEnabled);
        Assert.Contains(world.Log(), e => e.Kind == "paused");
    }

    [Fact]
    public void Pausing_needs_the_pin_and_resuming_never_does()
    {
        using var world = new World();
        world.SetUp();

        var refused = Error(world.Router, IpcMethods.TrackingPause);
        Assert.Equal(IpcErrorCode.E_LOCKED, refused.Code);
        Assert.Contains("pause recording", refused.Message);
        Assert.True(world.Trace.Settings.Current.TrackingEnabled);

        Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionUnlock, new { secret = Pin });
        Ok<TrackerStatus>(world.Router, IpcMethods.TrackingPause);
        Assert.False(world.Trace.Settings.Current.TrackingEnabled);

        Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionLock);
        Ok<TrackerStatus>(world.Router, IpcMethods.TrackingResume);
        Assert.True(world.Trace.Settings.Current.TrackingEnabled);
    }

    [Fact]
    public void Turning_a_setting_down_needs_the_pin_and_turning_it_up_does_not()
    {
        using var world = new World();
        world.Trace.Settings.Update(s => s with { StartWithWindows = false });
        world.SetUp();

        Ok<Contracts.Settings>(world.Router, IpcMethods.SettingsUpdate, new { startWithWindows = true });
        Ok<Contracts.Settings>(world.Router, IpcMethods.SettingsUpdate, new { clockFormat = "TWENTY_FOUR_HOUR" });

        var excluded = Error(world.Router, IpcMethods.SettingsUpdate, new { excludedExecutables = new[] { "chrome.exe" } });
        Assert.Equal(IpcErrorCode.E_LOCKED, excluded.Code);
        Assert.Contains("chrome.exe", excluded.Message);

        var shorter = Error(world.Router, IpcMethods.SettingsUpdate, new { retention = "THIRTY_DAYS" });
        Assert.Equal(IpcErrorCode.E_LOCKED, shorter.Code);
        Assert.Equal(RetentionPolicy.FOREVER, world.Trace.Settings.Current.Retention);
    }

    [Fact]
    public void Deleting_history_needs_the_pin()
    {
        using var world = new World();
        world.SetUp();

        Assert.Equal(IpcErrorCode.E_LOCKED, Error(world.Router, IpcMethods.DataDeleteAll, new { confirm = ContractInfo.DeleteAllConfirmation }).Code);
        Assert.Equal(IpcErrorCode.E_LOCKED, Error(world.Router, IpcMethods.DataDeleteApplication, new { applicationId = 1 }).Code);
    }

    [Fact]
    public void The_unlock_lasts_five_minutes()
    {
        using var world = new World();
        world.SetUp();
        Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionUnlock, new { secret = Pin });

        world.Clock.Advance(ProtectionService.UnlockWindow - TimeSpan.FromSeconds(1));
        world.Protection.Demand("test");

        world.Clock.Advance(TimeSpan.FromSeconds(2));
        Assert.Throws<Ipc.IpcException>(() => world.Protection.Demand("test"));
    }

    [Fact]
    public void Five_wrong_pins_lock_out_even_the_right_one_and_survive_a_restart()
    {
        using var world = new World();
        world.SetUp();

        for (var i = 0; i < ProtectionService.FreeAttempts; i++)
        {
            Assert.Equal(IpcErrorCode.E_LOCKED, Error(world.Router, IpcMethods.ProtectionUnlock, new { secret = "1111" }).Code);
        }

        var lockedOut = Error(world.Router, IpcMethods.ProtectionUnlock, new { secret = Pin });
        Assert.Contains("Too many wrong PINs", lockedOut.Message);

        // A fresh service reads the lockout from the database.
        var restarted = new ProtectionService(world.Trace.Database, world.Clock, new FakeAutoRestart(), iterations: 1_000);
        Assert.NotNull(restarted.Status().LockedOutUntilUtcMs);

        world.Clock.Advance(TimeSpan.FromMinutes(2));
        restarted.Unlock(Pin);
        Assert.Equal(0, restarted.Status().FailedAttempts);
        Assert.Equal(ProtectionService.FreeAttempts, world.Log().Count(e => e.Kind == "wrong-pin"));
        Assert.Contains(world.Log(), e => e.Kind == "locked-out");
    }

    [Fact]
    public void The_recovery_code_unlocks_however_it_is_typed()
    {
        using var world = new World();
        var code = world.SetUp();

        var typed = code.Replace("-", " ", StringComparison.Ordinal).ToLowerInvariant();
        var status = Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionUnlock, new { secret = typed });

        Assert.NotNull(status.UnlockedUntilUtcMs);
        Assert.Contains(world.Log(), e => e.Kind == "recovery-used");
    }

    [Fact]
    public void Weak_pins_are_refused()
    {
        Assert.NotNull(Secrets.ProblemWithPin("1234"));
        Assert.NotNull(Secrets.ProblemWithPin("0000"));
        Assert.NotNull(Secrets.ProblemWithPin("987"));
        Assert.NotNull(Secrets.ProblemWithPin("12a4"));
        Assert.Null(Secrets.ProblemWithPin(Pin));
    }

    [Fact]
    public void Changing_or_removing_the_pin_needs_the_old_one()
    {
        using var world = new World();
        world.SetUp();

        Assert.Equal(IpcErrorCode.E_LOCKED, Error(world.Router, IpcMethods.ProtectionSetup, new { pin = "4791" }).Code);
        Assert.Equal(IpcErrorCode.E_LOCKED, Error(world.Router, IpcMethods.ProtectionDisable).Code);

        Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionUnlock, new { secret = Pin });
        Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionDisable);

        Assert.False(world.Protection.Enabled);
        Assert.Equal(1, world.AutoRestart.Removed);
    }

    [Fact]
    public void Setting_the_pin_installs_auto_restart_and_a_missing_task_is_put_back()
    {
        using var world = new World();
        world.SetUp();
        Assert.True(world.AutoRestart.Installed);
        Assert.True(world.Protection.Status().AutoRestart);

        world.AutoRestart.Installed = false;
        world.Protection.EnsureAutoRestart(logRepair: true);

        Assert.True(world.AutoRestart.Installed);
        Assert.Contains(world.Log(), e => e.Kind == "auto-restart-repaired");
    }

    [Fact]
    public void A_hand_edited_settings_file_is_put_back()
    {
        using var world = new World();
        world.SetUp();

        // Paused and Chrome excluded by editing the file while Trace was stopped.
        var edited = File.ReadAllText(world.Trace.SettingsPath)
            .Replace("\"trackingEnabled\": true", "\"trackingEnabled\": false", StringComparison.Ordinal)
            .Replace("\"excludedExecutables\": []", "\"excludedExecutables\": [\"chrome.exe\"]", StringComparison.Ordinal);
        File.WriteAllText(world.Trace.SettingsPath, edited);
        var reloaded = new SettingsStore(world.Trace.SettingsPath);
        Assert.False(reloaded.Current.TrackingEnabled);

        world.Protection.CheckSettingsFile(reloaded);

        Assert.True(reloaded.Current.TrackingEnabled);
        Assert.Empty(reloaded.Current.ExcludedExecutables);
        var entry = Assert.Single(world.Log(), e => e.Kind == "settings-edited");
        Assert.Contains("pause recording", entry.Detail);
    }

    [Fact]
    public void An_unreadable_settings_file_no_longer_pauses_a_protected_trace()
    {
        using var world = new World();
        world.SetUp();

        File.WriteAllText(world.Trace.SettingsPath, "{ not json");
        var reloaded = new SettingsStore(world.Trace.SettingsPath);
        Assert.True(reloaded.LoadFailed);
        Assert.False(reloaded.Current.TrackingEnabled);

        world.Protection.CheckSettingsFile(reloaded);

        Assert.True(reloaded.Current.TrackingEnabled);
        Assert.Contains(world.Log(), e => e.Kind == "settings-unreadable");
    }

    [Fact]
    public void Allowed_changes_are_remembered_so_they_are_not_undone_at_the_next_start()
    {
        using var world = new World();
        world.SetUp();
        Ok<ProtectionStatus>(world.Router, IpcMethods.ProtectionUnlock, new { secret = Pin });
        Ok<TrackerStatus>(world.Router, IpcMethods.TrackingPause);

        var reloaded = new SettingsStore(world.Trace.SettingsPath);
        world.Protection.CheckSettingsFile(reloaded);

        Assert.False(reloaded.Current.TrackingEnabled);
        Assert.DoesNotContain(world.Log(), e => e.Kind == "settings-edited");
    }

    [Fact]
    public void The_pin_is_never_stored()
    {
        using var world = new World();
        var code = world.SetUp();

        var stored = world.Trace.Database.Read(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT * FROM protection;";
            using var reader = command.ExecuteReader();
            reader.Read();
            var values = new List<string>();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                values.Add(reader.GetValue(i) is byte[] bytes ? Convert.ToHexString(bytes) : reader.GetValue(i).ToString()!);
            }

            return string.Join("|", values);
        });

        Assert.DoesNotContain(Pin, stored);
        Assert.DoesNotContain(Secrets.NormaliseRecoveryCode(code), stored);
    }

    [Fact]
    public void The_task_definition_runs_the_tracker_unelevated_with_no_time_limit()
    {
        var xml = Windows.AutoRestartTask.Definition(@"C:\Program Files\Trace & Co\TraceTracker.exe");

        Assert.Contains("<Command>C:\\Program Files\\Trace &amp; Co\\TraceTracker.exe</Command>", xml);
        Assert.Contains("<Arguments>--watchdog</Arguments>", xml);
        Assert.Contains("<RunLevel>LeastPrivilege</RunLevel>", xml);
        Assert.Contains("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>", xml);
        Assert.Contains("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>", xml);
        Assert.Contains("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>", xml);
        Assert.Contains("<Hidden>false</Hidden>", xml);
    }

    private sealed class World : IDisposable
    {
        public World()
        {
            Trace = new PersistenceHarness();
            Trace.Settings.Update(s => s);
            Protection = new ProtectionService(Trace.Database, Clock, AutoRestart, iterations: 1_000);
            Trace.Settings.Changed += Protection.Remember;
            Router = NewRouter(Trace, Clock, Protection);
        }

        public PersistenceHarness Trace { get; }

        public ManualClock Clock { get; } = new();

        public FakeAutoRestart AutoRestart { get; } = new();

        public ProtectionService Protection { get; }

        public Ipc.RequestRouter Router { get; }

        /// <summary>Sets the PIN; returns the recovery code.</summary>
        public string SetUp() =>
            Ok<ProtectionSetupResult>(Router, IpcMethods.ProtectionSetup, new { pin = Pin }).RecoveryCode;

        public IReadOnlyList<TamperEntry> Log() => Protection.List(1000);

        public void Dispose() => Trace.Dispose();
    }
}

internal sealed class ManualClock : IClock
{
    public long UtcNowMs { get; private set; } = 1_790_000_000_000;

    public ulong TickCountMs => (ulong)UtcNowMs;

    public void Advance(TimeSpan by) => UtcNowMs += (long)by.TotalMilliseconds;
}

internal sealed class FakeAutoRestart : IAutoRestart
{
    public bool Installed { get; set; }

    public int Removed { get; private set; }

    public bool IsActive() => Installed;

    public void Install() => Installed = true;

    public void Disable() => Installed = false;

    public void Remove()
    {
        Installed = false;
        Removed++;
    }
}
