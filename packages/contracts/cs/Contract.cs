// Trace IPC contract — C# mirror of packages/contracts/ts/index.ts.
//
// Normative spec: packages/contracts/ipc-contract.md
// When you change one side, change both and bump ContractInfo.Version.
//
// Units (contract §4):
//   *At / *UtcMs  -> UTC epoch MILLISECONDS
//   *Seconds      -> whole SECONDS
// Serialised with camelCase property names and string enum values; see
// ContractJson.Options below, which is the only serializer configuration the
// tracker uses for IPC.

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Trace.Contracts;

public static class ContractInfo
{
    public const string Version = "1.0";
    public const string PipeNamePrefix = "Trace.";
    public const int MaxFrameBytes = 8 * 1024 * 1024;
    public const string DeleteAllConfirmation = "DELETE ALL";
}

public static class ContractJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Converters = { new JsonStringEnumConverter() },
    };
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

public sealed record IpcRequest(string Id, string Method, JsonElement? Params);

public sealed record IpcResponse(string Id, bool Ok, object? Result, IpcError? Error)
{
    public static IpcResponse Success(string id, object? result) => new(id, true, result, null);

    public static IpcResponse Failure(string id, IpcErrorCode code, string message) =>
        new(id, false, null, new IpcError(code, message));
}

public sealed record IpcError(IpcErrorCode Code, string Message);

public enum IpcErrorCode
{
    E_UNKNOWN_METHOD,
    E_BAD_PARAMS,
    E_RANGE,
    E_NOT_FOUND,
    E_PATH,
    E_DEGRADED,
    E_BUSY,
    E_INTERNAL,

    /// <summary>The action needs the Trace PIN. Unlock with protection.unlock, then retry.</summary>
    E_LOCKED,
}

public sealed record IpcPush(string Event, object Data);

public static class PushEvents
{
    public const string StateChanged = "state.changed";
    public const string ActivityChanged = "activity.changed";
    public const string SettingsChanged = "settings.changed";
    public const string DataChanged = "data.changed";
}

// ---------------------------------------------------------------------------
// Domain vocabulary
// ---------------------------------------------------------------------------

/// <summary>Why a session ended. Mirrors <c>sessions.end_reason</c>.</summary>
public enum EndReason
{
    APP_SWITCH,
    APP_EXIT,
    SYSTEM_LOCK,
    SYSTEM_SLEEP,
    TRACKING_PAUSED,
    SYSTEM_SHUTDOWN,
    CRASH_RECOVERY,
}

/// <summary>Mirrors <c>events.type</c>.</summary>
public enum EventType
{
    FOREGROUND_CHANGED,
    WINDOW_CHANGED,
    SESSION_STARTED,
    SESSION_ENDED,
    IDLE_STARTED,
    IDLE_ENDED,
    SYSTEM_LOCKED,
    SYSTEM_UNLOCKED,
    SYSTEM_SLEEP,
    SYSTEM_WAKE,
    SYSTEM_SHUTDOWN,
    TRACKING_PAUSED,
    TRACKING_RESUMED,
    TRACKER_STARTED,
    TRACKER_RECOVERED,
}

/// <summary>
/// Tracker lifecycle state. DEGRADED means the process is alive and answering
/// IPC but the database is unavailable — it has stopped writing rather than
/// risk corruption.
/// </summary>
public enum TrackingState
{
    ACTIVE,
    IDLE,
    PAUSED,
    LOCKED,
    SUSPENDED,
    DEGRADED,
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

public static class IpcMethods
{
    public const string SystemHello = "system.hello";
    public const string SystemStatus = "system.status";
    public const string ActivityGetCurrent = "activity.getCurrent";
    public const string ActivityGetDay = "activity.getDay";
    public const string ActivityGetTimeline = "activity.getTimeline";
    public const string ActivityGetCalendar = "activity.getCalendar";
    public const string AnalyticsGetSummary = "analytics.getSummary";
    public const string ApplicationsList = "applications.list";
    public const string ApplicationsGetDetail = "applications.getDetail";
    public const string ApplicationsGetIcon = "applications.getIcon";
    public const string SessionsGetDetail = "sessions.getDetail";
    public const string SearchQuery = "search.query";
    public const string CoverageGet = "coverage.get";
    public const string BackgroundGet = "background.get";
    public const string SystemLive = "system.live";
    public const string SettingsGet = "settings.get";
    public const string SettingsUpdate = "settings.update";
    public const string TrackingPause = "tracking.pause";
    public const string TrackingResume = "tracking.resume";
    public const string DataDeleteRange = "data.deleteRange";
    public const string DataDeleteApplication = "data.deleteApplication";
    public const string DataDeleteAll = "data.deleteAll";
    public const string DataExport = "data.export";
    public const string ProtectionStatus = "protection.status";
    public const string ProtectionSetup = "protection.setup";
    public const string ProtectionUnlock = "protection.unlock";
    public const string ProtectionLock = "protection.lock";
    public const string ProtectionDisable = "protection.disable";
    public const string ProtectionLog = "protection.log";

