const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'gui', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Helper: safe replacement function
function replaceOnce(str, search, replace) {
  const idx = str.indexOf(search);
  if (idx === -1) return str;
  return str.slice(0, idx) + replace + str.slice(idx + search.length);
}

// 1. Replace <title>
html = html.replace(/<title>[^<]*<\/title>/, '<title data-i18n="title">Free Proxy Tool - GUI Management Interface</title>');

// 2. Add data-i18n to html lang
html = html.replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="dark" data-i18n-root>');

// 3. Header buttons
html = html.replace('title="Toggle Theme"', 'title="" data-i18n-title="themeTooltip"');
html = html.replace('title="Disconnect All"', 'title="" data-i18n-title="disconnectAllTooltip"');

// 4. Tabs
const tabMap = {
  'Dashboard': 'tabDashboard',
  'Proxy': 'tabProxy',
  'WARP': 'tabWarp',
  'Stats': 'tabStats',
  'Server': 'tabServer',
  'Apps': 'tabApps',
  'Logs': 'tabLogs',
  'Settings': 'tabSettings'
};

// Replace tab text in nav-tab buttons (preserve icon spans)
Object.entries(tabMap).forEach(([text, key]) => {
  // Match patterns like: <span>⚡</span> Dashboard
  const regex = new RegExp(`(<span[^>]*>[^<]*</span>)\\s*${text}(\\s*<span[^>]*>)?`, 'g');
  html = html.replace(regex, (match, icon, extra) => {
    return `${icon} <span data-i18n="${key}">${text}</span>${extra || ''}`;
  });
});

// 5. Dashboard labels
html = html.replace(/<div class="label">Proxies Tested<\/div>/g, '<div class="label" data-i18n="dashProxiesTested">Proxies Tested</div>');
html = html.replace(/<div class="label">Alive Proxies<\/div>/g, '<div class="label" data-i18n="dashAliveCount">Alive Proxies</div>');
html = html.replace(/<div class="label">Avg Latency<\/div>/g, '<div class="label" data-i18n="dashAvgLatency">Avg Latency</div>');
html = html.replace(/<div class="label">Stable Pool<\/div>/g, '<div class="label" data-i18n="dashStableCount">Stable Pool</div>');
html = html.replace(/<div class="label">Proxy Server<\/div>/g, '<div class="label" data-i18n="dashServerStatus">Proxy Server</div>');
html = html.replace(/<div class="label">WARP<\/div>/g, '<div class="label" data-i18n="dashWarpStatus">WARP</div>');
html = html.replace(/<div class="label">System Proxy<\/div>/g, '<div class="label" data-i18n="dashSysProxy">System Proxy</div>');
html = html.replace(/<div class="label">Port<\/div>/g, '<div class="label" data-i18n="dashPort">Port</div>');

// 6. Dashboard sections
html = html.replace(/Quick Actions/g, '<span data-i18n="quickActions">Quick Actions</span>');
html = html.replace(/Top Proxies/g, '<span data-i18n="topProxies">Top Proxies</span>');
html = html.replace(/Recent Activity/g, '<span data-i18n="recentActivity">Recent Activity</span>');

// 7. Proxy tab labels
html = html.replace(/<div class="sp-stat-label">Total Proxies<\/div>/g, '<div class="sp-stat-label" data-i18n="proxyTotal">Total Proxies</div>');
html = html.replace(/<div class="sp-stat-label">Alive<\/div>/g, '<div class="sp-stat-label" data-i18n="proxyAlive">Alive</div>');
html = html.replace(/<div class="sp-stat-label">Best Latency<\/div>/g, '<div class="sp-stat-label" data-i18n="proxyBestLatency">Best Latency</div>');
html = html.replace(/<div class="sp-stat-label">Built-in<\/div>/g, '<div class="sp-stat-label" data-i18n="proxyBuiltin">Built-in</div>');
html = html.replace(/Scanning\.\.\./g, '<span data-i18n="proxyScanning">Scanning...</span>');

