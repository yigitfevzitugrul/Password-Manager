const { app, BrowserWindow, ipcMain, Menu, shell, session, powerMonitor } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const fs = require('fs');
// The vault logic is shared with the other platforms (ES modules in shared/)
const { createVaultService } = require('../shared/vaultService.js');
const nodePrimitives = require('./nodePrimitives.cjs');
const { createNodeStorage } = require('./nodeStorage.cjs');
const { createDesktopPlatform } = require('./desktopPlatform.cjs');

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public');

let win;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const DEV_URL = VITE_DEV_SERVER_URL || 'http://localhost:5173';
const INDEX_PATH = path.join(process.env.DIST, 'index.html');

function normalizeFsPath(p) {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// Only the app's own page may be shown in the window or talk to the main process.
function isAppUrl(url) {
  try {
    const parsed = new URL(url);
    if (app.isPackaged) {
      return parsed.protocol === 'file:' && normalizeFsPath(fileURLToPath(parsed)) === normalizeFsPath(INDEX_PATH);
    }
    return parsed.origin === new URL(DEV_URL).origin;
  } catch (e) {
    return false;
  }
}

function isTrustedSender(event) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== win.webContents.mainFrame) return false;
  return isAppUrl(frame.url);
}

// Every request the page may make is a function of the vault service; nothing else is exposed.
function exposeToPage(api) {
  for (const [name, method] of Object.entries(api)) {
    ipcMain.handle(name, (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error('Yetkisiz istek.');
      return method(...args);
    });
  }
}

function getAppIcon() {
  const candidates = [
    path.join(__dirname, '../Image/icon.ico'),
    path.join(__dirname, '../Image/icon.png'),
    path.join(__dirname, '../Image/ikon.jpg'),
    path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    path.join(process.env.VITE_PUBLIC, 'icon.png'),
    path.join(process.env.VITE_PUBLIC, 'ikon.jpg'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
}

function createWindow() {
  const appIcon = getAppIcon();

  win = new BrowserWindow({
    icon: appIcon,
    title: 'Orenda Pass',
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
    autoHideMenuBar: true,
  });

  if (appIcon) {
    try {
      win.setIcon(appIcon);
    } catch (e) {
      console.warn('Could not set window icon:', e.message);
    }
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  // Links never open inside the app: http(s) goes to the system browser, everything else is dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(parsed.toString());
      }
    } catch (e) {
      // ignore malformed URLs
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  if (!app.isPackaged) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(INDEX_PATH);
  }
}

// A release build must not be startable with a debugger attached to the unlocked vault.
if (app.isPackaged && process.argv.some(arg => /^--(remote-debugging-|inspect)/.test(arg))) {
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  // The app needs no web permissions (camera, geolocation, notifications from the page, ...)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  createWindow();

  const vault = createVaultService({
    primitives: nodePrimitives,
    storage: createNodeStorage(app.getPath('userData')),
    platform: createDesktopPlatform(() => win)
  });
  exposeToPage(vault.api);

  powerMonitor.on('lock-screen', () => vault.softLock(true));
  powerMonitor.on('suspend', () => vault.softLock(true));

  // Quitting locks the vault and waits for the clipboard to be cleared
  let clipboardClearedForQuit = false;
  app.on('before-quit', (event) => {
    vault.lock(false);
    if (!clipboardClearedForQuit) {
      event.preventDefault();
      vault.clipboardCleared().finally(() => {
        clipboardClearedForQuit = true;
        app.quit();
      });
    }
  });
});
