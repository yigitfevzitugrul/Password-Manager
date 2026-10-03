/**
 * TOTP (Time-based One-Time Password) - RFC 6238
 * Uses Web Crypto API (SubtleCrypto) for HMAC-SHA1
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a Base32-encoded string to a Uint8Array.
 * Ignores spaces, dashes, and '=' padding.
 */
function base32Decode(input) {
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

/**
 * Validate if a string is a valid Base32-encoded TOTP secret.
 */
export function isValidBase32(input) {
    if (!input || typeof input !== 'string') return false;
    const cleaned = input.replace(/[\s\-=]/g, '').toUpperCase();
    if (cleaned.length < 16) return false; // TOTP secrets are usually at least 80 bits (16 base32 chars)
    for (let i = 0; i < cleaned.length; i++) {
        if (BASE32_ALPHABET.indexOf(cleaned[i]) === -1) return false;
    }
    return true;
}

/**
 * Generate a TOTP code from a Base32 secret.
 * @param {string} secret - Base32-encoded secret key
 * @param {number} period - Time step in seconds (default: 30)
 * @param {number} digits - Number of digits in the code (default: 6)
 * @returns {Promise<string>} The TOTP code, zero-padded
 */
export async function generateTOTP(secret, period = 30, digits = 6) {
    const keyBytes = base32Decode(secret);

    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / period);

    // Convert counter to 8-byte big-endian ArrayBuffer
    const counterBuffer = new ArrayBuffer(8);
    const view = new DataView(counterBuffer);
    const hi = Math.floor(counter / 4294967296);
    const lo = counter % 4294967296;
    view.setUint32(0, hi, false);
    view.setUint32(4, lo, false);

    // Import key for HMAC-SHA1
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );

    // Compute HMAC-SHA1
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
    const hmac = new Uint8Array(signature);

    // Dynamic truncation (RFC 4226 §5.4)
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
 * Get the number of seconds remaining in the current TOTP period.
 * @param {number} period - Time step in seconds (default: 30)
 * @returns {number} Seconds remaining
 */
export function getTimeRemaining(period = 30) {
    return period - (Math.floor(Date.now() / 1000) % period);
}