// 8. Placeholders
html = html.replace(/placeholder="Filter by host, IP, type\.\.\."/g, 'placeholder="Filter by host, IP, type..." data-i18n-placeholder="proxyFilterPlaceholder"');
html = html.replace(/placeholder="e\.g\. 192\.168\.1\.1"/g, 'placeholder="e.g. 192.168.1.1" data-i18n-placeholder="testHostPlaceholder"');
html = html.replace(/placeholder="e\.g\. 1080"/g, 'placeholder="e.g. 1080" data-i18n-placeholder="testPortPlaceholder"');
html = html.replace(/placeholder="Proxy host address"/g, 'placeholder="Proxy host address" data-i18n-placeholder="proxyHostPlaceholder"');
html = html.replace(/placeholder="Port number"/g, 'placeholder="Port number" data-i18n-placeholder="proxyPortPlaceholder"');

// 9. Sort options
html = html.replace(/Sort: Fastest/g, '<span data-i18n="sortFastest">Sort: Fastest</span>');
html = html.replace(/Sort: Most Tests/g, '<span data-i18n="sortMostTests">Sort: Most Tests</span>');
html = html.replace(/Sort: Host A-Z/g, '<span data-i18n="sortHostAz">Sort: Host A-Z</span>');

// 10. Form labels
html = html.replace(/<label>Host<\/label>/g, '<label data-i18n="host">Host</label>');
html = html.replace(/<label>Port<\/label>/g, '<label data-i18n="port">Port</label>');
html = html.replace(/<label>Type<\/label>/g, '<label data-i18n="type">Type</label>');
html = html.replace(/<label>&nbsp;<\/label>/g, '<label>&nbsp;</label>');

// 11. Button labels
html = html.replace(/>Add Proxy</g, ' data-i18n="addProxy">Add Proxy<');
html = html.replace(/>Test Proxy</g, ' data-i18n="testProxy">Test Proxy<');
html = html.replace(/>Find Stable Proxies</g, ' data-i18n="findStableProxies">Find Stable Proxies<');
html = html.replace(/>Fetch Free Proxies</g, ' data-i18n="fetchFreeProxies">Fetch Free Proxies<');
html = html.replace(/>Clear List</g, ' data-i18n="clearProxyList">Clear List<');
html = html.replace(/>Set Upstream</g, ' data-i18n="setUpstream">Set Upstream<');
html = html.replace(/>Copy PAC URL</g, ' data-i18n="copyPacUrl">Copy PAC URL<');
html = html.replace(/>Add App</g, ' data-i18n="addApp">Add App<');
html = html.replace(/>Import Apps</g, ' data-i18n="importApps">Import Apps<');
html = html.replace(/>Clear Logs</g, ' data-i18n="clearLogs">Clear Logs<');
html = html.replace(/>Save Configuration</g, ' data-i18n="saveConfig">Save Configuration<');
html = html.replace(/>Reset Configuration</g, ' data-i18n="resetConfig">Reset Configuration<');
html = html.replace(/>Launch</g, ' data-i18n="launch">Launch<');
html = html.replace(/>Browse</g, ' data-i18n="browse">Browse<');
html = html.replace(/>Save</g, ' data-i18n="save">Save<');
html = html.replace(/>Cancel</g, ' data-i18n="cancel">Cancel<');

// 12. Server tab labels
html = html.replace(/<label>Listen Port<\/label>/g, '<label data-i18n="serverListenPort">Listen Port</label>');
html = html.replace(/placeholder="socks5:\/\/host:port or http:\/\/host:port"/g, 'placeholder="socks5://host:port or http://host:port" data-i18n-placeholder="serverUpstreamPlaceholder"');
html = html.replace(/<div class="setting-label">Enable System Proxy<\/div>/g, '<div class="setting-label" data-i18n="enableSystemProxy">Enable System Proxy</div>');
html = html.replace(/<div class="setting-label">PAC File URL<\/div>/g, '<div class="setting-label" data-i18n="pacFileUrl">PAC File URL</div>');

// 13. Stats labels
html = html.replace(/<div class="label">Total Tests<\/div>/g, '<div class="label" data-i18n="tests">Total Tests</div>');
html = html.replace(/<div class="label">Success Rate<\/div>/g, '<div class="label">Success Rate</div>');
html = html.replace(/<div class="label">Best Latency<\/div>/g, '<div class="label" data-i18n="proxyBestLatency">Best Latency</div>');

