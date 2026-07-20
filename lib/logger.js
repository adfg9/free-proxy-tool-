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

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateLogs() {
  ensureDir();
  if (!fs.existsSync(LOG_FILE)) return;
  const stats = fs.statSync(LOG_FILE);
  if (stats.size < MAX_LOG_SIZE) return;

  for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
    const oldFile = `${LOG_FILE}.${i}`;
    const newFile = `${LOG_FILE}.${i + 1}`;
    if (fs.existsSync(oldFile)) {
      if (i === MAX_LOG_FILES - 1) {
        fs.unlinkSync(oldFile);
      } else {
        fs.renameSync(oldFile, newFile);
      }
    }
  }
  fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const levelInfo = LEVELS[level];
  let msg = typeof message === 'string' ? message : JSON.stringify(message);
  if (meta) {
    msg += ' ' + JSON.stringify(meta);
  }
  return `${timestamp} ${levelInfo.icon} ${msg}`;
}

function log(level, message, meta) {
  if (LEVELS[level].value < LEVELS[currentLevel].value) return;

  const formatted = formatMessage(level, message, meta);
  const levelInfo = LEVELS[level];

  if (logToConsole) {
    console.log(`${levelInfo.color}${formatted}\x1b[0m`);
  }

  if (logToFile) {
    try {
      rotateLogs();
      ensureDir();
      fs.appendFileSync(LOG_FILE, formatted + '\n', 'utf8');
    } catch (e) {
      // Silently fail if we can't write to log file
    }
  }

  if (listeners.length > 0) {
    const entry = { time: new Date().toISOString(), level, message: typeof message === 'string' ? message : JSON.stringify(message), meta };
    listeners.forEach(cb => {
      try { cb(entry); } catch {}
    });
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

  getLogs: (limit = 100) => {
    ensureDir();
    if (!fs.existsSync(LOG_FILE)) return [];
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      return lines.slice(-limit);
    } catch {
      return [];
    }
  },

  clearLogs: () => {
    ensureDir();
    try {
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
};

module.exports = logger;
