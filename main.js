const { app, BrowserWindow, ipcMain } = require('electron');
const dgram = require('dgram');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const discover = require('./discover');

let win, sock, mixerIp = null, timer = null;
// envia para a janela somente se ela ainda existir (evita "Object has been destroyed" ao fechar)
const toWin = (...a) => { try { if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(...a); } catch (e) {} };
process.on('uncaughtException', e => { if (!/Object has been destroyed/.test(String(e && e.message))) { console.error(e); require('electron').dialog.showErrorBox('Erro', String(e && e.stack || e)); } });

// ---------- OSC ----------
const al = n => (4 - (n % 4)) % 4;
function str(s) { const b = Buffer.from(s + '\0'); return Buffer.concat([b, Buffer.alloc(al(b.length))]); }
function enc(addr, args = []) {
  const parts = [str(addr), str(',' + args.map(a => a.t).join(''))];
  for (const a of args) {
    if (a.t === 'f') { const b = Buffer.alloc(4); b.writeFloatBE(a.v); parts.push(b); }
    else if (a.t === 'i') { const b = Buffer.alloc(4); b.writeInt32BE(a.v); parts.push(b); }
    else if (a.t === 's') parts.push(str(a.v));
  }
  return Buffer.concat(parts);
}
function rs(buf, o) { let e = buf.indexOf(0, o); const s = buf.toString('utf8', o, e); e++; e += al(e); return [s, e]; }
function dec(buf) {
  let [addr, o] = rs(buf, 0);
  if (o >= buf.length) return { addr, args: [] };
  let tags; [tags, o] = rs(buf, o);
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'f') { args.push(buf.readFloatBE(o)); o += 4; }
    else if (t === 'i') { args.push(buf.readInt32BE(o)); o += 4; }
    else if (t === 's') { let s; [s, o] = rs(buf, o); args.push(s); }
    else if (t === 'b') { const l = buf.readInt32BE(o); o += 4; args.push(buf.subarray(o, o + l)); o += l + al(l); }
  }
  return { addr, args };
}

const makeDemo = require('./demo');
let demo = null, connState = 'off', lastRx = 0, lastTry = 0, wd = null;
const setConn = s => { if (connState !== s) { connState = s; toWin('conn', s, mixerIp); } };
function send(addr, args) { if (demo) return demo.send(addr, args || []); if (sock && mixerIp) sock.send(enc(addr, args), 10023, mixerIp, () => {}); }
let rtaOn = false;
function keepAlive() { send('/xremote'); send('/meters', [{ t: 's', v: '/meters/1' }]); if (rtaOn) send('/meters', [{ t: 's', v: '/meters/15' }, { t: 'i', v: 2 }]); }
ipcMain.on('rta', (e, on) => { rtaOn = !!on; if (rtaOn) keepAlive(); });
function stopAll() {
  if (timer) clearInterval(timer); if (wd) clearInterval(wd); timer = wd = null;
  if (sock) { try { sock.close(); } catch (e) {} sock = null; }
  if (demo) { demo.stop(); demo = null; }
}
function openSock() {
  sock = dgram.createSocket('udp4');
  sock.on('message', msg => {
    lastRx = Date.now(); if (connState !== 'ok') setConn('ok');
    let m; try { m = dec(msg); } catch (e) { return; }
    if (m.addr === '/meters/1' && Buffer.isBuffer(m.args[0])) {
      const d = m.args[0], n = d.readInt32LE(0), out = [];
      for (let i = 0; i < n && 4 + i * 4 + 4 <= d.length; i++) out.push(d.readFloatLE(4 + i * 4));
      toWin('meters', out);
    } else if (m.addr === '/meters/15' && Buffer.isBuffer(m.args[0])) {
      const d = m.args[0], out = []; for (let i = 4; i + 1 < d.length && out.length < 100; i += 2) out.push(Math.max(-120, Math.min(10, d.readInt16LE(i) / 256)));
      const ok = out.length >= 50 && out.filter(v => v > -125 && v <= 10).length > out.length * 0.8; if (ok) toWin('rta', out);
    } else if (m.addr === '/info' || m.addr === 'info') {
      toWin('status', 'Conectado: ' + m.args.slice(1, 3).join(' ') + ' (' + mixerIp + ')');
    } else {
      toWin('osc', m.addr, m.args);
    }
  });
  sock.on('error', e => { toWin('status', 'Erro de rede: ' + e.message); try { sock.close(); } catch (x) {} sock = null; });
  sock.bind(0, () => { send('/info'); keepAlive(); });
}
function connect(ip) {
  stopAll(); mixerIp = ip; connState = 'off'; lastRx = 0;
  if (ip === 'demo') {
    demo = makeDemo((a, v) => toWin('osc', a, [v]), m => toWin('meters', m), a => toWin('rta', a));
    demo.start(); setConn('ok'); toWin('status', 'Modo demo: mesa simulada (nenhuma mesa real conectada)'); return;
  }
  setConn('connecting'); lastTry = Date.now(); openSock();
  timer = setInterval(keepAlive, 8000);
  wd = setInterval(() => {
    const now = Date.now();
    if (connState === 'ok' && now - lastRx > 5000) { setConn('lost'); toWin('meters', []); }
    if (connState !== 'ok' && now - lastTry > 3000) { lastTry = now; if (!sock) openSock(); else { send('/info'); keepAlive(); } }
  }, 1000);
}

ipcMain.handle('discover', () => discover());
ipcMain.handle('connect', (e, ip) => connect(ip));
ipcMain.handle('version', () => app.getVersion());
ipcMain.on('set', (e, addr, t, v) => send(addr, [{ t, v }]));
ipcMain.on('setm', (e, addr, args) => send(addr, args));
ipcMain.on('batch', (e, list) => {
  let i = 0;
  const iv = setInterval(() => {
    for (let k = 0; k < 20 && i < list.length; k++, i++) send(list[i][0], [{ t: list[i][1], v: list[i][2] }]);
    if (i >= list.length) clearInterval(iv);
  }, 25);
});
ipcMain.on('query', (e, list) => {
  let i = 0;
  const iv = setInterval(() => {
    for (let k = 0; k < 20 && i < list.length; k++, i++) send(list[i]);
    if (i >= list.length) clearInterval(iv);
  }, 25);
});

// ---------- Atualização via GitHub ----------
autoUpdater.autoDownload = true;
const st = s => toWin('status', s);
autoUpdater.on('checking-for-update', () => st('Procurando atualização...'));
autoUpdater.on('update-available', i => st('Nova versão ' + i.version + ' encontrada. Baixando...'));
autoUpdater.on('update-not-available', () => st('Você já está na versão mais recente.'));
autoUpdater.on('download-progress', p => st('Baixando atualização: ' + Math.round(p.percent) + '%'));
autoUpdater.on('update-downloaded', () => { st('Atualização pronta.'); toWin('update-ready'); });
autoUpdater.on('error', e => st('Erro na atualização: ' + (e.message || e).toString().slice(0, 120)));
ipcMain.on('upd-check', () => {
  if (!app.isPackaged) return st('Atualização só funciona no app instalado (.exe).');
  autoUpdater.checkForUpdates().catch(() => {});
});
ipcMain.on('upd-install', () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700, backgroundColor: '#14161a', autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile('renderer/index.html');
  win.on('closed', () => { stopAll(); win = null; });
});
app.on('before-quit', () => { try { stopAll(); } catch (e) {} });
app.on('window-all-closed', () => { try { stopAll(); } catch (e) {} app.quit(); });
