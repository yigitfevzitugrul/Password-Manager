/**
 * Host services the shared vault service needs, implemented with what a web page has
 * (see the `platform` description in shared/vaultService.js). Used when the app does not run
 * inside Electron: in the mobile app's WebView and in a plain browser during development.
 */
import QRCode from 'qrcode';

/* global __APP_VERSION__ */

function describeDevice() {
    const agent = navigator.userAgent || '';
    if (/Android/i.test(agent)) return 'Android cihaz';
    if (/iPhone|iPad|iPod/i.test(agent)) return 'iOS cihaz';
    return 'Tarayıcı';
}

function pickFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        const finish = (file) => {
            input.remove();
            resolve(file);
        };
        input.addEventListener('change', () => finish(input.files && input.files[0] ? input.files[0] : null));
        input.addEventListener('cancel', () => finish(null));
        document.body.appendChild(input);
        input.click();
    });
}

export function createWebPlatform() {
    const lockedListeners = new Set();
    const changedListeners = new Set();
    // A page cannot reopen a file by its path. Files saved or picked in this session are kept
    // under a made-up path; after a restart the user is asked for the file again.
    const sessionFiles = new Map();
    const remember = (name, data) => {
        const path = `web:${name}`;
        sessionFiles.set(path, Uint8Array.from(data));
        return path;
    };
    let lastCopied = null;
    const noFolders = async () => { throw new Error('Bu cihazda klasörle eşitleme desteklenmiyor.'); };

    const platform = {
        getVersion: () => __APP_VERSION__,

        notifyLocked() {
            for (const listener of lockedListeners) listener();
        },

        notifyVaultChanged(change) {
            for (const listener of changedListeners) listener(change);
        },

        getDeviceName: describeDevice,

        clipboard: {
            // Reading may be refused; then whatever we copied last is assumed to still be there
            readText: async () => {
                try {
                    return await navigator.clipboard.readText();
                } catch (e) {
                    return lastCopied === null ? '' : lastCopied;
                }
            },
            writeText: async (text) => {
                await navigator.clipboard.writeText(text);
                lastCopied = text;
            },
            clear: async () => {
                lastCopied = null;
                await navigator.clipboard.writeText('');
            }
        },

        openExternal: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); },

        async httpGet({ hostname, path, headers, timeoutMs, maxBytes }) {
            const sent = { ...headers };
            delete sent['User-Agent']; // not ours to set in a page

            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            try {
                const response = await fetch(`https://${hostname}${path}`, {
                    headers: sent,
                    signal: controller.signal,
                    credentials: 'omit',
                    cache: 'no-store',
                    referrerPolicy: 'no-referrer'
                });
                const body = await response.text();
                if (body.length > maxBytes) throw new Error('Yanıt çok büyük');
                return { status: response.status, body };
            } catch (err) {
                if (timedOut) {
                    const error = new Error('Zaman aşımı');
                    error.code = 'TIMEOUT';
                    throw error;
                }
                throw err;
            } finally {
                clearTimeout(timer);
            }
        },

        makeQrDataUrl: (text) => QRCode.toDataURL(text, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        }),

        // download: false only keeps the file for this session (the caller stored it another way)
        async saveFile({ defaultName, data, download = true }) {
            if (!download) return { canceled: false, path: remember(defaultName, data) };
            const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = defaultName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
            return { canceled: false, path: remember(defaultName, data) };
        },

        async openFile({ maxBytes }) {
            const file = await pickFile();
            if (!file) return { canceled: true };
            if (file.size > maxBytes) return { canceled: false, tooLarge: true };
            const data = new Uint8Array(await file.arrayBuffer());
            return { canceled: false, path: remember(file.name, data), name: file.name, data };
        },

        async readFile(path, maxBytes) {
            const data = sessionFiles.get(path);
            if (!data) throw new Error('Dosya bulunamadı.');
            if (data.length > maxBytes) throw new Error('Dosya çok büyük.');
            return Uint8Array.from(data);
        },

        // A page has no folders to sync through (the mobile app adds Google Drive)
        syncTargets: () => [],
        pickFolder: noFolders,
        listFolder: noFolders,
        readFolderFile: noFolders,
        writeFolderFile: noFolders,
        removeFolderFile: noFolders
    };

    return {
        platform,
        onLocked(callback) {
            lockedListeners.add(callback);
            return () => lockedListeners.delete(callback);
        },
        onVaultChanged(callback) {
            changedListeners.add(callback);
            return () => changedListeners.delete(callback);
        }
    };
}
