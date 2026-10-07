/**
 * Key file: a random secret stored in a separate file (ideally on a USB drive).
 * When enabled it is mixed into the vault key, so the vault cannot be decrypted
 * with the master password alone.
 */
const fs = require('fs');
const crypto = require('crypto');

const KEY_FILE_SECRET_LENGTH = 32;
const MAX_KEY_FILE_BYTES = 4096;

function generateKeyFile() {
    const secret = crypto.randomBytes(KEY_FILE_SECRET_LENGTH);
    const content = JSON.stringify({
        app: 'OrendaPass',
        type: 'keyfile',
        version: 1,
        createdAt: new Date().toISOString(),
        key: secret.toString('base64')
    }, null, 2);
    return { secret, content };
}

/**
 * @param {Buffer|string} content
 * @returns {Buffer} the key file secret
 */
function parseKeyFile(content) {
    let parsed;
    try {
        parsed = JSON.parse(content.toString('utf8'));
    } catch (e) {
        throw new Error('Geçersiz anahtar dosyası.');
    }
    if (!parsed || parsed.app !== 'OrendaPass' || parsed.type !== 'keyfile' || typeof parsed.key !== 'string') {
        throw new Error('Geçersiz anahtar dosyası.');
    }
    const secret = Buffer.from(parsed.key, 'base64');
    if (secret.length !== KEY_FILE_SECRET_LENGTH) {
        throw new Error('Geçersiz anahtar dosyası.');
    }
    return secret;
}

function readKeyFile(filePath) {
    if (fs.statSync(filePath).size > MAX_KEY_FILE_BYTES) {
        throw new Error('Geçersiz anahtar dosyası.');
    }
    return parseKeyFile(fs.readFileSync(filePath));
}

module.exports = { generateKeyFile, parseKeyFile, readKeyFile };
