using Trace.Tracker.Data;
using Trace.Tracker.Data.Repositories;

namespace Trace.Tracker.Identity;

/// <summary>
/// Re-names applications already in the history whenever the naming rules or
/// the registry change.
///
/// Without this, a better name only reaches an application the next time it is
/// used, so an app last opened in August would keep its old label forever.
/// Only the presentation columns of <c>applications</c> change. Sessions and
/// events are what Trace observed and are never rewritten.
/// </summary>
internal static class IdentityBackfill
{
    /// <returns>How many applications were re-resolved.</returns>
    public static int Run(TraceDatabase database, ApplicationIdentityResolver resolver)
    {
        var version = resolver.Version;
        var stale = database.Read(connection => ApplicationRepository.FindNeedingIdentity(connection, version));
        if (stale.Count == 0)
        {
            return 0;
        }

        // Resolve outside the write lock: reading version resources and asking
        // the package manager is file and COM work, and the engine must never
        // wait on it to record a foreground change.
        var resolved = stale
            .Select(application => (application.Id, application.Executable,
                Identity: resolver.Resolve(application.Executable, application.Path)))
            .ToList();

        database.Write(connection =>
        {
            foreach (var (id, executable, identity) in resolved)
            {
                ApplicationRepository.ApplyIdentity(connection, id, executable, identity, version);
            }

            // Executables that moved into a shared profile leave their old,
            // single-executable profile behind.
            ApplicationRepository.DeleteOrphanProfiles(connection);
        });

        return resolved.Count;
    }
}