// 14. Apps modal labels
html = html.replace(/<label>App Name<\/label>/g, '<label data-i18n="appName">App Name</label>');
html = html.replace(/placeholder="e\.g\. Google Chrome"/g, 'placeholder="e.g. Google Chrome" data-i18n-placeholder="appNamePlaceholder"');
html = html.replace(/<label>App Path<\/label>/g, '<label data-i18n="appPath">App Path</label>');
html = html.replace(/placeholder="C:\\\\path\\\\to\\\\app\.exe"/g, 'placeholder="C:\\\\path\\\\to\\\\app.exe" data-i18n-placeholder="appPathPlaceholder"');
html = html.replace(/<label>Proxy Mode<\/label>/g, '<label data-i18n="proxyMode">Proxy Mode</label>');
html = html.replace(/>HTTP Proxy</g, ' data-i18n="httpProxy">HTTP Proxy<');
html = html.replace(/>SOCKS5 Proxy</g, ' data-i18n="socks5Proxy">SOCKS5 Proxy<');
html = html.replace(/<label>Process Name \(optional\)<\/label>/g, '<label data-i18n="processName">Process Name (optional)</label>');
html = html.replace(/placeholder="e\.g\. chrome\.exe"/g, 'placeholder="e.g. chrome.exe" data-i18n-placeholder="processNamePlaceholder"');

// 15. Logs
html = html.replace(/<div class="setting-label">Log Level<\/div>/g, '<div class="setting-label" data-i18n="logLevel">Log Level</div>');
html = html.replace(/>All Levels</g, ' data-i18n="logLevelAll">All Levels<');
html = html.replace(/>Warning</g, ' data-i18n="logLevelWarn">Warning<');
html = html.replace(/>Success</g, ' data-i18n="logLevelSuccess">Success<');
html = html.replace(/<div class="setting-label">Log to File<\/div>/g, '<div class="setting-label" data-i18n="logToFile">Log to File</div>');

// 16. Settings
html = html.replace(/<div class="setting-label">Theme<\/div>/g, '<div class="setting-label" data-i18n="theme">Theme</div>');
html = html.replace(/>Dark</g, ' data-i18n="themeDark">Dark<');
html = html.replace(/>Light</g, ' data-i18n="themeLight">Light<');
html = html.replace(/>Pixel\/Retro</g, ' data-i18n="themePixel">Pixel/Retro<');
html = html.replace(/<div class="setting-label">Default Mode<\/div>/g, '<div class="setting-label" data-i18n="defaultMode">Default Mode</div>');
html = html.replace(/>Auto</g, ' data-i18n="modeAuto">Auto<');
html = html.replace(/<div class="setting-label">Proxy Test Count<\/div>/g, '<div class="setting-label" data-i18n="proxyTestCount">Proxy Test Count</div>');
html = html.replace(/<div class="setting-label">Default Port<\/div>/g, '<div class="setting-label" data-i18n="defaultPort">Default Port</div>');
html = html.replace(/<div class="section-title">System Information<\/div>/g, '<div class="section-title" data-i18n="systemInfo">System Information</div>');
html = html.replace(/<label>Platform<\/label>/g, '<label data-i18n="platform">Platform</label>');
html = html.replace(/<label>Node Version<\/label>/g, '<label data-i18n="nodeVersion">Node Version</label>');
html = html.replace(/<label>Uptime<\/label>/g, '<label data-i18n="uptime">Uptime</label>');
html = html.replace(/<label>Memory Usage<\/label>/g, '<label data-i18n="memoryUsage">Memory Usage</label>');
html = html.replace(/<label>PID<\/label>/g, '<label data-i18n="pid">PID</label>');
html = html.replace(/<label>Proxy Cache<\/label>/g, '<label data-i18n="proxyCache">Proxy Cache</label>');

// 17. Presets section
html = html.replace(/Presets/g, '<span data-i18n="presets">Presets</span>');

// 18. Modal title
html = html.replace(/Add \/ Edit App Proxy/g, '<span data-i18n="addAppTitle">Add / Edit App Proxy</span>');

// 19. No apps / no proxies messages
html = html.replace(/No apps configured\. Add an app or import presets\./g, '<span data-i18n="noApps">No apps configured. Add an app or import presets.</span>');
html = html.replace(/No proxies found/g, '<span data-i18n="noProxiesFound">No proxies found</span>');

