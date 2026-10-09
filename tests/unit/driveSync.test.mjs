// Sync through the user's Google Drive, against a stand-in for the Drive API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createDriveFolder, addDriveSync, DRIVE_FOLDER } from '../../shared/driveFolder.js';
import { createDevice } from './_fakes.mjs';
import { createFakeDrive } from './_fakeDrive.mjs';

const require = createRequire(import.meta.url);
const nodePrimitives = require('../../electron/nodePrimitives.cjs');

const PASSWORD = 'kavun-Masa-71-deniz';
const KEYRING = 'orenda-sync-00000000000000aa.opkeyring';
const FILE_A = 'orenda-sync-00000000000000aa-00000000000000b1.opsync';
const FILE_B = 'orenda-sync-00000000000000aa-00000000000000b2.opsync';
const bytes = (...values) => Uint8Array.from(values);

test('files in the Drive folder: list, read, write, replace, remove', async () => {
    const drive = createFakeDrive();
    const folder = createDriveFolder({ getAccessToken: async () => 'token-1', fetch: drive.fetch });

    assert.deepEqual(await folder.list(), []);
    await folder.write(KEYRING, bytes(1, 2, 3));
    await folder.write(FILE_A, bytes(4));
    await folder.write(FILE_B, bytes(5, 6));
    assert.deepEqual((await folder.list()).map(entry => [entry.name, entry.size]).sort(),
        [[FILE_A, 1], [FILE_B, 2], [KEYRING, 3]]);
    assert.deepEqual(await folder.read(KEYRING, 100), bytes(1, 2, 3));

    // writing again replaces the file instead of adding a second one with the same name
    const before = (await folder.list()).find(entry => entry.name === FILE_A).mtimeMs;
    await folder.write(FILE_A, bytes(7, 8, 9));
    assert.equal(drive.files.size, 3);
    assert.deepEqual(await folder.read(FILE_A, 100), bytes(7, 8, 9));
    assert.ok((await folder.list()).find(entry => entry.name === FILE_A).mtimeMs > before, 'a change is visible in the listing');

    await assert.rejects(folder.read(FILE_A, 2), /çok büyük/);
    await folder.remove(FILE_A);
    await folder.remove(FILE_A); // already gone: fine
    assert.deepEqual(drive.names(), [FILE_B, KEYRING]);
    await assert.rejects(folder.read(FILE_A, 100), /bulunamadı/);
});

test('only the app\'s own sync files are touched or shown', async () => {
    const drive = createFakeDrive();
    drive.put('orenda-sync-not-ours.txt', bytes(1));
    drive.put('something-else', bytes(1));
    const folder = createDriveFolder({ getAccessToken: async () => 'token-1', fetch: drive.fetch });

    assert.deepEqual(await folder.list(), []);
    for (const name of ['notes.txt', '../x', 'orenda-sync-zz.opsync', 'orenda-sync-00000000000000aa.exe']) {
        await assert.rejects(folder.write(name, bytes(1)), /Geçersiz/);
        await assert.rejects(folder.read(name, 10), /Geçersiz/);
    }
    assert.equal(drive.files.size, 2);
});

test('an expired access token is renewed once; a refused one is reported', async () => {
    const drive = createFakeDrive();
    const asked = [];
    let token = 'expired';
    const folder = createDriveFolder({
        getAccessToken: async ({ refresh }) => {
            asked.push(refresh);
            if (refresh) token = 'token-1';
            return token;
        },
        fetch: drive.fetch
    });
    await folder.write(KEYRING, bytes(1));
    assert.deepEqual(asked.slice(0, 2), [false, true]);
    assert.deepEqual(drive.names(), [KEYRING]);

    drive.validTokens.clear();
    await assert.rejects(folder.list(), (err) => err.status === 401 && /reddedildi/.test(err.message));
});

