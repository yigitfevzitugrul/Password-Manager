/**
 * Google sign-in for the desktop app's Drive sync: the user allows access in their own browser,
 * Google sends them back to a page served by this app on this computer only (loopback address).
 *
 * The app's identity towards Google is read from electron/google-oauth.json (the file Google
 * offers for download for a "Desktop app" client). It is not part of the repository; without it
 * Drive sync is simply not offered.
 *
 * What is kept: the refresh token, encrypted by the operating system for this user account.
 */
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000;

const page = (text) => `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Orenda Pass</title>` +
    `<body style="font-family:system-ui,sans-serif;background:#06070a;color:#e5e7eb;display:flex;` +
    `align-items:center;justify-content:center;height:100vh;margin:0"><p>${text}</p></body></html>`;

function readClient(configPath) {
    try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const client = parsed.installed || parsed;
        if (typeof client.client_id !== 'string' || typeof client.client_secret !== 'string') return null;
        return { id: client.client_id, secret: client.client_secret };
    } catch (e) {
        return null;
    }
}

/**
 * @param {{ configPath: string, tokenPath: string, openExternal: (url: string) => void,
 *           safeStorage: Electron.SafeStorage, fetch?: typeof fetch }} options
 */
function createGoogleDrive({ configPath, tokenPath, openExternal, safeStorage, fetch: fetchImpl = fetch }) {
    const client = readClient(configPath);
    let access = null; // { token, expiresAt }
    let consent = null; // the sign-in that is waiting for the browser, if any

    function readRefreshToken() {
        try {
            return safeStorage.decryptString(fs.readFileSync(tokenPath));
        } catch (e) {
            return null;
        }
    }

    function writeRefreshToken(token) {
        fs.writeFileSync(tokenPath, safeStorage.encryptString(token), { mode: 0o600 });
    }

    function forget() {
        access = null;
        try { fs.unlinkSync(tokenPath); } catch (e) { /* nothing stored */ }
    }

    async function requestToken(fields) {
        const response = await fetchImpl(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, ...fields }).toString()
        });
        const body = await response.json().catch(() => ({}));
        if (response.status !== 200 || typeof body.access_token !== 'string') {
            const error = new Error('Google izni alınamadı.');
            error.code = body.error;
            throw error;
        }
        access = { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
        return body;
    }

    // Waits for Google to send the browser back with the one-time code
    function waitForCode(state) {
        let server;
        let timer;
        let giveUp;
        const promise = new Promise((resolve, reject) => {
            giveUp = reject;
            server = http.createServer((req, res) => {
                const url = new URL(req.url, 'http://127.0.0.1');
                if (url.pathname !== '/') {
                    res.writeHead(404).end();
                    return;
                }
                const ok = url.searchParams.get('state') === state && url.searchParams.get('code');
                res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(page(ok
                    ? 'Bağlantı tamamlandı. Bu sekmeyi kapatıp Orenda Pass\'e dönebilirsiniz.'
                    : 'Bağlantı tamamlanamadı. Orenda Pass\'e dönüp yeniden deneyin.'));
                if (ok) resolve(url.searchParams.get('code'));
                else if (url.searchParams.get('state') === state) reject(new Error('İzin verilmedi.'));
            });
            server.on('error', reject);
            timer = setTimeout(() => reject(new Error('Zaman aşımı')), CONSENT_TIMEOUT_MS);
        });
        const close = () => {
            clearTimeout(timer);
            server.close();
        };
        promise.then(close, close);
        const listening = new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve(server.address().port));
        });
        return { promise, listening, cancel: () => giveUp(new Error('İptal edildi.')) };
    }

    return {
        available: Boolean(client) && safeStorage.isEncryptionAvailable(),

        // Opens Google's permission screen in the user's browser; false when they did not allow it
        async connect() {
            if (consent) consent.cancel();
            const state = crypto.randomBytes(16).toString('base64url');
            const verifier = crypto.randomBytes(48).toString('base64url');
            const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

            const waiting = waitForCode(state);
            consent = waiting;
            try {
                const redirectUri = `http://127.0.0.1:${await waiting.listening}`;
                openExternal(`${AUTH_URL}?${new URLSearchParams({
                    client_id: client.id,
                    redirect_uri: redirectUri,
                    response_type: 'code',
                    scope: SCOPE,
                    state,
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                    access_type: 'offline',
                    prompt: 'consent'
                })}`);

                let code;
                try {
                    code = await waiting.promise;
                } catch (e) {
                    return false;
                }
                const granted = await requestToken({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: verifier,
                    redirect_uri: redirectUri
                });
                if (typeof granted.refresh_token !== 'string') throw new Error('Google izni alınamadı.');
                writeRefreshToken(granted.refresh_token);
                return true;
            } finally {
                if (consent === waiting) consent = null;
            }
        },

        async getAccessToken({ refresh } = {}) {
            if (!refresh && access && Date.now() < access.expiresAt - 60 * 1000) return access.token;
            const refreshToken = readRefreshToken();
            if (!refreshToken) throw new Error('Google Drive bağlantısı kesildi. Ayarlardan yeniden bağlanın.');
            try {
                await requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
            } catch (err) {
                // Google withdrew the permission (revoked by the user, or expired)
                if (err.code === 'invalid_grant') {
                    forget();
                    throw new Error('Google Drive bağlantısı kesildi. Ayarlardan yeniden bağlanın.');
                }
                throw err;
            }
            return access.token;
        },

        fetch: (url, options) => fetchImpl(url, options)
    };
}

module.exports = { createGoogleDrive };
