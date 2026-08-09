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
  | 'E_INTERNAL';

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
 * `DOCS/data and database.md` §5.
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
  | 'sessions.getDetail'
  | 'search.query'
  | 'settings.get'
  | 'settings.update'
  | 'tracking.pause'
  | 'tracking.resume'
  | 'data.deleteRange'
  | 'data.deleteApplication'
  | 'data.deleteAll'
  | 'data.export';

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
  'sessions.getDetail',
  'search.query',
  'settings.get',
  'settings.update',
  'tracking.pause',
  'tracking.resume',
  'data.deleteRange',
  'data.deleteApplication',
  'data.deleteAll',
  'data.export',
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
   * display. `DOCS/Tracking.md` §F. Raw rows are never altered — this is a
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
  matchedOn: 'title' | 'application';
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