test('two files with one name: the newest counts and the other is cleaned up', async () => {
    const drive = createFakeDrive();
    drive.put(FILE_A, bytes(1));
    drive.put(FILE_A, bytes(2, 2));
    const folder = createDriveFolder({ getAccessToken: async () => 'token-1', fetch: drive.fetch });

    assert.deepEqual((await folder.list()).map(entry => entry.size), [2]);
    assert.deepEqual(await folder.read(FILE_A, 10), bytes(2, 2));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(drive.files.size, 1);
});

test('a file removed on another device is created again when written', async () => {
    const drive = createFakeDrive();
    const folder = createDriveFolder({ getAccessToken: async () => 'token-1', fetch: drive.fetch });
    await folder.write(FILE_A, bytes(1));
    drive.files.clear();
    await folder.write(FILE_A, bytes(2));
    assert.deepEqual(drive.names(), [FILE_A]);
    assert.deepEqual(await folder.read(FILE_A, 10), bytes(2));
});

// One device whose platform can also sync through the given Google account
function driveDevice(drive, options = {}) {
    const device = createDevice(nodePrimitives, options);
    device.googleAllowed = true;
    addDriveSync(device.host.platform, {
        connect: async () => device.googleAllowed,
        getAccessToken: async () => 'token-1',
        fetch: drive.fetch
    });
    return device;
}

test('two devices stay in sync through one Google Drive, and a third joins from the login screen', async () => {
    const drive = createFakeDrive();
    const computer = driveDevice(drive, { deviceName: 'Bilgisayar' });
    const phone = driveDevice(drive, { deviceName: 'Telefon' });

    assert.deepEqual(await computer.api.getSyncTargets(), ['folder', 'drive']);

    computer.ui.opened(await computer.api.register({ firstName: 'Ada', lastName: 'Yılmaz', password: PASSWORD }));
    await computer.ui.save([{ id: 'e1', title: 'GitHub', username: 'ada', password: 'gh-1' }]);

    // declining Google's permission screen changes nothing
    computer.googleAllowed = false;
    assert.equal((await computer.api.enableSync(PASSWORD, 'drive')).canceled, true);
    assert.equal((await computer.api.getSyncStatus()).enabled, false);
    computer.googleAllowed = true;

    assert.equal((await computer.api.enableSync(PASSWORD, 'drive')).success, true);
    assert.equal((await computer.api.getSyncStatus()).folder, DRIVE_FOLDER);
    assert.equal(drive.names().length, 2, 'keyring and the computer\'s file');

    // the phone has no account yet: the account is added from Drive
    assert.equal((await phone.api.joinSyncedAccount('yanlis-sifre-123', 'drive')).success, false);
    const joined = phone.ui.opened(await phone.api.joinSyncedAccount(PASSWORD, 'drive'));
    assert.equal(joined.success, true);
    assert.equal(joined.user.username, 'Ada Yılmaz');
    assert.deepEqual(phone.ui.items.map(item => item.title), ['GitHub']);

    // an entry added on the phone reaches the computer
    await phone.ui.save([...phone.ui.items, { id: 'e2', title: 'Gmail', username: 'ada@x.co', password: 'gm-1' }]);
    await phone.api.syncNow();
    await computer.api.syncNow();
    assert.deepEqual(computer.ui.items.map(item => item.title).sort(), ['GitHub', 'Gmail']);

    // a change on the computer reaches the phone
    await computer.ui.save(computer.ui.items.map(item => (item.id === 'e1' ? { ...item, password: 'gh-2' } : item)));
    await computer.api.syncNow();
    await phone.api.syncNow();
    assert.equal(phone.ui.items.find(item => item.id === 'e1').password, 'gh-2');

    // Drive unreachable: reported, nothing lost, catches up later
    drive.offline = true;
    await phone.ui.save([...phone.ui.items, { id: 'e3', title: 'Banka', username: 'ada', password: 'b-1' }]);
    assert.equal((await phone.api.syncNow()).success, false);
    drive.offline = false;
    await phone.api.syncNow();
    await computer.api.syncNow();
    assert.deepEqual(computer.ui.items.map(item => item.title).sort(), ['Banka', 'GitHub', 'Gmail']);

    // turning sync off removes only this device's file
    assert.equal((await phone.api.disableSync()).success, true);
    assert.equal(drive.names().length, 2);
    computer.lock(false);
    phone.lock(false);
});

