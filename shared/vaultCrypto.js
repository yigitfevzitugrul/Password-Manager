/**
 * Vault encryption: file format and key derivation.
 * Platform independent; the cryptographic primitives are supplied by the host
 * (Node's crypto on desktop, a WebView-compatible implementation on mobile).
 * Every platform must produce and read exactly the same bytes.
 */
import { utf8ToBytes, bytesToUtf8, concatBytes, bytesEqual, copyBytes } from './bytes.js';

const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Current format (v2): MAGIC | salt | iv | tag | ciphertext
// The header (MAGIC + salt) is authenticated as AAD.
// Files whose key also depends on a key file use MAGIC_KEYFILE instead of MAGIC.
const MAGIC = utf8ToBytes('OPV2');
const MAGIC_KEYFILE = utf8ToBytes('OPK2');
const KEYFILE_INFO = utf8ToBytes('OrendaPass key file v1');
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1 };

// Legacy format (v1): salt(64) | iv(16) | tag(16) | ciphertext, scrypt with N=16384
const LEGACY_SALT_LENGTH = 64;
const LEGACY_IV_LENGTH = 16;
const LEGACY_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function normalizePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        throw new Error('Geçersiz şifre.');
    }
    return password.normalize('NFKC');
}

export function isCurrentFormat(data) {
    if (data.length < MAGIC.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) return false;
    const magic = data.subarray(0, MAGIC.length);
    return bytesEqual(magic, MAGIC) || bytesEqual(magic, MAGIC_KEYFILE);
}

/**
 * True when the file can only be decrypted together with a key file.
 */
export function requiresKeyFile(data) {
    return data instanceof Uint8Array && isCurrentFormat(data) &&
        bytesEqual(data.subarray(0, MAGIC.length), MAGIC_KEYFILE);
}

function readSalt(data) {
    return data.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
}

/**
 * @param {object} primitives - randomBytes, scrypt, aesGcmEncrypt, aesGcmDecrypt, hkdfSha256, timingSafeEqual
 */
