const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'gui', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// ===== 1. HTML static text replacements =====

// Logo / Header
html = html.replace(
  '<h1 class="logo">⚡ <span>Free Proxy Tool</span> Management Interface</h1>',
  '<h1 class="logo">⚡ <span data-i18n="appName">Free Proxy Tool</span> <span data-i18n="managementInterface">Management Interface</span></h1>'
);

// Status badges
html = html.replace(
  '<span id="serverBadge" class="badge badge-err">Server OFF</span>',
  '<span id="serverBadge" class="badge badge-err" data-i18n="serverOff">Server OFF</span>'
);
html = html.replace(
  '<span id="warpBadge" class="badge badge-err">WARP OFF</span>',
  '<span id="warpBadge" class="badge badge-err" data-i18n="warpOff">WARP OFF</span>'
);

// Disconnect All button (text content, not title)
html = html.replace(
  '<button id="disconnectAllBtn" class="btn btn-danger btn-sm" title="" data-i18n-title="disconnectAllTooltip">✕ Disconnect All</button>',
  '<button id="disconnectAllBtn" class="btn btn-danger btn-sm" title="" data-i18n-title="disconnectAllTooltip">✕ <span data-i18n="disconnectAllBtn">Disconnect All</span></button>'
);

// Tabs - Statistics, Local Server, App Proxy
html = html.replace(
  '<button class="tab" data-tab="stats"><span class="tab-idx">04</span> Statistics</button>',
  '<button class="tab" data-tab="stats"><span class="tab-idx">04</span> <span data-i18n="statistics">Statistics</span></button>'
);
html = html.replace(
  '<button class="tab" data-tab="server"><span class="tab-idx">05</span> Local Server</button>',
  '<button class="tab" data-tab="server"><span class="tab-idx">05</span> <span data-i18n="localServer">Local Server</span></button>'
);
html = html.replace(
  '<button class="tab" data-tab="apps"><span class="tab-idx">06</span> App Proxy</button>',
  '<button class="tab" data-tab="apps"><span class="tab-idx">06</span> <span data-i18n="appProxy">App Proxy</span></button>'
);

// Dashboard
html = html.replace(
  '<h2>Connection Status</h2>',
  '<h2 data-i18n="connectionStatus">Connection Status</h2>'
);
html = html.replace(
  '<span id="dashStatusText">Checking...</span>',
  '<span id="dashStatusText" data-i18n="checking">Checking...</span>'
);
html = html.replace(
  'Initializing connection status...',
  '<span data-i18n="initializingStatus">Initializing connection status...</span>'
);
html = html.replace(
  '<div class="value" id="dashServerStatus">OFF</div>',
  '<div class="value" id="dashServerStatus" data-i18n="off">OFF</div>'
);
html = html.replace(
  '<div class="value" id="dashWarpStatus">OFF</div>',
  '<div class="value" id="dashWarpStatus" data-i18n="off">OFF</div>'
);
html = html.replace(
  '<div class="value" id="dashSysProxy">OFF</div>',
  '<div class="value" id="dashSysProxy" data-i18n="off">OFF</div>'
);

// Quick action buttons
html = html.replace(
  '<button class="btn btn-primary" onclick="startServer()">▶ Start Proxy Server</button>',
  '<button class="btn btn-primary" onclick="startServer()">▶ <span data-i18n="startProxyServer">Start Proxy Server</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline" onclick="stopServer()">⏹ Stop Server</button>',
  '<button class="btn btn-outline" onclick="stopServer()">⏹ <span data-i18n="stopServerBtn">Stop Server</span></button>'
);
html = html.replace(
  '<button class="btn btn-success" onclick="connectWarp()">🔗 Connect WARP</button>',
  '<button class="btn btn-success" onclick="connectWarp()">🔗 <span data-i18n="connectWarpBtn">Connect WARP</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline" onclick="disconnectWarp()">⏏ Disconnect WARP</button>',
  '<button class="btn btn-outline" onclick="disconnectWarp()">⏏ <span data-i18n="disconnectWarpBtn">Disconnect WARP</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline" onclick="switchTab(\'proxies\')">🔍 Test Proxies</button>',
  '<button class="btn btn-outline" onclick="switchTab(\'proxies\')">🔍 <span data-i18n="testProxiesBtn">Test Proxies</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline" onclick="startAutoFind()">⚡ Auto-Find</button>',
  '<button class="btn btn-outline" onclick="startAutoFind()">⚡ <span data-i18n="autoFindBtn">Auto-Find</span></button>'
);

