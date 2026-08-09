import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { promisify } from 'node:util';
import {
  CONTRACT_VERSION,
  PIPE_NAME_PREFIX,
  type HelloResult,
  type IpcMethod,
  type IpcResponse,
} from '@trace/contracts';

const execFileAsync = promisify(execFile);

/** Longest a single request may take before the caller is told it failed. */
const REQUEST_TIMEOUT_MS = 15_000;

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; trackerVersion: string; schemaVersion: number }
  | { status: 'unavailable'; reason: string }
  | { status: 'incompatible'; trackerContractVersion: string };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * The UI's connection to TraceTracker.exe.
 *
 * Lives in the Electron main process: the renderer has no Node access and never
 * touches a socket, so a compromised page cannot reach the pipe directly.
 *
 * The tracker is the source of truth and outlives this process, so the client
 * is written to expect the tracker to come and go — reconnecting on its own,
 * and reporting an honest "unavailable" rather than serving stale data as
 * though it were live (DOCS/Windows Integration §21).
 */
export class TrackerClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<string, Pending>();
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private pipePath: string | null = null;

  private state: ConnectionState = { status: 'connecting' };

  getState(): ConnectionState {
    return this.state;
  }

  async start(): Promise<void> {
    this.pipePath = `\\\\.\\pipe\\${PIPE_NAME_PREFIX}${await currentUserSid()}`;
    this.connect();
  }

  stop(): void {
    this.closed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.socket?.destroy();
    this.socket = null;
    this.failAllPending('The application is closing.');
  }

  /**
   * Sends a request and resolves with its result.
   *
   * Rejects rather than queueing when disconnected: a dashboard that silently
   * holds requests until the tracker returns would show a spinner where it
   * should show "tracker unavailable".
   */
  request<T>(method: IpcMethod | string, params?: unknown): Promise<T> {
    if (!this.socket || this.state.status !== 'connected') {
      return Promise.reject(new Error('TRACKER_UNAVAILABLE'));
    }

    return this.send<T>(method, params);
  }

  private send<T>(method: string, params?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket) {
      return Promise.reject(new Error('TRACKER_UNAVAILABLE'));
    }

    const id = String(this.nextId++);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The tracker did not answer '${method}' in time.`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      socket.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (error) {
          this.settle(id, () => reject(error));
        }
      });
    });
  }

  private connect(): void {
    if (this.closed || !this.pipePath) {
      return;
    }

    this.setState({ status: 'connecting' });

    const socket = net.connect(this.pipePath);
    this.socket = socket;
    socket.setEncoding('utf8');

    socket.on('connect', () => {
      void this.handshake();
    });

    socket.on('data', (chunk: string) => this.receive(chunk));

    socket.on('error', (error) => {
      // ENOENT simply means the tracker is not running. That is an ordinary
      // state for this product, not a failure worth shouting about.
      this.setState({
        status: 'unavailable',
        reason:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'The Trace tracker is not running.'
            : error.message,
      });
    });

    socket.on('close', () => {
      this.socket = null;
      this.failAllPending('The connection to the tracker was lost.');

      if (this.state.status === 'connected') {
        this.setState({ status: 'unavailable', reason: 'The tracker stopped responding.' });
      }

      this.scheduleReconnect();
    });
  }

  /**
   * `system.hello` must be the first request on every connection (contract §3).
   *
   * A version mismatch is reported, never worked around: guessing at a protocol
   * we do not understand is how a dashboard ends up showing confident, wrong
   * numbers.
   */
  private async handshake(): Promise<void> {
    try {
      const hello = await this.send<HelloResult>('system.hello');
      const major = (version: string) => version.split('.')[0];

      if (major(hello.contractVersion) !== major(CONTRACT_VERSION)) {
        this.setState({
          status: 'incompatible',
          trackerContractVersion: hello.contractVersion,
        });
        return;
      }

      this.reconnectDelay = RECONNECT_MIN_MS;
      this.setState({
        status: 'connected',
        trackerVersion: hello.trackerVersion,
        schemaVersion: hello.schemaVersion,
      });
    } catch (error) {
      this.setState({
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'Handshake failed.',
      });
      this.socket?.destroy();
    }
  }

  private receive(chunk: string): void {
    this.buffer += chunk;

    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');

      if (line.length > 0) {
        this.dispatch(line);
      }
    }
  }

  private dispatch(line: string): void {
    let message: IpcResponse<unknown> | { event: string; data: unknown };

    try {
      message = JSON.parse(line);
    } catch {
      // A frame we cannot parse is the tracker's problem, not something to
      // crash the dashboard over.
      return;
    }

    if ('event' in message) {
      this.emit('push', message.event, message.data);
      return;
    }

    this.settle(message.id, (pending) => {
      if (message.ok) {
        pending.resolve(message.result);
      } else {
        const error = new Error(message.error.message);
        error.name = message.error.code;
        pending.reject(error);
      }
    });
  }

  private settle(id: string, apply: (pending: Pending) => void): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);
    apply(pending);
  }

  private failAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(new Error(reason));
    }
  }

  /** Backoff, so a stopped tracker is not hammered once per tick all day. */
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
      this.connect();
    }, this.reconnectDelay);
  }

  private setState(state: ConnectionState): void {
    const changed =
      this.state.status !== state.status ||
      (state.status === 'unavailable' &&
        this.state.status === 'unavailable' &&
        this.state.reason !== state.reason);

    this.state = state;

    if (changed) {
      this.emit('state', state);
    }
  }
}

let cachedSid: string | null = null;

/**
 * The current user's SID, which names the pipe.
 *
 * Derived here rather than read from a file the tracker writes, so the UI can
 * report "tracker not running" without needing the tracker to have run first.
 */
async function currentUserSid(): Promise<string> {
  if (cachedSid) {
    return cachedSid;
  }

  const { stdout } = await execFileAsync('whoami', ['/user', '/fo', 'csv', '/nh']);
  const sid = stdout.trim().split(',').pop()?.replaceAll('"', '').trim();

  if (!sid?.startsWith('S-1-')) {
    throw new Error(`Could not determine the current user's SID (got '${stdout.trim()}').`);
  }

  cachedSid = sid;
  return sid;
}
