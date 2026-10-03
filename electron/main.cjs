const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { is2FAEnabled, save2FAConfig, save2FASecret, read2FASecret, remove2FAData } = require('./twoFactorAuth.cjs');
const { generateSecret, verifyTOTP } = require('./totp.cjs');

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public');

let win;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 650,
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

  let currentPassword = null;
  let pending2FALogin = null;
  let pending2FASetupSecret = null;

  // --- Login Attempt Limiting ---
  let loginAttempts = 0;
  let lockoutUntil = 0;
  const MAX_ATTEMPTS_BEFORE_FIRST_LOCK = 3;

  function getLockoutDuration(attempts) {
    if (attempts >= 10) return 60;
    if (attempts >= 5) return 30;
    if (attempts >= MAX_ATTEMPTS_BEFORE_FIRST_LOCK) return 15;
    return 0;
  }

  function getRemainingAttempts(attempts) {
    if (attempts < MAX_ATTEMPTS_BEFORE_FIRST_LOCK) return MAX_ATTEMPTS_BEFORE_FIRST_LOCK - attempts;
    if (attempts < 5) return 5 - attempts;
    if (attempts < 10) return 10 - attempts;
    return 0;
  }

  function checkLockoutStatus() {
    const now = Date.now();
    if (now < lockoutUntil) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((lockoutUntil - now) / 1000),
        attempts: loginAttempts
      };
    }
    return {
      locked: false,
      remainingSeconds: 0,
      attempts: loginAttempts,
      attemptsRemaining: getRemainingAttempts(loginAttempts)
    };
  }

  ipcMain.handle('check-lockout', () => {
    return checkLockoutStatus();
  });

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
      loginAttempts = 0;
      lockoutUntil = 0;
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('login', async (event, masterPassword) => {
    const now = Date.now();
    if (now < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
      return {
        success: false,
        locked: true,
        remainingSeconds,
        error: `Çok fazla hatalı deneme. ${remainingSeconds} saniye bekleyin.`
      };
    }

    const { decrypt } = require('./encryption.cjs');
    const { readEncryptedData } = require('./fileSystem.cjs');

    const data = readEncryptedData();
    if (!data) throw new Error('Veri bulunamadı.');

    try {
      const decryptedJSON = await decrypt(data, masterPassword);

      // Check if Account 2FA is enabled
      if (is2FAEnabled()) {
        const encryptedSecret = read2FASecret();
        if (encryptedSecret) {
          try {
            const totpSecret = await decrypt(encryptedSecret, masterPassword);
            pending2FALogin = {
              masterPassword,
              decryptedData: JSON.parse(decryptedJSON),
              totpSecret,
              expiresAt: Date.now() + 5 * 60 * 1000
            };
            return {
              success: true,
              require2FA: true
            };
          } catch (e) {
            console.error('Failed to decrypt 2FA secret:', e);
          }
        }
      }

      currentPassword = masterPassword;
      loginAttempts = 0;
      lockoutUntil = 0;
      pending2FALogin = null;
      return { success: true, data: JSON.parse(decryptedJSON) };
    } catch (err) {
      loginAttempts++;
      const lockoutDuration = getLockoutDuration(loginAttempts);
      if (lockoutDuration > 0) {
        lockoutUntil = Date.now() + lockoutDuration * 1000;
        return {
          success: false,
          locked: true,
          remainingSeconds: lockoutDuration,
          attempts: loginAttempts,
          error: 'Hatalı şifre.'
        };
      }
      return {
        success: false,
        locked: false,
        attempts: loginAttempts,
        attemptsRemaining: getRemainingAttempts(loginAttempts),
        error: 'Hatalı şifre.'
      };
    }
  });

  // Verify 2FA code during login
  ipcMain.handle('verify-2fa-login', (event, code) => {
    if (!pending2FALogin || Date.now() > pending2FALogin.expiresAt) {
      pending2FALogin = null;
      return { success: false, error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' };
    }

    const cleanCode = (code || '').replace(/\s+/g, '');
    const isValid = verifyTOTP(pending2FALogin.totpSecret, cleanCode);

    if (isValid) {
      currentPassword = pending2FALogin.masterPassword;
      const data = pending2FALogin.decryptedData;
      pending2FALogin = null;
      loginAttempts = 0;
      lockoutUntil = 0;
      return { success: true, data };
    } else {
      return { success: false, error: 'Geçersiz 2FA doğrulama kodu.' };
    }
  });

  ipcMain.handle('cancel-2fa-login', () => {
    pending2FALogin = null;
    return { success: true };
  });

  // 2FA Setup & Status APIs
  ipcMain.handle('get-2fa-status', () => {
    return { enabled: is2FAEnabled() };
  });

  ipcMain.handle('setup-2fa', async () => {
    if (!currentPassword) return { success: false, error: 'Oturum açık değil.' };

    try {
      const secret = generateSecret(20);
      pending2FASetupSecret = secret;

      const otpauthUrl = `otpauth://totp/SifreYonetici:Hesabim?secret=${secret}&issuer=SifreYonetici&digits=6&period=30`;
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      return {
        success: true,
        secret,
        qrCodeDataUrl
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('enable-2fa', async (event, code) => {
    if (!currentPassword) return { success: false, error: 'Oturum açık değil.' };
    if (!pending2FASetupSecret) return { success: false, error: '2FA kurulumu başlatılmadı.' };

    const cleanCode = (code || '').replace(/\s+/g, '');
    const isValid = verifyTOTP(pending2FASetupSecret, cleanCode);

    if (!isValid) {
      return { success: false, error: 'Doğrulama kodu hatalı. Lütfen authenticator uygulamanızdaki güncel kodu girin.' };
    }

    try {
      const { encrypt } = require('./encryption.cjs');
      const encryptedSecret = await encrypt(pending2FASetupSecret, currentPassword);
      save2FASecret(encryptedSecret);
      save2FAConfig(true);
      pending2FASetupSecret = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('disable-2fa', (event, masterPassword) => {
    if (!currentPassword) return { success: false, error: 'Oturum açık değil.' };
    if (masterPassword !== currentPassword) {
      return { success: false, error: 'Ana şifre hatalı.' };
    }

    remove2FAData();
    pending2FASetupSecret = null;
    return { success: true };
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

      // Re-encrypt 2FA secret if enabled
      if (is2FAEnabled()) {
        const encryptedSecret = read2FASecret();
        if (encryptedSecret) {
          try {
            const rawSecret = await decrypt(encryptedSecret, oldPassword);
            const reEncrypted = await encrypt(rawSecret, newPassword);
            save2FASecret(reEncrypted);
          } catch (e) {
            console.error('Error re-encrypting 2FA secret:', e);
          }
        }
      }

      currentPassword = newPassword;
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Şifre değiştirme hatası: ' + err.message };
    }
  });

  ipcMain.handle('logout', () => {
    currentPassword = null;
    pending2FALogin = null;
    pending2FASetupSecret = null;
    return true;
  });

  // Have I Been Pwned check using k-Anonymity (SHA-1)
  ipcMain.handle('check-pwned-password', (event, password) => {
    return new Promise((resolve) => {
      if (!password) {
        return resolve({ pwned: false, count: 0 });
      }

      try {
        const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);

        const options = {
          hostname: 'api.pwnedpasswords.com',
          path: `/range/${prefix}`,
          method: 'GET',
          headers: {
            'User-Agent': 'SifreYonetici-App/1.0',
            'Add-Padding': 'true'
          },
          timeout: 6000
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const lines = data.split('\r\n');
            let count = 0;
            for (const line of lines) {
              const [hashSuffix, occ] = line.split(':');
              if (hashSuffix && hashSuffix.trim() === suffix) {
                count = parseInt(occ, 10) || 0;
                break;
              }
            }
            resolve({ pwned: count > 0, count });
          });
        });

        req.on('error', (err) => {
          console.error('HIBP request error:', err);
          resolve({ pwned: false, count: 0, error: 'Bağlantı hatası' });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ pwned: false, count: 0, error: 'Zaman aşımı' });
        });

        req.end();
      } catch (err) {
        console.error('HIBP exception:', err);
        resolve({ pwned: false, count: 0, error: err.message });
      }
    });
  });

  ipcMain.handle('get-app-version', () => app.getVersion());
});
