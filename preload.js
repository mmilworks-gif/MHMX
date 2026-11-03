const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('x32', {
  discover: () => ipcRenderer.invoke('discover'),
  connect: ip => ipcRenderer.invoke('connect', ip),
  set: (a, t, v) => ipcRenderer.send('set', a, t, v),
  setm: (a, args) => ipcRenderer.send('setm', a, args),
  batch: l => ipcRenderer.send('batch', l),
  query: l => ipcRenderer.send('query', l),
  version: () => ipcRenderer.invoke('version'),
  rta: on => ipcRenderer.send('rta', on),
  onRta: f => ipcRenderer.on('rta', (e, a) => f(a)),
  onConn: f => ipcRenderer.on('conn', (e, s, ip) => f(s, ip)),
  onOsc: f => ipcRenderer.on('osc', (e, a, v) => f(a, v)),
  onMeters: f => ipcRenderer.on('meters', (e, m) => f(m)),
  onStatus: f => ipcRenderer.on('status', (e, s) => f(s)),
  onUpdateReady: f => ipcRenderer.on('update-ready', () => f()),
  checkUpdate: () => ipcRenderer.send('upd-check'),
  installUpdate: () => ipcRenderer.send('upd-install')
});
