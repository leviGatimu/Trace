using System.Text.Json;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Data.Queries;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;
using Trace.Tracker.Privacy;
using Trace.Tracker.Settings;

namespace Trace.Tracker.Ipc;

/// <summary>Everything the IPC handlers need, wired once by the host.</summary>
internal sealed record TrackerServices(
    SessionEngine Engine,
    PrivacyGate Gate,
    SettingsStore Settings,
    ActivityQueries Activity,
    SearchQueries Search,
    DataOperations Data,
    IClock Clock,
    Action<Signal> PostSignal,
    Func<string> TrackerVersion,
    Func<int> SchemaVersion,
    Func<long> StartedAtUtcMs);

/// <summary>
/// Turns a request line into a response line.
///
/// Deliberately synchronous and free of transport concerns: it takes a string
/// and returns a string, so the whole contract surface can be exercised in
/// tests without a pipe, a client, or a running tracker.
/// </summary>
internal sealed class RequestRouter
{
    private readonly TrackerServices _services;
    private readonly Dictionary<string, Func<JsonElement?, object?>> _handlers;

    public RequestRouter(TrackerServices services)
    {
        _services = services;
        _handlers = new Dictionary<string, Func<JsonElement?, object?>>(StringComparer.Ordinal)
        {
            [IpcMethods.SystemHello] = _ => Hello(),
            [IpcMethods.SystemStatus] = _ => Status(),
            [IpcMethods.ActivityGetCurrent] = _ => CurrentActivity(),
            [IpcMethods.ActivityGetDay] = GetDay,
            [IpcMethods.ActivityGetTimeline] = GetTimeline,
            [IpcMethods.ApplicationsList] = ListApplications,
            [IpcMethods.ApplicationsGetDetail] = GetApplicationDetail,
            [IpcMethods.SessionsGetDetail] = GetSessionDetail,
            [IpcMethods.SearchQuery] = Search,
            [IpcMethods.SettingsGet] = _ => _services.Settings.Current,
            [IpcMethods.SettingsUpdate] = UpdateSettings,
            [IpcMethods.TrackingPause] = _ => SetTracking(enabled: false),
            [IpcMethods.TrackingResume] = _ => SetTracking(enabled: true),
            [IpcMethods.DataDeleteRange] = DeleteRange,
            [IpcMethods.DataDeleteApplication] = DeleteApplication,
            [IpcMethods.DataDeleteAll] = DeleteAll,
            [IpcMethods.DataExport] = Export,
        };
    }

    /// <summary>
    /// The registered method names. <c>ContractSurfaceTests</c> asserts this
    /// equals <see cref="IpcMethods.All"/>, so a method cannot be added to the
    /// contract and forgotten here, or implemented here and never declared.
    /// </summary>
    public IReadOnlyCollection<string> Methods => _handlers.Keys;

    public string Handle(string requestLine)
    {
        IpcRequest? request = null;

        try
        {
            request = JsonSerializer.Deserialize<IpcRequest>(requestLine, ContractJson.Options);
        }
        catch (JsonException ex)
        {
            Log.Warn($"Malformed IPC request: {ex.Message}");
        }

        if (request is null || string.IsNullOrEmpty(request.Method))
        {
            return Serialize(IpcResponse.Failure(
                request?.Id ?? "0", IpcErrorCode.E_BAD_PARAMS, "Malformed request."));
        }

        if (!_handlers.TryGetValue(request.Method, out var handler))
        {
            return Serialize(IpcResponse.Failure(
                request.Id, IpcErrorCode.E_UNKNOWN_METHOD, $"Unknown method '{request.Method}'."));
        }

        try
        {
            return Serialize(IpcResponse.Success(request.Id, handler(request.Params)));
        }
        catch (IpcException ex)
        {
            return Serialize(IpcResponse.Failure(request.Id, ex.Code, ex.Message));
        }
        catch (Exception ex)
        {
            // The message is logged, never returned: an exception message can
            // carry a file path or a window title, and the dashboard has no use
            // for it beyond "something went wrong".
            Log.Error($"IPC handler '{request.Method}' failed.", ex);
            return Serialize(IpcResponse.Failure(
                request.Id, IpcErrorCode.E_INTERNAL, "The tracker could not complete that request."));
        }
    }

    // -- system -------------------------------------------------------------

    private HelloResult Hello() =>
        new(ContractInfo.Version, _services.TrackerVersion(), _services.SchemaVersion());

    private TrackerStatus Status()
    {
        var state = _services.Gate.IsDegraded ? TrackingState.DEGRADED : _services.Engine.State;

        return new TrackerStatus(
            state,
            _services.Settings.Current.TrackingEnabled,
            _services.StartedAtUtcMs(),
            _services.Clock.UtcNowMs,
            state == TrackingState.DEGRADED
                ? "Trace has stopped recording because its database is unavailable."
                : null);
    }

