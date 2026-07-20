const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.free-proxy-tool');
const LANG_FILE = path.join(CONFIG_DIR, 'language.json');

const DEFAULT_LANG = 'en';
const SUPPORTED_LANGS = ['en', 'zh'];

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadLang() {
  ensureDir();
  try {
    const data = JSON.parse(fs.readFileSync(LANG_FILE, 'utf8'));
    if (SUPPORTED_LANGS.includes(data.lang)) return data.lang;
  } catch {}
  return DEFAULT_LANG;
}

function saveLang(lang) {
  ensureDir();
  if (!SUPPORTED_LANGS.includes(lang)) return false;
  try {
    fs.writeFileSync(LANG_FILE, JSON.stringify({ lang }, null, 2));
    return true;
  } catch { return false; }
}

let currentLang = loadLang();

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return false;
  currentLang = lang;
  saveLang(lang);
  return true;
}

function getLang() {
  return currentLang;
}

const translations = {
  en: {
    // Common
    appName: 'Free Proxy Tool',
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    refresh: 'Refresh',
    close: 'Close',
    browse: 'Browse',
    launch: 'Launch',
    stop: 'Stop',
    start: 'Start',
    connect: 'Connect',
    disconnect: 'Disconnect',
    enabled: 'Enabled',
    disabled: 'Disabled',
    on: 'ON',
    off: 'OFF',
    yes: 'Yes',
    no: 'No',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    info: 'Info',
    loading: 'Loading...',
    unknown: 'Unknown',

    // Header
    title: 'Free Proxy Tool - GUI Management Interface',
    themeTooltip: 'Toggle Theme',
    disconnectAllTooltip: 'Disconnect All',
    languageTooltip: 'Switch Language',

    // Tabs
    tabDashboard: 'Dashboard',
    tabProxy: 'Proxy',
    tabWarp: 'WARP',
    tabStats: 'Stats',
    tabServer: 'Server',
    tabApps: 'Apps',
    tabLogs: 'Logs',
    tabSettings: 'Settings',

    // Dashboard
    dashProxiesTested: 'Proxies Tested',
    dashAliveCount: 'Alive Proxies',
    dashAvgLatency: 'Avg Latency',
    dashStableCount: 'Stable Pool',
    dashServerStatus: 'Proxy Server',
    dashWarpStatus: 'WARP',
    dashSysProxy: 'System Proxy',
    dashPort: 'Port',
    statusRunning: 'Server is running',
    statusStopped: 'Server is stopped',
    warpInstalled: 'Installed',
    warpNotInstalled: 'Not installed',
    warpConnected: 'Connected',
    warpDisconnected: 'Disconnected',
    sysProxyEnabled: 'Enabled',
    sysProxyDisabled: 'Disabled',
    systemOk: 'System OK',
    quickActions: 'Quick Actions',
    topProxies: 'Top Proxies',
    recentActivity: 'Recent Activity',

    // Proxy tab
    proxyTotal: 'Total Proxies',
    proxyAlive: 'Alive',
    proxyBestLatency: 'Best Latency',
    proxyBuiltin: 'Built-in',
    proxyScanning: 'Scanning...',
    proxyFilterPlaceholder: 'Filter by host, IP, type...',
    sortFastest: 'Sort: Fastest',
    sortMostTests: 'Sort: Most Tests',
    sortHostAz: 'Sort: Host A-Z',
    host: 'Host',
    port: 'Port',
    type: 'Type',
    latency: 'Latency',
    tests: 'Tests',
    source: 'Source',
    action: 'Action',
    noProxiesFound: 'No proxies found',
    addProxy: 'Add Proxy',
    testProxy: 'Test Proxy',
    findStableProxies: 'Find Stable Proxies',
    fetchFreeProxies: 'Fetch Free Proxies',
    clearProxyList: 'Clear List',
    proxyHostPlaceholder: 'Proxy host address',
    proxyPortPlaceholder: 'Port number',
    testHostPlaceholder: 'e.g. 192.168.1.1',
    testPortPlaceholder: 'e.g. 1080',
    latencyMs: '{0}ms',
    rankLatency: 'Latency',
    rankTests: 'Tests',

    // Server tab
    serverListenPort: 'Listen Port',
    serverUpstreamPlaceholder: 'socks5://host:port or http://host:port',
    enableSystemProxy: 'Enable System Proxy',
    pacFileUrl: 'PAC File URL',
    setUpstream: 'Set Upstream',
    copyPacUrl: 'Copy PAC URL',

    // Apps tab
    appName: 'App Name',
    appNamePlaceholder: 'e.g. Google Chrome',
    appPath: 'App Path',
    appPathPlaceholder: 'C:\\path\\to\\app.exe',
    proxyMode: 'Proxy Mode',
    httpProxy: 'HTTP Proxy',
    socks5Proxy: 'SOCKS5 Proxy',
    processName: 'Process Name (optional)',
    processNamePlaceholder: 'e.g. chrome.exe',
    addApp: 'Add App',
    importApps: 'Import Apps',
    presets: 'Presets',
    noApps: 'No apps configured. Add an app or import presets.',

    // Logs
    logLevel: 'Log Level',
    logLevelAll: 'All Levels',
    logLevelInfo: 'Info',
    logLevelWarn: 'Warning',
    logLevelError: 'Error',
    logLevelSuccess: 'Success',
    logToFile: 'Log to File',
    clearLogs: 'Clear Logs',

    // Settings
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    themePixel: 'Pixel/Retro',
    defaultMode: 'Default Mode',
    modeAuto: 'Auto',
    proxyTestCount: 'Proxy Test Count',
    defaultPort: 'Default Port',
    saveConfig: 'Save Configuration',
    resetConfig: 'Reset Configuration',
    systemInfo: 'System Information',
    platform: 'Platform',
    nodeVersion: 'Node Version',
    uptime: 'Uptime',
    memoryUsage: 'Memory Usage',
    pid: 'PID',
    proxyCache: 'Proxy Cache',

    // Modals / Dialogs
    confirmDisconnectTitle: 'Disconnect All',
    confirmDisconnectText: 'Disconnect WARP, stop proxy server and disable system proxy?',
    addAppTitle: 'Add / Edit App Proxy',

    // Toast / Status messages
    serverStarted: 'Proxy server started on port {0}',
    serverStopped: 'Proxy server stopped',
    serverStartFailed: 'Failed to start server: {0}',
    upstreamSet: 'Upstream proxy set: {0}:{1}',
    upstreamUrlRequired: 'Please enter an upstream proxy URL',
    warpConnected: 'WARP connected',
    warpDisconnected: 'WARP disconnected',
    warpRegistered: 'WARP registered successfully',
    warpConnectFailed: 'Failed to connect WARP',
    warpRegisterFailed: 'Registration failed: {0}',
    sysProxyEnabledMsg: 'System proxy enabled',
    sysProxyDisabledMsg: 'System proxy disabled',
    sysProxyFailed: 'Failed to update system proxy',
    pacUrlCopied: 'PAC URL copied to clipboard',
    allDisconnected: 'All connections disconnected',
    proxyCacheUpdated: 'Proxy cache updated: {0} proxies',
    proxyAdded: 'Proxy added successfully',
    proxyRemoved: 'Proxy removed',
    appSaved: 'App saved successfully',
    appRemoved: 'App removed',
    appLaunched: 'App launched: {0}',
    presetAdded: 'Preset added: {0}',
    logsCleared: 'Logs cleared',
    configSaved: 'Configuration saved',
    configReset: 'Configuration reset',
    statsCleared: 'Statistics cleared',
    noProxyData: 'No data',
    autoFindStarted: 'Auto-find started: testing {0} proxies',
    autoFindComplete: 'Auto-find complete: found {0} stable proxies',
    fetchFreeSuccess: 'Fetched {0} free proxies',
    enterHostPort: 'Please enter host and port',
    apiError: 'API Error: {0}',
    initialized: 'GUI Initialized',

    // Backend API messages
    invalidPort: 'Invalid port number',
    portInUse: 'Port {0} is already in use',
    serverRunningOn: 'Server running on port {0}',
    proxyNotRunning: 'Proxy server is not running',
    invalidUpstream: 'Invalid upstream proxy URL',
    upstreamSetSuccess: 'Upstream proxy set successfully',
    upstreamCleared: 'Upstream proxy cleared',
    noStableProxies: 'No stable proxies available',
    proxyAddedSuccess: 'Proxy added to stable list',
    proxyDeletedSuccess: 'Proxy deleted',
    invalidProxyData: 'Invalid proxy data',
    appNotFound: 'Application not found',
    appLaunchFailed: 'Failed to launch application',
    fileSelectFailed: 'File selection failed',
    windowsOnly: 'Windows only',
    configSavedSuccess: 'Configuration saved',
    disconnectFailed: 'Disconnect failed',
    warpNotInstalledMsg: 'WARP is not installed',
  },
  zh: {
    // Common
    appName: '免费代理工具',
    ok: '确定',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    refresh: '刷新',
    close: '关闭',
    browse: '浏览',
    launch: '启动',
    stop: '停止',
    start: '启动',
    connect: '连接',
    disconnect: '断开',
    enabled: '已启用',
    disabled: '已禁用',
    on: '开启',
    off: '关闭',
    yes: '是',
    no: '否',
    error: '错误',
    success: '成功',
    warning: '警告',
    info: '信息',
    loading: '加载中...',
    unknown: '未知',

    // Header
    title: '免费代理工具 - 图形管理界面',
    themeTooltip: '切换主题',
    disconnectAllTooltip: '断开所有连接',
    languageTooltip: '切换语言',

    // Tabs
    tabDashboard: '概览',
    tabProxy: '代理',
    tabWarp: 'WARP',
    tabStats: '统计',
    tabServer: '服务器',
    tabApps: '应用',
    tabLogs: '日志',
    tabSettings: '设置',

    // Dashboard
    dashProxiesTested: '已测代理',
    dashAliveCount: '可用代理',
    dashAvgLatency: '平均延迟',
    dashStableCount: '稳定池',
    dashServerStatus: '代理服务器',
    dashWarpStatus: 'WARP',
    dashSysProxy: '系统代理',
    dashPort: '端口',
    statusRunning: '服务器运行中',
    statusStopped: '服务器已停止',
    warpInstalled: '已安装',
    warpNotInstalled: '未安装',
    warpConnected: '已连接',
    warpDisconnected: '已断开',
    sysProxyEnabled: '已启用',
    sysProxyDisabled: '已禁用',
    systemOk: '系统正常',
    quickActions: '快捷操作',
    topProxies: '优质代理',
    recentActivity: '最近活动',

    // Proxy tab
    proxyTotal: '代理总数',
    proxyAlive: '可用',
    proxyBestLatency: '最佳延迟',
    proxyBuiltin: '内置',
    proxyScanning: '扫描中...',
    proxyFilterPlaceholder: '按主机、IP、类型筛选...',
    sortFastest: '排序：最快',
    sortMostTests: '排序：测试最多',
    sortHostAz: '排序：主机 A-Z',
    host: '主机',
    port: '端口',
    type: '类型',
    latency: '延迟',
    tests: '测试',
    source: '来源',
    action: '操作',
    noProxiesFound: '未找到代理',
    addProxy: '添加代理',
    testProxy: '测试代理',
    findStableProxies: '寻找稳定代理',
    fetchFreeProxies: '获取免费代理',
    clearProxyList: '清空列表',
    proxyHostPlaceholder: '代理主机地址',
    proxyPortPlaceholder: '端口号',
    testHostPlaceholder: '例如 192.168.1.1',
    testPortPlaceholder: '例如 1080',
    latencyMs: '{0}ms',
    rankLatency: '延迟',
    rankTests: '测试',

    // Server tab
    serverListenPort: '监听端口',
    serverUpstreamPlaceholder: 'socks5://host:port 或 http://host:port',
    enableSystemProxy: '启用系统代理',
    pacFileUrl: 'PAC 文件地址',
    setUpstream: '设置上游',
    copyPacUrl: '复制 PAC 地址',

    // Apps tab
    appName: '应用名称',
    appNamePlaceholder: '例如 Google Chrome',
    appPath: '应用路径',
    appPathPlaceholder: 'C:\\path\\to\\app.exe',
    proxyMode: '代理模式',
    httpProxy: 'HTTP 代理',
    socks5Proxy: 'SOCKS5 代理',
    processName: '进程名（可选）',
    processNamePlaceholder: '例如 chrome.exe',
    addApp: '添加应用',
    importApps: '导入应用',
    presets: '预设',
    noApps: '未配置应用。添加应用或导入预设。',

    // Logs
    logLevel: '日志级别',
    logLevelAll: '全部',
    logLevelInfo: '信息',
    logLevelWarn: '警告',
    logLevelError: '错误',
    logLevelSuccess: '成功',
    logToFile: '写入日志文件',
    clearLogs: '清空日志',

    // Settings
    theme: '主题',
    themeDark: '深色',
    themeLight: '浅色',
    themePixel: '像素/复古',
    defaultMode: '默认模式',
    modeAuto: '自动',
    proxyTestCount: '代理测试数量',
    defaultPort: '默认端口',
    saveConfig: '保存配置',
    resetConfig: '重置配置',
    systemInfo: '系统信息',
    platform: '平台',
    nodeVersion: 'Node 版本',
    uptime: '运行时间',
    memoryUsage: '内存使用',
    pid: '进程 ID',
    proxyCache: '代理缓存',

    // Modals / Dialogs
    confirmDisconnectTitle: '断开所有连接',
    confirmDisconnectText: '断开 WARP、停止代理服务器并禁用系统代理？',
    addAppTitle: '添加/编辑应用代理',

    // Toast / Status messages
    serverStarted: '代理服务器已启动，端口 {0}',
    serverStopped: '代理服务器已停止',
    serverStartFailed: '启动服务器失败：{0}',
    upstreamSet: '上游代理已设置：{0}:{1}',
    upstreamUrlRequired: '请输入上游代理地址',
    warpConnected: 'WARP 已连接',
    warpDisconnected: 'WARP 已断开',
    warpRegistered: 'WARP 注册成功',
    warpConnectFailed: '连接 WARP 失败',
    warpRegisterFailed: '注册失败：{0}',
    sysProxyEnabledMsg: '系统代理已启用',
    sysProxyDisabledMsg: '系统代理已禁用',
    sysProxyFailed: '更新系统代理失败',
    pacUrlCopied: 'PAC 地址已复制到剪贴板',
    allDisconnected: '所有连接已断开',
    proxyCacheUpdated: '代理缓存已更新：{0} 个代理',
    proxyAdded: '代理添加成功',
    proxyRemoved: '代理已移除',
    appSaved: '应用保存成功',
    appRemoved: '应用已移除',
    appLaunched: '应用已启动：{0}',
    presetAdded: '已添加预设：{0}',
    logsCleared: '日志已清空',
    configSaved: '配置已保存',
    configReset: '配置已重置',
    statsCleared: '统计已清空',
    noProxyData: '暂无数据',
    autoFindStarted: '自动寻找已启动：测试 {0} 个代理',
    autoFindComplete: '自动寻找完成：找到 {0} 个稳定代理',
    fetchFreeSuccess: '已获取 {0} 个免费代理',
    enterHostPort: '请输入主机和端口',
    apiError: 'API 错误：{0}',
    initialized: '图形界面已初始化',

    // Backend API messages
    invalidPort: '无效的端口号',
    portInUse: '端口 {0} 已被占用',
    serverRunningOn: '服务器运行在端口 {0}',
    proxyNotRunning: '代理服务器未运行',
    invalidUpstream: '无效的上游代理地址',
    upstreamSetSuccess: '上游代理设置成功',
    upstreamCleared: '上游代理已清除',
    noStableProxies: '没有可用的稳定代理',
    proxyAddedSuccess: '代理已添加到稳定列表',
    proxyDeletedSuccess: '代理已删除',
    invalidProxyData: '无效的代理数据',
    appNotFound: '未找到应用',
    appLaunchFailed: '启动应用失败',
    fileSelectFailed: '文件选择失败',
    windowsOnly: '仅支持 Windows',
    configSavedSuccess: '配置已保存',
    disconnectFailed: '断开失败',
    warpNotInstalledMsg: 'WARP 未安装',
  }
};

function t(key, ...args) {
  const dict = translations[currentLang] || translations[DEFAULT_LANG];
  let text = dict[key];
  if (text === undefined) {
    text = translations[DEFAULT_LANG][key] || key;
  }
  if (args && args.length) {
    args.forEach((arg, i) => {
      text = text.replace(new RegExp('\\{' + i + '\\}', 'g'), arg);
    });
  }
  return text;
}

function getTranslations(lang) {
  return translations[lang] || translations[DEFAULT_LANG];
}

module.exports = {
  t,
  setLang,
  getLang,
  getTranslations,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  loadLang,
  saveLang
};
