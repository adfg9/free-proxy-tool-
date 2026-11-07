
const API_BASE = '';
let ws = null;
let stableProxies = [];
let allProxies = [];
let currentFilter = 'all';
let currentSort = 'latency';
let editingApp = null;
let activityLog = [];

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
  initWebSocket();
  loadStatus();
  loadStableProxies();
  loadQuote();
  loadDiagnostics();
  loadConfig();
  loadApps();
  loadLogs();
  updateFooterTime();
  setInterval(updateFooterTime, 1000);
  setInterval(loadStatus, 10000);
});

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeSelect').value = saved;
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeToggle');
  if (theme === 'dark') icon.textContent = '☀️';
  else if (theme === 'light') icon.textContent = '🌙';
  else icon.textContent = '👾';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const themes = ['dark', 'light', 'pixel'];
  const idx = themes.indexOf(current);
  const next = themes[(idx + 1) % themes.length];
  changeTheme(next);
});

function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.getElementById('themeSelect').value = theme;
  updateThemeIcon(theme);
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  document.getElementById('tab-' + tabName).style.display = 'block';
  if (tabName === 'stats') {
    loadStats();
    loadHistory();
    setTimeout(drawCharts, 100);
  }
  if (tabName === 'logs') loadLogs();
  if (tabName === 'settings') loadDiagnostics();
  if (tabName === 'warp') refreshWarpStatus();
}

function initWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}`;
  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = handleWebSocketMessage;
    ws.onclose = () => {
      console.log('WebSocket closed, reconnecting...');
      setTimeout(initWebSocket, 3000);
    };
    ws.onerror = (e) => console.log('WebSocket error');
  } catch (e) {
    console.log('WebSocket init failed', e);
  }
}

let _wsThrottleTimer = null;
let _wsPendingData = null;
function handleWebSocketMessage(event) {
  try {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case 'init':
        updateServerStatus(data.server.running, data.server.port);
        updateWarpStatusUI(data.warp.installed, data.warp.connected);
        break;
      case 'free-proxy-update':
        toast('info', `Proxy cache updated: ' + data.count + ' proxies');
        break;
      case 'test-progress':
        handleTestProgress(data);
        break;
      case 'test-complete':
        handleTestComplete(data);
        break;
      case 'auto-find-stage':
        handleAutoFindStage(data);
        break;
      case 'auto-find-progress':
        handleAutoFindProgress(data);
        break;
      case 'auto-find-complete':
        handleAutoFindComplete(data);
        break;
      case 'disconnect-all':
        toast('warn', _t('allDisconnected'));
        loadStatus();
        break;
    }
  } catch (e) {
    console.error('WS parse error', e);
  }
}

async function apiCall(path, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    return data;
  } catch (e) {
    toast('err', _t('apiError', e.message));
    throw e;
  }
}

async function loadStatus() {
  try {
    const data = await apiCall('/api/status');
    updateServerStatus(data.server.running, data.server.port);
    updateWarpStatusUI(data.warp.installed, data.warp.connected);
    updateSystemProxyUI(data.systemProxy);
    updateDashboardStats(data.stats);
  } catch (e) {}
}

function updateServerStatus(running, port) {
  const badge = document.getElementById('serverBadge');
  const statusBadge = document.getElementById('serverStatusBadge');
  const text = document.getElementById('serverStatusText');
  const portText = document.getElementById('serverPortText');
  const startBtn = document.getElementById('startServerBtn');
  const stopBtn = document.getElementById('stopServerBtn');
  const dashStatus = document.getElementById('dashServerStatus');
  const dashPort = document.getElementById('dashPort');
  const ring = document.getElementById('serverOrbitRing');
  const center = document.getElementById('serverOrbitCenter');
  const ball = document.getElementById('serverOrbitBall');

  if (running) {
    badge.className = 'badge badge-ok';
    badge.textContent = _t('serverOn');
    statusBadge.className = 'badge badge-ok';
    statusBadge.textContent = _t('serverRunning');
    text.textContent = _t('statusRunning');
    portText.textContent = _t('portLabel') + ': ' + port;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-flex';
    dashStatus.textContent = _t('on');
    dashPort.textContent = port;
    ring.className = 'orbit-ring active';
    center.className = 'orbit-center success';
    ball.className = 'orbit-ball success';
  } else {
    badge.className = 'badge badge-err';
    badge.textContent = _t('serverOff');
    statusBadge.className = 'badge badge-err';
    statusBadge.textContent = _t('stopped');
    text.textContent = _t('statusStopped');
    portText.textContent = _t('portLabel') + ': -';
    startBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'none';
    dashStatus.textContent = _t('off');
    dashPort.textContent = '-';
    ring.className = 'orbit-ring error';
    center.className = 'orbit-center error';
    ball.className = 'orbit-ball';
  }
  updateOrbitAnimation();
}

