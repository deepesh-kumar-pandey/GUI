const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendGatekeeperCommand: (command) => ipcRenderer.invoke('gatekeeper-command', command),
    onGatekeeperOutput: (callback) => ipcRenderer.on('gatekeeper-output', (_event, value) => callback(value)),

    startDeepGuard: (config) => ipcRenderer.invoke('deepguard-start', config),
    stopDeepGuard: () => ipcRenderer.invoke('deepguard-stop'),
    onDeepGuardStatus: (callback) => ipcRenderer.on('deepguard-status', (_event, value) => callback(value)),
    onDeepGuardLog: (callback) => ipcRenderer.on('deepguard-log', (_event, value) => callback(value)),

    getAlerts: () => ipcRenderer.invoke('get-alerts'),
    getGatekeeperLogs: () => ipcRenderer.invoke('get-gatekeeper-logs')
});