// 20. Ranking labels
html = html.replace(/<span class="ranking-stat-label">Latency<\/span>/g, '<span class="ranking-stat-label" data-i18n="rankLatency">Latency</span>');
html = html.replace(/<span class="ranking-stat-label">Tests<\/span>/g, '<span class="ranking-stat-label" data-i18n="rankTests">Tests</span>');

// 21. System OK badge
html = html.replace(/System OK/g, '<span data-i18n="systemOk">System OK</span>');

// 22. Activity title
html = html.replace(/GUI Initialized/g, '<span data-i18n="initialized">GUI Initialized</span>');

// 23. Add language switcher to header (before theme toggle)
const langSwitcher = `
    <button id="langToggle" class="btn btn-outline btn-sm" title="" data-i18n-title="languageTooltip" onclick="toggleLanguage()">EN/中</button>`;
html = html.replace('    <button id="themeToggle"', langSwitcher + '\n    <button id="themeToggle"');

// 24. Add i18n engine script before closing </body>
const i18nScript = `
<script>
(function() {
  let currentLang = localStorage.getItem('fpt-lang') || 'en';
  let translations = {};

  function fetchTranslations() {
    return fetch('/api/lang?lang=' + currentLang)
      .then(r => r.json())
      .then(data => {
        if (data.translations) translations = data.translations;
        if (data.lang) currentLang = data.lang;
        localStorage.setItem('fpt-lang', currentLang);
        document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
      })
      .catch(() => { translations = {}; });
  }

  window._t = function(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    var text = translations[key];
    if (text === undefined) return key;
    args.forEach(function(arg, i) {
      text = text.replace(new RegExp('\\\\{' + i + '\\\\}', 'g'), arg);
    });
    return text;
  };

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (translations[key]) el.textContent = translations[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-title');
      if (translations[key]) el.setAttribute('title', translations[key]);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (translations[key]) el.setAttribute('placeholder', translations[key]);
    });
  }

  window.toggleLanguage = function() {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    fetchTranslations().then(function() {
      applyI18n();
      if (window.toast) window.toast('info', currentLang === 'zh' ? '已切换为中文' : 'Switched to English');
    });
  };

  window.refreshI18n = function() {
    return fetchTranslations().then(applyI18n);
  };

  document.addEventListener('DOMContentLoaded', function() {
    fetchTranslations().then(applyI18n);
  });
})();
</script>
`;

html = html.replace('</body>', i18nScript + '</body>');