function updateWarpStatusUI(installed, connected) {
  const badge = document.getElementById('warpBadge');
  const statusBadge = document.getElementById('warpStatusBadge');
  const installedEl = document.getElementById('warpInstalled');
  const connectBtn = document.getElementById('warpConnectBtn');
  const disconnectBtn = document.getElementById('warpDisconnectBtn');
  const dashStatus = document.getElementById('dashWarpStatus');
  const ring = document.getElementById('warpOrbitRing');
  const center = document.getElementById('warpOrbitCenter');
  const ball = document.getElementById('warpOrbitBall');

  if (installed) {
    installedEl.className = 'badge badge-ok';
    installedEl.textContent = '✓ ' + _t('warpInstalled');
  } else {
    installedEl.className = 'badge badge-err';
    installedEl.textContent = '✗ ' + _t('warpNotInstalled');
  }

  if (connected) {
    badge.className = 'badge badge-ok';
    badge.textContent = _t('warpOn');
    statusBadge.className = 'badge badge-ok';
    statusBadge.textContent = _t('warpConnected');
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'inline-flex';
    dashStatus.textContent = _t('on');
    ring.className = 'orbit-ring active';
    center.className = 'orbit-center success';
    ball.className = 'orbit-ball success';
  } else {
    badge.className = 'badge badge-err';
    badge.textContent = _t('warpOff');
    statusBadge.className = 'badge badge-err';
    statusBadge.textContent = _t('warpDisconnected');
    connectBtn.style.display = 'inline-flex';
    disconnectBtn.style.display = 'none';
    dashStatus.textContent = _t('off');
    ring.className = 'orbit-ring error';
    center.className = 'orbit-center error';
    ball.className = 'orbit-ball';
  }
}

function updateSystemProxyUI(info) {
  const badge = document.getElementById('sysProxyBadge');
  const toggle = document.getElementById('sysProxyToggle');
  const dash = document.getElementById('dashSysProxy');
  if (info.enabled) {
    badge.className = 'badge badge-ok';
    badge.textContent = _t('sysProxyEnabled');
    toggle.checked = true;
    dash.textContent = _t('on');
  } else {
    badge.className = 'badge badge-err';
    badge.textContent = _t('sysProxyDisabled');
    toggle.checked = false;
    dash.textContent = _t('off');
  }
}

function updateDashboardStats(stats) {
  document.getElementById('dashProxiesTested').textContent = stats.totalTests || 0;
  document.getElementById('dashAliveCount').textContent = stats.aliveCount || 0;
  document.getElementById('dashAvgLatency').textContent = (stats.avgLatency || 0) + 'ms';
  document.getElementById('dashStableCount').textContent = stats.stableCount || 0;

  const diagBadge = document.getElementById('diagBadge');
  diagBadge.className = 'badge badge-ok';
  diagBadge.textContent = _t('systemOk');
}

function updateOrbitAnimation() {
  const balls = document.querySelectorAll('.orbit-ball');
  balls.forEach((ball, i) => {
    ball.classList.remove('spinning', 'spinning-reverse');
    void ball.offsetWidth;
    ball.classList.add(i % 2 === 0 ? 'spinning' : 'spinning-reverse');
  });
}

async function startServer() {
  const port = parseInt(document.getElementById('serverPortInput').value) || 1080;
  try {
    toast('info', _t('serverStarted', '...'));
    const data = await apiCall('/api/server/start', 'POST', { port });
    if (data.running) {
      toast('ok', _t('serverStarted', data.port));
      addActivity('success', _t('proxyServerStartedActivity'), _t('startedOnPortActivity', data.port));
      updateServerStatus(true, data.port);
    } else {
      toast('err', _t('serverStartFailed', data.error || 'Unknown error'));
    }
  } catch (e) {}
}

async function stopServer() {
  try {
    toast('info', _t('serverStopped'));
    const data = await apiCall('/api/server/stop', 'POST');
    toast('ok', _t('serverStopped'));
    addActivity('info', _t('proxyServerStoppedActivity'), _t('serverStoppedActivity'));
    updateServerStatus(false, 0);
  } catch (e) {}
}

async function setUpstreamProxy() {
  const proxy = document.getElementById('upstreamProxy').value.trim();
  if (!proxy) {
    toast('warn', _t('upstreamUrlRequired'));
    return;
  }
  try {
    toast('info', _t('upstreamSet', '...', '...'));
    const data = await apiCall('/api/server/set-upstream', 'POST', { proxy });
    if (data.running) {
      toast('ok', _t('upstreamSet', data.upstream.host, data.upstream.port));
      addActivity('info', _t('upstreamProxySetActivity'), proxy);
    } else {
      toast('err', data.error || _t('upstreamSet'));
    }
  } catch (e) {}
}

async function connectWarp() {
  try {
    toast('info', _t('warpConnected'));
    const data = await apiCall('/api/warp/connect', 'POST');
    if (data.connected) {
      toast('ok', _t('warpConnected'));
      addActivity('success', _t('warpConnectedActivity'), _t('warpConnectionEstablished'));
    } else {
      toast('err', _t('warpConnectFailed'));
    }
    loadStatus();
    refreshWarpStatus();
  } catch (e) {}
}

