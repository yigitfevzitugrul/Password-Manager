/**
 * Byte helpers that behave the same in Node, Electron and a WebView.
 * Shared code works with plain Uint8Array and never relies on Node's Buffer.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8ToBytes = (text) => encoder.encode(text);
export const bytesToUtf8 = (bytes) => decoder.decode(bytes);

// A real copy, also when the input is a Buffer (whose slice() is only a view)
export const copyBytes = (bytes) => Uint8Array.from(bytes);

export function concatBytes(...parts) {
    const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

// Plain comparison for public data (file headers...). Secrets go through primitives.timingSafeEqual.
export function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function bytesToHex(bytes) {
    let hex = '';
    for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
    return hex;
}

export function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// File name of a path, whichever separator the platform uses
export function baseName(filePath) {
    return String(filePath).split(/[\\/]/).pop();
}
