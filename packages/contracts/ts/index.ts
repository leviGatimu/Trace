/**
 * Trace IPC contract — machine-readable half of `packages/contracts/ipc-contract.md`.
 *
 * Mirrored by `packages/contracts/cs/Contract.cs`. When you change one, change
 * both and bump CONTRACT_VERSION.
 *
 * Units (see contract §4):
 *   - `*At` / `*UtcMs` are UTC epoch MILLISECONDS.
 *   - `*Seconds` are whole SECONDS.
 * The UI formats these values. It never derives them.
 */

export const CONTRACT_VERSION = '1.0';

/** Pipe name is per-user; `<sid>` is the current user's SID. */
export const PIPE_NAME_PREFIX = 'Trace.';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface IpcRequest<P = unknown> {
  id: string;
  method: IpcMethod;
  params?: P;
}

export type IpcResponse<R = unknown> =
  | { id: string; ok: true; result: R }
  | { id: string; ok: false; error: IpcError };

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcErrorCode =
  | 'E_UNKNOWN_METHOD'
  | 'E_BAD_PARAMS'
  | 'E_RANGE'
  | 'E_NOT_FOUND'
  | 'E_PATH'
  | 'E_DEGRADED'
  | 'E_BUSY'
  | 'E_INTERNAL'
  /** The action needs the Trace PIN. Unlock with protection.unlock, then retry. */
  | 'E_LOCKED';

export interface IpcPush<D = unknown> {
  event: PushEvent;
  data: D;
}

export type PushEvent =
  | 'state.changed'
  | 'activity.changed'
  | 'settings.changed'
  | 'data.changed';

// ---------------------------------------------------------------------------
// Domain vocabulary
// ---------------------------------------------------------------------------

/**
 * Why a session ended. Mirrors the `sessions.end_reason` column.
 * `DOCS/specs/data-and-database.md` §5.
 */
export type EndReason =
  | 'APP_SWITCH'
  | 'APP_EXIT'
  | 'SYSTEM_LOCK'
  | 'SYSTEM_SLEEP'
  | 'TRACKING_PAUSED'
  | 'SYSTEM_SHUTDOWN'
  | 'CRASH_RECOVERY';

/** Mirrors the `events.type` column. */
export type EventType =
  | 'FOREGROUND_CHANGED'
  | 'WINDOW_CHANGED'
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'IDLE_STARTED'
  | 'IDLE_ENDED'
  | 'SYSTEM_LOCKED'
  | 'SYSTEM_UNLOCKED'
  | 'SYSTEM_SLEEP'
  | 'SYSTEM_WAKE'
  | 'SYSTEM_SHUTDOWN'
  | 'TRACKING_PAUSED'
  | 'TRACKING_RESUMED'
  | 'TRACKER_STARTED'
  | 'TRACKER_RECOVERED';

/**
 * Tracker lifecycle state.
 *
 * DEGRADED means the tracker process is alive and answering IPC but the
 * database is unavailable — it has stopped writing rather than risk corruption.
 */
export type TrackingState =
  | 'ACTIVE'
  | 'IDLE'
  | 'PAUSED'
  | 'LOCKED'
  | 'SUSPENDED'
  | 'DEGRADED';

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

export type IpcMethod =
  | 'system.hello'
  | 'system.status'
  | 'activity.getCurrent'
  | 'activity.getDay'
  | 'activity.getTimeline'
  | 'activity.getCalendar'
  | 'analytics.getSummary'
  | 'applications.list'
  | 'applications.getDetail'
  | 'applications.getIcon'
  | 'sessions.getDetail'
  | 'search.query'
  | 'coverage.get'
  | 'background.get'
  | 'system.live'
  | 'settings.get'
  | 'settings.update'
  | 'tracking.pause'
  | 'tracking.resume'
  | 'data.deleteRange'
  | 'data.deleteApplication'
  | 'data.deleteAll'
  | 'data.export'
  | 'protection.status'
  | 'protection.setup'
  | 'protection.unlock'
  | 'protection.lock'
  | 'protection.disable'
  | 'protection.log';

/** Every method in the contract, for surface tests on both sides. */
export const IPC_METHODS: readonly IpcMethod[] = [
  'system.hello',
  'system.status',
  'activity.getCurrent',
  'activity.getDay',
  'activity.getTimeline',
  'activity.getCalendar',
  'analytics.getSummary',
  'applications.list',
  'applications.getDetail',
  'applications.getIcon',
  'sessions.getDetail',
  'search.query',
  'coverage.get',
  'background.get',
  'system.live',
  'settings.get',
  'settings.update',
  'tracking.pause',
  'tracking.resume',
  'data.deleteRange',
  'data.deleteApplication',
  'data.deleteAll',
  'data.export',
  'protection.status',
  'protection.setup',
  'protection.unlock',
  'protection.lock',
  'protection.disable',
  'protection.log',
] as const;