async function disconnectWarp() {
  try {
    toast('info', _t('warpDisconnected'));
    await apiCall('/api/warp/disconnect', 'POST');
    toast('ok', _t('warpDisconnected'));
    addActivity('info', _t('warpDisconnectedActivity'), _t('vpnDisconnected'));
    loadStatus();
    refreshWarpStatus();
  } catch (e) {}
}

async function registerWarp() {
  try {
    toast('info', _t('warpRegistered'));
    const data = await apiCall('/api/warp/register', 'POST');
    if (data.success) {
      toast('ok', _t('warpRegistered'));
    } else {
      toast('err', _t('warpRegisterFailed', data.raw || 'Unknown error'));
    }
    refreshWarpStatus();
  } catch (e) {}
}

async function refreshWarpStatus() {
  try {
    const data = await apiCall('/api/status');
    document.getElementById('warpRawStatus').textContent = data.warp.raw || _t('noStatusData');
    updateWarpStatusUI(data.warp.installed, data.warp.connected);
  } catch (e) {}
}

async function toggleSystemProxy() {
  const enable = document.getElementById('sysProxyToggle').checked;
  try {
    const data = await apiCall('/api/proxy/system', 'POST', { enable });
    if (data.success) {
      toast('ok', enable ? _t('sysProxyEnabledMsg') : _t('sysProxyDisabledMsg'));
      addActivity(enable ? 'success' : 'info', _t('systemProxyActivity'), enable ? _t('sysProxyEnabled') : _t('sysProxyDisabled'));
    } else {
      toast('err', _t('sysProxyFailed'));
      document.getElementById('sysProxyToggle').checked = !enable;
    }
    updateSystemProxyUI(data);
  } catch (e) {
    document.getElementById('sysProxyToggle').checked = !enable;
  }
}

async function copyPacUrl() {
  try {
    const data = await apiCall('/api/proxy/pac');
    navigator.clipboard.writeText(data.url);
    toast('ok', _t('pacUrlCopied'));
  } catch (e) {}
}

async function loadPacUrl() {
  try {
    const data = await apiCall('/api/proxy/pac');
    document.getElementById('pacUrlDisplay').textContent = data.url + '\n\n' + data.content;
  } catch (e) {}
}

async function disconnectAll() {
  if (!confirm(_t('disconnectAllConfirm'))) return;
  try {
    toast('info', _t('allDisconnected'));
    await apiCall('/api/proxy/disconnect-all', 'POST');
    toast('ok', _t('allDisconnected'));
    addActivity('warn', _t('disconnectAllActivity'), _t('allConnectionsTerminated'));
    loadStatus();
  } catch (e) {}
}

document.getElementById('disconnectAllBtn').addEventListener('click', disconnectAll);

async function loadStableProxies() {
  try {
    const data = await apiCall('/api/proxy/stable');
    stableProxies = data.proxies || [];
    allProxies = stableProxies;
    renderProxyTable();
    renderTopProxies();
    updateSpStats();
  } catch (e) {}
}

function updateSpStats() {
  const alive = stableProxies.filter(p => p.latency > 0 || p.alive);
  const builtin = stableProxies.filter(p => p.builtin);
  const best = stableProxies.filter(p => p.latency > 0).sort((a, b) => a.latency - b.latency)[0];
  document.getElementById('spTotal').textContent = stableProxies.length;
  document.getElementById('spAlive').textContent = alive.length;
  document.getElementById('spLatency').textContent = best ? best.latency + 'ms' : '0ms';
  document.getElementById('spBuiltin').textContent = builtin.length;
}

function getGrade(latency) {
  if (!latency || latency <= 0) return 'D';
  if (latency < 150) return 'S';
  if (latency < 300) return 'A';
  if (latency < 500) return 'B';
  if (latency < 800) return 'C';
  return 'D';
}

