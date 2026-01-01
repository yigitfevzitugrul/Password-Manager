const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 64;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derives a key from the password using Scrypt.
 * @param {string} password 
 * @param {Buffer} salt 
 * @returns {Promise<Buffer>}
 */
function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

/**
 
 * @param {string} text 
 * @param {string} password 
 * @returns {Promise<Buffer>} 
 */
async function encrypt(text, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    const key = await deriveKey(password, salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, encrypted]);
}

/**
 * 
 * @param {Buffer} data 
 * @param {string} password 
 * @returns {Promise<string>} 
 */
async function decrypt(data, password) {
    try {
        const salt = data.subarray(0, SALT_LENGTH);
        const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encryptedText = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

        const key = await deriveKey(password, salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {

        throw new Error('Deşifreleme başarısız. Şifre yanlış olabilir veya dosya bozuk.');
    }
}

module.exports = { encrypt, decrypt };
