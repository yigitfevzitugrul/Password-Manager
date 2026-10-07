const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Current format (v2): MAGIC | salt | iv | tag | ciphertext
// The header (MAGIC + salt) is authenticated as AAD.
const MAGIC = Buffer.from('OPV2', 'ascii');
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

// Legacy format (v1): salt(64) | iv(16) | tag(16) | ciphertext, scrypt with Node defaults (N=16384)
const LEGACY_SALT_LENGTH = 64;
const LEGACY_IV_LENGTH = 16;

function scrypt(password, salt, params) {
    return new Promise((resolve, reject) => {
        const cb = (err, derivedKey) => (err ? reject(err) : resolve(derivedKey));
        if (params) crypto.scrypt(password, salt, KEY_LENGTH, params, cb);
        else crypto.scrypt(password, salt, KEY_LENGTH, cb);
    });
}

function normalizePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        throw new Error('Geçersiz şifre.');
    }
    return password.normalize('NFKC');
}

/**
 * Derives the vault key from the master password.
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Promise<Buffer>}
 */
function deriveKey(password, salt) {
    return scrypt(normalizePassword(password), salt, SCRYPT_PARAMS);
}

/**
 * Creates fresh key material for a (new) master password.
 * @param {string} password
 * @returns {Promise<{key: Buffer, salt: Buffer}>}
 */
async function createKey(password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt);
    return { key, salt };
}

/**
 * Encrypts text with an already derived key. A fresh IV is used on every call.
 * @param {string} text
 * @param {{key: Buffer, salt: Buffer}} keyMaterial
 * @returns {Buffer}
 */
function encryptWithKey(text, { key, salt }) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const header = Buffer.concat([MAGIC, salt]);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(header);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([header, iv, tag, encrypted]);
}

function isCurrentFormat(data) {
    return data.length >= MAGIC.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH &&
        data.subarray(0, MAGIC.length).equals(MAGIC);
}

function readSalt(data) {
    return data.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
}

function decryptCurrent(data, key) {
    const headerEnd = MAGIC.length + SALT_LENGTH;
    const header = data.subarray(0, headerEnd);
    const iv = data.subarray(headerEnd, headerEnd + IV_LENGTH);
    const tag = data.subarray(headerEnd + IV_LENGTH, headerEnd + IV_LENGTH + TAG_LENGTH);
    const encryptedText = data.subarray(headerEnd + IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encryptedText), decipher.final()]).toString('utf8');
}

async function decryptLegacy(data, password) {
    const ivEnd = LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH;
    if (data.length < ivEnd + TAG_LENGTH) throw new Error('Dosya bozuk.');

    const salt = data.subarray(0, LEGACY_SALT_LENGTH);
    const iv = data.subarray(LEGACY_SALT_LENGTH, ivEnd);
    const tag = data.subarray(ivEnd, ivEnd + TAG_LENGTH);
    const encryptedText = data.subarray(ivEnd + TAG_LENGTH);

    // Legacy files were written without password normalization
    const key = await scrypt(password, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encryptedText), decipher.final()]).toString('utf8');
}

/**
 * Decrypts a vault/secret file with the master password.
 * Returns the derived key material so it can be kept for the session instead of the password.
 * For legacy files `keyMaterial` is null and the caller should re-encrypt with a fresh key.
 * @param {Buffer} data
 * @param {string} password
 * @returns {Promise<{text: string, keyMaterial: {key: Buffer, salt: Buffer} | null}>}
 */
async function decryptWithPassword(data, password) {
    if (typeof password !== 'string' || password.length === 0 || !Buffer.isBuffer(data)) {
        throw new Error('Deşifreleme başarısız. Şifre yanlış olabilir veya dosya bozuk.');
    }
    try {
        if (isCurrentFormat(data)) {
            const salt = Buffer.from(readSalt(data));
            const key = await deriveKey(password, salt);
            return { text: decryptCurrent(data, key), keyMaterial: { key, salt } };
        }
        return { text: await decryptLegacy(data, password), keyMaterial: null };
    } catch (error) {
        throw new Error('Deşifreleme başarısız. Şifre yanlış olabilir veya dosya bozuk.');
    }
}

/**
 * Decrypts a current-format file with the session key.
 * @param {Buffer} data
 * @param {{key: Buffer, salt: Buffer}} keyMaterial
 * @returns {string}
 */
function decryptWithKey(data, { key, salt }) {
    try {
        if (!isCurrentFormat(data) || !readSalt(data).equals(salt)) throw new Error('format');
        return decryptCurrent(data, key);
    } catch (error) {
        throw new Error('Deşifreleme başarısız. Dosya bozuk olabilir.');
    }
}

/**
 * Checks a password against the session key without keeping the password around.
 * @param {string} password
 * @param {{key: Buffer, salt: Buffer}} keyMaterial
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, { key, salt }) {
    if (typeof password !== 'string' || password.length === 0) return false;
    const candidate = await deriveKey(password, salt);
    return crypto.timingSafeEqual(candidate, key);
}

module.exports = {
    createKey,
    encryptWithKey,
    decryptWithPassword,
    decryptWithKey,
    verifyPassword,
    isCurrentFormat
};
