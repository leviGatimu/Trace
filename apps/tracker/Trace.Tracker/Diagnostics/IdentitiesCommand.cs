using Microsoft.Data.Sqlite;
using Trace.Tracker.Identity;
using Trace.Tracker.Windows;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// <c>TraceTracker.exe --identities</c> — every recorded application, the name it
/// is stored under, and what the current naming rules would call it.
///
/// Read-only, like <c>--dump</c>: its own read-only connection, no migration,
/// no writes, so it is safe beside a running tracker and on a database an older
/// Trace still owns. It is how a naming change is checked against real history
/// before that history is touched.
/// </summary>
internal static class IdentitiesCommand
{
    public static int Run()
    {
        ConsoleBridge.Attach();

        if (!File.Exists(TracePaths.DatabaseFile))
        {
            ConsoleBridge.WriteLine();
            ConsoleBridge.WriteLine($"No database yet at {TracePaths.DatabaseFile}");
            return ExitCodes.Ok;
        }

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = TracePaths.DatabaseFile,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false,
        }.ToString();

        using var connection = new SqliteConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        // Only columns every schema version has, so this reads a 0.1 database too.
        command.CommandText =
            """
            SELECT a.executable, a.path, a.name, COALESCE(SUM(s.active_seconds), 0) AS active
              FROM applications a
              LEFT JOIN sessions s ON s.application_id = a.id
             GROUP BY a.id
             ORDER BY active DESC;
            """;

        var resolver = ProcessIdentity.Resolver;
        var total = 0;
        var renamed = 0;

        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine($"Application identities  -  resolver version {resolver.Version}");
        ConsoleBridge.WriteLine(new string('=', 100));
        ConsoleBridge.WriteLine($"  {"",1} {"Recorded as",-30} {"Resolves to",-30} {"Source",-13} Category");

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var executable = reader.GetString(0);
            var path = reader.IsDBNull(1) ? null : reader.GetString(1);
            var recorded = reader.GetString(2);

            var identity = resolver.Resolve(executable, path);

            // A filename guess never replaces a recorded name (ApplicationRepository).
            var shown = identity.Source == IdentitySource.Filename ? recorded : identity.Name;
            var changed = !string.Equals(shown, recorded, StringComparison.Ordinal);

            total++;
            renamed += changed ? 1 : 0;

            ConsoleBridge.WriteLine(
                $"  {(changed ? "*" : " "),1} {Fit(recorded, 30),-30} {Fit(shown, 30),-30} " +
                $"{identity.Source.ToStorage(),-13} {identity.Category ?? "-"}");
        }

        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine($"{total} applications; {renamed} would be renamed (*). Nothing was changed.");
        return ExitCodes.Ok;
    }

    private static string Fit(string value, int width) =>
        value.Length <= width ? value : value[..(width - 1)] + "…";
}
