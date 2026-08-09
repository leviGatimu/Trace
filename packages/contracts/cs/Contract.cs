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
    public const string ApplicationsList = "applications.list";
    public const string ApplicationsGetDetail = "applications.getDetail";
    public const string SessionsGetDetail = "sessions.getDetail";
    public const string SearchQuery = "search.query";
    public const string SettingsGet = "settings.get";
    public const string SettingsUpdate = "settings.update";
    public const string TrackingPause = "tracking.pause";
    public const string TrackingResume = "tracking.resume";
    public const string DataDeleteRange = "data.deleteRange";
    public const string DataDeleteApplication = "data.deleteApplication";
    public const string DataDeleteAll = "data.deleteAll";
    public const string DataExport = "data.export";

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
        ApplicationsList,
        ApplicationsGetDetail,
        SessionsGetDetail,
        SearchQuery,
        SettingsGet,
        SettingsUpdate,
        TrackingPause,
        TrackingResume,
        DataDeleteRange,
        DataDeleteApplication,
        DataDeleteAll,
        DataExport,
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

public sealed record ApplicationDetail(
    long ApplicationId,
    string Name,
    string Executable,
    string? Path,
    long FirstSeen,
    long LastSeen,
    ApplicationUsage Usage,
    IReadOnlyList<ApplicationSessionRow> Sessions,
    IReadOnlyList<WindowRollupRow> Windows);

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
    IReadOnlyList<EventRow> Events);

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
    bool OnboardingCompleted);

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
