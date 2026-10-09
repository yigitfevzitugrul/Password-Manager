/**
 * Vault service: everything the UI can ask for (accounts, login, saving, 2FA, key file,
 * quick unlock PIN, backups...), independent of the platform it runs on.
 *
 * The host supplies three things:
 *   primitives - cryptographic primitives (electron/nodePrimitives.cjs, shared/noblePrimitives.js)
 *   storage    - synchronous storage of the app's own files (see shared/vaultStore.js)
 *   platform   - host services:
 *       getVersion() -> string
 *       notifyLocked()                                   the vault was locked without the UI asking
 *       clipboard.readText() / writeText(text) / clear()
 *       openExternal(url)
 *       httpGet({ hostname, path, headers, timeoutMs, maxBytes }) -> Promise<{ status, body }>
 *                                                        rejects; error.code is 'TIMEOUT' on timeouts
 *       makeQrDataUrl(text) -> Promise<string>
 *       saveFile({ title, defaultName, filters, data }) -> Promise<{ canceled } | { canceled: false, path }>
 *       openFile({ title, filters, maxBytes })
 *                -> Promise<{ canceled } | { canceled: false, tooLarge } | { canceled: false, path, name, data }>
 *       readFile(path, maxBytes) -> Promise<Uint8Array>   a file the user picked earlier (key file)
 *       notifyVaultChanged({ items, revision })          entries changed without the UI asking (sync)
 *       getDeviceName() -> string
 *       syncTargets() -> ('folder' | 'drive')[]         where this host can sync to (optional: ['folder'])
 *       pickFolder({ title, target }) -> Promise<{ canceled } | { canceled: false, path }>
 *       listFolder(path) -> Promise<{ name, size, mtimeMs }[]>
 *       readFolderFile(path, name, maxBytes) -> Promise<Uint8Array>
 *       writeFolderFile(path, name, bytes) -> Promise
 *       removeFolderFile(path, name) -> Promise
 *
 * `api` holds one function per UI request; its keys are the single list of what the UI may call.
 */
import { utf8ToBytes, bytesToHex, bytesToBase64, base64ToBytes, bytesEqual, copyBytes, baseName } from './bytes.js';
import { createVaultCrypto } from './vaultCrypto.js';
import { createVaultStore } from './vaultStore.js';
import { createTotp } from './totp.js';
import { generateKeyFile, parseKeyFile, MAX_KEY_FILE_BYTES } from './keyFile.js';
import { ensureItemIds, applyUiChanges, mergeStates, sanitizeState, pruneTombstones } from './vaultSync.js';
import { isDriveFolder } from './driveFolder.js';

const MAX_2FA_ATTEMPTS = 5;
const MIN_MASTER_PASSWORD_LENGTH = 12; // for new passwords; existing shorter ones still log in
const MAX_MASTER_PASSWORD_LENGTH = 1024;

const CLIPBOARD_CLEAR_OPTIONS = [10, 30, 60, 120, 0]; // seconds, 0 = never clear

const QUICK_UNLOCK_MAX_ATTEMPTS = 3;
const QUICK_UNLOCK_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const PIN_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

const MAX_ATTEMPTS_BEFORE_FIRST_LOCK = 3;

const MAX_VAULT_ITEMS = 20000;
const MAX_VAULT_BYTES = 20 * 1024 * 1024;

const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;
const BACKUP_FILTERS = [
    { name: 'Orenda Pass Yedeği', extensions: ['opbackup', 'enc'] },
    { name: 'Tüm Dosyalar', extensions: ['*'] }
];
const KEY_FILE_FILTERS = [
    { name: 'Orenda Pass Anahtar Dosyası', extensions: ['opkey'] },
    { name: 'Tüm Dosyalar', extensions: ['*'] }
];

// --- Sync through a folder the user chose (typically inside a cloud drive) ---
// Every device writes only its own file and reads the others, so two devices never overwrite each other.
const SYNC_FILE_PATTERN = /^orenda-sync-([a-f0-9]{16})-([a-f0-9]{16})\.opsync$/;
const KEYRING_PATTERN = /^orenda-sync-([a-f0-9]{16})\.opkeyring$/;
const syncFileName = (vaultId, deviceId) => `orenda-sync-${vaultId}-${deviceId}.opsync`;
const keyringName = (vaultId) => `orenda-sync-${vaultId}.opkeyring`;
const MAX_SYNC_FILE_BYTES = 50 * 1024 * 1024;
const MAX_KEYRING_BYTES = 64 * 1024;
const SYNC_AFTER_UNLOCK_MS = 1500;
const SYNC_AFTER_SAVE_MS = 3000;
const SYNC_INTERVAL_MS = 60 * 1000;

const RELEASES_API_PATH = '/repos/yigitfevzitugrul/Password-Manager/releases/latest';
const RELEASES_PAGE_URL = 'https://github.com/yigitfevzitugrul/Password-Manager/releases/latest';

const str = (value) => (typeof value === 'string' ? value : '');

