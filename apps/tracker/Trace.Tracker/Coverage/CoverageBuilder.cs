using Trace.Contracts;

namespace Trace.Tracker.Coverage;

/// <summary>A stretch Trace itself has a record for.</summary>
/// <param name="Kind">'recorded', 'locked', 'paused' or 'asleep'.</param>
/// <param name="EndEstimated">
/// True when the end is a reconstruction, as for a session closed by crash
/// recovery at the last heartbeat rather than by an observed event.
/// </param>
internal sealed record TraceSpan(string Kind, long StartedAt, long? EndedAt, bool EndEstimated, string? EvidenceId);

/// <summary>Trace starting, after being stopped or after a crash.</summary>
internal sealed record TrackerStart(long At, long EventId);

/// <summary>A Windows record as coverage needs it.</summary>
internal sealed record StoredWindowsRecord(long Id, long TimestampUtcMs, WindowsRecordKind Kind);

/// <summary>
/// Explains every moment of a time range: either Trace has a record for it, or
/// the gap is labelled with what Windows says about it, or it is admitted to be
/// unknown.
///
/// The distinction it exists to draw: "nothing happened" and "nothing was
/// recorded" look identical in a list of sessions. A period with coverage but
/// no matching event is evidence of absence; a gap is not.
/// </summary>
internal static class CoverageBuilder
{
    /// <summary>
    /// Shorter gaps are not shown. They are the instants between one session
    /// closing and the next opening, not stretches anyone could have used.
    /// </summary>
    public const long MinGapMs = 60_000;

    /// <summary>Recorded spans closer than this are drawn as one stretch.</summary>
    private const long JoinMs = 5_000;

    private enum MachineState { Unknown, On, SignedOut, Asleep, Off }

    /// <param name="spans">Trace's own spans overlapping the range, any order.</param>
    /// <param name="windowsRecords">
    /// Windows records inside the range, plus the last one before it, so the
    /// state at the start of the range is known.
    /// </param>
    /// <param name="windowsRecordsFrom">
    /// The oldest Windows record held. Before it, Windows can say nothing.
    /// </param>
    /// <param name="trackerStarts">
    /// When Trace started (its TRACKER_STARTED and TRACKER_RECOVERED events). A
    /// gap with a start inside it is Trace not running; a gap without one is
    /// Trace running while the window in front was one it does not record.
    /// </param>
    /// <param name="traceHistoryFrom">
    /// Trace's first recorded session, or null if it has none. Before it, the
    /// absence of a record says nothing at all: Trace was not there.
    /// </param>
    public static List<CoverageSegment> Build(
        long fromUtcMs,
        long toUtcMs,
        long nowUtcMs,
        IReadOnlyList<TraceSpan> spans,
        IReadOnlyList<StoredWindowsRecord> windowsRecords,
        long? windowsRecordsFrom,
        long? traceHistoryFrom = long.MinValue,
        IReadOnlyList<TrackerStart>? trackerStarts = null)
    {
        var starts = trackerStarts ?? [];
        var end = Math.Min(toUtcMs, nowUtcMs);
        var covered = Join(spans, fromUtcMs, end, nowUtcMs);
        var segments = new List<CoverageSegment>();

        var cursor = fromUtcMs;
        var historyFrom = traceHistoryFrom ?? end;
        if (cursor < historyFrom)
        {
            var until = Math.Min(historyFrom, end);
            segments.Add(new CoverageSegment(
                "before-trace", cursor, until, "unknown", "none", false, [],
                "Before Trace's first record. Trace cannot reconstruct activity from before it started recording."));
            cursor = until;
        }

        var previous = (TraceSpan?)null;
        foreach (var span in covered)
        {
            AddGap(segments, cursor, span.StartedAt, previous, windowsRecords, windowsRecordsFrom, starts);
            segments.Add(Describe(span, nowUtcMs));
            cursor = Math.Max(cursor, span.EndedAt!.Value);
            previous = span;
        }

        AddGap(segments, cursor, end, previous, windowsRecords, windowsRecordsFrom, starts);
        return segments;
    }

    /// <summary>
    /// Clips to the range, treats an open span as running until now, and joins
    /// adjacent spans of the same kind. Where spans of different kinds overlap
    /// (a lock recorded within a session's last second), the earlier one keeps
    /// the overlap, so no moment is counted twice.
    /// </summary>
    private static List<TraceSpan> Join(IReadOnlyList<TraceSpan> spans, long from, long to, long now)
    {
        var joined = new List<TraceSpan>();
        foreach (var span in spans.OrderBy(s => s.StartedAt))
        {
            var start = Math.Max(span.StartedAt, from);
            var stop = Math.Min(span.EndedAt ?? now, to);
            if (stop <= start)
            {
                continue;
            }

            if (joined.Count > 0)
            {
                var last = joined[^1];
                var lastEnd = last.EndedAt!.Value;
                if (last.Kind == span.Kind && start <= lastEnd + JoinMs)
                {
                    if (stop > lastEnd)
                    {
                        joined[^1] = last with { EndedAt = stop, EndEstimated = span.EndEstimated };
                    }

                    continue;
                }

                start = Math.Max(start, lastEnd);
                if (stop <= start)
                {
                    continue;
                }
            }

            joined.Add(span with { StartedAt = start, EndedAt = stop });
        }

        return joined;
    }

