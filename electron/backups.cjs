/**
 * Automatic local vault backups.
 * Each backup is a copy of the encrypted vault file, so it is protected by the master password.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { writeFileAtomic, isValidUserId, getUserVaultPath } = require('./fileSystem.cjs');

const MAX_AUTO_BACKUPS = 5;
const BACKUP_NAME_PATTERN = /^vault-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.enc$/;

function getBackupDir(userId) {
    if (!isValidUserId(userId)) throw new Error('Geçersiz kullanıcı.');
    return path.join(app.getPath('userData'), 'backups', userId);
}

function getBackupPath(userId, name) {
    if (typeof name !== 'string' || !BACKUP_NAME_PATTERN.test(name)) {
        throw new Error('Geçersiz yedek.');
    }
    return path.join(getBackupDir(userId), name);
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
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
        .filter(name => BACKUP_NAME_PATTERN.test(name))
        .sort()
        .reverse()
        .map(name => {
            const [, y, mo, d, h, mi, s] = name.match(BACKUP_NAME_PATTERN);
            return {
                name,
                createdAt: new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(),
                size: fs.statSync(path.join(dir, name)).size
            };
        });
}

/**
 * Snapshot the current vault file. Skipped when nothing changed since the newest backup.
 * Only the newest MAX_AUTO_BACKUPS snapshots are kept.
 * @returns {boolean} true when a new backup was written
 */
function createAutoBackup(userId) {
    const vaultPath = getUserVaultPath(userId);
    if (!fs.existsSync(vaultPath)) return false;

    const data = fs.readFileSync(vaultPath);
    const dir = getBackupDir(userId);
    const existing = listAutoBackups(userId);

    if (existing.length > 0 && fs.readFileSync(path.join(dir, existing[0].name)).equals(data)) {
        return false;
    }

    const name = formatBackupName(new Date());
    if (existing.some(b => b.name === name)) return false;

    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, name), data);

    for (const old of existing.slice(MAX_AUTO_BACKUPS - 1)) {
        try {
            fs.unlinkSync(path.join(dir, old.name));
        } catch (e) {
            console.error('Error pruning backup:', e.message);
        }
    }
    return true;
}

function readAutoBackup(userId, name) {
    return fs.readFileSync(getBackupPath(userId, name));
}

function writeAutoBackup(userId, name, encryptedBuffer) {
    writeFileAtomic(getBackupPath(userId, name), encryptedBuffer);
}

module.exports = { listAutoBackups, createAutoBackup, readAutoBackup, writeAutoBackup };
