/**
 * Cryptographic primitives for the shared vault code, backed by Node's crypto module.
 * Other platforms provide the same functions with their own implementation
 * (see shared/noblePrimitives.js); both must give identical results.
 */
const crypto = require('crypto');

const TAG_LENGTH = 16;
// N = 2^17 needs ~128 MB, above Node's default scrypt memory limit
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;

module.exports = {
    randomBytes: (length) => crypto.randomBytes(length),

    scrypt: (password, salt, { N, r, p }, keyLength) => new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keyLength, { N, r, p, maxmem: SCRYPT_MAX_MEMORY }, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    }),

    scryptSync: (password, salt, { N, r, p }, keyLength) =>
        crypto.scryptSync(password, salt, keyLength, { N, r, p, maxmem: SCRYPT_MAX_MEMORY }),

    aesGcmEncrypt(key, iv, plaintext, aad) {
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
        if (aad) cipher.setAAD(aad);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return { ciphertext, tag: cipher.getAuthTag() };
    },

    // Throws when the key is wrong or the data was tampered with
    aesGcmDecrypt(key, iv, ciphertext, tag, aad) {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
        if (aad) decipher.setAAD(aad);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    },

    hkdfSha256: (inputKey, salt, info, length) =>
        Buffer.from(crypto.hkdfSync('sha256', inputKey, salt, info, length)),

    hmacSha1: (key, data) => crypto.createHmac('sha1', key).update(data).digest(),

    sha1: (data) => crypto.createHash('sha1').update(data).digest(),

    timingSafeEqual: (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b)
};
