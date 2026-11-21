const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

// Prevent multiple duplicate desktop instances on Windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setAppUserModelId('com.devmind.studio');

let embeddedHttpServer = null;
let mainWindow = null;

function getStartupLogFile() {
  try {
    return path.join(app.getPath('userData'), 'startup.log');
  } catch {
    return path.join(os.tmpdir(), 'devmind-studio-startup.log');
  }
}

function logStartup(message, err) {
  try {
    const logPath = getStartupLogFile();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const detail = err ? `\n${err.stack || err.message || String(err)}` : '';
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}${detail}\n`, 'utf8');
  } catch {
    // Non-fatal
  }
}

function getWindowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStateFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      width: typeof parsed.width === 'number' ? Math.max(1080, parsed.width) : 1440,
      height: typeof parsed.height === 'number' ? Math.max(700, parsed.height) : 900,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch {
    return { width: 1440, height: 900, isMaximized: false };
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(
      getWindowStateFile(),
      JSON.stringify({ width: bounds.width, height: bounds.height, isMaximized }, null, 2),
      'utf8'
    );
  } catch {
    // Non-fatal
  }
}

function findAvailablePort(startPort = 3456) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => resolve(findAvailablePort(startPort + 1)));
    srv.listen(startPort, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      srv.close(() => resolve(port));
    });
  });
}

function resolveResourcePath(relativePath) {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app.asar.unpacked', relativePath),
        path.join(app.getAppPath(), relativePath),
        path.join(process.resourcesPath, relativePath),
      ]
    : [path.resolve(__dirname, '..', relativePath)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

async function startEmbeddedBackend() {
  const port = await findAvailablePort(3456);
  const serverBundlePath = resolveResourcePath(path.join('dist-server', 'server.cjs'));
  const distDir = resolveResourcePath('dist');
  const dataDir = path.join(app.getPath('userData'), 'data');

  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(serverBundlePath)) {
    throw new Error(
      `Bundled backend server not found at "${serverBundlePath}". Run "npm run build:server" before packaging.`
    );
  }

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(
      `Production web assets not found at "${distDir}". Run "npm run build" before packaging.`
    );
  }

  process.env.DEVMIND_EMBEDDED = '1';
  process.env.NODE_ENV = 'production';
  process.env.DEVMIND_DATA_DIR = dataDir;
  process.env.DEVMIND_DIST_DIR = distDir;

  logStartup(`Starting embedded backend from ${serverBundlePath} (dist=${distDir}, data=${dataDir})`);

  // Run pre-bundled Express backend directly in-process using Electron's embedded Node runtime.
  // Requires ZERO external Node.js, ZERO tsx, ZERO child processes, and starts in <50ms.
  const serverModule = require(serverBundlePath);
  if (typeof serverModule.startServer !== 'function') {
    throw new Error('Bundled server module does not export startServer().');
  }

  const started = await serverModule.startServer({
    port,
    host: '127.0.0.1',
    distDir,
    dataDir,
  });

  embeddedHttpServer = started.server;
  logStartup(`Embedded backend listening on http://127.0.0.1:${started.port}`);
  return started.port;
}

function stopBackend() {
  if (!embeddedHttpServer) return;
  try {
    embeddedHttpServer.close();
  } catch {
    // ignore shutdown errors
  }
  embeddedHttpServer = null;
}

function getAppIconPath() {
  const candidates =
    process.platform === 'win32'
      ? [
          resolveResourcePath(path.join('electron', 'assets', 'icon.ico')),
          resolveResourcePath(path.join('electron', 'assets', 'icon.png')),
          resolveResourcePath(path.join('build', 'icon.ico')),
          resolveResourcePath(path.join('build', 'icon.png')),
        ]
      : [
          resolveResourcePath(path.join('electron', 'assets', 'icon.png')),
          resolveResourcePath(path.join('electron', 'assets', 'icon.ico')),
          resolveResourcePath(path.join('build', 'icon.png')),
          resolveResourcePath(path.join('build', 'icon.ico')),
        ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function isAllowedAuthPopupUrl(rawUrl) {
  if (!rawUrl || rawUrl === 'about:blank') return true;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === 'accounts.google.com' ||
      host === 'apis.google.com' ||
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.web.app') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.gstatic.com')
    );
  } catch {
    return false;
  }
}

async function createWindow() {
  const port = await startEmbeddedBackend();
  const baseUrl = `http://127.0.0.1:${port}`;

  const state = loadWindowState();
  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#1C1C1E',
    title: 'DevMind Studio',
    ...(iconPath ? { icon: iconPath } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    if (state.isMaximized) mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false);
  });

  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Allow Firebase/Google Sign-In OAuth popups while sending regular external links to default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAuthPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          backgroundColor: '#1C1C1E',
          parent: mainWindow || undefined,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(baseUrl);
}

// Native Desktop Window IPC Controls
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:is-maximized', () => Boolean(mainWindow?.isMaximized()));

ipcMain.handle('system:info', () => ({
  platform: process.platform,
  arch: process.arch,
  release: os.release(),
  osRelease: os.release(),
  electronVersion: process.versions.electron || 'desktop',
  nodeVersion: process.versions.node || '22',
  memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  totalMemoryGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
  appVersion: app.getVersion(),
}));

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

process.on('uncaughtException', (err) => {
  logStartup('Uncaught exception in Electron main process', err);
});

process.on('unhandledRejection', (reason) => {
  logStartup('Unhandled rejection in Electron main process', reason instanceof Error ? reason : new Error(String(reason)));
});

app.whenReady().then(() => {
  createWindow().catch((err) => {
    logStartup('Fatal startup error in createWindow()', err);
    dialog.showErrorBox(
      'DevMind Studio Startup Error',
      `${err instanceof Error ? err.message : String(err)}\n\nDiagnostic log saved to:\n${getStartupLogFile()}`
    );
    stopBackend();
    app.quit();
  });
});

app.on('before-quit', stopBackend);

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
