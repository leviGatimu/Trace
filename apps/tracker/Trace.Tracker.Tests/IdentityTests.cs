using Microsoft.Data.Sqlite;
using Trace.Tracker.Data;
using Trace.Tracker.Engine;
using Trace.Tracker.Identity;

namespace Trace.Tracker.Tests;

/// <summary>
/// Application identity: how a recorded executable gets its name, and how the
/// history is re-named without touching what Trace observed.
///
/// The paths and names below are real ones from a real Trace history, which is
/// where the cases that broke the first version of this code came from.
/// </summary>
public class IdentityTests
{
    private const string WhatsAppPath =
        @"C:\Program Files\WindowsApps\5319275A.WhatsAppDesktop_2.2645.101.0_x64__cv1g1gvanyjgm\WhatsApp.Root.exe";

    private const string PhotosPath =
        @"C:\Program Files\WindowsApps\Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe\Photos.exe";

    private const string CodexPath =
        @"C:\Program Files\WindowsApps\OpenAI.Codex_26.1106.6628.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe";

    // -- package paths --------------------------------------------------------

    [Fact]
    public void A_package_is_recognised_from_its_install_path()
    {
        var package = PackagePath.TryParse(WhatsAppPath);

        Assert.Equal(new PackageInfo("5319275A.WhatsAppDesktop", "5319275A.WhatsAppDesktop_cv1g1gvanyjgm"), package);
    }

    [Fact]
    public void An_empty_resource_id_is_the_normal_case_not_a_malformed_name()
    {
        // The double underscore. Rejecting it meant no packaged app was ever
        // recognised, which only showed up against a real history.
        Assert.Equal("Microsoft.Windows.Photos_8wekyb3d8bbwe", PackagePath.TryParse(PhotosPath)?.FamilyName);
    }

    [Fact]
    public void An_executable_in_a_subfolder_of_the_package_is_still_recognised()
    {
        Assert.Equal(
            "Microsoft.ScreenSketch",
            PackagePath.TryParse(
                @"C:\Program Files\WindowsApps\Microsoft.ScreenSketch_11.2609.15.0_x64__8wekyb3d8bbwe\SnippingTool\SnippingTool.exe")
                ?.Name);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(@"C:\Program Files\Google\Chrome\Application\chrome.exe")]
    [InlineData(@"C:\Program Files\WindowsApps\5319275A.WhatsAppDesktop_2.2645.101.0_x64__cv1g1gvanyjgm")]
    [InlineData(@"C:\Program Files\WindowsApps\NotAFullName\app.exe")]
    [InlineData(@"C:\Program Files\WindowsApps\Name__x64__publisher\app.exe")]
    public void Anything_else_is_not_a_package(string? path)
    {
        Assert.Null(PackagePath.TryParse(path));
    }

    // -- registry -------------------------------------------------------------

    [Fact]
    public void The_shipped_registry_loads_and_is_valid()
    {
        // Loading Default runs the same validation as Parse. A broken registry
        // stops the tracker at startup, so it must fail here first.
        var registry = ApplicationRegistry.Default;

        Assert.True(registry.Version >= 1);
        Assert.True(registry.Count > 40);
        var whatsApp = registry.Find("whatsapp.root.exe", null);
        Assert.Equal(("WhatsApp", "Communication", "app:whatsapp"), (whatsApp?.Name, whatsApp?.Category, whatsApp?.Key));
    }

    [Theory]
    [InlineData("""{"version":1,"categories":["A"],"applications":[{"name":"X","category":"A","executables":["x.exe"]},{"name":"Y","category":"A","executables":["x.exe"]}]}""")]
    [InlineData("""{"version":1,"categories":["A"],"applications":[{"name":"X","category":"B","executables":["x.exe"]}]}""")]
    [InlineData("""{"version":1,"categories":["A"],"applications":[{"name":"X","category":"A","executables":["X.exe"]}]}""")]
    [InlineData("""{"version":1,"categories":["A"],"applications":[{"name":"X","category":"A","packages":["Name_publisher"]}]}""")]
    [InlineData("""{"version":1,"categories":["A"],"applications":[{"name":"X","category":"A"}]}""")]
    [InlineData("""{"version":0,"categories":[],"applications":[]}""")]
    public void An_ambiguous_or_malformed_registry_is_refused(string json)
    {
        Assert.Throws<InvalidDataException>(() => ApplicationRegistry.Parse(json));
    }

    // -- resolution -----------------------------------------------------------

    [Fact]
    public void WhatsApp_is_named_WhatsApp_not_its_build_name()
    {
        var resolver = Resolver(versions: new() { [WhatsAppPath] = new VersionNames("WhatsApp.Root", "WhatsApp.Root") });

        var identity = resolver.Resolve("whatsapp.root.exe", WhatsAppPath);

        Assert.Equal(
            new ResolvedIdentity("WhatsApp", "Communication", "5319275A.WhatsAppDesktop_cv1g1gvanyjgm", IdentitySource.Registry,
                "app:whatsapp", ProfileLink.Package),
            identity);
    }

