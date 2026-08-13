/**
 * Free Proxy Tool - Electron Desktop App
 * 整合：完整 GUI 服务器 + 独立 Chromium(Blink) 浏览器
 * 所有外部链接（Google注册、任意网页）全部用内置窗口打开，不依赖用户默认浏览器
 */

const { app, BrowserWindow, session, Menu, shell, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const net = require('net');

const PROJECT_ROOT = path.join(__dirname, '..');
const GUI_PORT = 3000;
const PROXY_PORT = 1080;
const NEW_TAB_HTML = 'file:///' + path.join(PROJECT_ROOT, 'browser', 'app', 'index.html').replace(/\\/g, '/');

let mainWindow = null;
let guiServer = null;
let actualGuiPort = GUI_PORT;

// ========== 启动完整 GUI 服务器 ==========
async function startGuiServer() {
  const gui = require(path.join(PROJECT_ROOT, 'gui', 'server.js'));
  return new Promise((resolve) => {
    guiServer = gui;
    gui.start(GUI_PORT, {
      openBrowser: false,
      onPort: (port) => { actualGuiPort = port; resolve(port); }
    });
    setTimeout(() => resolve(actualGuiPort), 2000);
  });
}

// ========== 检查端口占用 ==========
function checkPort(port) {
  return new Promise(r => {
    const c = net.createConnection({ port, host: '127.0.0.1' }, () => { c.destroy(); r(true); });
    c.on('error', () => { c.destroy(); r(false); });
    c.setTimeout(1000, () => { c.destroy(); r(false); });
  });
}

// ========== 绑定 Chromium 代理（走 127.0.0.1:PROXY_PORT） ==========
async function bindChromiumProxy() {
  try {
    const ready = await checkPort(PROXY_PORT);
    if (!ready) {
      console.log('[Browser] Proxy port not ready yet, waiting up to 8s...');
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (await checkPort(PROXY_PORT)) break;
      }
    }
    await session.defaultSession.setProxy({
      proxyRules: `http://127.0.0.1:${PROXY_PORT}`,
      proxyBypassRules: '<local>'
    });
    console.log('[Browser] Chromium proxy bound → 127.0.0.1:' + PROXY_PORT);
  } catch (e) {
    console.warn('[Browser] Proxy bind failed:', e.message);
  }
}

// ========== 创建独立浏览器窗口 ==========
function createBrowserWindow(url) {
  const targetUrl = url || NEW_TAB_HTML;
  const w = new BrowserWindow({
    width: 1280, height: 820, minWidth: 800, minHeight: 500,
    title: 'Free Proxy Browser',
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(PROJECT_ROOT, 'browser', 'app', 'preload.js')
    },
    icon: path.join(PROJECT_ROOT, 'icon.ico')
  });
  w.once('ready-to-show', () => w.show());
  w.loadURL(targetUrl);
  w.setMenu(null);

  // Ctrl+T 开新标签页
  w.webContents.on('before-input-event', (e, i) => {
    if ((i.control || i.meta) && i.key === 't' && i.type === 'keyDown') {
      e.preventDefault();
      createBrowserWindow(NEW_TAB_HTML);
    }
    if ((i.control || i.meta) && i.key === 'n' && i.type === 'keyDown') {
      e.preventDefault();
      createBrowserWindow(NEW_TAB_HTML);
    }
  });

  // ⚠️ 关键：外部链接全部用内置窗口打开，绝不调用默认浏览器
  w.webContents.setWindowOpenHandler(({ url: openedUrl }) => {
    createBrowserWindow(openedUrl);
    return { action: 'deny' };
  });

  return w;
}

// ========== 创建管理面板窗口 ==========
function createPanelWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 650,
    title: 'Free Proxy Tool',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(PROJECT_ROOT, 'browser', 'app', 'preload.js')
    },
    backgroundColor: '#0f172a',
    show: false,
    icon: path.join(PROJECT_ROOT, 'icon.ico')
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });

  // ⚠️ 关键：管理面板里的链接也用内置浏览器窗口打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    createBrowserWindow(url);
    return { action: 'deny' };
  });
}