    /// <summary>
    /// The complete contract surface. ContractSurfaceTests asserts the router's
    /// registered handlers equal this set, so a method cannot be added to one
    /// side of the contract without the other noticing.
    /// </summary>
    public static readonly IReadOnlyList<string> All =
    [
        SystemHello,
        SystemStatus,
        ActivityGetCurrent,
        ActivityGetDay,
        ActivityGetTimeline,
        ActivityGetCalendar,
        AnalyticsGetSummary,
        ApplicationsList,
        ApplicationsGetDetail,
        ApplicationsGetIcon,
        SessionsGetDetail,
        SearchQuery,
        CoverageGet,
        BackgroundGet,
        SystemLive,
        SettingsGet,
        SettingsUpdate,
        TrackingPause,
        TrackingResume,
        DataDeleteRange,
        DataDeleteApplication,
        DataDeleteAll,
        DataExport,
        ProtectionStatus,
        ProtectionSetup,
        ProtectionUnlock,
        ProtectionLock,
        ProtectionDisable,
        ProtectionLog,
    ];
}

// ---------------------------------------------------------------------------
// system
// ---------------------------------------------------------------------------

public sealed record HelloResult(string ContractVersion, string TrackerVersion, int SchemaVersion);

public sealed record TrackerStatus(
    TrackingState State,
    bool TrackingEnabled,
    long StartedAt,
    long LastHeartbeatAt,
    string? LastError);

// ---------------------------------------------------------------------------
// activity
// ---------------------------------------------------------------------------

/// <summary>Half-open range [FromUtcMs, ToUtcMs). Local-day bounds are computed by the UI.</summary>
public sealed record DayRange(long FromUtcMs, long ToUtcMs);

public sealed record CurrentActivity(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    string? WindowTitle,
    long StartedAt,
    int ActiveSeconds,
    int IdleSeconds,
    TrackingState State);

public sealed record DayActivity(
    DayRange Range,
    int TotalActiveSeconds,
    int TotalIdleSeconds,
    int ApplicationCount,
    int SessionCount,
    IReadOnlyList<ApplicationSummary> Applications,
    IReadOnlyList<HourBucket> HourBuckets);

public sealed record HourBucket(long StartUtcMs, int ActiveSeconds);

/// <summary>
/// Totals per day, for the calendar. The client supplies local midnights as UTC
/// milliseconds rather than a range and a timezone: a month can contain a
/// daylight-saving change, and that arithmetic belongs where the locale is.
/// </summary>
public sealed record CalendarQuery(IReadOnlyList<long> DayStartsUtcMs)
{
    public const int MaxDays = 400;
}

public sealed record CalendarDay(
    long StartUtcMs,
    int ActiveSeconds,
    int SessionCount,
    int ApplicationCount);

/// <summary>
/// Analytics over a set of days. Same shape as <see cref="CalendarQuery"/> and
/// for the same reason: the client owns the local-day boundaries. Hour-of-day
/// falls out of them — an hour's index is how many hours it sits after that
/// day's midnight — so a by-hour picture needs no timezone here either.
/// </summary>
public sealed record AnalyticsQuery(IReadOnlyList<long> DayStartsUtcMs);

public sealed record AnalyticsSummary(
    long FromUtcMs,
    long ToUtcMs,
    int ActiveSeconds,
    int IdleSeconds,
    int ApplicationCount,
    int SessionCount,
    int RecordedDayCount,
    int AverageActiveSecondsPerRecordedDay,
    IReadOnlyList<CalendarDay> Days,
    long? BusiestDayStartUtcMs,
    IReadOnlyList<AnalyticsHour> Hours,
    IReadOnlyList<ApplicationSummary> TopApplications,
    LongestSession? LongestSession)
{
    /// <summary>How many applications the summary carries. The rest are in the totals.</summary>
    public const int TopApplicationCount = 8;
}

public sealed record AnalyticsHour(int Hour, int ActiveSeconds);

public sealed record LongestSession(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    long StartedAt,
    int ActiveSeconds);

public sealed record TimelineQuery(long FromUtcMs, long ToUtcMs, int? MinSessionSeconds);

/// <summary>
/// Discriminated by <c>kind</c>: "session" or "system". System intervals
/// (locked / asleep / paused) are derived from the events table; they are not
/// stored as sessions.
///
/// The discriminator is emitted by the serializer rather than declared as a
/// property. Without the polymorphic attributes, a list typed as the base would
/// serialise every element as the base — the UI would receive rows with nothing
/// in them but a kind.
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(TimelineSessionEntry), typeDiscriminator: "session")]
[JsonDerivedType(typeof(TimelineSystemEntry), typeDiscriminator: "system")]
public abstract record TimelineEntry;