    [Fact]
    public void A_listed_package_names_an_executable_the_registry_does_not_list()
    {
        // chatgpt.exe inside the Codex package is Codex. Matching that filename
        // to "ChatGPT" would have mislabelled it.
        var identity = Resolver().Resolve("chatgpt.exe", CodexPath);

        Assert.Equal("Codex", identity.Name);
        Assert.Equal(IdentitySource.Registry, identity.Source);
    }

    [Fact]
    public void An_unlisted_packaged_app_takes_its_manifest_display_name()
    {
        const string path =
            @"C:\Program Files\WindowsApps\Microsoft.YourPhone_1.26.0.0_x64__8wekyb3d8bbwe\PhoneExperienceHost.exe";

        var identity = Resolver(
                packages: new() { ["Microsoft.YourPhone_8wekyb3d8bbwe"] = "Phone Link" },
                versions: new() { [path] = new VersionNames("Microsoft Phone Link", null) })
            .Resolve("phoneexperiencehost.exe", path);

        Assert.Equal(
            new ResolvedIdentity("Phone Link", null, "Microsoft.YourPhone_8wekyb3d8bbwe", IdentitySource.Package,
                "package:microsoft.yourphone_8wekyb3d8bbwe", ProfileLink.Package),
            identity);
    }

    [Fact]
    public void An_unresolved_manifest_resource_is_not_a_name()
    {
        const string path = @"C:\Program Files\WindowsApps\Some.App_1.0.0.0_x64__abc\some.exe";

        var identity = Resolver(
                packages: new() { ["Some.App_abc"] = "ms-resource:AppName" },
                versions: new() { [path] = new VersionNames("Some App", null) })
            .Resolve("some.exe", path);

        Assert.Equal(new ResolvedIdentity("Some App", null, "Some.App_abc", IdentitySource.VersionInfo, "exe:some.exe", ProfileLink.Self), identity);
    }

    [Theory]
    [InlineData("Notepad.exe", null, "Notepad")]
    [InlineData("   ", "Product Name", "Product Name")]
    [InlineData(null, "Product Name", "Product Name")]
    public void The_version_resource_is_cleaned_and_falls_back_to_the_product_name(
        string? description, string? product, string expected)
    {
        const string path = @"C:\Apps\tool.exe";

        var identity = Resolver(versions: new() { [path] = new VersionNames(description, product) })
            .Resolve("tool.exe", path);

        Assert.Equal(expected, identity.Name);
        Assert.Equal(IdentitySource.VersionInfo, identity.Source);
    }

    [Fact]
    public void With_nothing_else_known_the_filename_is_used_and_labelled_a_guess()
    {
        var identity = Resolver().Resolve("heyclicky.exe", null);

        Assert.Equal(new ResolvedIdentity("Heyclicky", null, null, IdentitySource.Filename, "exe:heyclicky.exe", ProfileLink.Self), identity);
    }

    // -- storage --------------------------------------------------------------

    [Fact]
    public void A_session_records_the_process_that_owned_the_window()
    {
        using var trace = new PersistenceHarness();

        trace.Gate.OpenSession(new TrackedApplication(4242, "chrome.exe", "Google Chrome", null), 1_000);

        Assert.Equal([4242L], trace.Query("SELECT process_id FROM sessions;", r => r.GetInt64(0)));
    }

    [Fact]
    public void The_backfill_renames_history_without_touching_what_was_observed()
    {
        using var trace = new PersistenceHarness();
        trace.Gate.OpenSession(
            new TrackedApplication(7, "whatsapp.root.exe", "WhatsApp.Root", WhatsAppPath, IdentitySource: IdentitySource.VersionInfo),
            1_000);
        var sessionsBefore = trace.Query("SELECT id, application_id, started_at, process_id FROM sessions;", ReadSession);

        var renamed = IdentityBackfill.Run(trace.Database, Resolver());

        Assert.Equal(1, renamed);
        Assert.Equal(
            [("WhatsApp", "Communication", "5319275A.WhatsAppDesktop_cv1g1gvanyjgm", "registry")],
            trace.Query(
                "SELECT name, category, package_family, identity_source FROM applications;",
                r => (r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3))));
        Assert.Equal(sessionsBefore, trace.Query("SELECT id, application_id, started_at, process_id FROM sessions;", ReadSession));

