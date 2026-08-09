using Trace.Contracts;
using Trace.Tracker.Data;

namespace Trace.Tracker.Tests;

/// <summary>
/// The engine, the privacy gate and a real SQLite database, end to end.
///
/// Milestone 3 proved the rules; these prove they survive the trip to disk.
/// </summary>
public class PersistenceTests
{
    // -- schema -------------------------------------------------------------

    [Fact]
    public void A_new_database_is_created_at_the_current_schema_version()
    {
        using var trace = new PersistenceHarness();

        var version = trace.Query("SELECT MAX(version) FROM schema_version;", r => r.GetInt32(0));
        Assert.Equal([1], version);

        var tables = trace.Query(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
            r => r.GetString(0));

        Assert.Contains("applications", tables);
        Assert.Contains("sessions", tables);
        Assert.Contains("window_sessions", tables);
        Assert.Contains("events", tables);
        Assert.Contains("tracker_state", tables);
    }

    [Fact]
    public void Reopening_an_existing_database_preserves_its_history()
    {
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(20)
            .Switch("code.exe", "main.ts").AdvanceMinutes(10)
            .ShutDown();

        var before = trace.CountRows("sessions");
        trace.Restart(asIfCrashed: false);

        Assert.Equal(before, trace.CountRows("sessions"));
        Assert.Equal(2, before);
    }

    [Fact]
    public void Deleting_a_session_removes_its_windows_and_events_by_cascade()
    {
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(10)
            .ChangeTitle("GitHub").AdvanceMinutes(10)
            .ShutDown();

        Assert.True(trace.CountRows("window_sessions") > 0);

        trace.Database.Write(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM sessions;";
            command.ExecuteNonQuery();
        });