// Refresh buttons
html = html.replace(
  '<button class="btn btn-outline btn-sm" onclick="loadStableProxies()">↻ Refresh</button>',
  '<button class="btn btn-outline btn-sm" onclick="loadStableProxies()">↻ <span data-i18n="refreshBtn">Refresh</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline btn-sm" onclick="refreshWarpStatus()">↻ Refresh Status</button>',
  '<button class="btn btn-outline btn-sm" onclick="refreshWarpStatus()">↻ <span data-i18n="refreshStatus">Refresh Status</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline btn-sm" onclick="loadHistory()">↻ Refresh</button>',
  '<button class="btn btn-outline btn-sm" onclick="loadHistory()">↻ <span data-i18n="refreshBtn">Refresh</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline btn-sm" onclick="loadLogs()">↻ Refresh</button>',
  '<button class="btn btn-outline btn-sm" onclick="loadLogs()">↻ <span data-i18n="refreshBtn">Refresh</span></button>'
);
html = html.replace(
  '<button class="btn btn-outline btn-sm" onclick="loadDiagnostics()">↻ Refresh Info</button>',
  '<button class="btn btn-outline btn-sm" onclick="loadDiagnostics()">↻ <span data-i18n="refreshBtn">Refresh</span></button>'
);

// Auto-Find Stable button
html = html.replace(
  '<button class="btn btn-primary btn-sm" onclick="startAutoFind()">⚡ Auto-Find Stable</button>',
  '<button class="btn btn-primary btn-sm" onclick="startAutoFind()">⚡ <span data-i18n="findStableProxies">Find Stable Proxies</span></button>'
);

// WARP tab
html = html.replace(
  '<div id="warpInstalled" class="badge badge-warn">Checking installation status...</div>',
  '<div id="warpInstalled" class="badge badge-warn" data-i18n="checkingInstallation">Checking installation status...</div>'
);

// Server tab
html = html.replace(
  '<span id="serverStatusBadge" class="badge badge-err">Stopped</span>',
  '<span id="serverStatusBadge" class="badge badge-err" data-i18n="stopped">Stopped</span>'
);
html = html.replace(
  '<button class="btn btn-danger" id="stopServerBtn" onclick="stopServer()" style="display:none;">⏹ Stop Server</button>',
  '<button class="btn btn-danger" id="stopServerBtn" onclick="stopServer()" style="display:none;">⏹ <span data-i18n="stopServerBtn">Stop Server</span></button>'
);

// Empty states
html = html.replace(
  '<div class="empty-state-text">No stable proxies yet. Run Auto-Find to discover proxies.</div>',
  '<div class="empty-state-text" data-i18n="noStableProxiesYet">No stable proxies yet. Run Auto-Find to discover proxies.</div>'
);
html = html.replace(
  '<tr><td colspan="6" class="text-center text-muted">No test history yet</td></tr>',
  '<tr><td colspan="6" class="text-center text-muted" data-i18n="noTestHistory">No test history yet</td></tr>'
);
html = html.replace(
  '<span class="text-muted text-sm">No presets detected</span>',
  '<span class="text-muted text-sm" data-i18n="noPresetsDetected">No presets detected</span>'
);
html = html.replace(
  '<div class="text-muted">No logs available</div>',
  '<div class="text-muted" data-i18n="noLogsAvailable">No logs available</div>'
);

// Footer
html = html.replace(
  'Free Proxy Tool · Management Interface · <span id="footerTime"></span>',
  '<span data-i18n="appName">Free Proxy Tool</span> · <span data-i18n="managementInterface">Management Interface</span> · <span id="footerTime"></span>'
);

// ===== 2. JS dynamic text replacements (_t) =====