// ---------------------------------------------------------------------------
// system
// ---------------------------------------------------------------------------

export interface HelloResult {
  contractVersion: string;
  trackerVersion: string;
  /** Applied `schema_version.version` of activity.db. */
  schemaVersion: number;
}

export interface TrackerStatus {
  state: TrackingState;
  /** True unless the user has explicitly paused. Survives reboot. */
  trackingEnabled: boolean;
  startedAt: number;
  lastHeartbeatAt: number;
  /** Present only in DEGRADED; a user-safe message, never a stack trace. */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// activity
// ---------------------------------------------------------------------------

/** Half-open range `[fromUtcMs, toUtcMs)`. Computed by the UI in local time. */
export interface DayRange {
  fromUtcMs: number;
  toUtcMs: number;
}

/**
 * The Live Activity panel. Null when nothing is being tracked right now —
 * paused, locked, idle with no session, or the foreground app is excluded.
 */
export interface CurrentActivity {
  sessionId: number;
  applicationId: number;
  applicationName: string;
  executable: string;
  /** Null when window-title recording is disabled. */
  windowTitle: string | null;
  startedAt: number;
  activeSeconds: number;
  idleSeconds: number;
  state: TrackingState;
}

export interface DayActivity {
  range: DayRange;
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  applicationCount: number;
  sessionCount: number;
  applications: ApplicationSummary[];
  /** One bucket per hour of the local day, in range order. */
  hourBuckets: HourBucket[];
}

export interface HourBucket {
  startUtcMs: number;
  activeSeconds: number;
}

/**
 * Totals for a set of days, for the calendar.
 *
 * The client sends the day boundaries rather than a range plus a timezone: it
 * already computes local days elsewhere (§4), and a month can contain a
 * daylight-saving change that makes one day 23 or 25 hours long. Sending the
 * boundaries keeps that arithmetic in the one place that has a locale.
 */
export interface CalendarQuery {
  /** Local midnights as UTC milliseconds, ascending. At most 400. */
  dayStartsUtcMs: number[];
}

export interface CalendarDay {
  startUtcMs: number;
  activeSeconds: number;
  sessionCount: number;
  applicationCount: number;
}

/**
 * Analytics over a set of days.
 *
 * Same shape as `CalendarQuery`, and for the same reason: the client owns the
 * local-day boundaries. Hour-of-day is derived from them too — an hour's index
 * is how many hours it sits after that day's midnight — so the tracker can
 * build a by-hour picture without ever being told a timezone.
 */
export interface AnalyticsQuery {
  /** Local midnights as UTC milliseconds, ascending. At most 400. */
  dayStartsUtcMs: number[];
}

export interface AnalyticsSummary {
  fromUtcMs: number;
  toUtcMs: number;
  activeSeconds: number;
  idleSeconds: number;
  applicationCount: number;
  sessionCount: number;
  /** Days with any activity on them. The average is over these, not over the span. */
  recordedDayCount: number;
  averageActiveSecondsPerRecordedDay: number;
  /** One entry per day asked for, in order. */
  days: CalendarDay[];
  /** The busiest day's local midnight, or null when nothing was recorded. */
  busiestDayStartUtcMs: number | null;
  /** 24 entries, hour 0–23 of the local day, summed across the span. */
  hours: AnalyticsHour[];
  /** Ordered by active time, at most 8. */
  topApplications: ApplicationSummary[];
  longestSession: LongestSession | null;
}

export interface AnalyticsHour {
  hour: number;
  activeSeconds: number;
}

export interface LongestSession {
  sessionId: number;
  applicationId: number;
  applicationName: string;
  executable: string;
  startedAt: number;
  activeSeconds: number;
}

export interface TimelineQuery extends DayRange {
  /**
   * Sessions shorter than this are merged into surrounding activity for
   * display. `DOCS/specs/tracking.md` §F. Raw rows are never altered — this is a
   * read-model rule, applied here so the UI never implements it.
   * Default 5.
   */
  minSessionSeconds?: number;
}

/**
 * A timeline row is either an application session or a system interval
 * (locked, asleep, paused). System intervals are derived from the events
 * table; they are not stored as sessions.
 */
export type TimelineEntry = TimelineSessionEntry | TimelineSystemEntry;

export interface TimelineSessionEntry {
  kind: 'session';
  sessionId: number;
  applicationId: number;
  applicationName: string;
  executable: string;
  /** Most-used window title within the session, or null. */
  primaryWindowTitle: string | null;
  windowChangeCount: number;
  startedAt: number;
  /** Null only for the session currently open. */
  endedAt: number | null;
  activeSeconds: number;
  idleSeconds: number;
  endReason: EndReason | null;
  /** True when short sessions were folded into this row for display. */
  merged: boolean;
}

export interface TimelineSystemEntry {
  kind: 'system';
  interval: 'LOCKED' | 'ASLEEP' | 'PAUSED' | 'UNKNOWN';
  startedAt: number;
  endedAt: number | null;
}

// ---------------------------------------------------------------------------
// applications
// ---------------------------------------------------------------------------

export interface ApplicationSummary {
  applicationId: number;
  name: string;
  executable: string;
  activeSeconds: number;
  idleSeconds: number;
  sessionCount: number;
  lastUsedAt: number;
}

/**
 * Where the usage card's periods begin, in local time.
 *
 * Supplied by the client for the same reason every other boundary is (§4). The
 * tracker used to derive "today" from UTC midnight, which was three hours out
 * for anyone on UTC+3 and showed "Today 20m" beside "Not used today" — the
 * exact class of mistake the local-days rule exists to prevent.
 */
export interface UsagePeriods {
  todayStartUtcMs: number;
  yesterdayStartUtcMs: number;
  /** Local midnight six days before today: the seven-day window includes today. */
  last7DaysStartUtcMs: number;
}

export interface ApplicationDetailQuery extends DayRange, UsagePeriods {
  applicationId: number;
}

export interface ApplicationDetail {
  applicationId: number;
  name: string;
  executable: string;
  /** Null when the executable path could not be read (protected process). */
  path: string | null;
  firstSeen: number;
  lastSeen: number;
  usage: ApplicationUsage;
  sessions: ApplicationSessionRow[];
  windows: WindowRollupRow[];
  /** The registry's category, or null when Trace does not know one. */
  category: string | null;
  /** Every executable recorded under this application, most recently seen first. */
  aliases: ApplicationAlias[];
}

/**
 * How an executable came to belong to an application:
 * - `package`: it is installed inside the application's package (verified).
 * - `executable-name`: its filename matches Trace's registry (inferred).
 * - `self`: nothing links it to anything else.
 */
export type ProfileLink = 'package' | 'executable-name' | 'self';

/** The application's real icon as a PNG data URL, or null when none could be read. */
export interface ApplicationIcon {
  applicationId: number;
  dataUrl: string | null;
}

/** One observed executable behind an application. */
export interface ApplicationAlias {
  /** The raw `applications` row id: the executable as recorded. */
  executableId: number;
  executable: string;
  /** The name this executable alone would carry. */
  name: string;
  path: string | null;
  packageFamily: string | null;
  /** Where `name` came from; null when recorded by Trace 0.1. */
  identitySource: 'registry' | 'package' | 'version-info' | 'filename' | null;
  link: ProfileLink;
  firstSeen: number;
  lastSeen: number;
  /** Stored (unmerged) foreground spans recorded for this executable. */
  sessionCount: number;
}

export interface ApplicationUsage {
  todayActiveSeconds: number;
  yesterdayActiveSeconds: number;
  last7DaysActiveSeconds: number;
  allTimeActiveSeconds: number;
}

export interface ApplicationSessionRow {
  sessionId: number;
  startedAt: number;
  endedAt: number | null;
  activeSeconds: number;
  idleSeconds: number;
  endReason: EndReason | null;
}

export interface WindowRollupRow {
  title: string;
  durationSeconds: number;
  occurrences: number;
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export interface SessionDetail {
  sessionId: number;
  applicationId: number;
  applicationName: string;
  executable: string;
  startedAt: number;
  endedAt: number | null;
  activeSeconds: number;
  idleSeconds: number;
  endReason: EndReason | null;
  windowSessions: WindowSessionRow[];
  events: EventRow[];
  /** The process that owned the window; null for history recorded before Trace 2.0. */
  processId: number | null;
  /** Null when the process could not be opened (protected or elevated). */
  executablePath: string | null;
}

export interface WindowSessionRow {
  windowSessionId: number;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
}

export interface EventRow {
  eventId: number;
  timestamp: number;
  type: EventType;
  applicationId: number | null;
  sessionId: number | null;
  /** Parsed JSON metadata, or null. */
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------------

export type CoverageQuery = DayRange;

/** Every moment of a range, explained: recorded, or a labelled gap. */
export interface CoverageReport {
  fromUtcMs: number;
  toUtcMs: number;
  /** Trace's first recorded session. Nothing before it is Trace's. */
  traceHistoryFrom: number | null;
  /** The oldest Windows record held. Before it, gaps are unknown. */
  windowsRecordsFrom: number | null;
  segments: CoverageSegment[];
}

/**
 * Trace's own records: `recorded`, `locked`, `paused`, `asleep`.
 * Gaps: `powered-off`, `asleep`, `signed-out` (from Windows records),
 * `trace-stopped` (inferred: Trace was not running),
 * `unrecorded-window` (inferred: Trace was running, but the window in front was
 * an excluded or protected one it does not record), `unknown`,
 * `before-trace` (earlier than Trace's first record).
 */
export type CoverageKind =
  | 'recorded'
  | 'locked'
  | 'paused'
  | 'asleep'
  | 'powered-off'
  | 'signed-out'
  | 'trace-stopped'
  | 'unrecorded-window'
  | 'unknown'
  | 'before-trace';

export type EvidenceLabel = 'observed' | 'inferred' | 'unknown';

export interface CoverageSegment {
  kind: CoverageKind;
  startedAt: number;
  /** Null while still running. */
  endedAt: number | null;
  evidence: EvidenceLabel;
  source: 'trace' | 'windows' | 'none';
  /** The start is reconstructed (Trace's last heartbeat before it stopped unexpectedly). */
  startEstimated: boolean;
  /** Records this rests on: `S-` span, `W-` window, `E-` event, `WR-` Windows record. */
  evidenceIds: string[];
  explanation: string;
}

// ---------------------------------------------------------------------------
// background apps
// ---------------------------------------------------------------------------

export type BackgroundQuery = DayRange;

export interface BackgroundReport {
  /** Whether "Record background apps" is on. */
  enabled: boolean;
  /** The first process ever recorded, or null. */
  recordingSince: number | null;
  runningNow: number;
  apps: BackgroundApp[];
}

export interface BackgroundApp {
  /** The application profile, as everywhere else. */
  applicationId: number;
  name: string;
  category: string | null;
  instanceCount: number;
  runningNow: number;
  /** Time at least one of its processes ran in the range. */
  runningSeconds: number;
  /** Time it was in front; the rest of runningSeconds was background. */
  foregroundSeconds: number;
  firstStartedAt: number;
  lastSeenAt: number;
  instances: ProcessInstanceRow[];
}

export interface ProcessInstanceRow {
  instanceId: number;
  pid: number;
  parentPid: number | null;
  parentExecutable: string | null;
  executable: string;
  path: string | null;
  startedAt: number;
  /** True when the start is Windows' own creation time; false when it is the first check that saw it. */
  startObserved: boolean;
  endedAt: number | null;
  /** running, ended (seen to end, to within 2 seconds), or unknown (recording stopped first). */
  endState: 'running' | 'ended' | 'unknown';
  lastSeenAt: number;
}

// ---------------------------------------------------------------------------
// protection (the Trace PIN, auto-restart and the tamper log)
// ---------------------------------------------------------------------------

export interface ProtectionStatus {
  /** A PIN is set, so pausing, quitting and weakening settings ask for it. */
  enabled: boolean;
  /** While in the future, guarded actions are allowed without the PIN. */
  unlockedUntilUtcMs: number | null;
  /** After too many wrong tries, no PIN is checked until then. */
  lockedOutUntilUtcMs: number | null;
  failedAttempts: number;
  /** The scheduled task that restarts Trace is installed and switched on. */
  autoRestart: boolean;
}

export interface ProtectionSetupResult {
  /** Shown once. Only its hash is kept. */
  recoveryCode: string;
  status: ProtectionStatus;
}

export type TamperKind =
  | 'unexpected-stop'
  | 'quit'
  | 'paused'
  | 'resumed'
  | 'setting-changed'
  | 'deleted'
  | 'wrong-pin'
  | 'locked-out'
  | 'recovery-used'
  | 'settings-edited'
  | 'settings-unreadable'
  | 'auto-restart-repaired'
  | 'updated'
  | 'protection-on'
  | 'protection-off'
  | 'pin-changed'
  | 'new-history';

export interface TamperEntry {
  id: number;
  atUtcMs: number;
  kind: TamperKind;
  detail: string;
  /** For a stop: when Trace was last known to be running. */
  fromUtcMs: number | null;
  /** For a stop: when it was running again. */
  toUtcMs: number | null;
}

// ---------------------------------------------------------------------------
// system (live only; nothing here is stored)
// ---------------------------------------------------------------------------

export interface SystemLive {
  atUtcMs: number;
  cpu: { name: string; logicalCores: number; usagePercent: number };
  memory: { totalBytes: number; usedBytes: number };
  /** Null when the machine reports no graphics adapter. */
  gpu: { names: string[]; usagePercent: number; dedicatedUsedBytes: number | null; dedicatedTotalBytes: number | null } | null;
  devices: ConnectedDevice[];
  processCount: number;
  processes: LiveProcess[];
}

export type DeviceKind =
  | 'keyboard'
  | 'mouse'
  | 'speaker'
  | 'microphone'
  | 'camera'
  | 'display'
  | 'storage'
  | 'phone'
  | 'bluetooth'
  | 'printer'
  | 'controller';

export interface ConnectedDevice {
  name: string;
  kind: DeviceKind;
  connection: 'USB' | 'Bluetooth' | 'Built-in';
  manufacturer: string | null;
}

/** Processes grouped by program file. */
export interface LiveProcess {
  executable: string;
  name: string;
  /** The application profile, when Trace has seen this program before. */
  applicationId: number | null;
  count: number;
  cpuPercent: number;
  memoryBytes: number;
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export interface SearchQuery {
  /** Trimmed; queries shorter than 2 characters return an empty result set. */
  text: string;
  fromUtcMs?: number;
  toUtcMs?: number;
  /** Default 100, max 500. */
  limit?: number;
}

export interface SearchResult {
  sessionId: number;
  applicationId: number;
  applicationName: string;
  executable: string;
  /** The window title that matched, or null when the match was on app name. */
  matchedTitle: string | null;
  /** `evidence`: the search text was an evidence id (S-, W-, E-) and this is its session. */
  matchedOn: 'title' | 'application' | 'evidence';
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

export type RetentionPolicy = 'FOREVER' | 'ONE_YEAR' | 'NINETY_DAYS' | 'THIRTY_DAYS';
export type ThemePreference = 'DARK' | 'LIGHT' | 'SYSTEM';

/**
 * How times are shown.
 *
 * `SYSTEM` follows the Windows regional setting, which is the right default:
 * whichever the user already reads everywhere else. The explicit choices exist
 * because a 24-hour clock is easier to scan in a column even for people whose
 * region uses 12-hour, and the reverse is true for anyone who does not read
 * 24-hour fluently.
 *
 * Display only. Timestamps are stored and transported in UTC milliseconds and
 * are unaffected.
 */
export type ClockFormat = 'SYSTEM' | 'TWELVE_HOUR' | 'TWENTY_FOUR_HOUR';

export interface Settings {
  // Tracking
  /** Master switch. False == user paused. Persisted, survives reboot. */
  trackingEnabled: boolean;
  /** When false, `window_sessions.title` is written as NULL. */
  recordWindowTitles: boolean;
  idleDetectionEnabled: boolean;
  /** Seconds without input before the user is considered idle. Default 300. */
  idleThresholdSeconds: number;