// 25. Replace JS toast/status messages with _t calls
const jsReplacements = [
  ["toast('info', `Proxy cache updated: ' + data.count + ' proxies`);", "toast('info', _t('proxyCacheUpdated', data.count));"],
  ["toast('warn', 'All connections disconnected');", "toast('warn', _t('allDisconnected'));"],
  ["toast('err', 'API Error: ' + e.message);", "toast('err', _t('apiError', e.message));"],
  ["text.textContent = 'Server is running';", "text.textContent = _t('statusRunning');"],
  ["text.textContent = 'Server is stopped';", "text.textContent = _t('statusStopped');"],
  ["installedEl.textContent = '✓ Installed';", "installedEl.textContent = '✓ ' + _t('warpInstalled');"],
  ["installedEl.textContent = '✗ Not installed';", "installedEl.textContent = '✗ ' + _t('warpNotInstalled');"],
  ["statusBadge.textContent = 'Connected';", "statusBadge.textContent = _t('warpConnected');"],
  ["statusBadge.textContent = 'Disconnected';", "statusBadge.textContent = _t('warpDisconnected');"],
  ["toast('ok', 'Proxy server started on port ' + data.port);", "toast('ok', _t('serverStarted', data.port));"],
  ["toast('err', 'Failed to start server: ' + (data.error || 'Unknown error'));", "toast('err', _t('serverStartFailed', data.error || 'Unknown error'));"],
  ["toast('ok', 'Proxy server stopped');", "toast('ok', _t('serverStopped'));"],
  ["toast('warn', 'Please enter an upstream proxy URL');", "toast('warn', _t('upstreamUrlRequired'));"],
  ["toast('ok', 'Upstream proxy set: ' + data.upstream.host + ':' + data.upstream.port);", "toast('ok', _t('upstreamSet', data.upstream.host, data.upstream.port));"],
  ["toast('err', data.error || 'Failed to set upstream');", "toast('err', data.error || _t('upstreamSet'));"],
  ["toast('ok', 'WARP connected');", "toast('ok', _t('warpConnected'));"],
  ["toast('err', 'Failed to connect WARP');", "toast('err', _t('warpConnectFailed'));"],
  ["toast('ok', 'WARP disconnected');", "toast('ok', _t('warpDisconnected'));"],
  ["toast('ok', 'WARP registered successfully');", "toast('ok', _t('warpRegistered'));"],
  ["toast('err', 'Registration failed: ' + (data.raw || 'Unknown error'));", "toast('err', _t('warpRegisterFailed', data.raw || 'Unknown error'));"],
  ["toast('ok', 'System proxy ' + (enable ? 'enabled' : 'disabled'));", "toast('ok', enable ? _t('sysProxyEnabledMsg') : _t('sysProxyDisabledMsg'));"],
  ["toast('err', 'Failed to update system proxy');", "toast('err', _t('sysProxyFailed'));"],
  ["toast('ok', 'PAC URL copied to clipboard');", "toast('ok', _t('pacUrlCopied'));"],
  ["toast('ok', 'All connections disconnected');", "toast('ok', _t('allDisconnected'));"],
  ["confirm('Disconnect WARP, stop proxy server and disable system proxy?')", "confirm(_t('confirmDisconnectText'))"],
  ["toast('warn', 'Please enter host and port');", "toast('warn', _t('enterHostPort'));"],
  ["toast('ok', 'Proxy added successfully');", "toast('ok', _t('proxyAdded'));"],
  ["toast('ok', 'Proxy removed');", "toast('ok', _t('proxyRemoved'));"],
  ["toast('ok', 'App saved successfully');", "toast('ok', _t('appSaved'));"],
  ["toast('ok', 'App removed');", "toast('ok', _t('appRemoved'));"],
  ["toast('ok', 'App launched: ' + app.name);", "toast('ok', _t('appLaunched', app.name));"],
  ["toast('ok', 'Preset added: ' + preset.name);", "toast('ok', _t('presetAdded', preset.name));"],
  ["toast('ok', 'Logs cleared');", "toast('ok', _t('logsCleared'));"],
  ["toast('ok', 'Configuration saved');", "toast('ok', _t('configSaved'));"],
  ["toast('ok', 'Configuration reset');", "toast('ok', _t('configReset'));"],
  ["toast('ok', 'Statistics cleared');", "toast('ok', _t('statsCleared'));"],
  ["toast('info', 'Starting proxy server...');", "toast('info', _t('serverStarted', '...'));"],
  ["toast('info', 'Stopping proxy server...');", "toast('info', _t('serverStopped'));"],
  ["toast('info', 'Connecting WARP...');", "toast('info', _t('warpConnected'));"],
  ["toast('info', 'Disconnecting WARP...');", "toast('info', _t('warpDisconnected'));"],
  ["toast('info', 'Registering WARP...');", "toast('info', _t('warpRegistered'));"],
  ["toast('info', 'Disconnecting all...');", "toast('info', _t('allDisconnected'));"],
  ["toast('info', 'Setting upstream proxy...');", "toast('info', _t('upstreamSet', '...', '...'));"],
  ["toast('info', 'Auto-find started: testing ' + count + ' proxies');", "toast('info', _t('autoFindStarted', count));"],
  ["toast('ok', 'Auto-find complete: found ' + found.length + ' stable proxies');", "toast('ok', _t('autoFindComplete', found.length));"],
  ["toast('ok', 'Fetched ' + data.count + ' free proxies');", "toast('ok', _t('fetchFreeSuccess', data.count));"],
  ["'<tr><td colspan=\"8\" class=\"text-center text-muted\">No proxies found</td></tr>'", "'<tr><td colspan=\"8\" class=\"text-center text-muted\"><span data-i18n=\"noProxiesFound\">No proxies found</span></td></tr>'"],
];

jsReplacements.forEach(([search, replace]) => {
  html = html.split(search).join(replace);
});

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('i18n applied to index.html');
