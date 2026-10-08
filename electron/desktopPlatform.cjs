/**
 * Host services the shared vault service needs, implemented for the Electron desktop app
 * (see the `platform` description in shared/vaultService.js).
 */
const { app, shell, clipboard, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const QRCode = require('qrcode');

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
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
        }
    };
}

module.exports = { createDesktopPlatform };