  // Privacy
  /**
   * Normalised (lowercased) executable filenames, e.g. `1password.exe`.
   * Trace's own binaries are always excluded and never appear here.
   */
  excludedExecutables: string[];
  retention: RetentionPolicy;

  // Windows integration
  startWithWindows: boolean;
  launchMinimised: boolean;

  // Display
  clockFormat: ClockFormat;
  theme: ThemePreference;
  /** Enables Debug-level logging. Off by default: Debug may log window titles. */
  developerLogging: boolean;

  /**
   * Whether the user has been told that closing the window does not stop
   * recording. Shown once, from the tray, the first time the dashboard closes.
   */
  backgroundNoticeShown: boolean;

  // Read-only, reported by the tracker
  readonly dataDirectory: string;
  readonly onboardingCompleted: boolean;
  /** Copy power, boot and sign-in records from the Windows System log (read-only). */
  importWindowsRecords: boolean;
  /** Record every process in this session, including ones never in front (opt-in). */
  recordBackgroundApps: boolean;
}

/** Only these keys may be sent to `settings.update`. */
export type SettingsPatch = Partial<Omit<Settings, 'dataDirectory' | 'onboardingCompleted'>> & {
  onboardingCompleted?: boolean;
};

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

export interface DeleteResult {
  sessionsDeleted: number;
  windowSessionsDeleted: number;
  eventsDeleted: number;
  applicationsDeleted: number;
}

export interface ExportResult {
  absolutePath: string;
  bytesWritten: number;
  sessionsExported: number;
  eventsExported: number;
}

/** Literal confirmation required by `data.deleteAll`. */
export const DELETE_ALL_CONFIRMATION = 'DELETE ALL';
