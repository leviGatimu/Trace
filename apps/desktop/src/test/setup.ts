import type { ConnectionState } from '@/services/trace';

/**
 * A stand-in for the preload bridge.
 *
 * Component tests drive the interface through exactly the surface the real
 * renderer has — a method name and some JSON — so a test cannot accidentally
 * exercise a capability the shipped renderer does not possess.
 */
export interface MockBridgeOptions {
  connection?: ConnectionState;
  responses?: Record<string, unknown>;
  onRequest?: (method: string, params?: unknown) => void;
}

export function installMockBridge(options: MockBridgeOptions = {}) {
  const connection: ConnectionState = options.connection ?? {
    status: 'connected',
    trackerVersion: '0.1.0-test',
    schemaVersion: 1,
  };

  const restartTracker = vi.fn(async () => ({ started: true, message: 'Starting…' }));

  const bridge = {
    async request(method: string, params?: unknown) {
      options.onRequest?.(method, params);

      if (!(method in (options.responses ?? {}))) {
        return {
          ok: false,
          error: { code: 'E_UNKNOWN_METHOD', message: `No mock for '${method}'.` },
        };
      }

      return { ok: true, result: options.responses![method] };
    },
    getConnectionState: async () => connection,
    restartTracker,
    onConnectionState: () => () => {},
    onPush: () => () => {},
  };

  Object.defineProperty(window, 'trace', { value: bridge, writable: true, configurable: true });

  return { restartTracker };
}
