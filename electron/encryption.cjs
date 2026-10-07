const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Current format (v2): MAGIC | salt | iv | tag | ciphertext
// The header (MAGIC + salt) is authenticated as AAD.
// Files whose key also depends on a key file use MAGIC_KEYFILE instead of MAGIC.
const MAGIC = Buffer.from('OPV2', 'ascii');
const MAGIC_KEYFILE = Buffer.from('OPK2', 'ascii');
const KEYFILE_INFO = Buffer.from('OrendaPass key file v1', 'utf8');
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
 * Derives the vault key from the master password and, when given, the key file secret.
 * @param {string} password
 * @param {Buffer} salt
 * @param {Buffer|null} keyFileSecret
 * @returns {Promise<Buffer>}
 */
async function deriveKey(password, salt, keyFileSecret = null) {
    const passwordKey = await scrypt(normalizePassword(password), salt, SCRYPT_PARAMS);
    if (!keyFileSecret) return passwordKey;

    const mixed = crypto.hkdfSync('sha256', Buffer.concat([passwordKey, keyFileSecret]), salt, KEYFILE_INFO, KEY_LENGTH);
    passwordKey.fill(0);
    return Buffer.from(mixed);
}

/**
 * Creates fresh key material for a (new) master password.
 * @param {string} password
 * @param {Buffer|null} keyFileSecret
 * @returns {Promise<{key: Buffer, salt: Buffer, keyFileSecret: Buffer|null}>}
 */
async function createKey(password, keyFileSecret = null) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt, keyFileSecret);
    return { key, salt, keyFileSecret };
}

/**
 * Encrypts text with an already derived key. A fresh IV is used on every call.
 * @param {string} text
 * @param {{key: Buffer, salt: Buffer}} keyMaterial
 * @returns {Buffer}
 */
function encryptWithKey(text, { key, salt, keyFileSecret }) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const header = Buffer.concat([keyFileSecret ? MAGIC_KEYFILE : MAGIC, salt]);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(header);

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([header, iv, tag, encrypted]);
}

function isCurrentFormat(data) {
    if (data.length < MAGIC.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) return false;
    const magic = data.subarray(0, MAGIC.length);
    return magic.equals(MAGIC) || magic.equals(MAGIC_KEYFILE);
}

/**
 * True when the file can only be decrypted together with a key file.
 */
function requiresKeyFile(data) {
    return Buffer.isBuffer(data) && isCurrentFormat(data) && data.subarray(0, MAGIC.length).equals(MAGIC_KEYFILE);
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
 * Throws an error with code KEYFILE_REQUIRED when the file needs a key file and none is given.
 * @param {Buffer} data
 * @param {string} password
 * @param {Buffer|null} keyFileSecret
 * @returns {Promise<{text: string, keyMaterial: {key: Buffer, salt: Buffer, keyFileSecret: Buffer|null} | null}>}
 */
async function decryptWithPassword(data, password, keyFileSecret = null) {
    if (requiresKeyFile(data) && !keyFileSecret) {
        const error = new Error('Bu dosya için anahtar dosyası gerekiyor.');
        error.code = 'KEYFILE_REQUIRED';
        throw error;
    }
    if (typeof password !== 'string' || password.length === 0 || !Buffer.isBuffer(data)) {
        throw new Error('Deşifreleme başarısız. Şifre yanlış olabilir veya dosya bozuk.');
    }
    try {
        if (isCurrentFormat(data)) {
            const salt = Buffer.from(readSalt(data));
            const secret = requiresKeyFile(data) ? keyFileSecret : null;
            const key = await deriveKey(password, salt, secret);
            return { text: decryptCurrent(data, key), keyMaterial: { key, salt, keyFileSecret: secret } };
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
function decryptWithKey(data, { key, salt, keyFileSecret }) {
    try {
        if (!isCurrentFormat(data) || !readSalt(data).equals(salt)) throw new Error('format');
        if (requiresKeyFile(data) !== Boolean(keyFileSecret)) throw new Error('format');
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
async function verifyPassword(password, { key, salt, keyFileSecret }) {
    if (typeof password !== 'string' || password.length === 0) return false;
    const candidate = await deriveKey(password, salt, keyFileSecret);
    return crypto.timingSafeEqual(candidate, key);
}

module.exports = {
    createKey,
    encryptWithKey,
    decryptWithPassword,
    decryptWithKey,
    verifyPassword,
    isCurrentFormat,
    requiresKeyFile
};