const jsReplacements = [
  // Status updates
  ["badge.textContent = 'Server OFF';", "badge.textContent = _t('serverOff');"],
  ["statusBadge.textContent = 'Stopped';", "statusBadge.textContent = _t('stopped');"],
  ["dashStatus.textContent = 'OFF';", "dashStatus.textContent = _t('off');"],
  ["badge.textContent = 'WARP OFF';", "badge.textContent = _t('warpOff');"],
  ["dash.textContent = 'OFF';", "dash.textContent = _t('off');"],
  ["dashStatus.textContent = 'OFF';", "dashStatus.textContent = _t('off');"],

  // Activity logs
  ["addActivity('info', 'Proxy Server Stopped', 'Server stopped');", "addActivity('info', _t('proxyServerStoppedActivity'), _t('serverStoppedActivity'));"],
  ["addActivity('warn', 'Disconnect All', 'All connections terminated');", "addActivity('warn', _t('disconnectAllActivity'), _t('allConnectionsTerminated'));"],
  ["addActivity('info', 'Auto-Find', `Started with ${max} proxies`);", "addActivity('info', _t('autoFindActivity'), _t('startedWithProxies', max));"],
  ["addActivity('success', 'Auto-Find Complete', `${data.found} new proxies found, ${data.total} total`);", "addActivity('success', _t('autoFindCompleteActivity'), _t('newProxiesFound', data.found, data.total));"],

  // Toast messages not yet using _t
  ["toast('info', 'Use App Proxy tab to launch apps with specific proxies');", "toast('info', _t('useAppProxyTab'));"],
  ["toast('info', `Testing ${host}:${port}...`);", "toast('info', _t('testingHostPort', host, port));"],
  ["toast('ok', `Proxy is alive! ${result.latency}ms`);", "toast('ok', _t('proxyAliveToast', result.latency));"],
  ["toast('err', 'Proxy test failed');", "toast('err', _t('proxyTestFailed'));"],
  ["toast('info', 'Starting proxy test batch...');", "toast('info', _t('startingBatchTest'));"],
  ["toast('ok', `Test complete: ${data.alive.length} alive proxies`);", "toast('ok', _t('testCompleteAlive', data.alive.length));"],
  ["toast('info', 'Starting auto-find...');", "toast('info', _t('startingAutoFind'));"],
  ["toast('warn', 'Auto-find is already in progress');", "toast('warn', _t('autoFindInProgress'));"],
  ["toast('err', 'Auto-find failed: ' + data.error);", "toast('err', _t('autoFindFailed', data.error));"],
  ["toast('ok', `Auto-find complete! ${data.found} new, ${data.total} total stable proxies`);", "toast('ok', _t('autoFindCompleteToast', data.found, data.total));"],
  ["toast('info', 'Fetching proxy list...');", "toast('info', _t('fetchingProxyList'));"],
  ["toast('ok', `Fetched ${data.count} proxies`);", "toast('ok', _t('fetchedProxies', data.count));"],
  ["toast('ok', 'Proxy added to stable pool');", "toast('ok', _t('proxyAddedPool'));"],
  ["toast('err', data.error || 'Failed to add proxy');", "toast('err', data.error || _t('failedAddProxy'));"],
  ["toast('err', data.error || 'Failed to remove');", "toast('err', data.error || _t('failedRemoveProxy'));"],
  ["toast('warn', 'Please enter app name and path');", "toast('warn', _t('enterAppNamePath'));"],
  ["toast('ok', `App ${editingApp ? 'updated' : 'added'}: ${name}`);", "toast('ok', _t('appUpdatedAdded', editingApp ? _t('edit') : _t('add'), name));"],
  ["toast('err', data.error || 'Failed to save app');", "toast('err', data.error || _t('failedSaveApp'));"],
  ["toast('info', `Launching ${name}...`);", "toast('info', _t('launchingApp', name));"],
  ["toast('ok', data.message || 'App launched');", "toast('ok', data.message || _t('appLaunchedMsg'));"],
  ["toast('err', data.error || 'Failed to launch');", "toast('err', data.error || _t('failedLaunchApp'));"],
  ["toast('ok', `Added ${name}`);", "toast('ok', _t('addedPreset', name));"],
  ["toast('warn', `${name} already exists`);", "toast('warn', _t('alreadyExists', name));"],
  ["toast('err', data.error || 'Failed to add');", "toast('err', data.error || _t('failedAddPreset'));"],
  ["toast('ok', 'Setting saved');", "toast('ok', _t('settingSaved'));"],
  ["toast('ok', 'Settings reset');", "toast('ok', _t('settingsReset'));"],
  ["'<tr><td colspan=\"6\" class=\"text-center text-muted\">No test history yet</td></tr>'", "'<tr><td colspan=\"6\" class=\"text-center text-muted\" data-i18n=\"noTestHistory\">No test history yet</td></tr>'"],
];

