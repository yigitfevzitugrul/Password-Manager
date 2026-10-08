// The vault service must run without Electron or Node's crypto: here it runs on pure-JS primitives,
// in-memory storage and a fake host, which is how it will run inside a mobile WebView.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createVaultService } from '../../shared/vaultService.js';
import { createTotp } from '../../shared/totp.js';
import { noblePrimitives } from '../../shared/noblePrimitives.js';
import { bytesToUtf8 } from '../../shared/bytes.js';

const require = createRequire(import.meta.url);
const nodePrimitives = require('../../electron/nodePrimitives.cjs');

const PASSWORD = 'kavun-Masa-71-deniz';
const NEW_PASSWORD = 'limon-Kapi-48-bulut';

function createMemoryStorage(files = new Map()) {
    return {
        files,
        read: (name) => (files.has(name) ? Uint8Array.from(files.get(name)) : null),
        write: (name, bytes) => { files.set(name, Uint8Array.from(bytes)); },
        exists: (name) => files.has(name),
        remove: (name) => { files.delete(name); },
        list: (dir) => [...files.keys()]
            .filter(name => name.startsWith(`${dir}/`))
            .map(name => name.slice(dir.length + 1))
            .filter(name => !name.includes('/')),
        stat: (name) => (files.has(name) ? { size: files.get(name).length, mtimeMs: 1 } : null)
    };
}

// A host with a clipboard, a "documents folder" (external) and scripted dialogs
function createFakePlatform(external = new Map()) {
    const host = {
        external,
        clipboardText: '',
        lockedNotifications: 0,
        openedUrls: [],
        cancelSave: false,
        pick: null, // path the next "open file" dialog returns, null = canceled
        http: async () => { throw new Error('offline'); }
    };
    host.platform = {
        getVersion: () => '1.1.0',
        notifyLocked: () => { host.lockedNotifications++; },
        clipboard: {
            readText: async () => host.clipboardText,
            writeText: async (text) => { host.clipboardText = text; },
            clear: () => { host.clipboardText = ''; }
        },
        openExternal: (url) => { host.openedUrls.push(url); },
        httpGet: (request) => host.http(request),
        makeQrDataUrl: async (text) => `data:fake,${text}`,
        saveFile: async ({ defaultName, data }) => {
            if (host.cancelSave) return { canceled: true };
            const path = `/documents/${defaultName}`;
            external.set(path, Uint8Array.from(data));
            return { canceled: false, path };
        },
        openFile: async ({ maxBytes }) => {
            if (!host.pick) return { canceled: true };
            const data = external.get(host.pick);
            if (data.length > maxBytes) return { canceled: false, tooLarge: true };
            return { canceled: false, path: host.pick, name: host.pick.split('/').pop(), data };
        },
        readFile: async (path) => {
            if (!external.has(path)) throw new Error('not found');
            return external.get(path);
        }
    };
    return host;
}

function createDevice(primitives, files, external) {
    const storage = createMemoryStorage(files);
    const host = createFakePlatform(external);
    const service = createVaultService({ primitives, storage, platform: host.platform });
    return { ...service, storage, host };
}

test('the page can call exactly what the vault service offers', () => {
    const preload = readFileSync(new URL('../../electron/preload.cjs', import.meta.url), 'utf8');
    const listed = preload.slice(preload.indexOf('const API_METHODS = ['), preload.indexOf('];'))
        .match(/'([A-Za-z0-9]+)'/g).map(name => name.slice(1, -1));
    const { api } = createDevice(noblePrimitives);
    assert.deepEqual([...listed].sort(), Object.keys(api).sort());
    assert.ok(Object.values(api).every(method => typeof method === 'function'));
});