public sealed record TimelineSessionEntry(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    string? PrimaryWindowTitle,
    int WindowChangeCount,
    long StartedAt,
    long? EndedAt,
    int ActiveSeconds,
    int IdleSeconds,
    EndReason? EndReason,
    bool Merged) : TimelineEntry;

public sealed record TimelineSystemEntry(
    string Interval,
    long StartedAt,
    long? EndedAt) : TimelineEntry;

// ---------------------------------------------------------------------------
// applications
// ---------------------------------------------------------------------------

public sealed record ApplicationSummary(
    long ApplicationId,
    string Name,
    string Executable,
    int ActiveSeconds,
    int IdleSeconds,
    int SessionCount,
    long LastUsedAt);

/// <summary>
/// Where the usage card's periods begin, in local time. Supplied by the client
/// for the same reason every other boundary is: the tracker does not know the
/// user's timezone, and deriving "today" from UTC midnight was three hours out
/// for anyone on UTC+3.
/// </summary>
public sealed record UsagePeriods(
    long TodayStartUtcMs,
    long YesterdayStartUtcMs,
    long Last7DaysStartUtcMs);

public sealed record ApplicationDetail(
    long ApplicationId,
    string Name,
    string Executable,
    string? Path,
    long FirstSeen,
    long LastSeen,
    ApplicationUsage Usage,
    IReadOnlyList<ApplicationSessionRow> Sessions,
    IReadOnlyList<WindowRollupRow> Windows,
    string? Category,
    IReadOnlyList<ApplicationAlias> Aliases);

public sealed record ApplicationIconQuery(long ApplicationId);

/// <summary>The application's real icon as a PNG data URL, or null when none could be read.</summary>
public sealed record ApplicationIcon(long ApplicationId, string? DataUrl);

/// <summary>
/// One observed executable behind an application profile. <c>Link</c> is
/// 'package' (verified), 'executable-name' (inferred) or 'self'.
/// </summary>
public sealed record ApplicationAlias(
    long ExecutableId,
    string Executable,
    string Name,
    string? Path,
    string? PackageFamily,
    string? IdentitySource,
    string Link,
    long FirstSeen,
    long LastSeen,
    int SessionCount);

public sealed record ApplicationUsage(
    int TodayActiveSeconds,
    int YesterdayActiveSeconds,
    int Last7DaysActiveSeconds,
    int AllTimeActiveSeconds);

public sealed record ApplicationSessionRow(
    long SessionId,
    long StartedAt,
    long? EndedAt,
    int ActiveSeconds,
    int IdleSeconds,
    EndReason? EndReason);

public sealed record WindowRollupRow(string Title, int DurationSeconds, int Occurrences);

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

public sealed record SessionDetail(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    long StartedAt,
    long? EndedAt,
    int ActiveSeconds,
    int IdleSeconds,
    EndReason? EndReason,
    IReadOnlyList<WindowSessionRow> WindowSessions,
    IReadOnlyList<EventRow> Events,
    // The process that owned the window, when observed (Trace 2.0 onwards).
    long? ProcessId = null,
    string? ExecutablePath = null);

