using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Engine;
using Trace.Tracker.Identity;

namespace Trace.Tracker.Tests;

/// <summary>
/// Application profiles: several observed executables, one application.
///
/// The case that motivated them is real. WhatsApp runs as WhatsApp.Root.exe and
/// launches WhatsApp.exe, and searching for either has to land on one WhatsApp,
/// with both executables still inspectable as recorded.
/// </summary>
public class ProfileTests
{
    private const string PackageFolder =
        @"C:\Program Files\WindowsApps\5319275A.WhatsAppDesktop_2.2645.101.0_x64__cv1g1gvanyjgm\";

    private const long Second = 1_000;
    private const long Day = 86_400_000;

    private static readonly DayRange AllTime = new(0, Day);

    private static ApplicationIdentityResolver Resolver() =>
        new(ApplicationRegistry.Default, new NoSources());

    private static TrackedApplication WhatsApp(string executable, uint pid, string? path = null) =>
        new(pid, executable, executable, path ?? PackageFolder + executable, IdentitySource: IdentitySource.VersionInfo);

    /// <summary>Records one foreground span and closes it.</summary>
    private static void Span(PersistenceHarness trace, TrackedApplication application, long start, long seconds)
    {
        var opened = trace.Gate.OpenSession(application, start)!.Value;
        trace.Gate.CloseSession(opened.SessionId, start + seconds * Second, (int)seconds, 0, EndReason.APP_SWITCH);
    }

    private static PersistenceHarness WhatsAppHistory()
    {
        var trace = new PersistenceHarness();

        // Main window, a 2-second helper in front, back to the main window,
        // then something else entirely.
        Span(trace, WhatsApp("whatsapp.root.exe", 100), 10 * Second, 60);
        Span(trace, WhatsApp("whatsapp.exe", 200), 70 * Second, 2);
        Span(trace, WhatsApp("whatsapp.root.exe", 100), 72 * Second, 60);
        Span(trace, new TrackedApplication(300, "notepad.exe", "Notepad", @"C:\Windows\notepad.exe"), 132 * Second, 30);

        IdentityBackfill.Run(trace.Database, Resolver());
        return trace;
    }

    [Fact]
    public void Both_WhatsApp_executables_are_one_application()
    {
        using var trace = WhatsAppHistory();

        var applications = new ActivityQueries(trace.Database).ListApplications(AllTime, 0, Day);

        var whatsApp = Assert.Single(applications, a => a.Name == "WhatsApp");
        Assert.Equal(122, whatsApp.ActiveSeconds);
        Assert.DoesNotContain(applications, a => a.Name.StartsWith("WhatsApp.", StringComparison.Ordinal));
    }

    [Fact]
    public void A_helper_in_front_for_two_seconds_does_not_split_the_visit()
    {
        using var trace = WhatsAppHistory();

        var whatsApp = new ActivityQueries(trace.Database).ListApplications(AllTime, 0, Day)
            .Single(a => a.Name == "WhatsApp");

        // Three stored spans, one visit: the helper is evidence, not a session.
        Assert.Equal(1, whatsApp.SessionCount);
        Assert.Equal(3L, trace.CountRows("sessions") - 1);
    }

    [Theory]
    [InlineData("WhatsApp")]
    [InlineData("WhatsApp.Root")]
    [InlineData("whatsapp.exe")]
    public void Searching_any_alias_finds_the_one_profile(string text)
    {
        using var trace = WhatsAppHistory();
        var profileId = new ActivityQueries(trace.Database).ListApplications(AllTime, 0, Day)
            .Single(a => a.Name == "WhatsApp").ApplicationId;

        var results = new SearchQueries(trace.Database).Search(new SearchQueryParams(text, null, null, null), Day);

        Assert.NotEmpty(results);
        Assert.All(results, r => Assert.Equal((profileId, "WhatsApp"), (r.ApplicationId, r.ApplicationName)));
    }