test('whole account lifecycle without Electron or Node crypto', async () => {
    const device = createDevice(noblePrimitives);
    const { api, host, storage } = device;
    const totp = createTotp(noblePrimitives);

    assert.equal(api.checkUser(), false);
    assert.equal((await api.register({ firstName: 'A', lastName: 'B', password: 'kisa' })).success, false);
    const registered = await api.register({ firstName: 'Ayşe', lastName: 'Kara', password: PASSWORD });
    assert.equal(registered.success, true);
    const userId = registered.user.id;
    const vaultName = `vault_${userId}.enc`;
    assert.equal(bytesToUtf8(storage.read(vaultName).subarray(0, 4)), 'OPV2');

    const items = [{ id: '1', title: 'Örnek', password: 'gizli-şifre' }];
    assert.deepEqual(await api.savePasswords(items), { success: true });
    assert.ok(!bytesToUtf8(storage.read(vaultName)).includes('gizli'), 'vault is not stored in plain text');
    await assert.rejects(api.savePasswords('bad'));

    // lock / login
    api.logout();
    await assert.rejects(api.savePasswords(items), /Oturum/);
    let login = await api.login(userId, 'yanlis-sifre-123');
    assert.deepEqual([login.success, login.attemptsRemaining], [false, 2]);
    login = await api.login(userId, PASSWORD);
    assert.deepEqual(login.data, items);
    assert.equal(api.listAutoBackups().length, 1, 'a backup is taken at login');

    // TOTP login step
    const setup = await api.setup2FA();
    assert.equal((await api.enable2FA('000000')).success, totp.generateTOTP(setup.secret) === '000000');
    assert.equal((await api.enable2FA(totp.generateTOTP(setup.secret))).success, true);
    api.logout();
    login = await api.login(userId, PASSWORD);
    assert.equal(login.require2FA, true);
    await assert.rejects(api.savePasswords(items), /Oturum/, 'not unlocked before the code is given');
    assert.equal(api.verify2FALogin('12').success, false);
    assert.deepEqual(api.verify2FALogin(totp.generateTOTP(setup.secret)).data, items);
    assert.equal((await api.disable2FA('yanlis-sifre-123')).success, false);
    assert.equal((await api.disable2FA(PASSWORD)).success, true);

    // quick unlock PIN
    assert.equal((await api.setQuickPin(PASSWORD, '482913')).success, true);
    assert.deepEqual(api.autoLock(), { quickUnlock: true });
    await assert.rejects(api.savePasswords(items), /Oturum/);
    assert.equal(api.quickUnlock('000000').attemptsRemaining, 2);
    assert.deepEqual(api.quickUnlock('482913').data, items);

    // automatic lock from the host (screen lock): the UI is told
    assert.equal(device.softLock(true), true);
    assert.equal(host.lockedNotifications, 1);
    for (const pin of ['1', '2', '3']) api.quickUnlock(pin);
    assert.equal(api.quickUnlock('482913').success, false, 'three wrong PINs need the master password');
    await api.login(userId, PASSWORD);

    // key file
    assert.equal((await api.enableKeyFile('yanlis-sifre-123')).success, false);
    host.cancelSave = true;
    assert.equal((await api.enableKeyFile(PASSWORD)).canceled, true);
    host.cancelSave = false;
    const enabled = await api.enableKeyFile(PASSWORD);
    assert.equal(enabled.success, true, enabled.error);
    assert.equal(bytesToUtf8(storage.read(vaultName).subarray(0, 4)), 'OPK2');
    assert.deepEqual(api.getKeyFileStatus(), { enabled: true, path: '/documents/orenda-pass.opkey' });
    api.logout();
    assert.deepEqual((await api.login(userId, PASSWORD)).data, items, 'key file found where it was saved');
    api.logout();

    const keyFile = host.external.get(enabled.path);
    host.external.delete(enabled.path);
    login = await api.login(userId, PASSWORD);
    assert.deepEqual([login.needsKeyFile, login.keyFileName], [true, 'orenda-pass.opkey']);
    assert.equal(api.checkLockout().attempts, 0, 'a missing key file is not a failed attempt');
    host.external.set('/usb/key.opkey', keyFile);
    host.pick = '/usb/key.opkey';
    assert.equal((await api.selectKeyFile(userId)).keyFileName, 'key.opkey');
    assert.deepEqual((await api.login(userId, PASSWORD)).data, items);
    assert.equal(api.getKeyFileStatus().path, '/usb/key.opkey');

    // master password change keeps everything readable
    assert.equal((await api.changePassword(PASSWORD, 'kisa')).success, false);
    assert.equal((await api.changePassword(PASSWORD, NEW_PASSWORD)).success, true);
    assert.equal(api.getQuickPinStatus().enabled, true);
    assert.equal((await api.openBackup(api.listAutoBackups()[0].name)).success, true, 'old backups were re-encrypted');
    api.logout();
    assert.equal((await api.login(userId, PASSWORD)).success, false);
    assert.deepEqual((await api.login(userId, NEW_PASSWORD)).data, items);

    // encrypted backup: export, then restore after turning the key file off
    const exported = await api.exportEncryptedBackup();
    assert.deepEqual([exported.success, exported.count], [true, 1]);
    const backupPath = [...host.external.keys()].find(path => path.endsWith('.opbackup'));
    assert.ok(!bytesToUtf8(host.external.get(backupPath)).includes('gizli'));
    assert.equal((await api.disableKeyFile(NEW_PASSWORD)).success, true);
    assert.equal(bytesToUtf8(storage.read(vaultName).subarray(0, 4)), 'OPV2');
    host.pick = backupPath;
    assert.equal((await api.openBackup()).needsPassword, true);
    host.pick = '/usb/key.opkey'; // the dialog that asks for the backup's key file
    const restored = await api.unlockBackup(NEW_PASSWORD);
    assert.deepEqual(restored.items, items);

    // clipboard
    assert.equal(api.setClipboardClearSeconds(7), false);
    assert.equal(api.setClipboardClearSeconds(10), true);
    assert.equal(await api.copyToClipboard('pano-sirri'), true);
    assert.equal(host.clipboardText, 'pano-sirri');
    device.lock(false);
    await device.clipboardCleared();
    assert.equal(host.clipboardText, '', 'locking clears what the app copied');
});

