/**
 * Cryptographic primitives for the shared vault code in pure JavaScript (audited @noble libraries).
 * Used where Node's crypto module does not exist, i.e. inside a WebView on mobile.
 * Must give exactly the same results as electron/nodePrimitives.cjs; tests/unit checks that.
 */
import { scrypt, scryptAsync } from '@noble/hashes/scrypt.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';

const TAG_LENGTH = 16;

export const noblePrimitives = {
    randomBytes: (length) => randomBytes(length),

    scrypt: (password, salt, { N, r, p }, keyLength) =>
        scryptAsync(password, salt, { N, r, p, dkLen: keyLength }),

    scryptSync: (password, salt, { N, r, p }, keyLength) =>
        scrypt(password, salt, { N, r, p, dkLen: keyLength }),

    aesGcmEncrypt(key, iv, plaintext, aad) {
        const sealed = gcm(key, iv, aad || undefined).encrypt(plaintext);
        return {
            ciphertext: sealed.subarray(0, sealed.length - TAG_LENGTH),
            tag: sealed.subarray(sealed.length - TAG_LENGTH)
        };
    },

    // Throws when the key is wrong or the data was tampered with
    aesGcmDecrypt(key, iv, ciphertext, tag, aad) {
        const sealed = new Uint8Array(ciphertext.length + tag.length);
        sealed.set(ciphertext, 0);
        sealed.set(tag, ciphertext.length);
        return gcm(key, iv, aad || undefined).decrypt(sealed);
    },

    hkdfSha256: (inputKey, salt, info, length) => hkdf(sha256, inputKey, salt, info, length),

    hmacSha1: (key, data) => hmac(sha1, key, data),

    sha1: (data) => sha1(data),

    timingSafeEqual(a, b) {
        if (a.length !== b.length) return false;
        let difference = 0;
        for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
        return difference === 0;
    }
};
