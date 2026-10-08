/**
 * Vault store: which files the app keeps and what is in them (accounts, vaults, 2FA data,
 * quick unlock PIN, automatic backups). Everything is addressed by a name relative to the
 * app's data directory; reading and writing the bytes is the host's job.
 *
 * `storage` is synchronous:
 *   read(name) -> Uint8Array | null     write(name, bytes)  (atomic)
 *   exists(name) -> boolean             remove(name)
 *   list(dir) -> string[]               stat(name) -> { size, mtimeMs } | null
 */
import { utf8ToBytes, bytesToUtf8, bytesToHex, bytesEqual, baseName } from './bytes.js';

const USERS_CONFIG = 'users.json';
const LEGACY_VAULT = 'passwords.enc';
const MAX_AUTO_BACKUPS = 5;
const BACKUP_NAME_PATTERN = /^vault-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.enc$/;

export function isValidUserId(userId) {
    return typeof userId === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(userId);
}

function requireValidUserId(userId) {
    if (!isValidUserId(userId)) throw new Error('Geçersiz kullanıcı.');
}

/**
 * @param {object} storage - see above
 * @param {object} primitives - randomBytes
 */
export function createVaultStore(storage, primitives) {
    const readText = (name) => {
        const bytes = storage.read(name);
        return bytes === null ? null : bytesToUtf8(bytes);
    };
    const writeText = (name, text) => storage.write(name, utf8ToBytes(text));

    // ---------------- Accounts ----------------

    /**
     * Read the list of all registered accounts.
     * Automatically migrates existing single-user passwords.enc into 'Ana Hesap'.
     */
    function getUsersList() {
        const configText = readText(USERS_CONFIG);
        if (configText !== null) {
            try {
                const data = JSON.parse(configText);
                if (data && Array.isArray(data.users)) {
                    return data;
                }
            } catch (e) {
                console.error('Error reading users.json:', e);
            }
        }

        // Auto-migration: If users.json doesn't exist but legacy passwords.enc exists
        const legacyStat = storage.stat(LEGACY_VAULT);
        if (legacyStat) {
            const initialConfig = {
                users: [
                    {
                        id: 'default',
                        username: 'Ana Hesap',
                        createdAt: legacyStat.mtimeMs || Date.now(),
                        vaultFile: LEGACY_VAULT
                    }
                ],
                lastActiveUserId: 'default'
            };
            saveUsersConfig(initialConfig);
            return initialConfig;
        }

        return { users: [], lastActiveUserId: null };
    }

    function saveUsersConfig(config) {
        writeText(USERS_CONFIG, JSON.stringify(config, null, 2));
    }

    /**
     * Register a new user account with their own separate vault file.
     */
    function createNewUser({ username, firstName = '', lastName = '' }) {
        const config = getUsersList();
        username = (username || `${firstName} ${lastName}`).trim();

        if (!username) {
            throw new Error('Kullanıcı adı veya isim boş bırakılamaz.');
        }

        // Check for duplicate username (case-insensitive)
        const exists = config.users.some(u => u.username.toLowerCase() === username.toLowerCase());
        if (exists) {
            throw new Error('Bu isim ile kayıtlı bir hesap zaten var.');
        }

        const userId = 'u_' + Date.now() + '_' + bytesToHex(primitives.randomBytes(4));

        const newUser = {
            id: userId,
            username,
            firstName,
            lastName,
            createdAt: Date.now(),
            vaultFile: `vault_${userId}.enc`
        };

        config.users.push(newUser);
        config.lastActiveUserId = userId;
        saveUsersConfig(config);

        return newUser;
    }

    function setLastActiveUser(userId) {
        const config = getUsersList();
        config.lastActiveUserId = userId;
        saveUsersConfig(config);
    }

    // Remembers where the user's key file was last found (null clears it). Only the path is stored.
    function setUserKeyFilePath(userId, keyFilePath) {
        const config = getUsersList();
        const user = config.users.find(u => u.id === userId);
        if (!user) return;
        if (keyFilePath) user.keyFilePath = keyFilePath;
        else delete user.keyFilePath;
        saveUsersConfig(config);
    }

    // ---------------- Vault ----------------

    function getVaultName(userId) {
        requireValidUserId(userId);
        const user = getUsersList().users.find(u => u.id === userId);
        if (!user) {
            // Fallback for default
            return userId === 'default' ? LEGACY_VAULT : `vault_${userId}.enc`;
        }
        // baseName: a tampered users.json must not be able to point outside the data directory
        return typeof user.vaultFile === 'string' && user.vaultFile
            ? baseName(user.vaultFile)
            : `vault_${userId}.enc`;
    }

    const readVault = (userId) => storage.read(getVaultName(userId));
    const writeVault = (userId, encryptedBytes) => storage.write(getVaultName(userId), encryptedBytes);

    // ---------------- 2FA (per account; the first account keeps its original file names) ----------------

    function get2FAName(userId, legacyName, name) {
        requireValidUserId(userId);
        if (userId === 'default' && storage.exists(legacyName)) return legacyName;
        return name;
    }

    const get2FAConfigName = (userId) => get2FAName(userId, '2fa_config.json', `2fa_config_${userId}.json`);
    const get2FASecretName = (userId) => get2FAName(userId, '2fa_secret.enc', `2fa_secret_${userId}.enc`);

    function is2FAEnabled(userId) {
        try {
            const configText = readText(get2FAConfigName(userId));
            if (configText !== null) {
                return JSON.parse(configText).enabled === true;
            }
        } catch (e) {
            console.error('Error reading 2FA config:', e);
        }
        return false;
    }

    function save2FAConfig(userId, enabled) {
        writeText(get2FAConfigName(userId), JSON.stringify({ enabled }));
    }

    function save2FASecret(userId, encryptedBytes) {
        storage.write(get2FASecretName(userId), encryptedBytes);
    }

    function read2FASecret(userId) {
        try {
            return storage.read(get2FASecretName(userId));
        } catch (e) {
            console.error('Error reading 2FA secret:', e);
        }
        return null;
    }

    function remove2FAData(userId) {
        try {
            storage.remove(get2FAConfigName(userId));
            storage.remove(get2FASecretName(userId));
        } catch (e) {
            console.error('Error removing 2FA data:', e);
        }
    }

    // ---------------- Quick unlock PIN ----------------

    function getQuickPinName(userId) {
        requireValidUserId(userId);
        return `quickpin_${userId}.enc`;
    }

    const readQuickPin = (userId) => storage.read(getQuickPinName(userId));
    const writeQuickPin = (userId, encryptedBytes) => storage.write(getQuickPinName(userId), encryptedBytes);
    const removeQuickPin = (userId) => storage.remove(getQuickPinName(userId));

    // ---------------- Automatic backups ----------------
    // Each backup is a copy of the encrypted vault file, so it is protected by the master password.

    function getBackupDir(userId) {
        requireValidUserId(userId);
        return `backups/${userId}`;
    }

    function getBackupName(userId, name) {
        if (typeof name !== 'string' || !BACKUP_NAME_PATTERN.test(name)) {
            throw new Error('Geçersiz yedek.');
        }
        return `${getBackupDir(userId)}/${name}`;
    }

    function formatBackupName(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `vault-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
            `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.enc`;
    }

    /**
     * List automatic backups of a user, newest first.
     */
    function listAutoBackups(userId) {
        const dir = getBackupDir(userId);
        return storage.list(dir)
            .filter(name => BACKUP_NAME_PATTERN.test(name))
            .sort()
            .reverse()
            .map(name => {
                const [, y, mo, d, h, mi, s] = name.match(BACKUP_NAME_PATTERN);
                const stat = storage.stat(`${dir}/${name}`);
                return {
                    name,
                    createdAt: new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(),
                    size: stat ? stat.size : 0
                };
            });
    }

    /**
     * Snapshot the current vault file. Skipped when nothing changed since the newest backup.
     * Only the newest MAX_AUTO_BACKUPS snapshots are kept.
     * @returns {boolean} true when a new backup was written
     */
    function createAutoBackup(userId) {
        const data = readVault(userId);
        if (data === null) return false;

        const dir = getBackupDir(userId);
        const existing = listAutoBackups(userId);

        if (existing.length > 0) {
            const newest = storage.read(`${dir}/${existing[0].name}`);
            if (newest !== null && bytesEqual(newest, data)) return false;
        }

        const name = formatBackupName(new Date());
        if (existing.some(b => b.name === name)) return false;

        storage.write(`${dir}/${name}`, data);

        for (const old of existing.slice(MAX_AUTO_BACKUPS - 1)) {
            try {
                storage.remove(`${dir}/${old.name}`);
            } catch (e) {
                console.error('Error pruning backup:', e.message);
            }
        }
        return true;
    }

    function readAutoBackup(userId, name) {
        const data = storage.read(getBackupName(userId, name));
        if (data === null) throw new Error('Geçersiz yedek.');
        return data;
    }

    function writeAutoBackup(userId, name, encryptedBytes) {
        storage.write(getBackupName(userId, name), encryptedBytes);
    }

    return {
        getUsersList,
        createNewUser,
        setLastActiveUser,
        setUserKeyFilePath,
        readVault,
        writeVault,
        is2FAEnabled,
        save2FAConfig,
        save2FASecret,
        read2FASecret,
        remove2FAData,
        readQuickPin,
        writeQuickPin,
        removeQuickPin,
        listAutoBackups,
        createAutoBackup,
        readAutoBackup,
        writeAutoBackup
    };
}
