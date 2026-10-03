const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const QRCode = require('qrcode');
const {
  getUsersList,
  createNewUser,
  saveUserEncryptedData,
  readUserEncryptedData,
  checkUserVaultExists,
  setLastActiveUser
} = require('./fileSystem.cjs');
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

  let currentUserId = null;
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

  // Get list of all accounts on this device
  ipcMain.handle('get-users', () => {
    const config = getUsersList();
    return {
      users: config.users.map(u => ({ id: u.id, username: u.username, createdAt: u.createdAt })),
      lastActiveUserId: config.lastActiveUserId
    };
  });

  ipcMain.handle('check-user', () => {
    const config = getUsersList();
    return config.users.length > 0;
  });

  // In-memory cache for pending email verification codes: email -> { code, expiresAt, firstName, lastName }
  const pendingEmailCodes = new Map();

  // Send 6-digit email verification code
  ipcMain.handle('send-email-code', async (event, data) => {
    const email = (data && data.email ? data.email : '').trim().toLowerCase();
    const firstName = (data && data.firstName ? data.firstName : '').trim();
    const lastName = (data && data.lastName ? data.lastName : '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Lütfen geçerli bir e-posta adresi girin.' };
    }

    const config = getUsersList();
    const emailExists = config.users.some(u => u.email && u.email.toLowerCase() === email);
    if (emailExists) {
      return { success: false, error: 'Bu e-posta adresi ile zaten kayıtlı bir hesap var.' };
    }

    // Generate random 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    pendingEmailCodes.set(email, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      firstName,
      lastName
    });

    // Native Windows OS notification
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: '🔐 Şifre Yöneticisi — Doğrulama Kodu',
          body: `Doğrulama kodunuz: ${code}\nBu kod ${email} adresi için oluşturuldu. (10 dk geçerlidir)`
        });
        notif.show();
      }
    } catch (e) {
      console.error('Notification error:', e);
    }

    return {
      success: true,
      codePreview: code,
      message: `${email} adresine 6 haneli doğrulama kodu gönderildi.`
    };
  });

  // Verify email verification code
  ipcMain.handle('verify-email-code', async (event, data) => {
    const email = (data && data.email ? data.email : '').trim().toLowerCase();
    const code = (data && data.code ? data.code : '').trim();

    const pending = pendingEmailCodes.get(email);
    if (!pending) {
      return { success: false, error: 'Bu e-posta için bekleyen bir doğrulama kodu bulunamadı. Lütfen tekrar kod gönderin.' };
    }

    if (Date.now() > pending.expiresAt) {
      pendingEmailCodes.delete(email);
      return { success: false, error: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.' };
    }

    if (pending.code !== code) {
      return { success: false, error: 'Girdiğiniz doğrulama kodu hatalı.' };
    }

    return { success: true };
  });

  // Create a brand new user account (Does NOT overwrite other users!)
  ipcMain.handle('register', async (event, payload, legacyPassword) => {
    const { encrypt } = require('./encryption.cjs');
    let firstName = '', lastName = '', email = '', masterPassword = '', code = '';

    if (typeof payload === 'object' && payload !== null) {
      firstName = (payload.firstName || '').trim();
      lastName = (payload.lastName || '').trim();
      email = (payload.email || '').trim().toLowerCase();
      masterPassword = payload.password || payload.masterPassword || '';
      code = (payload.code || '').trim();
    } else {
      firstName = (payload || '').trim();
      masterPassword = legacyPassword || '';
    }

    const username = lastName ? `${firstName} ${lastName}`.trim() : firstName;

    if (!firstName) {
      return { success: false, error: 'İsim alanı boş bırakılamaz.' };
    }
    if (typeof payload === 'object' && !lastName) {
      return { success: false, error: 'Soyisim alanı boş bırakılamaz.' };
    }

    // Verify email & code if registering via full form
    if (typeof payload === 'object' && email) {
      const pending = pendingEmailCodes.get(email);
      if (!pending) {
        return { success: false, error: 'Lütfen önce e-posta adresinize doğrulama kodu gönderin.' };
      }
      if (Date.now() > pending.expiresAt) {
        pendingEmailCodes.delete(email);
        return { success: false, error: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' };
      }
      if (code && pending.code !== code) {
        return { success: false, error: 'Girdiğiniz doğrulama kodu hatalı.' };
      }
      // Code is valid! Consume it
      pendingEmailCodes.delete(email);
    }

    if (!masterPassword || masterPassword.length < 8) {
      return { success: false, error: 'Şifre en az 8 karakter olmalıdır.' };
    }

    try {
      const newUser = createNewUser({
        username,
        firstName,
        lastName,
        email
      });
      const initialData = JSON.stringify([]);
      const encryptedBuffer = await encrypt(initialData, masterPassword);

      saveUserEncryptedData(newUser.id, encryptedBuffer);

      currentUserId = newUser.id;
      currentPassword = masterPassword;
      loginAttempts = 0;
      lockoutUntil = 0;
      pending2FALogin = null;

      return {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email
        },
        data: []
      };
    } catch (err) {
      console.error('Registration error:', err);
      return { success: false, error: err.message };
    }
  });

  // Login with specific userId and password
  ipcMain.handle('login', async (event, userId, masterPassword) => {
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

    const config = getUsersList();
    let targetUser = config.users.find(u => u.id === userId);

    // If userId not found, fallback to first user
    if (!targetUser && config.users.length > 0) {
      targetUser = config.users[0];
      userId = targetUser.id;
    }

    if (!targetUser) {
      return { success: false, error: 'Kayıtlı kullanıcı bulunamadı.' };
    }

    const { decrypt } = require('./encryption.cjs');
    const data = readUserEncryptedData(userId);
    if (!data) return { success: false, error: 'Kullanıcı verisi bulunamadı.' };

    try {
      const decryptedJSON = await decrypt(data, masterPassword);

      // Check if this specific user has 2FA enabled
      if (is2FAEnabled(userId)) {
        const encryptedSecret = read2FASecret(userId);
        if (encryptedSecret) {
          try {
            const totpSecret = await decrypt(encryptedSecret, masterPassword);
            pending2FALogin = {
              userId,
              username: targetUser.username,
              masterPassword,
              decryptedData: JSON.parse(decryptedJSON),
              totpSecret,
              expiresAt: Date.now() + 5 * 60 * 1000
            };
            return {
              success: true,
              require2FA: true,
              userId
            };
          } catch (e) {
            console.error('Failed to decrypt 2FA secret for user:', e);
          }
        }
      }

      currentUserId = userId;
      currentPassword = masterPassword;
      setLastActiveUser(userId);
      loginAttempts = 0;
      lockoutUntil = 0;
      pending2FALogin = null;

      return {
        success: true,
        data: JSON.parse(decryptedJSON),
        user: { id: targetUser.id, username: targetUser.username }
      };
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
      currentUserId = pending2FALogin.userId;
      currentPassword = pending2FALogin.masterPassword;
      setLastActiveUser(currentUserId);
      const data = pending2FALogin.decryptedData;
      const user = { id: pending2FALogin.userId, username: pending2FALogin.username };

      pending2FALogin = null;
      loginAttempts = 0;
      lockoutUntil = 0;

      return { success: true, data, user };
    } else {
      return { success: false, error: 'Geçersiz 2FA doğrulama kodu.' };
    }
  });

  ipcMain.handle('cancel-2fa-login', () => {
    pending2FALogin = null;
    return { success: true };
  });

  // 2FA Setup & Status APIs for current user
  ipcMain.handle('get-2fa-status', () => {
    if (!currentUserId) return { enabled: false };
    return { enabled: is2FAEnabled(currentUserId) };
  });

  ipcMain.handle('setup-2fa', async () => {
    if (!currentUserId || !currentPassword) return { success: false, error: 'Oturum açık değil.' };

    const config = getUsersList();
    const user = config.users.find(u => u.id === currentUserId);
    const accountLabel = user ? user.username : 'Hesap';

    try {
      const secret = generateSecret(20);
      pending2FASetupSecret = secret;

      const otpauthUrl = `otpauth://totp/SifreYonetici:${encodeURIComponent(accountLabel)}?secret=${secret}&issuer=SifreYonetici&digits=6&period=30`;
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
    if (!currentUserId || !currentPassword) return { success: false, error: 'Oturum açık değil.' };
    if (!pending2FASetupSecret) return { success: false, error: '2FA kurulumu başlatılmadı.' };

    const cleanCode = (code || '').replace(/\s+/g, '');
    const isValid = verifyTOTP(pending2FASetupSecret, cleanCode);

    if (!isValid) {
      return { success: false, error: 'Doğrulama kodu hatalı. Lütfen authenticator uygulamanızdaki güncel kodu girin.' };
    }

    try {
      const { encrypt } = require('./encryption.cjs');
      const encryptedSecret = await encrypt(pending2FASetupSecret, currentPassword);
      save2FASecret(currentUserId, encryptedSecret);
      save2FAConfig(currentUserId, true);
      pending2FASetupSecret = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('disable-2fa', (event, masterPassword) => {
    if (!currentUserId || !currentPassword) return { success: false, error: 'Oturum açık değil.' };
    if (masterPassword !== currentPassword) {
      return { success: false, error: 'Ana şifre hatalı.' };
    }

    remove2FAData(currentUserId);
    pending2FASetupSecret = null;
    return { success: true };
  });

  ipcMain.handle('save-passwords', async (event, passwordsData) => {
    if (!currentUserId || !currentPassword) throw new Error('Oturum açık değil.');

    const { encrypt } = require('./encryption.cjs');
    const jsonStr = JSON.stringify(passwordsData);
    const encryptedBuffer = await encrypt(jsonStr, currentPassword);
    saveUserEncryptedData(currentUserId, encryptedBuffer);
    return { success: true };
  });

  ipcMain.handle('change-password', async (event, oldPassword, newPassword) => {
    if (!currentUserId || !currentPassword) throw new Error('Oturum açık değil.');

    if (oldPassword !== currentPassword) {
      return { success: false, error: 'Eski şifre yanlış.' };
    }

    const { encrypt, decrypt } = require('./encryption.cjs');

    try {
      const encryptedDataBuffer = readUserEncryptedData(currentUserId);
      const jsonStr = await decrypt(encryptedDataBuffer, oldPassword);
      const newEncryptedBuffer = await encrypt(jsonStr, newPassword);
      saveUserEncryptedData(currentUserId, newEncryptedBuffer);

      // Re-encrypt 2FA secret if enabled
      if (is2FAEnabled(currentUserId)) {
        const encryptedSecret = read2FASecret(currentUserId);
        if (encryptedSecret) {
          try {
            const rawSecret = await decrypt(encryptedSecret, oldPassword);
            const reEncrypted = await encrypt(rawSecret, newPassword);
            save2FASecret(currentUserId, reEncrypted);
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
    currentUserId = null;
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
