/**
 * Free Proxy Tool - Electron Desktop App
 * Wraps the full Web GUI (gui/server.js) into a desktop application.
 * All API routes, proxy management, Google signup, etc. are available.
 */

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const GUI_PORT = 3000;

let mainWindow = null;
let guiServer = null;
let actualPort = GUI_PORT;

// ========== Start the full GUI server ==========
async function startGuiServer() {
  const gui = require(path.join(PROJECT_ROOT, 'gui', 'server.js'));
  return new Promise((resolve) => {
    guiServer = gui;
    gui.start(GUI_PORT, {
      openBrowser: false, // Electron loads the URL itself
      onPort: (port) => { actualPort = port; resolve(port); }
    });
    // Fallback resolve in case onPort isn't called (e.g. EADDRINUSE retry)
    setTimeout(() => resolve(actualPort), 2000);
  });
}

// ========== Window ==========
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 650,
    title: 'Free Proxy Tool',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#0f172a',
    show: false,
    icon: path.join(PROJECT_ROOT, 'icon.ico')
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links (http/https) in the system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
      { label: 'Open in Browser', accelerator: 'CmdOrCtrl+Shift+B', click: () => shell.openExternal(`http://127.0.0.1:${actualPort}`) },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]},
    { label: 'Help', submenu: [
      { label: 'About', click: () => {
        require('electron').dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'About', message: 'Free Proxy Tool v2.0',
          detail: 'Free Proxy Tool\nWARP + Free Proxy + Google Signup\n\nGUI Version'
        });
      }}
    ]}
  ]));
}

// ========== App lifecycle ==========
app.whenReady().then(async () => {
  try {
    const port = await startGuiServer();
    createWindow(port);
  } catch (err) {
    console.error('Failed to start:', err);
    require('electron').dialog.showErrorBox('Startup Error', err.message || String(err));
    app.quit();
  }
});

function cleanup() {
  if (guiServer) {
    try { guiServer.stop(); } catch {}
    guiServer = null;
  }
}

app.on('window-all-closed', () => { cleanup(); app.quit(); });
app.on('before-quit', () => { cleanup(); });
