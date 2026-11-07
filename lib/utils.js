const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function runCmd(cmd, timeout = 8000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, windowsHide: true }).trim();
  } catch {
    return null;
  }
}

const HTTP_MAX_REDIRECTS = 5;
const HTTP_MAX_BYTES = 16 * 1024 * 1024; // guard against unexpectedly huge downloads

function httpGet(url, timeout = 8000, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    let settled = false;
    const ok = (v) => { if (settled) return; settled = true; resolve(v); };
    const fail = (e) => { if (settled) return; settled = true; reject(e); };
    const req = client.get(url, { timeout, rejectUnauthorized: false, headers: { 'Accept-Encoding': 'identity' } }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain so the socket is released instead of idling until timeout
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects >= HTTP_MAX_REDIRECTS) {
            fail(new Error('too many redirects'));
            return;
          }
          let redirectUrl;
          try { redirectUrl = new URL(res.headers.location, url).href; } catch { fail(new Error('bad redirect')); return; }
          settled = true; // hand this promise over to the redirected request
          httpGet(redirectUrl, timeout, redirects + 1).then(resolve, reject);
          return;
        }
        fail(new Error('HTTP ' + res.statusCode));
        return;
      }
      let data = '';
      let truncated = false;
      res.on('data', c => {
        if (truncated) return;
        data += c;
        if (data.length >= HTTP_MAX_BYTES) {
          truncated = true;
          data = data.slice(0, HTTP_MAX_BYTES);
          req.destroy();
        }
      });
      res.on('end', () => ok(data));
      res.on('aborted', () => ok(data));
      res.on('error', () => ok(data));
    });
    req.on('error', e => fail(e));
    req.on('timeout', () => { req.destroy(); fail(new Error('timeout')); });
  });
}

// Run `worker` over `items` with at most `concurrency` in flight, without the
// start-to-start barrier a "slice into batches + Promise.all" loop has: a single
// slow item no longer stalls everything behind it.
// onResult(result, index) is invoked as each item finishes.
// stopWhen() is polled before pulling the next item — return true to drain early.
async function mapPool(items, concurrency, worker, onResult, stopWhen) {
  const results = new Array(items.length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency || 1, items.length || 1));
  async function run() {
    for (;;) {
      if (stopWhen && stopWhen()) return;
      const i = next++;
      if (i >= items.length) return;
      const r = await worker(items[i], i);
      results[i] = r;
      if (onResult) onResult(r, i);
    }
  }
  const workers = [];
  for (let w = 0; w < limit; w++) workers.push(run());
  await Promise.all(workers);
  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// config.json is read by getMergedConfig() on every proxy test (thousands of times
// during a scan), so cache the parsed file and invalidate on mtime instead of
// re-reading + re-parsing it each call. Callers still get a fresh object.
let rawConfigCache = { mtimeMs: null, data: null };

function loadConfig() {
  ensureConfigDir();
  const file = path.join(CONFIG_DIR, 'config.json');
  let mtimeMs = null;
  try { mtimeMs = fs.statSync(file).mtimeMs; } catch { mtimeMs = null; }
  if (rawConfigCache.data && rawConfigCache.mtimeMs === mtimeMs) return { ...rawConfigCache.data };
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  rawConfigCache = { mtimeMs, data };
  return { ...data };
}

function saveConfig(cfg) {
  try {
    ensureConfigDir();
    fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(cfg, null, 2));
    rawConfigCache = { mtimeMs: null, data: null }; // invalidate immediately
  } catch {}
}

function getDefaultConfig() {
  return {
    defaultMode: 'auto',
    defaultPort: 1080,
    guiPort: 3000,
    autoStartWarp: true,
    logLevel: 'info',
    logToFile: true,
    proxyTestCount: 50,
    proxyTestBatchSize: 20,
    proxyTestTimeout: 3000,
    proxyCacheTTL: 300000,
  };
}

function getMergedConfig() {
  return { ...getDefaultConfig(), ...loadConfig() };
}

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, host);
  });
}

function getPortStatus(port) {
  return new Promise(resolve => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, inUse: true });
    });
    socket.on('error', () => resolve({ port, inUse: false }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, inUse: false });
    });
    socket.connect(port, '127.0.0.1');
  });
}

module.exports = {
  CONFIG_DIR,
  ensureConfigDir,
  runCmd,
  httpGet,
  sleep,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  getMergedConfig,
  shuffleArray,
  mapPool,
  formatBytes,
  isPortAvailable,
  getPortStatus,
};
