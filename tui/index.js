#!/usr/bin/env node
/**
 * Free Proxy Tool - Terminal UI (TUI)
 * Interactive terminal interface using inquirer + chalk + ora
 */

// inquirer@14 is ESM-first: from CJS, require('inquirer') returns a module
// namespace ({ __esModule, default }) where the API lives on `.default`, so
// `inquirer.prompt(...)` threw "inquirer.prompt is not a function" and the TUI
// could not even open its menu. Normalise the interop shape here.
const inquirer = (() => {
  const mod = require('inquirer');
  if (mod && typeof mod.prompt === 'function') return mod;
  if (mod && mod.default && typeof mod.default.prompt === 'function') return mod.default;
  return mod;
})();
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const stats = require(path.join(PROJECT_ROOT, 'lib', 'stats'));
const proxyCore = require(path.join(PROJECT_ROOT, 'lib', 'proxy-core'));
const { shuffleArray, mapPool } = require(path.join(PROJECT_ROOT, 'lib', 'utils'));

// ========== Helpers ==========
const C = {
  ok: chalk.green, err: chalk.red, warn: chalk.yellow, info: chalk.cyan,
  dim: chalk.gray, bold: chalk.bold, title: chalk.bold.cyan,
  accent: chalk.hex('#8b5cf6'),
};

function banner() {
  console.log('');
  console.log(C.title('  ╔═══════════════════════════════════════╗'));
  console.log(C.title('  ║     Free Proxy Tool - Terminal Interface        ║'));
  console.log(C.title('  ╚═══════════════════════════════════════╝'));
  console.log('');
}

// ========== WARP ==========
// Reuse lib/warp so the TUI finds warp-cli in Program Files, not just on PATH.
const WARP = require(path.join(PROJECT_ROOT, 'lib', 'warp'));

// ========== Proxy ==========
async function fetchProxies() {
  return proxyCore.getProxies();
}

// The real test lives in lib/proxy-core: it picks the right agent for the proxy
// type (this copy always forced a SOCKS5 agent, so plain HTTP proxies never
// tested correctly), races the test URLs against one deadline, and releases the
// agent afterwards instead of leaking a socket per test.
function testProxy(proxy, timeout = 4000) {
  const p = { ...(proxy || {}) };
  if (!p.type) p.type = 'socks5';
  return proxyCore.testProxy(p, timeout);
}

// ========== ASCII Chart Helpers ==========
function printBar(label, value, maxVal, width = 35) {
  const barLen = maxVal > 0 ? Math.round((value / maxVal) * width) : 0;
  const bar = '█'.repeat(barLen) + '░'.repeat(width - barLen);
  console.log(`  ${C.dim(label.padEnd(14))} ${bar} ${C.bold(String(value))}`);
}

// ========== Menu Screens ==========
async function showDashboard() {
  const s = stats.getStats();
  console.log('');
  console.log(C.title('  ─── Dashboard ───'));
  console.log('');
  console.log(`  Total Tests: ${C.bold(s.totalTests.toString())}    Success Rate: ${C.ok(s.successRate + '%')}    Avg Latency: ${C.info(s.avgLatency + 'ms')}`);
  console.log(`  Min: ${C.ok(s.minLatency + 'ms')}    Max: ${C.warn(s.maxLatency + 'ms')}    Median: ${C.info(s.medianLatency + 'ms')}`);

  if (s.totalTests > 0) {
    console.log('');
    console.log(C.title('  Latency Distribution'));
    const maxBucket = Math.max(...s.latencyBuckets, 1);
    const labels = ['0-100ms   ', '100-300ms ', '300-500ms ', '500-1000ms', '1000ms+   '];
    const colors = [C.ok, C.info, C.warn, chalk.hex('#f97316'), C.err];
    for (let i = 0; i < labels.length; i++) {
      const barLen = Math.round((s.latencyBuckets[i] / maxBucket) * 35);
      const bar = '█'.repeat(barLen);
      console.log(`  ${C.dim(labels[i])} ${colors[i](bar)} ${s.latencyBuckets[i]}`);
    }
  }

  if (s.totalTests === 0) {
    console.log('');
    console.log(C.dim('  No test data yet'));
  }
  console.log('');
}

