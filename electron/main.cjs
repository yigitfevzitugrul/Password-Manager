const { app, BrowserWindow, ipcMain, Notification, Menu, shell, clipboard, session, powerMonitor } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const fs = require('fs');
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
const {
  createKey,
  encryptWithKey,
  decryptWithPassword,
  decryptWithKey,
  verifyPassword
} = require('./encryption.cjs');

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

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Yetkisiz istek.');
    return listener(event, ...args);
  });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
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

  // The master password itself is never kept: only the derived key lives in memory while unlocked.
  let currentUserId = null;
  let currentKey = null;
  let pending2FALogin = null;
  let pending2FASetupSecret = null;
  const MAX_2FA_ATTEMPTS = 5;
  const MAX_MASTER_PASSWORD_LENGTH = 1024;

  // --- Clipboard auto-clear ---
  const CLIPBOARD_CLEAR_MS = 30 * 1000;
  let clipboardSecret = null;
  let clipboardTimer = null;

  function clearClipboardIfOurs() {
    if (clipboardTimer) {
      clearTimeout(clipboardTimer);
      clipboardTimer = null;
    }
    if (clipboardSecret !== null) {
      try {
        if (clipboard.readText() === clipboardSecret) clipboard.clear();
      } catch (e) {
        console.error('Clipboard clear error:', e.message);
      }
      clipboardSecret = null;
    }
  }

  handle('copy-to-clipboard', (event, text) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 100000) return false;
    clearClipboardIfOurs();
    clipboard.writeText(text);
    clipboardSecret = text;
    clipboardTimer = setTimeout(clearClipboardIfOurs, CLIPBOARD_CLEAR_MS);
    return true;
  });

  function lockVault(notifyRenderer) {
    const wasUnlocked = currentUserId !== null || pending2FALogin !== null;
    if (currentKey) currentKey.key.fill(0);
    if (pending2FALogin) pending2FALogin.keyMaterial.key.fill(0);
    currentUserId = null;
    currentKey = null;
    pending2FALogin = null;
    pending2FASetupSecret = null;
    clearClipboardIfOurs();
    if (notifyRenderer && wasUnlocked && win && !win.isDestroyed()) {
      win.webContents.send('vault-locked');
    }
  }

  powerMonitor.on('lock-screen', () => lockVault(true));
  powerMonitor.on('suspend', () => lockVault(true));
  app.on('before-quit', () => lockVault(false));

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

  function registerFailedAttempt() {
    loginAttempts++;
    const lockoutDuration = getLockoutDuration(loginAttempts);
    if (lockoutDuration > 0) {
      lockoutUntil = Date.now() + lockoutDuration * 1000;
    }
    return lockoutDuration;
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

  handle('check-lockout', () => {
    return checkLockoutStatus();
  });

  // Get list of all accounts on this device
  handle('get-users', () => {
    const config = getUsersList();
    return {
      users: config.users.map(u => ({ id: u.id, username: u.username, createdAt: u.createdAt })),
      lastActiveUserId: config.lastActiveUserId
    };
  });

  handle('check-user', () => {
    const config = getUsersList();
    return config.users.length > 0;
  });

  // In-memory cache for pending email verification codes: email -> { code, expiresAt, attempts, firstName, lastName }
  const pendingEmailCodes = new Map();

  // Send 6-digit email verification code
  const MAX_EMAIL_CODE_ATTEMPTS = 5;
  const str = (value) => (typeof value === 'string' ? value : '');

  // Returns an error message, or null when the code matches. Too many wrong guesses burn the code.
  function checkEmailCode(email, code) {
    const pending = pendingEmailCodes.get(email);
    if (!pending) {
      return 'Bu e-posta için bekleyen bir doğrulama kodu bulunamadı. Lütfen tekrar kod gönderin.';
    }
    if (Date.now() > pending.expiresAt) {
      pendingEmailCodes.delete(email);
      return 'Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.';
    }
    if (!/^\d{6}$/.test(code) || !safeEqual(pending.code, code)) {
      pending.attempts++;
      if (pending.attempts >= MAX_EMAIL_CODE_ATTEMPTS) {
        pendingEmailCodes.delete(email);
        return 'Çok fazla hatalı deneme. Lütfen yeni bir kod isteyin.';
      }
      return 'Girdiğiniz doğrulama kodu hatalı.';
    }
    return null;
  }

  handle('send-email-code', async (event, data) => {
    const email = str(data && data.email).trim().toLowerCase();
    const firstName = str(data && data.firstName).trim();
    const lastName = str(data && data.lastName).trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Lütfen geçerli bir e-posta adresi girin.' };
    }

    const config = getUsersList();
    const emailExists = config.users.some(u => u.email && u.email.toLowerCase() === email);
    if (emailExists) {
      return { success: false, error: 'Bu e-posta adresi ile zaten kayıtlı bir hesap var.' };
    }

    // Generate random 6-digit verification code
    const code = crypto.randomInt(100000, 1000000).toString();
    pendingEmailCodes.set(email, {
      code,
      attempts: 0,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      firstName,
      lastName
    });

    // Native Windows OS notification
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: '🔐 Orenda Pass — Doğrulama Kodu',
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
  handle('verify-email-code', async (event, data) => {
    const email = str(data && data.email).trim().toLowerCase();
    const code = str(data && data.code).trim();

    const error = checkEmailCode(email, code);
    if (error) return { success: false, error };
    return { success: true };
  });

  // Create a brand new user account (Does NOT overwrite other users!)
  handle('register', async (event, payload) => {
    if (typeof payload !== 'object' || payload === null) {
      return { success: false, error: 'Geçersiz kayıt isteği.' };
    }

    const firstName = str(payload.firstName).trim();
    const lastName = str(payload.lastName).trim();
    const email = str(payload.email).trim().toLowerCase();
    const masterPassword = str(payload.password);
    const code = str(payload.code).trim();

    const username = `${firstName} ${lastName}`.trim();

    if (!firstName) {
      return { success: false, error: 'İsim alanı boş bırakılamaz.' };
    }
    if (!lastName) {
      return { success: false, error: 'Soyisim alanı boş bırakılamaz.' };
    }
    if (firstName.length > 64 || lastName.length > 64 || email.length > 254) {
      return { success: false, error: 'Girilen bilgiler çok uzun.' };
    }
    if (masterPassword.length < 8) {
      return { success: false, error: 'Şifre en az 8 karakter olmalıdır.' };
    }
    if (masterPassword.length > MAX_MASTER_PASSWORD_LENGTH) {
      return { success: false, error: 'Şifre çok uzun.' };
    }
    if (!email) {
      return { success: false, error: 'Lütfen önce e-posta adresinize doğrulama kodu gönderin.' };
    }

    const codeError = checkEmailCode(email, code);
    if (codeError) {
      return { success: false, error: codeError };
    }
    // Code is valid! Consume it
    pendingEmailCodes.delete(email);

    try {
      const keyMaterial = await createKey(masterPassword);
      const newUser = createNewUser({
        username,
        firstName,
        lastName,
        email
      });

      saveUserEncryptedData(newUser.id, encryptWithKey(JSON.stringify([]), keyMaterial));

      lockVault(false);
      currentUserId = newUser.id;
      currentKey = keyMaterial;
      loginAttempts = 0;
      lockoutUntil = 0;

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
      console.error('Registration error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Login with specific userId and password
  handle('login', async (event, userId, masterPassword) => {
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

    if (typeof masterPassword !== 'string' || masterPassword.length === 0 ||
        masterPassword.length > MAX_MASTER_PASSWORD_LENGTH) {
      return { success: false, error: 'Hatalı şifre.' };
    }

    const config = getUsersList();
    let targetUser = config.users.find(u => u.id === userId);

    // If userId not found, fallback to first user
    if (!targetUser && config.users.length > 0) {
      targetUser = config.users[0];
    }

    if (!targetUser) {
      return { success: false, error: 'Kayıtlı kullanıcı bulunamadı.' };
    }
    userId = targetUser.id;

    let data;
    try {
      data = readUserEncryptedData(userId);
    } catch (e) {
      data = null;
    }
    if (!data) return { success: false, error: 'Kullanıcı verisi bulunamadı.' };

    let decryptedJSON;
    let keyMaterial;
    try {
      const result = await decryptWithPassword(data, masterPassword);
      decryptedJSON = result.text;
      keyMaterial = result.keyMaterial;
    } catch (err) {
      const lockoutDuration = registerFailedAttempt();
      if (lockoutDuration > 0) {
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

    try {
      let vaultData = JSON.parse(decryptedJSON);
      if (!Array.isArray(vaultData)) vaultData = [];

      // 2FA fails closed: if it is enabled but the secret cannot be read, nobody gets in.
      let totpSecret = null;
      if (is2FAEnabled(userId)) {
        const encryptedSecret = read2FASecret(userId);
        if (!encryptedSecret) {
          return { success: false, error: '2FA verisi okunamadı. Giriş yapılamıyor.' };
        }
        try {
          totpSecret = keyMaterial
            ? decryptWithKey(encryptedSecret, keyMaterial)
            : (await decryptWithPassword(encryptedSecret, masterPassword)).text;
        } catch (e) {
          try {
            totpSecret = (await decryptWithPassword(encryptedSecret, masterPassword)).text;
          } catch (e2) {
            return { success: false, error: '2FA verisi çözülemedi. Giriş yapılamıyor.' };
          }
        }
      }

      // Vaults written by older versions use a weaker key derivation: upgrade them in place.
      if (!keyMaterial) {
        keyMaterial = await createKey(masterPassword);
        if (totpSecret !== null) {
          save2FASecret(userId, encryptWithKey(totpSecret, keyMaterial));
        }
        saveUserEncryptedData(userId, encryptWithKey(JSON.stringify(vaultData), keyMaterial));
      }

      lockVault(false);

      if (totpSecret !== null) {
        pending2FALogin = {
          userId,
          username: targetUser.username,
          keyMaterial,
          decryptedData: vaultData,
          totpSecret,
          attempts: 0,
          expiresAt: Date.now() + 5 * 60 * 1000
        };
        return {
          success: true,
          require2FA: true,
          userId
        };
      }

      currentUserId = userId;
      currentKey = keyMaterial;
      setLastActiveUser(userId);
      loginAttempts = 0;
      lockoutUntil = 0;

      return {
        success: true,
        data: vaultData,
        user: { id: targetUser.id, username: targetUser.username }
      };
    } catch (err) {
      console.error('Login error:', err.message);
      return { success: false, error: 'Kasa açılırken bir hata oluştu.' };
    }
  });

  // Verify 2FA code during login
  handle('verify-2fa-login', (event, code) => {
    if (!pending2FALogin || Date.now() > pending2FALogin.expiresAt) {
      if (pending2FALogin) lockVault(false);
      return { success: false, expired: true, error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' };
    }

    const cleanCode = str(code).replace(/\s+/g, '');
    const isValid = verifyTOTP(pending2FALogin.totpSecret, cleanCode);

    if (isValid) {
      currentUserId = pending2FALogin.userId;
      currentKey = pending2FALogin.keyMaterial;
      setLastActiveUser(currentUserId);
      const data = pending2FALogin.decryptedData;
      const user = { id: pending2FALogin.userId, username: pending2FALogin.username };

      pending2FALogin = null;
      loginAttempts = 0;
      lockoutUntil = 0;

      return { success: true, data, user };
    }

    pending2FALogin.attempts++;
    if (pending2FALogin.attempts >= MAX_2FA_ATTEMPTS) {
      lockVault(false);
      registerFailedAttempt();
      return {
        success: false,
        expired: true,
        error: 'Çok fazla hatalı 2FA denemesi. Lütfen tekrar giriş yapın.'
      };
    }
    return { success: false, error: 'Geçersiz 2FA doğrulama kodu.' };
  });

  handle('cancel-2fa-login', () => {
    if (pending2FALogin) lockVault(false);
    return { success: true };
  });

  // 2FA Setup & Status APIs for current user
  handle('get-2fa-status', () => {
    if (!currentUserId) return { enabled: false };
    return { enabled: is2FAEnabled(currentUserId) };
  });

  handle('setup-2fa', async () => {
    if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };

    const config = getUsersList();
    const user = config.users.find(u => u.id === currentUserId);
    const accountLabel = user ? user.username : 'Hesap';

    try {
      const secret = generateSecret(20);
      pending2FASetupSecret = secret;

      const otpauthUrl = `otpauth://totp/OrendaPass:${encodeURIComponent(accountLabel)}?secret=${secret}&issuer=OrendaPass&digits=6&period=30`;
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

  handle('enable-2fa', async (event, code) => {
    if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
    if (!pending2FASetupSecret) return { success: false, error: '2FA kurulumu başlatılmadı.' };

    const cleanCode = str(code).replace(/\s+/g, '');
    const isValid = verifyTOTP(pending2FASetupSecret, cleanCode);

    if (!isValid) {
      return { success: false, error: 'Doğrulama kodu hatalı. Lütfen authenticator uygulamanızdaki güncel kodu girin.' };
    }

    try {
      save2FASecret(currentUserId, encryptWithKey(pending2FASetupSecret, currentKey));
      save2FAConfig(currentUserId, true);
      pending2FASetupSecret = null;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  handle('disable-2fa', async (event, masterPassword) => {
    if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
    const userId = currentUserId;
    const key = currentKey;
    let passwordOk = false;
    try {
      passwordOk = await verifyPassword(masterPassword, key);
    } catch (e) {
      passwordOk = false;
    }
    if (currentUserId !== userId || currentKey !== key) {
      return { success: false, error: 'Oturum açık değil.' };
    }
    if (!passwordOk) {
      return { success: false, error: 'Ana şifre hatalı.' };
    }

    remove2FAData(currentUserId);
    pending2FASetupSecret = null;
    return { success: true };
  });

  const MAX_VAULT_ITEMS = 20000;
  const MAX_VAULT_BYTES = 20 * 1024 * 1024;

  handle('save-passwords', async (event, passwordsData) => {
    if (!currentUserId || !currentKey) throw new Error('Oturum açık değil.');

    if (!Array.isArray(passwordsData) || passwordsData.length > MAX_VAULT_ITEMS ||
        passwordsData.some(item => typeof item !== 'object' || item === null || Array.isArray(item))) {
      throw new Error('Geçersiz kasa verisi.');
    }

    const jsonStr = JSON.stringify(passwordsData);
    if (Buffer.byteLength(jsonStr, 'utf8') > MAX_VAULT_BYTES) {
      throw new Error('Kasa verisi çok büyük.');
    }
    saveUserEncryptedData(currentUserId, encryptWithKey(jsonStr, currentKey));
    return { success: true };
  });

  handle('change-password', async (event, oldPassword, newPassword) => {
    if (!currentUserId || !currentKey) throw new Error('Oturum açık değil.');
    const userId = currentUserId;
    const oldKey = currentKey;

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return { success: false, error: 'Şifre en az 8 karakter olmalıdır.' };
    }
    if (newPassword.length > MAX_MASTER_PASSWORD_LENGTH) {
      return { success: false, error: 'Şifre çok uzun.' };
    }

    try {
      if (!(await verifyPassword(oldPassword, oldKey))) {
        return { success: false, error: 'Eski şifre yanlış.' };
      }

      const newKey = await createKey(newPassword);
      if (currentUserId !== userId || currentKey !== oldKey) {
        return { success: false, error: 'Oturum açık değil.' };
      }

      // Decrypt everything first so nothing is written unless all of it can be re-encrypted.
      const jsonStr = decryptWithKey(readUserEncryptedData(userId), oldKey);
      let rawSecret = null;
      if (is2FAEnabled(userId)) {
        const encryptedSecret = read2FASecret(userId);
        if (!encryptedSecret) {
          return { success: false, error: 'Şifre değiştirme hatası: 2FA verisi okunamadı.' };
        }
        rawSecret = decryptWithKey(encryptedSecret, oldKey);
      }

      saveUserEncryptedData(userId, encryptWithKey(jsonStr, newKey));
      if (rawSecret !== null) {
        save2FASecret(userId, encryptWithKey(rawSecret, newKey));
      }

      currentKey = newKey;
      oldKey.key.fill(0);
      return { success: true };
    } catch (err) {
      console.error('Change password error:', err.message);
      return { success: false, error: 'Şifre değiştirme hatası: ' + err.message };
    }
  });

  handle('logout', () => {
    lockVault(false);
    return true;
  });

  // Have I Been Pwned check using k-Anonymity (SHA-1)
  handle('check-pwned-password', (event, password) => {
    return new Promise((resolve) => {
      if (typeof password !== 'string' || !password) {
        return resolve({ pwned: false, count: 0, error: 'Geçersiz istek' });
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
            'User-Agent': 'OrendaPass-App/1.0',
            'Add-Padding': 'true'
          },
          timeout: 6000
        };

        const req = https.request(options, (res) => {
          // A failed lookup must never be reported as "not breached"
          if (res.statusCode !== 200) {
            res.resume();
            return resolve({ pwned: false, count: 0, error: `Sunucu hatası (${res.statusCode})` });
          }
          let data = '';
          res.on('data', chunk => {
            data += chunk;
            if (data.length > 5 * 1024 * 1024) req.destroy(new Error('Yanıt çok büyük'));
          });
          res.on('end', () => {
            const lines = data.split(/\r?\n/);
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
          console.error('HIBP request error:', err.message);
          resolve({ pwned: false, count: 0, error: 'Bağlantı hatası' });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ pwned: false, count: 0, error: 'Zaman aşımı' });
        });

        req.end();
      } catch (err) {
        console.error('HIBP exception:', err.message);
        resolve({ pwned: false, count: 0, error: err.message });
      }
    });
  });

  handle('get-app-version', () => app.getVersion());
});
