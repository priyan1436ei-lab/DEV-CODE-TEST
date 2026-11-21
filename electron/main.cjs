const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const PORT = 3456;
let serverProcess = null;
let mainWindow = null;

function waitForServer(url, retries = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = () => {
      attempts += 1;
      http
        .get(url, (res) => {
          if (res.statusCode === 200) return resolve();
          retry();
        })
        .on('error', retry);
    };
    const retry = () => {
      if (attempts >= retries) return reject(new Error('DevMind backend failed to start.'));
      setTimeout(poll, 250);
    };
    poll();
  });
}

function startBackend() {
  const rootDir = path.resolve(__dirname, '..');
  const tsxBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  serverProcess = spawn(tsxBin, ['server.ts'], {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
    stdio: 'inherit',
  });
}

async function createWindow() {
  startBackend();
  await waitForServer(`http://127.0.0.1:${PORT}/api/v1/health`);

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#090B10',
    title: 'DevMind AI — Autonomous Software Engineering Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  await mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
