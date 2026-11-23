const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

let mainWindow = null;
let serverProc = null;

function findOpenPort(startPort = 3456) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(findOpenPort(startPort + 1)));
    server.listen(startPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/v1/health`);
      if (res.ok) return true;
    } catch {
      // retry until ready
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function createDesktopWindow() {
  const port = await findOpenPort(3456);
  const appRoot = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.resolve(__dirname, '..');
  const tsxCli = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  serverProc = spawn(process.execPath, [tsxCli, path.join(appRoot, 'server.ts')], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
    },
    stdio: 'inherit',
  });

  const targetUrl = `http://127.0.0.1:${port}`;
  await waitForServer(targetUrl);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'DevMind AI — Autonomous Software Engineering Studio',
    backgroundColor: '#080A10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(targetUrl);
}

app.whenReady().then(createDesktopWindow);

app.on('window-all-closed', () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
