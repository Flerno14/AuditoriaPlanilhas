const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auditoria', {
  getUpdateState: () => ipcRenderer.invoke('updates:get'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  openFile: (slot) => ipcRenderer.invoke('files:open', slot),
  openTemplate: () => ipcRenderer.invoke('files:open-template'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveFile: (name, content) => ipcRenderer.invoke('files:save', { name, content }),
  callPython: (action, payload) => ipcRenderer.invoke('python:call', action, payload)
});
