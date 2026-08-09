using System.Diagnostics;
using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Queries;
using Xunit.Abstractions;

namespace Trace.Tracker.Tests;

/// <summary>
/// Milestone 9 — the questions that only have answers at scale, or after
/// something has gone wrong.
///
/// The timing assertions are deliberately loose: they exist to catch an
/// accidental table scan or an N+1, not to police milliseconds on a machine
/// that might be busy. The measured figures are written to the test output, so
/// a regression shows up as a number rather than as a feeling.
/// </summary>
public class HardeningTests(ITestOutputHelper output)
{
    /// <summary>
    /// Roughly three years of heavy use: 200 sessions a day, every day.
    /// Realistic upper bound rather than a typical one.
    /// </summary>
    private const int Days = 1000;
    private const int SessionsPerDay = 200;

    [Fact]
    public void The_read_models_stay_fast_on_a_multi_year_history()
    {
        using var trace = new PersistenceHarness();
        var seeded = Seed(trace, Days, SessionsPerDay);

        output.WriteLine($"seeded {seeded.Sessions:N0} sessions, {seeded.Windows:N0} windows");

        var activity = new ActivityQueries(trace.Database);
        var search = new SearchQueries(trace.Database);
        var now = seeded.LastDayEnd;
        var day = new DayRange(seeded.LastDayStart, seeded.LastDayEnd);

        var getDay = Time(() => activity.GetDay(day, 5, now));
        var timeline = Time(() => activity.GetTimeline(new TimelineQuery(day.FromUtcMs, day.ToUtcMs, 5), now));
        var applications = Time(() => activity.ListApplications(day, 5, now));
        var periods = new UsagePeriods(
            seeded.LastDayStart, seeded.LastDayStart - 86_400_000, seeded.LastDayStart - (6 * 86_400_000));
        var detail = Time(() => activity.GetApplicationDetail(1, day, periods, 5, now));
        var find = Time(() => search.Search(new SearchQueryParams("session", null, null, 100), now));

        output.WriteLine($"activity.getDay        {getDay.Ms,6} ms");
        output.WriteLine($"activity.getTimeline   {timeline.Ms,6} ms");
        output.WriteLine($"applications.list      {applications.Ms,6} ms");
        output.WriteLine($"applications.getDetail {detail.Ms,6} ms");
        output.WriteLine($"search.query           {find.Ms,6} ms");

        // A day query touching a day's worth of rows out of 200,000 must be
        // using the index on started_at. If any of these creep towards seconds,
        // something is scanning the table.
        Assert.InRange(getDay.Ms, 0, 1500);
        Assert.InRange(timeline.Ms, 0, 1500);
        Assert.InRange(applications.Ms, 0, 1500);
        Assert.InRange(detail.Ms, 0, 2500);

        // Search is the known weak point: LIKE '%…%' cannot use an index, so it
        // is a full scan of window_sessions by design (implementation plan
        // §13.13). This is the tripwire for when FTS5 becomes necessary.
        output.WriteLine(find.Ms > 800
            ? "search is slowing down — consider an FTS5 trigram index"
            : "search still comfortable");
        Assert.InRange(find.Ms, 0, 5000);
    }

    [Fact]
    public void A_day_query_does_not_get_slower_as_history_grows()
    {
        // The property that actually matters. Absolute timings vary by machine;
        // an indexed range query should not care how much history sits either
        // side of the range.
        using var trace = new PersistenceHarness();

        Seed(trace, days: 50, sessionsPerDay: SessionsPerDay);
        var activity = new ActivityQueries(trace.Database);
        var small = MeasureTypicalDay(trace, activity);

        Seed(trace, days: Days, sessionsPerDay: SessionsPerDay);
        var large = MeasureTypicalDay(trace, activity);

        output.WriteLine($"10,000 sessions: {small} ms");
        output.WriteLine($"{Days * SessionsPerDay:N0} sessions: {large} ms");

        // Twenty times the data. Allow generous slack for noise on a small
        // absolute measurement, but nothing resembling linear growth.
        Assert.True(
            large <= Math.Max(small * 4, 400),
            $"a day query went from {small} ms to {large} ms as history grew 20x — "
                + "that looks like a scan rather than an index lookup");
    }

