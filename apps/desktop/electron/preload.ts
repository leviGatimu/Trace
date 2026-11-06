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

  /** Opens a save dialog. Returns the chosen path, or null if cancelled. */
  chooseExportPath(): Promise<string | null> {
    return ipcRenderer.invoke('trace:choose-export-path');
  },

  /** Opens a folder in Explorer. Used only for the data location in Settings. */
  openFolder(folder: string): Promise<string> {
    return ipcRenderer.invoke('trace:open-folder', folder);
  },

  onConnectionState(handler: (state: unknown) => void) {
    const listener = (_event: unknown, state: unknown) => handler(state);
    ipcRenderer.on('trace:state', listener);
    return () => ipcRenderer.off('trace:state', listener);
  },

  /** The tray asking for a particular page. */
  onNavigate(handler: (route: string) => void) {
    const listener = (_event: unknown, route: string) => handler(route);
    ipcRenderer.on('trace:navigate', listener);
    return () => ipcRenderer.off('trace:navigate', listener);
  },

  onPush(handler: (message: { event: string; data: unknown }) => void) {
    const listener = (_event: unknown, message: { event: string; data: unknown }) =>
      handler(message);
    ipcRenderer.on('trace:push', listener);
    return () => ipcRenderer.off('trace:push', listener);
  },

  /**
   * The frameless window's caption buttons.
   *
   * Named `windowControls` rather than `window` so nothing in this file — or in
   * anything reading the bridge — has a property that shadows the global.
   */
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke('trace:window-minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('trace:window-toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('trace:window-close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('trace:window-is-maximized'),

    onMaximizedChange(handler: (maximized: boolean) => void) {
      const listener = (_event: unknown, state: { maximized: boolean }) =>
        handler(state.maximized);
      ipcRenderer.on('trace:window-state', listener);
      return () => ipcRenderer.off('trace:window-state', listener);
    },
  },
};

contextBridge.exposeInMainWorld('trace', api);

export type TraceBridge = typeof api;
