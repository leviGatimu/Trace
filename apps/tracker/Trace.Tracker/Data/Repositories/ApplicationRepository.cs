using Microsoft.Data.Sqlite;
using Trace.Tracker.Engine;
using Trace.Tracker.Identity;

namespace Trace.Tracker.Data.Repositories;

/// <summary>An application row as the identity backfill needs it.</summary>
internal readonly record struct StoredApplication(long Id, string Executable, string? Path);

/// <summary>
/// Reads and writes <c>applications</c>.
///
/// Every method takes the caller's connection so a whole state transition —
/// application, session, window session and events — commits as one
/// transaction, and a transition is never half-recorded.
/// </summary>
internal static class ApplicationRepository
{
    /// <summary>
    /// Returns the id for this application, creating it on first sight.
    ///
    /// Chrome has one identity no matter how many times it launches
    /// (DOCS/specs/data-and-database.md §3). The executable name is the key; the path
    /// is metadata, refreshed when a better one becomes available — an
    /// application seen first as an elevated process has no path, and should
    /// pick one up later rather than staying blank forever.
    ///
    /// The same rule applies to the name: a filename guess, which is all Trace
    /// can do for a process it cannot open, never replaces a better name that is
    /// already recorded.
    /// </summary>
    public static long Upsert(SqliteConnection connection, TrackedApplication application, long atUtcMs)
    {
        var identity = new ResolvedIdentity(
            application.DisplayName,
            application.Category,
            application.PackageFamily,
            application.IdentitySource,
            application.ProfileKey ?? ProfileKeys.ForExecutable(application.Executable),
            application.ProfileLink);

        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            INSERT INTO applications (name, executable, path, first_seen, last_seen,
                                      category, package_family, identity_source, identity_version,
                                      profile_id, profile_link)
            VALUES ($name, $executable, $path, $at, $at,
                    $category, $package_family, $identity_source, $identity_version,
                    $profile_id, $profile_link)
            ON CONFLICT(executable) DO UPDATE SET
                last_seen = $at,
                path      = COALESCE(excluded.path, applications.path),
                {KeepBetterIdentity("excluded.")}
            RETURNING id;
            """;

        command.Parameters.AddWithValue("$executable", application.Executable);
        command.Parameters.AddWithValue("$path", (object?)application.ExecutablePath ?? DBNull.Value);
        command.Parameters.AddWithValue("$at", atUtcMs);
        AddIdentity(command, identity, application.IdentityVersion,
            ProfileFor(connection, application.Executable, identity));

        return (long)command.ExecuteScalar()!;
    }

    /// <summary>Applications not yet named by resolver version <paramref name="identityVersion"/>.</summary>
    public static List<StoredApplication> FindNeedingIdentity(SqliteConnection connection, int identityVersion)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT id, executable, path FROM applications WHERE identity_version < $version ORDER BY id;";
        command.Parameters.AddWithValue("$version", identityVersion);

        var rows = new List<StoredApplication>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(new StoredApplication(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2)));
        }

        return rows;
    }

    /// <summary>
    /// Re-names an application already in the history. Touches only the
    /// presentation columns; sessions, events and timestamps are evidence and
    /// are never rewritten.
    /// </summary>
    public static void ApplyIdentity(
        SqliteConnection connection, long applicationId, string executable, ResolvedIdentity identity, int identityVersion)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
            UPDATE applications SET
                {KeepBetterIdentity("$")}
            WHERE id = $id;
            """;

        command.Parameters.AddWithValue("$id", applicationId);
        AddIdentity(command, identity, identityVersion, ProfileFor(connection, executable, identity));
        command.ExecuteNonQuery();
    }

