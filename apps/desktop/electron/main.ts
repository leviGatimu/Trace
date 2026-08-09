import { spawn } from 'node:child_process';
import path from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import { TrackerClient, type ConnectionState } from './tracker-client.js';

// __dirname, not import.meta.url: this is bundled to CommonJS, where
// import.meta is empty. Getting it wrong resolves the preload script and the
// built page to the wrong place and the window comes up blank.
const directory = __dirname;
const devServerUrl = process.env['VITE_DEV_SERVER_URL'];

const client = new TrackerClient();
let mainWindow: BrowserWindow | null = null;

/**
 * Only one dashboard. A second launch — from the Start menu, or from the tray's
 * "Open Trace" — focuses the existing window instead of opening a rival copy.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  void start();
}

async function start(): Promise<void> {
  await app.whenReady();

  registerHandlers();
  createWindow();

  client.on('state', (state: ConnectionState) => {
    mainWindow?.webContents.send('trace:state', state);
  });

  client.on('push', (event: string, data: unknown) => {
    mainWindow?.webContents.send('trace:push', { event, data });
  });

  void client.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

/**
 * Closing the window quits the dashboard.
 *
 * DOCS/Windows Integration §9 requires that closing the window not stop
 * tracking — and it does not, because tracking is a different process
 * altogether. Since the tracker owns the tray icon, there is nothing for
 * Trace.exe to do in the background, so it exits rather than sitting in memory
 * for no reason.
 */
app.on('window-all-closed', () => {
  client.stop();
  app.quit();
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#0D0F12',
    title: 'Trace',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'),
      // The renderer gets no Node and no direct access to anything outside the
      // page. Everything it can do crosses the narrow surface in preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Shown only once painted, so launching never flashes an empty white frame.
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Nothing in Trace should open a browser, but if a link ever appears it must
  // not navigate the application window out from under the user.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(directory, '../dist/index.html'));
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function registerHandlers(): void {
  ipcMain.handle('trace:request', async (_event, method: string, params?: unknown) => {
    try {
      return { ok: true, result: await client.request(method, params) };
    } catch (error) {
      // Errors cross as data rather than as thrown exceptions, so the renderer
      // can distinguish "the tracker said no" from "the bridge broke".
      return {
        ok: false,
        error: {
          code: error instanceof Error ? error.name : 'E_INTERNAL',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  });

  ipcMain.handle('trace:state', () => client.getState());

  ipcMain.handle('trace:restart-tracker', () => restartTracker());

  /**
   * Where to save an export.
   *
   * The dialog belongs here because the renderer has no filesystem access at
   * all. It returns a path, and the tracker — which owns the data — does the
   * writing, after validating the destination itself.
   */
  ipcMain.handle('trace:choose-export-path', async () => {
    const suggested = `trace-export-${new Date().toISOString().slice(0, 10)}.json`;

    const result = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: 'Export your Trace history',
      defaultPath: path.join(app.getPath('documents'), suggested),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('trace:open-folder', (_event, folder: string) => shell.openPath(folder));
}

/**
 * Starts TraceTracker.exe, for the "Tracker unavailable / [Restart Tracker]"
 * state (DOCS/Windows Integration §21).
 *
 * Detached, so the tracker outlives the dashboard that started it — which is
 * the whole point of keeping them separate.
 */
function restartTracker(): { started: boolean; message: string } {
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'tracker', 'TraceTracker.exe')
    : path.resolve(
        directory,
        '../../../tracker/Trace.Tracker/bin/Debug/net10.0-windows10.0.17763.0/win-x64/TraceTracker.exe',
      );

  try {
    const child = spawn(executable, [], { detached: true, stdio: 'ignore' });
    child.unref();

    return { started: true, message: 'Starting the tracker…' };
  } catch (error) {
    return {
      started: false,
      message: error instanceof Error ? error.message : 'Could not start the tracker.',
    };
  }
}
