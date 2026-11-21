const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('devmindDesktop', {
  platform: process.platform,
  arch: process.arch,
  isDesktopApp: true,
  version: '1.0.0',
});
