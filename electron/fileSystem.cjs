const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getUserDataDir() {
    if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
    }
    return path.join(process.env.APPDATA || process.env.HOME || '.', 'sifreyonetici');
}

function getUsersConfigPath() {
    return path.join(getUserDataDir(), 'users.json');
}

function getLegacyVaultPath() {
    return path.join(getUserDataDir(), 'passwords.enc');
}

/**
 * Read the list of all registered accounts.
 * Automatically migrates existing single-user passwords.enc into 'Ana Hesap'.
 */
function getUsersList() {
    const configPath = getUsersConfigPath();
    const legacyPath = getLegacyVaultPath();

    if (fs.existsSync(configPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (data && Array.isArray(data.users)) {
                return data;
            }
        } catch (e) {
            console.error('Error reading users.json:', e);
        }
    }

    // Auto-migration: If users.json doesn't exist but legacy passwords.enc exists
    if (fs.existsSync(legacyPath)) {
        const initialConfig = {
            users: [
                {
                    id: 'default',
                    username: 'Ana Hesap',
                    createdAt: fs.statSync(legacyPath).mtimeMs || Date.now(),
                    vaultFile: 'passwords.enc'
                }
            ],
            lastActiveUserId: 'default'
        };
        fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf8');
        return initialConfig;
    }

    return { users: [], lastActiveUserId: null };
}

function saveUsersConfig(config) {
    const configPath = getUsersConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Register a new user account with their own separate vault file.
 */
function createNewUser(userData) {
    const config = getUsersList();
    let username = '';
    let firstName = '';
    let lastName = '';
    let email = '';

    if (typeof userData === 'object' && userData !== null) {
        firstName = (userData.firstName || '').trim();
        lastName = (userData.lastName || '').trim();
        email = (userData.email || '').trim().toLowerCase();
        username = (userData.username || `${firstName} ${lastName}`).trim();
    } else {
        username = (userData || '').trim();
        firstName = username;
    }

    if (!username) {
        throw new Error('Kullanıcı adı veya isim boş bırakılamaz.');
    }

    // Check for duplicate username (case-insensitive)
    const exists = config.users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
        throw new Error('Bu isim ile kayıtlı bir hesap zaten var.');
    }

    // Check for duplicate email if provided
    if (email) {
        const emailExists = config.users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        if (emailExists) {
            throw new Error('Bu e-posta adresi ile kayıtlı bir hesap zaten var.');
        }
    }

    const userId = 'u_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const vaultFileName = `vault_${userId}.enc`;

    const newUser = {
        id: userId,
        username,
        firstName,
        lastName,
        email,
        createdAt: Date.now(),
        vaultFile: vaultFileName
    };

    config.users.push(newUser);
    config.lastActiveUserId = userId;
    saveUsersConfig(config);

    return newUser;
}

function getUserVaultPath(userId) {
    const config = getUsersList();
    const user = config.users.find(u => u.id === userId);
    if (!user) {
        // Fallback for default
        if (userId === 'default') return getLegacyVaultPath();
        return path.join(getUserDataDir(), `vault_${userId}.enc`);
    }
    return path.join(getUserDataDir(), user.vaultFile || `vault_${userId}.enc`);
}

function saveUserEncryptedData(userId, encryptedBuffer) {
    const filePath = getUserVaultPath(userId);
    fs.writeFileSync(filePath, encryptedBuffer);
}

function readUserEncryptedData(userId) {
    const filePath = getUserVaultPath(userId);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
    }
    return null;
}

function checkUserVaultExists(userId) {
    const filePath = getUserVaultPath(userId);
    return fs.existsSync(filePath);
}

function setLastActiveUser(userId) {
    const config = getUsersList();
    config.lastActiveUserId = userId;
    saveUsersConfig(config);
}

module.exports = {
    getUsersList,
    createNewUser,
    saveUserEncryptedData,
    readUserEncryptedData,
    checkUserVaultExists,
    getUserVaultPath,
    setLastActiveUser
};
