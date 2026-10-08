/**
 * Key file: a random secret stored in a separate file (ideally on a USB drive).
 * When enabled it is mixed into the vault key, so the vault cannot be decrypted
 * with the master password alone.
 */
import { bytesToUtf8, bytesToBase64, base64ToBytes } from './bytes.js';

const KEY_FILE_SECRET_LENGTH = 32;
export const MAX_KEY_FILE_BYTES = 4096;

/**
 * @param {object} primitives - randomBytes
 * @returns {{secret: Uint8Array, content: string}}
 */
export function generateKeyFile(primitives) {
    const secret = primitives.randomBytes(KEY_FILE_SECRET_LENGTH);
    const content = JSON.stringify({
        app: 'OrendaPass',
        type: 'keyfile',
        version: 1,
        createdAt: new Date().toISOString(),
        key: bytesToBase64(secret)
    }, null, 2);
    return { secret, content };
}

/**
 * @param {Uint8Array|string} content
 * @returns {Uint8Array} the key file secret
 */
export function parseKeyFile(content) {
    let secret;
    try {
        const parsed = JSON.parse(typeof content === 'string' ? content : bytesToUtf8(content));
        if (!parsed || parsed.app !== 'OrendaPass' || parsed.type !== 'keyfile' || typeof parsed.key !== 'string') {
            throw new Error('format');
        }
        secret = base64ToBytes(parsed.key);
    } catch (e) {
        throw new Error('Geçersiz anahtar dosyası.');
    }
    if (secret.length !== KEY_FILE_SECRET_LENGTH) {
        throw new Error('Geçersiz anahtar dosyası.');
    }
    return secret;
}
