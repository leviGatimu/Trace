using Trace.Contracts;

namespace Trace.Tracker.Data.Queries;

/// <summary>A session exactly as stored.</summary>
internal readonly record struct RawSession(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    long StartedAt,
    long? EndedAt,
    int ActiveSeconds,
    int IdleSeconds,
    EndReason? EndReason)
{
    public long DurationMs(long nowUtcMs) => Math.Max(0, (EndedAt ?? nowUtcMs) - StartedAt);
}

/// <summary>One row as the user sees it: one or more raw sessions of one application.</summary>
internal sealed record MergedSession(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    long StartedAt,
    long? EndedAt,
    int ActiveSeconds,
    int IdleSeconds,
    EndReason? EndReason,
    int RawSessionCount,
    IReadOnlyList<long> RawSessionIds)
{
    public bool Merged => RawSessionCount > 1;
}

/// <summary>
/// Turns stored sessions into the sessions the interface shows.
///
/// This exists because of something the live tracker made obvious: a single
/// Alt-Tab produces several real foreground changes — the task-switching
/// overlay, the shell, then the destination — and eight sessions in nine
/// seconds is a faithful record of a machine, not a useful record of a person.
///
/// DOCS/Tracking.md §F settles the policy: keep every raw transition, and group
/// the short ones when displaying. This is the one implementation of that rule.
/// It runs in the tracker, never in React, so DOCS/data and database.md §26
/// holds: the UI formats what it is given and derives nothing.
///
/// <b>Filter, then coalesce.</b> Sessions shorter than the threshold are
/// dropped; surviving neighbours of the same application become one row. Both
/// steps matter — dropping alone would leave Chrome split in two by a flicker
/// that is no longer shown, which reads as a bug.
///
/// <b>Coalescing never bridges a gap.</b> Two stretches of the same application
/// separated by an hour of Trace not running are two rows, not one. Merging
/// them would draw a bar across time nobody was recorded for.
///
/// <b>Every read model uses this.</b> Durations, session counts and timeline
/// rows all come from the merged view, so no two screens can disagree about how
/// many times you used something. The cost is that sub-threshold activity is
/// excluded from totals — at most a few seconds a day, and under-reporting is
/// the direction DOCS/data and database.md §7 explicitly prefers.
/// </summary>
internal static class SessionMerger
{
    public const int DefaultMinSessionSeconds = 5;

    /// <summary>
    /// How far apart two sessions may be and still be treated as continuous.
    ///
    /// Sessions are contiguous by construction — each one ends exactly when the
    /// next begins — so any real gap means Trace was not recording: it was
    /// stopped, the machine was asleep, or tracking was paused. A second of
    /// tolerance covers clock granularity and nothing else.
    /// </summary>
    private const long ContiguityToleranceMs = 1000;

    public static List<MergedSession> Merge(
        IEnumerable<RawSession> sessionsInTimeOrder, int minSessionSeconds, long nowUtcMs)
    {
        var merged = new List<MergedSession>();
        var minimumMs = (long)minSessionSeconds * 1000;

        // The end of the previous raw session, dropped ones included. Coalescing
        // has to know that the gap it is bridging was created by sessions we
        // chose not to show, and not by Trace being switched off for an hour.
        long? previousRawEndedAt = null;

        foreach (var session in sessionsInTimeOrder)
        {
            // An open session is the one happening now. It is kept whatever its
            // length, because hiding what the user is doing this second would be
            // absurd.
            var qualifies = session.EndedAt is null || session.DurationMs(nowUtcMs) >= minimumMs;
            var startedAt = session.StartedAt;
            var isContiguous = previousRawEndedAt is not { } previousEnd
                               || startedAt - previousEnd <= ContiguityToleranceMs;

            previousRawEndedAt = session.EndedAt ?? nowUtcMs;

            if (!qualifies)
            {
                continue;
            }

            if (merged.Count > 0
                && merged[^1].ApplicationId == session.ApplicationId
                && isContiguous)
            {
                merged[^1] = Absorb(merged[^1], session);
                continue;
            }

            merged.Add(new MergedSession(
                session.SessionId,
                session.ApplicationId,
                session.ApplicationName,
                session.Executable,
                session.StartedAt,
                session.EndedAt,
                session.ActiveSeconds,
                session.IdleSeconds,
                session.EndReason,
                RawSessionCount: 1,
                RawSessionIds: [session.SessionId]));
        }

        return merged;
    }

    /// <summary>
    /// Extends a row with the next session of the same application. The row
    /// keeps the earliest start and takes the latest end and end reason, so it
    /// describes the whole stretch rather than only its first part.
    /// </summary>
    private static MergedSession Absorb(MergedSession row, RawSession next)
    {
        var ids = new List<long>(row.RawSessionIds) { next.SessionId };

        return row with
        {
            EndedAt = next.EndedAt,
            ActiveSeconds = row.ActiveSeconds + next.ActiveSeconds,
            IdleSeconds = row.IdleSeconds + next.IdleSeconds,
            EndReason = next.EndReason,
            RawSessionCount = row.RawSessionCount + 1,
            RawSessionIds = ids,
        };
    }

    /// <summary>Clamps a caller-supplied threshold to something sane.</summary>
    public static int Normalise(int? minSessionSeconds) =>
        Math.Clamp(minSessionSeconds ?? DefaultMinSessionSeconds, 0, 3600);
}
