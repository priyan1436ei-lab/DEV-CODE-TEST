const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

// Windows 11 single-instance lock & performance optimizations
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setAppUserModelId('com.devmind.studio');

let serverProcess = null;
let mainWindow = null;

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

function waitForServer(url, retries = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = () => {
      attempts += 1;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.setTimeout(500, () => {
        req.destroy();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (attempts >= retries) {
        return reject(new Error('DevMind Studio local service failed to initialize in time.'));
      }
      setTimeout(poll, 180);
    };
    poll();
  });
}

function startBackend(port) {
  const rootDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.resolve(__dirname, '..');

  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverEntry = path.join(rootDir, 'server.ts');

  // Spawn embedded Node runtime inside Electron binary (zero external Node.js prerequisite on Windows)
  serverProcess = spawn(process.execPath, ['--max-old-space-size=512', tsxCli, serverEntry], {
    cwd: rootDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
    },
    windowsHide: true,
    stdio: 'ignore',
  });
}

function stopBackend() {
  if (!serverProcess || serverProcess.killed) return;
  try {
    serverProcess.kill('SIGTERM');
  } catch {
    // ignore
  }
  serverProcess = null;
}

async function createWindow() {
  const port = await findAvailablePort(3456);
  startBackend(port);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/api/v1/health`);

  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#181818',
    title: 'DevMind Studio',
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(baseUrl);
}

// Native Windows IPC Controls
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
  osRelease: os.release(),
  totalMemoryGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
  appVersion: app.getVersion(),
}));

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('before-quit', stopBackend);

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
