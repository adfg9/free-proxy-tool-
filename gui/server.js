const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Reuse project modules
const HOME = require('os').homedir();
const PROJECT_ROOT = path.join(__dirname, '..');
const stats = require(path.join(PROJECT_ROOT, 'lib', 'stats'));
const ProxyServer = require(path.join(PROJECT_ROOT, 'lib', 'proxy-server'));
const proxyCore = require(path.join(PROJECT_ROOT, 'lib', 'proxy-core'));

// Inline core functions to avoid circular deps
const { execSync, spawn } = require('child_process');
const os = require('os');
const IS_WIN = os.platform() === 'win32';
const IS_MOBILE = process.env.FPT_MOBILE === '1';

function run(cmd, timeout = 8000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, windowsHide: true }).trim(); } catch { return null; }
}

function httpGet(url, timeout = 8000) {
  const httpMod = require('http');
  const httpsMod = require('https');
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? httpsMod : httpMod;
    const req = client.get(url, { timeout, rejectUnauthorized: false, headers: { 'Accept-Encoding': 'identity' } }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ========== State ==========
let proxyServerInstance = null;  // In-process ProxyServer (replaces child process spawning)
let serverRunning = false;
let serverPort = 1080;
let warpConnected = false;

// ========== Proxy Apps ==========
const APPS_DIR = path.join(PROJECT_ROOT, 'gui');
const STABLE_PROXIES_FILE = path.join(APPS_DIR, 'stable-proxies.json');

function loadProxyApps() {
  try {
    const f = path.join(APPS_DIR, 'proxy-apps.json');
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return []; }
}
function findFirstExisting(paths) {
  for (const p of paths) { if (fs.existsSync(p)) return p; }
  return null;
}
function findDiscordPath(localAppData) {
  try {
    const dir = path.join(localAppData, 'Discord');
    if (!fs.existsSync(dir)) return null;
    const appDirs = fs.readdirSync(dir).filter(d => d.startsWith('app-')).sort().reverse();
    for (const d of appDirs) {
      const exe = path.join(dir, d, 'Discord.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {}
  return null;
}
function getAppPresets() {
  if (!IS_WIN) return [];
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const lad = process.env.LOCALAPPDATA || path.join('C:\\Users', process.env.USERNAME || '', 'AppData\\Local');
  const roaming = process.env.APPDATA || path.join('C:\\Users', process.env.USERNAME || '', 'AppData\\Roaming');
  const candidates = [
    { name: 'Google Chrome', paths: [path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe')], icon: '🌐' },
    { name: 'Microsoft Edge', paths: [path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')], icon: '🌐' },
    { name: 'Firefox', paths: [path.join(pf, 'Mozilla Firefox', 'firefox.exe'), path.join(pf86, 'Mozilla Firefox', 'firefox.exe')], icon: '🦊' },
    { name: 'WeChat', paths: [path.join(lad, 'Tencent', 'WeChat', 'WeChat.exe'), path.join(pf86, 'Tencent', 'WeChat', 'WeChat.exe'), path.join(pf, 'Tencent', 'WeChat', 'WeChat.exe')], icon: '💬' },
    { name: 'QQ', paths: [path.join(pf, 'Tencent', 'QQ', 'Bin', 'QQ.exe'), path.join(pf86, 'Tencent', 'QQ', 'Bin', 'QQ.exe'), path.join(lad, 'Programs', 'Tencent', 'QQ', 'Bin', 'QQ.exe')], icon: '💬' },
    { name: 'Telegram', paths: [path.join(lad, 'Telegram Desktop', 'Telegram.exe')], icon: '✈️' },
    { name: 'Discord', paths: [findDiscordPath(lad)].filter(Boolean), icon: '🎮' },
    { name: 'Spotify', paths: [path.join(roaming, 'Spotify', 'Spotify.exe'), path.join(lad, 'Spotify', 'Spotify.exe'), path.join(pf, 'Spotify', 'Spotify.exe')], icon: '🎵' },
    { name: 'Steam', paths: [path.join(pf86, 'Steam', 'steam.exe'), path.join(pf, 'Steam', 'steam.exe')], icon: '🎮' },
  ];
  const result = [];
  for (const c of candidates) {
    const existing = findFirstExisting(c.paths);
    if (existing) result.push({ name: c.name, path: existing, icon: c.icon });
  }
  return result;
}
function saveProxyApps(apps) {
  try {
    fs.writeFileSync(path.join(APPS_DIR, 'proxy-apps.json'), JSON.stringify(apps, null, 2));
  } catch {}
}

// ========== Stable Proxy Pool ==========
function loadStableProxies() {
  try {
    if (!fs.existsSync(STABLE_PROXIES_FILE)) return [];
    return JSON.parse(fs.readFileSync(STABLE_PROXIES_FILE, 'utf8'));
  } catch { return []; }
}
function saveStableProxies(proxies) {
  try {
    fs.writeFileSync(STABLE_PROXIES_FILE, JSON.stringify(proxies, null, 2));
  } catch {}
}
function getSystemProxy() {
  if (os.platform() !== 'win32') return { enabled: false, server: '', autoConfig: '' };
  const regBase = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  const query = (name) => {
    try {
      const r = execSync(`reg query "${regBase}" /v ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const m = r.match(new RegExp(name + '\\s+REG_(?:SZ|DWORD|BINARY)\\s+(.+)', 'i'));
      return m ? m[1].trim() : '';
    } catch { return ''; }
  };
  const enabledRaw = query('ProxyEnable');
  return {
    enabled: enabledRaw.includes('0x1'),
    server: query('ProxyServer'),
    autoConfig: query('AutoConfigURL')
  };
}
function refreshSystemProxy() {
  if (os.platform() !== 'win32') return;
  // Notify Windows of proxy setting changes via WinINet InternetSetOption
  try { execSync('rundll32.exe wininet.dll,InternetSetOption 0,37,0,0', { stdio: 'ignore', timeout: 3000 }); } catch {}
  try { execSync('rundll32.exe wininet.dll,InternetSetOption 0,39,0,0', { stdio: 'ignore', timeout: 3000 }); } catch {}
}
function setSystemProxy(enable, port = 1080) {
  if (os.platform() !== 'win32') return false;
  const regBase = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  const reg = (args) => { try { execSync(`reg ${args}`, { stdio: 'ignore' }); return true; } catch { return false; } };
  try {
    if (enable) {
      reg(`add "${regBase}" /v ProxyEnable /t REG_DWORD /d 1 /f`);
      reg(`add "${regBase}" /v ProxyServer /t REG_SZ /d "127.0.0.1:${port}" /f`);
      reg(`add "${regBase}" /v ProxyOverride /t REG_SZ /d "<local>" /f`);
      reg(`delete "${regBase}" /v AutoConfigURL /f`);
    } else {
      // Full cleanup: disable + remove all proxy-related values
      reg(`add "${regBase}" /v ProxyEnable /t REG_DWORD /d 0 /f`);
      ['ProxyServer', 'ProxyOverride', 'AutoConfigURL', 'AutoDetect'].forEach(v => reg(`delete "${regBase}" /v ${v} /f`));
      try { execSync('netsh winhttp reset proxy', { stdio: 'ignore', timeout: 5000 }); } catch {}
    }
    refreshSystemProxy();
    return true;
  } catch { return false; }
}
function generatePAC(port = 1080) {
  return `function FindProxyForURL(url, host) {
  // Bypass local addresses
  if (isPlainHostName(host) || host === '127.0.0.1' || host === '::1' || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.16.') || host.endsWith('.local')) {
    return 'DIRECT';
  }
  // Proxy everything else through the built-in proxy
  return 'PROXY 127.0.0.1:${port}; DIRECT';
}`;
}

// ========== WARP ==========
const WARP_PATH = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe';
function warpCmd(args, timeout = 8000) {
  const cmd = fs.existsSync(WARP_PATH) ? `"${WARP_PATH}" ${args}` : `warp-cli ${args}`;
  return run(cmd, timeout);
}
const WARP = {
  installed() {
    if (os.platform() === 'win32' && fs.existsSync(WARP_PATH)) return true;
    const r = run('warp-cli --version');
    return r && r.includes('warp');
  },
  status() {
    const r = warpCmd('status');
    if (!r) return null;
    return { connected: r.includes('Connected'), raw: r };
  },
  register() { return warpCmd('registration new', 15000); },
  connect() { warpCmd('connect', 10000); return true; },
  disconnect() { warpCmd('disconnect'); return true; }
};

// ========== Proxy ==========
const BUILTIN_PROXIES = [
  { host: '24.249.199.4', port: 4145, type: 'socks5' },
  { host: '174.75.211.222', port: 4145, type: 'socks5' },
  { host: '72.195.34.58', port: 4145, type: 'socks5' },
  { host: '72.195.114.169', port: 4145, type: 'socks5' },
  { host: '174.64.199.79', port: 4145, type: 'socks5' },
];

async function fetchProxies() {
  try {
    const proxies = await proxyCore.fetchProxies();
    return proxies.map(p => ({ ...p, source: p.source || 'Unknown' }));
  } catch (e) {
    console.error('GUI: Failed to fetch proxies via proxy-core, falling back to built-in proxies');
    return BUILTIN_PROXIES.map(p => ({ ...p, source: 'Built-in' }));
  }
}

// ========== Free Proxy Cache ==========
let freeProxyCache = { proxies: [], time: 0, fetching: false };
const PROXY_CACHE_TTL = 300000; // 5 min
let autoFinding = false; // auto-find task lock

async function getFreeProxies(force = false) {
  const now = Date.now();
  if (!force && freeProxyCache.proxies.length > 0 && (now - freeProxyCache.time) < PROXY_CACHE_TTL) {
    return freeProxyCache;
  }
  // If a fetch is in progress, wait for it to complete instead of returning stale/empty cache
  if (freeProxyCache.fetching) {
    while (freeProxyCache.fetching) {
      await new Promise(r => setTimeout(r, 100));
    }
    return freeProxyCache;
  }
  freeProxyCache.fetching = true;
  try {
    const proxies = await fetchProxies();
    freeProxyCache = { proxies, time: Date.now(), fetching: false };
    broadcast({ type: 'free-proxy-update', count: proxies.length });
  } catch {
    freeProxyCache.fetching = false;
  }
  return freeProxyCache;
}

// Auto-refresh cache every 5 min
let refreshTimer = setInterval(() => getFreeProxies(true), PROXY_CACHE_TTL);
refreshTimer.unref?.();

async function testProxy(proxy, timeout = 6000) {
  const start = Date.now();
  const testUrls = [
    'https://api.ipify.org?format=json',
    'https://httpbin.org/ip',
    'https://ifconfig.me/ip',
  ];
  try {
    const https = require('https');
    let agent;
    const proxyType = (proxy.type || 'socks5').toLowerCase();
    if (proxyType === 'http' || proxyType === 'https') {
      // HTTP proxy → use HttpProxyAgent
      try {
        const { HttpProxyAgent } = require('http-proxy-agent');
        agent = new HttpProxyAgent(`http://${proxy.host}:${proxy.port}`);
      } catch {}
    } else {
      // SOCKS4/SOCKS5 → use SocksProxyAgent with correct protocol prefix
      try {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const proto = proxyType === 'socks4' ? 'socks4' : 'socks5';
        agent = new SocksProxyAgent(`${proto}://${proxy.host}:${proxy.port}`);
      } catch {
        // Fallback: try HttpProxyAgent
        try {
          const { HttpProxyAgent } = require('http-proxy-agent');
          agent = new HttpProxyAgent(`http://${proxy.host}:${proxy.port}`);
        } catch {}
      }
    }
    if (!agent) return { ...proxy, alive: false, latency: -1 };
    // Try multiple test URLs, return on first success
    for (const testUrl of testUrls) {
      try {
        const result = await new Promise((resolve, reject) => {
          const req = https.get(testUrl, { agent, timeout, rejectUnauthorized: false }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        let ip = '';
        try {
          const parsed = JSON.parse(result);
          ip = parsed.ip || parsed.origin || '';
        } catch { ip = result.trim().split('\n')[0]; }
        return { ...proxy, alive: true, latency: Date.now() - start, ip };
      } catch { continue; }
    }
    return { ...proxy, alive: false, latency: -1 };
  } catch {
    return { ...proxy, alive: false, latency: -1 };
  }
}

async function findBestProxy(maxTest = 50, wsClients = []) {
  let proxies = await fetchProxies();
  proxies = proxies.sort(() => Math.random() - 0.5).slice(0, maxTest);
  const results = [];
  const batchSize = 20;
  for (let i = 0; i < proxies.length; i += batchSize) {
    const batch = proxies.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(p => testProxy(p)));
    results.push(...batchResults);
    // Broadcast progress via WebSocket
    const progress = { type: 'test-progress', tested: Math.min(i + batchSize, proxies.length), total: proxies.length, results: batchResults };
    wsClients.forEach(ws => { try { ws.send(JSON.stringify(progress)); } catch {} });
  }
  stats.recordBatch(results);
  return results.filter(r => r.alive).sort((a, b) => a.latency - b.latency);
}

// ========== WebSocket ==========
let wss;
let httpServer;
const wsClients = [];

function broadcast(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach(ws => { try { ws.send(msg); } catch {} });
}

// ========== HTTP Server ==========
const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function sendHTML(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('Not Found');
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

async function handleRequest(req, res) {
  try {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API routes
  if (pathname === '/api/status') {
    const ws = WARP.status();
    const sysProxy = getSystemProxy();
    return sendJSON(res, {
      warp: { installed: WARP.installed(), connected: ws ? ws.connected : false, raw: ws ? ws.raw : '' },
      server: { running: serverRunning, port: serverPort },
      stats: stats.getStats(),
      systemProxy: sysProxy
    });
  }

  if (pathname === '/api/diagnostics') {
    const cache = freeProxyCache;
    const proxies = cache.proxies || [];
    // Source breakdown
    const sourceCounts = {};
    const typeCounts = {};
    proxies.forEach(p => {
      const s = p.source || 'Unknown';
      sourceCounts[s] = (sourceCounts[s] || 0) + 1;
      const t = p.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    return sendJSON(res, {
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage().rss,
        pid: process.pid,
      },
      proxyCache: {
        total: proxies.length,
        sources: sourceCounts,
        types: typeCounts,
        lastUpdated: cache.time || 0,
      },
      server: { running: serverRunning, port: serverPort },
    });
  }

  if (pathname === '/api/stats') {
    return sendJSON(res, stats.getStats());
  }

  if (pathname === '/api/proxies' && req.method === 'GET') {
    const proxies = await fetchProxies();
    return sendJSON(res, { count: proxies.length, proxies: proxies.slice(0, 50) });
  }

  if (pathname === '/api/proxy/test' && req.method === 'POST') {
    const body = await parseBody(req);
    if (body.host && body.port) {
      const result = await testProxy({ host: body.host, port: parseInt(body.port), type: body.type || 'socks5' });
      stats.recordTest(result);
      return sendJSON(res, result);
    }
    return sendJSON(res, { error: 'host and port required' }, 400);
  }

  if (pathname === '/api/proxy/test-all' && req.method === 'POST') {
    const body = await parseBody(req);
    const maxTest = body.max || 30;
    // Run in background, stream results via WebSocket
    findBestProxy(maxTest, wsClients).then(alive => {
      broadcast({ type: 'test-complete', alive });
    });
    return sendJSON(res, { status: 'started' });
  }

  if (pathname === '/api/warp/connect' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { connected: false, error: 'WARP is only supported on Windows desktop' });
    WARP.connect();
    await new Promise(r => setTimeout(r, 2000));
    const s = WARP.status();
    return sendJSON(res, { connected: s ? s.connected : false });
  }

  if (pathname === '/api/warp/disconnect' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { connected: false });
    WARP.disconnect();
    return sendJSON(res, { connected: false });
  }

  if (pathname === '/api/proxy/status' && req.method === 'GET') {
    return sendJSON(res, {
      running: !!(proxyServerInstance && serverRunning),
      port: serverPort || 1080,
      host: '127.0.0.1',
      type: 'SOCKS5'
    });
  }

  if (pathname === '/api/warp/register' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { success: false, error: 'WARP is only supported on Windows desktop' });
    const r = WARP.register();
    return sendJSON(res, { success: r && !r.toLowerCase().includes('error'), raw: r });
  }

  if (pathname === '/api/server/start' && req.method === 'POST') {
    const body = await parseBody(req);
    let requestedPort = parseInt(body.port);
    if (!Number.isFinite(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
      return sendJSON(res, { error: `Invalid port: ${body.port}. Please enter a number between 1-65535.` }, 400);
    }
    // Start proxy server in-process (works on all platforms including Android)
    try {
      if (proxyServerInstance) {
        try { proxyServerInstance.stop(); } catch {}
        proxyServerInstance = null;
      }
      proxyServerInstance = new ProxyServer(requestedPort, null);
      const ok = await proxyServerInstance.start();
      serverRunning = ok;
      serverPort = proxyServerInstance.port;
      return sendJSON(res, { running: ok, port: serverPort });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }

  if (pathname === '/api/server/stop' && req.method === 'POST') {
    if (proxyServerInstance) {
      try { proxyServerInstance.stop(); } catch {}
      proxyServerInstance = null;
    }
    serverRunning = false;
    return sendJSON(res, { running: false });
  }

  if (pathname === '/api/server/set-upstream' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.proxy) return sendJSON(res, { error: 'proxy required' }, 400);
    // Parse proxy string like "socks5://host:port", "socks4://host:port", "http://host:port"
    let proxyStr = body.proxy;
    const m = proxyStr.match(/^(?:socks[45]|https?):\/\/(.+):(\d+)$/i);
    if (!m) return sendJSON(res, { error: 'invalid proxy format' }, 400);
    const upstreamHost = m[1];
    const upstreamPort = parseInt(m[2]);
    const upstreamType = proxyStr.match(/^(socks[45]|https?):\/\//i)?.[1].toLowerCase() || 'socks5';
    // Restart in-process proxy server with upstream proxy
    try {
      if (proxyServerInstance) {
        try { proxyServerInstance.stop(); } catch {}
        proxyServerInstance = null;
      }
      proxyServerInstance = new ProxyServer(serverPort || 1080, { host: upstreamHost, port: upstreamPort, type: upstreamType });
      const ok = await proxyServerInstance.start();
      serverRunning = ok;
      return sendJSON(res, { running: ok, port: serverPort || 1080, upstream: { host: upstreamHost, port: upstreamPort } });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }

  if (pathname === '/api/history') {
    return sendJSON(res, { tests: stats.getHistory({ limit: 100 }) });
  }

  if (pathname === '/api/proxy/fetch-free' && req.method === 'GET') {
    const cache = await getFreeProxies();
    return sendJSON(res, { count: cache.proxies.length, proxies: cache.proxies.slice(0, 200) });
  }

  if (pathname === '/api/proxy/test-all-free' && req.method === 'POST') {
    const body = await parseBody(req);
    const maxTest = body.max || 50;
    const cache = await getFreeProxies(true);
    // Run in background, stream results via WebSocket
    (async () => {
      const toTest = cache.proxies.slice(0, maxTest);
      const results = [];
      for (let i = 0; i < toTest.length; i++) {
        const p = toTest[i];
        const r = await testProxy(p, 6000);
        if (r.alive) stats.recordTest(r);
        results.push(r);
        broadcast({ type: 'test-progress', tested: i + 1, total: toTest.length, results: [r] });
      }
      const alive = results.filter(r => r.alive);
      broadcast({ type: 'test-complete', alive, total: toTest.length });
    })();
    return sendJSON(res, { status: 'started', count: cache.proxies.length });
  }

  // ===== Auto-find stable proxies =====
  // Strategy: fetch proxy list → test a batch → re-test survivors to confirm stability → save low-latency stable ones
  if (pathname === '/api/proxy/auto-find' && req.method === 'POST') {
    if (autoFinding) return sendJSON(res, { error: 'An auto-find task is already in progress' }, 409);
    const body = await parseBody(req);
    const maxTest = body.max || 80;        // initial sample size
    const maxLatency = body.maxLatency || 800; // stability latency threshold (ms)
    const confirmRounds = body.rounds || 1;    // how many rounds a proxy must survive
    (async () => {
      autoFinding = true;
      try {
        broadcast({ type: 'auto-find-stage', stage: 'fetch', message: 'Fetching proxy list...' });
        const cache = await getFreeProxies(true);
        let proxyList = cache.proxies;
        // Fallback to built-in proxies if cache is empty
        if (!proxyList || proxyList.length === 0) {
          proxyList = BUILTIN_PROXIES.map(p => ({ ...p, source: 'Built-in' }));
        }
        // Always include all built-in proxies (preserve them), then randomly sample the rest
        const builtinSet = new Set(BUILTIN_PROXIES.map(p => p.host + ':' + p.port));
        const builtinsToTest = proxyList.filter(p => builtinSet.has(p.host + ':' + p.port));
        const others = proxyList.filter(p => !builtinSet.has(p.host + ':' + p.port));
        const sampled = others.sort(() => Math.random() - 0.5).slice(0, Math.max(0, maxTest - builtinsToTest.length));
        const toTest = [...builtinsToTest, ...sampled];
        broadcast({ type: 'auto-find-stage', stage: 'test', message: `Initial testing of ${toTest.length} proxies (including ${builtinsToTest.length} built-in)...`, tested: 0, total: toTest.length });

        // Round 1: initial test (batch for speed)
        let survivors = [];
        const batchSize = 20;
        for (let i = 0; i < toTest.length; i += batchSize) {
          const batch = toTest.slice(i, i + batchSize);
          const batchResults = await Promise.all(batch.map(p => testProxy(p, 3000)));
          for (const r of batchResults) {
            const isBuiltin = builtinSet.has(r.host + ':' + r.port);
            if (r.alive && (isBuiltin || r.latency <= maxLatency)) survivors.push(r);
            if (r.alive) stats.recordTest(r);
          }
          broadcast({ type: 'auto-find-progress', stage: 'test', tested: Math.min(i + batchSize, toTest.length), total: toTest.length, alive: survivors.length, current: batchResults[batchResults.length - 1] });
        }

        // Confirmation rounds: re-test survivors to confirm stability
        for (let round = 2; round <= confirmRounds; round++) {
          broadcast({ type: 'auto-find-stage', stage: 'confirm', message: `Round ${round}/${confirmRounds} stability verification (${survivors.length} remaining)...`, tested: 0, total: survivors.length });
          const confirmed = [];
          for (let i = 0; i < survivors.length; i += batchSize) {
            const batch = survivors.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(p => testProxy(p, 3000)));
            for (let j = 0; j < batchResults.length; j++) {
              const r = batchResults[j];
              const isBuiltin = builtinSet.has(r.host + ':' + r.port);
              if (r.alive && (isBuiltin || r.latency <= maxLatency)) {
                const prev = batch[j];
                confirmed.push({ ...prev, latency: Math.round((prev.latency + r.latency) / 2), tests: (prev.tests || 1) + 1 });
              }
            }
            broadcast({ type: 'auto-find-progress', stage: 'confirm', round, tested: Math.min(i + batchSize, survivors.length), total: survivors.length, alive: confirmed.length, current: batchResults[batchResults.length - 1] });
          }
          survivors = confirmed;
        }

        // Sort by latency ascending
        survivors.sort((a, b) => a.latency - b.latency);

        // Merge with existing stable pool (dedupe by host:port, keep best latency)
        const existing = loadStableProxies();
        const map = new Map();
        for (const p of existing) map.set(p.host + ':' + p.port, p);
        for (const p of survivors) {
          const key = p.host + ':' + p.port;
          const isBuiltin = builtinSet.has(key);
          const old = map.get(key);
          if (!old) {
            map.set(key, { host: p.host, port: p.port, type: p.type, latency: p.latency, ip: p.ip || '', source: isBuiltin ? 'Built-in' : (p.source || ''), tests: p.tests || 1, builtin: isBuiltin, added: Date.now() });
          } else {
            // keep lower latency, bump tests count
            if (p.latency < old.latency) old.latency = p.latency;
            old.tests = (old.tests || 1) + (p.tests || 1);
            old.lastChecked = Date.now();
            if (isBuiltin) old.builtin = true;
          }
        }
        // Always ensure all built-in proxies remain in the pool (even if they failed testing, mark them as built-in)
        for (const bp of BUILTIN_PROXIES) {
          const key = bp.host + ':' + bp.port;
          if (!map.has(key)) {
            map.set(key, { host: bp.host, port: bp.port, type: bp.type, latency: 0, ip: '', source: 'Built-in', tests: 0, builtin: true, added: Date.now() });
          } else {
            map.get(key).builtin = true;
          }
        }
        const merged = Array.from(map.values()).sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
        saveStableProxies(merged);

        broadcast({ type: 'auto-find-complete', found: survivors.length, total: merged.length, proxies: merged.slice(0, 50), newProxies: survivors.slice(0, 50) });
      } catch (e) {
        broadcast({ type: 'auto-find-complete', error: e.message });
      } finally {
        autoFinding = false;
      }
    })();
    return sendJSON(res, { status: 'started', max: maxTest, maxLatency, rounds: confirmRounds });
  }

  if (pathname === '/api/proxy/stable' && req.method === 'GET') {
    const list = loadStableProxies();
    return sendJSON(res, { count: list.length, proxies: list });
  }

  if (pathname === '/api/proxy/stable/clear' && req.method === 'POST') {
    // Keep built-in proxies, only clear non-built-in ones
    const builtins = BUILTIN_PROXIES.map(p => ({ host: p.host, port: p.port, type: p.type, latency: 0, ip: '', source: 'Built-in', tests: 0, builtin: true, added: Date.now() }));
    saveStableProxies(builtins);
    return sendJSON(res, { success: true, count: builtins.length });
  }

  if (pathname === '/api/proxy/stable/remove' && req.method === 'POST') {
    const body = await parseBody(req);
    // Prevent removal of built-in proxies
    const isBuiltin = BUILTIN_PROXIES.some(p => p.host === body.host && parseInt(p.port) === parseInt(body.port));
    if (isBuiltin) return sendJSON(res, { error: 'Built-in proxies cannot be removed' }, 400);
    const list = loadStableProxies().filter(p => !(p.host === body.host && parseInt(p.port) === parseInt(body.port)));
    saveStableProxies(list);
    return sendJSON(res, { success: true, count: list.length });
  }

  if (pathname === '/api/proxy/stable/add' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.host || !body.port) return sendJSON(res, { error: 'host and port required' }, 400);
    const list = loadStableProxies();
    const exists = list.some(p => p.host === body.host && parseInt(p.port) === parseInt(body.port));
    if (!exists) {
      list.push({ host: body.host, port: parseInt(body.port), type: body.type || 'socks5', latency: body.latency || 0, ip: body.ip || '', source: 'Manual', tests: 0, added: Date.now() });
      list.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
      saveStableProxies(list);
    }
    return sendJSON(res, { success: true, count: list.length });
  }

  if (pathname === '/api/stats/clear' && req.method === 'POST') {
    stats.clearHistory();
    return sendJSON(res, { success: true });
  }

  // ===== Logs API =====
  if (pathname === '/api/logs' && req.method === 'GET') {
    const logger = require(path.join(PROJECT_ROOT, 'lib', 'logger'));
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    return sendJSON(res, {
      logs: logger.getLogs(limit),
      stats: logger.getLogStats(),
      logDir: logger.getLogDir()
    });
  }
  if (pathname === '/api/logs/clear' && req.method === 'POST') {
    const logger = require(path.join(PROJECT_ROOT, 'lib', 'logger'));
    logger.clearLogs();
    return sendJSON(res, { success: true });
  }

  // ===== Config API =====
  if (pathname === '/api/config' && req.method === 'GET') {
    const fs = require('fs');
    const os = require('os');
    const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
    const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    const defaults = {
      defaultMode: 'auto',
      defaultPort: 1080,
      guiPort: 3000,
      autoStartWarp: true,
      logLevel: 'info',
      logToFile: true,
      proxyTestCount: 30,
    };
    return sendJSON(res, { config: { ...defaults, ...cfg } });
  }
  if (pathname === '/api/config' && req.method === 'POST') {
    const fs = require('fs');
    const os = require('os');
    const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
    const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
    const body = await parseBody(req);
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    if (body.key !== undefined) {
      cfg[body.key] = body.value;
    }
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return sendJSON(res, { success: true, config: cfg });
  }
  if (pathname === '/api/config/reset' && req.method === 'POST') {
    const fs = require('fs');
    const os = require('os');
    const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
    const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
    if (fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, '{}');
    }
    return sendJSON(res, { success: true });
  }

  // ===== Quote & Wallpaper Proxy (bypass browser proxy restrictions) =====
  if (pathname === '/api/quote') {
    try {
      const data = await httpGet('https://uapis.cn/api/v1/saying/random', 10000);
      const parsed = JSON.parse(data);
      // uapis.cn returns: { uuid, content, source, author, corpus, category, createdAt }
      return sendJSON(res, {
        code: 200,
        data: {
          content: parsed.content || '',
          author: parsed.author || parsed.source || 'Unknown'
        }
      });
    } catch (e) {
      // Return fallback quote even on error so the widget always shows something
      return sendJSON(res, { code: 200, data: { content: 'Life is like a box of chocolates, you never know what you\'re gonna get.', author: 'Forrest Gump' } });
    }
  }

  if (pathname === '/api/wallpaper') {
    try {
      const data = await new Promise((resolve, reject) => {
        https.get('https://wp.upx8.com/api.php', { timeout: 15000, rejectUnauthorized: false, headers: { 'Accept-Encoding': 'identity' } }, response => {
          const chunks = [];
          response.on('data', c => chunks.push(c));
          response.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
      });
      const b64 = data.toString('base64');
      const mime = 'image/jpeg';
      return sendJSON(res, { data: 'data:' + mime + ';base64,' + b64 });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 502);
    }
  }

  if (pathname === '/api/wallpaper/bing') {
    try {
      const bingData = await new Promise((resolve, reject) => {
        https.get('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1', { timeout: 15000, rejectUnauthorized: false, headers: { 'Accept-Encoding': 'identity' } }, response => {
          let data = '';
          response.on('data', c => data += c);
          response.on('end', () => resolve(data));
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
      });
      const bingJson = JSON.parse(bingData);
      if (bingJson && bingJson.images && bingJson.images[0]) {
        const imgUrl = 'https://www.bing.com' + bingJson.images[0].url;
        const imgData = await new Promise((resolve, reject) => {
          https.get(imgUrl, { timeout: 15000, rejectUnauthorized: false, headers: { 'Accept-Encoding': 'identity' } }, response => {
            const chunks = [];
            response.on('data', c => chunks.push(c));
            response.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
        });
        const b64 = imgData.toString('base64');
        return sendJSON(res, { data: 'data:image/jpeg;base64,' + b64 });
      }
      return sendJSON(res, { error: 'no image' }, 500);
    } catch (e) {
      return sendJSON(res, { error: e.message }, 502);
    }
  }

  // ===== App Proxy =====
  if (pathname === '/api/proxy/apps' && req.method === 'GET') {
    return sendJSON(res, { apps: loadProxyApps() });
  }
  if (pathname === '/api/proxy/apps' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.name || !body.path) return sendJSON(res, { error: 'name and path required' }, 400);
    const apps = loadProxyApps();
    if (apps.find(a => a.name === body.name)) return sendJSON(res, { error: 'app already exists' }, 409);
    const app = { name: body.name, path: body.path, mode: body.mode || 'http', process: body.process || '', added: Date.now() };
    apps.push(app);
    saveProxyApps(apps);
    return sendJSON(res, { success: true, apps });
  }
  if (pathname === '/api/proxy/apps/edit' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.name || !body.path) return sendJSON(res, { error: 'name and path required' }, 400);
    let apps = loadProxyApps();
    const idx = apps.findIndex(a => a.name === body.oldName || a.name === body.name);
    if (idx < 0) return sendJSON(res, { error: 'app not found' }, 404);
    apps[idx] = { name: body.name, path: body.path, mode: body.mode || apps[idx].mode || 'http', process: body.process || '', added: apps[idx].added };
    saveProxyApps(apps);
    return sendJSON(res, { success: true, apps });
  }
  if (pathname === '/api/proxy/apps/remove' && req.method === 'POST') {
    const body = await parseBody(req);
    let apps = loadProxyApps();
    apps = apps.filter(a => a.name !== body.name);
    saveProxyApps(apps);
    return sendJSON(res, { success: true, apps });
  }
  if (pathname === '/api/proxy/apps/presets') {
    return sendJSON(res, { presets: getAppPresets() });
  }
  if (pathname === '/api/proxy/apps/browse' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { error: 'Windows only' }, 400);
    try {
      const psScript = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Program files (*.exe;*.bat;*.cmd;*.lnk)|*.exe;*.bat;*.cmd;*.lnk|All files (*.*)|*.*'; $f.Title = 'Select Application'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.FileName }";
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const result = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { encoding: 'utf8', timeout: 120000, windowsHide: true });
      const filePath = result.trim();
      if (filePath) return sendJSON(res, { path: filePath });
      return sendJSON(res, { cancelled: true });
    } catch (e) {
      return sendJSON(res, { error: 'File selection failed' }, 500);
    }
  }
  if (pathname === '/api/proxy/apps/launch' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { error: 'App launch is only supported on Windows desktop' }, 400);
    const body = await parseBody(req);
    const app = loadProxyApps().find(a => a.name === body.name);
    if (!app) return sendJSON(res, { error: 'app not found' }, 404);
    const proxyPort = serverPort || 1080;
    const safeName = app.name.replace(/[^a-zA-Z0-9]/g, '_');
    const batPath = path.join(APPS_DIR, 'launch_' + safeName + '.bat');
    let killLog = '';
    if (app.process) {
      const procName = app.process.trim();
      try {
        execSync(`taskkill /F /IM "${procName}"`, { stdio: ['pipe', 'pipe', 'ignore'] });
        killLog = `Terminated old ${procName} process; `;
      } catch {}
    }
    let batLines = ['@echo off'];
    if (app.mode === 'socks5') {
      batLines.push(`set HTTP_PROXY=socks5://127.0.0.1:${proxyPort}`);
      batLines.push(`set HTTPS_PROXY=socks5://127.0.0.1:${proxyPort}`);
      batLines.push(`set ALL_PROXY=socks5://127.0.0.1:${proxyPort}`);
    } else {
      batLines.push(`set HTTP_PROXY=http://127.0.0.1:${proxyPort}`);
      batLines.push(`set HTTPS_PROXY=http://127.0.0.1:${proxyPort}`);
      batLines.push(`set ALL_PROXY=http://127.0.0.1:${proxyPort}`);
    }
    batLines.push(`start "" "${app.path}"`);
    const batContent = batLines.join('\r\n') + '\r\n';
    try {
      fs.writeFileSync(batPath, batContent);
      spawn('cmd.exe', ['/c', 'start', '', '/min', batPath], { detached: true, stdio: 'ignore' }).unref();
      return sendJSON(res, { success: true, message: killLog + 'Launched' });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }
  // Launch an app directly with a specific proxy (no local proxy server needed)
  if (pathname === '/api/proxy/launch-app' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { error: 'Windows desktop only' }, 400);
    const body = await parseBody(req);
    const { host, port, type, appPath, appName, processName } = body;
    if (!host || !port || !appPath) return sendJSON(res, { error: 'host, port, appPath are required' }, 400);
    let killLog = '';
    const proc = (processName || '').trim();
    if (proc) {
      try {
        execSync(`taskkill /F /IM "${proc}"`, { stdio: ['pipe', 'pipe', 'ignore'] });
        killLog = `Terminated ${proc}; `;
      } catch {}
    }
    const proto = (type || 'socks5').toLowerCase() === 'http' ? 'http' : 'socks5';
    const proxyUrl = `${proto}://${host}:${port}`;
    const safeName = (appName || 'app').replace(/[^a-zA-Z0-9]/g, '_');
    const batPath = path.join(APPS_DIR, 'launch_' + safeName + '_' + Date.now() + '.bat');
    const batContent = [
      '@echo off',
      `set HTTP_PROXY=${proxyUrl}`,
      `set HTTPS_PROXY=${proxyUrl}`,
      `set ALL_PROXY=${proxyUrl}`,
      `set http_proxy=${proxyUrl}`,
      `set https_proxy=${proxyUrl}`,
      `set all_proxy=${proxyUrl}`,
      `start "" "${appPath}"`,
      'exit'
    ].join('\r\n') + '\r\n';
    try {
      fs.writeFileSync(batPath, batContent);
      spawn('cmd.exe', ['/c', 'start', '', '/min', batPath], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => { try { fs.unlinkSync(batPath); } catch {} }, 10000);
      return sendJSON(res, { success: true, message: killLog + 'Launched', proxy: proxyUrl, app: appPath });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }
  if (pathname === '/api/proxy/system' && req.method === 'GET') {
    const info = getSystemProxy();
    return sendJSON(res, { enabled: info.enabled, server: info.server, autoConfig: info.autoConfig, port: serverPort || 1080 });
  }
  if (pathname === '/api/proxy/system' && req.method === 'POST') {
    const body = await parseBody(req);
    const success = setSystemProxy(body.enable, body.port || serverPort || 1080);
    const info = getSystemProxy();
    return sendJSON(res, { success, enabled: info.enabled, server: info.server, autoConfig: info.autoConfig });
  }
  if (pathname === '/api/proxy/disconnect-all' && req.method === 'POST') {
    const results = {};
    results.systemProxy = (() => { try { return setSystemProxy(false); } catch { return false; } })();
    results.warp = (() => { try { return WARP.installed() ? (WARP.disconnect(), true) : 'not installed'; } catch { return false; } })();
    if (proxyServerInstance) { try { proxyServerInstance.stop(); } catch {} proxyServerInstance = null; }
    serverRunning = false;
    results.proxyServer = true;
    broadcast({ type: 'disconnect-all', results });
    return sendJSON(res, { success: true, results });
  }
  if (pathname === '/api/proxy/pac') {
    const pacContent = generatePAC(serverPort || 1080);
    const host = req.headers.host || '127.0.0.1:3000';
    return sendJSON(res, { url: `http://${host}/proxy.pac`, content: pacContent });
  }
  if (pathname === '/proxy.pac') {
    res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig' });
    res.end(generatePAC(serverPort || 1080));
    return;
  }

  // ===== Media Extraction =====
  if (pathname === '/api/extract' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const url = body.url;
      if (!url) return sendJSON(res, { error: 'url required' }, 400);
      const html = await new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { timeout: 15000, rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' } }, res => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
      });
      const videos = [], audios = [], images = [];
      const base = new URL(url);
      function resolveUrl(src) {
        try { return new URL(src, url).href; } catch { return src; }
      }
      const videoRe = /<video[^>]*>([\s\S]*?)<\/video>/gi;
      let vm;
      while ((vm = videoRe.exec(html)) !== null) {
        const block = vm[0];
        const poster = (block.match(/poster=["']([^"']+)/) || [])[1];
        if (poster) videos.push({ type: 'poster', src: resolveUrl(poster) });
        const srcMatch = block.match(/src=["']([^"']+)/);
        if (srcMatch) videos.push({ type: 'video', src: resolveUrl(srcMatch[1]) });
        const srcRe = /<source[^>]+src=["']([^"']+)/gi;
        let sm;
        while ((sm = srcRe.exec(block)) !== null) {
          const s = sm[1];
          if (!s.endsWith('.vtt') && !s.includes('subtitle')) videos.push({ type: 'video', src: resolveUrl(s) });
        }
      }
      const vdRe = /<video[^>]+src=["']([^"']+)/gi;
      let vdm;
      while ((vdm = vdRe.exec(html)) !== null) {
        const s = vdm[1];
        if (!videos.find(v => v.src === resolveUrl(s))) videos.push({ type: 'video', src: resolveUrl(s) });
      }
      if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
        const vid = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (vid) videos.push({ type: 'embed', src: 'https://www.youtube.com/embed/' + vid[1], platform: 'YouTube' });
      }
      if (url.includes('bilibili.com/video/')) {
        const vid = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);
        if (vid) videos.push({ type: 'embed', src: 'https://player.bilibili.com/player.html?bvid=' + vid[1], platform: 'Bilibili' });
      }
      const audioRe = /<audio[^>]*>([\s\S]*?)<\/audio>/gi;
      let am;
      while ((am = audioRe.exec(html)) !== null) {
        const block = am[0];
        const srcMatch = block.match(/src=["']([^"']+)/);
        if (srcMatch) audios.push({ src: resolveUrl(srcMatch[1]) });
        const srcRe2 = /<source[^>]+src=["']([^"']+)/gi;
        let sm2;
        while ((sm2 = srcRe2.exec(block)) !== null) audios.push({ src: resolveUrl(sm2[1]) });
      }
      const adRe = /<audio[^>]+src=["']([^"']+)/gi;
      let adm;
      while ((adm = adRe.exec(html)) !== null) {
        const s = adm[1];
        if (!audios.find(a => a.src === resolveUrl(s))) audios.push({ src: resolveUrl(s) });
      }
      const imgRe = /<img[^>]+src=["']([^"']+?)["'][^>]*>/gi;
      let im;
      const seenImgs = new Set();
      while ((im = imgRe.exec(html)) !== null) {
        const src = resolveUrl(im[1]);
        if (seenImgs.has(src) || src.includes('data:')) continue;
        seenImgs.add(src);
        const width = parseInt((im[0].match(/width=["'](\d+)/) || [])[1]) || 0;
        const height = parseInt((im[0].match(/height=["'](\d+)/) || [])[1]) || 0;
        const alt = (im[0].match(/alt=["']([^"']*)/) || [])[1] || '';
        if (width >= 100 || height >= 100 || src.includes('cdn') || src.includes('upload')) {
          images.push({ src, width, height, alt: alt.slice(0, 60) });
        }
      }
      const dedupe = arr => arr.filter((item, idx) => arr.findIndex(i => i.src === item.src) === idx);
      return sendJSON(res, {
        url,
        videos: dedupe(videos),
        audios: dedupe(audios),
        images: dedupe(images).slice(0, 50)
      });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }

  // Static files
  if (pathname === '/' || pathname === '/index.html') {
    return sendHTML(res, path.join(__dirname, 'public', 'index.html'));
  }

  const safePath = pathname.replace(/\.\./g, '');
  const filePath = path.join(__dirname, 'public', safePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendHTML(res, filePath);
  }

  res.writeHead(404); res.end('Not Found');
  } catch (err) {
    console.error('  [!] Request error:', err.message);
    try { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); } catch {}
  }
}

// ========== Start ==========
function killPort(port) {
  if (os.platform() !== 'win32') return;
  try {
    const out = execSync(`netstat -aon | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = out.split('\n').filter(l => l.includes('LISTENING'));
    for (const line of lines) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && !isNaN(pid)) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    }
  } catch {}
}

function start(port = 3000) {
  killPort(port);
  const server = http.createServer(handleRequest);
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    wsClients.push(ws);
    ws.on('close', () => {
      const idx = wsClients.indexOf(ws);
      if (idx >= 0) wsClients.splice(idx, 1);
    });
    ws.on('error', () => {});
    // Send initial status
    const wsStatus = WARP.status();
    ws.send(JSON.stringify({
      type: 'init',
      warp: { installed: WARP.installed(), connected: wsStatus ? wsStatus.connected : false },
      server: { running: serverRunning, port: serverPort }
    }));
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`  [*] Web GUI started: http://127.0.0.1:${port}`);
    // Auto-open browser
    const cmd = os.platform() === 'win32'
      ? `start "" "http://127.0.0.1:${port}"`
      : os.platform() === 'darwin'
        ? `open "http://127.0.0.1:${port}"`
        : `xdg-open "http://127.0.0.1:${port}"`;
    try { execSync(cmd, { stdio: 'ignore' }); } catch {}
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`  [!] Port ${port} is already in use, trying ${port + 1}...`);
      start(port + 1);
    } else {
      console.error('  [✗] Server error:', err.message);
    }
  });

  httpServer = server;
  return server;
}

// Graceful shutdown: clear timer, stop proxy, close wss & http server
function stop() {
  try { clearInterval(refreshTimer); } catch {}
  refreshTimer = null;
  if (proxyServerInstance) {
    try { proxyServerInstance.stop(); } catch {}
    proxyServerInstance = null;
  }
  serverRunning = false;
  if (wss) {
    try { wss.clients.forEach(c => { try { c.close(); } catch {} }); wss.close(); } catch {}
    wss = null;
  }
  if (httpServer) {
    try { httpServer.close(); } catch {}
    httpServer = null;
  }
}

module.exports = { start, stop };
