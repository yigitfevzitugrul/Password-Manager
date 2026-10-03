/**
 * 2FA Configuration Manager (Multi-User Aware)
 * Handles reading/writing 2FA config and encrypted secret files per user account.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getUserDataPath() {
    return app.getPath('userData');
}

function get2FAConfigPath(userId = 'default') {
    const userDataPath = getUserDataPath();
    if (userId === 'default') {
        const legacyPath = path.join(userDataPath, '2fa_config.json');
        if (fs.existsSync(legacyPath)) return legacyPath;
    }
    return path.join(userDataPath, `2fa_config_${userId}.json`);
}

function get2FASecretPath(userId = 'default') {
    const userDataPath = getUserDataPath();
    if (userId === 'default') {
        const legacyPath = path.join(userDataPath, '2fa_secret.enc');
        if (fs.existsSync(legacyPath)) return legacyPath;
    }
    return path.join(userDataPath, `2fa_secret_${userId}.enc`);
}

function is2FAEnabled(userId = 'default') {
    const configPath = get2FAConfigPath(userId);
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.enabled === true;
        }
    } catch (e) {
        console.error('Error reading 2FA config:', e);
    }
    return false;
}

function save2FAConfig(userId, enabled) {
    const configPath = get2FAConfigPath(userId);
    fs.writeFileSync(configPath, JSON.stringify({ enabled }), 'utf8');
}

function save2FASecret(userId, encryptedBuffer) {
    const secretPath = get2FASecretPath(userId);
    fs.writeFileSync(secretPath, encryptedBuffer);
}

function read2FASecret(userId = 'default') {
    const secretPath = get2FASecretPath(userId);
    try {
        if (fs.existsSync(secretPath)) {
            return fs.readFileSync(secretPath);
        }
    } catch (e) {
        console.error('Error reading 2FA secret:', e);
    }
    return null;
}

function remove2FAData(userId = 'default') {
    try {
        const configPath = get2FAConfigPath(userId);
        const secretPath = get2FASecretPath(userId);
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
        if (fs.existsSync(secretPath)) fs.unlinkSync(secretPath);
    } catch (e) {
        console.error('Error removing 2FA data:', e);
    }
}

module.exports = { is2FAEnabled, save2FAConfig, save2FASecret, read2FASecret, remove2FAData };
