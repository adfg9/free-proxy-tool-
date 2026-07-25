#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const stats = require('./lib/stats');
const asciiChart = require('./lib/ascii-chart');
const htmlReport = require('./lib/html-report');
const logger = require('./lib/logger');
const Warp = require('./lib/warp');
const proxyCore = require('./lib/proxy-core');
const ProxyServer = require('./lib/proxy-server');
const utils = require('./lib/utils');

const { loadConfig, saveConfig, getMergedConfig, getDefaultConfig, formatBytes, getPortStatus } = utils;

function log(type, msg) {
  const colors = { ok: '\x1b[32m', err: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', dim: '\x1b[90m' };
  const icons = { ok: '[✓]', err: '[✗]', warn: '[!]', info: '[*]', dim: '[-]' };
  console.log(`${colors[type] || ''}${icons[type] || ' '} ${msg}\x1b[0m`);
}

function banner() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║     Free Proxy Tool v2.1              ║');
  console.log('  ║     Free Internet Access Tool            ║');
  console.log('  ║     WARP + Free Proxy + Auto Switch   ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
}

const args = process.argv.slice(2);
const cmd = args[0] || '';
const arg1 = args[1] || '';

async function main() {
  banner();

  switch (cmd) {

    case 'warp': {
      if (!Warp.installed()) {
        log('warn', 'Cloudflare WARP not installed');
        log('info', 'Attempting automatic installation...');
        if (await Warp.install()) {
          log('info', 'Please restart terminal and run: node index.js warp --connect');
        } else {
          log('info', 'Please install manually: https://1.1.1.1/');
          log('info', 'After installation, run: node index.js warp --connect');
        }
        break;
      }

      if (arg1 === '--register' || arg1 === '-r') {
        Warp.register();
      } else if (arg1 === '--connect' || arg1 === '-c') {
        await Warp.connect();
        const s = Warp.status();
        if (s && s.connected) log('ok', 'WARP connected! Traffic encrypted via Cloudflare');
        else log('warn', 'Connecting... please wait a few seconds and run: node index.js warp --status');
      } else if (arg1 === '--disconnect' || arg1 === '-d') {
        Warp.disconnect();
      } else if (arg1 === '--status' || arg1 === '-s') {
        const s = Warp.status();
        if (s) {
          log(s.connected ? 'ok' : 'warn', s.connected ? 'WARP connected' : 'WARP disconnected');
          console.log('  ' + s.raw);
        } else {
          log('warn', 'Unable to get status, you may need to register first: node index.js warp --register');
        }
      } else if (arg1 === '--mode') {
        const mode = args[2];
        if (mode) {
          const r = Warp.setMode(mode);
          log(r ? 'ok' : 'warn', r ? `Mode set to: ${mode}` : 'Setting failed');
        } else {
          const m = Warp.getMode();
          log('info', `Current mode: ${m || 'unknown'}`);
        }
      } else {
        const s = Warp.status();
        if (s) log(s.connected ? 'ok' : 'warn', s.connected ? 'WARP connected' : 'WARP disconnected');
        else log('warn', 'WARP not installed or not registered');

        console.log('');
        console.log('  Usage:');
        console.log('    node index.js warp --register   First-time registration');
        console.log('    node index.js warp --connect    Connect WARP');
        console.log('    node index.js warp --disconnect Disconnect');
        console.log('    node index.js warp --status     View status');
        console.log('    node index.js warp --mode [m]   View/set mode');
      }
      break;
    }

    case 'proxy': {
      if (arg1 === '--fetch' || arg1 === '-f') {
        const proxies = await proxyCore.getProxies(true);
        const { counts, typeCounts } = proxyCore.getSourceBreakdown(proxies);
        log('ok', `Total ${proxies.length} proxies`);
        console.log('');
        console.log('  Type distribution:');
        for (const [t, c] of Object.entries(typeCounts)) {
          console.log(`    ${t}: ${c}`);
        }
        console.log('');
        console.log('  Source distribution (top 10):');
        const topSources = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [s, c] of topSources) {
          console.log(`    ${s}: ${c}`);
        }
      } else if (arg1 === '--test' || arg1 === '-t') {
        const target = args[2];
        if (target && target.includes(':')) {
          const [h, p] = target.split(':');
          const type = args[3] || 'socks5';
          log('info', `Testing ${h}:${p} (${type})...`);
          const r = await proxyCore.testProxy({ host: h, port: parseInt(p), type });
          stats.recordTest(r);
          if (r.alive) {
            const score = proxyCore.scoreProxy(r);
            log('ok', `Alive! Latency: ${r.latency}ms, IP: ${r.ip}, Score: ${score}`);
          } else {
            log('err', 'Not available');
          }
        } else {
          const count = parseInt(target) || 30;
          log('info', `Testing ${count} proxies...`);
          let lastTested = 0;
          const alive = await proxyCore.findBestProxy(count, {
            force: true,
            onProgress: ({ tested, total, aliveCount }) => {
              if (tested !== lastTested) {
                process.stdout.write(`\r  [*] Tested ${tested}/${total}  Alive: ${aliveCount}`);
                lastTested = tested;
              }
            }
          });
          console.log('');
          if (alive.length > 0) {
            console.log('');
            console.log('  ─────────── ALIVE PROXIES TOP 10 ───────────');
            alive.slice(0, 10).forEach((p, i) => {
              const score = proxyCore.scoreProxy(p);
              console.log(`  ${String(i + 1).padStart(2)}. ${p.host}:${p.port}  Latency: ${String(p.latency).padStart(4)}ms  Score: ${String(score).padStart(5)}  IP: ${p.ip}`);
            });
            console.log('  ────────────────────────────────────────────');
            log('ok', `Total ${alive.length} alive proxies`);
          } else {
            log('err', 'No alive proxies found');
            console.log('');
            console.log('  ─── Possible causes and solutions ───');
            console.log('  1. Network connection issue - check your network');
            console.log('  2. Free proxy sources temporarily unavailable - try again later');
            console.log('  3. Free proxy quality is unstable - this is normal');
            console.log('');
            console.log('  Recommended solution (strongly advised):');
            console.log('    Install Cloudflare WARP (free and stable):');
            console.log('    1. Visit https://1.1.1.1/ to download and install');
            console.log('    2. Run: node index.js warp --register');
            console.log('    3. Run: node index.js warp --connect');
            console.log('    4. Then run: node index.js start');
            console.log('');
            console.log('  Other options:');
            console.log('    - Increase test count: node index.js proxy --test 100');
            console.log('    - Use a specific proxy: node index.js start --proxy IP:port');
            console.log('    - View statistics: node index.js stats');
            console.log('');
          }
        }
      } else if (arg1 === '--speed' || arg1 === '-s') {
        const proxyStr = args[2];
        if (proxyStr && proxyStr.includes(':')) {
          const [h, p] = proxyStr.split(':');
          const type = args[3] || 'socks5';
          log('info', `Speed testing ${h}:${p}...`);
          const result = await speedTest({ host: h, port: parseInt(p), type });
          if (result.success) {
            log('ok', `Speed: ${result.speed}  (${formatBytes(result.bytes)}/${result.time}s)`);
          } else {
            log('err', 'Speed test failed: ' + result.error);
          }
        } else {
          log('warn', 'Usage: node index.js proxy --speed IP:port [type]');
        }
      } else if (arg1 === '--clear-cache' || arg1 === '-cc') {
        proxyCore.clearCache();
        log('ok', 'Proxy cache cleared');
      } else {
        console.log('  Usage:');
        console.log('    node index.js proxy --fetch             Fetch proxy list');
        console.log('    node index.js proxy --test [N]          Test N proxies (default 30)');
        console.log('    node index.js proxy --test ip:port [t]  Test a specific proxy');
        console.log('    node index.js proxy --speed ip:port [t] Speed test');
        console.log('    node index.js proxy --clear-cache       Clear cache');
      }
      break;
    }

    case 'start': {
      let port = 1080;
      let mode = 'auto';
      let upstreamProxy = null;
      let autoSwitch = false;
      let healthCheck = false;

      const cfg = getMergedConfig();
      port = cfg.defaultPort || 1080;
      mode = cfg.defaultMode || 'auto';

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '-p' || args[i] === '--port') port = parseInt(args[++i]) || port;
        if (args[i] === '-m' || args[i] === '--mode') mode = args[++i] || mode;
        if (args[i] === '--proxy') {
          const [h, p] = (args[++i] || '').split(':');
          upstreamProxy = { host: h, port: parseInt(p), type: 'socks5' };
        }
        if (args[i] === '--auto-switch') autoSwitch = true;
        if (args[i] === '--health-check') healthCheck = true;
      }

      log('info', `Mode: ${mode}  Port: ${port}`);
      if (autoSwitch) log('info', 'Auto switch: enabled');
      if (healthCheck) log('info', 'Health check: enabled');

      if (upstreamProxy) {
        log('info', `Upstream proxy: ${upstreamProxy.host}:${upstreamProxy.port}`);
      } else if (mode === 'warp' || (mode === 'auto' && Warp.installed())) {
        if (Warp.installed()) {
          const s = Warp.status();
          if (!s || !s.connected) {
            log('warn', 'WARP not connected, connecting...');
            await Warp.connect();
          }
          log('ok', 'Using WARP mode (Cloudflare encrypted)');
          upstreamProxy = null;
        }
      } else {
        log('info', 'Finding available proxies...');
        let lastTested = 0;
        const alive = await proxyCore.findBestProxy(cfg.proxyTestCount || 30, {
          onProgress: ({ tested, total, aliveCount }) => {
            if (tested !== lastTested) {
              process.stdout.write(`\r  [*] Tested ${tested}/${total}  Alive: ${aliveCount}`);
              lastTested = tested;
            }
          }
        });
        console.log('');
        if (alive.length > 0) {
          upstreamProxy = alive[0];
          const score = proxyCore.scoreProxy(upstreamProxy);
          log('ok', `Using proxy: ${upstreamProxy.host}:${upstreamProxy.port} (Latency: ${upstreamProxy.latency}ms, Score: ${score})`);
        } else {
          log('err', 'No alive proxies found');
          console.log('');
          console.log('  ─── Possible causes and solutions ───');
          console.log('  1. Network connection issue - check your network');
          console.log('  2. Free proxy sources temporarily unavailable - try again later');
          console.log('  3. Free proxy quality is unstable - this is normal');
          console.log('');
          console.log('  Recommended solution (strongly advised):');
          console.log('    Install Cloudflare WARP (free and stable):');
          console.log('    1. Visit https://1.1.1.1/ to download and install');
          console.log('    2. Run: node index.js warp --register');
          console.log('    3. Run: node index.js warp --connect');
          console.log('    4. Then run: node index.js start');
          console.log('');
          console.log('  Other options:');
          console.log('    - Increase test count: node index.js config set proxyTestCount 100');
          console.log('    - Use a specific proxy: node index.js start --proxy IP:port');
          console.log('    - View statistics: node index.js stats');
          console.log('');
          break;
        }
      }

      const server = new ProxyServer(port, upstreamProxy);
      const ok = await server.start();
      if (!ok) break;

      let healthCheckTimer = null;
      let autoSwitchTimer = null;
      let currentProxyList = [];
      let currentProxyIndex = 0;

      if (mode === 'proxy' && upstreamProxy) {
        currentProxyList = [upstreamProxy];
      }

      if ((autoSwitch || healthCheck) && mode === 'proxy' && upstreamProxy) {
        log('info', 'Fetching more proxies for auto-switch...');
        const moreProxies = await proxyCore.findBestProxy(50);
        if (moreProxies.length > 0) {
          currentProxyList = moreProxies;
          currentProxyIndex = 0;
          log('info', `Loaded ${currentProxyList.length} proxies for auto-switch`);
        }
      }

      if (healthCheck && mode === 'proxy' && currentProxyList.length > 0) {
        healthCheckTimer = setInterval(async () => {
          if (server.upstream) {
            const r = await proxyCore.testProxy(server.upstream, 3000);
            if (!r.alive) {
              logger.warn('Health check failed: current proxy unavailable');
              if (autoSwitch && currentProxyList.length > 1) {
                switchToNextProxy();
              }
            } else {
              logger.debug(`Health check passed: latency ${r.latency}ms`);
            }
          }
        }, 30000);
      }

      function switchToNextProxy() {
        if (currentProxyList.length <= 1) return false;
        currentProxyIndex = (currentProxyIndex + 1) % currentProxyList.length;
        const next = currentProxyList[currentProxyIndex];
        server.upstream = next;
        const score = proxyCore.scoreProxy(next);
        log('warn', `Auto-switched to: ${next.host}:${next.port} (Latency: ${next.latency}ms, Score: ${score})`);
        logger.info(`Auto-switch proxy: ${next.host}:${next.port}`);
        return true;
      }

      console.log('');
      log('ok', 'Proxy server started!');
      console.log('');
      console.log('  ╔════════════════════════════════════════════╗');
      console.log('  ║  Configuration:                           ║');
      console.log('  ║                                          ║');
      console.log('  ║  1. Browser proxy settings:              ║');
      console.log('  ║     Address: 127.0.0.1                    ║');
      console.log(`  ║     Port: ${String(port).padEnd(4)}                               ║`);
      console.log('  ║                                          ║');
      console.log('  ║  2. System environment variables (CLI):   ║');
      if (os.platform() === 'win32') {
        console.log(`  ║     set HTTP_PROXY=http://127.0.0.1:${String(port).padEnd(4)}  ║`);
        console.log(`  ║     set HTTPS_PROXY=http://127.0.0.1:${String(port).padEnd(4)} ║`);
      } else {
        console.log(`  ║     export HTTP_PROXY=http://127.0.0.1:${String(port).padEnd(4)}  ║`);
        console.log(`  ║     export HTTPS_PROXY=http://127.0.0.1:${String(port).padEnd(4)} ║`);
      }
      console.log('  ║                                          ║');
      console.log('  ║  3. Press Ctrl+C to stop                 ║');
      console.log('  ╚════════════════════════════════════════════╝');

      process.on('SIGINT', () => {
        log('info', 'Stopping...');
        if (healthCheckTimer) clearInterval(healthCheckTimer);
        if (autoSwitchTimer) clearInterval(autoSwitchTimer);
        server.stop();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        if (healthCheckTimer) clearInterval(healthCheckTimer);
        if (autoSwitchTimer) clearInterval(autoSwitchTimer);
        server.stop();
        process.exit(0);
      });
      break;
    }

    case 'status': {
      console.log('');
      console.log('  ─── System Status ───');

      if (Warp.installed()) {
        const s = Warp.status();
        log(s && s.connected ? 'ok' : 'warn', `WARP: ${s && s.connected ? 'connected' : 'disconnected'}`);
      } else {
        log('warn', 'WARP: not installed (recommended: https://1.1.1.1/)');
      }

      const s = stats.getStats();
      log('info', `Stats: ${s.totalTests} tests, success rate ${s.successRate}%, avg latency ${s.avgLatency}ms`);

      const logStats = logger.getLogStats();
      log('info', `Logs: ${logStats.fileCount} files, ${formatBytes(logStats.totalSize)}`);

      const cfg = loadConfig();
      const cfgCount = Object.keys(cfg).length;
      log('info', `Config: ${cfgCount} custom setting(s)`);

      const defaultPort = getMergedConfig().defaultPort || 1080;
      const ps = await getPortStatus(defaultPort);
      log(ps.inUse ? 'ok' : 'warn', `Proxy port ${defaultPort}: ${ps.inUse ? 'in use (may be running)' : 'not in use'}`);

      const guiPort = getMergedConfig().guiPort || 3000;
      const gs = await getPortStatus(guiPort);
      log(gs.inUse ? 'ok' : 'info', `Web UI port ${guiPort}: ${gs.inUse ? 'running' : 'not running'}`);

      console.log('');
      console.log('  Quick actions:');
      console.log('    node index.js start    Start proxy');
      console.log('    node index.js gui      Start web UI');
      console.log('    node index.js help     View help');
      console.log('');
      break;
    }

    case 'stats': {
      const subCmd = arg1;

      if (subCmd === '--html' || subCmd === '-h') {
        log('info', 'Generating HTML stats report...');
        const filePath = htmlReport.generateReport();
        log('ok', `Report generated: ${filePath}`);
      } else if (subCmd === '--charts' || subCmd === '-c') {
        asciiChart.printAllCharts();
      } else if (subCmd === '--clear') {
        stats.clearHistory();
        log('ok', 'History data cleared');
      } else if (subCmd === '--latency' || subCmd === '-l') {
        asciiChart.printLatencyTrend();
      } else if (subCmd === '--daily' || subCmd === '-d') {
        asciiChart.printDailyTrend();
      } else if (subCmd === '--top' || subCmd === '-t') {
        asciiChart.printTopProxiesBar();
      } else {
        const s = stats.getStats();
        console.log('');
        console.log('  ─── Stats Overview ───');
        console.log(`  Total tests: ${s.totalTests}    Success rate: ${s.successRate}%`);
        console.log(`  Avg latency: ${s.avgLatency}ms    Min: ${s.minLatency}ms    Max: ${s.maxLatency}ms`);
        if (s.totalTests === 0) {
          console.log('  No test data yet, please run: node index.js proxy --test');
        } else {
          asciiChart.printAllCharts();
        }
        console.log('');
        console.log('  Usage:');
        console.log('    node index.js stats              Display ASCII stats charts');
        console.log('    node index.js stats --html       Generate HTML report (open in browser)');
        console.log('    node index.js stats --charts     Show all ASCII charts');
        console.log('    node index.js stats --latency    Show latency trend');
        console.log('    node index.js stats --daily      Show daily trend');
        console.log('    node index.js stats --top        Show top proxy ranking');
        console.log('    node index.js stats --clear      Clear history data');
      }
      break;
    }

    case 'gui': {
      const port = parseInt(arg1) || getMergedConfig().guiPort || 1002;
      log('info', `Starting Web UI... Port: ${port}`);
      const guiServer = require('./gui/server');
      guiServer.start(port);
      const shutdown = () => {
        log('info', 'Stopping...');
        try { guiServer.stop(); } catch {}
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      return;
    }

    case 'tui': {
      const tuiPath = path.join(__dirname, 'tui', 'index.js');
      const tui = spawn(process.execPath, [tuiPath], { stdio: 'inherit', cwd: __dirname });
      const fwd = (sig) => { try { tui.kill(sig); } catch {} };
      process.on('SIGINT', () => fwd('SIGINT'));
      process.on('SIGTERM', () => fwd('SIGTERM'));
      tui.on('close', (code) => process.exit(code || 0));
      return;
    }

    case 'desktop': {
      log('info', 'Starting desktop app...');
      const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
      const mainPath = path.join(__dirname, 'electron', 'main.js');
      const electron = spawn(electronPath === 'electron' ? 'electron' : `"${electronPath}"`, [mainPath], {
        stdio: 'inherit', shell: true, cwd: __dirname
      });
      const fwd = (sig) => { try { electron.kill(sig); } catch {} };
      process.on('SIGINT', () => fwd('SIGINT'));
      process.on('SIGTERM', () => fwd('SIGTERM'));
      electron.on('close', (code) => process.exit(code || 0));
      return;
    }

    case 'browser': {
      log('info', 'Starting dedicated browser...');
      const browserLauncher = path.join(__dirname, 'browser', 'electron-browser.js');
      const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
      const browser = spawn(electronPath === 'electron' ? 'electron' : `"${electronPath}"`, [browserLauncher], {
        stdio: 'inherit', shell: true, cwd: __dirname
      });
      const fwd = (sig) => { try { browser.kill(sig); } catch {} };
      process.on('SIGINT', () => fwd('SIGINT'));
      process.on('SIGTERM', () => fwd('SIGTERM'));
      browser.on('close', (code) => process.exit(code || 0));
      return;
    }

    case 'log':
    case 'logs': {
      const subCmd = arg1;
      if (subCmd === '--clear' || subCmd === '-c') {
        logger.clearLogs();
        log('ok', 'Logs cleared');
      } else if (subCmd === '--dir' || subCmd === '-d') {
        log('info', `Log directory: ${logger.getLogDir()}`);
      } else if (subCmd === '--stats' || subCmd === '-s') {
        const s = logger.getLogStats();
        log('info', `Log files: ${s.fileCount}  Total size: ${formatBytes(s.totalSize)}`);
      } else if (subCmd === '--follow' || subCmd === '-f') {
        log('info', 'Real-time logs (press Ctrl+C to exit)...');
        console.log('');
        logger.onLog((entry) => {
          console.log(`  ${entry.time} [${entry.level.toUpperCase()}] ${entry.message}`);
        });
        setInterval(() => {}, 1000);
      } else {
        const limit = parseInt(subCmd) || 50;
        const logs = logger.getLogs(limit);
        console.log('');
        if (logs.length === 0) {
          log('warn', 'No logs yet');
        } else {
          console.log(`  ─── Latest ${logs.length} logs ───`);
          logs.forEach(line => console.log(`  ${line}`));
        }
        console.log('');
        console.log('  Usage:');
        console.log('    node index.js log [N]           View latest N logs (default 50)');
        console.log('    node index.js log --follow      Follow logs in real-time');
        console.log('    node index.js log --clear       Clear logs');
        console.log('    node index.js log --dir         Show log directory');
        console.log('    node index.js log --stats       Show log statistics');
      }
      break;
    }

    case 'config': {
      const subCmd = arg1;
      const cfg = loadConfig();

      if (subCmd === '--list' || subCmd === '-l' || !subCmd) {
        console.log('');
        console.log('  ─── Current Config ───');
        const defaults = getDefaultConfig();
        const merged = { ...defaults, ...cfg };
        for (const [key, value] of Object.entries(merged)) {
          const isCustom = cfg[key] !== undefined;
          const displayVal = typeof value === 'boolean' ? (value ? 'yes' : 'no') : value;
          const mark = isCustom ? '*' : ' ';
          console.log(`  ${mark} ${key.padEnd(22)} = ${displayVal}`);
        }
        console.log('');
        console.log('  * = custom setting');
        console.log('');
        console.log('  Usage:');
        console.log('    node index.js config --list              View config');
        console.log('    node index.js config set <key> <value>   Set config');
        console.log('    node index.js config get <key>           Get config');
        console.log('    node index.js config --reset             Reset config');
        console.log('');
      } else if (subCmd === 'set') {
        const key = args[2];
        const val = args[3];
        if (!key) {
          log('err', 'Please specify a config key');
          break;
        }
        let parsedVal = val;
        if (val === 'true') parsedVal = true;
        else if (val === 'false') parsedVal = false;
        else if (!isNaN(val) && val !== '') parsedVal = parseInt(val);

        cfg[key] = parsedVal;
        saveConfig(cfg);
        log('ok', `Set ${key} = ${parsedVal}`);

        if (key === 'logLevel' && typeof parsedVal === 'string') {
          logger.setLevel(parsedVal);
        }
      } else if (subCmd === 'get') {
        const key = args[2];
        if (!key) {
          log('err', 'Please specify a config key');
          break;
        }
        const merged = getMergedConfig();
        console.log(`  ${key} = ${merged[key] !== undefined ? merged[key] : '(not set)'}`);
      } else if (subCmd === '--reset' || subCmd === '-r') {
        saveConfig({});
        log('ok', 'Config reset to defaults');
      }
      break;
    }

    case 'help': {
      console.log('');
      console.log('  ╔════════════════════════════════════════════╗');
      console.log('  ║     Free Proxy Tool - Help                ║');
      console.log('  ╚════════════════════════════════════════════╝');
      console.log('');
      console.log('  Quick start:');
      console.log('    1. Start proxy: node index.js start');
      console.log('    2. Set browser proxy: 127.0.0.1:1080');
      console.log('    3. Or start web UI: node index.js gui');
      console.log('');
      console.log('  Recommended WARP mode (more stable):');
      console.log('    1. Install WARP: visit https://1.1.1.1/');
      console.log('    2. Register: node index.js warp --register');
      console.log('    3. Connect: node index.js warp --connect');
      console.log('    4. Start: node index.js start');
      console.log('');
      console.log('  Free proxy mode (with auto-switch):');
      console.log('    1. Start with auto-switch: node index.js start -m proxy --auto-switch');
      console.log('    2. Start with health check: node index.js start -m proxy --health-check');
      console.log('    3. Enable both: node index.js start -m proxy --auto-switch --health-check');
      console.log('');
      console.log('  Common commands:');
      console.log('    node index.js up              One-click start (proxy+panel+browser)');
      console.log('    node index.js start           Start proxy server');
      console.log('    node index.js gui             Start Web management UI');
      console.log('    node index.js tui             Start terminal UI');
      console.log('    node index.js proxy --test    Test free proxies');
      console.log('    node index.js stats           View stats charts');
      console.log('    node index.js log             View running logs');
      console.log('    node index.js config          Manage config');
      console.log('');
      console.log('  More help: node index.js (no args to see all commands)');
      console.log('');
      break;
    }

    case 'up': {
      const upLauncher = path.join(__dirname, 'browser', 'electron-browser.js');
      const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');
      const upArgs = [upLauncher, ...process.argv.slice(3)];
      const up = spawn(electronPath === 'electron' ? 'electron' : `"${electronPath}"`, upArgs, {
        stdio: 'inherit', shell: true, cwd: __dirname
      });
      const fwd = (sig) => { try { up.kill(sig); } catch {} };
      process.on('SIGINT', () => fwd('SIGINT'));
      process.on('SIGTERM', () => fwd('SIGTERM'));
      up.on('close', (code) => process.exit(code || 0));
      return;
    }

    default: {
      console.log('  Usage:');
      console.log('');
      console.log('  ─── One-Click Start (Recommended) ───');
      console.log('    node index.js up                 One-click start all (proxy+panel+browser)');
      console.log('    node index.js up --full-proxy    Start and test best proxy');
      console.log('    node index.js start              Auto-select best mode');
      console.log('    node index.js start -m warp      Use WARP');
      console.log('    node index.js start -m proxy     Use free proxy');
      console.log('    node index.js start --proxy h:p  Use specified proxy');
      console.log('    node index.js start --auto-switch --health-check  Auto-switch + health check');
      console.log('');
      console.log('  ─── WARP Management ───');
      console.log('    node index.js warp --register    First-time registration');
      console.log('    node index.js warp --connect     Connect');
      console.log('    node index.js warp --disconnect  Disconnect');
      console.log('    node index.js warp --status      Status');
      console.log('    node index.js warp --mode [m]    View/set mode');
      console.log('');
      console.log('  ─── Proxy Management ───');
      console.log('    node index.js proxy --fetch      Fetch proxies');
      console.log('    node index.js proxy --test [N]   Test N proxies');
      console.log('    node index.js proxy --test h:p   Test specific proxy');
      console.log('    node index.js proxy --speed h:p  Speed test');
      console.log('    node index.js proxy --clear-cache Clear cache');
      console.log('');
      console.log('  ─── Status ───');
      console.log('    node index.js status             View status');
      console.log('');
      console.log('  ─── Logs ───');
      console.log('    node index.js log                View running logs');
      console.log('    node index.js log --follow       Real-time follow');
      console.log('    node index.js log --clear        Clear logs');
      console.log('    node index.js log --dir          Log directory');
      console.log('');
      console.log('  ─── Config ───');
      console.log('    node index.js config             View config');
      console.log('    node index.js config set k v     Set config');
      console.log('    node index.js config --reset     Reset config');
      console.log('');
      console.log('  ─── Help ───');
      console.log('    node index.js help               View help');
      console.log('');
      console.log('  ─── Stats Charts ───');
      console.log('    node index.js stats              Display ASCII stats charts');
      console.log('    node index.js stats --html       Generate HTML report (open in browser)');
      console.log('    node index.js stats --charts     Show all ASCII charts');
      console.log('    node index.js stats --latency    Show latency trend');
      console.log('    node index.js stats --daily      Show daily trend');
      console.log('    node index.js stats --top        Show top proxy ranking');
      console.log('    node index.js stats --clear      Clear history data');
      console.log('');
      console.log('  ─── UI ───');
      console.log('    node index.js gui                Start Web UI');
      console.log('    node index.js gui 8080           Start Web UI on specific port');
      console.log('    node index.js tui                Start terminal UI');
      console.log('    node index.js desktop            Start Electron desktop app');
      console.log('    node index.js browser            Start dedicated browser (Neutralino)');
      console.log('');
      break;
    }
  }
}

async function speedTest(proxy, sizeKB = 100) {
  const https = require('https');
  const start = Date.now();
  const agent = proxyCore.createAgent(proxy);
  if (!agent) return { success: false, error: 'Unable to create proxy agent' };

  const testUrl = `https://speed.cloudflare.com/__down?bytes=${sizeKB * 1024}`;

  try {
    const result = await new Promise((resolve, reject) => {
      let bytes = 0;
      const req = https.get(testUrl, { agent, timeout: 30000, rejectUnauthorized: false }, res => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        res.on('data', c => bytes += c.length);
        res.on('end', () => resolve(bytes));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });

    const time = ((Date.now() - start) / 1000).toFixed(1);
    const speedBps = result / (time || 0.1);
    let speedStr;
    if (speedBps > 1024 * 1024) speedStr = (speedBps / (1024 * 1024)).toFixed(2) + ' MB/s';
    else if (speedBps > 1024) speedStr = (speedBps / 1024).toFixed(1) + ' KB/s';
    else speedStr = speedBps.toFixed(0) + ' B/s';

    return { success: true, speed: speedStr, bytes: result, time };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

main().catch(err => {
  log('err', err.message);
  logger.error('Main process error: ' + err.message, { stack: err.stack });
  process.exit(1);
});
