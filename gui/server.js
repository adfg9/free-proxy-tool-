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
const i18n = require(path.join(PROJECT_ROOT, 'lib', 'i18n'));
const logger = require(path.join(PROJECT_ROOT, 'lib', 'logger'));
const { t } = i18n;

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
// Hint latency for BUILTIN_PROXIES (from verification logs) so untested ones rank near top
// (treated as "soft latency": replaced as soon as tests run via latency>0)
// Updated 2026-08-07 with latest 5-round measured averages
const BUILTIN_HINT_LATENCY = {
  '115.239.234.43:7302': 108,  // sub-200ms stable, actual avg=108ms
  '59.110.63.234:80':    188,  // sub-200ms stable, actual avg=188ms
  '31.43.179.194:80':    450,  // improved from 665ms
  '141.101.120.214:80':  451,  // improved from 717ms
  '45.131.4.250:80':     454,  // improved from 668ms
  '159.112.235.94:80':   454,  // improved from 656ms
  '141.101.121.226:80':  456,  // newly tested
  '39.109.113.97:4090':  434,  // NEW: Asia-focused search
  '103.21.244.132:80':   650,  // improved from 872ms
  '185.162.231.23:80':   655,  // newly tested
  '141.193.213.254:80':  663,  // improved from 656ms
  '172.64.94.22:80':     838,  // newly tested
  '45.12.31.237:80':     952,  // newly tested
};
function loadStableProxies() {
  try {
    const builtinHintKeys = BUILTIN_PROXIES.map(p => p.host + ':' + p.port);
    const builtinHintOrder = new Map(builtinHintKeys.map((k, i) => [k, i]));

    let firstInit = false;
    if (!fs.existsSync(STABLE_PROXIES_FILE)) {
      firstInit = true;
      const builtins = BUILTIN_PROXIES.map(p => {
        const key = p.host + ':' + p.port;
        const hintLatency = BUILTIN_HINT_LATENCY[key] || 0;
        return { host: p.host, port: p.port, type: p.type, latency: hintLatency, ip: '', source: 'Built-in', tests: 0, builtin: true, hint: hintLatency > 0, added: Date.now() };
      });
      saveStableProxies(builtins);
      return builtins;
    }
    const list = JSON.parse(fs.readFileSync(STABLE_PROXIES_FILE, 'utf8'));
    // Ensure built-in proxies are always present
    const builtinSet = new Set(builtinHintKeys);
    const existingSet = new Set(list.map(p => p.host + ':' + p.port));
    let changed = firstInit;
    for (const bp of BUILTIN_PROXIES) {
      const key = bp.host + ':' + bp.port;
      if (!existingSet.has(key)) {
        const hintLatency = BUILTIN_HINT_LATENCY[key] || 0;
        list.push({ host: bp.host, port: bp.port, type: bp.type, latency: hintLatency, ip: '', source: 'Built-in', tests: 0, builtin: true, hint: hintLatency > 0, added: Date.now() });
        changed = true;
      }
    }
    // Mark built-in proxies with builtin flag + propagate any hint latency for untested ones
    for (const p of list) {
      const key = p.host + ':' + p.port;
      if (builtinSet.has(key)) {
        if (!p.builtin) { p.builtin = true; changed = true; }
        if (!p.source) { p.source = 'Built-in'; changed = true; }
        const hint = BUILTIN_HINT_LATENCY[key];
        if (hint && (!p.latency || p.latency <= 0) && !p.tests) {
          p.latency = hint;
          p.hint = true;
          changed = true;
        }
      }
    }
    // Reorder: BUILTIN_PROXIES order first, then (tested non-builtin by latency), then (untested non-builtin last)
    const builtinsArr = [];
    const testedOthers = [];
    const untestedOthers = [];
    for (const p of list) {
      const key = p.host + ':' + p.port;
      if (builtinSet.has(key)) builtinsArr.push(p);
      else if (p.latency > 0 && !p.hint) testedOthers.push(p);
      else untestedOthers.push(p);
    }
    builtinsArr.sort((a, b) => (builtinHintOrder.get(a.host + ':' + a.port) ?? 9999) - (builtinHintOrder.get(b.host + ':' + b.port) ?? 9999));
    testedOthers.sort((a, b) => a.latency - b.latency);
    const ordered = builtinsArr.concat(testedOthers).concat(untestedOthers);
    // Only save reorder if length or order actually changed
    if (ordered.length !== list.length) changed = true;
    else { for (let i = 0; i < ordered.length; i++) { if (ordered[i] !== list[i]) { changed = true; break; } } }
    if (changed) saveStableProxies(ordered);
    return ordered;
  } catch (e) { logger.error('loadStableProxies failed', e); return []; }
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
  // ===== Re-verified 2026-08-07 (5 rounds each, actual measured latency) =====
  // Tested 66761 proxies from all sources + 1000 Asia-focused samples
  // All below are 80-100% success rate across 5 consecutive test rounds.

  // 🏆 SUB-200ms STABLE (avg 108ms, 100%): fastest verified free proxy!
  { host: '115.239.234.43', port: 7302, type: 'http' }, // avg=108ms min=87ms max=149ms 100% (ERD-HTTP)

  // ⚡ SUB-200ms STABLE (avg 188ms, 100%): always reliable, sub-200ms
  { host: '59.110.63.234', port: 80, type: 'http' },   // avg=188ms min=108ms max=470ms 100%

  // 🎯 SOLID 100% STABLE (avg 450-460ms, 100% 5/5 rounds): improved latency!
  { host: '31.43.179.194',    port: 80, type: 'http' }, // avg=450ms min=446ms 100%
  { host: '141.101.120.214',  port: 80, type: 'http' }, // avg=451ms min=441ms  80%
  { host: '45.131.4.250',     port: 80, type: 'http' }, // avg=454ms min=440ms 100%
  { host: '159.112.235.94',   port: 80, type: 'http' }, // avg=454ms min=442ms 100%
  { host: '141.101.121.226',  port: 80, type: 'http' }, // avg=456ms min=437ms 100%

  // 🎯 SOLID 100% STABLE (avg 650-950ms, 100%): reliable backups (5/5 rounds)
  { host: '103.21.244.132',   port: 80, type: 'http' }, // avg=650ms min=446ms 100%
  { host: '185.162.231.23',   port: 80, type: 'http' }, // avg=655ms min=448ms 100%
  { host: '141.193.213.254',  port: 80, type: 'http' }, // avg=663ms min=448ms 100%
  { host: '172.64.94.22',     port: 80, type: 'http' }, // avg=838ms min=457ms 100%
  { host: '45.12.31.237',     port: 80, type: 'http' }, // avg=952ms min=441ms  80%

  // 🆕 NEW STABLE (avg 434ms, 100%): found in Asia-focused search 2026-08-07 (3/3 rounds)
  { host: '39.109.113.97',    port: 4090, type: 'http' }, // avg=434ms min=334ms 100% (SCDN-ASIA)

  // Stable legacy HTTP proxies (always-on data-center IP ranges)
  { host: '185.170.166.75', port: 80, type: 'http' },
  { host: '185.162.229.141', port: 80, type: 'http' },
  { host: '185.238.228.203', port: 80, type: 'http' },
  { host: '45.131.5.145', port: 80, type: 'http' },
  { host: '147.185.161.0', port: 80, type: 'http' },
  { host: '173.245.49.53', port: 80, type: 'http' },
  { host: '45.131.6.206', port: 80, type: 'http' },
  { host: '141.193.213.123', port: 80, type: 'http' },
  { host: '31.43.179.83', port: 80, type: 'http' },
  { host: '173.245.49.148', port: 80, type: 'http' },
  { host: '45.131.7.99', port: 80, type: 'http' },
  { host: '185.162.231.118', port: 80, type: 'http' },
  { host: '185.238.228.111', port: 80, type: 'http' },
  { host: '45.12.31.83', port: 80, type: 'http' },
  { host: '173.245.49.52', port: 80, type: 'http' },
  { host: '172.67.74.107', port: 80, type: 'http' },
  { host: '172.67.67.147', port: 80, type: 'http' },
  { host: '172.67.181.49', port: 80, type: 'http' },
  { host: '172.67.106.72', port: 80, type: 'http' },
  { host: '172.67.211.192', port: 80, type: 'http' },
  { host: '172.67.174.112', port: 80, type: 'http' },
  { host: '63.141.128.88', port: 80, type: 'http' },
  { host: '185.162.229.219', port: 80, type: 'http' },
  { host: '185.162.229.48', port: 80, type: 'http' },
  { host: '31.43.179.21', port: 80, type: 'http' },
  { host: '66.235.200.115', port: 80, type: 'http' },
  { host: '185.162.231.6', port: 80, type: 'http' },
  { host: '172.67.182.164', port: 80, type: 'http' },
  { host: '172.67.182.64', port: 80, type: 'http' },
  { host: '5.10.247.239', port: 80, type: 'http' },
  // SOCKS5 fallback proxies
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
    logger.error(t('apiError', 'Failed to fetch proxies via proxy-core'));
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
let refreshTimer = setInterval(() => getFreeProxies(), PROXY_CACHE_TTL);
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
        let statusCode = 0;
        const result = await new Promise((resolve, reject) => {
          const req = https.get(testUrl, { agent, timeout, rejectUnauthorized: false }, res => {
            statusCode = res.statusCode;
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        // Only consider alive if HTTP status is 2xx
        if (statusCode < 200 || statusCode >= 300) {
          continue;
        }
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
  const startTime = Date.now();
  logger.info(`AutoFind: Starting to find best proxy among ${proxies.length} candidates`);
  const results = [];
  const batchSize = 20;
  let aliveCount = 0;
  for (let i = 0; i < proxies.length; i += batchSize) {
    const batch = proxies.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(p => testProxy(p)));
    results.push(...batchResults);
    aliveCount += batchResults.filter(r => r.alive).length;
    const tested = Math.min(i + batchSize, proxies.length);
    // Broadcast progress via WebSocket
    const progress = { type: 'test-progress', tested, total: proxies.length, results: batchResults, alive: aliveCount };
    wsClients.forEach(ws => { try { ws.send(JSON.stringify(progress)); } catch {} });
    logger.debug(`AutoFind: ${tested}/${proxies.length} done, alive: ${aliveCount}`);
  }
  stats.recordBatch(results);
  const alive = results.filter(r => r.alive).sort((a, b) => a.latency - b.latency);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`AutoFind: Done. ${alive.length}/${proxies.length} alive in ${elapsedSec}s, best=${alive[0] ? alive[0].latency + 'ms' : 'none'}`);
  return alive;
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
  
  if (pathname === '/api/lang') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (body.lang && i18n.setLang(body.lang)) {
        return sendJSON(res, { lang: i18n.getLang(), translations: i18n.getTranslations(i18n.getLang()) });
      }
      return sendJSON(res, { error: 'invalid language' }, 400);
    }
    const requestedLang = url.searchParams.get('lang');
    if (requestedLang && i18n.SUPPORTED_LANGS.includes(requestedLang)) {
      i18n.setLang(requestedLang);
    }
    return sendJSON(res, { lang: i18n.getLang(), translations: i18n.getTranslations(i18n.getLang()) });
  }

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
      // Update stable-proxies.json with test result so table reflects new latency
      if (result.alive) {
        try {
          const list = loadStableProxies();
          const idx = list.findIndex(p => p.host === body.host && p.port === parseInt(body.port));
          if (idx >= 0) {
            list[idx].latency = result.latency;
            list[idx].ip = result.ip || '';
            list[idx].tests = (list[idx].tests || 0) + 1;
            list[idx].hint = false; // clear hint flag, real latency now
            list[idx].lastTested = Date.now();
            saveStableProxies(list);
            logger.debug(`ProxyTest: Updated ${body.host}:${body.port} latency=${result.latency}ms`);
          }
        } catch {}
      }
      return sendJSON(res, result);
    }
    return sendJSON(res, { error: t('enterHostPort') }, 400);
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
    if (!IS_WIN) return sendJSON(res, { connected: false, error: t('windowsOnly') });
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
    if (!IS_WIN) return sendJSON(res, { success: false, error: t('windowsOnly') });
    const r = WARP.register();
    return sendJSON(res, { success: r && !r.toLowerCase().includes('error'), raw: r });
  }

  if (pathname === '/api/server/start' && req.method === 'POST') {
    const body = await parseBody(req);
    let requestedPort = parseInt(body.port);
    if (!Number.isFinite(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
      return sendJSON(res, { error: t('invalidPort') }, 400);
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
    if (!body.proxy) return sendJSON(res, { error: t('invalidUpstream') }, 400);
    // Parse proxy string like "socks5://host:port", "socks4://host:port", "http://host:port"
    let proxyStr = body.proxy;
    const m = proxyStr.match(/^(?:socks[45]|https?):\/\/(.+):(\d+)$/i);
    if (!m) return sendJSON(res, { error: t('invalidUpstream') }, 400);
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
    const batchSize = body.batchSize || 20;
    const cache = await getFreeProxies(true);
    // Run in background, stream results via WebSocket with proper batching + logging
    (async () => {
      const toTest = cache.proxies.slice(0, maxTest);
      const startTime = Date.now();
      logger.info(`FreeProxyTest: Starting to test ${toTest.length} free proxies (batch: ${batchSize})`);
      const results = [];
      let aliveCount = 0;
      for (let i = 0; i < toTest.length; i += batchSize) {
        const batch = toTest.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(p => testProxy(p, 6000)));
        for (const r of batchResults) {
          if (r.alive) {
            stats.recordTest(r);
            aliveCount++;
          }
          results.push(r);
        }
        const testedSoFar = Math.min(i + batchSize, toTest.length);
        broadcast({ type: 'test-progress', tested: testedSoFar, total: toTest.length, results: batchResults, alive: aliveCount });
        logger.debug(`FreeProxyTest: ${testedSoFar}/${toTest.length} done, alive so far: ${aliveCount}`);
      }
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const alive = results.filter(r => r.alive);
      logger.info(`FreeProxyTest: Done. ${alive.length}/${toTest.length} alive in ${elapsedSec}s, sorted by latency (top: ${alive.slice(0, 5).map(a => a.latency + 'ms').join(', ')})`);
      broadcast({ type: 'test-complete', alive, total: toTest.length });
    })();
    return sendJSON(res, { status: 'started', count: cache.proxies.length });
  }

  // Test all proxies currently in the stable pool (the ones visible in the table)
  if (pathname === '/api/proxy/test-stable' && req.method === 'POST') {
    const list = loadStableProxies();
    const batchSize = 10;
    (async () => {
      const startTime = Date.now();
      logger.info(`StableTest: Starting to test ${list.length} stable proxies`);
      let aliveCount = 0;
      for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(p => testProxy(p, 6000)));
        for (let r of batchResults) {
          if (r.alive) {
            aliveCount++;
            // Update the proxy in the list
            const idx = list.findIndex(p => p.host === r.host && p.port === r.port);
            if (idx >= 0) {
              list[idx].latency = r.latency;
              list[idx].ip = r.ip || '';
              list[idx].tests = (list[idx].tests || 0) + 1;
              list[idx].hint = false;
              list[idx].lastTested = Date.now();
            }
            stats.recordTest(r);
          } else {
            // Mark as dead but keep in list (don't remove, just update)
            const idx = list.findIndex(p => p.host === r.host && p.port === r.port);
            if (idx >= 0) {
              list[idx].tests = (list[idx].tests || 0) + 1;
              list[idx].lastTested = Date.now();
              if (list[idx].latency > 0 && !list[idx].hint) {
                list[idx].latency = -1; // mark as dead
              }
            }
          }
        }
        const testedSoFar = Math.min(i + batchSize, list.length);
        broadcast({ type: 'test-progress', tested: testedSoFar, total: list.length, alive: aliveCount });
        logger.debug(`StableTest: ${testedSoFar}/${list.length} done, alive: ${aliveCount}`);
      }
      saveStableProxies(list);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`StableTest: Done. ${aliveCount}/${list.length} alive in ${elapsedSec}s`);
      broadcast({ type: 'test-complete', alive: list.filter(p => p.latency > 0), total: list.length });
    })();
    return sendJSON(res, { status: 'started', count: list.length });
  }

  // ===== Auto-find stable proxies =====
  // Strategy: fetch proxy list → test a batch → re-test survivors to confirm stability → save low-latency stable ones
  if (pathname === '/api/proxy/auto-find' && req.method === 'POST') {
    if (autoFinding) return sendJSON(res, { error: t('loading') }, 409);
    const body = await parseBody(req);
    const maxTest = body.max || 80;        // initial sample size
    const maxLatency = body.maxLatency || 800; // stability latency threshold (ms)
    const confirmRounds = body.rounds || 1;    // how many rounds a proxy must survive
    (async () => {
      autoFinding = true;
      try {
        broadcast({ type: 'auto-find-stage', stage: 'fetch', message: t('loading') });
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
        broadcast({ type: 'auto-find-stage', stage: 'test', message: t('autoFindStarted', toTest.length), tested: 0, total: toTest.length });

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
          broadcast({ type: 'auto-find-stage', stage: 'confirm', message: t('loading'), tested: 0, total: survivors.length });
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
        broadcast({ type: 'auto-find-complete', error: t('apiError', e.message) });
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
    if (isBuiltin) return sendJSON(res, { error: t('invalidProxyData') }, 400);
    const list = loadStableProxies().filter(p => !(p.host === body.host && parseInt(p.port) === parseInt(body.port)));
    saveStableProxies(list);
    return sendJSON(res, { success: true, count: list.length });
  }

  if (pathname === '/api/proxy/stable/add' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.host || !body.port) return sendJSON(res, { error: t('enterHostPort') }, 400);
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
    const limit = parseInt(url.searchParams.get('limit')) || 200;
    const level = url.searchParams.get('level') || 'all';
    return sendJSON(res, {
      logs: logger.getLogs(limit, level),
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
    if (!body.name || !body.path) return sendJSON(res, { error: t('invalidProxyData') }, 400);
    const apps = loadProxyApps();
    if (apps.find(a => a.name === body.name)) return sendJSON(res, { error: t('appNotFound') }, 409);
    const app = { name: body.name, path: body.path, mode: body.mode || 'http', process: body.process || '', added: Date.now() };
    apps.push(app);
    saveProxyApps(apps);
    return sendJSON(res, { success: true, apps });
  }
  if (pathname === '/api/proxy/apps/edit' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.name || !body.path) return sendJSON(res, { error: t('invalidProxyData') }, 400);
    let apps = loadProxyApps();
    const idx = apps.findIndex(a => a.name === body.oldName || a.name === body.name);
    if (idx < 0) return sendJSON(res, { error: t('appNotFound') }, 404);
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
    if (!IS_WIN) return sendJSON(res, { error: t('windowsOnly') }, 400);
    try {
      const psScript = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Program files (*.exe;*.bat;*.cmd;*.lnk)|*.exe;*.bat;*.cmd;*.lnk|All files (*.*)|*.*'; $f.Title = 'Select Application'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.FileName }";
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const result = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { encoding: 'utf8', timeout: 120000, windowsHide: true });
      const filePath = result.trim();
      if (filePath) return sendJSON(res, { path: filePath });
      return sendJSON(res, { cancelled: true });
    } catch (e) {
      return sendJSON(res, { error: t('fileSelectFailed') }, 500);
    }
  }
  if (pathname === '/api/proxy/apps/launch' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { error: t('windowsOnly') }, 400);
    const body = await parseBody(req);
    const app = loadProxyApps().find(a => a.name === body.name);
    if (!app) return sendJSON(res, { error: t('appNotFound') }, 404);
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
      return sendJSON(res, { success: true, message: killLog + t('appLaunched', app.name) });
    } catch (e) {
      return sendJSON(res, { error: e.message }, 500);
    }
  }
  // Launch an app directly with a specific proxy (no local proxy server needed)
  if (pathname === '/api/proxy/launch-app' && req.method === 'POST') {
    if (!IS_WIN) return sendJSON(res, { error: t('windowsOnly') }, 400);
    const body = await parseBody(req);
    const { host, port, type, appPath, appName, processName } = body;
    if (!host || !port || !appPath) return sendJSON(res, { error: t('invalidProxyData') }, 400);
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
      return sendJSON(res, { success: true, message: killLog + t('appLaunched', appName || 'app'), proxy: proxyUrl, app: appPath });
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
    logger.error('Request error: ' + err.message, { url: pathname });
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
    logger.info(t('serverRunningOn', port));
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
      logger.warn(t('portInUse', port));
      start(port + 1);
    } else {
      logger.error('Server error: ' + err.message);
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
