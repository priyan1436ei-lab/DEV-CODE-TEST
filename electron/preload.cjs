const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devmindDesktop', {
  platform: process.platform,
  arch: process.arch,
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
});