    private static CoverageSegment Describe(TraceSpan span, long now)
    {
        var explanation = span.Kind switch
        {
            "recorded" => "Trace recorded which application was in front.",
            "locked" => "Trace recorded that this Windows session was locked.",
            "paused" => "Recording was paused from Trace.",
            "asleep" => "Trace recorded the machine going to sleep.",
            _ => "Trace has a record for this period.",
        };

        if (span.EndEstimated)
        {
            explanation += " Its end is estimated: Trace stopped unexpectedly, and the end is its last heartbeat.";
        }

        return new CoverageSegment(
            span.Kind,
            span.StartedAt,
            span.EndedAt is { } e && e >= now ? null : span.EndedAt,
            "observed",
            "trace",
            false,
            span.EvidenceId is null ? [] : [span.EvidenceId],
            explanation);
    }

    private static void AddGap(
        List<CoverageSegment> segments,
        long start,
        long end,
        TraceSpan? previous,
        IReadOnlyList<StoredWindowsRecord> records,
        long? recordsFrom,
        IReadOnlyList<TrackerStart> starts)
    {
        if (end - start < MinGapMs)
        {
            return;
        }

        var startEstimated = previous?.EndEstimated ?? false;

        // Trace was recording right up to the gap, so the machine was on and
        // signed in when it began. Otherwise, ask Windows what state it was in.
        var state = previous is { Kind: "recorded" or "locked" }
            ? MachineState.On
            : StateAt(start, records, recordsFrom);
        var stateSince = start;
        var openedBy = (string?)null;

        foreach (var record in records.Where(r => r.TimestampUtcMs > start && r.TimestampUtcMs < end))
        {
            var next = Transition(state, record.Kind);
            if (next == state)
            {
                continue;
            }

            AddPiece(segments, state, stateSince, record.TimestampUtcMs, startEstimated, openedBy, starts);
            state = next;
            stateSince = record.TimestampUtcMs;
            openedBy = EvidenceIds.WindowsRecord(record.Id);
            startEstimated = false;
        }

        AddPiece(segments, state, stateSince, end, startEstimated, openedBy, starts);
    }

    private static MachineState StateAt(long at, IReadOnlyList<StoredWindowsRecord> records, long? recordsFrom)
    {
        if (recordsFrom is null || at < recordsFrom)
        {
            return MachineState.Unknown;
        }

        var state = MachineState.On;
        foreach (var record in records.Where(r => r.TimestampUtcMs <= at))
        {
            state = Transition(state, record.Kind);
        }

        return state;
    }

    private static MachineState Transition(MachineState state, WindowsRecordKind kind) => kind switch
    {
        WindowsRecordKind.Boot => MachineState.SignedOut,
        WindowsRecordKind.Shutdown => MachineState.Off,
        WindowsRecordKind.Sleep => MachineState.Asleep,
        WindowsRecordKind.Wake => state == MachineState.Asleep || state == MachineState.Unknown ? MachineState.On : state,
        WindowsRecordKind.SignIn => MachineState.On,
        WindowsRecordKind.SignOut => MachineState.SignedOut,
        // Logged at the next boot; it says the previous shutdown was unclean,
        // not when it happened, so it changes nothing about this moment.
        WindowsRecordKind.UnexpectedShutdown => state,
        _ => state,
    };

    private static void AddPiece(
        List<CoverageSegment> segments,
        MachineState state,
        long start,
        long end,
        bool startEstimated,
        string? openedBy,
        IReadOnlyList<TrackerStart> starts)
    {
        if (end <= start)
        {
            return;
        }

        // The machine was on and signed in, yet there is no record. Trace's own
        // start events say which of two different things that was.
        if (state is MachineState.On or MachineState.Unknown
            && starts.FirstOrDefault(t => t.At > start && t.At <= end) is { } started)
        {
            AddSegment(segments, "trace-stopped", "inferred", start, started.At, startEstimated,
                [EvidenceIds.Event(started.EventId)],
                "Trace was not running. It started again at the end of this period. What happened meanwhile is unknown.");
            AddPiece(segments, MachineState.On, started.At, end, false, null, []);
            return;
        }

        var (kind, evidence, source, explanation) = state switch
        {
            MachineState.Off => ("powered-off", "observed", "windows",
                "Windows recorded a shutdown. Nothing could be recorded while the PC was off."),
            MachineState.Asleep => ("asleep", "observed", "windows",
                "Windows recorded the PC going to sleep."),
            MachineState.SignedOut => ("signed-out", "observed", "windows",
                "Windows shows no one signed in to this account. Trace runs inside the account, so it could not record."),
            MachineState.On => ("unrecorded-window", "inferred", "none",
                "Trace was running, but the window in front was one it does not record: an application excluded in Settings, or a protected window it cannot identify, such as one running as administrator. Which, and what was done in it, is unknown."),
            _ => ("unknown", "unknown", "none",
                "No record from Trace, and no Windows record this old. Whether the PC was on is unknown."),
        };

        AddSegment(segments, kind, evidence, start, end, startEstimated,
            openedBy is null ? [] : [openedBy], explanation, source);
    }

    private static void AddSegment(
        List<CoverageSegment> segments,
        string kind,
        string evidence,
        long start,
        long end,
        bool startEstimated,
        IReadOnlyList<string> evidenceIds,
        string explanation,
        string source = "none")
    {
        if (startEstimated)
        {
            explanation += " The start is estimated from Trace's last heartbeat.";
        }

        segments.Add(new CoverageSegment(kind, start, end, evidence, source, startEstimated, evidenceIds, explanation));
    }
}
