using Trace.Contracts;

namespace Trace.Tracker.Tests;

/// <summary>
/// One test per row of the DOCS/Tracking.md §"MVP rules" table, plus the edge
/// cases that table implies but does not spell out.
///
/// These run without Windows and without a database, which is the entire point
/// of keeping the engine a pure state machine: the rules that decide what the
/// user's history says are the rules that get tested.
/// </summary>
public class SessionEngineTests
{
    // -- foreground and sessions -------------------------------------------

    [Fact]
    public void App_becoming_foreground_starts_a_session()
    {
        var h = new EngineHarness().Start().Switch("chrome.exe", "YouTube");

        var session = Assert.Single(h.Sink.Sessions);
        Assert.Equal("chrome.exe", session.Executable);
        Assert.Equal(EngineHarness.DayStartUtcMs, session.StartedAt);
        Assert.True(session.IsOpen);
        Assert.Contains(h.Sink.Events, e => e.Type == EventType.SESSION_STARTED);
    }

    [Fact]
    public void Switching_apps_ends_the_old_session_and_starts_a_new_one()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube")
            .AdvanceMinutes(23)
            .Switch("code.exe", "project-x");

        Assert.Equal(2, h.Sink.Sessions.Count);

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(EndReason.APP_SWITCH, chrome.Reason);
        Assert.Equal(23 * 60, chrome.ActiveSeconds);
        Assert.Equal(0, chrome.IdleSeconds);

