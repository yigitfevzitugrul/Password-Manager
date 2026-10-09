/**
 * What the mobile app does through the device instead of through the WebView
 * (the rest stays as in webPlatform.js): clipboard, saving files, the back button.
 */
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { bytesToBase64, base64ToBytes } from '../../shared/bytes.js';
import { addDriveSync } from '../../shared/driveFolder.js';

// android/app/src/main/java/com/yigit/orendapass/GoogleDrivePlugin.java
const GoogleDrive = registerPlugin('GoogleDrive');

const SAVE_FOLDER = 'OrendaPass';
const SAVED_PREFIX = 'documents:';

function deviceName() {
    // "... Android 14; Pixel 8 Build/..." -> "Pixel 8"
    const match = /Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/|[;)])/.exec(navigator.userAgent || '');
    return match && match[1] !== 'wv' ? match[1].trim().slice(0, 40) : 'Android cihaz';
}

export function addNativeServices(platform) {
    let lastCopied = null;

    platform.getDeviceName = deviceName;

    platform.clipboard = {
        // Android refuses reading while the app is in the background; then whatever we copied
        // last is assumed to still be there
        readText: async () => {
            try {
                return (await Clipboard.read()).value || '';
            } catch (e) {
                return lastCopied === null ? '' : lastCopied;
            }
        },
        writeText: async (text) => {
            await Clipboard.write({ string: text });
            lastCopied = text;
        },
        clear: async () => {
            lastCopied = null;
            await Clipboard.write({ string: '' });
        }
    };

    // Files go to Documents/OrendaPass, where the user finds them in the Files app.
    // Where that is not allowed (older Android), the system's share sheet takes the file.
    const webSaveFile = platform.saveFile;
    platform.saveFile = async (request) => {
        const data = bytesToBase64(request.data);
        const path = `${SAVE_FOLDER}/${request.defaultName}`;
        try {
            await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
            return { canceled: false, path: `${SAVED_PREFIX}${path}` };
        } catch (documentsError) {
            try {
                const cached = await Filesystem.writeFile({ path: request.defaultName, data, directory: Directory.Cache });
                await Share.share({ title: request.defaultName, files: [cached.uri] });
                // only this session can read it back, like a file saved from a web page
                const remembered = await webSaveFile({ ...request, download: false });
                return { canceled: false, path: remembered.path };
            } catch (shareError) {
                return { canceled: true };
            }
        }
    };

    const webReadFile = platform.readFile;
    platform.readFile = async (path, maxBytes) => {
        if (typeof path !== 'string' || !path.startsWith(SAVED_PREFIX)) return webReadFile(path, maxBytes);
        const file = await Filesystem.readFile({ path: path.slice(SAVED_PREFIX.length), directory: Directory.Documents });
        const data = base64ToBytes(file.data);
        if (data.length > maxBytes) throw new Error('Dosya çok büyük.');
        return data;
    };

    // Back button: the page gets the first chance (close a dialog or the menu); otherwise the
    // app goes to the background, where the vault stays subject to the auto-lock
    App.addListener('backButton', () => {
        const event = new CustomEvent('app-back', { cancelable: true });
        if (window.dispatchEvent(event)) App.minimizeApp();
    });

    // Sync through the user's Google Drive. Google Play services keeps the sign-in; the page
    // only ever holds a short-lived access token, and only in memory.
    let driveToken = null;
    addDriveSync(platform, {
        connect: async () => {
            const result = await GoogleDrive.authorize({ interactive: true });
            if (result.canceled || !result.token) return false;
            driveToken = result.token;
            return true;
        },
        getAccessToken: async ({ refresh }) => {
            if (refresh && driveToken) {
                await GoogleDrive.clearToken({ token: driveToken });
                driveToken = null;
            }
            if (!driveToken) {
                const result = await GoogleDrive.authorize({ interactive: false });
                if (result.canceled || !result.token) {
                    throw new Error('Google Drive bağlantısı kesildi. Ayarlardan yeniden bağlanın.');
                }
                driveToken = result.token;
            }
            return driveToken;
        },
        fetch: (url, options) => fetch(url, options)
    });

    return platform;
}
