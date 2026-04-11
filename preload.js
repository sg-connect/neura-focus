const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neurafocus', {
    getToday: () => ipcRenderer.invoke('get-today'),
    getWeek: () => ipcRenderer.invoke('get-week'),
    togglePause: () => ipcRenderer.invoke('toggle-pause'),
    toggleFocus: () => ipcRenderer.invoke('toggle-focus'),
    markFocusing: () => ipcRenderer.invoke('mark-focusing'),
    onStateChanged: (cb) => ipcRenderer.on('state-changed', (_, val) => cb(val)),
    onDataUpdated: (cb) => ipcRenderer.on('data-updated', () => cb()),
    onLiveStatus: (cb) => ipcRenderer.on('live-status', (_, val) => cb(val)),
});
