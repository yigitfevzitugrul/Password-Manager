/**
 * TOTP (Time-based One-Time Password), RFC 6238 with HMAC-SHA1.
 * Platform independent; HMAC and randomness come from the host's primitives.
 */
import { utf8ToBytes } from './bytes.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input) {
    const cleaned = input.replace(/[\s\-=]/g, '').toUpperCase();
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
        const val = BASE32_ALPHABET.indexOf(cleaned[i]);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8), 2);
    }
    return bytes;
}

export function base32Encode(bytes) {
    let bits = '';
    for (const byte of bytes) {
        bits += byte.toString(2).padStart(8, '0');
    }
    let result = '';
    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.substring(i, i + 5).padEnd(5, '0');
        result += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
    return result;
}

/**
 * @param {object} primitives - randomBytes, hmacSha1, timingSafeEqual
 */
export function createTotp(primitives) {
    /**
     * Generate a random Base32-encoded TOTP secret.
     * @param {number} byteLength - Number of random bytes (default: 20 = 160 bits)
     * @returns {string} Base32-encoded secret
     */
    function generateSecret(byteLength = 20) {
        return base32Encode(primitives.randomBytes(byteLength));
    }

    /**
     * Generate a TOTP code for the given counter value.
     * @param {string} secret - Base32-encoded secret
     * @param {number} counter - Time-step counter
     * @param {number} digits - Number of digits (default: 6)
     * @returns {string} Zero-padded TOTP code
     */
    function generateCodeForCounter(secret, counter, digits = 6) {
        const counterBytes = new Uint8Array(8);
        const view = new DataView(counterBytes.buffer);
        view.setUint32(0, Math.floor(counter / 4294967296), false);
        view.setUint32(4, counter % 4294967296, false);

        const hmac = primitives.hmacSha1(base32Decode(secret), counterBytes);

        const offset = hmac[hmac.length - 1] & 0x0f;
        const binCode =
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);

        const otp = binCode % Math.pow(10, digits);
        return otp.toString().padStart(digits, '0');
    }

    /**
     * Generate the code that is valid at the given time.
     * @param {string} secret - Base32-encoded secret
     * @param {number} timeMs - Point in time (default: now)
     * @returns {string}
     */
    function generateTOTP(secret, timeMs = Date.now()) {
        return generateCodeForCounter(secret, Math.floor(timeMs / 1000 / 30));
    }

    /**
     * Verify a TOTP code against a secret, allowing for clock skew.
     * @param {string} secret - Base32-encoded secret
     * @param {string} code - 6-digit code to verify
     * @param {number} windowSize - Number of periods to check before/after current (default: 1)
     * @returns {boolean} True if the code is valid
     */
    function verifyTOTP(secret, code, windowSize = 1) {
        if (typeof secret !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
        const currentCounter = Math.floor(Date.now() / 1000 / 30);
        const codeBytes = utf8ToBytes(code);
        let valid = false;

        for (let i = -windowSize; i <= windowSize; i++) {
            const expected = utf8ToBytes(generateCodeForCounter(secret, currentCounter + i));
            if (primitives.timingSafeEqual(expected, codeBytes)) valid = true;
        }

        return valid;
    }

    return { generateSecret, generateTOTP, verifyTOTP };
}