async function showProxyTest() {
  const { count } = await inquirer.prompt([{
    type: 'number', name: 'count', message: 'Number of proxies to test:', default: 20
  }]);

  const spinner = ora('Fetching proxy list...').start();
  let proxies;
  try {
    proxies = await fetchProxies();
    spinner.text = `Fetched ${proxies.length} proxies, starting tests...`;
  } catch (e) {
    spinner.fail('Failed to fetch proxies');
    return;
  }

  proxies = shuffleArray(proxies).slice(0, count);
  const results = [];
  const concurrency = 10;

  // Worker pool instead of batch barriers: one slow proxy no longer stalls the rest.
  await mapPool(proxies, concurrency, p => testProxy(p), (r) => {
    results.push(r);
    spinner.text = `Testing ${results.length}/${proxies.length}...`;
  });

  stats.recordBatch(results);
  const alive = results.filter(r => r.alive).sort((a, b) => a.latency - b.latency);
  spinner.succeed(`Test complete, ${C.ok(alive.length + ' available')}`);

  if (alive.length > 0) {
    console.log('');
    console.log(C.title('  ─── Available Proxies ───'));
    alive.slice(0, 15).forEach((p, i) => {
      const latency = p.latency < 200 ? C.ok(p.latency + 'ms') : p.latency < 500 ? C.warn(p.latency + 'ms') : C.err(p.latency + 'ms');
      console.log(`  ${(i + 1 + '.').padStart(4)} ${C.dim(p.host + ':' + p.port)}  ${latency}  ${C.dim(p.ip)}`);
    });
  } else {
    console.log('');
    console.log(C.err('  No available proxies found'));
  }
  console.log('');
}

async function showSingleTest() {
  const { target } = await inquirer.prompt([{
    type: 'input', name: 'target', message: 'Proxy Address (IP:Port):',
    validate: v => v.includes(':') ? true : 'Please enter in format: IP:Port'
  }]);
  const [host, port] = target.split(':');
  const spinner = ora(`Testing ${host}:${port}...`).start();
  const r = await testProxy({ host, port: parseInt(port), type: 'socks5' });
  stats.recordTest(r);
  if (r.alive) {
    spinner.succeed(`${C.ok('Available')}  Latency: ${r.latency}ms  IP: ${r.ip}`);
  } else {
    spinner.fail('Unavailable');
  }
}

async function showWarp() {
  const installed = WARP.installed();
  const status = WARP.status();

  console.log('');
  console.log(C.title('  ─── WARP Management ───'));
  console.log('');

  if (!installed) {
    console.log(C.warn('  WARP not installed'));
    console.log(C.dim('  Please visit https://1.1.1.1/ to download and install'));
    console.log('');
    return;
  }

  if (status && status.connected) {
    console.log(`  Status: ${C.ok('Connected')}`);
  } else {
    console.log(`  Status: ${C.err('Disconnected')}`);
  }
  console.log('');

  const { action } = await inquirer.prompt([{
    type: 'select', name: 'action', message: 'Select action:',
    choices: [
      { name: 'Connect WARP', value: 'connect' },
      { name: 'Disconnect WARP', value: 'disconnect' },
      { name: 'Register (First time)', value: 'register' },
      { name: 'Back', value: 'back' }
    ]
  }]);

  if (action === 'connect') {
    const spinner = ora('Connecting...').start();
    await WARP.connect();
    const s = WARP.status();
    if (s && s.connected) spinner.succeed('WARP Connected');
    else spinner.warn('Connecting, please check status later');
  } else if (action === 'disconnect') {
    WARP.disconnect();
    console.log(C.ok('  Disconnected'));
  } else if (action === 'register') {
    const spinner = ora('Registering...').start();
    const r = WARP.register();
    if (r && r.success) spinner.succeed('Registration successful');
    else spinner.fail('Registration failed: ' + ((r && r.raw) || 'Unknown error'));
  }
  console.log('');
}

