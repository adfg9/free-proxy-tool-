const https = require('https');
const { httpGet, shuffleArray, getMergedConfig, mapPool } = require('./utils');
const stats = require('./stats');
const logger = require('./logger');

const BUILTIN_PROXIES = [
  // ===== Re-verified 2026-08-07 (5 rounds each, actual measured latency) =====
  // Tested 66761 proxies from all sources + 1000 Asia-focused samples
  // All below are 80-100% success rate across 5 consecutive test rounds.

  // 🛡️ HIGH ANONYMITY (Elite) — verified 2026-08-20: exit IP differs, no leak headers
  { host: '203.19.38.114',   port: 1080, type: 'http', source: 'verified-elite' }, // avg=355ms 3/3 elite

  // 🏆 SUB-200ms STABLE (avg 108ms, 100%): fastest verified free proxy!
  { host: '115.239.234.43', port: 7302, type: 'http', source: 'verified-sub200' }, // avg=108ms min=87ms max=149ms 100% (ERD-HTTP)

  // ⚡ SUB-200ms STABLE (avg 188ms, 100%): always reliable, sub-200ms
  { host: '59.110.63.234', port: 80, type: 'http', source: 'verified-sub200' }, // avg=188ms min=108ms max=470ms 100%

  // 🎯 SOLID 100% STABLE (avg 450-460ms, 100% 5/5 rounds): improved latency!
  { host: '31.43.179.194',    port: 80, type: 'http', source: 'verified-solid' }, // avg=450ms min=446ms 100%
  { host: '141.101.120.214',  port: 80, type: 'http', source: 'verified-stable' }, // avg=451ms min=441ms  80%
  { host: '45.131.4.250',     port: 80, type: 'http', source: 'verified-solid' }, // avg=454ms min=440ms 100%
  { host: '159.112.235.94',   port: 80, type: 'http', source: 'verified-solid' }, // avg=454ms min=442ms 100%
  { host: '141.101.121.226',  port: 80, type: 'http', source: 'verified-solid' }, // avg=456ms min=437ms 100%

  // 🎯 SOLID 100% STABLE (avg 650-950ms, 100%): reliable backups (5/5 rounds)
  { host: '103.21.244.132',   port: 80, type: 'http', source: 'verified-solid' }, // avg=650ms min=446ms 100%
  { host: '185.162.231.23',   port: 80, type: 'http', source: 'verified-solid' }, // avg=655ms min=448ms 100%
  { host: '141.193.213.254',  port: 80, type: 'http', source: 'verified-solid' }, // avg=663ms min=448ms 100%
  { host: '172.64.94.22',     port: 80, type: 'http', source: 'verified-solid' }, // avg=838ms min=457ms 100%
  { host: '45.12.31.237',     port: 80, type: 'http', source: 'verified-stable' }, // avg=952ms min=441ms  80%

  // 🆕 NEW STABLE (avg 434ms, 100%): found in Asia-focused search 2026-08-07 (3/3 rounds)
  { host: '39.109.113.97',    port: 4090, type: 'http', source: 'verified-asia' }, // avg=434ms min=334ms 100% (SCDN-ASIA)

  // Stable legacy HTTP proxies (always-on data-center IP ranges)
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
  // ===== ELITE / HIGH ANONYMITY SOURCES (pre-filtered for anonymity) =====
  { url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3000&country=all&ssl=all&anonymity=elite', type: 'http', name: 'ProxyScrape-Elite' },
  // ===== CURATED HIGH-YIELD SOCKS (added 2026-10-11) =====
  // Each of these was measured through this project's own tester with the
  // "exit IP must actually change" rule applied; the rates are real-alive per
  // 25 fresh samples: hideip-S4 23, hideip-S5 14, rdavydov-S4 10, Anonym0us-S4 9,
  // roosterkid-S4 4. Big raw lists (100k+ entries) were left out on purpose:
  // they are almost entirely dead and would only dilute random sampling.
  { url: 'https://cdn.jsdelivr.net/gh/zloi-user/hideip.me@main/socks4.txt', type: 'socks4', name: 'hideip-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/zloi-user/hideip.me@main/socks5.txt', type: 'socks5', name: 'hideip-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies@main/proxy_files/socks4_proxies.txt', type: 'socks4', name: 'Anonym0us-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/rdavydov/proxy-list@main/proxies/socks4.txt', type: 'socks4', name: 'rdavydov-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/roosterkid/openproxylist@main/SOCKS4_RAW.txt', type: 'socks4', name: 'roosterkid-S4' },
  // ===== HIGH PRIORITY: CHECKED / VERIFIED / LIVE proxies (always non-empty, most reliable) =====
  { url: 'https://cdn.jsdelivr.net/gh/ClearProxy/checked-proxy-list@main/http/raw/all.txt', type: 'http', name: 'ClearProxy-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/ClearProxy/checked-proxy-list@main/socks5/raw/all.txt', type: 'socks5', name: 'ClearProxy-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/ErcinDedeoglu/proxies@main/proxies/http.txt', type: 'http', name: 'ErcinDedeoglu-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/ErcinDedeoglu/proxies@main/proxies/socks5.txt', type: 'socks5', name: 'ErcinDedeoglu-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/officialputuid/KangProxy@KangProxy/http/http.txt', type: 'http', name: 'KangProxy-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/officialputuid/KangProxy@KangProxy/socks5/socks5.txt', type: 'socks5', name: 'KangProxy-S5' },
  // ===== HIGH-VOLUME: Verified working sources (confirmed 1000+ proxies each on 2026-04-06) =====
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/http.txt', type: 'http', name: 'TheSpeedX-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/socks5.txt', type: 'socks5', name: 'TheSpeedX-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/http.txt', type: 'http', name: 'monosans-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/socks5.txt', type: 'socks5', name: 'monosans-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies@main/proxy_files/http_proxies.txt', type: 'http', name: 'Anonym0us-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies@main/proxy_files/socks5_proxies.txt', type: 'socks5', name: 'Anonym0us-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/http/data.txt', type: 'http', name: 'ProxyScrape-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/socks5/data.txt', type: 'socks5', name: 'ProxyScrape-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/protocols/socks4/data.txt', type: 'socks4', name: 'ProxyScrape-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/rdavydov/proxy-list@main/proxies/http.txt', type: 'http', name: 'rdavydov-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/rdavydov/proxy-list@main/proxies/socks5.txt', type: 'socks5', name: 'rdavydov-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/zevtyardt/proxy-list@main/http.txt', type: 'http', name: 'zevtyardt-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/zevtyardt/proxy-list@main/socks5.txt', type: 'socks5', name: 'zevtyardt-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/zevtyardt/proxy-list@main/socks4.txt', type: 'socks4', name: 'zevtyardt-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/mmpx12/proxy-list@master/http.txt', type: 'http', name: 'mmpx12-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/mmpx12/proxy-list@master/socks5.txt', type: 'socks5', name: 'mmpx12-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/JacobRabah/proxy-list@main/http.txt', type: 'http', name: 'JacobRabah-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/JacobRabah/proxy-list@main/socks5.txt', type: 'socks5', name: 'JacobRabah-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/clarketm/proxy-list@master/proxy-list-raw.txt', type: 'http', name: 'clarketm' },
  { url: 'https://cdn.jsdelivr.net/gh/roosterkid/openproxylist@main/SOCKS5_RAW.txt', type: 'socks5', name: 'roosterkid' },
  { url: 'https://cdn.jsdelivr.net/gh/ShiftyTR/Proxy-List@master/http.txt', type: 'http', name: 'ShiftyTR-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/ShiftyTR/Proxy-List@master/socks5.txt', type: 'socks5', name: 'ShiftyTR-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/hookzof/proxylist@master/http.txt', type: 'http', name: 'hookzof-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/hookzof/proxylist@master/socks5.txt', type: 'socks5', name: 'hookzof-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/ObcbO/getproxy@master/all.txt', type: 'http', name: 'ObcbO-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/tahmid09/proxy-list@master/proxy.txt', type: 'http', name: 'tahmid09-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/vpei/Free-Proxy-Merge@main/http.txt', type: 'http', name: 'vpei-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/vpei/Free-Proxy-Merge@main/socks5.txt', type: 'socks5', name: 'vpei-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/hw630590/free-proxies@main/proxies/http/http.txt', type: 'http', name: 'hw630590-HTTP' },
  { url: 'https://cdn.jsdelivr.net/gh/hw630590/free-proxies@main/proxies/socks5/socks5.txt', type: 'socks5', name: 'hw630590-S5' },
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/socks4.txt', type: 'socks4', name: 'TheSpeedX-S4' },
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/socks4.txt', type: 'socks4', name: 'monosans-S4' },
  // ===== DEAD / BLOCKED SOURCES REMOVED 2026-11-07 =====
  // NotUnu-working (404), proxifly-HTTP/S5 (404), scdn.io (now returns a captcha
  // page: "<script src=/_guard/html.js?js=captcha_html>"), and the three
  // ProxyScrape v2 JSON APIs (get_all_proxy_data times out from CN). A source that
  // can never return proxies only adds an 8s stall to every refresh.
  // ===== FALLBACK: raw.githubusercontent.com (for when jsDelivr is down) =====
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

// Plain (non-proxied) IP-echo endpoints used for the transparency check below.
const DIRECT_IP_URLS = [
  'https://ifconfig.me/ip',
  'https://icanhazip.com',
  'https://checkip.amazonaws.com',
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

// Shared in-flight promises. The old `if (fetching) return cache` returned an
// EMPTY list to every concurrent caller during the first fetch (panel + CLI +
// auto-find all start together), which surfaced as "no proxies found".
let fetchInflight = null;
let testInflight = null;

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
          list = data.split('\n').filter(l => l.trim()).map(line => {
            // Strip any "scheme://" prefix. Some sources (e.g. the ProxyScrape mirrors)
            // emit "http://1.2.3.4:8080"; the old code only did this when src.prefix was
            // set, so those whole sources parsed to zero. Doing it unconditionally is
            // safe: a bare "host:port" line has no "://" and matches as-is.
            const s = line.trim().replace(/^(?:https?|socks[45]):\/\//i, '');
            const [h, p] = s.split(':');
            if (!h || !p || !/^\d+$/.test(p)) return null;
            const port = parseInt(p);
            if (!(port > 0 && port < 65536)) return null;
            return { host: h, port, type: src.type, source: src.name };
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

  if (fetchInflight) return fetchInflight;

  fetchInflight = (async () => {
    try {
      const proxies = await fetchProxies();
      proxyCache = { proxies, time: Date.now(), fetching: false };
      return proxies;
    } catch (e) {
      logger.error('ProxyCore: Failed to fetch proxies: ' + e.message);
      proxyCache = { ...proxyCache, fetching: false };
      return BUILTIN_PROXIES.map(p => ({ ...p }));
    } finally {
      fetchInflight = null;
    }
  })();
  return fetchInflight;
}

function createAgent(proxy) {
  if (!proxy) return null;
  const type = String(proxy.type || 'http').toLowerCase();
  if (type === 'socks5' || type === 'socks4') {
    try {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      return new SocksProxyAgent(`${type}://${proxy.host}:${proxy.port}`);
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

// How much of a probe response body we keep — enough for the IP lookup JSON/text.
const PROBE_BODY_LIMIT = 4096;

// One probe against a single test URL. Resolves with { status, body } on a 2xx
// response, or null on any failure. `deadline` (absolute ms) is enforced with a
// hard timer on top of the socket inactivity timeout, so a half-open proxy
// connection can never hold the probe longer than the overall test budget.
function probeUrl(testUrl, agent, deadline) {
  return new Promise(resolve => {
    const budget = Math.max(50, deadline - Date.now());
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    let req;
    try {
      req = https.get(testUrl, { agent, timeout: budget, rejectUnauthorized: false }, res => {
        const status = res.statusCode;
        if (status < 200 || status >= 300) {
          finish(null);
          try { res.destroy(); } catch {}
          return;
        }
        let body = '';
        res.on('data', c => { if (body.length < PROBE_BODY_LIMIT) body += c; });
        res.on('end', () => finish({ status, body }));
        res.on('aborted', () => finish(null));
        res.on('error', () => finish(null));
      });
    } catch (e) {
      finish(null);
      return;
    }
    timer = setTimeout(() => { try { req.destroy(); } catch {} finish(null); }, budget);
    req.on('error', () => finish(null));
    req.on('timeout', () => { try { req.destroy(); } catch {} finish(null); });
  });
}

// Resolve with the first truthy result, or null when every attempt failed.
function firstFulfilled(promises) {
  return new Promise(resolve => {
    let pending = promises.length;
    if (pending === 0) { resolve(null); return; }
    let done = false;
    for (const p of promises) {
      Promise.resolve(p).then(
        value => {
          if (done) return;
          if (value) { done = true; resolve(value); return; }
          if (--pending === 0) resolve(null);
        },
        () => {
          if (done) return;
          if (--pending === 0) resolve(null);
        }
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Transparency check.
// A candidate can answer 2xx without actually proxying: transparent interception
// on port 80 (common on carrier networks), captive portals, plain open relays
// that fetch the URL themselves. In every one of those cases the IP-echo test
// URLs report *this machine's own* address — the candidate does not change the
// exit IP and is therefore useless. Measured on 2026-10-11: a merged "master"
// list showed 23/60 "alive" proxies, all of them port 80, all returning the
// local IP. Marking those dead is the difference between a pool that hides you
// and a pool that only looks full.
let directIpCache = { ip: null, time: 0 };
const DIRECT_IP_TTL = 10 * 60 * 1000;

async function getDirectIp(timeout = 5000) {
  const now = Date.now();
  if (directIpCache.ip && (now - directIpCache.time) < DIRECT_IP_TTL) return directIpCache.ip;
  const hit = await firstFulfilled(DIRECT_IP_URLS.map(u => probeUrl(u, false, now + timeout)));
  if (!hit) return directIpCache.ip; // fall back to the last known value
  const ip = extractIp(hit.body);
  if (!ip) return directIpCache.ip;
  directIpCache = { ip, time: now };
  return ip;
}

// Pull an IPv4 out of an IP-echo body. Some "alive" candidates actually answer
// with an HTML page (captive portal, interception); the old code took the first
// line verbatim, so stable-proxies.json ended up storing ip="<!doctype html>".
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function extractIp(body) {
  let ip = '';
  try {
    const parsed = JSON.parse(body);
    ip = (parsed && (parsed.ip || parsed.origin)) || '';
  } catch {
    ip = body.trim().split('\n')[0];
  }
  ip = String(ip).trim();
  return IPV4_RE.test(ip) ? ip : '';
}

async function testProxy(proxy, timeout = null) {
  const config = getMergedConfig();
  const testTimeout = timeout || config.proxyTestTimeout || 3000;
  const start = Date.now();
  const deadline = start + testTimeout;

  const agent = createAgent(proxy);
  if (!agent) {
    return { ...proxy, alive: false, latency: -1, error: 'no agent' };
  }

  try {
    // Race the test URLs instead of trying them one after another: previously a
    // slow/dead proxy could burn 3x the timeout (3 sequential URLs), which is what
    // made whole test runs crawl. The fastest 2xx response also gives the most
    // honest latency number.
    const hit = await firstFulfilled(TEST_URLS.map(url => probeUrl(url, agent, deadline)));
    if (!hit) {
      return { ...proxy, alive: false, latency: -1 };
    }

    // A body that is not an IP echo is not proof of a working proxy either:
    // interception pages and captive portals answer 2xx too.
    const ip = extractIp(hit.body);
    if (!ip) {
      return { ...proxy, alive: false, latency: -1, error: 'no ip in response' };
    }

    // Reject candidates that did not actually change the exit IP (see getDirectIp).
    const me = await getDirectIp();
    if (me && ip === me) {
      return { ...proxy, alive: false, latency: -1, transparent: true, ip, error: 'transparent (exit IP unchanged)' };
    }

    return { ...proxy, alive: true, latency: Date.now() - start, ip };
  } finally {
    // Each probe used to leak its agent (and any sockets it opened) — over a full
    // scan that is thousands of dangling sockets.
    try { agent.destroy(); } catch {}
  }
}

async function testProxyBatch(proxies, options = {}) {
  const config = getMergedConfig();
  const rawConcurrency = options.batchSize || options.concurrency || config.proxyTestBatchSize || 20;
  const concurrency = Math.max(1, Math.min(100, rawConcurrency));
  const onProgress = options.onProgress || (() => {});
  const onResult = options.onResult || (() => {});
  const progressInterval = options.progressMs === undefined ? 250 : options.progressMs;
  const total = proxies.length;

  let tested = 0;
  let aliveCount = 0;
  let pendingResults = [];
  let lastEmit = 0;

  const emit = (force) => {
    if (!force && Date.now() - lastEmit < progressInterval) return;
    lastEmit = Date.now();
    try { onProgress({ tested, total, results: pendingResults.splice(0), aliveCount }); } catch {}
  };

  logger.info(`ProxyCore: Starting to test ${total} proxies (concurrency: ${concurrency})`);
  const startTime = Date.now();

  // Worker pool rather than batch barriers: with batches, one proxy that eats the
  // full timeout holds up the whole batch even though every other slot is free.
  const all = await mapPool(proxies, concurrency, p => testProxy(p, options.timeout || null), (r) => {
    tested++;
    if (r && r.alive) aliveCount++;
    pendingResults.push(r);
    try { onResult(r); } catch {}
    emit(tested === total);
  });

  if (pendingResults.length) emit(true);

  const alive = all.filter(r => r.alive).sort((a, b) => a.latency - b.latency);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`ProxyCore: Testing complete, ${alive.length}/${total} alive in ${elapsedSec}s`);

  stats.recordBatch(all);

  return { all, alive };
}

// Sources measured (2026-10-11, 25 fresh samples each, counting only proxies that
// really change the exit IP): hideip-S4 92%, hideip-S5 56%, rdavydov-S4 40%,
// Anonym0us-S4 36%, monosans-S4 36%, roosterkid-S4 16%.
// The bulk lists sit near 0-1%, and they make up ~99% of the pool — so plain
// random sampling of N proxies almost never lands on a working one. Every test run
// therefore draws half of its candidates from these measured-good sources.
const HIGH_YIELD_SOURCES = new Set([
  'hideip-S4', 'hideip-S5', 'Anonym0us-S4', 'rdavydov-S4', 'roosterkid-S4', 'monosans-S4',
]);

// Stratified sample: ~half from measured high-yield sources, the rest uniformly
// random (so discovery of new good proxies still happens).
function sampleProxies(proxies, count) {
  if (!Array.isArray(proxies) || proxies.length <= count) return shuffleArray(proxies || []);
  const hi = [];
  const rest = [];
  for (const p of proxies) (HIGH_YIELD_SOURCES.has(p.source) ? hi : rest).push(p);
  const wanted = Math.ceil(count / 2);
  const fromHi = shuffleArray(hi).slice(0, wanted);
  const fromRest = shuffleArray(rest).slice(0, count - fromHi.length);
  return [...fromHi, ...fromRest];
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

  if (testInflight) return testInflight;

  testInflight = (async () => {
    try {
      const proxies = await getProxies();
      const shuffled = sampleProxies(proxies, count);
      const { alive } = await testProxyBatch(shuffled, { onProgress });
      testedProxiesCache = { alive, time: Date.now(), testing: false };
      return alive;
    } catch (e) {
      logger.error('ProxyCore: Failed to find best proxy: ' + e.message);
      testedProxiesCache = { ...testedProxiesCache, testing: false };
      return [];
    } finally {
      testInflight = null;
    }
  })();
  return testInflight;
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
  fetchInflight = null;
  testInflight = null;
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
  getDirectIp,
  sampleProxies,
  HIGH_YIELD_SOURCES,
};
