// The desktop app's Google sign-in (electron/googleDrive.cjs), with Google and the browser played by the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createGoogleDrive } = require('../../electron/googleDrive.cjs');

// Stands in for the operating system's encryption of small secrets
const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (data) => {
        const text = data.toString();
        if (!text.startsWith('enc:')) throw new Error('not encrypted');
        return text.slice(4);
    }
};

function setup({ withClient = true } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'orenda-test-'));
    const configPath = join(dir, 'google-oauth.json');
    if (withClient) writeFileSync(configPath, JSON.stringify({ installed: { client_id: 'client-1', client_secret: 'secret-1' } }));

    const google = { tokenRequests: [], revoked: false, userAllows: true, accessCount: 0 };
    // Google's token endpoint
    const fetchFake = async (url, options) => {
        const fields = Object.fromEntries(new URLSearchParams(options.body));
        google.tokenRequests.push(fields);
        const answer = (status, body) => new Response(JSON.stringify(body), { status });
        if (fields.client_id !== 'client-1' || fields.client_secret !== 'secret-1') return answer(401, { error: 'invalid_client' });
        if (fields.grant_type === 'authorization_code') {
            const challenge = require('node:crypto').createHash('sha256').update(fields.code_verifier).digest('base64url');
            if (fields.code !== 'code-1' || challenge !== google.challenge || fields.redirect_uri !== google.redirectUri) {
                return answer(400, { error: 'invalid_grant' });
            }
            return answer(200, { access_token: `access-${++google.accessCount}`, refresh_token: 'refresh-1', expires_in: 3600 });
        }
        if (fields.grant_type === 'refresh_token') {
            if (google.revoked || fields.refresh_token !== 'refresh-1') return answer(400, { error: 'invalid_grant' });
            return answer(200, { access_token: `access-${++google.accessCount}`, expires_in: 3600 });
        }
        return answer(400, { error: 'unsupported' });
    };
    // The user's browser: follows Google's redirect back to the app
    const openExternal = (url) => {
        const params = new URL(url).searchParams;
        google.authParams = Object.fromEntries(params);
        google.challenge = params.get('code_challenge');
        google.redirectUri = params.get('redirect_uri');
        const back = new URL(google.redirectUri);
        back.searchParams.set('state', params.get('state'));
        if (google.userAllows) back.searchParams.set('code', 'code-1');
        else back.searchParams.set('error', 'access_denied');
        fetch(back).then(response => response.text()).then(text => { google.page = text; }).catch(() => {});
    };

    const tokenPath = join(dir, 'google-drive.token');
    const create = () => createGoogleDrive({ configPath, tokenPath, openExternal, safeStorage, fetch: fetchFake });
    return { google, tokenPath, create };
}

test('without a Google client in the build, Drive sync is not offered', () => {
    assert.equal(setup({ withClient: false }).create().available, false);
    assert.equal(setup().create().available, true);
});

test('the user allows access in the browser; the app keeps only an encrypted refresh token', async () => {
    const { google, tokenPath, create } = setup();
    const drive = create();

    assert.equal(await drive.connect(), true);
    assert.equal(google.authParams.scope, 'https://www.googleapis.com/auth/drive.appdata');
    assert.equal(google.authParams.code_challenge_method, 'S256');
    assert.match(google.redirectUri, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(readFileSync(tokenPath).toString(), 'enc:refresh-1');
    assert.equal(await drive.getAccessToken(), 'access-1');
    assert.equal(await drive.getAccessToken(), 'access-1', 'a valid token is reused');
    assert.equal(await drive.getAccessToken({ refresh: true }), 'access-2', 'a refused token is replaced');

    // after a restart of the app the stored permission is enough
    const restarted = create();
    assert.equal(await restarted.getAccessToken(), 'access-3');

    // the sign-in page is gone once it has done its job
    await assert.rejects(fetch(google.redirectUri));
});

test('declining in the browser connects nothing', async () => {
    const { google, tokenPath, create } = setup();
    google.userAllows = false;
    const drive = create();
    assert.equal(await drive.connect(), false);
    assert.equal(existsSync(tokenPath), false);
    await assert.rejects(drive.getAccessToken(), /yeniden bağlanın/);
});

test('a permission withdrawn at Google is forgotten and reported', async () => {
    const { google, tokenPath, create } = setup();
    const drive = create();
    await drive.connect();
    google.revoked = true;
    await assert.rejects(drive.getAccessToken({ refresh: true }), /yeniden bağlanın/);
    assert.equal(existsSync(tokenPath), false);
});

test('a request that does not come from this sign-in is ignored', async () => {
    const { google, create } = setup();
    const drive = create();
    const originalAllows = google.userAllows;
    google.userAllows = originalAllows;
    // a stranger's page calling the local address with a wrong state must not complete the sign-in
    const connecting = drive.connect();
    await new Promise(resolve => setTimeout(resolve, 50));
    const forged = await fetch(`${google.redirectUri}/?state=wrong&code=stolen`).catch(() => null);
    assert.ok(forged === null || forged.status === 400);
    assert.equal(await connecting, true);
    assert.equal(google.tokenRequests[0].code, 'code-1');
});