    [Fact]
    public void A_corrupt_database_is_quarantined_rather_than_discarded()
    {
        // DOCS/data and database.md: the damaged file is the user's history, and
        // some of it may be recoverable by hand. Deleting it silently would be
        // the one unforgivable failure.
        var directory = Path.Combine(Path.GetTempPath(), "trace-corrupt", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var databasePath = Path.Combine(directory, "activity.db");

        try
        {
            using (var database = TraceDatabase.Open(databasePath, afterUncleanExit: false))
            {
                database.Write(connection =>
                {
                    using var command = connection.CreateCommand();
                    command.CommandText =
                        "INSERT INTO applications (name, executable, first_seen, last_seen) " +
                        "VALUES ('Chrome', 'chrome.exe', 1, 2);";
                    command.ExecuteNonQuery();
                });

                database.Checkpoint();
            }

            SqliteConnection.ClearAllPools();

            // Scribble over the header. This is what a half-written page after a
            // power cut looks like to SQLite.
            using (var file = File.Open(databasePath, FileMode.Open, FileAccess.Write))
            {
                file.Write(new byte[128]);
            }

            using var reopened = TraceDatabase.Open(databasePath, afterUncleanExit: true);

            // A working database, and the damaged one kept beside it.
            var count = reopened.Read(connection =>
            {
                using var command = connection.CreateCommand();
                command.CommandText = "SELECT COUNT(*) FROM applications;";
                return (long)command.ExecuteScalar()!;
            });

            Assert.Equal(0, count);

            var quarantined = Directory.GetFiles(directory, "activity.corrupt-*.db");
            Assert.NotEmpty(quarantined);
            output.WriteLine($"quarantined: {Path.GetFileName(quarantined[0])}");
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try
            {
                Directory.Delete(directory, recursive: true);
            }
            catch (IOException)
            {
            }
        }
    }

    [Fact]
    public void Thousands_of_rapid_switches_leave_the_accounting_consistent()
    {
        // The Alt-Tab storm, sustained. Every session must still satisfy
        // active + idle == duration, and none may overlap.
        using var trace = new PersistenceHarness();
        var engine = trace.NewEngine().Start();

        string[] applications = ["chrome.exe", "code.exe", "explorer.exe", "discord.exe"];

        for (var i = 0; i < 4000; i++)
        {
            engine.Switch(applications[i % applications.Length], $"window {i % 7}");
            engine.AdvanceSeconds(i % 5 == 0 ? 11 : 1);

            if (i % 400 == 0)
            {
                engine.GoIdle(secondsAgo: 300).AdvanceMinutes(3).Return();
            }

            if (i % 900 == 0)
            {
                engine.Lock().AdvanceMinutes(5);
                engine.PlaceInForeground("chrome.exe", "back").Unlock();
            }
        }

        engine.ShutDown();

        var sessions = trace.Query(
            "SELECT started_at, ended_at, active_seconds, idle_seconds FROM sessions ORDER BY started_at, id;",
            r => (Start: r.GetInt64(0), End: r.IsDBNull(1) ? (long?)null : r.GetInt64(1),
                  Active: r.GetInt32(2), Idle: r.GetInt32(3)));

        output.WriteLine($"{sessions.Count:N0} sessions from 4,000 switches");

        Assert.All(sessions, session =>
        {
            Assert.NotNull(session.End);
            var duration = (int)((session.End!.Value - session.Start) / 1000);

            Assert.True(session.Active >= 0 && session.Idle >= 0, "negative time recorded");
            Assert.Equal(duration, session.Active + session.Idle);
        });

        for (var i = 1; i < sessions.Count; i++)
        {
            Assert.True(
                sessions[i - 1].End <= sessions[i].Start,
                $"sessions overlap at index {i}");
        }
    }

    // -- helpers ------------------------------------------------------------

    private static (long Ms, T Value) Time<T>(Func<T> work)
    {
        var stopwatch = Stopwatch.StartNew();
        var value = work();
        stopwatch.Stop();

        return (stopwatch.ElapsedMilliseconds, value);
    }

    private static long MeasureTypicalDay(PersistenceHarness trace, ActivityQueries activity)
    {
        var bounds = trace.Query(
            "SELECT MIN(started_at), MAX(started_at) FROM sessions;",
            r => (Min: r.GetInt64(0), Max: r.GetInt64(1)))[0];

        // A day in the middle, so the query has history on both sides of it.
        var middle = bounds.Min + ((bounds.Max - bounds.Min) / 2);
        var dayStart = middle - (middle % 86_400_000);
        var range = new DayRange(dayStart, dayStart + 86_400_000);

        // Warm, then measure, so the first call's connection setup is not the
        // thing being timed.
        activity.GetDay(range, 5, bounds.Max);
        return Time(() => activity.GetDay(range, 5, bounds.Max)).Ms;
    }

    /// <summary>
    /// Bulk-seeds history directly, bypassing the engine: this is about query
    /// behaviour at scale, and driving 200,000 sessions through the state
    /// machine would measure the wrong thing.
    /// </summary>
    private static (int Sessions, int Windows, long LastDayStart, long LastDayEnd) Seed(
        PersistenceHarness trace, int days, int sessionsPerDay)
    {
        var start = new DateTimeOffset(2023, 1, 1, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
        var sessions = 0;
        var windows = 0;

        trace.Database.Write(connection =>
        {
            using var application = connection.CreateCommand();
            application.CommandText =
                "INSERT OR IGNORE INTO applications (id, name, executable, first_seen, last_seen) " +
                "VALUES ($id, $name, $executable, $at, $at);";
            application.Parameters.Add("$id", SqliteType.Integer);
            application.Parameters.Add("$name", SqliteType.Text);
            application.Parameters.Add("$executable", SqliteType.Text);
            application.Parameters.Add("$at", SqliteType.Integer);

            for (var a = 1; a <= 12; a++)
            {
                application.Parameters["$id"].Value = a;
                application.Parameters["$name"].Value = $"Application {a}";
                application.Parameters["$executable"].Value = $"app{a}.exe";
                application.Parameters["$at"].Value = start;
                application.ExecuteNonQuery();
            }

            using var session = connection.CreateCommand();
            session.CommandText =
                "INSERT INTO sessions (id, application_id, started_at, ended_at, active_seconds, " +
                "idle_seconds, end_reason) VALUES ($id, $app, $from, $to, $active, 0, 'APP_SWITCH');";
            session.Parameters.Add("$id", SqliteType.Integer);
            session.Parameters.Add("$app", SqliteType.Integer);
            session.Parameters.Add("$from", SqliteType.Integer);
            session.Parameters.Add("$to", SqliteType.Integer);
            session.Parameters.Add("$active", SqliteType.Integer);

            using var window = connection.CreateCommand();
            window.CommandText =
                "INSERT INTO window_sessions (session_id, title, started_at, ended_at, duration_seconds) " +
                "VALUES ($session, $title, $from, $to, $duration);";
            window.Parameters.Add("$session", SqliteType.Integer);
            window.Parameters.Add("$title", SqliteType.Text);
            window.Parameters.Add("$from", SqliteType.Integer);
            window.Parameters.Add("$to", SqliteType.Integer);
            window.Parameters.Add("$duration", SqliteType.Integer);

            var id = trace.CountRows("sessions") + 1;

            for (var day = 0; day < days; day++)
            {
                var dayStart = start + ((long)day * 86_400_000);

                for (var index = 0; index < sessionsPerDay; index++)
                {
                    // Packed into waking hours, so a day's rows are dense the
                    // way real ones are.
                    var from = dayStart + 28_800_000 + ((long)index * 200_000);
                    var to = from + 120_000;

                    session.Parameters["$id"].Value = id;
                    session.Parameters["$app"].Value = (index % 12) + 1;
                    session.Parameters["$from"].Value = from;
                    session.Parameters["$to"].Value = to;
                    session.Parameters["$active"].Value = 120;
                    session.ExecuteNonQuery();

                    window.Parameters["$session"].Value = id;
                    window.Parameters["$title"].Value = $"Document {index} — session {id}";
                    window.Parameters["$from"].Value = from;
                    window.Parameters["$to"].Value = to;
                    window.Parameters["$duration"].Value = 120;
                    window.ExecuteNonQuery();

                    id++;
                    sessions++;
                    windows++;
                }
            }
        });

        var lastDayStart = start + ((long)(days - 1) * 86_400_000);
        return (sessions, windows, lastDayStart, lastDayStart + 86_400_000);
    }
}
