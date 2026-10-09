const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auditoria', {
  openFile: (slot) => ipcRenderer.invoke('files:open', slot),
  openTemplate: () => ipcRenderer.invoke('files:open-template'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveFile: (name, content) => ipcRenderer.invoke('files:save', { name, content }),
  callPython: (action, payload) => ipcRenderer.invoke('python:call', action, payload)
});
