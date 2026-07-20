const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCmd, sleep, httpGet, CONFIG_DIR, ensureConfigDir } = require('./utils');
const logger = require('./logger');

const WARP_WIN_PATH = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe';

function getWarpCmd() {
  if (os.platform() === 'win32' && fs.existsSync(WARP_WIN_PATH)) {
    return `"${WARP_WIN_PATH}"`;
  }
  return 'warp-cli';
}

function warpCmd(args, timeout = 8000) {
  return runCmd(`${getWarpCmd()} ${args}`, timeout);
}

const Warp = {
  installed() {
    if (os.platform() === 'win32') {
      if (fs.existsSync(WARP_WIN_PATH)) return true;
      const svc = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-svc.exe';
      if (fs.existsSync(svc)) return true;
    }
    const r = runCmd('warp-cli --version');
    return r && r.includes('warp');
  },

  status() {
    const r = warpCmd('status');
    if (!r) return null;
    return {
      connected: r.includes('Connected'),
      raw: r
    };
  },

  register() {
    logger.info('WARP: Registering...');
    const r = warpCmd('registration new', 15000);
    if (r && !r.toLowerCase().includes('error')) {
      logger.info('WARP: Registration successful');
      return { success: true, raw: r };
    }
    logger.warn('WARP: Registration failed - ' + (r || 'Unknown error'));
    return { success: false, raw: r || 'Unknown error' };
  },

  async connect() {
    logger.info('WARP: Connecting...');
    warpCmd('connect', 10000);
    await sleep(2000);
    const s = Warp.status();
    if (s && s.connected) {
      logger.info('WARP: Connected');
      return true;
    }
    logger.warn('WARP: Connecting, please check status later');
    return false;
  },

  disconnect() {
    warpCmd('disconnect');
    logger.info('WARP: Disconnected');
    return true;
  },

  async install() {
    logger.info('WARP: Installing Cloudflare WARP...');
    const url = os.platform() === 'win32'
      ? 'https://downloads.cloudflareclient.com/v1/download/windows/ga'
      : null;

    if (!url) {
      logger.warn('WARP: Please install manually from https://1.1.1.1/');
      return false;
    }

    const msi = path.join(CONFIG_DIR, 'warp.msi');
    ensureConfigDir();
    logger.info('WARP: Downloading installer (~50MB)...');

    try {
      const data = await httpGet(url, 180000);
      fs.writeFileSync(msi, data);

      if (fs.existsSync(msi)) {
        const size = fs.statSync(msi).size;
        if (size < 1000000) {
          logger.error('WARP: Downloaded file is too small, download may have failed');
          return false;
        }
        logger.info('WARP: Installing (may require administrator privileges)...');
        runCmd(`msiexec /i "${msi}" /quiet /norestart`, 120000);
        logger.info('WARP: Installation complete');
        return true;
      }
    } catch (e) {
      logger.error('WARP: Installation failed - ' + e.message);
    }

    logger.warn('WARP: Please download and install manually from https://1.1.1.1/');
    return false;
  },

  getMode() {
    const r = warpCmd('mode');
    return r ? r.trim() : null;
  },

  setMode(mode) {
    return warpCmd(`mode ${mode}`);
  },

  getAccount() {
    const r = warpCmd('registration show');
    return r ? r.trim() : null;
  },
};

module.exports = Warp;
