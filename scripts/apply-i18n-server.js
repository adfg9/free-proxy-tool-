const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'gui', 'server.js');
let code = fs.readFileSync(serverPath, 'utf8');

// 1. Add i18n require after existing requires
if (!code.includes("require(path.join(PROJECT_ROOT, 'lib', 'i18n'))")) {
  code = code.replace(
    "const proxyCore = require(path.join(PROJECT_ROOT, 'lib', 'proxy-core'));",
    "const proxyCore = require(path.join(PROJECT_ROOT, 'lib', 'proxy-core'));\nconst i18n = require(path.join(PROJECT_ROOT, 'lib', 'i18n'));\nconst { t } = i18n;"
  );
}

// 2. Add /api/lang route after /api/status
const langRoute = `
  if (pathname === '/api/lang') {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      if (body.lang && i18n.setLang(body.lang)) {
        return sendJSON(res, { lang: i18n.getLang(), translations: i18n.getTranslations(i18n.getLang()) });
      }
      return sendJSON(res, { error: 'invalid language' }, 400);
    }
    const requestedLang = url.searchParams.get('lang');
    if (requestedLang && i18n.SUPPORTED_LANGS.includes(requestedLang)) {
      i18n.setLang(requestedLang);
    }
    return sendJSON(res, { lang: i18n.getLang(), translations: i18n.getTranslations(i18n.getLang()) });
  }

`;

if (!code.includes("pathname === '/api/lang'")) {
  code = code.replace(
    "if (pathname === '/api/status') {",
    langRoute + "  if (pathname === '/api/status') {"
  );
}

// 3. String replacements map
const replacements = [
  ["return sendJSON(res, { error: 'host and port required' }, 400);", "return sendJSON(res, { error: t('enterHostPort') }, 400);"],
  ["if (!IS_WIN) return sendJSON(res, { connected: false, error: 'WARP is only supported on Windows desktop' });", "if (!IS_WIN) return sendJSON(res, { connected: false, error: t('windowsOnly') });"],
  ["if (!IS_WIN) return sendJSON(res, { success: false, error: 'WARP is only supported on Windows desktop' });", "if (!IS_WIN) return sendJSON(res, { success: false, error: t('windowsOnly') });"],
  ["return sendJSON(res, { error: \`Invalid port: ${body.port}. Please enter a number between 1-65535.\` }, 400);", "return sendJSON(res, { error: t('invalidPort') }, 400);"],
  ["if (!body.proxy) return sendJSON(res, { error: 'proxy required' }, 400);", "if (!body.proxy) return sendJSON(res, { error: t('invalidUpstream') }, 400);"],
  ["if (!m) return sendJSON(res, { error: 'invalid proxy format' }, 400);", "if (!m) return sendJSON(res, { error: t('invalidUpstream') }, 400);"],
  ["if (autoFinding) return sendJSON(res, { error: 'An auto-find task is already in progress' }, 409);", "if (autoFinding) return sendJSON(res, { error: t('loading') }, 409);"],
  ["broadcast({ type: 'auto-find-stage', stage: 'fetch', message: 'Fetching proxy list...' });", "broadcast({ type: 'auto-find-stage', stage: 'fetch', message: t('loading') });"],
  ["broadcast({ type: 'auto-find-stage', stage: 'test', message: \`Initial testing of ${toTest.length} proxies (including ${builtinsToTest.length} built-in)...\`, tested: 0, total: toTest.length });", "broadcast({ type: 'auto-find-stage', stage: 'test', message: t('autoFindStarted', toTest.length), tested: 0, total: toTest.length });"],
  ["broadcast({ type: 'auto-find-stage', stage: 'confirm', message: \`Round ${round}/${confirmRounds} stability verification (${survivors.length} remaining)...\`, tested: 0, total: survivors.length });", "broadcast({ type: 'auto-find-stage', stage: 'confirm', message: t('loading'), tested: 0, total: survivors.length });"],
  ["broadcast({ type: 'auto-find-complete', error: e.message });", "broadcast({ type: 'auto-find-complete', error: t('apiError', e.message) });"],
  ["if (isBuiltin) return sendJSON(res, { error: 'Built-in proxies cannot be removed' }, 400);", "if (isBuiltin) return sendJSON(res, { error: t('invalidProxyData') }, 400);"],
  ["if (!body.host || !body.port) return sendJSON(res, { error: 'host and port required' }, 400);", "if (!body.host || !body.port) return sendJSON(res, { error: t('enterHostPort') }, 400);"],
  ["if (!body.name || !body.path) return sendJSON(res, { error: 'name and path required' }, 400);", "if (!body.name || !body.path) return sendJSON(res, { error: t('invalidProxyData') }, 400);"],
  ["if (apps.find(a => a.name === body.name)) return sendJSON(res, { error: 'app already exists' }, 409);", "if (apps.find(a => a.name === body.name)) return sendJSON(res, { error: t('appNotFound') }, 409);"],
  ["if (idx < 0) return sendJSON(res, { error: 'app not found' }, 404);", "if (idx < 0) return sendJSON(res, { error: t('appNotFound') }, 404);"],
  ["if (!IS_WIN) return sendJSON(res, { error: 'Windows only' }, 400);", "if (!IS_WIN) return sendJSON(res, { error: t('windowsOnly') }, 400);"],
  ["return sendJSON(res, { error: 'File selection failed' }, 500);", "return sendJSON(res, { error: t('fileSelectFailed') }, 500);"],
  ["if (!IS_WIN) return sendJSON(res, { error: 'App launch is only supported on Windows desktop' }, 400);", "if (!IS_WIN) return sendJSON(res, { error: t('windowsOnly') }, 400);"],
  ["if (!app) return sendJSON(res, { error: 'app not found' }, 404);", "if (!app) return sendJSON(res, { error: t('appNotFound') }, 404);"],
  ["return sendJSON(res, { success: true, message: killLog + 'Launched' });", "return sendJSON(res, { success: true, message: killLog + t('appLaunched', app.name) });"],
  ["if (!IS_WIN) return sendJSON(res, { error: 'Windows desktop only' }, 400);", "if (!IS_WIN) return sendJSON(res, { error: t('windowsOnly') }, 400);"],
  ["if (!host || !port || !appPath) return sendJSON(res, { error: 'host, port, appPath are required' }, 400);", "if (!host || !port || !appPath) return sendJSON(res, { error: t('invalidProxyData') }, 400);"],
  ["return sendJSON(res, { success: true, message: killLog + 'Launched', proxy: proxyUrl, app: appPath });", "return sendJSON(res, { success: true, message: killLog + t('appLaunched', appName || 'app'), proxy: proxyUrl, app: appPath });"],
  ["console.error('GUI: Failed to fetch proxies via proxy-core, falling back to built-in proxies');", "console.error(t('apiError', 'Failed to fetch proxies via proxy-core'));"],
  ["console.log(\`  [*] Web GUI started: http://127.0.0.1:${port}\`);", "console.log(t('serverRunningOn', port));"],
  ["console.log(\`  [!] Port ${port} is already in use, trying ${port + 1}...\`);", "console.log(t('portInUse', port));"],
];

replacements.forEach(([search, replace]) => {
  code = code.split(search).join(replace);
});

fs.writeFileSync(serverPath, code, 'utf8');
console.log('i18n applied to server.js');