test('a vault folder written on one platform opens on the other, both ways', async () => {
    const files = new Map();
    const external = new Map();
    const items = [{ id: '1', title: 'Masaüstünde eklendi', password: 'şifre-1' }];

    // "desktop": Node crypto
    const desktop = createDevice(nodePrimitives, files, external);
    const { user } = await desktop.api.register({ firstName: 'Ortak', lastName: 'Kasa', password: PASSWORD });
    await desktop.api.savePasswords(items);
    assert.equal((await desktop.api.enableKeyFile(PASSWORD)).success, true);
    assert.equal((await desktop.api.setQuickPin(PASSWORD, '1357')).success, true);
    desktop.api.logout();

    // "phone": pure JS, same files (as if the data folder had been synchronised)
    const phone = createDevice(noblePrimitives, new Map(files), external);
    let login = await phone.api.login(user.id, PASSWORD);
    assert.deepEqual(login.data, items);
    assert.equal(phone.api.getQuickPinStatus().enabled, true, 'PIN set on the desktop is known on the phone');
    const fromPhone = [...items, { id: '2', title: 'Telefonda eklendi', password: 'şifre-2' }];
    await phone.api.savePasswords(fromPhone);
    assert.equal((await phone.api.changePassword(PASSWORD, NEW_PASSWORD)).success, true);
    phone.api.logout();

    // back on the "desktop"
    const desktopAgain = createDevice(nodePrimitives, new Map(phone.storage.files), external);
    assert.equal((await desktopAgain.api.login(user.id, PASSWORD)).success, false);
    login = await desktopAgain.api.login(user.id, NEW_PASSWORD);
    assert.deepEqual(login.data, fromPhone);
});

test('breach check and update check handle every network outcome', async () => {
    const { api, host } = createDevice(noblePrimitives);

    // SHA-1("password") = 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    const requests = [];
    host.http = async (request) => {
        requests.push(`${request.hostname}${request.path}`);
        return { status: 200, body: '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:123\r\n' };
    };
    assert.deepEqual(await api.checkPwnedPassword('password'), { pwned: true, count: 123 });
    assert.deepEqual(requests, ['api.pwnedpasswords.com/range/5BAA6'], 'only the first five characters of the hash are sent');
    assert.deepEqual(await api.checkPwnedPassword('not-in-the-list'), { pwned: false, count: 0 });

    host.http = async () => ({ status: 503, body: '' });
    assert.match((await api.checkPwnedPassword('password')).error, /503/, 'a failed lookup is never reported as safe');
    host.http = async () => { throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' }); };
    assert.equal((await api.checkPwnedPassword('password')).error, 'Zaman aşımı');
    host.http = async () => { throw new Error('offline'); };
    assert.equal((await api.checkPwnedPassword('password')).error, 'Bağlantı hatası');
    assert.equal((await api.checkForUpdates()).success, false);

    host.http = async () => ({ status: 200, body: JSON.stringify({ tag_name: 'v1.2.0' }) });
    assert.deepEqual(await api.checkForUpdates(),
        { success: true, currentVersion: '1.1.0', latestVersion: '1.2.0', updateAvailable: true });
    host.http = async () => ({ status: 200, body: JSON.stringify({ tag_name: 'v1.1.0' }) });
    assert.equal((await api.checkForUpdates()).updateAvailable, false);
    host.http = async () => ({ status: 200, body: 'not json' });
    assert.equal((await api.checkForUpdates()).success, false);

    api.openReleasePage();
    assert.deepEqual(host.openedUrls, ['https://github.com/yigitfevzitugrul/Password-Manager/releases/latest']);
});