jsReplacements.forEach(([search, replace]) => {
  html = html.split(search).join(replace);
});

// ===== 3. Fix toast (灵动岛) visibility =====
// Ensure toast has proper z-index and is more visible
html = html.replace(
  '.toast-container {\n  position: fixed;\n  bottom: 24px;\n  right: 24px;\n  z-index: 1000;',
  '.toast-container {\n  position: fixed;\n  bottom: 24px;\n  right: 24px;\n  z-index: 99999;'
);

// Increase toast display time from 3s to 4s for better readability
html = html.replace(
  "function toast(type, message) {\n" +
  "  const container = document.getElementById('toastContainer');\n" +
  "  const toast = document.createElement('div');\n" +
  "  toast.className = `toast toast-${type} show`;\n" +
  "  toast.textContent = message;\n" +
  "  container.appendChild(toast);\n" +
  "  setTimeout(() => {\n" +
  "    toast.style.opacity = '0';\n" +
  "    toast.style.transform = 'translateY(20px)';\n" +
  "    setTimeout(() => toast.remove(), 400);\n" +
  "  }, 3000);\n" +
  "}",
  "function toast(type, message) {\n" +
  "  const container = document.getElementById('toastContainer');\n" +
  "  if (!container) return;\n" +
  "  const el = document.createElement('div');\n" +
  "  el.className = 'toast toast-' + type + ' show';\n" +
  "  el.textContent = message;\n" +
  "  el.style.opacity = '1';\n" +
  "  el.style.transform = 'translateY(0)';\n" +
  "  container.appendChild(el);\n" +
  "  setTimeout(() => {\n" +
  "    el.style.opacity = '0';\n" +
  "    el.style.transform = 'translateY(20px)';\n" +
  "    setTimeout(() => { if (el.parentNode) el.remove(); }, 400);\n" +
  "  }, 4000);\n" +
  "}"
);

// ===== 4. Performance optimizations =====

// Debounce renderProxyTable
html = html.replace(
  'function renderProxyTable() {',
  `let _proxyTableTimer = null;
function renderProxyTable() {
  if (_proxyTableTimer) clearTimeout(_proxyTableTimer);
  _proxyTableTimer = setTimeout(() => _doRenderProxyTable(), 50);
}
function _doRenderProxyTable() {`
);

// Also debounce renderTopProxies
html = html.replace(
  'function renderTopProxies() {',
  `let _topProxyTimer = null;
function renderTopProxies() {
  if (_topProxyTimer) clearTimeout(_topProxyTimer);
  _topProxyTimer = setTimeout(() => _doRenderTopProxies(), 50);
}
function _doRenderTopProxies() {`
);

// Reduce setInterval frequency for status loading from 5000ms to 10000ms
html = html.replace(
  'setInterval(loadStatus, 5000);',
  'setInterval(loadStatus, 10000);'
);

// Throttle WebSocket message handling
html = html.replace(
  'function handleWebSocketMessage(event) {',
  `let _wsThrottleTimer = null;
let _wsPendingData = null;
function handleWebSocketMessage(event) {`
);

// Batch WS updates for status-type messages
html = html.replace(
  "case 'status-update':\n        updateServerStatus(data.server.running, data.server.port);\n        updateWarpStatusUI(data.warp.installed, data.warp.connected);\n        updateSystemProxyUI(data.systemProxy);\n        updateDashboardStats(data.stats);\n        break;",
  `case 'status-update':
        _wsPendingData = data;
        if (!_wsThrottleTimer) {
          _wsThrottleTimer = setTimeout(() => {
            if (_wsPendingData) {
              updateServerStatus(_wsPendingData.server.running, _wsPendingData.server.port);
              updateWarpStatusUI(_wsPendingData.warp.installed, _wsPendingData.warp.connected);
              updateSystemProxyUI(_wsPendingData.systemProxy);
              updateDashboardStats(_wsPendingData.stats);
              _wsPendingData = null;
            }
            _wsThrottleTimer = null;
          }, 200);
        }
        break;`
);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Full i18n + toast fix + perf optimization applied to index.html');
