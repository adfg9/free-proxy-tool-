/**
 * Free Proxy Tool - Electron Desktop App
 * Wraps the Web GUI into a desktop application
 */

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PROJECT_ROOT = path.join(__dirname, '..');
const GUI_DIR = path.join(PROJECT_ROOT, 'gui');

let mainWindow;
let httpServer = null;
let wssInstance = null;
const SERVER_PORT = 18080;

// ========== Server ==========
function createServer() {
  const stats = require(path.join(PROJECT_ROOT, 'lib', 'stats'));
  const { execSync, spawn } = require('child_process');
  const os = require('os');

  function run(cmd, timeout = 8000) {
    try { return execSync(cmd, { encoding: 'utf8', timeout, windowsHide: true }).trim(); } catch { return null; }
  }

  function httpGet(url, timeout = 8000) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout, rejectUnauthorized: false }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const WARP = {
    installed() {
      if (os.platform() === 'win32') {
        const p = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe';
        if (fs.existsSync(p)) return true;
      }
      return !!(run('warp-cli --version') || '').includes('warp');
    },
    status() { const r = run('warp-cli status'); return r ? { connected: r.includes('Connected'), raw: r } : null; },
    connect() { run('warp-cli connect', 10000); },
    disconnect() { run('warp-cli disconnect'); },
    register() { return run('warp-cli registration new', 15000); }
  };

  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

  let serverRunning = false, serverPort = 1080;
  const wsClients = [];

  function broadcast(data) {
    const msg = JSON.stringify(data);
    wsClients.forEach(ws => { try { ws.send(msg); } catch {} });
  }

  function sendJSON(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  }

  function sendStatic(res, filePath) {
    try {
      const ext = path.extname(filePath);
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': (MIME[ext] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(content);
    } catch { res.writeHead(404); res.end('Not Found'); }
  }

  function parseBody(req) {
    return new Promise(resolve => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    });
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${SERVER_PORT}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const p = url.pathname;
    if (p === '/api/status') {
      const ws = WARP.status();
      return sendJSON(res, { warp: { installed: WARP.installed(), connected: ws?.connected || false, raw: ws?.raw || '' }, server: { running: serverRunning, port: serverPort }, stats: stats.getStats() });
    }
    if (p === '/api/stats') return sendJSON(res, stats.getStats());
    if (p === '/api/history') return sendJSON(res, { tests: stats.getHistory({ limit: 100 }) });
    if (p === '/api/proxy/test' && req.method === 'POST') {
      const b = await parseBody(req);
      if (b.host && b.port) {
        // Simple test without socks agent (Electron context)
        return sendJSON(res, { host: b.host, port: b.port, alive: false, latency: -1, note: 'Use CLI for full proxy testing' });
      }
      return sendJSON(res, { error: 'host and port required' }, 400);
    }
    if (p === '/api/warp/connect' && req.method === 'POST') { WARP.connect(); await new Promise(r => setTimeout(r, 2000)); const s = WARP.status(); return sendJSON(res, { connected: s?.connected || false }); }
    if (p === '/api/warp/disconnect' && req.method === 'POST') { WARP.disconnect(); return sendJSON(res, { connected: false }); }
    if (p === '/api/warp/register' && req.method === 'POST') { const r = WARP.register(); return sendJSON(res, { success: r && !r.toLowerCase().includes('error'), raw: r }); }
    if (p === '/api/stats/clear' && req.method === 'POST') { stats.clearHistory(); return sendJSON(res, { success: true }); }

    // Static files
    if (p === '/' || p === '/index.html') return sendStatic(res, path.join(GUI_DIR, 'public', 'index.html'));
    const safePath = p.replace(/\.\./g, '');
    const filePath = path.join(GUI_DIR, 'public', safePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return sendStatic(res, filePath);

    res.writeHead(404); res.end('Not Found');
  }

  return new Promise((resolve) => {
    const server = http.createServer(handleRequest);
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      wsClients.push(ws);
      ws.on('close', () => { const i = wsClients.indexOf(ws); if (i >= 0) wsClients.splice(i, 1); });
      const s = WARP.status();
      ws.send(JSON.stringify({ type: 'init', warp: { installed: WARP.installed(), connected: s?.connected || false }, server: { running: serverRunning, port: serverPort } }));
    });

    server.listen(SERVER_PORT, '127.0.0.1', () => resolve({ server, wss, port: SERVER_PORT }));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const s2 = http.createServer(handleRequest);
        const wss2 = new WebSocketServer({ server: s2 });
        wss2.on('connection', (ws) => {
          wsClients.push(ws);
          ws.on('close', () => { const i = wsClients.indexOf(ws); if (i >= 0) wsClients.splice(i, 1); });
        });
        s2.listen(SERVER_PORT + 1, '127.0.0.1', () => resolve({ server: s2, wss: wss2, port: SERVER_PORT + 1 }));
      }
    });
  });
}

// ========== Window ==========
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 600,
    title: 'Free Proxy Tool',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#0f172a',
    show: false
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.webContents.reload() },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]},
    { label: 'Help', submenu: [
      { label: 'About', click: () => {
        require('electron').dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'About', message: 'Free Proxy Tool v2.0',
          detail: 'Free Proxy Tool\nWARP + Free Proxy\n\nGUI Version'
        });
      }}
    ]}
  ]));
}

// ========== App ==========
app.whenReady().then(async () => {
  try {
    const { server, wss, port } = await createServer();
    httpServer = server;
    wssInstance = wss;
    createWindow(port);
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

function cleanup() {
  if (wssInstance) {
    try { wssInstance.clients.forEach(c => { try { c.close(); } catch {} }); wssInstance.close(); } catch {}
    wssInstance = null;
  }
  if (httpServer) {
    try { httpServer.close(); } catch {}
    httpServer = null;
  }
}

app.on('window-all-closed', () => { cleanup(); app.quit(); });
app.on('before-quit', () => { cleanup(); });
