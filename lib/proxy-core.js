const https = require('https');
const { httpGet, shuffleArray, getMergedConfig } = require('./utils');
const stats = require('./stats');
const logger = require('./logger');

const BUILTIN_PROXIES = [
  { host: '24.249.199.4', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '174.75.211.222', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '72.195.34.58', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '72.195.114.169', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '174.64.199.79', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '184.178.172.14', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '98.188.47.132', port: 4145, type: 'socks5', source: 'built-in' },
  { host: '184.178.172.13', port: 15311, type: 'socks5', source: 'built-in' },
  { host: '72.49.49.11', port: 31034, type: 'socks5', source: 'built-in' },
  { host: '174.77.111.197', port: 4145, type: 'socks5', source: 'built-in' },
];

const PROXY_SOURCES = [
  { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', type: 'http', name: 'TheSpeedX-HTTP' },
  { url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', type: 'http', name: 'monosans-HTTP' },
  { url: 'https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main/http/raw/all.txt', type: 'http', name: 'ClearProxy-HTTP' },
  { url: 'https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt', type: 'http', name: 'KangProxy-HTTP' },
  { url: 'https://raw.githubusercontent.com/vpei/Free-Proxy-Merge/main/http.txt', type: 'http', name: 'vpei-HTTP' },
  { url: 'https://raw.githubusercontent.com/hw630590/free-proxies/refs/heads/main/proxies/http/http.txt', type: 'http', name: 'hw630590-HTTP' },
  { url: 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy-list/http.txt', type: 'http', name: 'Anonym0us-HTTP' },
  { url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/http/data.txt', type: 'http', name: 'proxifly-HTTP' },
  { url: 'https://raw.githubusercontent.com/JacobRabah/proxy-list/main/http.txt', type: 'http', name: 'JacobRabah-HTTP' },
  { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt', type: 'socks5', name: 'TheSpeedX' },
  { url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', type: 'socks5', name: 'monosans' },
  { url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt', type: 'socks5', name: 'roosterkid' },
  { url: 'https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main/socks5/raw/all.txt', type: 'socks5', name: 'ClearProxy' },
  { url: 'https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks5/socks5.txt', type: 'socks5', name: 'KangProxy' },
  { url: 'https://raw.githubusercontent.com/vpei/Free-Proxy-Merge/main/socks5.txt', type: 'socks5', name: 'vpei' },
  { url: 'https://raw.githubusercontent.com/hw630590/free-proxies/refs/heads/main/proxies/socks5/socks5.txt', type: 'socks5', name: 'hw630590' },
  { url: 'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy-list/socks5.txt', type: 'socks5', name: 'Anonym0us-S5' },
  { url: 'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/socks5.txt', type: 'socks5', name: 'rdavydov' },
  { url: 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/socks5/data.txt', type: 'socks5', name: 'proxifly' },
  { url: 'https://raw.githubusercontent.com/JacobRabah/proxy-list/main/socks5.txt', type: 'socks5', name: 'JacobRabah' },
  { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt', type: 'socks4', name: 'TheSpeedX-S4' },
  { url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt', type: 'socks4', name: 'monosans-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/socks5/data.txt', type: 'socks5', name: 'ProxyScrape', prefix: true },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/http/data.txt', type: 'http', name: 'ProxyScrape-HTTP', prefix: true },
  { url: 'https://proxy.scdn.io/text.php', type: 'http', name: 'scdn.io' },
  { url: 'https://proxy.scdn.io/api/get_proxy.php', type: 'http', name: 'scdn.io-API', format: 'json' },
];

const TEST_URLS = [
  'https://api.ipify.org?format=json',
  'https://httpbin.org/ip',
  'https://ifconfig.me/ip',
];

let proxyCache = {
  proxies: [],
  time: 0,
  fetching: false,
};

let testedProxiesCache = {
  alive: [],
  time: 0,
  testing: false,
};

function getCacheTTL() {
  return getMergedConfig().proxyCacheTTL || 300000;
}

function getTestedCacheTTL() {
  return 60000;
}

async function fetchProxies() {
  logger.info('ProxyCore: Starting to fetch proxy list...');

  const results = await Promise.allSettled(
    PROXY_SOURCES.map(async (src) => {
      try {
        const data = await httpGet(src.url, 8000);
        let list;
        if (src.format === 'json') {
          // JSON API format: {"code":200,"data":{"proxies":["IP:PORT",...]}}
          const parsed = JSON.parse(data);
          const rawProxies = parsed.data?.proxies || parsed.proxies || [];
          list = rawProxies.map(line => {
            const [h, p] = line.trim().split(':');
            return h && p && !isNaN(p) ? { host: h, port: parseInt(p), type: src.type, source: src.name } : null;
          }).filter(Boolean);
        } else {
          list = data.split('\n').filter(l => l.trim()).map(l => {
            let line = l.trim();
            if (src.prefix) {
              const m = line.match(/^(?:https?|socks[45])\/\/(.+)$/);
              if (m) line = m[1];
              else if (line.includes('/')) return null;
            }
            const [h, p] = line.split(':');
            return h && p && !isNaN(p) ? { host: h, port: parseInt(p), type: src.type, source: src.name } : null;
          }).filter(Boolean);
        }
        logger.debug(`ProxyCore: Fetched ${list.length} proxies from ${src.name}`);
        return list;
      } catch (e) {
        logger.debug(`ProxyCore: Failed to fetch ${src.name}: ${e.message}`);
        return [];
      }
    })
  );

  const proxies = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const builtins = BUILTIN_PROXIES.map(p => ({ ...p }));
  const all = [...builtins, ...proxies];

  const seen = new Set();
  const unique = all.filter(p => {
    const key = p.host + ':' + p.port;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(`ProxyCore: Got ${unique.length} unique proxies (from ${PROXY_SOURCES.length} sources)`);
  return unique;
}

async function getProxies(force = false) {
  const now = Date.now();
  const ttl = getCacheTTL();

  if (!force && proxyCache.proxies.length > 0 && (now - proxyCache.time) < ttl) {
    logger.debug('ProxyCore: Using cached proxy list');
    return proxyCache.proxies;
  }

  if (proxyCache.fetching) {
    return proxyCache.proxies;
  }

  proxyCache.fetching = true;
  try {
    const proxies = await fetchProxies();
    proxyCache = { proxies, time: Date.now(), fetching: false };
    return proxies;
  } catch (e) {
    logger.error('ProxyCore: Failed to fetch proxies: ' + e.message);
    proxyCache.fetching = false;
    return BUILTIN_PROXIES.map(p => ({ ...p }));
  }
}

function createAgent(proxy) {
  if (proxy.type === 'socks5') {
    try {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      return new SocksProxyAgent(`socks5://${proxy.host}:${proxy.port}`);
    } catch (e) {
      logger.debug('ProxyCore: socks-proxy-agent unavailable, trying http-proxy-agent');
    }
  }
  try {
    const { HttpProxyAgent } = require('http-proxy-agent');
    return new HttpProxyAgent(`http://${proxy.host}:${proxy.port}`);
  } catch (e) {
    return null;
  }
}

async function testProxy(proxy, timeout = null) {
  const config = getMergedConfig();
  const testTimeout = timeout || config.proxyTestTimeout || 5000;
  const start = Date.now();

  const agent = createAgent(proxy);
  if (!agent) {
    return { ...proxy, alive: false, latency: -1, error: 'no agent' };
  }

  for (const testUrl of TEST_URLS) {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.get(testUrl, {
          agent,
          timeout: testTimeout,
          rejectUnauthorized: false
        }, res => {
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
      } catch {
        ip = result.trim().split('\n')[0];
      }

      const latency = Date.now() - start;
      return { ...proxy, alive: true, latency, ip };
    } catch (e) {
      continue;
    }
  }

  return { ...proxy, alive: false, latency: -1 };
}

async function testProxyBatch(proxies, options = {}) {
  const config = getMergedConfig();
  const batchSize = options.batchSize || config.proxyTestBatchSize || 10;
  const onProgress = options.onProgress || (() => {});
  const results = [];

  logger.info(`ProxyCore: Starting to test ${proxies.length} proxies (concurrency: ${batchSize})`);

  for (let i = 0; i < proxies.length; i += batchSize) {
    const batch = proxies.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(p => testProxy(p)));
    results.push(...batchResults);
    const tested = Math.min(i + batchSize, proxies.length);
    const aliveCount = results.filter(r => r.alive).length;
    logger.debug(`ProxyCore: Tested ${tested}/${proxies.length}, alive: ${aliveCount}`);
    onProgress({ tested, total: proxies.length, results: batchResults, aliveCount });
  }

  const alive = results.filter(r => r.alive).sort((a, b) => a.latency - b.latency);
  logger.info(`ProxyCore: Testing complete, ${alive.length}/${proxies.length} alive`);

  stats.recordBatch(results);

  return { all: results, alive };
}

async function findBestProxy(maxTest = null, options = {}) {
  const config = getMergedConfig();
  const count = maxTest || config.proxyTestCount || 30;
  const onProgress = options.onProgress;

  const now = Date.now();
  if (!options.force && testedProxiesCache.alive.length > 0 && (now - testedProxiesCache.time) < getTestedCacheTTL()) {
    logger.debug('ProxyCore: Using cached test results');
    if (onProgress) {
      onProgress({
        tested: testedProxiesCache.alive.length,
        total: testedProxiesCache.alive.length,
        results: testedProxiesCache.alive,
        aliveCount: testedProxiesCache.alive.length,
        cached: true
      });
    }
    return testedProxiesCache.alive;
  }

  if (testedProxiesCache.testing) {
    return testedProxiesCache.alive;
  }

  testedProxiesCache.testing = true;
  try {
    const proxies = await getProxies();
    const shuffled = shuffleArray(proxies).slice(0, count);
    const { alive } = await testProxyBatch(shuffled, { onProgress });
    testedProxiesCache = { alive, time: Date.now(), testing: false };
    return alive;
  } catch (e) {
    logger.error('ProxyCore: Failed to find best proxy: ' + e.message);
    testedProxiesCache.testing = false;
    return [];
  }
}

function scoreProxy(proxy) {
  if (!proxy.alive) return 0;
  const latencyScore = Math.max(0, 100 - proxy.latency / 10);
  return Math.round(latencyScore * 10) / 10;
}

function getSourceBreakdown(proxies) {
  const counts = {};
  const typeCounts = {};
  proxies.forEach(p => {
    const s = p.source || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
    const t = p.type || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  return { counts, typeCounts };
}

function clearCache() {
  proxyCache = { proxies: [], time: 0, fetching: false };
  testedProxiesCache = { alive: [], time: 0, testing: false };
  logger.info('ProxyCore: Cache cleared');
}

module.exports = {
  BUILTIN_PROXIES,
  PROXY_SOURCES,
  fetchProxies,
  getProxies,
  testProxy,
  testProxyBatch,
  findBestProxy,
  scoreProxy,
  getSourceBreakdown,
  clearCache,
  createAgent,
};
