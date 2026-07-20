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

function httpGet(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout, rejectUnauthorized: false, headers: { 'Accept-Encoding': 'identity' } }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          httpGet(redirectUrl, timeout).then(resolve).catch(reject);
          return;
        }
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadConfig() {
  ensureConfigDir();
  try {
    return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  try {
    ensureConfigDir();
    fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(cfg, null, 2));
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
  formatBytes,
  isPortAvailable,
  getPortStatus,
};
