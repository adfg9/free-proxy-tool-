const https = require('https');
const { httpGet, shuffleArray, getMergedConfig } = require('./utils');
const stats = require('./stats');
const logger = require('./logger');

const BUILTIN_PROXIES = [
  // Stable tested HTTP proxies (100% success rate, avg latency 436-962ms)
  { host: '185.170.166.75', port: 80, type: 'http', source: 'built-in' },
  { host: '185.162.229.141', port: 80, type: 'http', source: 'built-in' },
  { host: '185.238.228.203', port: 80, type: 'http', source: 'built-in' },
  { host: '45.131.5.145', port: 80, type: 'http', source: 'built-in' },
  { host: '147.185.161.0', port: 80, type: 'http', source: 'built-in' },
  { host: '173.245.49.53', port: 80, type: 'http', source: 'built-in' },
  { host: '45.131.6.206', port: 80, type: 'http', source: 'built-in' },
  { host: '141.193.213.123', port: 80, type: 'http', source: 'built-in' },
  { host: '31.43.179.83', port: 80, type: 'http', source: 'built-in' },
  { host: '173.245.49.148', port: 80, type: 'http', source: 'built-in' },
  { host: '45.131.7.99', port: 80, type: 'http', source: 'built-in' },
  { host: '185.162.231.118', port: 80, type: 'http', source: 'built-in' },
  { host: '185.238.228.111', port: 80, type: 'http', source: 'built-in' },
  { host: '45.12.31.83', port: 80, type: 'http', source: 'built-in' },
  { host: '173.245.49.52', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.74.107', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.67.147', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.181.49', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.106.72', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.211.192', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.174.112', port: 80, type: 'http', source: 'built-in' },
  { host: '63.141.128.88', port: 80, type: 'http', source: 'built-in' },
  { host: '185.162.229.219', port: 80, type: 'http', source: 'built-in' },
  { host: '185.162.229.48', port: 80, type: 'http', source: 'built-in' },
  { host: '31.43.179.21', port: 80, type: 'http', source: 'built-in' },
  { host: '66.235.200.115', port: 80, type: 'http', source: 'built-in' },
  { host: '185.162.231.6', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.182.164', port: 80, type: 'http', source: 'built-in' },
  { host: '172.67.182.64', port: 80, type: 'http', source: 'built-in' },
  { host: '5.10.247.239', port: 80, type: 'http', source: 'built-in' },
  // SOCKS5 fallback proxies
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
  // HTTP proxies - using jsdelivr CDN for better accessibility
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/http.txt', type: 'http', name: 'TheSpeedX-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/http.txt', type: 'http', name: 'monosans-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/ClearProxy/checked-proxy-list@main/http/raw/all.txt', type: 'http', name: 'ClearProxy-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/officialputuid/KangProxy@KangProxy/http/http.txt', type: 'http', name: 'KangProxy-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/vpei/Free-Proxy-Merge@main/http.txt', type: 'http', name: 'vpei-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/hw630590/free-proxies@main/proxies/http/http.txt', type: 'http', name: 'hw630590-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies@main/proxy-list/http.txt', type: 'http', name: 'Anonym0us-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/http/data.txt', type: 'http', name: 'proxifly-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/JacobRabah/proxy-list@main/http.txt', type: 'http', name: 'JacobRabah-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/rdavydov/proxy-list@main/proxies/http.txt', type: 'http', name: 'rdavydov-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/zevtyardt/proxy-list@main/http.txt', type: 'http', name: 'zevtyardt-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/mmpx12/proxy-list@master/http.txt', type: 'http', name: 'mmpx12-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/clarketm/proxy-list@master/proxy-list-raw.txt', type: 'http', name: 'clarketm' },
  { url: 'https://cdn.jsdelivr.net/gh/opsxcn/proxy-list@master/list.txt', type: 'http', name: 'opsxcn' },
  // SOCKS5 proxies
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/socks5.txt', type: 'socks5', name: 'TheSpeedX-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/socks5.txt', type: 'socks5', name: 'monosans-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/roosterkid/openproxylist@main/SOCKS5_RAW.txt', type: 'socks5', name: 'roosterkid' },
  { url: 'https://cdn.jsdelivr.net/gh/ClearProxy/checked-proxy-list@main/socks5/raw/all.txt', type: 'socks5', name: 'ClearProxy-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/officialputuid/KangProxy@KangProxy/socks5/socks5.txt', type: 'socks5', name: 'KangProxy-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/vpei/Free-Proxy-Merge@main/socks5.txt', type: 'socks5', name: 'vpei-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/hw630590/free-proxies@main/proxies/socks5/socks5.txt', type: 'socks5', name: 'hw630590-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies@main/proxy-list/socks5.txt', type: 'socks5', name: 'Anonym0us-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/rdavydov/proxy-list@main/proxies/socks5.txt', type: 'socks5', name: 'rdavydov-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/socks5/data.txt', type: 'socks5', name: 'proxifly-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/JacobRabah/proxy-list@main/socks5.txt', type: 'socks5', name: 'JacobRabah-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/zevtyardt/proxy-list@main/socks5.txt', type: 'socks5', name: 'zevtyardt-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/mmpx12/proxy-list@master/socks5.txt', type: 'socks5', name: 'mmpx12-S5' },
  // SOCKS4 proxies
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/socks4.txt', type: 'socks4', name: 'TheSpeedX-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/socks4.txt', type: 'socks4', name: 'monosans-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/zevtyardt/proxy-list@main/socks4.txt', type: 'socks4', name: 'zevtyardt-S4' },
  // ProxyScrape CDN sources
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/socks5/data.txt', type: 'socks5', name: 'ProxyScrape-S5', prefix: true },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/http/data.txt', type: 'http', name: 'ProxyScrape-HTTP', prefix: true },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/socks4/data.txt', type: 'socks4', name: 'ProxyScrape-S4', prefix: true },
  // Non-GitHub sources
  { url: 'https://proxy.scdn.io/text.php', type: 'http', name: 'scdn.io' },
  { url: 'https://proxy.scdn.io/api/get_proxy.php', type: 'http', name: 'scdn.io-API', format: 'json' },
  { url: 'https://api.proxyscrape.com/v2/getproxies?request=get_all_proxy_data&protocol=http&timeout=10000&country=all', type: 'http', name: 'ProxyScrape-HTTP-API' },
  { url: 'https://api.proxyscrape.com/v2/getproxies?request=get_all_proxy_data&protocol=socks5&timeout=10000&country=all', type: 'socks5', name: 'ProxyScrape-S5-API' },
  { url: 'https://api.proxyscrape.com/v2/getproxies?request=get_all_proxy_data&protocol=socks4&timeout=10000&country=all', type: 'socks4', name: 'ProxyScrape-S4-API' },
  // Fallback: raw.githubusercontent.com (for when jsdelivr is down)
  { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', type: 'http', name: 'TheSpeedX-HTTP-raw' },
  { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt', type: 'socks5', name: 'TheSpeedX-S5-raw' },
  { url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt', type: 'http', name: 'monosans-HTTP-raw' },
  { url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt', type: 'socks5', name: 'monosans-S5-raw' },
]

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
        return list;
      } catch (e) {
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

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.length > 0).length;
  const failed = results.filter(r => r.status === 'rejected').length;
  logger.info(`ProxyCore: Fetched ${unique.length} proxies (${succeeded} sources ok, ${failed} failed)`);
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
