const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('devmindDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