// ========== 文件对话框（自定义壁纸） ==========
ipcMain.handle('open-image-dialog', async () => {
  try {
    const r = await dialog.showOpenDialog(mainWindow || undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','gif','bmp','webp','svg'] }]
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    const filePath = r.filePaths[0];
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeMap = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', bmp:'image/bmp', webp:'image/webp', svg:'image/svg+xml' };
    const fs = require('fs');
    const data = fs.readFileSync(filePath);
    return 'data:' + (mimeMap[ext] || 'image/png') + ';base64,' + data.toString('base64');
  } catch (e) {
    console.error('Wallpaper dialog failed:', e.message);
    return null;
  }
});

// ========== 菜单 ==========
function buildMenu(port) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: '管理面板 / Management Panel', accelerator: 'CmdOrCtrl+1', click: () => {
        if (!mainWindow) createPanelWindow(port); else { mainWindow.focus(); mainWindow.loadURL(`http://127.0.0.1:${port}`); }
      }},
      { label: '独立浏览器 / Dedicated Browser', accelerator: 'CmdOrCtrl+2', click: () => createBrowserWindow(NEW_TAB_HTML) },
      { label: 'Google 注册页 / Signup', accelerator: 'CmdOrCtrl+3', click: () => createBrowserWindow('https://accounts.google.com/signup') },
      { type: 'separator' },
      { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => BrowserWindow.getFocusedWindow()?.webContents.reload() },
      { label: '在外部浏览器打开', accelerator: 'CmdOrCtrl+Shift+B', click: () => shell.openExternal(`http://127.0.0.1:${port}`) },
      { type: 'separator' },
      { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]},
    { label: 'Edit', submenu: [
      { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
    ]},
    { label: 'View', submenu: [
      { label: '开发者工具', accelerator: 'F12', click: () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools() },
      { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
      { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }
    ]},
    { label: '帮助', submenu: [
      { label: '关于', click: () => {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'About', message: 'Free Proxy Tool v2.1',
          detail: '独立 Chromium 浏览器 + 完整 GUI\nBuilt-in Proxy:127.0.0.1:1080\n面板: http://127.0.0.1:' + port + '\n\n完全不依赖外部浏览器'
        });
      }}
    ]}
  ]));
}

// ========== 启动 ==========
app.whenReady().then(async () => {
  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  ⚡ Free Proxy Tool - Desktop App          ║');
  console.log('  ║  Engine: Electron Chromium (Blink)         ║');
  console.log('  ║  Built-in Proxy → 127.0.0.1:' + PROXY_PORT + '            ║');
  console.log('  ║  Panel → http://127.0.0.1:' + GUI_PORT + '             ║');
  console.log('  ║  Links open in INTERNAL window             ║');
  console.log('  ║  NEVER uses the system default browser     ║');
  console.log('  ╚════════════════════════════════════════════╝');
  console.log('');

  try {
    const port = await startGuiServer();
    buildMenu(port);
    bindChromiumProxy(); // 异步，不阻塞面板显示

    globalShortcut.register('CommandOrControl+T', () => createBrowserWindow(NEW_TAB_HTML));
    globalShortcut.register('CommandOrControl+N', () => createBrowserWindow(NEW_TAB_HTML));

    // 🔑 启动时第一个窗口：独立浏览器的 New Tab Dashboard（file:///browser/app/index.html）
    // 用户要的是 file:///D:/free-proxy-tool/browser/app/index.html 作为默认主页/首屏。
    // 管理面板仍可通过 菜单 File / Ctrl+1 打开。
    createBrowserWindow(NEW_TAB_HTML);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createBrowserWindow(NEW_TAB_HTML);
    });
  } catch (err) {
    console.error('Startup failed:', err);
    dialog.showErrorBox('启动失败', err.message || String(err));
    app.quit();
  }
});

// ========== 清理 ==========
function cleanup() {
  try { globalShortcut.unregisterAll(); } catch {}
  if (guiServer) { try { guiServer.stop(); } catch {} guiServer = null; }
}

app.on('window-all-closed', () => { cleanup(); app.quit(); });
app.on('before-quit', () => { cleanup(); });
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e.message));
