/**
 * 2FA Configuration Manager
 * Handles reading/writing 2FA config and encrypted secret files.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function get2FAConfigPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, '2fa_config.json');
}

function get2FASecretPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, '2fa_secret.enc');
}

function is2FAEnabled() {
    const configPath = get2FAConfigPath();
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

function save2FAConfig(enabled) {
    const configPath = get2FAConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ enabled }), 'utf8');
}

function save2FASecret(encryptedBuffer) {
    const secretPath = get2FASecretPath();
    fs.writeFileSync(secretPath, encryptedBuffer);
}

function read2FASecret() {
    const secretPath = get2FASecretPath();
    try {
        if (fs.existsSync(secretPath)) {
            return fs.readFileSync(secretPath);
        }
    } catch (e) {
        console.error('Error reading 2FA secret:', e);
    }
    return null;
}

function remove2FAData() {
    try {
        const configPath = get2FAConfigPath();
        const secretPath = get2FASecretPath();
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
        if (fs.existsSync(secretPath)) fs.unlinkSync(secretPath);
    } catch (e) {
        console.error('Error removing 2FA data:', e);
    }
}

module.exports = { is2FAEnabled, save2FAConfig, save2FASecret, read2FASecret, remove2FAData };
