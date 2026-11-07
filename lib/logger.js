const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
const LOG_DIR = path.join(CONFIG_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;

const LEVELS = {
  debug: { value: 0, color: '\x1b[90m', icon: '[DEBUG]' },
  info: { value: 1, color: '\x1b[36m', icon: '[INFO]' },
  warn: { value: 2, color: '\x1b[33m', icon: '[WARN]' },
  error: { value: 3, color: '\x1b[31m', icon: '[ERROR]' },
};

let currentLevel = 'info';
let logToFile = true;
let logToConsole = true;
const listeners = [];

let dirEnsured = false;
let lastRotateCheck = 0;
const ROTATE_CHECK_INTERVAL = 60000; // check file size max once per minute

function ensureDir() {
  if (dirEnsured) return;
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  dirEnsured = true;
}

function rotateLogs() {
  const now = Date.now();
  if (now - lastRotateCheck < ROTATE_CHECK_INTERVAL) return;
  lastRotateCheck = now;
  ensureDir();
  if (!fs.existsSync(LOG_FILE)) return;
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size < MAX_LOG_SIZE) return;
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = `${LOG_FILE}.${i}`;
      const newFile = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        if (i === MAX_LOG_FILES - 1) fs.unlinkSync(oldFile);
        else fs.renameSync(oldFile, newFile);
      }
    }
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {}
}

function formatPayload(x) {
  if (x == null) return '';
  if (x instanceof Error) {
    const parts = [x.message];
    if (x.code) parts.push(`[${x.code}]`);
    if (x.stack && currentLevel === 'debug') parts.push('\n' + x.stack);
    return parts.join(' ');
  }
  if (typeof x === 'string') return x;
  if (typeof x === 'object') {
    try { return JSON.stringify(x); } catch { return String(x); }
  }
  return String(x);
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const levelInfo = LEVELS[level];
  const msg = formatPayload(message);
  const metaStr = meta ? (' ' + formatPayload(meta)) : '';
  return `${timestamp} ${levelInfo.icon} ${msg}${metaStr}`;
}

// Buffered file writes.
// log() used to call fs.appendFileSync for every single line. During a proxy scan
// (thousands of debug lines) that is thousands of blocking write syscalls on the
// event loop, which stalls the WebSocket progress stream the panel is reading.
// Writes are now batched and flushed on a short timer, with a hard flush on exit.
let writeBuffer = [];
let flushTimer = null;
let fileBroken = false;

function flushLogs() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!writeBuffer.length) return;
  const chunk = writeBuffer.join('\n') + '\n';
  writeBuffer = [];
  try {
    ensureDir();
    fs.appendFileSync(LOG_FILE, chunk, 'utf8');
  } catch {
    fileBroken = true; // stop retrying on every log line if the disk says no
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushLogs, 500);
  if (flushTimer.unref) flushTimer.unref();
}

process.on('exit', () => { try { flushLogs(); } catch {} });

function log(level, message, meta) {
  if (LEVELS[level].value < LEVELS[currentLevel].value) return;

  const formatted = formatMessage(level, message, meta);
  const levelInfo = LEVELS[level];

  if (logToConsole) {
    console.log(`${levelInfo.color}${formatted}\x1b[0m`);
  }

  if (logToFile && !fileBroken) {
    rotateLogs();
    writeBuffer.push(formatted);
    // Bound memory if the process logs far faster than the flush timer.
    if (writeBuffer.length >= 500) flushLogs(); else scheduleFlush();
  }

  if (listeners.length > 0) {
    const entry = { time: new Date().toISOString(), level, message: formatPayload(message), meta };
    listeners.forEach(cb => { try { cb(entry); } catch {} });
  }
}

const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),

  setLevel: (level) => {
    if (LEVELS[level]) currentLevel = level;
  },

  setLogToFile: (enabled) => { logToFile = enabled; },
  setLogToConsole: (enabled) => { logToConsole = enabled; },

  getLogDir: () => LOG_DIR,
  getLogFile: () => LOG_FILE,

  getLogs: (limit = 100, levelFilter = null) => {
    ensureDir();
    flushLogs(); // buffered lines must be visible to the panel immediately
    if (!fs.existsSync(LOG_FILE)) return [];
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const parsed = lines.map(line => {
        // Format: "2026-08-07T04:28:46.404Z [INFO] message"
        const m = line.match(/^(\S+)\s+\[(\w+)\]\s?(.*)$/);
        if (m) {
          return { time: m[1], level: m[2].toLowerCase(), message: m[3] };
        }
        return { time: '', level: 'info', message: line };
      });
      const filtered = levelFilter && levelFilter !== 'all'
        ? parsed.filter(l => l.level === levelFilter || l.level === levelFilter.replace('warning', 'warn'))
        : parsed;
      return filtered.slice(-limit);
    } catch {
      return [];
    }
  },

  clearLogs: () => {
    ensureDir();
    try {
      writeBuffer = []; // drop pending lines, otherwise the next flush re-creates the file
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      fs.writeFileSync(LOG_FILE, '');
      return true;
    } catch {
      return false;
    }
  },

  getLogStats: () => {
    ensureDir();
    const stats = { totalSize: 0, fileCount: 0 };
    try {
      if (fs.existsSync(LOG_FILE)) {
        stats.totalSize += fs.statSync(LOG_FILE).size;
        stats.fileCount++;
      }
      for (let i = 1; i <= MAX_LOG_FILES; i++) {
        const f = `${LOG_FILE}.${i}`;
        if (fs.existsSync(f)) {
          stats.totalSize += fs.statSync(f).size;
          stats.fileCount++;
        }
      }
    } catch {}
    return stats;
  },

  onLog: (callback) => {
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx > -1) listeners.splice(idx, 1);
    };
  },

  flush: flushLogs,
};

module.exports = logger;
