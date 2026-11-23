const { app, BrowserWindow, dialog, ipcMain, net: electronNet, safeStorage, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

// Prevent multiple duplicate desktop instances on Windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setAppUserModelId('com.devmind.studio');

// Use standard Chromium User-Agent so Google Sign-In OAuth popups work cleanly in normal Windows .exe builds
if (typeof app.userAgentFallback === 'string' && app.userAgentFallback) {
  app.userAgentFallback = app.userAgentFallback
    .replace(/\s*Electron\/[^\s]+/gi, '')
    .replace(/\s*devmind-ai\/[^\s]+/gi, '');
}

let embeddedHttpServer = null;
let serverModuleRef = null;
let backendPort = null;
let backendDataDir = null;
let networkMonitorTimer = null;
let lastKnownOnline = true;
let mainWindow = null;

function getVaultFilePath() {
  return path.join(app.getPath('userData'), 'secure-vault.json');
}

function assertValidVaultKey(key) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) {
    throw new Error('Invalid vault key format.');
  }
}

function readEncryptedVault() {
  try {
    const filePath = getVaultFilePath();
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeEncryptedVault(record) {
  const filePath = getVaultFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function isVaultAvailable() {
  try {
    return Boolean(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function checkElectronOnline() {
  try {
    if (electronNet && typeof electronNet.isOnline === 'function') {
      return Boolean(electronNet.isOnline());
    }
  } catch {
    // Fallback if called before app ready
  }
  return true;
}

function startNetworkMonitor() {
  if (networkMonitorTimer) return;
  lastKnownOnline = checkElectronOnline();
  networkMonitorTimer = setInterval(() => {
    const nowOnline = checkElectronOnline();
    if (nowOnline !== lastKnownOnline) {
      lastKnownOnline = nowOnline;
      logStartup(`Network state changed -> ${nowOnline ? 'ONLINE' : 'OFFLINE'}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('network:status-changed', nowOnline);
      }
    }
  }, 4000);
}

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

  serverModuleRef = serverModule;
  backendPort = started.port;
  backendDataDir = dataDir;
  embeddedHttpServer = started.server;
  logStartup(`Embedded backend listening on http://127.0.0.1:${started.port}`);
  return started.port;
}

function stopBackend() {
  if (networkMonitorTimer) {
    clearInterval(networkMonitorTimer);
    networkMonitorTimer = null;
  }
  try {
    if (serverModuleRef && typeof serverModuleRef.flushServerState === 'function') {
      serverModuleRef.flushServerState();
      logStartup('Flushed embedded workspace state cleanly prior to shutdown.');
    }
  } catch (err) {
    logStartup('Non-fatal error flushing server state during shutdown', err);
  }
  if (!embeddedHttpServer) return;
  try {
    if (typeof embeddedHttpServer.closeAllConnections === 'function') {
      embeddedHttpServer.closeAllConnections();
    }
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
      host === 'github.com' ||
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.web.app') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.gstatic.com')
    );
  } catch {
    return false;
  }
}

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * RFC 8252 Desktop OAuth 2.0 + PKCE via the user's System Browser and ephemeral loopback callback.
 * Exchanges the authorization code directly with Google's token endpoint and returns { idToken, accessToken }
 * so the renderer can authenticate Firebase using signInWithCredential() without auth/unauthorized-domain.
 */
async function runGoogleSystemBrowserPkceFlow(options = {}) {
  const clientId = String(
    options.clientId || process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID || ''
  ).trim();
  const clientSecret = String(process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_SECRET || '').trim();

  if (!clientId) {
    throw new Error(
      'DESKTOP_PKCE_UNCONFIGURED: Set GOOGLE_DESKTOP_OAUTH_CLIENT_ID for external system-browser PKCE sign-in.'
    );
  }

  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );
  const expectedState = crypto.randomBytes(24).toString('hex');

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        callbackServer.close();
      } catch {
        // ignore close errors
      }
      fn(value);
    };

    const callbackServer = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        if (reqUrl.pathname !== '/oauth2callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        const errorParam = reqUrl.searchParams.get('error');
        const code = reqUrl.searchParams.get('code');
        const state = reqUrl.searchParams.get('state') || '';

        if (errorParam) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;padding:32px;background:#1c1c1e;color:#f5f5f7"><h2>Sign-In Cancelled</h2><p>You can close this browser tab and return to DevMind Studio.</p></body></html>');
          finish(reject, new Error(`Google Sign-In was cancelled or denied (${errorParam}).`));
          return;
        }

        const expectedBuf = Buffer.from(expectedState, 'utf8');
        const receivedBuf = Buffer.from(state, 'utf8');
        if (
          !code ||
          expectedBuf.length !== receivedBuf.length ||
          !crypto.timingSafeEqual(expectedBuf, receivedBuf)
        ) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;padding:32px;background:#1c1c1e;color:#f5f5f7"><h2>Invalid Sign-In State</h2><p>State verification failed. Please retry from DevMind Studio.</p></body></html>');
          finish(reject, new Error('OAuth state verification failed.'));
          return;
        }

        const addr = callbackServer.address();
        const redirectUri = `http://127.0.0.1:${addr.port}/oauth2callback`;

        const tokenParams = new URLSearchParams({
          client_id: clientId,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        });
        if (clientSecret) {
          tokenParams.set('client_secret', clientSecret);
        }

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString(),
        });

        const tokenJson = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !tokenJson.id_token) {
          const detail = tokenJson.error_description || tokenJson.error || `HTTP ${tokenRes.status}`;
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:system-ui;padding:32px;background:#1c1c1e;color:#f5f5f7"><h2>Authentication Error</h2><p>Token exchange did not return a Google ID token. Return to DevMind Studio for details.</p></body></html>');
          logStartup(`Desktop Google PKCE token exchange failed: ${detail}`);
          finish(reject, new Error(`Google OAuth token exchange failed: ${detail}`));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:system-ui;padding:32px;background:#1c1c1e;color:#f5f5f7"><h2>Signed in to DevMind Studio</h2><p>Authentication succeeded. You can close this browser tab and return to DevMind Studio.</p></body></html>');

        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
        logStartup('Desktop Google PKCE sign-in succeeded; exchanging ID token with Firebase signInWithCredential().');
        finish(resolve, {
          idToken: String(tokenJson.id_token),
          accessToken: tokenJson.access_token ? String(tokenJson.access_token) : undefined,
        });
      } catch (err) {
        logStartup('Unexpected error in desktop Google PKCE callback', err);
        finish(reject, err instanceof Error ? err : new Error(String(err)));
      }
    });

    const timeoutId = setTimeout(() => {
      finish(reject, new Error('Google Sign-In timed out after 3 minutes. Please try again.'));
    }, 180_000);

    callbackServer.on('error', (err) => {
      finish(reject, new Error(`Failed to start local OAuth callback listener: ${err.message}`));
    });

    callbackServer.listen(0, '127.0.0.1', () => {
      const addr = callbackServer.address();
      const redirectUri = `http://127.0.0.1:${addr.port}/oauth2callback`;
      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: expectedState,
        prompt: 'select_account',
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;
      logStartup(`Opening system browser for Google OAuth PKCE (loopback port ${addr.port})`);
      shell.openExternal(authUrl).catch((err) => {
        finish(reject, new Error(`Could not open system browser for Google Sign-In: ${err.message}`));
      });
    });
  });
}

