using Trace.Contracts;
using Trace.Tracker.Data.Repositories;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Data;

/// <summary>
/// Enforces the user's retention choice.
///
/// The default is FOREVER (implementation plan §14A): a product whose premise is
/// that your computer remembers should not quietly forget. Anything shorter is
/// an explicit choice, and when it is made, deletion is real — rows go, no
/// hidden archive (DOCS/Privacy.md §21).
/// </summary>
internal static class RetentionService
{
    public static TimeSpan? Window(RetentionPolicy policy) => policy switch
    {
        RetentionPolicy.FOREVER => null,
        RetentionPolicy.ONE_YEAR => TimeSpan.FromDays(365),
        RetentionPolicy.NINETY_DAYS => TimeSpan.FromDays(90),
        RetentionPolicy.THIRTY_DAYS => TimeSpan.FromDays(30),
        _ => null,
    };

    /// <summary>
    /// Deletes history older than the retention window. Returns what was
    /// removed, so the sweep can be reported rather than being invisible.
    /// </summary>
    public static DeleteResult Apply(TraceDatabase database, RetentionPolicy policy, long nowUtcMs)
    {
        if (Window(policy) is not { } window)
        {
            return new DeleteResult(0, 0, 0, 0);
        }

        var cutoff = nowUtcMs - (long)window.TotalMilliseconds;

        var result = database.Write(connection =>
        {
            // Window sessions and session-scoped events cascade with the
            // sessions. The separate event delete catches system events — lock,
            // sleep, pause — which belong to no session and would otherwise
            // outlive the history they describe.
            var sessions = SessionRepository.DeleteRange(connection, long.MinValue, cutoff);
            var events = EventRepository.DeleteRange(connection, long.MinValue, cutoff);
            var applications = ApplicationRepository.DeleteOrphans(connection);

            // Cascaded rows are not counted individually by SQLite; reporting
            // them as zero is better than reporting a number that is wrong.
            return new DeleteResult(sessions, 0, events, applications);
        });

        if (result.SessionsDeleted > 0 || result.EventsDeleted > 0)
        {
            Log.Info(
                $"Retention sweep ({policy}) removed {result.SessionsDeleted} sessions and " +
                $"{result.EventsDeleted} events older than {window.TotalDays:F0} days.");
        }

        return result;
    }
}
