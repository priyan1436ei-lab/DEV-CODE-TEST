const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devmindDesktop', {
  platform: process.platform,
  arch: process.arch,
  isDesktop: true,
  isDesktopApp: true,
  version: '2.1.0',
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  onMaximizedChanged: (cb) => {
    const handler = (_event, val) => cb(Boolean(val));
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },
  vaultIsAvailable: () => ipcRenderer.invoke('vault:is-available'),
  vaultGet: (key) => ipcRenderer.invoke('vault:get', key),
  vaultSet: (key, value) => ipcRenderer.invoke('vault:set', key, value),
  vaultDelete: (key) => ipcRenderer.invoke('vault:delete', key),
  isNetworkOnline: () => ipcRenderer.invoke('network:is-online'),
  onNetworkStatusChanged: (cb) => {
    const handler = (_event, online) => cb(Boolean(online));
    ipcRenderer.on('network:status-changed', handler);
    return () => ipcRenderer.removeListener('network:status-changed', handler);
  },
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get-info'),
});
