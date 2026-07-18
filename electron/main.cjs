// Photobooth kiosk shell (Electron main process)
//
// This is the "appliance" layer described in Part 1 of the kiosk plan. It
// replaces Chromium entirely and becomes the only thing a guest ever sees.
//
// Design goals:
//   - Fullscreen, frameless, always-on-top kiosk window.
//   - Touchscreen and mouse can NEVER escape the app (no menus, no popups,
//     no navigation away, no window close, no zoom, no devtools).
//   - The ONLY way out is a deliberate physical-keyboard chord
//     (default: Control+Alt+Shift+Q). A touchscreen/mouse cannot produce a
//     key chord, so this satisfies "physical keyboard only".
//
// Everything is configurable through environment variables so the same build
// works in dev (Vite on :5173) and production (Express on :3000).

const {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  session,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

// --- Configuration (env-overridable) ---------------------------------------

const CONFIG = {
  // URL the kiosk loads. Local Express server by default.
  url: process.env.KIOSK_URL || 'http://localhost:3000',
  // Physical-keyboard chord that quits the kiosk. Accelerator syntax:
  // https://www.electronjs.org/docs/latest/api/accelerator
  exitAccelerator: process.env.KIOSK_EXIT_ACCELERATOR || 'Control+Alt+Shift+Q',
  // Optionally require a PIN before the exit chord actually quits. Leave unset
  // to quit immediately on the chord.
  exitPin: process.env.KIOSK_EXIT_PIN || '',
  // If set (to a shell command), the main process spawns the server itself so
  // the whole appliance is a single launchable app. Otherwise it assumes the
  // server is already running (e.g. started by pm2 / a LaunchAgent).
  serverCmd: process.env.KIOSK_SERVER_CMD || '',
  // How long to keep retrying the server URL before showing an error.
  startupTimeoutMs: Number(process.env.KIOSK_STARTUP_TIMEOUT_MS || 60_000),
  // Allow Electron/Chrome devtools + reload (debugging the shell itself).
  dev: process.env.KIOSK_DEV === '1',
};

let mainWindow = null;
let serverProcess = null;
let allowQuit = false; // flipped only by the deliberate exit path

// --- Single instance lock --------------------------------------------------
// A second launch (e.g. LaunchAgent double-fire) must never spawn a 2nd window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// --- Server lifecycle ------------------------------------------------------

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function pingUrl(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      // Any HTTP response means the server is up enough to load.
      res.resume();
      resolve(res.statusCode != null && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingUrl(url)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Works out where the config, frontend, and bundled server live for both the
// packaged "double-click" app and unpackaged dev runs.
//
// Packaged layout (portable folder the user copies around):
//   <folder>/PhotoBooth.app            <- the executable
//   <folder>/config.json               <- editable config, respected at runtime
//   <folder>/sessions/                 <- captures land here (writable)
// while the frontend + bundled server ride inside the .app's resources.
function resolvePortableLayout() {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    const exeDir = path.dirname(app.getPath('exe')); // .../PhotoBooth.app/Contents/MacOS
    const portableDir = path.resolve(exeDir, '..', '..', '..'); // folder containing the .app
    const configPath =
      process.env.PHOTOBOOTH_CONFIG || path.join(portableDir, 'config.json');

    // First-run bootstrap: seed an editable config.json next to the app so a
    // non-technical user has something to edit, instead of a hard error.
    if (!fs.existsSync(configPath)) {
      const example = path.join(res, 'config.example.json');
      try {
        if (fs.existsSync(example)) fs.copyFileSync(example, configPath);
      } catch (err) {
        console.error('[kiosk] could not seed config.json:', err.message);
      }
    }

    return {
      configPath,
      distPath: path.join(res, 'dist'),
      serverEntry: path.join(res, 'server', 'server.cjs'),
      workdir: portableDir,
    };
  }

  // Dev / unpackaged: everything lives in the repo. The server is started
  // separately (e.g. `pnpm kiosk`) unless KIOSK_SERVER_CMD is set.
  const root = path.resolve(__dirname, '..');
  return {
    configPath: process.env.PHOTOBOOTH_CONFIG || path.join(root, 'config.json'),
    distPath: path.join(root, 'dist'),
    serverEntry: null,
    workdir: root,
  };
}

function readPort(configPath, fallback) {
  try {
    const json = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (json && json.app && json.app.port) return json.app.port;
  } catch {
    /* fall through to default */
  }
  return fallback;
}

function maybeSpawnServer(layout) {
  if (CONFIG.serverCmd) {
    // Explicit override (any platform / dev).
    serverProcess = spawn(CONFIG.serverCmd, {
      cwd: layout.workdir,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });
  } else if (app.isPackaged && layout.serverEntry) {
    // Run the bundled server using Electron's OWN Node runtime. This is what
    // makes the build portable: no system Node / pnpm / tsx required.
    //
    // A Finder-launched .app inherits a minimal PATH (/usr/bin:/bin:...) that
    // excludes Homebrew, so the server's child processes (gphoto2, ffmpeg)
    // would fail with ENOENT — no camera control and a black preview. Prepend
    // the common Homebrew bin dirs so those external binaries are found.
    const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin'];
    const mergedPath = [...extraPaths, process.env.PATH || '']
      .filter(Boolean)
      .join(path.delimiter);
    serverProcess = spawn(process.execPath, [layout.serverEntry], {
      cwd: layout.workdir,
      stdio: 'inherit',
      env: {
        ...process.env,
        PATH: mergedPath,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PHOTOBOOTH_CONFIG: layout.configPath,
        PHOTOBOOTH_DIST: layout.distPath,
      },
    });
  } else {
    return; // dev: server already running via `pnpm kiosk`
  }

  serverProcess.on('exit', (code) => {
    console.error(`[kiosk] server process exited with code ${code}`);
    serverProcess = null;
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
}

// --- Window ----------------------------------------------------------------

function createWindow() {
  const allowedOrigin = originOf(CONFIG.url);

  mainWindow = new BrowserWindow({
    show: false,
    fullscreen: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    // Keep the window pinned above everything except true OS surfaces.
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: CONFIG.dev,
      // Block <webview> and similar embedding escapes.
      webviewTag: false,
      spellcheck: false,
    },
  });

  // Stay above other windows even when they request focus.
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenScreens: true });

  // No application menu at all (kills Cmd+Q/Cmd+W/Cmd+H accelerators that the
  // default menu would otherwise wire up).
  Menu.setApplicationMenu(null);

  const wc = mainWindow.webContents;

  // Lock zoom (pinch + keyboard) so guests can't break the layout.
  wc.setVisualZoomLevelLimits(1, 1).catch(() => {});
  wc.on('zoom-changed', () => wc.setZoomLevel(0));
  wc.setZoomLevel(0);

  // Never open new windows / popups.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Never navigate off the app's own origin.
  wc.on('will-navigate', (e, navUrl) => {
    if (originOf(navUrl) !== allowedOrigin) e.preventDefault();
  });
  wc.on('will-redirect', (e, navUrl) => {
    if (originOf(navUrl) !== allowedOrigin) e.preventDefault();
  });

  // Block escape/refresh/devtools shortcuts at the Chromium layer. This runs
  // before the page sees the event, so it works even if the React layer's
  // KioskGuard is not active yet. The deliberate exit chord is intentionally
  // NOT handled here (it's a global shortcut) so it keeps working.
  wc.on('before-input-event', (event, input) => {
    if (CONFIG.dev) return;
    if (input.type !== 'keyDown') return;

    const key = (input.key || '').toLowerCase();
    const mod = input.control || input.meta || input.alt;

    const blocked =
      key === 'f11' || // fullscreen toggle
      key === 'f5' || // reload
      ((input.control || input.meta) && key === 'r') || // reload
      ((input.control || input.meta) && key === 'w') || // close tab/window
      ((input.control || input.meta) && key === 'q') || // quit
      ((input.control || input.meta) && key === 'm') || // minimize
      ((input.control || input.meta) && key === 'h') || // hide
      (input.meta && key === 'tab') || // app switch
      (input.meta && key === '`') || // window cycle
      ((input.control || input.meta) && input.shift && key === 'i') || // devtools
      (key === 'f12') || // devtools
      // Zoom (Cmd/Ctrl + +/-/0)
      (mod && (key === '=' || key === '+' || key === '-' || key === '0'));

    if (blocked) {
      event.preventDefault();
    }
  });

  // Crash / hang recovery: reload the kiosk rather than dying to a blank screen.
  wc.on('render-process-gone', () => {
    if (!allowQuit && mainWindow) loadWithRetry();
  });
  wc.on('unresponsive', () => {
    if (!allowQuit && mainWindow) wc.reloadIgnoringCache();
  });

  // The window must not be closable by anything except the deliberate exit.
  mainWindow.on('close', (e) => {
    if (!allowQuit) e.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

async function loadWithRetry() {
  if (!mainWindow) return;
  const ok = await waitForServer(CONFIG.url, CONFIG.startupTimeoutMs);
  if (!ok) {
    console.error(`[kiosk] server not reachable at ${CONFIG.url}`);
  }
  try {
    await mainWindow.loadURL(CONFIG.url);
  } catch (err) {
    console.error('[kiosk] loadURL failed, retrying in 2s:', err.message);
    setTimeout(loadWithRetry, 2000);
  }
}

// --- Deliberate exit (physical keyboard only) ------------------------------

function performExit() {
  allowQuit = true;
  stopServer();
  app.quit();
}

function registerExitShortcut() {
  const ok = globalShortcut.register(CONFIG.exitAccelerator, async () => {
    if (!CONFIG.exitPin) {
      performExit();
      return;
    }
    // Optional confirm gate. A native dialog can't be triggered or dismissed by
    // the web page (touch/mouse), so it acts as a deliberate second step that
    // still requires the physical keyboard chord to reach.
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Exit kiosk'],
      defaultId: 0,
      cancelId: 0,
      title: 'Exit kiosk',
      message: 'Exit the photobooth kiosk?',
      detail: 'Choose "Exit kiosk" to quit, or "Cancel" to stay in the booth.',
    });
    if (response === 1) performExit();
  });
  if (!ok) {
    console.error(`[kiosk] failed to register exit shortcut ${CONFIG.exitAccelerator}`);
  }
}

// --- Network hardening ------------------------------------------------------

function hardenSession() {
  // Deny all permission requests (camera/mic/geolocation/etc.) by default —
  // the booth's camera is driven server-side via gphoto2, not the browser.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

// --- App lifecycle ----------------------------------------------------------

app.whenReady().then(() => {
  const layout = resolvePortableLayout();

  // Respect config.json: derive the kiosk URL from app.port unless the operator
  // pinned KIOSK_URL explicitly.
  if (!process.env.KIOSK_URL) {
    const port = readPort(layout.configPath, 3000);
    CONFIG.url = `http://localhost:${port}`;
  }

  hardenSession();
  maybeSpawnServer(layout);
  createWindow();
  loadWithRetry();
  registerExitShortcut();
});

// Keep running even if the window is somehow closed (re-create it) unless the
// deliberate exit was triggered.
app.on('window-all-closed', () => {
  if (allowQuit) {
    app.quit();
  } else {
    createWindow();
    loadWithRetry();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopServer();
});

// Belt-and-suspenders: block any attempt to attach a webview or open external.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', (e) => e.preventDefault());
});
