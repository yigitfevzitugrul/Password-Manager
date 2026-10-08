/**
 * Storage for the shared vault code, backed by a directory on disk (the app's userData folder).
 * Names are relative to that directory and use '/' as separator.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Write a file atomically (temp file + rename) so a crash mid-write
 * can never leave a truncated vault behind.
 */
function writeFileAtomic(filePath, data) {
    const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
        const fd = fs.openSync(tmpPath, 'w', 0o600);
        try {
            fs.writeFileSync(fd, data);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(tmpPath, filePath);
    } catch (e) {
        try { fs.unlinkSync(tmpPath); } catch (_) { /* nothing to clean up */ }
        throw e;
    }
}

function createNodeStorage(baseDir) {
    // Names come from the shared code, never from the page; still refuse anything that could leave the directory
    function resolve(name) {
        const parts = String(name).split('/');
        if (parts.some(part => part === '' || part === '.' || part === '..' || /[\\:]/.test(part))) {
            throw new Error('Geçersiz dosya adı.');
        }
        return path.join(baseDir, ...parts);
    }

    return {
        read(name) {
            const filePath = resolve(name);
            return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
        },

        write(name, bytes) {
            const filePath = resolve(name);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            writeFileAtomic(filePath, bytes);
        },

        exists(name) {
            return fs.existsSync(resolve(name));
        },

        remove(name) {
            const filePath = resolve(name);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        },

        list(dir) {
            const dirPath = resolve(dir);
            return fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
        },

        stat(name) {
            const filePath = resolve(name);
            if (!fs.existsSync(filePath)) return null;
            const { size, mtimeMs } = fs.statSync(filePath);
            return { size, mtimeMs };
        }
    };
}

module.exports = { createNodeStorage };