let _proxyTableTimer = null;
function renderProxyTable() {
  if (_proxyTableTimer) clearTimeout(_proxyTableTimer);
  _proxyTableTimer = setTimeout(() => _doRenderProxyTable(), 50);
}
function _doRenderProxyTable() {
  const tbody = document.getElementById('proxyTableBody');
  const filter = document.getElementById('proxyFilter').value.toLowerCase();
  let filtered = allProxies.filter(p => {
    if (currentFilter !== 'all' && (p.type || '').toLowerCase() !== currentFilter) return false;
    if (filter && !p.host.toLowerCase().includes(filter) && !(p.ip || '').toLowerCase().includes(filter)) return false;
    return true;
  });

  if (currentSort === 'latency') {
    filtered.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
  } else if (currentSort === 'tests') {
    filtered.sort((a, b) => (b.tests || 0) - (a.tests || 0));
  } else if (currentSort === 'host') {
    filtered.sort((a, b) => a.host.localeCompare(b.host));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted"><span data-i18n="noProxiesFound">No proxies found</span></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((p, i) => {
    const grade = getGrade(p.latency);
    const latencyColor = p.latency > 0 && p.latency < 300 ? 'var(--success)' :
                         p.latency > 0 && p.latency < 600 ? 'var(--warning)' :
                         p.latency > 0 ? 'var(--danger)' : 'var(--text2)';
    const latencyPct = p.latency > 0 ? Math.min(100, (1000 - p.latency) / 10) : 0;
    return `
      <tr>
        <td><span class="sp-grade sp-grade-${grade}">${grade}</span></td>
        <td class="mono">${p.host}${p.builtin ? '<span class="sp-builtin-tag">' + _t('builtInTag') + '</span>' : ''}</td>
        <td>${p.port}</td>
        <td><span class="badge badge-ok" style="font-size:10px;">${(p.type || 'socks5').toUpperCase()}</span></td>
        <td>
          <span style="color:${latencyColor};font-weight:600;">${p.latency > 0 ? p.latency + 'ms' : _t('noData')}</span>
          <span class="sp-latency-bar"><span class="sp-latency-bar-fill" style="width:${latencyPct}%;background:${latencyColor};"></span></span>
        </td>
        <td>${p.tests || 0}</td>
        <td class="text-muted text-sm">${p.source || _t('unknown')}</td>
        <td>
          <div class="flex gap-8">
            <button class="btn btn-outline btn-sm" onclick="testOneProxy('${p.host}', ${p.port}, '${p.type || 'socks5'}')">🧪 ${_t('testBtn')}</button>
            <button class="btn btn-outline btn-sm" onclick="launchAppWithProxy('${p.host}', ${p.port}, '${p.type || 'socks5'}')">🚀 ${_t('launchBtn')}</button>
            ${!p.builtin ? `<button class="btn btn-danger btn-sm" onclick="removeProxy('${p.host}', ${p.port})">🗑</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
}

function filterProxies() {
  renderProxyTable();
}

function filterByType(type, el) {
  currentFilter = type;
  document.querySelectorAll('.sp-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderProxyTable();
}

function sortProxies() {
  currentSort = document.getElementById('proxySort').value;
  renderProxyTable();
}

let _topProxyTimer = null;
function renderTopProxies() {
  if (_topProxyTimer) clearTimeout(_topProxyTimer);
  _topProxyTimer = setTimeout(() => _doRenderTopProxies(), 50);
}
function _doRenderTopProxies() {
  const list = document.getElementById('topProxiesList');
  const top = stableProxies.filter(p => p.latency > 0).sort((a, b) => a.latency - b.latency).slice(0, 5);
  if (top.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text" data-i18n="noStableProxiesYet">No stable proxies yet. Run Auto-Find to discover proxies.</div>
      </div>
    `;
    return;
  }
  list.innerHTML = top.map((p, i) => {
    const rank = i + 1;
    const medalClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const scorePct = Math.max(0, Math.min(100, (1000 - p.latency) / 10));
    const barColor = p.latency < 200 ? 'var(--success)' : p.latency < 500 ? 'var(--warning)' : 'var(--danger)';
    return `
      <div class="ranking-item rank-${rank <= 3 ? rank : ''}">
        <div class="ranking-medal ${medalClass}">${medal}</div>
        <div class="ranking-info">
          <div class="ranking-header">
            <span class="ranking-host">${p.host}:${p.port}</span>
            <span class="ranking-type">${(p.type || 'socks5').toUpperCase()}</span>
          </div>
          <div class="ranking-stats">
            <div class="ranking-stat">
              <span class="ranking-stat-label" data-i18n="rankLatency">Latency</span>
              <span class="ranking-stat-value">${p.latency}ms</span>
            </div>
            <div class="ranking-stat">
              <span class="ranking-stat-label" data-i18n="rankTests">Tests</span>
              <span class="ranking-stat-value">${p.tests || 0}</span>
            </div>
          </div>
          <div class="ranking-bar">
            <div class="ranking-bar-fill" style="width: ${scorePct}%; background: ${barColor};"></div>
          </div>
        </div>
        <div class="ranking-actions">
          <button class="btn btn-outline btn-sm" onclick="testOneProxy('${p.host}', ${p.port}, '${p.type || 'socks5'}')">Test</button>
        </div>
      </div>
    `;
  }).join('');
}

async function testSingleProxy() {
  const host = document.getElementById('testHost').value.trim();
  const port = parseInt(document.getElementById('testPort').value);
  const type = document.getElementById('testType').value;
  if (!host || !port) {
    toast('warn', _t('enterHostPort'));
    return;
  }
  await testOneProxy(host, port, type);
}

async function testOneProxy(host, port, type) {
  try {
    toast('info', _t('testingHostPort', host, port));
    const result = await apiCall('/api/proxy/test', 'POST', { host, port, type });
    const resultEl = document.getElementById('testResult');
    resultEl.style.display = 'block';
    if (result.alive) {
      resultEl.innerHTML = `
        <div class="card" style="padding: 12px; border-color: var(--success);">
          <div class="flex items-center justify-between">
            <span class="speed-score fast">✅ ${_t('aliveLabel')} - ${result.latency}ms</span>
            <span class="text-muted mono text-sm">IP: ${result.ip || _t('noData')}</span>
          </div>
        </div>
      `;
      toast('ok', _t('proxyAliveToast', result.latency));
    } else {
      resultEl.innerHTML = `
        <div class="card" style="padding: 12px; border-color: var(--danger);">
          <span class="speed-score slow">❌ ${_t('failedText')} - ${_t('noResponse')}</span>
        </div>
      `;
      toast('err', _t('proxyTestFailed'));
    }
    addActivity(result.alive ? 'success' : 'error', _t('proxyTestActivity'), `${host}:${port} - ${result.alive ? result.latency + 'ms' : _t('failedText')}`);
    loadStableProxies();
  } catch (e) {}
}

async function testAllProxies() {
  try {
    toast('info', _t('startingBatchTest'));
    const max = parseInt(document.getElementById('proxyTestCount').value) || 30;
    await apiCall('/api/proxy/test-all-free', 'POST', { max });
    addActivity('info', _t('batchTestActivity'), _t('testingUpToActivity', max));
  } catch (e) {}
}

function handleTestProgress(data) {
  const progress = document.getElementById('autoFindProgress');
  progress.style.display = 'flex';
  document.getElementById('autoFindStage').textContent = _t('testingProxiesStage');
  document.getElementById('autoFindCount').textContent = `${data.tested} / ${data.total}`;
  document.getElementById('autoFindBar').style.width = `${(data.tested / data.total) * 100}%`;
  document.getElementById('autoFindDetail').textContent = _t('testingBatchDetail', data.tested, data.total);
}

function handleTestComplete(data) {
  toast('ok', _t('testCompleteAlive', data.alive.length));
  addActivity('success', _t('testCompleteActivity'), _t('aliveProxiesFound', data.alive.length));
  setTimeout(() => {
    document.getElementById('autoFindProgress').style.display = 'none';
  }, 2000);
  loadStableProxies();
  loadStats();
}

async function startAutoFind() {
  try {
    toast('info', _t('startingAutoFind'));
    document.getElementById('autoFindProgress').style.display = 'flex';
    const max = parseInt(document.getElementById('proxyTestCount').value) || 80;
    await apiCall('/api/proxy/auto-find', 'POST', { max, maxLatency: 800, rounds: 1 });
    addActivity('info', _t('autoFindActivity'), _t('startedWithProxies', max));
  } catch (e) {
    if (e.message && e.message.includes('409')) {
      toast('warn', _t('autoFindInProgress'));
    }
  }
}

function handleAutoFindStage(data) {
  document.getElementById('autoFindStage').textContent = data.message || 'Processing...';
  document.getElementById('autoFindDetail').textContent = `Stage: ${data.stage || 'unknown'}`;
}

function handleAutoFindProgress(data) {
  const progress = document.getElementById('autoFindProgress');
  progress.style.display = 'flex';
  document.getElementById('autoFindCount').textContent = `${data.tested} / ${data.total} (${data.alive} alive)`;
  document.getElementById('autoFindBar').style.width = `${(data.tested / data.total) * 100}%`;
  document.getElementById('autoFindDetail').textContent = `${data.alive} alive so far - ${data.current ? 'Last: ' + data.current.host : ''}`;
}

function handleAutoFindComplete(data) {
  if (data.error) {
    toast('err', _t('autoFindFailed', data.error));
  } else {
    toast('ok', _t('autoFindCompleteToast', data.found, data.total));
    addActivity('success', _t('autoFindCompleteActivity'), _t('newProxiesFound', data.found, data.total));
  }
  setTimeout(() => {
    document.getElementById('autoFindProgress').style.display = 'none';
  }, 3000);
  loadStableProxies();
  loadStats();
}

async function fetchFreeProxies() {
  try {
    toast('info', _t('fetchingProxyList'));
    const data = await apiCall('/api/proxy/fetch-free');
    allProxies = data.proxies || [];
    renderProxyTable();
    toast('ok', _t('fetchedProxies', data.count));
    addActivity('info', _t('fetchProxiesActivity'), _t('proxiesFetchedActivity', data.count));
  } catch (e) {}
}

async function addManualProxy() {
  const host = document.getElementById('addHost').value.trim();
  const port = parseInt(document.getElementById('addPort').value);
  const type = document.getElementById('addType').value;
  if (!host || !port) {
    toast('warn', _t('enterHostPort'));
    return;
  }
  try {
    const data = await apiCall('/api/proxy/stable/add', 'POST', { host, port, type });
    if (data.success) {
      toast('ok', _t('proxyAddedPool'));
      addActivity('success', _t('addProxyActivity'), `${host}:${port}`);
      document.getElementById('addHost').value = '';
      document.getElementById('addPort').value = '';
      loadStableProxies();
    } else {
      toast('err', data.error || _t('failedAddProxy'));
    }
  } catch (e) {}
}

async function removeProxy(host, port) {
  if (!confirm(_t('removeProxyConfirm', host, port))) return;
  try {
    const data = await apiCall('/api/proxy/stable/remove', 'POST', { host, port });
    if (data.success) {
      toast('ok', _t('proxyRemoved'));
      addActivity('info', _t('removeProxyActivity'), `${host}:${port}`);
      loadStableProxies();
    } else {
      toast('err', data.error || _t('failedRemoveProxy'));
    }
  } catch (e) {}
}

function launchAppWithProxy(host, port, type) {
  toast('info', _t('useAppProxyTab'));
  switchTab('apps');
}

async function loadStats() {
  try {
    const data = await apiCall('/api/stats');
    document.getElementById('statTotalTests').textContent = data.totalTests || 0;
    document.getElementById('statSuccessRate').textContent = data.totalTests > 0
      ? Math.round((data.aliveCount / data.totalTests) * 100) + '%'
      : '0%';
    document.getElementById('statAvgLatency').textContent = (data.avgLatency || 0) + 'ms';
    document.getElementById('statBestLatency').textContent = (data.bestLatency || 0) + 'ms';
  } catch (e) {}
}

async function loadHistory() {
  try {
    const data = await apiCall('/api/history');
    const tbody = document.getElementById('historyTableBody');
    const tests = data.tests || [];
    if (tests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" data-i18n="noTestHistory">No test history yet</td></tr>';
      return;
    }
    tbody.innerHTML = tests.slice(0, 50).map(t => {
      const time = t.time ? new Date(t.time).toLocaleString() : '-';
      const status = t.alive
        ? '<span class="badge badge-ok" style="font-size:10px;">' + _t('aliveLabel') + '</span>'
        : '<span class="badge badge-err" style="font-size:10px;">' + _t('failedText') + '</span>';
      return `
        <tr>
          <td class="text-sm mono">${time}</td>
          <td class="mono">${t.host}</td>
          <td>${t.port}</td>
          <td><span class="text-muted text-sm">${(t.type || 'socks5').toUpperCase()}</span></td>
          <td>${status}</td>
          <td style="font-weight:600; color:${t.alive ? 'var(--success)' : 'var(--danger)'}">${t.latency > 0 ? t.latency + 'ms' : '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {}
}

async function clearStats() {
  if (!confirm(_t('clearStatsConfirm'))) return;
  try {
    await apiCall('/api/stats/clear', 'POST');
    toast('ok', _t('statsCleared'));
    loadStats();
    loadHistory();
  } catch (e) {}
}

function drawCharts() {
  drawLatencyChart();
  drawTypeChart();
}

function drawLatencyChart() {
  const canvas = document.getElementById('latencyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const latencies = stableProxies.filter(p => p.latency > 0).map(p => p.latency).sort((a, b) => a - b);
  if (latencies.length === 0) {
    ctx.fillStyle = 'var(--text2)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No latency data available', w / 2, h / 2);
    return;
  }

  const buckets = [
    { label: '<200ms', min: 0, max: 200, count: 0, color: '#107C10' },
    { label: '200-400', min: 200, max: 400, count: 0, color: '#0078D7' },
    { label: '400-600', min: 400, max: 600, count: 0, color: '#FF8C00' },
    { label: '600-800', min: 600, max: 800, count: 0, color: '#FF8C00' },
    { label: '>800ms', min: 800, max: Infinity, count: 0, color: '#D13438' },
  ];

  latencies.forEach(l => {
    for (const b of buckets) {
      if (l >= b.min && l < b.max) { b.count++; break; }
    }
  });

  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const chartW = w - 40;
  const chartH = h - 40;
  const barW = chartW / buckets.length * 0.6;
  const gap = chartW / buckets.length * 0.4;

  buckets.forEach((b, i) => {
    const x = 30 + i * (barW + gap) + gap / 2;
    const barH = (b.count / maxCount) * chartH;
    const y = h - 20 - barH;
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = 'var(--text2)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, x + barW / 2, h - 5);
    ctx.fillStyle = 'var(--text)';
    ctx.fillText(b.count, x + barW / 2, y - 4);
  });
}

function drawTypeChart() {
  const canvas = document.getElementById('typeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const types = {};
  stableProxies.forEach(p => {
    const t = (p.type || 'socks5').toLowerCase();
    types[t] = (types[t] || 0) + 1;
  });

  const entries = Object.entries(types);
  if (entries.length === 0) {
    ctx.fillStyle = 'var(--text2)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No type data available', w / 2, h / 2);
    return;
  }

  const colors = { socks5: '#0078D7', http: '#107C10', socks4: '#FF8C00' };
  const total = entries.reduce((s, [, c]) => s + c, 0);
  const centerX = w / 2;
  const centerY = h / 2;
  const radius = Math.min(w, h) / 2 - 30;
  let startAngle = -Math.PI / 2;

  entries.forEach(([type, count]) => {
    const slice = (count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[type] || '#5C2D91';
    ctx.fill();
    startAngle += slice;
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim() || '#2d2d2d';
  ctx.fill();

  let legendY = 20;
  entries.forEach(([type, count]) => {
    const pct = Math.round((count / total) * 100);
    ctx.fillStyle = colors[type] || '#5C2D91';
    ctx.fillRect(w - 100, legendY, 12, 12);
    ctx.fillStyle = 'var(--text)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${type.toUpperCase()} (${pct}%)`, w - 82, legendY + 10);
    legendY += 20;
  });
}

async function loadApps() {
  try {
    const data = await apiCall('/api/proxy/apps');
    const apps = data.apps || [];
    const grid = document.getElementById('appGrid');
    if (apps.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📱</div>
          <div class="empty-state-text">No apps configured. Click "Add App" to get started.</div>
        </div>
      `;
      return;
    }
    grid.innerHTML = apps.map(app => `
      <div class="app-card">
        <div class="app-icon">📱</div>
        <div class="app-name">${app.name}</div>
        <div class="app-path" title="${app.path}">${app.path}</div>
        <div class="text-sm text-muted">Mode: ${app.mode || 'http'}</div>
        <div class="app-actions">
          <button class="btn btn-primary btn-sm" onclick="launchApp('${app.name}')">🚀 Launch</button>
          <button class="btn btn-outline btn-sm" onclick="editApp('${app.name}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="removeApp('${app.name}')">🗑</button>
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

function showAddAppModal() {
  editingApp = null;
  document.getElementById('appModalTitle').textContent = 'Add App';
  document.getElementById('appNameInput').value = '';
  document.getElementById('appPathInput').value = '';
  document.getElementById('appModeSelect').value = 'http';
  document.getElementById('appProcessInput').value = '';
  document.getElementById('appModal').classList.add('show');
}

function closeAppModal() {
  document.getElementById('appModal').classList.remove('show');
}

async function editApp(name) {
  try {
    const data = await apiCall('/api/proxy/apps');
    const app = (data.apps || []).find(a => a.name === name);
    if (!app) return;
    editingApp = name;
    document.getElementById('appModalTitle').textContent = 'Edit App';
    document.getElementById('appNameInput').value = app.name;
    document.getElementById('appPathInput').value = app.path;
    document.getElementById('appModeSelect').value = app.mode || 'http';
    document.getElementById('appProcessInput').value = app.process || '';
    document.getElementById('appModal').classList.add('show');
  } catch (e) {}
}

async function saveApp() {
  const name = document.getElementById('appNameInput').value.trim();
  const path = document.getElementById('appPathInput').value.trim();
  const mode = document.getElementById('appModeSelect').value;
  const process = document.getElementById('appProcessInput').value.trim();
  if (!name || !path) {
    toast('warn', _t('enterAppNamePath'));
    return;
  }
  try {
    let data;
    if (editingApp) {
      data = await apiCall('/api/proxy/apps/edit', 'POST', { oldName: editingApp, name, path, mode, process });
    } else {
      data = await apiCall('/api/proxy/apps', 'POST', { name, path, mode, process });
    }
    if (data.success) {
      toast('ok', _t('appUpdatedAdded', editingApp ? _t('edit') : _t('add'), name));
      addActivity('success', editingApp ? 'Edit App' : 'Add App', name);
      closeAppModal();
      loadApps();
    } else {
      toast('err', data.error || _t('failedSaveApp'));
    }
  } catch (e) {}
}

async function removeApp(name) {
  if (!confirm(_t('removeAppConfirm', name))) return;
  try {
    const data = await apiCall('/api/proxy/apps/remove', 'POST', { name });
    if (data.success) {
      toast('ok', _t('appRemoved'));
      addActivity('info', _t('removeAppActivity'), name);
      loadApps();
    } else {
      toast('err', data.error || _t('failedRemoveProxy'));
    }
  } catch (e) {}
}

async function launchApp(name) {
  try {
    toast('info', _t('launchingApp', name));
    const data = await apiCall('/api/proxy/apps/launch', 'POST', { name });
    if (data.success) {
      toast('ok', data.message || _t('appLaunchedMsg'));
      addActivity('success', _t('launchAppActivity'), name);
    } else {
      toast('err', data.error || _t('failedLaunchApp'));
    }
  } catch (e) {}
}

async function browseApp() {
  try {
    const data = await apiCall('/api/proxy/apps/browse', 'POST');
    if (data.path) {
      document.getElementById('appPathInput').value = data.path;
    }
  } catch (e) {}
}

async function loadAppPresets() {
  try {
    const data = await apiCall('/api/proxy/apps/presets');
    const presets = data.presets || [];
    const container = document.getElementById('presetList');
    const presetsDiv = document.getElementById('appPresets');
    presetsDiv.style.display = 'block';
    if (presets.length === 0) {
      container.innerHTML = '<span class="text-muted text-sm" data-i18n="noPresetsDetected">No presets detected</span>';
      return;
    }
    container.innerHTML = presets.map(p => `
      <button class="preset-chip" onclick="addPresetApp('${p.name.replace(/'/g, "\\'")}', '${p.path.replace(/'/g, "\\'")}')">
        ${p.icon || '📱'} ${p.name}
      </button>
    `).join('');
  } catch (e) {}
}

async function addPresetApp(name, path) {
  try {
    const data = await apiCall('/api/proxy/apps', 'POST', { name, path, mode: 'http' });
    if (data.success) {
      toast('ok', _t('addedPreset', name));
      loadApps();
    } else if (data.error && data.error.includes('already exists')) {
      toast('warn', _t('alreadyExists', name));
    } else {
      toast('err', data.error || _t('failedAddPreset'));
    }
  } catch (e) {}
}

async function loadLogs() {
  try {
    const data = await apiCall('/api/logs?limit=200');
    const logs = data.logs || [];
    const box = document.getElementById('logBox');
    if (logs.length === 0) {
      box.innerHTML = '<div class="text-muted" data-i18n="noLogsAvailable">No logs available</div>';
      return;
    }
    box.innerHTML = logs.map(l => {
      const time = l.time ? new Date(l.time).toLocaleTimeString() : '';
      let cls = 'log-info';
      if (l.level === 'error' || l.level === 'err') cls = 'log-err';
      else if (l.level === 'warn' || l.level === 'warning') cls = 'log-warn';
      else if (l.level === 'success' || l.level === 'ok') cls = 'log-ok';
      else if (l.level === 'info') cls = 'log-info';
      return `<div class="${cls}"><span class="text-muted">[${time}]</span> ${l.message || l.msg || ''}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  } catch (e) {}
}

function filterLogs() {
  loadLogs();
}

async function clearLogs() {
  if (!confirm(_t('clearLogsConfirm'))) return;
  try {
    await apiCall('/api/logs/clear', 'POST');
    toast('ok', _t('logsCleared'));
    loadLogs();
  } catch (e) {}
}

async function loadConfig() {
  try {
    const data = await apiCall('/api/config');
    const cfg = data.config || {};
    if (cfg.defaultMode) document.getElementById('defaultMode').value = cfg.defaultMode;
    if (cfg.defaultPort) {
      document.getElementById('defaultPort').value = cfg.defaultPort;
      document.getElementById('serverPortInput').value = cfg.defaultPort;
    }
    if (cfg.proxyTestCount) document.getElementById('proxyTestCount').value = cfg.proxyTestCount;
    if (cfg.logLevel) document.getElementById('logLevel').value = cfg.logLevel;
    if (cfg.logToFile !== undefined) document.getElementById('logToFile').checked = cfg.logToFile;
  } catch (e) {}
}

async function saveConfig(key, value) {
  try {
    await apiCall('/api/config', 'POST', { key, value });
    toast('ok', _t('settingSaved'));
  } catch (e) {}
}

async function resetConfig() {
  if (!confirm(_t('resetSettingsConfirm'))) return;
  try {
    await apiCall('/api/config/reset', 'POST');
    toast('ok', _t('settingsReset'));
    loadConfig();
  } catch (e) {}
}

async function loadDiagnostics() {
  try {
    const data = await apiCall('/api/diagnostics');
    document.getElementById('sysPlatform').textContent = data.system?.platform || '-';
    document.getElementById('sysNodeVersion').textContent = data.system?.nodeVersion || '-';
    const uptime = data.system?.uptime || 0;
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    document.getElementById('sysUptime').textContent = `${hours}h ${mins}m`;
    const mem = data.system?.memory || 0;
    document.getElementById('sysMemory').textContent = Math.round(mem / 1024 / 1024) + ' MB';
    document.getElementById('sysPid').textContent = data.system?.pid || '-';
    const cache = data.proxyCache || {};
    document.getElementById('sysProxyCache').textContent = `${cache.total || 0} proxies, ${Object.keys(cache.sources || {}).length} sources`;
  } catch (e) {}
}

async function loadQuote() {
  try {
    const data = await apiCall('/api/quote');
    if (data.data && data.data.content) {
      document.getElementById('quoteContainer').innerHTML = `
        "${data.data.content}"
        <br><br>
        <span style="font-size: 11px; color: var(--text2);">— ${data.data.author || _t('unknown')}</span>
      `;
    }
  } catch (e) {}
}

function addActivity(type, title, desc) {
  const now = new Date();
  const time = now.toLocaleTimeString();
  activityLog.unshift({ type, title, desc, time });
  if (activityLog.length > 20) activityLog = activityLog.slice(0, 20);
  renderActivity();
}

function renderActivity() {
  const timeline = document.getElementById('activityTimeline');
  if (activityLog.length === 0) return;
  timeline.innerHTML = activityLog.map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.type}"></div>
      <div class="activity-content">
        <div class="activity-title">${a.title}</div>
        <div class="activity-desc">${a.desc}</div>
        <div class="activity-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

function toast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type + ' show';
  el.textContent = message;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
  }, 4000);
}

function updateFooterTime() {
  const now = new Date();
  document.getElementById('footerTime').textContent = now.toLocaleString();
}

window.addEventListener('load', () => {
  setTimeout(updateOrbitAnimation, 500);
  loadPacUrl();
});
