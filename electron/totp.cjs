/**
 * TOTP (Time-based One-Time Password) - Node.js implementation
 * Uses Node.js crypto module for HMAC-SHA1
 */
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
    const cleaned = input.replace(/[\s\-=]/g, '').toUpperCase();
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
        const val = BASE32_ALPHABET.indexOf(cleaned[i]);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = Buffer.alloc(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8), 2);
    }
    return bytes;
}

function base32Encode(buffer) {
    let bits = '';
    for (const byte of buffer) {
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
 * Generate a random Base32-encoded TOTP secret.
 * @param {number} byteLength - Number of random bytes (default: 20 = 160 bits)
 * @returns {string} Base32-encoded secret
 */
function generateSecret(byteLength = 20) {
    const buffer = crypto.randomBytes(byteLength);
    return base32Encode(buffer);
}

/**
 * Generate a TOTP code for the given counter value.
 * @param {string} secret - Base32-encoded secret
 * @param {number} counter - Time-step counter
 * @param {number} digits - Number of digits (default: 6)
 * @returns {string} Zero-padded TOTP code
 */
function generateCodeForCounter(secret, counter, digits = 6) {
    const keyBytes = base32Decode(secret);

    const counterBuffer = Buffer.alloc(8);
    const hi = Math.floor(counter / 4294967296);
    const lo = counter % 4294967296;
    counterBuffer.writeUInt32BE(hi, 0);
    counterBuffer.writeUInt32BE(lo, 4);

    const hmac = crypto.createHmac('sha1', keyBytes).update(counterBuffer).digest();

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
 * Verify a TOTP code against a secret, allowing for clock skew.
 * @param {string} secret - Base32-encoded secret
 * @param {string} code - 6-digit code to verify
 * @param {number} windowSize - Number of periods to check before/after current (default: 1)
 * @returns {boolean} True if the code is valid
 */
function verifyTOTP(secret, code, windowSize = 1) {
    if (typeof secret !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
    const period = 30;
    const epoch = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(epoch / period);
    let valid = false;

    for (let i = -windowSize; i <= windowSize; i++) {
        const counter = currentCounter + i;
        const expected = generateCodeForCounter(secret, counter);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) valid = true;
    }

    return valid;
}

module.exports = { generateSecret, verifyTOTP, base32Encode, base32Decode };