    /// <summary>
    /// The profile an executable should belong to. A filename guess keeps the
    /// profile already recorded, for the same reason it keeps the name: Trace
    /// knew more about the executable when it first named it.
    /// </summary>
    private static long ProfileFor(SqliteConnection connection, string executable, ResolvedIdentity identity)
    {
        var isGuess = identity.Source == IdentitySource.Filename;
        if (isGuess)
        {
            using var existing = connection.CreateCommand();
            existing.CommandText = "SELECT profile_id FROM applications WHERE executable = $executable;";
            existing.Parameters.AddWithValue("$executable", executable);
            if (existing.ExecuteScalar() is long recorded)
            {
                return recorded;
            }
        }

        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO profiles (key, name, category) VALUES ($key, $name, $category)
            ON CONFLICT(key) DO UPDATE SET
                name     = CASE WHEN $guess THEN profiles.name ELSE excluded.name END,
                category = COALESCE(excluded.category, profiles.category)
            RETURNING id;
            """;
        command.Parameters.AddWithValue("$key", identity.ProfileKey);
        command.Parameters.AddWithValue("$name", identity.Name);
        command.Parameters.AddWithValue("$category", (object?)identity.Category ?? DBNull.Value);
        command.Parameters.AddWithValue("$guess", isGuess);
        return (long)command.ExecuteScalar()!;
    }

    /// <summary>Removes profiles no application belongs to any more.</summary>
    public static int DeleteOrphanProfiles(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            DELETE FROM profiles
            WHERE id NOT IN (SELECT profile_id FROM applications WHERE profile_id IS NOT NULL);
            """;

        return command.ExecuteNonQuery();
    }

    /// <summary>Removes applications no session refers to any more.</summary>
    public static int DeleteOrphans(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            DELETE FROM applications
            WHERE id NOT IN (SELECT DISTINCT application_id FROM sessions)
              AND id NOT IN (SELECT DISTINCT application_id FROM process_instances WHERE application_id IS NOT NULL);
            """;

        var deleted = command.ExecuteNonQuery();
        DeleteOrphanProfiles(connection);
        return deleted;
    }

    /// <summary>
    /// The identity columns' SET clause, shared by the live upsert and the
    /// backfill so the two can never disagree about when a name may be replaced.
    /// <paramref name="incoming"/> is where the new values are read from:
    /// <c>excluded.</c> inside an upsert, <c>$</c> (the parameters) in an update.
    ///
    /// A 'filename' result is a guess. It may fill a gap but never overwrite a
    /// name or source already recorded, including a NULL source, which marks a
    /// name recorded by Trace 0.1 and is more honest than relabelling it a guess.
    /// </summary>
    private static string KeepBetterIdentity(string incoming) =>
        $"""
        name             = CASE WHEN {incoming}identity_source = 'filename'
                                THEN applications.name ELSE {incoming}name END,
        category         = COALESCE({incoming}category, applications.category),
        package_family   = COALESCE({incoming}package_family, applications.package_family),
        identity_source  = CASE WHEN {incoming}identity_source = 'filename'
                                THEN applications.identity_source
                                ELSE {incoming}identity_source END,
        identity_version = {incoming}identity_version,
        profile_id       = {incoming}profile_id,
        profile_link     = CASE WHEN {incoming}identity_source = 'filename' AND applications.profile_link IS NOT NULL
                                THEN applications.profile_link ELSE {incoming}profile_link END
        """;

    private static void AddIdentity(SqliteCommand command, ResolvedIdentity identity, int identityVersion, long profileId)
    {
        command.Parameters.AddWithValue("$profile_id", profileId);
        command.Parameters.AddWithValue("$profile_link", identity.ProfileLink.ToStorage());
        command.Parameters.AddWithValue("$name", identity.Name);
        command.Parameters.AddWithValue("$category", (object?)identity.Category ?? DBNull.Value);
        command.Parameters.AddWithValue("$package_family", (object?)identity.PackageFamily ?? DBNull.Value);
        command.Parameters.AddWithValue("$identity_source", identity.Source.ToStorage());
        command.Parameters.AddWithValue("$identity_version", identityVersion);
    }
}