    private Contracts.CurrentActivity? CurrentActivity()
    {
        if (_services.Engine.Current is not { } current)
        {
            return null;
        }

        // Extend whichever counter is currently running up to now, so the live
        // timer ticks between transitions rather than freezing until the next
        // heartbeat. Only one of them advances, so active + idle stays exactly
        // the elapsed time.
        var sinceSnapshotSeconds =
            (int)Math.Max(0, (_services.Clock.UtcNowMs - current.AsOfUtcMs) / 1000);
        var isIdle = current.State == TrackingState.IDLE;

        return new Contracts.CurrentActivity(
            current.SessionId,
            current.ApplicationId,
            current.ApplicationName,
            current.Executable,
            current.WindowTitle,
            current.StartedAt,
            current.ActiveSeconds + (isIdle ? 0 : sinceSnapshotSeconds),
            current.IdleSeconds + (isIdle ? sinceSnapshotSeconds : 0),
            current.State);
    }

    // -- activity -----------------------------------------------------------

    private object GetDay(JsonElement? parameters)
    {
        var range = Require<DayRange>(parameters);
        ValidateRange(range.FromUtcMs, range.ToUtcMs);

        return _services.Activity.GetDay(
            range, SessionMerger.DefaultMinSessionSeconds, _services.Clock.UtcNowMs);
    }

    private object GetTimeline(JsonElement? parameters)
    {
        var query = Require<TimelineQuery>(parameters);
        ValidateRange(query.FromUtcMs, query.ToUtcMs);

        return _services.Activity.GetTimeline(query, _services.Clock.UtcNowMs);
    }

    private object ListApplications(JsonElement? parameters)
    {
        var range = Require<DayRange>(parameters);
        ValidateRange(range.FromUtcMs, range.ToUtcMs);

        return _services.Activity.ListApplications(
            range, SessionMerger.DefaultMinSessionSeconds, _services.Clock.UtcNowMs);
    }

    private object GetApplicationDetail(JsonElement? parameters)
    {
        var request = Require<ApplicationDetailRequest>(parameters);
        ValidateRange(request.FromUtcMs, request.ToUtcMs);

        return _services.Activity.GetApplicationDetail(
                   request.ApplicationId,
                   new DayRange(request.FromUtcMs, request.ToUtcMs),
                   SessionMerger.DefaultMinSessionSeconds,
                   _services.Clock.UtcNowMs)
               ?? throw new IpcException(IpcErrorCode.E_NOT_FOUND, "No such application.");
    }

    private object GetSessionDetail(JsonElement? parameters)
    {
        var request = Require<SessionDetailRequest>(parameters);

        return _services.Activity.GetSessionDetail(request.SessionId)
               ?? throw new IpcException(IpcErrorCode.E_NOT_FOUND, "No such session.");
    }

    private object Search(JsonElement? parameters) =>
        _services.Search.Search(Require<SearchQueryParams>(parameters), _services.Clock.UtcNowMs);

    // -- settings and tracking ---------------------------------------------

    private object UpdateSettings(JsonElement? parameters)
    {
        var patch = Require<SettingsPatch>(parameters);

        return _services.Settings.Update(current => current with
        {
            TrackingEnabled = patch.TrackingEnabled ?? current.TrackingEnabled,
            RecordWindowTitles = patch.RecordWindowTitles ?? current.RecordWindowTitles,
            IdleDetectionEnabled = patch.IdleDetectionEnabled ?? current.IdleDetectionEnabled,
            IdleThresholdSeconds = patch.IdleThresholdSeconds ?? current.IdleThresholdSeconds,
            ExcludedExecutables = patch.ExcludedExecutables ?? current.ExcludedExecutables,
            Retention = patch.Retention ?? current.Retention,
            StartWithWindows = patch.StartWithWindows ?? current.StartWithWindows,
            LaunchMinimised = patch.LaunchMinimised ?? current.LaunchMinimised,
            ClockFormat = patch.ClockFormat ?? current.ClockFormat,
            Theme = patch.Theme ?? current.Theme,
            DeveloperLogging = patch.DeveloperLogging ?? current.DeveloperLogging,
            OnboardingCompleted = patch.OnboardingCompleted ?? current.OnboardingCompleted,
        });
    }