public sealed record WindowSessionRow(
    long WindowSessionId,
    string? Title,
    long StartedAt,
    long? EndedAt,
    int DurationSeconds);

public sealed record EventRow(
    long EventId,
    long Timestamp,
    EventType Type,
    long? ApplicationId,
    long? SessionId,
    JsonElement? Metadata);

// ---------------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------------

public sealed record CoverageQuery(long FromUtcMs, long ToUtcMs);

/// <summary>Every moment of a range, explained: recorded, or a labelled gap.</summary>
/// <param name="TraceHistoryFrom">Trace's first recorded session; nothing before it is Trace's.</param>
/// <param name="WindowsRecordsFrom">The oldest Windows record held; before it, gaps are unknown.</param>
public sealed record CoverageReport(
    long FromUtcMs,
    long ToUtcMs,
    long? TraceHistoryFrom,
    long? WindowsRecordsFrom,
    IReadOnlyList<CoverageSegment> Segments);

/// <param name="Kind">
/// recorded | locked | paused | asleep (Trace's own records), or a gap:
/// powered-off | asleep | signed-out (Windows records), trace-stopped (inferred: Trace not
/// running) | unrecorded-window (inferred: Trace running, the window in front not recordable) | unknown,
/// or before-trace (earlier than Trace's first record).
/// </param>
/// <param name="Evidence">observed | inferred | unknown.</param>
/// <param name="Source">trace | windows | none.</param>
/// <param name="EvidenceIds">The records this segment rests on, e.g. "S-12", "WR-4".</param>
public sealed record CoverageSegment(
    string Kind,
    long StartedAt,
    long? EndedAt,
    string Evidence,
    string Source,
    bool StartEstimated,
    IReadOnlyList<string> EvidenceIds,
    string Explanation);

// ---------------------------------------------------------------------------
// background apps
// ---------------------------------------------------------------------------

public sealed record BackgroundQuery(long FromUtcMs, long ToUtcMs);

/// <param name="Enabled">Whether "Record background apps" is on.</param>
/// <param name="RecordingSince">The first process ever recorded, or null.</param>
public sealed record BackgroundReport(bool Enabled, long? RecordingSince, int RunningNow, IReadOnlyList<BackgroundApp> Apps);

/// <param name="ApplicationId">The application profile, as everywhere else.</param>
/// <param name="RunningSeconds">Time at least one of its processes ran in the range.</param>
/// <param name="ForegroundSeconds">Time it was in front in the range; the rest of RunningSeconds was background.</param>
public sealed record BackgroundApp(
    long ApplicationId,
    string Name,
    string? Category,
    int InstanceCount,
    int RunningNow,
    int RunningSeconds,
    int ForegroundSeconds,
    long FirstStartedAt,
    long LastSeenAt,
    IReadOnlyList<ProcessInstanceRow> Instances);

/// <param name="StartObserved">True when the start is Windows' own creation time; false when it is the first poll that saw it.</param>
/// <param name="EndState">running | ended (seen to end, to within the poll interval) | unknown (recording stopped first).</param>
public sealed record ProcessInstanceRow(
    long InstanceId,
    long Pid,
    long? ParentPid,
    string? ParentExecutable,
    string Executable,
    string? Path,
    long StartedAt,
    bool StartObserved,
    long? EndedAt,
    string EndState,
    long LastSeenAt);

// ---------------------------------------------------------------------------
// protection (the Trace PIN, auto-restart and the tamper log)
// ---------------------------------------------------------------------------

/// <param name="Enabled">A PIN is set, so pausing, quitting and weakening settings ask for it.</param>
/// <param name="UnlockedUntilUtcMs">While in the future, guarded actions are allowed without the PIN.</param>
/// <param name="LockedOutUntilUtcMs">After too many wrong tries, no PIN is checked until then.</param>
/// <param name="AutoRestart">The scheduled task that restarts Trace is installed and switched on.</param>
public sealed record ProtectionStatus(
    bool Enabled,
    long? UnlockedUntilUtcMs,
    long? LockedOutUntilUtcMs,
    int FailedAttempts,
    bool AutoRestart);

