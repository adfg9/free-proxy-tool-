const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
const STATS_FILE = path.join(CONFIG_DIR, 'stats.json');

let pendingSave = null;
let saveTimer = null;

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadData() {
  if (pendingSave) return { ...pendingSave, tests: [...pendingSave.tests] };
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { tests: [] };
  }
}

function saveData(data) {
  try {
    if (data.tests && data.tests.length > 5000) {
      data.tests = data.tests.slice(-5000);
    }
    ensureDir();
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

function queueSave(data) {
  pendingSave = data;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingSave) {
      saveData(pendingSave);
      pendingSave = null;
    }
  }, 2000);
}

function flushSync() {
  if (pendingSave) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    saveData(pendingSave);
    pendingSave = null;
  }
}

function recordTest(testResult) {
  const data = loadData();
  data.tests.push({
    timestamp: testResult.timestamp || Date.now(),
    proxy: testResult.proxy,
    latency: testResult.latency,
    alive: testResult.alive,
    ip: testResult.ip || null
  });
  queueSave(data);
}

function recordBatch(results) {
  const data = loadData();
  const now = Date.now();
  for (const r of results) {
    data.tests.push({
      timestamp: r.timestamp || now,
      proxy: r.proxy,
      latency: r.latency,
      alive: r.alive,
      ip: r.ip || null
    });
  }
  queueSave(data);
}

/**
 * Get test history
 * @param {{ limit, sinceDate, host, port }} options
 */
function getHistory(options = {}) {
  const data = loadData();
  let tests = data.tests || [];

  if (options.sinceDate) {
    const since = new Date(options.sinceDate).getTime();
    tests = tests.filter(t => t.timestamp >= since);
  }
  if (options.host) {
    tests = tests.filter(t => t.proxy && t.proxy.host === options.host);
  }
  if (options.port) {
    tests = tests.filter(t => t.proxy && t.proxy.port === options.port);
  }
  if (options.limit) {
    tests = tests.slice(-options.limit);
  }
  return tests;
}

/**
 * Compute summary statistics
 */
function getStats() {
  const data = loadData();
  const tests = data.tests || [];

  if (tests.length === 0) {
    return {
      totalTests: 0, successCount: 0, failCount: 0, successRate: 0,
      avgLatency: 0, minLatency: 0, maxLatency: 0, medianLatency: 0,
      latencyBuckets: [0, 0, 0, 0, 0],
      hourlyDistribution: [],
      dailyDistribution: [],
      topProxies: [],
      proxyTypes: { socks5: 0, http: 0, https: 0 }
    };
  }

  const totalTests = tests.length;
  const aliveTests = tests.filter(t => t.alive);
  const successCount = aliveTests.length;
  const failCount = totalTests - successCount;
  const successRate = totalTests > 0 ? Math.round((successCount / totalTests) * 100) : 0;

  const latencies = aliveTests.map(t => t.latency).sort((a, b) => a - b);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

  // Latency buckets: [0-100, 100-300, 300-500, 500-1000, 1000+]
  const latencyBuckets = [0, 0, 0, 0, 0];
  for (const lat of latencies) {
    if (lat < 100) latencyBuckets[0]++;
    else if (lat < 300) latencyBuckets[1]++;
    else if (lat < 500) latencyBuckets[2]++;
    else if (lat < 1000) latencyBuckets[3]++;
    else latencyBuckets[4]++;
  }

  // Hourly distribution (last 24 hours)
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourlyDistribution = [];
  for (let h = 23; h >= 0; h--) {
    const hStart = now - (h + 1) * 60 * 60 * 1000;
    const hEnd = now - h * 60 * 60 * 1000;
    const hTests = tests.filter(t => t.timestamp >= hStart && t.timestamp < hEnd);
    const hAlive = hTests.filter(t => t.alive);
    const hour = new Date(hEnd).getHours();
    hourlyDistribution.push({
      hour,
      count: hTests.length,
      avgLatency: hAlive.length > 0 ? Math.round(hAlive.reduce((s, t) => s + t.latency, 0) / hAlive.length) : 0
    });
  }

  // Daily distribution (last 7 days)
  const dailyDistribution = [];
  for (let d = 6; d >= 0; d--) {
    const dStart = now - (d + 1) * dayMs;
    const dEnd = now - d * dayMs;
    const dTests = tests.filter(t => t.timestamp >= dStart && t.timestamp < dEnd);
    const dAlive = dTests.filter(t => t.alive);
    const dateStr = new Date(dEnd).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
    dailyDistribution.push({
      date: dateStr,
      count: dTests.length,
      avgLatency: dAlive.length > 0 ? Math.round(dAlive.reduce((s, t) => s + t.latency, 0) / dAlive.length) : 0,
      successRate: dTests.length > 0 ? Math.round((dAlive.length / dTests.length) * 100) : 0
    });
  }

  // Top proxies
  const proxyMap = {};
  for (const t of tests) {
    if (!t.proxy) continue;
    const key = `${t.proxy.host}:${t.proxy.port}`;
    if (!proxyMap[key]) {
      proxyMap[key] = { host: t.proxy.host, port: t.proxy.port, type: t.proxy.type, tests: 0, success: 0, totalLatency: 0 };
    }
    proxyMap[key].tests++;
    if (t.alive) {
      proxyMap[key].success++;
      proxyMap[key].totalLatency += t.latency;
    }
  }
  // Proxy type distribution
  const proxyTypes = { socks5: 0, http: 0, https: 0 };
  for (const t of tests) {
    const type = (t.proxy && t.proxy.type) || 'socks5';
    if (proxyTypes[type] !== undefined) proxyTypes[type]++;
    else proxyTypes[type] = 1;
  }

  const topProxies = Object.values(proxyMap)
    .map(p => ({
      host: p.host, port: p.port, type: p.type,
      tests: p.tests,
      successRate: p.tests > 0 ? Math.round((p.success / p.tests) * 100) : 0,
      avgLatency: p.success > 0 ? Math.round(p.totalLatency / p.success) : 0
    }))
    .sort((a, b) => b.successRate - a.successRate || a.avgLatency - b.avgLatency)
    .slice(0, 10);

  return {
    totalTests, successCount, failCount, successRate,
    avgLatency, minLatency, maxLatency, medianLatency,
    latencyBuckets, hourlyDistribution, dailyDistribution, topProxies,
    proxyTypes
  };
}

/**
 * Clear all stored data
 */
function clearHistory() {
  pendingSave = { tests: [] };
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveData({ tests: [] });
}

module.exports = { recordTest, recordBatch, getHistory, getStats, clearHistory, flushSync };
