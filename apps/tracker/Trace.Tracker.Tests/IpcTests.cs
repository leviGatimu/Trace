using System.Text.Json;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Engine;
using Trace.Tracker.Ipc;

namespace Trace.Tracker.Tests;

/// <summary>
/// The IPC contract, exercised through <see cref="RequestRouter"/>.
///
/// The router takes a string and returns a string, so these run without a pipe,
/// a client, or a running tracker — the transport is tested by
/// <c>--probe</c> against a live process, and the contract is tested here.
/// </summary>
public class IpcTests
{
    // -- surface ------------------------------------------------------------

    [Fact]
    public void The_router_implements_exactly_the_declared_contract()
    {
        // The guard against the two halves of the contract drifting apart: a
        // method declared and not implemented, or implemented and never
        // declared, fails here rather than at runtime in front of a user.
        using var trace = new PersistenceHarness();
        var router = NewRouter(trace);

        Assert.Equal(
            IpcMethods.All.Order(StringComparer.Ordinal),
            router.Methods.Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Hello_reports_the_contract_and_schema_versions()
    {
        using var trace = new PersistenceHarness();
        var result = Ok<HelloResult>(NewRouter(trace), IpcMethods.SystemHello);

        Assert.Equal(ContractInfo.Version, result.ContractVersion);
        Assert.Equal(TraceDatabase.CurrentSchemaVersion, result.SchemaVersion);
        Assert.NotEmpty(result.TrackerVersion);
    }

    // -- error handling -----------------------------------------------------

    [Fact]
    public void An_unknown_method_fails_cleanly()
    {
        using var trace = new PersistenceHarness();
        var error = Error(NewRouter(trace), "nonsense.method");

        Assert.Equal(IpcErrorCode.E_UNKNOWN_METHOD, error.Code);
    }

    [Fact]
    public void Malformed_json_does_not_take_the_router_down()
    {
        using var trace = new PersistenceHarness();
        var router = NewRouter(trace);

        var response = router.Handle("{ this is not json");
        Assert.Contains("\"ok\":false", response, StringComparison.Ordinal);

        // Still serving afterwards.
        Ok<HelloResult>(router, IpcMethods.SystemHello);
    }

    [Fact]
    public void An_inverted_range_is_rejected()
    {
        using var trace = new PersistenceHarness();
        var error = Error(NewRouter(trace), IpcMethods.ActivityGetDay,
            new { fromUtcMs = 2_000_000L, toUtcMs = 1_000_000L });

        Assert.Equal(IpcErrorCode.E_RANGE, error.Code);
    }

    [Fact]
    public void A_range_longer_than_a_year_is_rejected()
    {
        // A cheap guard against a caller bug asking the tracker to materialise
        // all of history into one response.
        using var trace = new PersistenceHarness();
        var error = Error(NewRouter(trace), IpcMethods.ActivityGetDay,
            new { fromUtcMs = 0L, toUtcMs = (long)TimeSpan.FromDays(400).TotalMilliseconds });

        Assert.Equal(IpcErrorCode.E_RANGE, error.Code);
    }

    [Fact]
    public void Deleting_everything_requires_the_literal_confirmation()
    {
        using var trace = new PersistenceHarness();
        trace.NewEngine().Start().Switch("chrome.exe", "YouTube").AdvanceMinutes(20).ShutDown();

        var router = NewRouter(trace);

        Assert.Equal(IpcErrorCode.E_BAD_PARAMS,
            Error(router, IpcMethods.DataDeleteAll, new { confirm = "yes" }).Code);
        Assert.Equal(1, trace.CountRows("sessions"));

        var deleted = Ok<DeleteResult>(router, IpcMethods.DataDeleteAll,
            new { confirm = ContractInfo.DeleteAllConfirmation });

        Assert.Equal(1, deleted.SessionsDeleted);
        Assert.Equal(0, trace.CountRows("sessions"));
        Assert.Equal(0, trace.CountRows("applications"));
    }

    [Theory]
    [InlineData("relative.json")]
    [InlineData("")]
    public void An_export_path_that_is_not_absolute_is_rejected(string path)
    {
        using var trace = new PersistenceHarness();
        var error = Error(NewRouter(trace), IpcMethods.DataExport, new { absolutePath = path });

        Assert.Equal(IpcErrorCode.E_PATH, error.Code);
    }

    [Fact]
    public void Trace_refuses_to_export_into_its_own_data_folder()
    {
        // Not a privilege boundary — both processes are the same user — but a
        // caller should not be able to talk Trace into overwriting its database
        // with an export of it.
        using var trace = new PersistenceHarness();
        var inside = Path.Combine(TracePaths.DataDirectory, "export.json");

        Assert.Equal(IpcErrorCode.E_PATH,
            Error(NewRouter(trace), IpcMethods.DataExport, new { absolutePath = inside }).Code);
    }

    // -- read models --------------------------------------------------------

    [Fact]
    public void The_day_view_reports_totals_the_ui_only_has_to_format()
    {
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine();

        engine.Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(30)
            .Switch("code.exe", "main.ts").AdvanceMinutes(20)
            .Switch("chrome.exe", "GitHub").AdvanceMinutes(10)
            .ShutDown();

        var day = Ok<DayActivity>(NewRouter(trace), IpcMethods.ActivityGetDay, WholeDay(engine));

        Assert.Equal(60 * 60, day.TotalActiveSeconds);
        Assert.Equal(2, day.ApplicationCount);

        var chrome = day.Applications.Single(a => a.Executable == "chrome.exe");
        Assert.Equal(40 * 60, chrome.ActiveSeconds);
        Assert.Equal(2, chrome.SessionCount);

        // Ordered by usage, so the interface does not have to sort.
        Assert.Equal("chrome.exe", day.Applications[0].Executable);
    }

    [Fact]
    public void Short_sessions_are_merged_out_of_every_read_model()
    {
        // The Alt-Tab problem, measured live at Milestone 3: eight sessions in
        // nine seconds, most of them zero-length. Left alone, File Explorer
        // would rank among the most-used applications on the machine on session
        // count alone.
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine().Start();

        engine.Switch("chrome.exe", "YouTube").AdvanceMinutes(30);

        for (var i = 0; i < 8; i++)
        {
            engine.Switch("explorer.exe", "Task Switching").AdvanceSeconds(1);
            engine.Switch("chrome.exe", "YouTube").AdvanceSeconds(1);
        }

        engine.AdvanceMinutes(30).ShutDown();

        // The raw history keeps every transition, as DOCS/Tracking.md §F requires.
        Assert.True(trace.CountRows("sessions") >= 16);

        var router = NewRouter(trace);
        var day = Ok<DayActivity>(router, IpcMethods.ActivityGetDay, WholeDay(engine));

        // The read models show one continuous stretch of Chrome and no Explorer.
        Assert.Single(day.Applications);
        Assert.Equal("chrome.exe", day.Applications[0].Executable);
        Assert.Equal(1, day.Applications[0].SessionCount);
        Assert.Equal(1, day.SessionCount);

        var timeline = Ok<List<JsonElement>>(router, IpcMethods.ActivityGetTimeline, WholeDay(engine));
        var sessionRows = timeline.Where(e => e.GetProperty("kind").GetString() == "session").ToList();

        Assert.Single(sessionRows);
        Assert.True(sessionRows[0].GetProperty("merged").GetBoolean());
    }

    [Fact]
    public void Sessions_separated_by_a_gap_are_not_merged_into_one_row()
    {
        // Caught by running the real tracker: two stretches of Illustrator from
        // two different runs of Trace, hours apart, appeared as a single row
        // spanning time nothing was recorded for.
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine().Start();

        engine.Switch("illustrator.exe", "logo.ai").AdvanceMinutes(20).ShutDown();

        // Trace is not running for the next hour.
        engine.Advance(TimeSpan.FromHours(1));

        engine.PlaceInForeground("illustrator.exe", "logo.ai").Resume();
        engine.AdvanceMinutes(20).ShutDown();

        var timeline = Ok<List<JsonElement>>(
            NewRouter(trace), IpcMethods.ActivityGetTimeline, WholeDay(engine));

        var sessions = timeline.Where(e => e.GetProperty("kind").GetString() == "session").ToList();

        Assert.Equal(2, sessions.Count);
        Assert.All(sessions, s => Assert.False(s.GetProperty("merged").GetBoolean()));

        // Each row spans only the time it actually covers.
        Assert.All(sessions, s => Assert.Equal(
            20 * 60,
            (s.GetProperty("endedAt").GetInt64() - s.GetProperty("startedAt").GetInt64()) / 1000));
    }

    [Fact]
    public void The_timeline_carries_system_intervals_as_well_as_sessions()
    {
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine().Start();

        engine.Switch("chrome.exe", "YouTube").AdvanceMinutes(30);
        engine.Lock().AdvanceMinutes(20);
        engine.PlaceInForeground("code.exe", "main.ts").Unlock().AdvanceMinutes(15);
        engine.ShutDown();

        var timeline = Ok<List<JsonElement>>(
            NewRouter(trace), IpcMethods.ActivityGetTimeline, WholeDay(engine));

        var locked = timeline.Single(e => e.GetProperty("kind").GetString() == "system");
        Assert.Equal("LOCKED", locked.GetProperty("interval").GetString());
        Assert.Equal(20 * 60,
            (locked.GetProperty("endedAt").GetInt64() - locked.GetProperty("startedAt").GetInt64())
            / 1000);

        // And the polymorphic shape survives serialisation with its fields
        // intact, rather than collapsing to a bare discriminator.
        var session = timeline.First(e => e.GetProperty("kind").GetString() == "session");
        Assert.Equal("chrome.exe", session.GetProperty("executable").GetString());
    }

    [Fact]
    public void The_calendar_totals_each_day_it_is_asked_for()
    {
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine();

        engine.Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(30)
            .Switch("code.exe", "main.ts").AdvanceMinutes(20)
            .ShutDown();

        // Three days, with the scripted activity in the middle one. Boundaries
        // are supplied by the caller because only it knows the local time zone.
        var days = new[]
        {
            EngineHarness.DayStartUtcMs - 86_400_000,
            EngineHarness.DayStartUtcMs,
            EngineHarness.DayStartUtcMs + 86_400_000,
        };

        var calendar = Ok<List<CalendarDay>>(
            NewRouter(trace), IpcMethods.ActivityGetCalendar, new { dayStartsUtcMs = days });

        Assert.Equal(3, calendar.Count);
        Assert.Equal(days, calendar.Select(d => d.StartUtcMs));

        Assert.Equal(0, calendar[0].ActiveSeconds);
        Assert.Equal(50 * 60, calendar[1].ActiveSeconds);
        Assert.Equal(2, calendar[1].SessionCount);
        Assert.Equal(2, calendar[1].ApplicationCount);
        Assert.Equal(0, calendar[2].ActiveSeconds);
    }

    [Fact]
    public void A_session_running_past_midnight_counts_once_on_the_day_it_began()
    {
        // Splitting it at the boundary would mean assuming the active time was
        // spread evenly across the session, which is detail nothing recorded.
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine();

        var midnight = EngineHarness.DayStartUtcMs + (16 * 3_600_000);

        engine.Start().Switch("code.exe", "main.ts").Advance(TimeSpan.FromHours(17)).ShutDown();

        var calendar = Ok<List<CalendarDay>>(
            NewRouter(trace),
            IpcMethods.ActivityGetCalendar,
            new { dayStartsUtcMs = new[] { midnight - 86_400_000, midnight } });

        Assert.Equal(17 * 3600, calendar[0].ActiveSeconds);
        Assert.Equal(0, calendar[1].ActiveSeconds);
        Assert.Equal(0, calendar[1].SessionCount);
    }

    [Fact]
    public void A_calendar_request_with_no_days_is_rejected()
    {
        using var trace = new PersistenceHarness();

        Assert.Equal(
            IpcErrorCode.E_BAD_PARAMS,
            Error(NewRouter(trace), IpcMethods.ActivityGetCalendar,
                new { dayStartsUtcMs = Array.Empty<long>() }).Code);
    }

    [Fact]
    public void A_calendar_request_longer_than_the_contract_allows_is_rejected()
    {
        using var trace = new PersistenceHarness();

        var tooMany = Enumerable
            .Range(0, CalendarQuery.MaxDays + 1)
            .Select(i => EngineHarness.DayStartUtcMs + ((long)i * 86_400_000))
            .ToArray();

        Assert.Equal(
            IpcErrorCode.E_RANGE,
            Error(NewRouter(trace), IpcMethods.ActivityGetCalendar,
                new { dayStartsUtcMs = tooMany }).Code);
    }

    [Fact]
    public void Search_finds_window_titles_and_application_names()
    {
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("chrome.exe", "GitHub - trace/tracker").AdvanceMinutes(30)
            .Switch("code.exe", "main.ts").AdvanceMinutes(20)
            .ShutDown();

        var router = NewRouter(trace);

        var byTitle = Ok<List<SearchResult>>(router, IpcMethods.SearchQuery, new { text = "github" });
        Assert.Contains(byTitle, r => r.MatchedTitle == "GitHub - trace/tracker");

        var byApplication = Ok<List<SearchResult>>(router, IpcMethods.SearchQuery, new { text = "code" });
        Assert.Contains(byApplication, r => r.Executable == "code.exe");
    }

    [Fact]
    public void Search_treats_wildcards_as_literal_text()
    {
        // Window titles are full of % and _. Without escaping, searching for one
        // would silently match the entire history.
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("illustrator.exe", "Untitled-2 @ 100 % (RGB/Preview)").AdvanceMinutes(20)
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(20)
            .ShutDown();

        var results = Ok<List<SearchResult>>(
            NewRouter(trace), IpcMethods.SearchQuery, new { text = "100 %" });

        Assert.Single(results);
        Assert.Equal("illustrator.exe", results[0].Executable);
    }

    [Fact]
    public void Search_ignores_queries_too_short_to_be_meaningful()
    {
        using var trace = new PersistenceHarness();
        trace.NewEngine().Start().Switch("chrome.exe", "YouTube").AdvanceMinutes(20).ShutDown();

        Assert.Empty(Ok<List<SearchResult>>(
            NewRouter(trace), IpcMethods.SearchQuery, new { text = "e" }));
    }

    // -- settings and control ----------------------------------------------

    [Fact]
    public void Updating_one_setting_leaves_the_others_alone()
    {
        using var trace = new PersistenceHarness();
        var router = NewRouter(trace);

        var updated = Ok<Contracts.Settings>(
            router, IpcMethods.SettingsUpdate, new { recordWindowTitles = false });

        Assert.False(updated.RecordWindowTitles);
        Assert.True(updated.TrackingEnabled);
        Assert.Equal(RetentionPolicy.FOREVER, updated.Retention);
        Assert.Equal(300, updated.IdleThresholdSeconds);
    }

    [Fact]
    public void Pause_takes_effect_before_the_engine_even_sees_the_signal()
    {
        // The setting is written first, so the gate refuses new records from the
        // instant the user clicks rather than from whenever the queue drains.
        using var trace = new PersistenceHarness();
        var router = NewRouter(trace);

        var status = Ok<TrackerStatus>(router, IpcMethods.TrackingPause);

        Assert.False(status.TrackingEnabled);
        Assert.False(trace.Settings.Current.TrackingEnabled);

        Assert.True(Ok<TrackerStatus>(router, IpcMethods.TrackingResume).TrackingEnabled);
    }

    [Fact]
    public void Export_writes_a_file_that_round_trips()
    {
        using var trace = new PersistenceHarness();

        trace.NewEngine().Start()
            .Switch("chrome.exe", "YouTube").AdvanceMinutes(30)
            .ShutDown();

        var destination = Path.Combine(Path.GetTempPath(), $"trace-export-{Guid.NewGuid():N}.json");

        try
        {
            var result = Ok<ExportResult>(
                NewRouter(trace), IpcMethods.DataExport, new { absolutePath = destination });

            Assert.True(result.BytesWritten > 0);
            Assert.Equal(1, result.SessionsExported);

            using var document = JsonDocument.Parse(File.ReadAllText(destination));
            Assert.Equal("Trace", document.RootElement.GetProperty("product").GetString());
            Assert.Equal(1, document.RootElement.GetProperty("sessions").GetArrayLength());
            Assert.Equal(
                "YouTube",
                document.RootElement.GetProperty("windowSessions")[0].GetProperty("title").GetString());
        }
        finally
        {
            File.Delete(destination);
        }
    }

    // -- helpers ------------------------------------------------------------

    private static RequestRouter NewRouter(PersistenceHarness trace)
    {
        var clock = SystemClock.Instance;

        return new RequestRouter(new TrackerServices(
            new SessionEngine(trace.Gate, new ScriptedScreen()),
            trace.Gate,
            trace.Settings,
            new ActivityQueries(trace.Database),
            new SearchQueries(trace.Database),
            new DataOperations(trace.Database),
            clock,
            _ => { },
            () => "0.1.0-test",
            () => TraceDatabase.CurrentSchemaVersion,
            () => clock.UtcNowMs));
    }

    /// <summary>A range covering the scripted day, computed the way a client would.</summary>
    private static object WholeDay(EngineHarness engine) => new
    {
        fromUtcMs = EngineHarness.DayStartUtcMs - 3_600_000,
        toUtcMs = engine.Now + 3_600_000,
    };

    private static T Ok<T>(RequestRouter router, string method, object? parameters = null)
    {
        var response = Call(router, method, parameters);

        Assert.True(
            response.GetProperty("ok").GetBoolean(),
            $"{method} failed: {response}");

        return response.GetProperty("result").Deserialize<T>(ContractJson.Options)!;
    }

    private static IpcError Error(RequestRouter router, string method, object? parameters = null)
    {
        var response = Call(router, method, parameters);

        Assert.False(response.GetProperty("ok").GetBoolean(), $"{method} unexpectedly succeeded.");
        return response.GetProperty("error").Deserialize<IpcError>(ContractJson.Options)!;
    }

    private static JsonElement Call(RequestRouter router, string method, object? parameters)
    {
        var request = JsonSerializer.Serialize(
            new { id = "1", method, @params = parameters }, ContractJson.Options);

        return JsonDocument.Parse(router.Handle(request)).RootElement.Clone();
    }
}