test('coming back to the app syncs at once, but not over and over', async () => {
    const drive = createFakeDrive();
    const computer = driveDevice(drive);
    const phone = driveDevice(drive);
    computer.ui.opened(await computer.api.register({ firstName: 'Ada', lastName: 'Yılmaz', password: PASSWORD }));
    assert.equal((await computer.api.enableSync(PASSWORD, 'drive')).success, true);
    phone.ui.opened(await phone.api.joinSyncedAccount(PASSWORD, 'drive'));

    await computer.ui.save([{ id: 'e1', title: 'GitHub', username: 'ada', password: 'gh-1' }]);
    await computer.api.syncNow();

    const settle = async (device) => {
        await new Promise(resolve => setTimeout(resolve, 20));
        await device.syncIdle();
    };
    // the phone synced a moment ago (when it joined): activating it again right away asks Drive nothing
    let before = drive.requests.length;
    phone.syncSoon();
    await settle(phone);
    assert.equal(drive.requests.length, before);
    assert.deepEqual(phone.ui.items, []);

    // later the user returns to the app: the entry is there without pressing anything
    const realNow = Date.now;
    Date.now = () => realNow() + 60 * 1000;
    try {
        phone.syncSoon();
        await settle(phone);
    } finally {
        Date.now = realNow;
    }
    assert.deepEqual(phone.ui.items.map(item => item.title), ['GitHub']);

    // locked: nothing happens
    phone.lock(false);
    before = drive.requests.length;
    phone.syncSoon();
    await settle(phone);
    assert.equal(drive.requests.length, before);
    computer.lock(false);
});

test('another account in the same Google Drive gets its own vault next to the first', async () => {
    const drive = createFakeDrive();
    const first = driveDevice(drive);
    const second = driveDevice(drive);

    first.ui.opened(await first.api.register({ firstName: 'Ada', lastName: 'Yılmaz', password: PASSWORD }));
    await first.ui.save([{ id: 'a1', title: 'Ada\'nın kaydı', username: 'a', password: 'p' }]);
    assert.equal((await first.api.enableSync(PASSWORD, 'drive')).success, true);

    second.ui.opened(await second.api.register({ firstName: 'Can', lastName: 'Demir', password: 'baska-Parola-88-orman' }));
    await second.ui.save([{ id: 'c1', title: 'Can\'ın kaydı', username: 'c', password: 'p' }]);
    assert.equal((await second.api.enableSync('baska-Parola-88-orman', 'drive')).success, true);

    await first.api.syncNow();
    await second.api.syncNow();
    assert.deepEqual(first.ui.items.map(item => item.title), ['Ada\'nın kaydı']);
    assert.deepEqual(second.ui.items.map(item => item.title), ['Can\'ın kaydı']);
    assert.equal(drive.names().filter(name => name.endsWith('.opkeyring')).length, 2);
    first.lock(false);
    second.lock(false);
});

test('a host without the chosen sync method refuses it', async () => {
    const device = createDevice(nodePrimitives);
    device.ui.opened(await device.api.register({ firstName: 'Ada', lastName: 'Yılmaz', password: PASSWORD }));
    assert.deepEqual(await device.api.getSyncTargets(), ['folder']);
    assert.match((await device.api.enableSync(PASSWORD, 'drive')).error, /kullanılamıyor/);
    assert.match((await device.api.joinSyncedAccount(PASSWORD, 'drive')).error, /kullanılamıyor/);
    device.lock(false);
});
