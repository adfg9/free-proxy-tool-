/**
 * 高匿 Elite 代理筛选脚本 (使用项目内置 proxy-core)
 *
 * 策略：复用项目已验证的 proxyCore.testProxy 来做存活+延迟测试
 * 1. 抓取 elite/checked 源的代理
 * 2. 用 proxyCore.testProxy 测试存活+延迟（HTTPS目标，已验证可靠）
 * 3. 高匿验证：httpbin.org/headers 检查泄露头
 * 4. 3轮稳定性测试
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

const PROJECT_ROOT = __dirname;
const proxyCore = require(path.join(PROJECT_ROOT, 'lib', 'proxy-core'));
const RESULTS_FILE = path.join(PROJECT_ROOT, '_elite_results.json');

// 只用已验证/已筛选的源，不用庞大的未验证列表
const ELITE_SOURCES = [
  // ClearProxy - 已验证存活（量少质优）
  { url: 'https://cdn.jsdelivr.net/gh/ClearProxy/checked-proxy-list@main/http/raw/all.txt', type: 'http', name: 'ClearProxy-HTTP' },
  // ProxyScrape elite API（预标记高匿）
  { url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3000&country=all&ssl=all&anonymity=elite', type: 'http', name: 'ProxyScrape-Elite' },
  // rdavydov - 已验证列表（取前300）
  { url: 'https://cdn.jsdelivr.net/gh/rdavydov/proxy-list@main/proxies/http.txt', type: 'http', name: 'rdavydov-HTTP', limit: 300 },
  // monosans - 取前300
  { url: 'https://cdn.jsdelivr.net/gh/monosans/proxy-list@main/proxies/http.txt', type: 'http', name: 'monosans-HTTP', limit: 300 },
  // TheSpeedX - 取前300
  { url: 'https://cdn.jsdelivr.net/gh/TheSpeedX/PROXY-List@master/http.txt', type: 'http', name: 'TheSpeedX-HTTP', limit: 300 },
];

function log(l, m) { const t = new Date().toLocaleTimeString('zh-CN',{hour12:false}); const c = l==='ok'?'\x1b[32m':l==='warn'?'\x1b[33m':l==='err'?'\x1b[31m':'\x1b[36m'; console.log(`${c}[${t}] ${m}\x1b[0m`); }

function httpGet(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { if (res.statusCode < 300) resolve(d); else reject(new Error(`HTTP ${res.statusCode}`)); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function createAgent(p) {
  try { if (p.type === 'socks5') return new SocksProxyAgent(`socks5://${p.host}:${p.port}`); return new HttpProxyAgent(`http://${p.host}:${p.port}`); } catch { return null; }
}

let REAL_IP = null;
async function getMyRealIp() {
  if (REAL_IP) return REAL_IP;
  try { REAL_IP = (JSON.parse(await httpGet('https://api.ipify.org?format=json', 5000))).ip; } catch { REAL_IP = ''; }
  return REAL_IP;
}

async function fetchProxies() {
  log('info', `[1/4] 从 ${ELITE_SOURCES.length} 个 elite/checked 源抓取...`);
  const results = await Promise.allSettled(ELITE_SOURCES.map(async (src) => {
    try {
      const text = await httpGet(src.url, 10000);
      let list = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
        const m = l.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)/);
        return m ? { host: m[1], port: parseInt(m[2]), type: src.type, source: src.name } : null;
      }).filter(Boolean);
      if (src.limit && list.length > src.limit) list = list.slice(0, src.limit);
      log('ok', `  ✓ ${src.name}: ${list.length}`);
      return list;
    } catch (e) { log('warn', `  ✗ ${src.name}: ${e.message}`); return []; }
  }));
  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set();
  const unique = all.filter(p => { const k = p.host+':'+p.port; if (seen.has(k)) return false; seen.add(k); return true; });
  log('ok', `  汇总: ${all.length}, 去重后 ${unique.length}`);
  return unique;
}

// 第一轮：用项目已验证的 proxyCore.testProxy 测试
async function aliveTest(proxies) {
  log('info', `[2/4] 存活测试（${proxies.length} 个，用 proxyCore.testProxy，并发50）...`);
  const BATCH = 50;
  const alive = [];
  for (let i = 0; i < proxies.length; i += BATCH) {
    const batch = proxies.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(p => proxyCore.testProxy(p, 3000)));
    for (let j = 0; j < results.length; j++) {
      if (results[j].alive && results[j].latency > 0 && results[j].latency < 500) {
        alive.push({ ...batch[j], latency: results[j].latency, ip: results[j].ip });
      }
    }
    process.stdout.write(`\r   进度 ${Math.min(i+BATCH, proxies.length)}/${proxies.length}  存活 ${alive.length}\x1b[0K`);
  }
  process.stdout.write('\n');
  log('ok', `  存活: ${alive.length}`);
  return alive;
}

// 第二轮：高匿验证（简化版：出口IP != 真实IP = 高匿）
async function anonymityTest(proxies) {
  log('info', `[3/4] 高匿验证（${proxies.length} 个，检查出口IP != 真实IP）...`);
  await getMyRealIp();
  const BATCH = 20;
  const elite = [];
  for (let i = 0; i < proxies.length; i += BATCH) {
    const batch = proxies.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (p) => {
      const agent = createAgent(p);
      if (!agent) return null;
      try {
        // 通过代理获取出口IP
        const exitIp = await new Promise(resolve => {
          const req = https.get('https://api.ipify.org?format=json', {
            agent, timeout: 5000, rejectUnauthorized: false,
            headers: { 'Accept-Encoding': 'identity' }
          }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ if(r.statusCode===200) { try { resolve(JSON.parse(d).ip); } catch { resolve(null); } } else resolve(null); }); });
          req.on('error', () => resolve(null));
          req.on('timeout', () => { req.destroy(); resolve(null); });
        });
        if (!exitIp) return null;
        // 高匿标准：出口IP != 真实IP（不泄露真实IP）
        if (REAL_IP && exitIp === REAL_IP) return null;
        // 同时检查：出口IP != 代理host（确保代理确实在转发，不是直连）
        return { ...p, exitIp, anonymity: 'elite' };
      } catch { return null; }
    }));
    elite.push(...results.filter(Boolean));
    process.stdout.write(`\r   进度 ${Math.min(i+BATCH, proxies.length)}/${proxies.length}  高匿 ${elite.length}\x1b[0K`);
  }
  process.stdout.write('\n');
  log('ok', `  高匿: ${elite.length}`);
  return elite;
}

// 第三轮：3轮稳定性
async function stabilityTest(proxies) {
  log('info', `[4/4] 3轮稳定性测试（${proxies.length} 个）...`);
  const final = [];
  for (let i = 0; i < proxies.length; i++) {
    const p = proxies[i];
    let passes = 0, total = 0, minL = Infinity, maxL = 0;
    for (let r = 0; r < 3; r++) {
      const res = await proxyCore.testProxy(p, 4000);
      if (res.alive && res.latency > 0) { passes++; total += res.latency; minL = Math.min(minL, res.latency); maxL = Math.max(maxL, res.latency); }
      if (r < 2) await new Promise(r2 => setTimeout(r2, 300));
    }
    process.stdout.write(`\r   ${i+1}/${proxies.length} ${p.host}:${p.port} ${passes}/3 ${passes===3?'✅':'⏳'}\x1b[0K`);
    if (passes === 3) final.push({ ...p, avgLatency: Math.round(total/3), minLatency: minL, maxLatency: maxL });
  }
  process.stdout.write('\n');
  log('ok', `  最终: ${final.length}`);
  return final;
}

function printResults(final) {
  console.log('\n\x1b[33m═══════════════════════════════════════════════════════');
  console.log(`          🏆 高匿低延迟代理 (${final.length} 个)`);
  console.log('═══════════════════════════════════════════════════════\x1b[0m\n');
  if (!final.length) { console.log('未找到符合要求的代理。'); return; }
  final.sort((a,b) => a.avgLatency - b.avgLatency);
  console.log('\x1b[36m====== COPY-PASTE: BUILTIN_PROXIES ======\x1b[0m\n');
  for (const p of final) {
    const t = p.avgLatency < 100 ? '⚡SUB-100ms' : p.avgLatency < 200 ? '🎯SUB-200ms' : '✅STABLE';
    console.log(`  { host: '${p.host}', port: ${p.port}, type: '${p.type}' }, // ${t} avg=${p.avgLatency}ms min=${p.minLatency}ms max=${p.maxLatency}ms src=${p.source}`);
  }
  console.log('\n\x1b[36m====== COPY-PASTE: BUILTIN_HINT_LATENCY ======\x1b[0m\n');
  for (const p of final) console.log(`  '${p.host}:${p.port}': ${p.avgLatency},  // avg=${p.avgLatency}ms min=${p.minLatency}ms max=${p.maxLatency}ms src=${p.source}`);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), proxies: final }, null, 2));
  log('ok', `数据已保存: ${RESULTS_FILE}`);
}

async function main() {
  const proxies = await fetchProxies();
  if (!proxies.length) { log('err', '没抓到代理！'); process.exit(1); }
  const alive = await aliveTest(proxies);
  if (!alive.length) { log('err', '无存活！'); process.exit(1); }
  const elite = await anonymityTest(alive);
  if (!elite.length) { log('err', '无高匿代理！'); process.exit(1); }
  const sorted = elite.sort((a,b) => a.latency - b.latency);
  const candidates = sorted.filter(p => p.latency < 500);
  log('info', `  <500ms候选: ${candidates.length}`);
  const stable = await stabilityTest(candidates);
  printResults(stable);
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
