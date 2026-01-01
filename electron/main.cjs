const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public');

let win;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });


  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  const devUrl = 'http://localhost:5173';

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    if (!app.isPackaged) {
      win.loadURL(devUrl);
    } else {
      win.loadFile(path.join(process.env.DIST, 'index.html'));
    }
  }
}


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
  createWindow();


  let sessionKey = null;


  async function setSessionKey(password, salt) {
  }

  let currentPassword = null;

  ipcMain.handle('check-user', () => {
    const { checkDataExists } = require('./fileSystem.cjs');
    return checkDataExists();
  });

  ipcMain.handle('register', async (event, masterPassword) => {
    const { encrypt } = require('./encryption.cjs');
    const { saveEncryptedData } = require('./fileSystem.cjs');

    const initialData = JSON.stringify([]);
    try {
      const encryptedBuffer = await encrypt(initialData, masterPassword);
      saveEncryptedData(encryptedBuffer);
      currentPassword = masterPassword;
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('login', async (event, masterPassword) => {
    const { decrypt } = require('./encryption.cjs');
    const { readEncryptedData } = require('./fileSystem.cjs');

    const data = readEncryptedData();
    if (!data) throw new Error('Veri bulunamadı.');

    try {
      const decryptedJSON = await decrypt(data, masterPassword);
      currentPassword = masterPassword;
      return { success: true, data: JSON.parse(decryptedJSON) };
    } catch (err) {
      return { success: false, error: 'Hatalı şifre.' };
    }
  });

  ipcMain.handle('save-passwords', async (event, passwordsData) => {
    if (!currentPassword) throw new Error('Oturum açık değil.');

    const { encrypt } = require('./encryption.cjs');
    const { saveEncryptedData } = require('./fileSystem.cjs');

    const jsonStr = JSON.stringify(passwordsData);
    const encryptedBuffer = await encrypt(jsonStr, currentPassword);
    saveEncryptedData(encryptedBuffer);
    return { success: true };
  });

  ipcMain.handle('change-password', async (event, oldPassword, newPassword) => {
    if (!currentPassword) throw new Error('Oturum açık değil.');

    if (oldPassword !== currentPassword) {
      return { success: false, error: 'Eski şifre yanlış.' };
    }

    const { encrypt, decrypt } = require('./encryption.cjs');
    const { readEncryptedData, saveEncryptedData } = require('./fileSystem.cjs');

    try {

      const encryptedDataBuffer = readEncryptedData();
      const jsonStr = await decrypt(encryptedDataBuffer, oldPassword);


      const newEncryptedBuffer = await encrypt(jsonStr, newPassword);


      saveEncryptedData(newEncryptedBuffer);


      currentPassword = newPassword;

      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Şifre değiştirme hatası: ' + err.message };
    }
  });

  ipcMain.handle('logout', () => {
    currentPassword = null;
    return true;
  });

  ipcMain.handle('get-app-version', () => app.getVersion());
});