        // Done once per resolver version, not on every start.
        Assert.Equal(0, IdentityBackfill.Run(trace.Database, Resolver()));
    }

    [Fact]
    public void A_filename_guess_never_replaces_a_name_already_recorded()
    {
        using var trace = new PersistenceHarness();

        // Recorded with a proper name, then uninstalled: today nothing better
        // than the filename can be read.
        trace.Gate.OpenSession(
            new TrackedApplication(1, "s07.exe", "Study Session", @"C:\Gone\s07.exe", IdentitySource: IdentitySource.VersionInfo),
            1_000);

        IdentityBackfill.Run(trace.Database, Resolver());

        Assert.Equal(
            [("Study Session", "version-info")],
            trace.Query("SELECT name, identity_source FROM applications;", r => (r.GetString(0), r.GetString(1))));

        // Nor does a live sighting of the same process with no readable path.
        trace.Gate.OpenSession(
            new TrackedApplication(2, "s07.exe", "S07", null, IdentitySource: IdentitySource.Filename),
            2_000);

        Assert.Equal(["Study Session"], trace.Query("SELECT name FROM applications;", r => r.GetString(0)));
    }

    [Fact]
    public void A_name_from_Trace_0_1_keeps_its_unknown_source_when_it_cannot_be_re_resolved()
    {
        using var trace = new PersistenceHarness();
        trace.Gate.OpenSession(new TrackedApplication(1, "s07.exe", "Study Session", @"C:\Gone\s07.exe"), 1_000);
        trace.Database.Write(connection =>
        {
            // As migration 002 leaves a 0.1 row: source unknown, never resolved.
            using var command = connection.CreateCommand();
            command.CommandText = "UPDATE applications SET identity_source = NULL, identity_version = 0;";
            command.ExecuteNonQuery();
        });

        IdentityBackfill.Run(trace.Database, Resolver());

        Assert.Equal(
            [("Study Session", true)],
            trace.Query("SELECT name, identity_source IS NULL FROM applications;", r => (r.GetString(0), r.GetBoolean(1))));
    }

    // -- migration ------------------------------------------------------------

    [Fact]
    public void A_version_1_database_upgrades_with_its_history_intact_and_a_backup_taken()
    {
        var directory = Path.Combine(Path.GetTempPath(), "trace-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "activity.db");

        try
        {
            CreateVersion1Database(path);

            using (var database = TraceDatabase.Open(path, afterUncleanExit: false))
            {
                var row = database.Read(connection =>
                {
                    using var command = connection.CreateCommand();
                    command.CommandText =
                        """
                        SELECT (SELECT MAX(version) FROM schema_version),
                               a.name, a.identity_version, a.identity_source, s.process_id, s.active_seconds
                          FROM applications a JOIN sessions s ON s.application_id = a.id;
                        """;
                    using var reader = command.ExecuteReader();
                    Assert.True(reader.Read());
                    return (
                        Version: reader.GetInt32(0),
                        Name: reader.GetString(1),
                        IdentityVersion: reader.GetInt32(2),
                        SourceIsNull: reader.IsDBNull(3),
                        ProcessIdIsNull: reader.IsDBNull(4),
                        Active: reader.GetInt32(5));
                });

                Assert.Equal((TraceDatabase.CurrentSchemaVersion, "WhatsApp.Root", 0, true, true, 47), row);
            }

            Assert.Single(Directory.GetFiles(directory, "activity.pre-v1-*.db"));
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(directory, recursive: true);
        }
    }

    // -- helpers --------------------------------------------------------------

    private static (long, long, long, long?) ReadSession(SqliteDataReader r) =>
        (r.GetInt64(0), r.GetInt64(1), r.GetInt64(2), r.IsDBNull(3) ? null : r.GetInt64(3));

    private static ApplicationIdentityResolver Resolver(
        Dictionary<string, string>? packages = null,
        Dictionary<string, VersionNames>? versions = null) =>
        new(ApplicationRegistry.Default, new FakeSources(packages ?? [], versions ?? []));

    /// <summary>The schema exactly as Trace 0.1 created it, with one recorded session.</summary>
    private static void CreateVersion1Database(string path)
    {
        var assembly = typeof(TraceDatabase).Assembly;
        var resource = assembly.GetManifestResourceNames().Single(n => n.Contains(".001_", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(resource)!;
        var script = new StreamReader(stream).ReadToEnd();

        using var connection = new SqliteConnection(
            new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString());
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = script +
            $"""

            INSERT INTO applications (id, name, executable, path, first_seen, last_seen)
            VALUES (1, 'WhatsApp.Root', 'whatsapp.root.exe', '{WhatsAppPath}', 1000, 48000);
            INSERT INTO sessions (application_id, started_at, ended_at, active_seconds, idle_seconds, end_reason)
            VALUES (1, 1000, 48000, 47, 0, 'APP_SWITCH');
            """;
        command.ExecuteNonQuery();
    }

    private sealed class FakeSources(
        Dictionary<string, string> packages,
        Dictionary<string, VersionNames> versions) : IIdentitySources
    {
        public VersionNames? ReadVersionNames(string executablePath) =>
            versions.GetValueOrDefault(executablePath);

        public string? ReadPackageDisplayName(string packageFamilyName) =>
            packages.GetValueOrDefault(packageFamilyName);
    }
}
