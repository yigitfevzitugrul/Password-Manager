// Test fixture: encrypts exactly like the first released version of the app did
// (64-byte salt, 16-byte IV, scrypt with Node's default cost, no header).
// Only used to produce old-format files so the upgrade path stays covered by tests.
const crypto = require('crypto');

function encryptLegacy(text, password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(64);
        const iv = crypto.randomBytes(16);
        crypto.scrypt(password, salt, 32, (err, key) => {
            if (err) return reject(err);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
            resolve(Buffer.concat([salt, iv, cipher.getAuthTag(), encrypted]));
        });
    });
}

module.exports = { encryptLegacy };
