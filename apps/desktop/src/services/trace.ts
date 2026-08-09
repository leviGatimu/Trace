import {
  DELETE_ALL_CONFIRMATION,
  type ApplicationDetail,
  type ApplicationSummary,
  type CurrentActivity,
  type DayActivity,
  type DayRange,
  type DeleteResult,
  type ExportResult,
  type IpcMethod,
  type SearchResult,
  type SessionDetail,
  type Settings,
  type SettingsPatch,
  type TimelineEntry,
  type TrackerStatus,
} from '@trace/contracts';

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; trackerVersion: string; schemaVersion: number }
  | { status: 'unavailable'; reason: string }
  | { status: 'incompatible'; trackerContractVersion: string };

interface BridgeResponse {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

interface TraceBridge {
  request(method: string, params?: unknown): Promise<BridgeResponse>;
  getConnectionState(): Promise<ConnectionState>;
  restartTracker(): Promise<{ started: boolean; message: string }>;
  chooseExportPath(): Promise<string | null>;
  openFolder(folder: string): Promise<string>;
  onConnectionState(handler: (state: ConnectionState) => void): () => void;
  onPush(handler: (message: { event: string; data: unknown }) => void): () => void;
}

declare global {
  interface Window {
    trace: TraceBridge;
  }
}

/** A failure the tracker reported, carrying its contract error code. */
export class TraceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TraceError';
  }

  get isUnavailable(): boolean {
    return this.code === 'TRACKER_UNAVAILABLE';
  }
}

async function call<T>(method: IpcMethod, params?: unknown): Promise<T> {
  const response = await window.trace.request(method, params);

  if (!response.ok) {
    throw new TraceError(
      response.error?.code ?? 'E_INTERNAL',
      response.error?.message ?? 'The tracker could not complete that request.',
    );
  }

  return response.result as T;
}

/**
 * Every call the interface can make, named after the contract.
 *
 * Nothing here computes anything. Durations, totals, counts and buckets all
 * arrive already calculated — DOCS/data and database.md §26 is explicit that
 * the interface must not be the thing deciding how long you used Chrome.
 */
export const trace = {
  status: () => call<TrackerStatus>('system.status'),
  current: () => call<CurrentActivity | null>('activity.getCurrent'),

  day: (range: DayRange) => call<DayActivity>('activity.getDay', range),
  timeline: (range: DayRange, minSessionSeconds?: number) =>
    call<TimelineEntry[]>('activity.getTimeline', { ...range, minSessionSeconds }),

  applications: (range: DayRange) => call<ApplicationSummary[]>('applications.list', range),
  application: (applicationId: number, range: DayRange) =>
    call<ApplicationDetail>('applications.getDetail', { applicationId, ...range }),

  session: (sessionId: number) => call<SessionDetail>('sessions.getDetail', { sessionId }),

  search: (text: string, limit = 100) => call<SearchResult[]>('search.query', { text, limit }),

  settings: () => call<Settings>('settings.get'),
  updateSettings: (patch: SettingsPatch) => call<Settings>('settings.update', patch),

  pause: () => call<TrackerStatus>('tracking.pause'),
  resume: () => call<TrackerStatus>('tracking.resume'),

  deleteRange: (range: DayRange) => call<DeleteResult>('data.deleteRange', range),
  deleteApplication: (applicationId: number) =>
    call<DeleteResult>('data.deleteApplication', { applicationId }),

  /**
   * The confirmation string is required by the contract, so there is no
   * unguarded call that erases everything. The interface supplies it only after
   * the user has typed it.
   */
  deleteEverything: () => call<DeleteResult>('data.deleteAll', { confirm: DELETE_ALL_CONFIRMATION }),

  exportTo: (absolutePath: string) => call<ExportResult>('data.export', { absolutePath }),
};

export const bridge = {
  connectionState: () => window.trace.getConnectionState(),
  onConnectionState: (handler: (state: ConnectionState) => void) =>
    window.trace.onConnectionState(handler),
  onPush: (handler: (message: { event: string; data: unknown }) => void) =>
    window.trace.onPush(handler),
  restartTracker: () => window.trace.restartTracker(),
  chooseExportPath: () => window.trace.chooseExportPath(),
  openFolder: (folder: string) => window.trace.openFolder(folder),
};
