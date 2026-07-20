/**
 * Free Proxy Browser - Standalone Blink Browser
 * Electron Chromium, zero external dependencies, zero external browser
 * Built-in forward proxy :1080 + Management Panel :3000
 */

const { app, BrowserWindow, session, globalShortcut, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const fs = require('fs');

const PROXY_PORT = 1080;
const GUI_PORT = 3000;
const ROOT = path.join(__dirname, '..');
const NEW_TAB = 'file:///' + path.join(__dirname, 'app', 'index.html').replace(/\\/g, '/');

function log(t, m) {
  const c = { ok:'\x1b[32m', err:'\x1b[31m', info:'\x1b[36m', warn:'\x1b[33m' };
  const i = { ok:'[✓]', err:'[✗]', info:'[*]', warn:'[!]' };
  console.log(`${c[t]||''}${i[t]||' '} ${m}\x1b[0m`);
}

// Built-in Forward Proxy
function createProxy() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      try {
        const u = new URL(req.url);
        const m = u.protocol === 'https:' ? https : http;
        const o = { hostname: u.hostname, port: u.port||(u.protocol==='https:'?443:80), path: u.pathname+u.search, method: req.method, headers: {...req.headers}, rejectUnauthorized: false };
        const p = m.request(o, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
        p.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
        req.pipe(p);
      } catch { try { res.writeHead(400); res.end(); } catch {} }
    });
    s.on('connect', (req, sock, head) => {
      try {
        const [h, ps] = (req.url||'').split(':'); const pt = parseInt(ps)||443;
        const t = net.connect(pt, h, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); t.write(head); t.pipe(sock); sock.pipe(t); });
        t.on('error', () => sock.end()); sock.on('error', () => { try { t.destroy(); } catch {} });
      } catch { sock.end(); }
    });
    s.listen(PROXY_PORT, '127.0.0.1', () => { log('ok', `Proxy: 127.0.0.1:${PROXY_PORT}`); resolve(s); });
  });
}

// Management Panel
function checkPort(port) {
  return new Promise(r => {
    const c = net.createConnection({ port, host: '127.0.0.1' }, () => { c.destroy(); r(true); });
    c.on('error', () => { c.destroy(); r(false); });
    c.setTimeout(1000, () => { c.destroy(); r(false); });
  });
}

// Tracked resources for graceful shutdown
let proxyServer = null;
let guiChild = null;
let showTimer = null;

async function ensureGUI() {
  let ok = await checkPort(GUI_PORT);
  if (ok) { log('ok', `Panel: already running :${GUI_PORT}`); return; }
  log('info', 'Panel: starting...');
  guiChild = spawn(process.execPath, ['index.js', 'gui', String(GUI_PORT)], { cwd: ROOT, stdio: 'ignore', detached: true, windowsHide: true });
  guiChild.unref();
  guiChild.on('exit', () => { guiChild = null; });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    ok = await checkPort(GUI_PORT);
    if (ok) { log('ok', `Panel: http://127.0.0.1:${GUI_PORT}`); return; }
  }
  log('warn', 'Panel: start timeout');
}

// Window
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500,
    title: 'Free Proxy Browser',
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false, webSecurity: false, allowRunningInsecureContent: true, preload: path.join(__dirname, 'app', 'preload.js') }
  });
  win.once('ready-to-show', () => win.show());
  if (showTimer) clearTimeout(showTimer);
  showTimer = setTimeout(() => { if (win && !win.isVisible()) win.show(); }, 3000);
  win.on('closed', () => { if (showTimer) { clearTimeout(showTimer); showTimer = null; } win = null; });
  win.loadURL(NEW_TAB);
  win.setMenu(null);
  win.webContents.on('before-input-event', (e, i) => {
    if ((i.control||i.meta) && i.key==='t' && i.type==='keyDown') { e.preventDefault(); createWindow(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { createWindow(); return { action: 'deny' }; });
  return win;
}

// File dialog (custom wallpaper) — must be registered after createWindow
ipcMain.handle('open-image-dialog', async () => {
  try {
    const r = await dialog.showOpenDialog(win || undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','gif','bmp','webp','svg'] }]
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    const filePath = r.filePaths[0];
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeMap = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', bmp:'image/bmp', webp:'image/webp', svg:'image/svg+xml' };
    const mime = mimeMap[ext] || 'image/png';
    const data = fs.readFileSync(filePath);
    return 'data:' + mime + ';base64,' + data.toString('base64');
  } catch(e) {
    console.error('Wallpaper dialog failed:', e);
    return null;
  }
});

// Startup
app.whenReady().then(async () => {
  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  ⚡ Free Proxy Browser - Standalone Blink  ║');
  console.log('  ║  Engine: Electron Chromium (Blink)        ║');
  console.log('  ║  Proxy: 127.0.0.1:' + PROXY_PORT + ' (Built-in)     ║');
  console.log('  ║  Panel: http://127.0.0.1:' + GUI_PORT + '             ║');
  console.log('  ║  Fully Independent: No External Browser   ║');
  console.log('  ║  or External Dependencies                 ║');
  console.log('  ╚════════════════════════════════════════════╝');
  console.log('');

  let proxy;
  try { proxy = await createProxy(); proxyServer = proxy; } catch(e) { log('err', 'Proxy start failed: ' + e.message); }

  try {
    await session.defaultSession.setProxy({
      proxyRules: `http://127.0.0.1:${PROXY_PORT}`,
      proxyBypassRules: '<local>'
    });
    log('ok', 'Chromium proxy bound');
  } catch(e) { log('warn', 'Proxy bind failed: ' + e.message); }

  await ensureGUI();

  globalShortcut.register('CommandOrControl+T', () => createWindow());
  globalShortcut.register('CommandOrControl+N', () => createWindow());

  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Cleanup all tracked resources before quitting
function cleanup() {
  try { globalShortcut.unregisterAll(); } catch {}
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
  if (proxyServer) {
    try {
      proxyServer.close(() => {});
      proxyServer.removeAllListeners();
    } catch {}
    proxyServer = null;
  }
  if (guiChild) {
    try { guiChild.kill(); } catch {}
    guiChild = null;
  }
}

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { cleanup(); });

process.on('uncaughtException', (e) => { log('err', e.message); });