    [Fact]
    public void The_profile_lists_every_executable_and_how_it_was_linked()
    {
        using var trace = WhatsAppHistory();
        var activity = new ActivityQueries(trace.Database);
        var profileId = activity.ListApplications(AllTime, 0, Day).Single(a => a.Name == "WhatsApp").ApplicationId;

        var detail = activity.GetApplicationDetail(profileId, AllTime, new UsagePeriods(0, 0, 0), 0, Day)!;

        Assert.Equal("Communication", detail.Category);
        Assert.Equal(
            [("whatsapp.exe", "package", 1), ("whatsapp.root.exe", "package", 2)],
            detail.Aliases.Select(a => (a.Executable, a.Link, a.SessionCount)).OrderBy(a => a.Executable));
        Assert.Equal(122, detail.Usage.AllTimeActiveSeconds);
    }

    [Fact]
    public void A_matching_filename_outside_the_package_is_linked_but_marked_inferred()
    {
        using var trace = new PersistenceHarness();
        Span(trace, WhatsApp("whatsapp.exe", 1, @"C:\Users\someone\Downloads\whatsapp.exe"), 0, 5);
        IdentityBackfill.Run(trace.Database, Resolver());

        Assert.Equal(
            ["executable-name"],
            trace.Query("SELECT profile_link FROM applications;", r => r.GetString(0)));
    }

    [Fact]
    public void Grouping_changes_no_observed_record()
    {
        using var trace = new PersistenceHarness();
        Span(trace, WhatsApp("whatsapp.root.exe", 100), 10 * Second, 60);
        Span(trace, WhatsApp("whatsapp.exe", 200), 70 * Second, 2);
        const string observed = "SELECT id, application_id, started_at, ended_at, process_id FROM sessions ORDER BY id;";
        static (long, long, long, long, long) Read(Microsoft.Data.Sqlite.SqliteDataReader r) =>
            (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2), r.GetInt64(3), r.GetInt64(4));
        var before = trace.Query(observed, Read);
        var executablesBefore = trace.Query("SELECT id, executable FROM applications ORDER BY id;", r => (r.GetInt64(0), r.GetString(1)));

        IdentityBackfill.Run(trace.Database, Resolver());

        Assert.Equal(before, trace.Query(observed, Read));
        Assert.Equal(executablesBefore, trace.Query("SELECT id, executable FROM applications ORDER BY id;", r => (r.GetInt64(0), r.GetString(1))));
        Assert.Equal(1, trace.CountRows("profiles"));
    }

    [Fact]
    public void The_live_activity_reports_the_profile_not_the_executable()
    {
        using var trace = WhatsAppHistory();
        var activity = new ActivityQueries(trace.Database);
        var executableId = trace.Query("SELECT id FROM applications WHERE executable = 'whatsapp.exe';", r => r.GetInt64(0)).Single();

        var profile = activity.FindProfile(executableId);

        Assert.Equal("WhatsApp", profile?.Name);
        Assert.Equal(activity.ListApplications(AllTime, 0, Day).Single(a => a.Name == "WhatsApp").ApplicationId, profile?.Id);
    }

    [Fact]
    public void Deleting_an_application_deletes_every_executable_in_it()
    {
        using var trace = WhatsAppHistory();
        var profileId = new ActivityQueries(trace.Database).ListApplications(AllTime, 0, Day)
            .Single(a => a.Name == "WhatsApp").ApplicationId;

        var result = new DataOperations(trace.Database).DeleteApplication(profileId);

        Assert.Equal((3, 2), (result.SessionsDeleted, result.ApplicationsDeleted));
        Assert.Equal(["notepad.exe"], trace.Query("SELECT executable FROM applications;", r => r.GetString(0)));
        Assert.Equal(1, trace.CountRows("profiles"));
    }

    private sealed class NoSources : IIdentitySources
    {
        public VersionNames? ReadVersionNames(string executablePath) => null;

        public string? ReadPackageDisplayName(string packageFamilyName) => null;
    }
}
