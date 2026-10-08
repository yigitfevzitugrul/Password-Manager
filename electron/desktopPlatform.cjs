/**
 * Host services the shared vault service needs, implemented for the Electron desktop app
 * (see the `platform` description in shared/vaultService.js).
 */
const { app, shell, clipboard, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const QRCode = require('qrcode');

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
// Sync files live in a folder the user picked; only plain file names are ever used inside it
function inFolder(folder, name) {
    if (typeof name !== 'string' || name !== path.basename(name) || name.startsWith('.')) {
        throw new Error('Geçersiz dosya adı.');
    }
    return path.join(folder, name);
}

function createDesktopPlatform(getWindow) {
    const liveWindow = () => {
        const win = getWindow();
        return win && !win.isDestroyed() ? win : null;
    };

    return {
        getVersion: () => app.getVersion(),

        notifyLocked() {
            const win = liveWindow();
            if (win) win.webContents.send('vault-locked');
        },

        notifyVaultChanged(change) {
            const win = liveWindow();
            if (win) win.webContents.send('vault-changed', change);
        },

        getDeviceName: () => os.hostname(),

        clipboard: {
            readText: () => clipboard.readText(),
            writeText: (text) => clipboard.writeText(text),
            clear: () => clipboard.clear()
        },

        openExternal: (url) => shell.openExternal(url),

        httpGet({ hostname, path: requestPath, headers, timeoutMs, maxBytes }) {
            return new Promise((resolve, reject) => {
                const req = https.request({ hostname, path: requestPath, method: 'GET', headers, timeout: timeoutMs }, (res) => {
                    let body = '';
                    res.on('data', chunk => {
                        body += chunk;
                        if (body.length > maxBytes) req.destroy(new Error('Yanıt çok büyük'));
                    });
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    const error = new Error('Zaman aşımı');
                    error.code = 'TIMEOUT';
                    req.destroy(error);
                });
                req.end();
            });
        },

        makeQrDataUrl: (text) => QRCode.toDataURL(text, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        }),

        async saveFile({ title, defaultName, filters, data }) {
            const result = await dialog.showSaveDialog(liveWindow(), {
                title,
                defaultPath: path.join(app.getPath('documents'), defaultName),
                filters
            });
            if (result.canceled || !result.filePath) return { canceled: true };

            fs.writeFileSync(result.filePath, data, { mode: 0o600 });
            return { canceled: false, path: result.filePath };
        },

        async openFile({ title, filters, maxBytes }) {
            const result = await dialog.showOpenDialog(liveWindow(), { title, properties: ['openFile'], filters });
            if (result.canceled || result.filePaths.length === 0) return { canceled: true };

            const filePath = result.filePaths[0];
            if (fs.statSync(filePath).size > maxBytes) return { canceled: false, tooLarge: true };
            return { canceled: false, path: filePath, name: path.basename(filePath), data: fs.readFileSync(filePath) };
        },

        async readFile(filePath, maxBytes) {
            if (fs.statSync(filePath).size > maxBytes) throw new Error('Dosya çok büyük.');
            return fs.readFileSync(filePath);
        },

        // --- Sync folder ---

        async pickFolder({ title }) {
            const result = await dialog.showOpenDialog(liveWindow(), { title, properties: ['openDirectory', 'createDirectory'] });
            if (result.canceled || result.filePaths.length === 0) return { canceled: true };
            return { canceled: false, path: result.filePaths[0] };
        },

        async listFolder(folder) {
            const names = await fs.promises.readdir(folder);
            const entries = [];
            for (const name of names) {
                if (!name.startsWith('orenda-sync-')) continue;
                try {
                    const stat = await fs.promises.stat(path.join(folder, name));
                    if (stat.isFile()) entries.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
                } catch (e) {
                    // removed while listing
                }
            }
            return entries;
        },

        async readFolderFile(folder, name, maxBytes) {
            const filePath = inFolder(folder, name);
            if ((await fs.promises.stat(filePath)).size > maxBytes) throw new Error('Dosya çok büyük.');
            return fs.promises.readFile(filePath);
        },

        // Written under a temporary name first, so other devices never read a half-written file
        async writeFolderFile(folder, name, bytes) {
            const filePath = inFolder(folder, name);
            const tmpPath = `${filePath}.tmp`;
            await fs.promises.writeFile(tmpPath, bytes);
            try {
                await fs.promises.rename(tmpPath, filePath);
            } catch (e) {
                // A cloud drive client may hold the old file open: fall back to writing in place
                await fs.promises.writeFile(filePath, bytes);
                await fs.promises.unlink(tmpPath).catch(() => {});
            }
        },

        async removeFolderFile(folder, name) {
            await fs.promises.unlink(inFolder(folder, name));
        }
    };
}

module.exports = { createDesktopPlatform };