export function createVaultService({ primitives, storage, platform }) {
    const {
        createKey,
        encryptWithKey,
        decryptWithPassword,
        decryptWithKey,
        verifyPassword,
        requiresKeyFile
    } = createVaultCrypto(primitives);
    const store = createVaultStore(storage, primitives);
    const { generateSecret, verifyTOTP } = createTotp(primitives);

    const api = {};

    // The master password itself is never kept: only the derived key lives in memory while unlocked.
    let currentUserId = null;
    let currentKey = null;
    // The unlocked account's entries as they are in the vault right now
    let sessionItems = null;
    // What the UI has been given, by revision number. The UI says which revision a save is based
    // on, so entries merged in from another device that it has not shown yet are never lost.
    let uiRevision = 0;
    const uiStates = new Map();

    function rememberUiState(items) {
        uiRevision++;
        uiStates.set(uiRevision, items);
        for (const revision of [...uiStates.keys()]) {
            if (revision <= uiRevision - 5) uiStates.delete(revision);
        }
        return uiRevision;
    }

    function tellUiVaultChanged() {
        platform.notifyVaultChanged({ items: sessionItems, revision: rememberUiState(sessionItems) });
    }
    let pending2FALogin = null;
    let pending2FASetupSecret = null;
    let pendingBackup = null;
    // Key file picked on the login screen, waiting for the next login attempt: { userId, secret, path }
    let pendingKeyFile = null;

    // --- Clipboard auto-clear ---
    let clipboardClearMs = 30 * 1000;
    let clipboardSecret = null;
    let clipboardTimer = null;
    let clipboardClearing = Promise.resolve();

    // The clipboard is asynchronous, so clearing returns a promise.
    // It is only cleared when it still holds what this app put there.
    function clearClipboardIfOurs() {
        if (clipboardTimer) {
            clearTimeout(clipboardTimer);
            clipboardTimer = null;
        }
        if (clipboardSecret !== null) {
            const secret = clipboardSecret;
            clipboardSecret = null;
            clipboardClearing = clipboardClearing
                .then(() => platform.clipboard.readText())
                .then(current => {
                    if (current === secret) return platform.clipboard.clear();
                })
                .catch(e => console.error('Clipboard clear error:', e.message));
        }
        return clipboardClearing;
    }

    api.copyToClipboard = async (text) => {
        if (typeof text !== 'string' || text.length === 0 || text.length > 100000) return false;
        await clearClipboardIfOurs();
        await platform.clipboard.writeText(text);
        if (clipboardClearMs > 0) {
            clipboardSecret = text;
            clipboardTimer = setTimeout(clearClipboardIfOurs, clipboardClearMs);
        }
        return true;
    };

    api.setClipboardClearSeconds = (seconds) => {
        if (!CLIPBOARD_CLEAR_OPTIONS.includes(seconds)) return false;
        clipboardClearMs = seconds * 1000;
        return true;
    };

    function wipeKey(keyMaterial) {
        keyMaterial.key.fill(0);
        if (keyMaterial.keyFileSecret) keyMaterial.keyFileSecret.fill(0);
    }

    function lockVault(notifyUi) {
        const wasUnlocked = currentUserId !== null || pending2FALogin !== null;
        if (currentKey) wipeKey(currentKey);
        if (pending2FALogin) wipeKey(pending2FALogin.keyMaterial);
        currentUserId = null;
        currentKey = null;
        sessionItems = null;
        uiStates.clear();
        pending2FALogin = null;
        pending2FASetupSecret = null;
        pendingBackup = null;
        quickPin = null;
        dropSync();
        dropSuspended();
        clearClipboardIfOurs();
        if (notifyUi && wasUnlocked) {
            platform.notifyLocked();
        }
    }

    // Everything that has to happen when an account becomes unlocked.
    // Returns the revision number of the entries the UI is about to receive.
    function openSession(userId, keyMaterial, items) {
        currentUserId = userId;
        currentKey = keyMaterial;
        sessionItems = items;
        uiStates.clear();
        loadQuickPin();
        loadSync();
        return rememberUiState(items);
    }

    const randomId = () => bytesToHex(primitives.randomBytes(16));

    // Timers must not keep a test process or a closing app alive
    function startTimer(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
        return timer;
    }

    // --- Quick unlock PIN ---
    // The PIN never decrypts anything. After an automatic lock the key stays in memory ("suspended")
    // and the PIN only releases it; closing the app or too many wrong PINs require the master password.
    let quickPin = null; // { salt, hash } of the unlocked account's PIN, null when not set
    let suspended = null; // { userId, username, keyMaterial, pin, attempts, timer }

    function hashPin(pin, salt) {
        return primitives.scryptSync(utf8ToBytes(pin), salt, PIN_SCRYPT_PARAMS, 32);
    }

    // The PIN hash is stored encrypted with the vault key, so it is unreadable while locked
    function loadQuickPin() {
        quickPin = null;
        try {
            const file = store.readQuickPin(currentUserId);
            if (file === null) return;
            const parsed = JSON.parse(decryptWithKey(file, currentKey));
            quickPin = { salt: base64ToBytes(parsed.salt), hash: base64ToBytes(parsed.hash) };
        } catch (e) {
            quickPin = null;
        }
    }

    function saveQuickPin() {
        const payload = JSON.stringify({
            salt: bytesToBase64(quickPin.salt),
            hash: bytesToBase64(quickPin.hash)
        });
        store.writeQuickPin(currentUserId, encryptWithKey(payload, currentKey));
    }

    function dropSuspended() {
        if (!suspended) return;
        clearTimeout(suspended.timer);
        wipeKey(suspended.keyMaterial);
        suspended = null;
    }

    // Automatic lock: with a quick unlock PIN the session is suspended, otherwise fully locked
    function softLock(notifyUi) {
        if (!currentUserId || !currentKey || !quickPin) {
            lockVault(notifyUi);
            return false;
        }

        const user = store.getUsersList().users.find(u => u.id === currentUserId);
        dropSuspended();
        suspended = {
            userId: currentUserId,
            username: user ? user.username : '',
            keyMaterial: currentKey,
            pin: quickPin,
            attempts: 0,
            timer: startTimer(dropSuspended, QUICK_UNLOCK_MAX_AGE_MS)
        };

        currentUserId = null;
        currentKey = null;
        sessionItems = null;
        uiStates.clear();
        quickPin = null;
        dropSync();
        pending2FASetupSecret = null;
        pendingBackup = null;
        clearClipboardIfOurs();
        if (notifyUi) {
            platform.notifyLocked();
        }
        return true;
    }

    api.autoLock = () => ({ quickUnlock: softLock(false) });

    api.getQuickUnlockState = () => {
        if (!suspended) return { available: false };
        return { available: true, userId: suspended.userId, username: suspended.username };
    };

    api.quickUnlock = (pin) => {
        if (!suspended) {
            return { success: false, expired: true, error: 'Hızlı açma süresi doldu. Ana şifrenizle giriş yapın.' };
        }

        const candidate = hashPin(typeof pin === 'string' ? pin : '', suspended.pin.salt);
        if (!primitives.timingSafeEqual(candidate, suspended.pin.hash)) {
            suspended.attempts++;
            if (suspended.attempts >= QUICK_UNLOCK_MAX_ATTEMPTS) {
                dropSuspended();
                return { success: false, expired: true, error: 'Çok fazla hatalı PIN. Ana şifrenizle giriş yapın.' };
            }
            return {
                success: false,
                attemptsRemaining: QUICK_UNLOCK_MAX_ATTEMPTS - suspended.attempts,
                error: 'Hatalı PIN.'
            };
        }

        try {
            let data = JSON.parse(decryptWithKey(store.readVault(suspended.userId), suspended.keyMaterial));
            if (!Array.isArray(data)) data = [];

            const resumed = suspended;
            clearTimeout(resumed.timer);
            suspended = null;
            lockVault(false);

            const revision = openSession(resumed.userId, resumed.keyMaterial, data);
            return { success: true, data, revision, user: { id: resumed.userId, username: resumed.username } };
        } catch (err) {
            console.error('Quick unlock error:', err.message);
            dropSuspended();
            return { success: false, expired: true, error: 'Kasa açılamadı. Ana şifrenizle giriş yapın.' };
        }
    };

    // --- Login Attempt Limiting ---
    let loginAttempts = 0;
    let lockoutUntil = 0;

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

    api.checkLockout = () => {
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
    };

    // Get list of all accounts on this device
    api.getUsers = () => {
        const config = store.getUsersList();
        return {
            users: config.users.map(u => ({ id: u.id, username: u.username, createdAt: u.createdAt })),
            lastActiveUserId: config.lastActiveUserId
        };
    };

    api.checkUser = () => store.getUsersList().users.length > 0;

    // Create a brand new user account (Does NOT overwrite other users!)
    api.register = async (payload) => {
        if (typeof payload !== 'object' || payload === null) {
            return { success: false, error: 'Geçersiz kayıt isteği.' };
        }

        const firstName = str(payload.firstName).trim();
        const lastName = str(payload.lastName).trim();
        const masterPassword = str(payload.password);

        const username = `${firstName} ${lastName}`.trim();

        if (!firstName) {
            return { success: false, error: 'İsim alanı boş bırakılamaz.' };
        }
        if (!lastName) {
            return { success: false, error: 'Soyisim alanı boş bırakılamaz.' };
        }
        if (firstName.length > 64 || lastName.length > 64) {
            return { success: false, error: 'Girilen bilgiler çok uzun.' };
        }
        if (masterPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
            return { success: false, error: 'Şifre en az 12 karakter olmalıdır.' };
        }
        if (masterPassword.length > MAX_MASTER_PASSWORD_LENGTH) {
            return { success: false, error: 'Şifre çok uzun.' };
        }
        try {
            const keyMaterial = await createKey(masterPassword);
            const newUser = store.createNewUser({ username, firstName, lastName });

            store.writeVault(newUser.id, encryptWithKey(JSON.stringify([]), keyMaterial));

            lockVault(false);
            const revision = openSession(newUser.id, keyMaterial, []);
            loginAttempts = 0;
            lockoutUntil = 0;

            return {
                success: true,
                revision,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    firstName: newUser.firstName,
                    lastName: newUser.lastName
                },
                data: []
            };
        } catch (err) {
            console.error('Registration error:', err.message);
            return { success: false, error: err.message };
        }
    };

    async function readKeyFileAt(filePath) {
        return parseKeyFile(await platform.readFile(filePath, MAX_KEY_FILE_BYTES));
    }

    // Login with specific userId and password
    api.login = async (userId, masterPassword) => {
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

        const config = store.getUsersList();
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
            data = store.readVault(userId);
        } catch (e) {
            data = null;
        }
        if (!data) return { success: false, error: 'Kullanıcı verisi bulunamadı.' };

        // Vaults protected by a key file need it before the password can even be checked
        const keyFileRequired = requiresKeyFile(data);
        let keyFileSecret = null;
        let keyFilePath = null;
        if (keyFileRequired) {
            if (pendingKeyFile && pendingKeyFile.userId === userId) {
                keyFileSecret = copyBytes(pendingKeyFile.secret);
                keyFilePath = pendingKeyFile.path;
            } else if (typeof targetUser.keyFilePath === 'string') {
                try {
                    keyFileSecret = await readKeyFileAt(targetUser.keyFilePath);
                    keyFilePath = targetUser.keyFilePath;
                } catch (e) {
                    keyFileSecret = null;
                }
            }
            if (!keyFileSecret) {
                return {
                    success: false,
                    needsKeyFile: true,
                    keyFileRequired: true,
                    keyFileName: typeof targetUser.keyFilePath === 'string' ? baseName(targetUser.keyFilePath) : null
                };
            }
        }

        let decryptedJSON;
        let keyMaterial;
        try {
            const result = await decryptWithPassword(data, masterPassword, keyFileSecret);
            decryptedJSON = result.text;
            keyMaterial = result.keyMaterial;
        } catch (err) {
            const error = keyFileRequired ? 'Hatalı şifre veya anahtar dosyası.' : 'Hatalı şifre.';
            const lockoutDuration = registerFailedAttempt();
            if (lockoutDuration > 0) {
                return {
                    success: false,
                    locked: true,
                    remainingSeconds: lockoutDuration,
                    attempts: loginAttempts,
                    keyFileRequired,
                    error
                };
            }
            return {
                success: false,
                locked: false,
                attempts: loginAttempts,
                attemptsRemaining: getRemainingAttempts(loginAttempts),
                keyFileRequired,
                error
            };
        }

        try {
            let vaultData = JSON.parse(decryptedJSON);
            if (!Array.isArray(vaultData)) vaultData = [];
            vaultData = vaultData.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item));
            // Entries are told apart by their id when devices are merged; very old vaults may lack some
            const withIds = ensureItemIds(vaultData, randomId);
            vaultData = withIds.items;

            // 2FA fails closed: if it is enabled but the secret cannot be read, nobody gets in.
            let totpSecret = null;
            if (store.is2FAEnabled(userId)) {
                const encryptedSecret = store.read2FASecret(userId);
                if (!encryptedSecret) {
                    return { success: false, error: '2FA verisi okunamadı. Giriş yapılamıyor.' };
                }
                try {
                    totpSecret = keyMaterial
                        ? decryptWithKey(encryptedSecret, keyMaterial)
                        : (await decryptWithPassword(encryptedSecret, masterPassword)).text;
                } catch (e) {
                    try {
                        totpSecret = (await decryptWithPassword(encryptedSecret, masterPassword, keyFileSecret)).text;
                    } catch (e2) {
                        return { success: false, error: '2FA verisi çözülemedi. Giriş yapılamıyor.' };
                    }
                }
            }

            // Vaults written by older versions use a weaker key derivation: upgrade them in place.
            if (!keyMaterial) {
                keyMaterial = await createKey(masterPassword);
                if (totpSecret !== null) {
                    store.save2FASecret(userId, encryptWithKey(totpSecret, keyMaterial));
                }
                store.writeVault(userId, encryptWithKey(JSON.stringify(vaultData), keyMaterial));
            } else if (withIds.changed) {
                store.writeVault(userId, encryptWithKey(JSON.stringify(vaultData), keyMaterial));
            }

            lockVault(false);

            if (keyFileRequired) {
                if (pendingKeyFile) pendingKeyFile.secret.fill(0);
                pendingKeyFile = null;
                if (keyFilePath && targetUser.keyFilePath !== keyFilePath) {
                    store.setUserKeyFilePath(userId, keyFilePath);
                }
            }

            try {
                store.createAutoBackup(userId);
            } catch (e) {
                console.error('Auto backup error:', e.message);
            }

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

            const revision = openSession(userId, keyMaterial, vaultData);
            store.setLastActiveUser(userId);
            loginAttempts = 0;
            lockoutUntil = 0;

            return {
                success: true,
                data: vaultData,
                revision,
                user: { id: targetUser.id, username: targetUser.username }
            };
        } catch (err) {
            console.error('Login error:', err.message);
            return { success: false, error: 'Kasa açılırken bir hata oluştu.' };
        }
    };

    // Verify 2FA code during login
    api.verify2FALogin = (code) => {
        if (!pending2FALogin || Date.now() > pending2FALogin.expiresAt) {
            if (pending2FALogin) lockVault(false);
            return { success: false, expired: true, error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' };
        }

        const cleanCode = str(code).replace(/\s+/g, '');
        const isValid = verifyTOTP(pending2FALogin.totpSecret, cleanCode);

        if (isValid) {
            const data = pending2FALogin.decryptedData;
            const revision = openSession(pending2FALogin.userId, pending2FALogin.keyMaterial, data);
            store.setLastActiveUser(currentUserId);
            const user = { id: pending2FALogin.userId, username: pending2FALogin.username };

            pending2FALogin = null;
            loginAttempts = 0;
            lockoutUntil = 0;

            return { success: true, data, revision, user };
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
    };

    api.cancel2FALogin = () => {
        if (pending2FALogin) lockVault(false);
        return { success: true };
    };

    // 2FA Setup & Status APIs for current user
    api.get2FAStatus = () => {
        if (!currentUserId) return { enabled: false };
        return { enabled: store.is2FAEnabled(currentUserId) };
    };

    api.setup2FA = async () => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };

        const user = store.getUsersList().users.find(u => u.id === currentUserId);
        const accountLabel = user ? user.username : 'Hesap';

        try {
            const secret = generateSecret(20);
            pending2FASetupSecret = secret;

            const otpauthUrl = `otpauth://totp/OrendaPass:${encodeURIComponent(accountLabel)}?secret=${secret}&issuer=OrendaPass&digits=6&period=30`;
            const qrCodeDataUrl = await platform.makeQrDataUrl(otpauthUrl);

            return {
                success: true,
                secret,
                qrCodeDataUrl
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    api.enable2FA = async (code) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (!pending2FASetupSecret) return { success: false, error: '2FA kurulumu başlatılmadı.' };

        const cleanCode = str(code).replace(/\s+/g, '');
        const isValid = verifyTOTP(pending2FASetupSecret, cleanCode);

        if (!isValid) {
            return { success: false, error: 'Doğrulama kodu hatalı. Lütfen authenticator uygulamanızdaki güncel kodu girin.' };
        }

        try {
            store.save2FASecret(currentUserId, encryptWithKey(pending2FASetupSecret, currentKey));
            store.save2FAConfig(currentUserId, true);
            pending2FASetupSecret = null;
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    // Checks the master password against the session key without disturbing the session
    async function confirmMasterPassword(masterPassword) {
        const userId = currentUserId;
        const key = currentKey;
        let passwordOk = false;
        try {
            passwordOk = await verifyPassword(masterPassword, key);
        } catch (e) {
            passwordOk = false;
        }
        if (currentUserId !== userId || currentKey !== key) return { error: 'Oturum açık değil.' };
        if (!passwordOk) return { error: 'Ana şifre hatalı.' };
        return { userId, key };
    }

    api.disable2FA = async (masterPassword) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };

        const confirmed = await confirmMasterPassword(masterPassword);
        if (confirmed.error) return { success: false, error: confirmed.error };

        store.remove2FAData(currentUserId);
        pending2FASetupSecret = null;
        return { success: true };
    };

    // `baseRevision` is the revision of the entries the UI was working from (see rememberUiState)
    api.savePasswords = async (passwordsData, baseRevision) => {
        if (!currentUserId || !currentKey) throw new Error('Oturum açık değil.');

        if (!Array.isArray(passwordsData) || passwordsData.length > MAX_VAULT_ITEMS ||
            passwordsData.some(item => typeof item !== 'object' || item === null || Array.isArray(item))) {
            throw new Error('Geçersiz kasa verisi.');
        }

        const now = Date.now();
        const next = ensureItemIds(passwordsData, randomId).items;
        const base = uiStates.get(baseRevision) || uiStates.get(uiRevision) || [];
        const { items, removedIds, unseen } = applyUiChanges(base, next, sessionItems || [], now);

        const jsonStr = JSON.stringify(items);
        if (items.length > MAX_VAULT_ITEMS || utf8ToBytes(jsonStr).length > MAX_VAULT_BYTES) {
            throw new Error('Kasa verisi çok büyük.');
        }
        store.writeVault(currentUserId, encryptWithKey(jsonStr, currentKey));
        sessionItems = items;
        const revision = rememberUiState(next);

        if (sync) {
            if (removedIds.length > 0) {
                for (const id of removedIds) sync.tombstones[id] = now;
                saveSync();
            }
            scheduleSync(SYNC_AFTER_SAVE_MS);
        }
        // The vault holds more than the UI just sent: bring the UI up to date
        if (unseen) tellUiVaultChanged();
        return { success: true, revision };
    };

    // Re-encrypts everything a user owns (vault, 2FA secret, automatic backups) with a new key
    // and makes it the session key. Nothing is written unless all of it can be decrypted first.
    // Synchronous on purpose: nothing else may run between reading with the old key and
    // the session switching to the new one.
    function rekeyUser(userId, oldKey, newKey) {
        const jsonStr = decryptWithKey(store.readVault(userId), oldKey);
        let rawSecret = null;
        if (store.is2FAEnabled(userId)) {
            const encryptedSecret = store.read2FASecret(userId);
            if (!encryptedSecret) throw new Error('2FA verisi okunamadı.');
            rawSecret = decryptWithKey(encryptedSecret, oldKey);
        }

        store.writeVault(userId, encryptWithKey(jsonStr, newKey));
        if (rawSecret !== null) {
            store.save2FASecret(userId, encryptWithKey(rawSecret, newKey));
        }

        // Old backups must not stay readable with the previous key
        for (const backup of store.listAutoBackups(userId)) {
            try {
                const backupJson = decryptWithKey(store.readAutoBackup(userId, backup.name), oldKey);
                store.writeAutoBackup(userId, backup.name, encryptWithKey(backupJson, newKey));
            } catch (e) {
                console.error('Backup re-encryption skipped:', backup.name);
            }
        }

        currentKey = newKey;
        wipeKey(oldKey);
        if (quickPin) saveQuickPin();
        if (sync) saveSync();
    }

    api.changePassword = async (oldPassword, newPassword) => {
        if (!currentUserId || !currentKey) throw new Error('Oturum açık değil.');
        const userId = currentUserId;
        const oldKey = currentKey;

        if (typeof newPassword !== 'string' || newPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
            return { success: false, error: 'Şifre en az 12 karakter olmalıdır.' };
        }
        if (newPassword.length > MAX_MASTER_PASSWORD_LENGTH) {
            return { success: false, error: 'Şifre çok uzun.' };
        }

        try {
            if (!(await verifyPassword(oldPassword, oldKey))) {
                return { success: false, error: 'Eski şifre yanlış.' };
            }

            const newKey = await createKey(
                newPassword,
                oldKey.keyFileSecret ? copyBytes(oldKey.keyFileSecret) : null
            );
            if (currentUserId !== userId || currentKey !== oldKey) {
                return { success: false, error: 'Oturum açık değil.' };
            }

            rekeyUser(userId, oldKey, newKey);
            await refreshKeyring(newPassword);
            return { success: true };
        } catch (err) {
            console.error('Change password error:', err.message);
            return { success: false, error: 'Şifre değiştirme hatası: ' + err.message };
        }
    };

    // --- Key file (second factor that is part of the encryption key) ---

    // Login screen: pick the key file for an account before logging in
    api.selectKeyFile = async (userId) => {
        const user = store.getUsersList().users.find(u => u.id === userId);
        if (!user) return { success: false, error: 'Kayıtlı kullanıcı bulunamadı.' };

        try {
            const picked = await platform.openFile({ filters: KEY_FILE_FILTERS, maxBytes: MAX_KEY_FILE_BYTES });
            if (picked.canceled) return { success: false, canceled: true };
            if (picked.tooLarge) throw new Error('Geçersiz anahtar dosyası.');

            const secret = parseKeyFile(picked.data);
            if (pendingKeyFile) pendingKeyFile.secret.fill(0);
            pendingKeyFile = { userId: user.id, secret, path: picked.path };
            return { success: true, keyFileName: picked.name };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    api.getKeyFileStatus = () => {
        if (!currentUserId || !currentKey) return { enabled: false };
        const user = store.getUsersList().users.find(u => u.id === currentUserId);
        return {
            enabled: Boolean(currentKey.keyFileSecret),
            path: user && typeof user.keyFilePath === 'string' ? user.keyFilePath : null
        };
    };

    api.enableKeyFile = async (masterPassword) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (currentKey.keyFileSecret) return { success: false, error: 'Anahtar dosyası zaten etkin.' };

        const confirmed = await confirmMasterPassword(masterPassword);
        if (confirmed.error) return { success: false, error: confirmed.error };
        const { userId, key: oldKey } = confirmed;

        try {
            const { secret, content } = generateKeyFile(primitives);
            const saved = await platform.saveFile({
                title: 'Anahtar dosyasını kaydedin (tercihen bir USB belleğe)',
                defaultName: 'orenda-pass.opkey',
                filters: KEY_FILE_FILTERS,
                data: utf8ToBytes(content)
            });
            if (saved.canceled) return { success: false, canceled: true };

            // The key file must be safely stored before anything is encrypted with it
            if (!bytesEqual(await readKeyFileAt(saved.path), secret)) {
                throw new Error('Anahtar dosyası doğrulanamadı.');
            }

            const newKey = await createKey(masterPassword, secret);
            if (currentUserId !== userId || currentKey !== oldKey) {
                return { success: false, error: 'Oturum açık değil.' };
            }
            rekeyUser(userId, oldKey, newKey);
            store.setUserKeyFilePath(userId, saved.path);
            await refreshKeyring(masterPassword);
            return { success: true, path: saved.path };
        } catch (err) {
            console.error('Enable key file error:', err.message);
            return { success: false, error: 'Anahtar dosyası etkinleştirilemedi: ' + err.message };
        }
    };

    api.disableKeyFile = async (masterPassword) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (!currentKey.keyFileSecret) return { success: false, error: 'Anahtar dosyası etkin değil.' };

        const confirmed = await confirmMasterPassword(masterPassword);
        if (confirmed.error) return { success: false, error: confirmed.error };
        const { userId, key: oldKey } = confirmed;

        try {
            const newKey = await createKey(masterPassword);
            if (currentUserId !== userId || currentKey !== oldKey) {
                return { success: false, error: 'Oturum açık değil.' };
            }
            rekeyUser(userId, oldKey, newKey);
            store.setUserKeyFilePath(userId, null);
            await refreshKeyring(masterPassword);
            return { success: true };
        } catch (err) {
            console.error('Disable key file error:', err.message);
            return { success: false, error: 'Anahtar dosyası kapatılamadı: ' + err.message };
        }
    };

    api.getQuickPinStatus = () => ({ enabled: Boolean(currentUserId && currentKey && quickPin) });

    api.setQuickPin = async (masterPassword, pin) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)) {
            return { success: false, error: 'PIN 4 ile 12 hane arasında, yalnızca rakamlardan oluşmalıdır.' };
        }

        const confirmed = await confirmMasterPassword(masterPassword);
        if (confirmed.error) return { success: false, error: confirmed.error };

        try {
            const salt = primitives.randomBytes(16);
            quickPin = { salt, hash: hashPin(pin, salt) };
            saveQuickPin();
            return { success: true };
        } catch (err) {
            quickPin = null;
            return { success: false, error: 'PIN kaydedilemedi: ' + err.message };
        }
    };

    api.disableQuickPin = () => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        try {
            store.removeQuickPin(currentUserId);
        } catch (err) {
            return { success: false, error: 'PIN kaldırılamadı: ' + err.message };
        }
        quickPin = null;
        return { success: true };
    };

    // --- Sync between devices ---
    // The user picks a folder (usually inside a cloud drive). Each device keeps one encrypted file
    // there with its whole vault and merges the files of the other devices into its own vault.
    // The files are encrypted with a random sync key; the "keyring" file holds that key encrypted
    // with the master password, which is how a new device joins.
    let sync = null; // { vaultId, deviceId, folder, key, salt, tombstones, seen, lastWritten, lastSyncAt, error }
    let syncTimer = null;
    let syncRunning = null;
    let syncAgain = false;

    const syncKeyMaterial = (state) => ({ key: state.key, salt: state.salt, keyFileSecret: null });

    function dropSync() {
        clearTimeout(syncTimer);
        syncTimer = null;
        if (sync) sync.key.fill(0);
        sync = null;
    }

    // Sync settings are stored encrypted with the vault key, like the quick unlock PIN
    function loadSync() {
        dropSync();
        try {
            const file = store.readSync(currentUserId);
            if (file === null) return;
            const parsed = JSON.parse(decryptWithKey(file, currentKey));
            sync = {
                vaultId: parsed.vaultId,
                deviceId: parsed.deviceId,
                folder: parsed.folder,
                key: base64ToBytes(parsed.key),
                salt: base64ToBytes(parsed.salt),
                tombstones: sanitizeState({ tombstones: parsed.tombstones }).tombstones,
                seen: new Map(), // other devices' files already merged: name -> { signature, deviceName, writtenAt }
                lastWritten: null,
                lastSyncAt: null,
                error: null
            };
            scheduleSync(SYNC_AFTER_UNLOCK_MS);
        } catch (e) {
            console.error('Sync settings could not be read:', e.message);
            sync = null;
        }
    }

    function saveSync() {
        const payload = JSON.stringify({
            vaultId: sync.vaultId,
            deviceId: sync.deviceId,
            folder: sync.folder,
            key: bytesToBase64(sync.key),
            salt: bytesToBase64(sync.salt),
            tombstones: sync.tombstones
        });
        store.writeSync(currentUserId, encryptWithKey(payload, currentKey));
    }

    function scheduleSync(delayMs) {
        if (!sync) return;
        clearTimeout(syncTimer);
        syncTimer = startTimer(() => { runSync().catch(() => {}); }, delayMs);
    }

    function getSyncStatus() {
        if (!currentUserId || !currentKey || !sync) return { enabled: false };
        return {
            enabled: true,
            folder: sync.folder,
            lastSyncAt: sync.lastSyncAt,
            error: sync.error,
            devices: [...sync.seen.values()]
                .map(device => ({ name: device.deviceName, lastSeenAt: device.writtenAt }))
                .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        };
    }

    // One sync at a time; a request that arrives meanwhile triggers another round afterwards
    function runSync() {
        if (!sync || !currentUserId || !currentKey) return Promise.resolve({ success: false, error: 'Eşitleme açık değil.' });
        if (syncRunning) {
            syncAgain = true;
            return syncRunning;
        }
        syncRunning = syncOnce().finally(() => {
            syncRunning = null;
            if (syncAgain) {
                syncAgain = false;
                scheduleSync(0);
            } else {
                scheduleSync(SYNC_INTERVAL_MS);
            }
        });
        return syncRunning;
    }

    async function syncOnce() {
        const state = sync;
        const userId = currentUserId;
        const stillOpen = () => sync === state && currentUserId === userId && currentKey !== null;

        try {
            // 1. Read what the other devices wrote (slow part; the vault may change meanwhile)
            const entries = await platform.listFolder(state.folder);
            const ownName = syncFileName(state.vaultId, state.deviceId);
            const incoming = [];
            for (const entry of entries) {
                const match = SYNC_FILE_PATTERN.exec(entry.name);
                if (!match || match[1] !== state.vaultId || entry.name === ownName) continue;
                if (entry.size > MAX_SYNC_FILE_BYTES) continue;

                const signature = `${entry.size}:${entry.mtimeMs}`;
                const known = state.seen.get(entry.name);
                if (known && known.signature === signature) continue;

                try {
                    const data = await platform.readFolderFile(state.folder, entry.name, MAX_SYNC_FILE_BYTES);
                    const parsed = JSON.parse(decryptWithKey(data, syncKeyMaterial(state)));
                    if (!parsed || parsed.type !== 'sync' || parsed.vaultId !== state.vaultId) continue;
                    incoming.push({
                        name: entry.name,
                        signature,
                        deviceName: str(parsed.deviceName) || 'Cihaz',
                        writtenAt: typeof parsed.writtenAt === 'number' ? parsed.writtenAt : entry.mtimeMs,
                        state: sanitizeState(parsed)
                    });
                } catch (e) {
                    // Still being uploaded by the cloud drive, or not readable: tried again next round
                }
            }
            if (!stillOpen()) return { success: false, error: 'Oturum açık değil.' };

            // 2. Merge into the vault as it is right now. No waiting from here until the vault is
            //    written, so a save from the UI cannot slip in between.
            const now = Date.now();
            let merged = { items: sessionItems, tombstones: state.tombstones };
            let itemsChanged = false;
            for (const remote of incoming) {
                const result = mergeStates(merged, remote.state);
                merged = { items: result.items, tombstones: result.tombstones };
                itemsChanged = itemsChanged || result.itemsChanged;
                state.seen.set(remote.name, {
                    signature: remote.signature,
                    deviceName: remote.deviceName,
                    writtenAt: remote.writtenAt
                });
            }
            // Devices whose file is gone are no longer listed
            for (const name of [...state.seen.keys()]) {
                if (!entries.some(entry => entry.name === name)) state.seen.delete(name);
            }

            const tombstones = pruneTombstones(merged.tombstones, now);
            if (itemsChanged) {
                const jsonStr = JSON.stringify(merged.items);
                if (merged.items.length > MAX_VAULT_ITEMS || utf8ToBytes(jsonStr).length > MAX_VAULT_BYTES) {
                    throw new Error('Birleştirilen kasa çok büyük.');
                }
                store.writeVault(userId, encryptWithKey(jsonStr, currentKey));
                sessionItems = merged.items;
            }
            if (JSON.stringify(tombstones) !== JSON.stringify(state.tombstones)) {
                state.tombstones = tombstones;
                saveSync();
            }

            // 3. Publish this device's state when it differs from what it last wrote
            const content = JSON.stringify({ items: sessionItems, tombstones: state.tombstones });
            let ownFile = null;
            if (content !== state.lastWritten || !entries.some(entry => entry.name === ownName)) {
                ownFile = encryptWithKey(JSON.stringify({
                    app: 'OrendaPass',
                    type: 'sync',
                    version: 1,
                    vaultId: state.vaultId,
                    deviceId: state.deviceId,
                    deviceName: platform.getDeviceName(),
                    writtenAt: now,
                    items: sessionItems,
                    tombstones: state.tombstones
                }), syncKeyMaterial(state));
            }

            state.lastSyncAt = now;
            state.error = null;
            if (itemsChanged) tellUiVaultChanged();

            if (ownFile) {
                await platform.writeFolderFile(state.folder, ownName, ownFile);
                if (sync === state) state.lastWritten = content;
            }
            return { success: true, changed: itemsChanged };
        } catch (err) {
            console.error('Sync error:', err.message);
            if (sync === state) state.error = err.message;
            return { success: false, error: 'Eşitleme yapılamadı: ' + err.message };
        }
    }

    // The keyring lets a new device obtain the sync key with the master password (and key file)
    async function writeKeyring(state, masterPassword, keyFileSecret) {
        const user = store.getUsersList().users.find(u => u.id === currentUserId) || {};
        const keyMaterial = await createKey(masterPassword, keyFileSecret ? copyBytes(keyFileSecret) : null);
        const encrypted = encryptWithKey(JSON.stringify({
            app: 'OrendaPass',
            type: 'sync-keyring',
            version: 1,
            vaultId: state.vaultId,
            key: bytesToBase64(state.key),
            salt: bytesToBase64(state.salt),
            // lets another device add this account under the same name
            account: { username: str(user.username), firstName: str(user.firstName), lastName: str(user.lastName) }
        }), keyMaterial);
        wipeKey(keyMaterial);
        await platform.writeFolderFile(state.folder, keyringName(state.vaultId), encrypted);
    }

    // Looks for a keyring in the folder that the master password (and key file) opens.
    // keyFileNeeded: a keyring exists that wants a key file and none was given.
    async function openKeyring(folder, masterPassword, keyFileSecret) {
        const keyrings = (await platform.listFolder(folder))
            .filter(entry => KEYRING_PATTERN.test(entry.name) && entry.size <= MAX_KEYRING_BYTES);
        let keyFileNeeded = false;
        for (const entry of keyrings) {
            try {
                const data = await platform.readFolderFile(folder, entry.name, MAX_KEYRING_BYTES);
                const secret = keyFileSecret ? copyBytes(keyFileSecret) : null;
                const parsed = JSON.parse((await decryptWithPassword(data, masterPassword, secret)).text);
                if (parsed.type !== 'sync-keyring' || parsed.vaultId !== KEYRING_PATTERN.exec(entry.name)[1]) continue;
                return {
                    count: keyrings.length,
                    keyFileNeeded: false,
                    found: {
                        vaultId: parsed.vaultId,
                        key: base64ToBytes(parsed.key),
                        salt: base64ToBytes(parsed.salt),
                        usesKeyFile: requiresKeyFile(data),
                        account: typeof parsed.account === 'object' && parsed.account !== null ? parsed.account : {}
                    }
                };
            } catch (e) {
                // protected by another master password or key file
                if (e.code === 'KEYFILE_REQUIRED') keyFileNeeded = true;
            }
        }
        return { count: keyrings.length, keyFileNeeded, found: null };
    }

    function newSyncState(folder, found) {
        return {
            vaultId: found ? found.vaultId : bytesToHex(primitives.randomBytes(8)),
            deviceId: bytesToHex(primitives.randomBytes(8)),
            folder,
            key: found ? found.key : primitives.randomBytes(32),
            salt: found ? found.salt : primitives.randomBytes(32),
            tombstones: {},
            seen: new Map(),
            lastWritten: null,
            lastSyncAt: null,
            error: null
        };
    }

    // After the master password or the key file changed: new devices must join with the current ones
    async function refreshKeyring(masterPassword) {
        const state = sync;
        if (!state) return;
        try {
            await writeKeyring(state, masterPassword, currentKey ? currentKey.keyFileSecret : null);
        } catch (err) {
            console.error('Keyring update error:', err.message);
            if (sync === state) state.error = 'Eşitleme anahtarlığı güncellenemedi: ' + err.message;
        }
    }

    api.getSyncStatus = () => getSyncStatus();

    // Where this device can sync to: a folder the user picks and/or their Google Drive
    const syncTargets = () => (platform.syncTargets ? platform.syncTargets() : ['folder']);
    api.getSyncTargets = () => syncTargets();

    function checkSyncTarget(target) {
        const targets = syncTargets();
        const chosen = target === undefined || target === null ? targets[0] : target;
        return targets.includes(chosen) ? chosen : null;
    }

    api.enableSync = async (masterPassword, target) => {
        const syncTarget = checkSyncTarget(target);
        if (!syncTarget) return { success: false, error: 'Bu cihazda bu eşitleme yöntemi kullanılamıyor.' };
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (sync) return { success: false, error: 'Eşitleme zaten açık.' };

        const confirmed = await confirmMasterPassword(masterPassword);
        if (confirmed.error) return { success: false, error: confirmed.error };
        const { userId, key: sessionKey } = confirmed;
        const sessionChanged = () => currentUserId !== userId || currentKey !== sessionKey || sync !== null;

        try {
            const picked = await platform.pickFolder({
                title: 'Eşitleme klasörünü seçin (örneğin bulut sürücünüzün içinde)',
                target: syncTarget
            });
            if (picked.canceled) return { success: false, canceled: true };
            const folder = picked.path;

            // Join the sync that already lives in this folder, if the master password opens its keyring
            const { found, count } = await openKeyring(folder, masterPassword, sessionKey.keyFileSecret);
            if (sessionChanged()) return { success: false, error: 'Oturum açık değil.' };
            // (the user's Drive may hold the vaults of several accounts next to each other)
            if (!found && count > 0 && syncTarget !== 'drive') {
                return {
                    success: false,
                    error: 'Bu klasördeki eşitleme verisi farklı bir ana şifreyle veya anahtar dosyasıyla korunuyor. ' +
                        'Katılmak için bu cihazda aynı ana şifreyi kullanın ya da boş bir klasör seçin.'
                };
            }

            const state = newSyncState(folder, found);
            if (!found) {
                await writeKeyring(state, masterPassword, sessionKey.keyFileSecret);
                if (sessionChanged()) return { success: false, error: 'Oturum açık değil.' };
            }

            sync = state;
            saveSync();
            // A failed first round does not undo the setup; the status carries the error
            await runSync();
            return { success: true, joined: Boolean(found), status: getSyncStatus() };
        } catch (err) {
            console.error('Enable sync error:', err.message);
            return { success: false, error: 'Eşitleme açılamadı: ' + err.message };
        }
    };

    // Login screen: "my account is already on another device". Creates the account on this device
    // from the sync folder: same name, same master password (and key file), same entries.
    api.joinSyncedAccount = async (masterPassword, target) => {
        const syncTarget = checkSyncTarget(target);
        if (!syncTarget) return { success: false, error: 'Bu cihazda bu eşitleme yöntemi kullanılamıyor.' };
        const now = Date.now();
        if (now < lockoutUntil) {
            const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
            return { success: false, error: `Çok fazla hatalı deneme. ${remainingSeconds} saniye bekleyin.` };
        }
        if (typeof masterPassword !== 'string' || masterPassword.length === 0 ||
            masterPassword.length > MAX_MASTER_PASSWORD_LENGTH) {
            return { success: false, error: 'Lütfen ana şifrenizi girin.' };
        }

        try {
            const picked = await platform.pickFolder({
                title: 'Diğer cihazınızda seçtiğiniz eşitleme klasörünü seçin',
                target: syncTarget
            });
            if (picked.canceled) return { success: false, canceled: true };
            const folder = picked.path;

            let keyFileSecret = null;
            let keyFilePath = null;
            let opened = await openKeyring(folder, masterPassword, null);
            if (opened.count === 0) {
                return {
                    success: false,
                    error: syncTarget === 'drive'
                        ? 'Bu Google hesabında eşitleme verisi bulunamadı. Diğer cihazınızda eşitlemeyi açarken kullandığınız Google hesabını seçin.'
                        : 'Bu klasörde eşitleme verisi bulunamadı. Diğer cihazınızda eşitlemeyi açarken seçtiğiniz klasörü seçin.'
                };
            }
            if (!opened.found && opened.keyFileNeeded) {
                // The account is protected by a key file on the other device: it is needed here too
                const keyFile = await platform.openFile({
                    title: 'Bu hesabın anahtar dosyasını seçin',
                    filters: KEY_FILE_FILTERS,
                    maxBytes: MAX_KEY_FILE_BYTES
                });
                if (keyFile.canceled) return { success: false, error: 'Bu hesap için anahtar dosyası gerekiyor.' };
                if (keyFile.tooLarge) return { success: false, error: 'Geçersiz anahtar dosyası.' };
                keyFileSecret = parseKeyFile(keyFile.data);
                keyFilePath = keyFile.path;
                opened = await openKeyring(folder, masterPassword, keyFileSecret);
            }
            if (!opened.found) {
                registerFailedAttempt();
                return {
                    success: false,
                    error: keyFileSecret ? 'Ana şifre veya anahtar dosyası hatalı.' : 'Ana şifre hatalı.'
                };
            }
            const found = opened.found;
            if (!found.usesKeyFile) {
                keyFileSecret = null;
                keyFilePath = null;
            }

            // The account gets the name it has on the other device (made unique on this one if needed)
            const existing = store.getUsersList().users.map(u => u.username.toLowerCase());
            const accountName = str(found.account.username).trim().slice(0, 130) || 'Eşitlenen Hesap';
            let username = accountName;
            for (let n = 2; existing.includes(username.toLowerCase()); n++) username = `${accountName} (${n})`;

            const keyMaterial = await createKey(masterPassword, keyFileSecret);
            const newUser = store.createNewUser({
                username,
                firstName: str(found.account.firstName).slice(0, 64),
                lastName: str(found.account.lastName).slice(0, 64)
            });
            store.writeVault(newUser.id, encryptWithKey(JSON.stringify([]), keyMaterial));
            if (keyFilePath) store.setUserKeyFilePath(newUser.id, keyFilePath);

            lockVault(false);
            openSession(newUser.id, keyMaterial, []);
            loginAttempts = 0;
            lockoutUntil = 0;

            sync = newSyncState(folder, found);
            saveSync();
            const firstSync = await runSync();
            if (currentUserId !== newUser.id || sessionItems === null) {
                return { success: false, error: 'Oturum açık değil.' };
            }

            return {
                success: true,
                user: { id: newUser.id, username: newUser.username },
                data: sessionItems,
                revision: rememberUiState(sessionItems),
                syncError: firstSync.success ? null : firstSync.error
            };
        } catch (err) {
            console.error('Join synced account error:', err.message);
            return { success: false, error: 'Hesap eklenemedi: ' + err.message };
        }
    };

    api.syncNow = async () => {
        if (!currentUserId || !currentKey || !sync) return { success: false, error: 'Eşitleme açık değil.' };
        const result = await runSync();
        return { ...result, status: getSyncStatus() };
    };

    // Google no longer accepts this device's access (revoked, or signed out): ask the user again
    api.reconnectSync = async () => {
        if (!currentUserId || !currentKey || !sync) return { success: false, error: 'Eşitleme açık değil.' };
        const state = sync;
        if (isDriveFolder(state.folder)) {
            try {
                const picked = await platform.pickFolder({ title: '', target: 'drive' });
                if (picked.canceled) return { success: false, canceled: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
            if (sync !== state) return { success: false, error: 'Eşitleme açık değil.' };
        }
        const result = await runSync();
        return { ...result, status: getSyncStatus() };
    };

    // Stops syncing on this device. The vault stays as it is; this device's file is removed from the folder.
    api.disableSync = async () => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (!sync) return { success: true };

        const { folder, vaultId, deviceId } = sync;
        try {
            store.removeSync(currentUserId);
        } catch (err) {
            return { success: false, error: 'Eşitleme kapatılamadı: ' + err.message };
        }
        dropSync();
        try {
            await platform.removeFolderFile(folder, syncFileName(vaultId, deviceId));
        } catch (e) {
            // the folder may be unreachable; the leftover file is harmless
        }
        return { success: true };
    };

    // --- Encrypted backups ---

    // Accepts both exported backups ({ items: [...] }) and raw vault files ([...])
    function parseBackupText(text) {
        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
        if (!items) throw new Error('Geçersiz yedek içeriği.');
        return {
            items: items.filter(item => typeof item === 'object' && item !== null && !Array.isArray(item)),
            exportedAt: !Array.isArray(parsed) && typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null
        };
    }

    // The current vault is snapshotted before a backup is handed over for restoring
    function backupOpened(result) {
        pendingBackup = null;
        try {
            store.createAutoBackup(currentUserId);
        } catch (e) {
            console.error('Auto backup error:', e.message);
        }
        return { success: true, ...result };
    }

    api.exportEncryptedBackup = async () => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };

        try {
            const items = JSON.parse(decryptWithKey(store.readVault(currentUserId), currentKey));
            const payload = JSON.stringify({
                app: 'OrendaPass',
                type: 'backup',
                version: 1,
                exportedAt: new Date().toISOString(),
                items
            });
            // Encrypt before the dialog opens: the vault may auto-lock while it is on screen
            const encrypted = encryptWithKey(payload, currentKey);

            const dateStr = new Date().toISOString().slice(0, 10);
            const saved = await platform.saveFile({
                defaultName: `orenda-pass-yedek-${dateStr}.opbackup`,
                filters: BACKUP_FILTERS,
                data: encrypted
            });
            if (saved.canceled) return { success: false, canceled: true };

            return { success: true, count: items.length };
        } catch (err) {
            console.error('Backup export error:', err.message);
            return { success: false, error: 'Yedek oluşturulamadı: ' + err.message };
        }
    };

    api.listAutoBackups = () => {
        if (!currentUserId || !currentKey) return [];
        try {
            return store.listAutoBackups(currentUserId);
        } catch (e) {
            return [];
        }
    };

    // Opens a backup for restoring: an automatic one by name, or a file picked by the user
    api.openBackup = async (autoBackupName) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        const userId = currentUserId;
        pendingBackup = null;

        let data;
        try {
            if (typeof autoBackupName === 'string') {
                data = store.readAutoBackup(userId, autoBackupName);
            } else {
                const picked = await platform.openFile({ filters: BACKUP_FILTERS, maxBytes: MAX_BACKUP_FILE_BYTES });
                if (picked.canceled) return { success: false, canceled: true };
                if (picked.tooLarge) return { success: false, error: 'Yedek dosyası çok büyük.' };
                data = picked.data;
            }
        } catch (err) {
            return { success: false, error: 'Yedek dosyası okunamadı.' };
        }

        if (currentUserId !== userId || !currentKey) return { success: false, error: 'Oturum açık değil.' };

        try {
            return backupOpened(parseBackupText(decryptWithKey(data, currentKey)));
        } catch (e) {
            // Encrypted with another master password (older password, other account or other computer)
            pendingBackup = { userId, data };
            return { success: false, needsPassword: true };
        }
    };

    api.unlockBackup = async (password) => {
        if (!currentUserId || !currentKey) return { success: false, error: 'Oturum açık değil.' };
        if (!pendingBackup || pendingBackup.userId !== currentUserId) {
            return { success: false, error: 'Lütfen yedek dosyasını tekrar seçin.' };
        }
        const pending = pendingBackup;

        try {
            let keyFileSecret = null;
            if (requiresKeyFile(pending.data) && currentKey.keyFileSecret) {
                try {
                    const { text } = await decryptWithPassword(pending.data, password, copyBytes(currentKey.keyFileSecret));
                    const result = parseBackupText(text);
                    if (pendingBackup !== pending || !currentUserId) return { success: false, error: 'Oturum açık değil.' };
                    return backupOpened(result);
                } catch (e) {
                    // made with another key file: ask for it below
                }
            }
            if (requiresKeyFile(pending.data)) {
                const picked = await platform.openFile({
                    title: 'Bu yedeğin anahtar dosyasını seçin',
                    filters: KEY_FILE_FILTERS,
                    maxBytes: MAX_KEY_FILE_BYTES
                });
                if (picked.canceled) {
                    return { success: false, needsPassword: true, error: 'Bu yedek için anahtar dosyası gerekiyor.' };
                }
                if (picked.tooLarge) throw new Error('Geçersiz anahtar dosyası.');
                keyFileSecret = parseKeyFile(picked.data);
            }
            const { text } = await decryptWithPassword(pending.data, password, keyFileSecret);
            const result = parseBackupText(text);
            if (pendingBackup !== pending || !currentUserId) return { success: false, error: 'Oturum açık değil.' };
            return backupOpened(result);
        } catch (e) {
            return { success: false, needsPassword: true, error: 'Yedek şifresi veya anahtar dosyası hatalı.' };
        }
    };

    api.cancelBackup = () => {
        pendingBackup = null;
        return true;
    };

    api.logout = () => {
        lockVault(false);
        return true;
    };

    // Have I Been Pwned check using k-Anonymity (SHA-1): only the first 5 characters of the hash leave the device
    api.checkPwnedPassword = async (password) => {
        if (typeof password !== 'string' || !password) {
            return { pwned: false, count: 0, error: 'Geçersiz istek' };
        }

        try {
            const sha1 = bytesToHex(primitives.sha1(utf8ToBytes(password))).toUpperCase();
            const prefix = sha1.slice(0, 5);
            const suffix = sha1.slice(5);

            const response = await platform.httpGet({
                hostname: 'api.pwnedpasswords.com',
                path: `/range/${prefix}`,
                headers: {
                    'User-Agent': 'OrendaPass-App/1.0',
                    'Add-Padding': 'true'
                },
                timeoutMs: 6000,
                maxBytes: 5 * 1024 * 1024
            });

            // A failed lookup must never be reported as "not breached"
            if (response.status !== 200) {
                return { pwned: false, count: 0, error: `Sunucu hatası (${response.status})` };
            }

            let count = 0;
            for (const line of response.body.split(/\r?\n/)) {
                const [hashSuffix, occ] = line.split(':');
                if (hashSuffix && hashSuffix.trim() === suffix) {
                    count = parseInt(occ, 10) || 0;
                    break;
                }
            }
            return { pwned: count > 0, count };
        } catch (err) {
            console.error('HIBP request error:', err.message);
            return { pwned: false, count: 0, error: err.code === 'TIMEOUT' ? 'Zaman aşımı' : 'Bağlantı hatası' };
        }
    };

    api.getAppVersion = () => platform.getVersion();

    // --- Update check ---
    // Only asks GitHub for the latest release number; nothing about the user or the vault is sent.
    // Installing stays a manual step: the release page is opened in the browser.

    function parseVersion(value) {
        const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(typeof value === 'string' ? value.trim() : '');
        return match ? match.slice(1).map(Number) : null;
    }

    function isNewerVersion(candidate, current) {
        for (let i = 0; i < 3; i++) {
            if (candidate[i] !== current[i]) return candidate[i] > current[i];
        }
        return false;
    }

    api.checkForUpdates = async () => {
        const currentVersion = platform.getVersion();
        const fail = (error) => ({ success: false, currentVersion, error });

        let response;
        try {
            response = await platform.httpGet({
                hostname: 'api.github.com',
                path: RELEASES_API_PATH,
                headers: { 'User-Agent': 'OrendaPass-App', 'Accept': 'application/vnd.github+json' },
                timeoutMs: 8000,
                maxBytes: 1024 * 1024
            });
        } catch (err) {
            return fail(err.code === 'TIMEOUT' ? 'Zaman aşımı' : 'Bağlantı hatası');
        }
        if (response.status !== 200) return fail(`Sunucu hatası (${response.status})`);

        try {
            const latest = parseVersion(JSON.parse(response.body).tag_name);
            const current = parseVersion(currentVersion);
            if (!latest || !current) return fail('Sürüm bilgisi okunamadı');
            return {
                success: true,
                currentVersion,
                latestVersion: latest.join('.'),
                updateAvailable: isNewerVersion(latest, current)
            };
        } catch (e) {
            return fail('Sürüm bilgisi okunamadı');
        }
    };

    // Always opens the fixed release page, never a URL supplied by the page or by the network
    api.openReleasePage = () => {
        platform.openExternal(RELEASES_PAGE_URL);
        return true;
    };

    return {
        api,
        // Full lock: the key is wiped (logout, app closing)
        lock: lockVault,
        // Automatic lock (inactivity, screen lock, sleep): suspended when a quick unlock PIN is set
        softLock,
        // Resolves once a pending clipboard clear has finished
        clipboardCleared: () => clipboardClearing,
        // Resolves once a running sync round has finished
        syncIdle: () => syncRunning || Promise.resolve()
    };
}