export function createVaultCrypto(primitives) {
    /**
     * Derives the vault key from the master password and, when given, the key file secret.
     * @param {string} password
     * @param {Uint8Array} salt
     * @param {Uint8Array|null} keyFileSecret
     * @returns {Promise<Uint8Array>}
     */
    async function deriveKey(password, salt, keyFileSecret = null) {
        const passwordKey = await primitives.scrypt(
            utf8ToBytes(normalizePassword(password)), salt, SCRYPT_PARAMS, KEY_LENGTH
        );
        if (!keyFileSecret) return passwordKey;

        const mixed = primitives.hkdfSha256(concatBytes(passwordKey, keyFileSecret), salt, KEYFILE_INFO, KEY_LENGTH);
        passwordKey.fill(0);
        return mixed;
    }

    /**
     * Creates fresh key material for a (new) master password.
     * @param {string} password
     * @param {Uint8Array|null} keyFileSecret
     * @returns {Promise<{key: Uint8Array, salt: Uint8Array, keyFileSecret: Uint8Array|null}>}
     */
    async function createKey(password, keyFileSecret = null) {
        const salt = primitives.randomBytes(SALT_LENGTH);
        const key = await deriveKey(password, salt, keyFileSecret);
        return { key, salt, keyFileSecret };
    }

    /**
     * Encrypts text with an already derived key. A fresh IV is used on every call.
     * @param {string} text
     * @param {{key: Uint8Array, salt: Uint8Array, keyFileSecret: Uint8Array|null}} keyMaterial
     * @returns {Uint8Array}
     */
    function encryptWithKey(text, { key, salt, keyFileSecret }) {
        const iv = primitives.randomBytes(IV_LENGTH);
        const header = concatBytes(keyFileSecret ? MAGIC_KEYFILE : MAGIC, salt);
        const { ciphertext, tag } = primitives.aesGcmEncrypt(key, iv, utf8ToBytes(text), header);
        return concatBytes(header, iv, tag, ciphertext);
    }

    function decryptCurrent(data, key) {
        const headerEnd = MAGIC.length + SALT_LENGTH;
        const header = data.subarray(0, headerEnd);
        const iv = data.subarray(headerEnd, headerEnd + IV_LENGTH);
        const tag = data.subarray(headerEnd + IV_LENGTH, headerEnd + IV_LENGTH + TAG_LENGTH);
        const ciphertext = data.subarray(headerEnd + IV_LENGTH + TAG_LENGTH);
        return bytesToUtf8(primitives.aesGcmDecrypt(key, iv, ciphertext, tag, header));
    }

    async function decryptLegacy(data, password) {
        const ivEnd = LEGACY_SALT_LENGTH + LEGACY_IV_LENGTH;
        if (data.length < ivEnd + TAG_LENGTH) throw new Error('Dosya bozuk.');

        const salt = data.subarray(0, LEGACY_SALT_LENGTH);
        const iv = data.subarray(LEGACY_SALT_LENGTH, ivEnd);
        const tag = data.subarray(ivEnd, ivEnd + TAG_LENGTH);
        const ciphertext = data.subarray(ivEnd + TAG_LENGTH);

        // Legacy files were written without password normalization
        const key = await primitives.scrypt(utf8ToBytes(password), salt, LEGACY_SCRYPT_PARAMS, KEY_LENGTH);
        return bytesToUtf8(primitives.aesGcmDecrypt(key, iv, ciphertext, tag, null));
    }

    /**
     * Decrypts a vault/secret file with the master password.
     * Returns the derived key material so it can be kept for the session instead of the password.
     * For legacy files `keyMaterial` is null and the caller should re-encrypt with a fresh key.
     * Throws an error with code KEYFILE_REQUIRED when the file needs a key file and none is given.
     * @param {Uint8Array} data
     * @param {string} password
     * @param {Uint8Array|null} keyFileSecret
     * @returns {Promise<{text: string, keyMaterial: {key: Uint8Array, salt: Uint8Array, keyFileSecret: Uint8Array|null} | null}>}
     */
    async function decryptWithPassword(data, password, keyFileSecret = null) {
        if (requiresKeyFile(data) && !keyFileSecret) {
            const error = new Error('Bu dosya için anahtar dosyası gerekiyor.');
            error.code = 'KEYFILE_REQUIRED';
            throw error;
        }
        if (typeof password !== 'string' || password.length === 0 || !(data instanceof Uint8Array)) {
            throw new Error('Deşifreleme başarısız. Şifre yanlış olabilir veya dosya bozuk.');
        }
        try {
            if (isCurrentFormat(data)) {
                const salt = copyBytes(readSalt(data));
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
     * @param {Uint8Array} data
     * @param {{key: Uint8Array, salt: Uint8Array, keyFileSecret: Uint8Array|null}} keyMaterial
     * @returns {string}
     */
    function decryptWithKey(data, { key, salt, keyFileSecret }) {
        try {
            if (!isCurrentFormat(data) || !bytesEqual(readSalt(data), salt)) throw new Error('format');
            if (requiresKeyFile(data) !== Boolean(keyFileSecret)) throw new Error('format');
            return decryptCurrent(data, key);
        } catch (error) {
            throw new Error('Deşifreleme başarısız. Dosya bozuk olabilir.');
        }
    }

    /**
     * Checks a password against the session key without keeping the password around.
     * @param {string} password
     * @param {{key: Uint8Array, salt: Uint8Array, keyFileSecret: Uint8Array|null}} keyMaterial
     * @returns {Promise<boolean>}
     */
    async function verifyPassword(password, { key, salt, keyFileSecret }) {
        if (typeof password !== 'string' || password.length === 0) return false;
        const candidate = await deriveKey(password, salt, keyFileSecret);
        return primitives.timingSafeEqual(candidate, key);
    }

    return {
        createKey,
        encryptWithKey,
        decryptWithPassword,
        decryptWithKey,
        verifyPassword,
        isCurrentFormat,
        requiresKeyFile
    };
}
