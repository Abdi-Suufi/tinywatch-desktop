const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tinywatchDesktop', {
  setPresence: (data) => ipcRenderer.send('presence:set', data),
  clearPresence: () => ipcRenderer.send('presence:set', null),
});