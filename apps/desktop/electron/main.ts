import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
let hasTriedStartingTracker = false;

/**
 * Only one dashboard. A second launch — from the Start menu, or from the tray's
 * "Open Trace" — focuses the existing window instead of opening a rival copy.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    showWindow();

    // The tray passes --route=/settings when the user picks Settings. Honouring
    // it on the second instance is what makes those menu items land where they
    // say they will, whether or not a window was already open.
    const route = routeFromArgv(argv);
    if (route) {
      mainWindow?.webContents.send('trace:navigate', route);
    }
  });

  void start();
}

function routeFromArgv(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--route='));
  const route = argument?.slice('--route='.length);

  // Only in-application paths. An argument that could send the window to an
  // arbitrary URL would be a way to turn a tray click into a navigation
  // primitive.
  return route && route.startsWith('/') && !route.startsWith('//') ? route : null;
}

async function start(): Promise<void> {
  await app.whenReady();

  registerHandlers();
  createWindow();

  client.on('state', (state: ConnectionState) => {
    mainWindow?.webContents.send('trace:state', state);

    // First run after installing, nothing has started the tracker yet, and the
    // first thing a new user would otherwise see is "Tracker unavailable" —
    // which is both alarming and their problem to solve. Opening the dashboard
    // starts it, once. If that fails, the manual button takes over rather than
    // this retrying forever.
    if (state.status === 'unavailable' && !hasTriedStartingTracker) {
      hasTriedStartingTracker = true;
      restartTracker();
    }
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
    width: 1360,
    height: 880,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: 'Trace',

    /*
      Frameless. Trace draws its own title bar (src/components/TitleBar.tsx),
      because the default one is a strip of somebody else's design language
      across the top of a window that is otherwise entirely ours.

      `frame: false` rather than `titleBarStyle: 'hidden'` with a
      `titleBarOverlay`: the overlay keeps Windows' own control glyphs, and the
      point of this is to stop using them. What we give up is the Windows 11
      Snap Layouts flyout, which only appears on a native maximise button —
      Win+Z still opens it, and dragging to a screen edge still snaps.

      The window stays resizable: Electron keeps the sizing borders on a
      frameless window, and double-clicking a drag region still maximises.
    */
    frame: false,

    // The title bar and taskbar icon. electron-builder stamps this into the
    // packaged executable, but a development run has no such resource and falls
    // back to Electron's own icon — which is why the window has been wearing
    // somebody else's logo.
    icon: resolveAppIcon(),

    // Solid. Translucency was tried and rejected: it made a dense tool look
    // like a widget, and it fights with the one thing this window is for —
    // reading columns of small text.
    backgroundColor: '#0B0C0F',
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
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();

    const route = routeFromArgv(process.argv);
    if (route) {
      mainWindow?.webContents.send('trace:navigate', route);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  /*
    The maximise button has two shapes, and the window can change state without
    the button being what changed it — Win+Up, a double-click on the drag
    region, dragging to the top of the screen. Pushing the state means the glyph
    is never a lie about what clicking it will do.
  */
  const publishWindowState = () => {
    mainWindow?.webContents.send('trace:window-state', {
      maximized: mainWindow.isMaximized(),
    });
  };
  mainWindow.on('maximize', publishWindowState);
  mainWindow.on('unmaximize', publishWindowState);

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

/**
 * The application icon.
 *
 * Packaged, it ships beside the executable in resources; in development it is
 * still in `brand/` at the repository root. Returns undefined rather than a
 * missing path if neither exists, so a stripped install shows Electron's icon
 * instead of failing to open a window.
 */
function resolveAppIcon(): string | undefined {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'brand', 'trace.ico')]
    : [path.resolve(directory, '../../../brand/trace.ico')];

  return candidates.find((candidate) => existsSync(candidate));
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

  /*
    Window controls.

    These exist only because the window is frameless; they do exactly what the
    caption buttons used to do and nothing more. Each resolves the window at
    call time rather than closing over it, so a control pressed after the window
    was recreated acts on the current one instead of a dead reference.
  */
  ipcMain.handle('trace:window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('trace:window-toggle-maximize', () => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }

    return mainWindow.isMaximized();
  });

  /*
    close(), not destroy(): it runs `window-all-closed`, which stops the pipe
    client and quits cleanly. Tracking is unaffected either way — that is a
    different process.
  */
  ipcMain.handle('trace:window-close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('trace:window-is-maximized', () => mainWindow?.isMaximized() ?? false);
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