/// <param name="RecoveryCode">Shown once. Only its hash is kept.</param>
public sealed record ProtectionSetupResult(string RecoveryCode, ProtectionStatus Status);

/// <param name="Kind">See the TypeScript TamperKind for the list.</param>
/// <param name="FromUtcMs">For a stop: when Trace was last known to be running.</param>
/// <param name="ToUtcMs">For a stop: when it was running again.</param>
public sealed record TamperEntry(
    long Id,
    long AtUtcMs,
    string Kind,
    string Detail,
    long? FromUtcMs,
    long? ToUtcMs);

// ---------------------------------------------------------------------------
// system (live only; nothing here is stored)
// ---------------------------------------------------------------------------

public sealed record SystemLive(
    long AtUtcMs,
    CpuLive Cpu,
    MemoryLive Memory,
    GpuLive? Gpu,
    IReadOnlyList<ConnectedDevice> Devices,
    int ProcessCount,
    IReadOnlyList<LiveProcess> Processes);

/// <param name="UsagePercent">Whole-machine use since the previous reading; 0 on the first.</param>
public sealed record CpuLive(string Name, int LogicalCores, double UsagePercent);

public sealed record MemoryLive(long TotalBytes, long UsedBytes);

/// <param name="UsagePercent">The busiest adapter's busiest engine type, as Task Manager reports it.</param>
public sealed record GpuLive(IReadOnlyList<string> Names, double UsagePercent, long? DedicatedUsedBytes, long? DedicatedTotalBytes);

/// <param name="Kind">keyboard | mouse | speaker | microphone | camera | display | storage | phone | bluetooth | printer | controller.</param>
/// <param name="Connection">USB | Bluetooth | Built-in.</param>
public sealed record ConnectedDevice(string Name, string Kind, string Connection, string? Manufacturer);

/// <param name="Executable">Processes are grouped by program file.</param>
/// <param name="ApplicationId">The application profile, when Trace has seen this program before.</param>
public sealed record LiveProcess(string Executable, string Name, long? ApplicationId, int Count, double CpuPercent, long MemoryBytes);

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

public sealed record SearchQueryParams(string Text, long? FromUtcMs, long? ToUtcMs, int? Limit)
{
    public const int MinTextLength = 2;
    public const int DefaultLimit = 100;
    public const int MaxLimit = 500;
}

public sealed record SearchResult(
    long SessionId,
    long ApplicationId,
    string ApplicationName,
    string Executable,
    string? MatchedTitle,
    string MatchedOn,
    long StartedAt,
    long? EndedAt,
    int DurationSeconds);

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

public enum RetentionPolicy
{
    FOREVER,
    ONE_YEAR,
    NINETY_DAYS,
    THIRTY_DAYS,
}

public enum ThemePreference
{
    DARK,
    LIGHT,
    SYSTEM,
}

/// <summary>
/// How times are shown.
///
/// SYSTEM follows the Windows regional setting, which is the right default:
/// whichever the user already reads everywhere else.
///
/// Display only — timestamps are stored and transported as UTC milliseconds and
/// are unaffected by this.
/// </summary>
public enum ClockFormat
{
    SYSTEM,
    TWELVE_HOUR,
    TWENTY_FOUR_HOUR,
}

public sealed record Settings(
    bool TrackingEnabled,
    bool RecordWindowTitles,
    bool IdleDetectionEnabled,
    int IdleThresholdSeconds,
    IReadOnlyList<string> ExcludedExecutables,
    RetentionPolicy Retention,
    bool StartWithWindows,
    bool LaunchMinimised,
    ClockFormat ClockFormat,
    ThemePreference Theme,
    bool DeveloperLogging,
    bool BackgroundNoticeShown,
    string DataDirectory,
    bool OnboardingCompleted,
    // Defaulted so a settings.json written before it existed still loads, and loads as on.
    bool ImportWindowsRecords = true,
    // Off until the owner turns it on: it records every process in the session.
    bool RecordBackgroundApps = false);

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

public sealed record DeleteResult(
    int SessionsDeleted,
    int WindowSessionsDeleted,
    int EventsDeleted,
    int ApplicationsDeleted);

public sealed record ExportResult(
    string AbsolutePath,
    long BytesWritten,
    int SessionsExported,
    int EventsExported);