    /// <summary>
    /// Pause and resume.
    ///
    /// The setting is written before the signal is posted, in both directions.
    /// On pause that means the gate refuses new records from the instant the
    /// user clicks, before the engine has even processed the transition. On
    /// resume it means the gate is already open by the time the engine tries to
    /// start a session, rather than refusing the first one.
    /// </summary>
    private TrackerStatus SetTracking(bool enabled)
    {
        _services.Settings.Update(current => current with { TrackingEnabled = enabled });

        var now = _services.Clock.UtcNowMs;
        _services.PostSignal(enabled ? new ResumeRequested(now) : new PauseRequested(now));

        return Status();
    }

    // -- data ---------------------------------------------------------------

    private object DeleteRange(JsonElement? parameters)
    {
        var range = Require<DayRange>(parameters);
        ValidateRange(range.FromUtcMs, range.ToUtcMs);

        return _services.Data.DeleteRange(range.FromUtcMs, range.ToUtcMs);
    }

    private object DeleteApplication(JsonElement? parameters) =>
        _services.Data.DeleteApplication(Require<ApplicationRequest>(parameters).ApplicationId);

    private object DeleteAll(JsonElement? parameters)
    {
        var request = Require<DeleteAllRequest>(parameters);

        // A literal confirmation, so there is no unguarded call that erases
        // everything (contract §5.1).
        if (!string.Equals(request.Confirm, ContractInfo.DeleteAllConfirmation, StringComparison.Ordinal))
        {
            throw new IpcException(
                IpcErrorCode.E_BAD_PARAMS,
                $"Deleting all history requires confirm = '{ContractInfo.DeleteAllConfirmation}'.");
        }

        return _services.Data.DeleteEverything();
    }

    private object Export(JsonElement? parameters)
    {
        var request = Require<ExportRequest>(parameters);

        if (DataOperations.ValidateExportPath(request.AbsolutePath) is { } problem)
        {
            throw new IpcException(IpcErrorCode.E_PATH, problem);
        }

        return _services.Data.Export(request.AbsolutePath!, request.FromUtcMs, request.ToUtcMs);
    }

    // -- plumbing -----------------------------------------------------------

    private static T Require<T>(JsonElement? parameters)
    {
        if (parameters is not { } element || element.ValueKind == JsonValueKind.Null)
        {
            throw new IpcException(IpcErrorCode.E_BAD_PARAMS, "This method requires parameters.");
        }

        try
        {
            return element.Deserialize<T>(ContractJson.Options)
                   ?? throw new IpcException(IpcErrorCode.E_BAD_PARAMS, "Parameters were empty.");
        }
        catch (JsonException ex)
        {
            throw new IpcException(IpcErrorCode.E_BAD_PARAMS, ex.Message);
        }
    }

    /// <summary>
    /// A year is a generous ceiling for one request and a cheap guard against a
    /// bug in the caller asking the tracker to materialise all of history.
    /// </summary>
    private static void ValidateRange(long fromUtcMs, long toUtcMs)
    {
        if (toUtcMs <= fromUtcMs)
        {
            throw new IpcException(IpcErrorCode.E_RANGE, "The range must end after it starts.");
        }

        if (toUtcMs - fromUtcMs > TimeSpan.FromDays(366).TotalMilliseconds)
        {
            throw new IpcException(IpcErrorCode.E_RANGE, "The range must not exceed one year.");
        }
    }

    private static string Serialize(IpcResponse response) =>
        JsonSerializer.Serialize(response, ContractJson.Options);
}

/// <summary>A failure with a contract error code, safe to return to the client.</summary>
internal sealed class IpcException(IpcErrorCode code, string message) : Exception(message)
{
    public IpcErrorCode Code { get; } = code;
}

// Request shapes that exist only as method parameters.
internal sealed record ApplicationDetailRequest(long ApplicationId, long FromUtcMs, long ToUtcMs);

internal sealed record ApplicationRequest(long ApplicationId);

internal sealed record SessionDetailRequest(long SessionId);

internal sealed record DeleteAllRequest(string? Confirm);

internal sealed record ExportRequest(string? AbsolutePath, long? FromUtcMs, long? ToUtcMs);

/// <summary>
/// The mutable half of <see cref="Contracts.Settings"/>. Every field is optional
/// so a caller can change one setting without restating the rest, and the
/// read-only fields simply do not exist here.
/// </summary>
internal sealed record SettingsPatch(
    bool? TrackingEnabled,
    bool? RecordWindowTitles,
    bool? IdleDetectionEnabled,
    int? IdleThresholdSeconds,
    IReadOnlyList<string>? ExcludedExecutables,
    RetentionPolicy? Retention,
    bool? StartWithWindows,
    bool? LaunchMinimised,
    ClockFormat? ClockFormat,
    ThemePreference? Theme,
    bool? DeveloperLogging,
    bool? OnboardingCompleted);
