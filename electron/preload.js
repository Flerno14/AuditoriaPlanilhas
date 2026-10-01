const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auditoria', {
  openFile: (slot) => ipcRenderer.invoke('files:open', slot),
  saveFile: (name, content) => ipcRenderer.invoke('files:save', { name, content }),
  callPython: (action, payload) => ipcRenderer.invoke('python:call', action, payload)
});
