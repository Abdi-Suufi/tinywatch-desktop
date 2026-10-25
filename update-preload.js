const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateDialog', {
  choose: (choice) => ipcRenderer.send('update:choice', choice),
});
