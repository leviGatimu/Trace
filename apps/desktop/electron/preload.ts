import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire surface the interface is allowed to reach.
 *
 * Deliberately tiny: a method name, some JSON, and two subscriptions. The
 * renderer has no filesystem, no sockets, no process control, and no way to
 * reach the tracker except by naming a method the contract declares.
 */
const api = {
  request(method: string, params?: unknown) {
    return ipcRenderer.invoke('trace:request', method, params);
  },

  getConnectionState() {
    return ipcRenderer.invoke('trace:state');
  },

  restartTracker() {
    return ipcRenderer.invoke('trace:restart-tracker');
  },

  onConnectionState(handler: (state: unknown) => void) {
    const listener = (_event: unknown, state: unknown) => handler(state);
    ipcRenderer.on('trace:state', listener);
    return () => ipcRenderer.off('trace:state', listener);
  },

  onPush(handler: (message: { event: string; data: unknown }) => void) {
    const listener = (_event: unknown, message: { event: string; data: unknown }) =>
      handler(message);
    ipcRenderer.on('trace:push', listener);
    return () => ipcRenderer.off('trace:push', listener);
  },
};

contextBridge.exposeInMainWorld('trace', api);

export type TraceBridge = typeof api;