async function showCharts() {
  const s = stats.getStats();
  console.log('');
  console.log(C.title('  ─── Statistics Charts ───'));

  if (s.totalTests === 0) {
    console.log(C.dim('  No data'));
    console.log('');
    return;
  }

  // Latency trend (hourly)
  console.log('');
  console.log(C.title('  Latency Trend (24h)'));
  const hourlyData = s.hourlyDistribution.map(h => h.avgLatency);
  const maxH = Math.max(...hourlyData, 1);
  hourlyData.forEach((v, i) => {
    const h = s.hourlyDistribution[i].hour;
    printBar(`${String(h).padStart(2, '0')}:00`, v, maxH, 40);
  });

  // Daily success rate
  console.log('');
  console.log(C.title('  Daily Success Rate'));
  s.dailyDistribution.forEach(d => {
    const barLen = Math.round((d.successRate / 100) * 35);
    const bar = '█'.repeat(barLen) + '░'.repeat(35 - barLen);
    const color = d.successRate >= 80 ? C.ok : d.successRate >= 50 ? C.warn : C.err;
    console.log(`  ${C.dim(d.date.padEnd(8))} ${color(bar)} ${d.successRate}%`);
  });

  // Top proxies
  if (s.topProxies.length > 0) {
    console.log('');
    console.log(C.title('  Top Proxies'));
    const maxRate = Math.max(...s.topProxies.map(p => p.successRate), 1);
    s.topProxies.forEach((p, i) => {
      const barLen = Math.round((p.successRate / maxRate) * 30);
      const bar = '█'.repeat(barLen);
      const color = p.successRate >= 80 ? C.ok : p.successRate >= 50 ? C.warn : C.err;
      console.log(`  ${(i + 1 + '.').padStart(4)} ${C.dim(p.host + ':' + p.port)}  ${color(bar)} ${p.successRate}%  ${C.dim(p.avgLatency + 'ms')}`);
    });
  }
  console.log('');
}

async function showHtmlReport() {
  const htmlReport = require(path.join(PROJECT_ROOT, 'lib', 'html-report'));
  const spinner = ora('Generating HTML report...').start();
  try {
    const filePath = htmlReport.generateReport();
    spinner.succeed(`Report generated: ${filePath}`);
    console.log(C.dim('  Attempted to open in browser'));
  } catch (e) {
    spinner.fail('Generation failed: ' + e.message);
  }
  console.log('');
}

// ========== Main Loop ==========
async function mainMenu() {
  banner();

  while (true) {
    const { action } = await inquirer.prompt([{
      type: 'select', name: 'action', message: 'Select action:',
      choices: [
        { name: '📊 Dashboard', value: 'dashboard' },
        { name: '🔍 Test Proxies (Batch)', value: 'test-all' },
        { name: '🎯 Test Single Proxy', value: 'test-one' },
        { name: '⚡ WARP Management', value: 'warp' },
        { name: '📈 Statistics Charts', value: 'charts' },
        { name: '🌐 Generate HTML Report', value: 'html-report' },
        { name: '🚪 Exit', value: 'exit' }
      ]
    }]);

    switch (action) {
      case 'dashboard': await showDashboard(); break;
      case 'test-all': await showProxyTest(); break;
      case 'test-one': await showSingleTest(); break;
      case 'warp': await showWarp(); break;
      case 'charts': await showCharts(); break;
      case 'html-report': await showHtmlReport(); break;
      case 'exit':
        console.log(C.dim('\n  Goodbye!\n'));
        process.exit(0);
    }
  }
}

mainMenu().catch(err => {
  console.error(C.err('  Error: ' + err.message));
  process.exit(1);
});