        Assert.True(h.Sink.SessionFor("code.exe").IsOpen);
    }

    [Fact]
    public void Returning_to_an_earlier_app_creates_a_separate_session()
    {
        // DOCS/Tracking.md §E: Chrome -> VS Code -> Chrome is three sessions.
        // Daily totals group them; the timeline keeps them distinct.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(20)
            .Switch("code.exe").AdvanceMinutes(22)
            .Switch("chrome.exe").AdvanceMinutes(19)
            .Switch("code.exe");

        Assert.Equal(4, h.Sink.Sessions.Count);
        Assert.Equal(2, h.Sink.SessionsFor("chrome.exe").Count());
        Assert.Equal(20 * 60 + 19 * 60, h.Sink.SessionsFor("chrome.exe").Sum(s => s.ActiveSeconds));
    }

    [Fact]
    public void Duplicate_foreground_events_do_not_create_extra_sessions()
    {
        // DOCS/data and database.md §12. Windows really does emit these — the
        // Milestone 2 diagnose run showed consecutive duplicates for one window.
        var h = new EngineHarness().Start().Switch("chrome.exe", "YouTube");

        h.RepeatForegroundEvent();
        h.AdvanceSeconds(1).RepeatForegroundEvent();
        h.AdvanceSeconds(1).RepeatForegroundEvent();

        Assert.Single(h.Sink.Sessions);
        Assert.Single(h.Sink.WindowSessions);
    }

    [Fact]
    public void Two_windows_of_the_same_app_share_one_application_session()
    {
        // DOCS/Tracking.md §O.
        var h = new EngineHarness().Start()
            .Switch("code.exe", "main.ts")
            .AdvanceMinutes(10)
            .SwitchToSecondWindowOf("code.exe", "index.html")
            .AdvanceMinutes(10);

        Assert.Single(h.Sink.Sessions);
        Assert.Equal(2, h.Sink.WindowSessions.Count);
        Assert.True(h.Sink.SessionFor("code.exe").IsOpen);
    }

    [Fact]
    public void Foreground_process_exit_ends_the_session_as_app_exit()
    {
        // DOCS/Tracking.md §P.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube")
            .AdvanceMinutes(34)
            .ExitForegroundProcess("chrome.exe");

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(EndReason.APP_EXIT, chrome.Reason);
        Assert.Equal(34 * 60, chrome.ActiveSeconds);
    }

    [Fact]
    public void Exit_of_a_background_process_is_ignored()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(5)
            .Switch("code.exe").AdvanceMinutes(5)
            .ExitForegroundProcess("chrome.exe");

        // Chrome's session already closed as APP_SWITCH; VS Code is untouched.
        Assert.Equal(EndReason.APP_SWITCH, h.Sink.SessionFor("chrome.exe").Reason);
        Assert.True(h.Sink.SessionFor("code.exe").IsOpen);
    }

    [Fact]
    public void Unidentifiable_window_ends_the_session_and_records_nothing_new()
    {
        // A protected or elevated process. A gap is honest; a guess is not.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(10)
            .FocusUnidentifiableWindow();

        Assert.Single(h.Sink.Sessions);
        Assert.Equal(EndReason.APP_SWITCH, h.Sink.SessionFor("chrome.exe").Reason);
    }

    // -- window sessions ----------------------------------------------------

    [Fact]
    public void Title_change_within_an_app_changes_the_window_session_only()
    {
        // DOCS/Tracking.md §D — the browser tab-switch case.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube")
            .AdvanceMinutes(18).ChangeTitle("GitHub")
            .AdvanceMinutes(13).ChangeTitle("Google")
            .AdvanceMinutes(9);

        Assert.Single(h.Sink.Sessions);

        var windows = h.Sink.WindowSessions;
        Assert.Equal(3, windows.Count);
        Assert.Equal(["YouTube", "GitHub", "Google"], windows.Select(w => w.Title));
        Assert.Equal(18 * 60, windows[0].DurationSeconds);
        Assert.Equal(13 * 60, windows[1].DurationSeconds);
        Assert.Null(windows[2].EndedAt);
    }

    [Fact]
    public void Repeated_notification_of_an_unchanged_title_creates_nothing()
    {
        var h = new EngineHarness().Start().Switch("chrome.exe", "YouTube");

        h.AdvanceSeconds(5).ChangeTitle("YouTube");
        h.AdvanceSeconds(5).ChangeTitle("YouTube");

        Assert.Single(h.Sink.WindowSessions);
    }

    [Fact]
    public void Window_session_closes_when_its_application_session_closes()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube")
            .AdvanceMinutes(20)
            .Switch("code.exe", "main.ts");

        var youtube = h.Sink.WindowSessions.Single(w => w.Title == "YouTube");
        Assert.NotNull(youtube.EndedAt);
        Assert.Equal(20 * 60, youtube.DurationSeconds);
    }

    // -- idle ---------------------------------------------------------------

    [Fact]
    public void Idle_pauses_active_time_without_ending_the_session()
    {
        // DOCS/Tracking.md §G: the user never stopped using Chrome, they stopped
        // interacting. One session, split into active and idle.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube")
            .AdvanceMinutes(42)   // last input here
            .AdvanceMinutes(5)    // threshold crossed; poll notices
            .GoIdle(secondsAgo: 300)
            .AdvanceMinutes(13)
            .Switch("code.exe");

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(60 * 60, chrome.DurationSeconds);
        Assert.Equal(42 * 60, chrome.ActiveSeconds);
        Assert.Equal(18 * 60, chrome.IdleSeconds);
    }

    [Fact]
    public void Idle_start_is_backdated_to_the_last_input()
    {
        // Without this, every idle period would fabricate a full threshold of
        // active time the user never spent (DOCS/data and database.md §28).
        var h = new EngineHarness().Start()
            .Switch("chrome.exe")
            .AdvanceMinutes(42)
            .AdvanceMinutes(5)
            .GoIdle(secondsAgo: 300);

        var idleStarted = h.Sink.Events.Single(e => e.Type == EventType.IDLE_STARTED);
        var lastInputAt = EngineHarness.DayStartUtcMs + (long)TimeSpan.FromMinutes(42).TotalMilliseconds;

        Assert.Equal(lastInputAt, idleStarted.AtUtcMs);
        Assert.NotEqual(h.Now, idleStarted.AtUtcMs);
    }

    [Fact]
    public void Returning_from_idle_resumes_active_time()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe")
            .AdvanceMinutes(30).AdvanceMinutes(5).GoIdle(secondsAgo: 300)
            .AdvanceMinutes(10).Return()
            .AdvanceMinutes(20)
            .Switch("code.exe");

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(65 * 60, chrome.DurationSeconds);
        Assert.Equal(50 * 60, chrome.ActiveSeconds); // 30 before + 20 after
        Assert.Equal(15 * 60, chrome.IdleSeconds);
        Assert.Equal(TrackingState.ACTIVE, h.Engine.State);
    }

    [Fact]
    public void Idle_time_belongs_to_the_app_that_was_in_front_when_it_began()
    {
        // DOCS/Tracking.md §H.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe")
            .AdvanceMinutes(32).AdvanceMinutes(5).GoIdle(secondsAgo: 300)
            .Return()
            .Switch("code.exe")
            .AdvanceMinutes(10);

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(32 * 60, chrome.ActiveSeconds);
        Assert.Equal(5 * 60, chrome.IdleSeconds);

        Assert.Equal(0, h.Sink.SessionFor("code.exe").IdleSeconds);
    }

    [Fact]
    public void A_session_opened_while_the_user_is_still_away_starts_idle()
    {
        // An application can raise itself with no user input. Crediting that as
        // use would be fabrication.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe")
            .AdvanceMinutes(10).GoIdle(secondsAgo: 300)
            .AdvanceMinutes(10)
            .Switch("updater.exe")     // raised itself; user still away
            .AdvanceMinutes(10)
            .Return()
            .Switch("code.exe");

        var updater = h.Sink.SessionFor("updater.exe");
        Assert.Equal(0, updater.ActiveSeconds);
        Assert.Equal(10 * 60, updater.IdleSeconds);
    }

    [Fact]
    public void Idle_reported_from_before_the_session_started_never_produces_negative_time()
    {
        var h = new EngineHarness().Start().Switch("chrome.exe");

        // Last input was long before this session began.
        h.AdvanceMinutes(1).GoIdle(secondsAgo: 3600);
        h.AdvanceMinutes(10).Switch("code.exe");

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.True(chrome.ActiveSeconds >= 0);
        Assert.True(chrome.IdleSeconds >= 0);
        Assert.Equal(chrome.DurationSeconds, chrome.ActiveSeconds + chrome.IdleSeconds);
    }

    // -- lock, sleep, shutdown ---------------------------------------------

    [Fact]
    public void Lock_closes_the_session_and_records_nothing_while_locked()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(42)
            .Lock();

        Assert.Equal(EndReason.SYSTEM_LOCK, h.Sink.SessionFor("chrome.exe").Reason);
        Assert.Equal(TrackingState.LOCKED, h.Engine.State);

        var sessionsWhileLocked = h.Sink.Sessions.Count;
        h.AdvanceMinutes(20).Switch("code.exe").GoIdle().AdvanceMinutes(10).Return();

        Assert.Equal(sessionsWhileLocked, h.Sink.Sessions.Count);
    }

    [Fact]
    public void Unlock_starts_a_session_for_whatever_is_in_front_now()
    {
        // DOCS/Tracking.md §I: we do not assume the previous app is still active.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(42)
            .Lock().AdvanceMinutes(49);

        h.PlaceInForeground("code.exe", "project-x").Unlock();

        Assert.Equal(2, h.Sink.Sessions.Count);
        var resumed = h.Sink.Sessions[^1];
        Assert.Equal("code.exe", resumed.Executable);
        Assert.Equal(h.Now, resumed.StartedAt);
    }

    [Fact]
    public void Sleep_does_not_record_the_time_the_machine_was_asleep()
    {
        // DOCS/Tracking.md §J: 22:00 -> sleep 22:30 -> wake 07:00 must never
        // read as a nine-hour Chrome session.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(30)
            .Sleep()
            .Advance(TimeSpan.FromHours(8.5));

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(EndReason.SYSTEM_SLEEP, chrome.Reason);
        Assert.Equal(30 * 60, chrome.DurationSeconds);

        h.PlaceInForeground("chrome.exe").Wake();

        var afterWake = h.Sink.Sessions[^1];
        Assert.Equal(h.Now, afterWake.StartedAt);
        Assert.True(afterWake.IsOpen);
    }

    [Fact]
    public void Shutdown_closes_the_session_with_an_honest_reason()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(31)
            .ShutDown();

        Assert.Equal(EndReason.SYSTEM_SHUTDOWN, h.Sink.SessionFor("chrome.exe").Reason);
        Assert.Equal(31 * 60, h.Sink.SessionFor("chrome.exe").ActiveSeconds);
    }

    // -- pause --------------------------------------------------------------

    [Fact]
    public void Pause_stops_all_recording()
    {
        // DOCS/Privacy.md §10: pause must be real, not cosmetic.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(15)
            .Pause();

        Assert.Equal(EndReason.TRACKING_PAUSED, h.Sink.SessionFor("chrome.exe").Reason);
        Assert.Equal(TrackingState.PAUSED, h.Engine.State);

        var before = (h.Sink.Sessions.Count, h.Sink.WindowSessions.Count);
        h.AdvanceMinutes(30).Switch("1password.exe", "Vault").AdvanceMinutes(10).ChangeTitle("Bank");

        Assert.Equal(before, (h.Sink.Sessions.Count, h.Sink.WindowSessions.Count));
        Assert.DoesNotContain(h.Sink.WindowSessions, w => w.Title is "Vault" or "Bank");
    }

    [Fact]
    public void Resume_starts_recording_the_current_foreground_app()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(15)
            .Pause().AdvanceMinutes(30)
            .PlaceInForeground("code.exe", "project-x")
            .Resume();

        Assert.Equal(2, h.Sink.Sessions.Count);
        Assert.Equal("code.exe", h.Sink.Sessions[^1].Executable);
        Assert.Equal(TrackingState.ACTIVE, h.Engine.State);
    }

    [Fact]
    public void A_tracker_started_paused_records_nothing()
    {
        // DOCS/Privacy.md §27: paused survives a reboot, or the user cannot
        // trust the control.
        var h = new EngineHarness();
        h.PlaceInForeground("chrome.exe", "YouTube").Start(paused: true);

        h.AdvanceMinutes(30).Switch("code.exe").AdvanceMinutes(30);

        Assert.Equal(TrackingState.PAUSED, h.Engine.State);
        Assert.Empty(h.Sink.Sessions);
        Assert.Empty(h.Sink.WindowSessions);
    }

    // -- privacy ------------------------------------------------------------

    [Fact]
    public void An_excluded_application_leaves_no_row_anywhere()
    {
        // DOCS/Privacy.md §7 and §29 — not merely no session: no window session,
        // and no event that could identify it either.
        var h = new EngineHarness().Start();
        h.Sink.Excluded.Add("1password.exe");

        h.Switch("chrome.exe", "YouTube").AdvanceMinutes(10)
            .Switch("1password.exe", "Personal Vault").AdvanceMinutes(5)
            .ChangeTitle("Bank login").AdvanceMinutes(5)
            .Switch("chrome.exe", "GitHub").AdvanceMinutes(10);

        Assert.DoesNotContain(h.Sink.Sessions, s => s.Executable == "1password.exe");
        Assert.DoesNotContain(h.Sink.WindowSessions,
            w => w.Title is "Personal Vault" or "Bank login");

        // Only Chrome's two sessions exist, and the excluded stretch is a gap.
        Assert.Equal(2, h.Sink.Sessions.Count);
        Assert.All(h.Sink.Sessions, s => Assert.Equal("chrome.exe", s.Executable));
    }

    [Fact]
    public void Excluding_the_app_in_use_stops_recording_it_immediately()
    {
        // DOCS/Privacy.md §6 — not at the next application switch.
        var h = new EngineHarness().Start()
            .Switch("1password.exe", "Vault").AdvanceMinutes(4)
            .Exclude("1password.exe");

        var session = h.Sink.SessionFor("1password.exe");
        Assert.False(session.IsOpen);
        Assert.Equal(EndReason.TRACKING_PAUSED, session.Reason);

        h.AdvanceMinutes(10).ChangeTitle("Bank login");
        Assert.DoesNotContain(h.Sink.WindowSessions, w => w.Title == "Bank login");
    }

    [Fact]
    public void Disabling_window_titles_keeps_sessions_but_records_no_window_history()
    {
        // DOCS/Privacy.md §28.
        var h = new EngineHarness();
        h.Sink.RecordWindowTitles = false;

        h.Start()
            .Switch("chrome.exe", "My Private Medical Records").AdvanceMinutes(20)
            .ChangeTitle("Bank Account - $12,492").AdvanceMinutes(25)
            .Switch("code.exe", "main.ts");

        Assert.Empty(h.Sink.WindowSessions);

        var chrome = h.Sink.SessionFor("chrome.exe");
        Assert.Equal(45 * 60, chrome.ActiveSeconds);
        Assert.Equal(EndReason.APP_SWITCH, chrome.Reason);
    }

    [Fact]
    public void Turning_window_titles_off_mid_session_closes_the_open_window_session()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(12)
            .SetWindowTitlesEnabled(false);

        var youtube = Assert.Single(h.Sink.WindowSessions);
        Assert.Equal(12 * 60, youtube.DurationSeconds);
        Assert.NotNull(youtube.EndedAt);

        h.AdvanceMinutes(10).ChangeTitle("GitHub");
        Assert.Single(h.Sink.WindowSessions);
    }

    // -- invariants ---------------------------------------------------------

    [Fact]
    public void Active_plus_idle_always_equals_the_session_duration()
    {
        // The guard against a session claiming more use than it existed for.
        var h = new EngineHarness().Start();

        h.Switch("chrome.exe", "YouTube").AdvanceMinutes(7)
            .ChangeTitle("GitHub").AdvanceSeconds(37)
            .GoIdle(secondsAgo: 300).AdvanceMinutes(11).Return()
            .AdvanceSeconds(4)
            .Switch("code.exe", "main.ts").AdvanceMinutes(3)
            .GoIdle(secondsAgo: 120).AdvanceSeconds(90).Return()
            .AdvanceMinutes(2)
            .Lock().AdvanceMinutes(15)
            .PlaceInForeground("chrome.exe", "Google").Unlock()
            .AdvanceMinutes(6)
            .ShutDown();

        Assert.NotEmpty(h.Sink.Sessions);
        Assert.All(h.Sink.Sessions, session =>
        {
            Assert.False(session.IsOpen);
            Assert.InRange(session.ActiveSeconds, 0, session.DurationSeconds);
            Assert.InRange(session.IdleSeconds, 0, session.DurationSeconds);
            Assert.Equal(session.DurationSeconds, session.ActiveSeconds + session.IdleSeconds);
        });
    }

    [Fact]
    public void Sessions_never_overlap()
    {
        var h = new EngineHarness().Start()
            .Switch("chrome.exe").AdvanceMinutes(20)
            .Switch("code.exe").AdvanceMinutes(15)
            .Switch("discord.exe").AdvanceMinutes(5)
            .Switch("chrome.exe").AdvanceMinutes(10)
            .ShutDown();

        var ordered = h.Sink.Sessions.OrderBy(s => s.StartedAt).ToList();
        for (var i = 1; i < ordered.Count; i++)
        {
            Assert.True(ordered[i - 1].EndedAt <= ordered[i].StartedAt);
        }
    }

    [Fact]
    public void Heartbeat_checkpoints_the_current_state()
    {
        // The anchor crash recovery closes an interrupted session against.
        var h = new EngineHarness().Start()
            .Switch("chrome.exe", "YouTube")
            .AdvanceMinutes(5).Beat();

        var checkpoint = h.Sink.Checkpoints[^1];
        Assert.Equal(h.Now, checkpoint.AtUtcMs);
        Assert.Equal(TrackingState.ACTIVE, checkpoint.State);
        Assert.Equal(h.Sink.SessionFor("chrome.exe").SessionId, checkpoint.CurrentSessionId);
        Assert.Equal("YouTube", checkpoint.CurrentWindowTitle);
    }

    // -- the acceptance scenario -------------------------------------------

    [Fact]
    public void The_MVP_success_test_from_the_documentation()
    {
        // DOCS/MVP.md §10, verbatim:
        //   09:00 Chrome, 09:20 VS Code, 10:00 Chrome, 10:30 walk away,
        //   10:40 return, 11:00 lock, 11:30 unlock.
        // Expected: Chrome 1h 10m, VS Code 40m.
        var h = new EngineHarness();
        h.AdvanceMinutes(60).Start();                      // 09:00
        h.Switch("chrome.exe", "YouTube");
        h.AdvanceMinutes(20).Switch("code.exe", "project-x");   // 09:20
        h.AdvanceMinutes(40).Switch("chrome.exe", "GitHub");    // 10:00

        h.AdvanceMinutes(30);                                   // 10:30 walks away
        h.AdvanceMinutes(5).GoIdle(secondsAgo: 300);            // detected at 10:35
        h.AdvanceMinutes(5).Return();                           // 10:40 returns

        h.AdvanceMinutes(20).Lock();                            // 11:00
        h.AdvanceMinutes(30);
        h.PlaceInForeground("chrome.exe", "GitHub").Unlock();   // 11:30

        var chromeActive = h.Sink.SessionsFor("chrome.exe").Sum(s => s.ActiveSeconds);
        var codeActive = h.Sink.SessionsFor("code.exe").Sum(s => s.ActiveSeconds);

        Assert.Equal(70 * 60, chromeActive);   // 20m + 50m active (10m of the hour was idle)
        Assert.Equal(40 * 60, codeActive);
        Assert.Equal(10 * 60, h.Sink.SessionsFor("chrome.exe").Sum(s => s.IdleSeconds));

        Assert.Contains(h.Sink.Events, e => e.Type == EventType.SYSTEM_LOCKED);
        Assert.Contains(h.Sink.Events, e => e.Type == EventType.SYSTEM_UNLOCKED);
    }
}
