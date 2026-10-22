const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auditoria', {
  openTranslationModel: () => ipcRenderer.invoke('translation:open-model'),
  getTranslationSession: () => ipcRenderer.invoke('translation:session-get'),
  saveTranslationSession: (session) => ipcRenderer.invoke('translation:session-save', session),
  openFile: (slot) => ipcRenderer.invoke('files:open', slot),
  openTemplate: () => ipcRenderer.invoke('files:open-template'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  cancelPython: () => ipcRenderer.invoke('python:cancel'),
  onPythonProgress: (callback) => {
    const listener = (_event, stage) => callback(stage);
    ipcRenderer.on('python:progress', listener);
    return () => ipcRenderer.removeListener('python:progress', listener);
  },
  getSession: () => ipcRenderer.invoke('session:get'),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  confirmDiscardReview: (action) => ipcRenderer.invoke('review:confirm-discard', action),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  saveFile: (name, content) => ipcRenderer.invoke('files:save', { name, content }),
  callPython: (action, payload) => ipcRenderer.invoke('python:call', action, payload)
});