async function createWindow() {
  const port = await startEmbeddedBackend();
  // Use http://localhost:<port> instead of http://127.0.0.1:<port> or file://
  // because Firebase Auth authorizes "localhost" by default (preventing auth/unauthorized-domain).
  const baseUrl = `http://localhost:${port}`;

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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // Ignore benign aborted navigations
    logStartup(`Renderer did-fail-load (${errorCode}): ${errorDescription} [${validatedURL}]`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`Renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
    if (mainWindow && !mainWindow.isDestroyed() && details.reason !== 'clean-exit') {
      dialog.showErrorBox(
        'DevMind Studio Renderer Interrupted',
        `The interface process exited unexpectedly (${details.reason}).\n\nReloading workspace...`
      );
      mainWindow.loadURL(baseUrl).catch(() => {});
    }
  });

  startNetworkMonitor();
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

// OS-Backed Encrypted Credential Vault (safeStorage — zero plaintext secrets)
ipcMain.handle('vault:is-available', () => isVaultAvailable());

ipcMain.handle('vault:get', (_event, key) => {
  assertValidVaultKey(key);
  if (!isVaultAvailable()) return null;
  const vault = readEncryptedVault();
  const cipherB64 = vault[key];
  if (typeof cipherB64 !== 'string' || !cipherB64) return null;
  try {
    return safeStorage.decryptString(Buffer.from(cipherB64, 'base64'));
  } catch {
    return null;
  }
});

ipcMain.handle('vault:set', (_event, key, value) => {
  assertValidVaultKey(key);
  if (typeof value !== 'string') {
    throw new Error('Vault value must be a string.');
  }
  if (!isVaultAvailable()) {
    return false;
  }
  const vault = readEncryptedVault();
  vault[key] = safeStorage.encryptString(value).toString('base64');
  writeEncryptedVault(vault);
  return true;
});

ipcMain.handle('vault:delete', (_event, key) => {
  assertValidVaultKey(key);
  const vault = readEncryptedVault();
  if (key in vault) {
    delete vault[key];
    writeEncryptedVault(vault);
  }
  return true;
});

// Network Connectivity, Desktop OAuth PKCE & Diagnostics
ipcMain.handle('network:is-online', () => checkElectronOnline());

ipcMain.handle('auth:google-pkce', async (_event, options) => {
  return runGoogleSystemBrowserPkceFlow(options || {});
});

ipcMain.handle('auth:get-desktop-oauth-status', () => ({
  pkceConfigured: Boolean(String(process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID || '').trim()),
  windowOrigin: backendPort ? `http://localhost:${backendPort}` : 'http://localhost',
  callbackStrategy: String(process.env.GOOGLE_DESKTOP_OAUTH_CLIENT_ID || '').trim()
    ? 'system-browser-pkce'
    : 'localhost-firebase-popup',
}));

ipcMain.handle('diagnostics:get-info', () => ({
  userDataPath: app.getPath('userData'),
  userDataDir: app.getPath('userData'),
  dataDir: backendDataDir || path.join(app.getPath('userData'), 'data'),
  startupLogPath: getStartupLogFile(),
  backendPort: backendPort || 0,
  vaultAvailable: isVaultAvailable(),
  safeStorageAvailable: isVaultAvailable(),
  isPackaged: app.isPackaged,
  recentLogs: [],
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