        Assert.Equal(0, trace.CountRows("window_sessions"));
        Assert.Equal(0, trace.Query(
            "SELECT COUNT(*) FROM events WHERE session_id IS NOT NULL;", r => r.GetInt64(0))[0]);
    }

    // -- the privacy gate ---------------------------------------------------

    [Fact]
    public void An_excluded_application_reaches_no_table_and_no_column()
    {
        // DOCS/Privacy.md §7 and §29. The strongest form of the assertion: not
        // "no session", but no trace of the name anywhere in the database.
        using var trace = new PersistenceHarness();
        trace.Settings.Update(s => s with { ExcludedExecutables = ["1password.exe"] });

        trace.NewEngine().Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(10)
            .Switch("1password.exe", "Personal Vault").AdvanceMinutes(5)
            .ChangeTitle("Bank login").AdvanceMinutes(5)
            .Switch("chrome.exe", "GitHub").AdvanceMinutes(10)
            .ShutDown();

        var recorded = trace.AllRecordedText();
        Assert.DoesNotContain(recorded, t => t.Contains("1password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(recorded, t => t.Contains("Vault", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(recorded, t => t.Contains("Bank", StringComparison.OrdinalIgnoreCase));

        // The excluded application never even acquires an identity row.
        Assert.Equal(1, trace.CountRows("applications"));
    }

    [Fact]
    public void Trace_never_records_itself()
    {
        // DOCS/Tracking.md §Q — built in, and not something the user can undo by
        // clearing the exclusion list.
        using var trace = new PersistenceHarness();
        trace.Settings.Update(s => s with { ExcludedExecutables = [] });

        trace.NewEngine().Start()
            .Switch("tracetracker.exe", "Trace Tracker").AdvanceMinutes(10)
            .Switch("trace.exe", "Trace").AdvanceMinutes(10)
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(10)
            .ShutDown();

        Assert.Equal(1, trace.CountRows("applications"));
        Assert.DoesNotContain(
            trace.AllRecordedText(),
            t => t.Contains("trace", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void While_paused_nothing_new_is_written()
    {
        using var trace = new PersistenceHarness();
        trace.Settings.Update(s => s with { TrackingEnabled = false });

        var engine = trace.NewEngine();
        engine.PlaceInForeground("chrome.exe", "YouTube").Start(paused: true);
        engine.AdvanceMinutes(30).Switch("code.exe", "main.ts").AdvanceMinutes(30);

        Assert.Equal(0, trace.CountRows("sessions"));
        Assert.Equal(0, trace.CountRows("applications"));
        Assert.Equal(0, trace.CountRows("window_sessions"));
    }

    [Fact]
    public void Pausing_mid_session_still_closes_the_open_session()
    {
        // The gate blocks new records, never the finishing of existing ones.
        // Otherwise pausing would strand an open session, to be misreported as
        // a crash on the next start.
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start().Switch("chrome.exe", "YouTube").AdvanceMinutes(15);

        trace.Settings.Update(s => s with { TrackingEnabled = false });
        engine.Pause();

        var sessions = trace.Query(
            "SELECT ended_at, end_reason, active_seconds FROM sessions;",
            r => (EndedAt: r.IsDBNull(0) ? (long?)null : r.GetInt64(0),
                  Reason: r.IsDBNull(1) ? null : r.GetString(1),
                  Active: r.GetInt32(2)));

        var session = Assert.Single(sessions);
        Assert.NotNull(session.EndedAt);
        Assert.Equal(nameof(EndReason.TRACKING_PAUSED), session.Reason);
        Assert.Equal(15 * 60, session.Active);
    }

    [Fact]
    public void With_window_titles_off_no_title_is_ever_stored()
    {
        using var trace = new PersistenceHarness();
        trace.Settings.Update(s => s with { RecordWindowTitles = false });

        trace.NewEngine().Start()
            .Switch("chrome.exe", "My Private Medical Records").AdvanceMinutes(20)
            .ChangeTitle("Bank Account - 12,492").AdvanceMinutes(25)
            .ShutDown();

        Assert.Equal(0, trace.CountRows("window_sessions"));
        Assert.DoesNotContain(
            trace.AllRecordedText(),
            t => t.Contains("Medical", StringComparison.OrdinalIgnoreCase)
                 || t.Contains("Bank", StringComparison.OrdinalIgnoreCase));

        // The application history is untouched.
        Assert.Equal(45 * 60, trace.Query(
            "SELECT active_seconds FROM sessions;", r => r.GetInt32(0))[0]);
    }

    [Fact]
    public void One_application_keeps_one_identity_across_many_sessions()
    {
        // DOCS/data and database.md §3-4.
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("chrome.exe").AdvanceMinutes(10)
            .Switch("code.exe").AdvanceMinutes(10)
            .Switch("chrome.exe").AdvanceMinutes(10)
            .Switch("code.exe").AdvanceMinutes(10)
            .Switch("chrome.exe").AdvanceMinutes(10)
            .ShutDown();

        Assert.Equal(2, trace.CountRows("applications"));
        Assert.Equal(5, trace.CountRows("sessions"));
    }

    // -- crash recovery -----------------------------------------------------

    [Fact]
    public void An_interrupted_session_is_closed_at_the_last_heartbeat()
    {
        // DOCS/data and database.md §7 and §28: close at the last moment Trace
        // can vouch for, never at "now", and never at a guess in between.
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start().Switch("chrome.exe", "YouTube");
        engine.AdvanceMinutes(20).Beat();
        var heartbeatAt = engine.Now;

        // The machine dies here: two more hours pass with no heartbeat.
        engine.Advance(TimeSpan.FromHours(2));

        trace.Restart(asIfCrashed: true);
        RecoveryService.RecoverInterruptedSessions(trace.Database);

        var session = Assert.Single(trace.Query(
            "SELECT ended_at, end_reason, active_seconds, idle_seconds, started_at FROM sessions;",
            r => (EndedAt: r.GetInt64(0), Reason: r.GetString(1),
                  Active: r.GetInt32(2), Idle: r.GetInt32(3), StartedAt: r.GetInt64(4))));

        Assert.Equal(heartbeatAt, session.EndedAt);
        Assert.Equal(nameof(EndReason.CRASH_RECOVERY), session.Reason);
        Assert.Equal(20 * 60, session.Active);
        Assert.Equal(0, session.Idle);

        // Under-attributed, never over-attributed: the two lost hours are gone,
        // not silently credited to Chrome.
        Assert.Equal(20 * 60, (session.EndedAt - session.StartedAt) / 1000);
    }

    [Fact]
    public void Recovery_preserves_the_active_and_idle_split()
    {
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start().Switch("chrome.exe");
        engine.AdvanceMinutes(30).GoIdle(secondsAgo: 300);
        engine.AdvanceMinutes(10).Beat();

        engine.Advance(TimeSpan.FromHours(3));
        trace.Restart(asIfCrashed: true);
        RecoveryService.RecoverInterruptedSessions(trace.Database);

        var session = Assert.Single(trace.Query(
            "SELECT active_seconds, idle_seconds FROM sessions;",
            r => (Active: r.GetInt32(0), Idle: r.GetInt32(1))));

        // Idle began 5 minutes before the 30-minute mark and ran to the beat.
        Assert.Equal(25 * 60, session.Active);
        Assert.Equal(15 * 60, session.Idle);
    }

    [Fact]
    public void A_session_interrupted_before_any_heartbeat_records_no_time()
    {
        // Trace learnt nothing about it. Zero is honest; anything else is made up.
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start();
        engine.Beat();
        engine.AdvanceMinutes(5).Switch("chrome.exe", "YouTube");
        engine.Advance(TimeSpan.FromHours(4));

        trace.Restart(asIfCrashed: true);
        RecoveryService.RecoverInterruptedSessions(trace.Database);

        var session = Assert.Single(trace.Query(
            "SELECT started_at, ended_at, active_seconds FROM sessions;",
            r => (StartedAt: r.GetInt64(0), EndedAt: r.GetInt64(1), Active: r.GetInt32(2))));

        Assert.Equal(session.StartedAt, session.EndedAt);
        Assert.Equal(0, session.Active);
    }

    [Fact]
    public void A_crash_never_leaves_a_half_written_window_session()
    {
        // Window sessions are written on completion, so a crash cannot leave one
        // open. The trade-off is deliberate and worth stating plainly: the
        // window in progress at the moment of the crash is lost, while the
        // application session it belonged to is recovered in full.
        //
        // So window durations do not necessarily sum to their session's
        // duration. That is true by design anyway — windows shown for under
        // MinWindowSessionSeconds are never recorded.
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start().Switch("chrome.exe", "YouTube");
        engine.AdvanceMinutes(12).ChangeTitle("GitHub");   // YouTube completes here
        engine.AdvanceMinutes(8).Beat();                   // GitHub still in progress
        engine.Advance(TimeSpan.FromHours(1));

        trace.Restart(asIfCrashed: true);
        RecoveryService.RecoverInterruptedSessions(trace.Database);

        var windows = trace.Query(
            "SELECT title, ended_at, duration_seconds FROM window_sessions ORDER BY started_at;",
            r => (Title: r.GetString(0), EndedAt: r.IsDBNull(1) ? (long?)null : r.GetInt64(1),
                  Duration: r.GetInt32(2)));

        var completed = Assert.Single(windows);
        Assert.Equal("YouTube", completed.Title);
        Assert.NotNull(completed.EndedAt);
        Assert.Equal(12 * 60, completed.Duration);

        // The application session survives with its full recovered duration.
        Assert.Equal(20 * 60, trace.Query(
            "SELECT active_seconds FROM sessions;", r => r.GetInt32(0))[0]);
    }

    [Fact]
    public void Recovery_never_leaves_a_window_outlasting_its_session()
    {
        // A window completing after the last heartbeat is still written, so
        // recovery has to pull it back inside the boundary it closed the session
        // at. Otherwise the session's windows would add up to more time than the
        // session itself.
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start().Switch("chrome.exe", "YouTube");
        engine.AdvanceMinutes(10).Beat();
        var heartbeatAt = engine.Now;

        // After the last heartbeat the machine is still alive for a while: this
        // window completes, then the crash happens.
        engine.AdvanceMinutes(4).ChangeTitle("GitHub");
        engine.Advance(TimeSpan.FromHours(2));

        trace.Restart(asIfCrashed: true);
        RecoveryService.RecoverInterruptedSessions(trace.Database);

        var session = Assert.Single(trace.Query(
            "SELECT started_at, ended_at FROM sessions;",
            r => (StartedAt: r.GetInt64(0), EndedAt: r.GetInt64(1))));

        Assert.Equal(heartbeatAt, session.EndedAt);

        var windows = trace.Query(
            "SELECT started_at, ended_at, duration_seconds FROM window_sessions;",
            r => (StartedAt: r.GetInt64(0), EndedAt: r.GetInt64(1), Duration: r.GetInt32(2)));

        Assert.All(windows, w =>
        {
            Assert.True(w.EndedAt <= session.EndedAt, "a window outlasted its session");
            Assert.True(w.StartedAt >= session.StartedAt);
        });

        var totalWindowSeconds = windows.Sum(w => w.Duration);
        Assert.True(totalWindowSeconds <= (session.EndedAt - session.StartedAt) / 1000);
    }

    [Fact]
    public void A_clean_shutdown_leaves_nothing_to_recover()
    {
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(20)
            .ShutDown();

        trace.Restart(asIfCrashed: false);

        Assert.Equal(0, RecoveryService.RecoverInterruptedSessions(trace.Database));
        Assert.Equal(nameof(EndReason.SYSTEM_SHUTDOWN), trace.Query(
            "SELECT end_reason FROM sessions;", r => r.GetString(0))[0]);
    }

    // -- retention ----------------------------------------------------------

    [Fact]
    public void Forever_retention_deletes_nothing()
    {
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start().Switch("chrome.exe", "YouTube");
        engine.AdvanceMinutes(20).ShutDown();

        var yearsLater = engine.Now + (long)TimeSpan.FromDays(3650).TotalMilliseconds;
        var deleted = RetentionService.Apply(trace.Database, RetentionPolicy.FOREVER, yearsLater);

        Assert.Equal(0, deleted.SessionsDeleted);
        Assert.Equal(1, trace.CountRows("sessions"));
    }

    [Fact]
    public void A_retention_window_removes_older_history_and_keeps_newer()
    {
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine().Start();
        engine.Switch("chrome.exe", "old").AdvanceMinutes(20).ShutDown();

        var oldSessionEnd = engine.Now;
        engine.Advance(TimeSpan.FromDays(60));

        // Resume adopts whatever is in front, so put VS Code there first —
        // otherwise Chrome is re-adopted and the assertions below are about a
        // session the test never meant to create.
        engine.PlaceInForeground("code.exe", "recent").Resume();
        engine.AdvanceMinutes(20).ShutDown();

        var now = engine.Now;
        RetentionService.Apply(trace.Database, RetentionPolicy.THIRTY_DAYS, now);

        var remaining = trace.Query(
            "SELECT started_at FROM sessions;", r => r.GetInt64(0));

        Assert.Single(remaining);
        Assert.True(remaining[0] > oldSessionEnd);

        // The application that only ever appeared in deleted history goes too.
        Assert.Equal(1, trace.CountRows("applications"));
    }

    // -- settings -----------------------------------------------------------

    [Fact]
    public void Settings_round_trip_and_survive_a_restart()
    {
        using var trace = new PersistenceHarness();

        trace.Settings.Update(s => s with
        {
            TrackingEnabled = false,
            RecordWindowTitles = false,
            ExcludedExecutables = ["1Password.exe", " KeePass.exe ", "1password.exe"],
            Retention = RetentionPolicy.NINETY_DAYS,
        });

        var reloaded = new Trace.Tracker.Settings.SettingsStore(trace.SettingsPath).Current;

        Assert.False(reloaded.TrackingEnabled);
        Assert.False(reloaded.RecordWindowTitles);
        Assert.Equal(RetentionPolicy.NINETY_DAYS, reloaded.Retention);

        // Normalised: lowercased, trimmed, de-duplicated.
        Assert.Equal(["1password.exe", "keepass.exe"], reloaded.ExcludedExecutables);
    }

    [Fact]
    public void An_unreadable_settings_file_falls_back_to_paused()
    {
        // Silently resuming tracking for someone who had paused it would be the
        // worst possible failure mode for trust (DOCS/Privacy.md §27).
        using var trace = new PersistenceHarness();
        File.WriteAllText(trace.SettingsPath, "{ this is not json");

        var loaded = new Trace.Tracker.Settings.SettingsStore(trace.SettingsPath).Current;

        Assert.False(loaded.TrackingEnabled);
    }

    [Fact]
    public void An_absurd_idle_threshold_is_clamped()
    {
        using var trace = new PersistenceHarness();

        Assert.Equal(60, trace.Settings.Update(s => s with { IdleThresholdSeconds = 1 })
            .IdleThresholdSeconds);
        Assert.Equal(7200, trace.Settings.Update(s => s with { IdleThresholdSeconds = 999999 })
            .IdleThresholdSeconds);
    }

    // -- the acceptance scenario, on disk -----------------------------------

    [Fact]
    public void The_MVP_success_test_lands_correctly_in_the_database()
    {
        // DOCS/MVP.md §10, this time asserted by querying SQLite rather than a
        // fake: the same day the product documentation says must work.
        using var trace = new PersistenceHarness();

        var engine = trace.NewEngine();
        engine.AdvanceMinutes(60).Start();                        // 09:00
        engine.Switch("chrome.exe", "YouTube");
        engine.AdvanceMinutes(20).Switch("code.exe", "project-x");     // 09:20
        engine.AdvanceMinutes(40).Switch("chrome.exe", "GitHub");      // 10:00
        engine.AdvanceMinutes(30);                                     // 10:30 walks away
        engine.AdvanceMinutes(5).GoIdle(secondsAgo: 300);              // detected 10:35
        engine.AdvanceMinutes(5).Return();                             // 10:40 returns
        engine.AdvanceMinutes(20).Lock();                              // 11:00
        engine.AdvanceMinutes(30);
        engine.PlaceInForeground("chrome.exe", "GitHub").Unlock();     // 11:30
        engine.AdvanceMinutes(10).ShutDown();

        var totals = trace.Query(
            """
            SELECT a.name, SUM(s.active_seconds), SUM(s.idle_seconds), COUNT(*)
              FROM sessions s JOIN applications a ON a.id = s.application_id
             GROUP BY a.name ORDER BY a.name;
            """,
            r => (Name: r.GetString(0), Active: r.GetInt32(1), Idle: r.GetInt32(2), Count: r.GetInt32(3)));

        var chrome = totals.Single(t => t.Name == "chrome.exe");
        var code = totals.Single(t => t.Name == "code.exe");

        Assert.Equal(80 * 60, chrome.Active);  // 20m + 50m + 10m after unlock
        Assert.Equal(10 * 60, chrome.Idle);
        Assert.Equal(40 * 60, code.Active);
        Assert.Equal(3, chrome.Count);

        // The system events the timeline renders lock and sleep bars from.
        var events = trace.Query("SELECT type FROM events;", r => r.GetString(0));
        Assert.Contains(nameof(EventType.SYSTEM_LOCKED), events);
        Assert.Contains(nameof(EventType.SYSTEM_UNLOCKED), events);

        // Nothing left open.
        Assert.Equal(0, trace.Query(
            "SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL;", r => r.GetInt64(0))[0]);
    }
}
