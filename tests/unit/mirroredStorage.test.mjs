// The storage used where the app does not run inside Electron (mobile WebView, browser):
// synchronous for the vault code, written through to an asynchronous backing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMirroredStorage } from '../../src/host/mirroredStorage.js';
import { createVaultService } from '../../shared/vaultService.js';
import { noblePrimitives } from '../../shared/noblePrimitives.js';
import { createFakePlatform } from './_fakes.mjs';

// Stands in for IndexedDB: asynchronous, keeps what was put
function createBacking() {
    const records = new Map();
    const log = [];
    const later = () => new Promise(resolve => setTimeout(resolve, 1));
    return {
        records,
        log,
        loadAll: async () => [...records.entries()],
        put: async (name, record) => { await later(); log.push(`put ${name}`); records.set(name, record); },
        delete: async (name) => { await later(); log.push(`delete ${name}`); records.delete(name); }
    };
}

const bytes = (...values) => Uint8Array.from(values);

test('files are readable at once and reach the backing in the order they were written', async () => {
    const backing = createBacking();
    const storage = await createMirroredStorage(backing, { now: () => 42 });

    storage.write('users.json', bytes(1, 2, 3));
    storage.write('backups/u1/a.enc', bytes(4));
    storage.write('backups/u1/b.enc', bytes(5));
    storage.write('users.json', bytes(9));
    storage.remove('backups/u1/a.enc');
    storage.remove('never-existed');

    assert.deepEqual(storage.read('users.json'), bytes(9));
    assert.equal(storage.read('missing'), null);
    assert.equal(storage.exists('backups/u1/a.enc'), false);
    assert.deepEqual(storage.list('backups/u1'), ['b.enc']);
    assert.deepEqual(storage.list('backups'), []);
    assert.deepEqual(storage.stat('users.json'), { size: 1, mtimeMs: 42 });
    assert.equal(storage.stat('missing'), null);

    await storage.flushed();
    assert.deepEqual(backing.log, [
        'put users.json', 'put backups/u1/a.enc', 'put backups/u1/b.enc', 'put users.json', 'delete backups/u1/a.enc'
    ]);
    assert.deepEqual([...backing.records.keys()].sort(), ['backups/u1/b.enc', 'users.json']);
});

test('what the caller holds and what is stored never share memory', async () => {
    const backing = createBacking();
    const storage = await createMirroredStorage(backing);

    const written = bytes(1, 2, 3);
    storage.write('a', written);
    written.fill(0);
    const read = storage.read('a');
    read.fill(7);
    assert.deepEqual(storage.read('a'), bytes(1, 2, 3));

    await storage.flushed();
    assert.deepEqual(backing.records.get('a').data, bytes(1, 2, 3));
});

test('names that could leave the storage are refused', async () => {
    const storage = await createMirroredStorage(createBacking());
    for (const name of ['../x', 'a//b', 'a/./b', 'c:\\x', '']) {
        assert.throws(() => storage.write(name, bytes(1)), /Geçersiz/);
    }
});

test('a failing backing is reported and does not block later writes', async () => {
    const backing = createBacking();
    const put = backing.put;
    let fail = true;
    backing.put = async (name, record) => {
        if (fail) { fail = false; throw new Error('disk full'); }
        return put(name, record);
    };
    const errors = [];
    const storage = await createMirroredStorage(backing, { onError: (err) => errors.push(err.message) });

    storage.write('a', bytes(1));
    storage.write('b', bytes(2));
    await storage.flushed();
    assert.deepEqual(errors, ['disk full']);
    assert.deepEqual([...backing.records.keys()], ['b']);
});

test('a vault made in the page survives a restart of the app', async () => {
    const backing = createBacking();
    const PASSWORD = 'kavun-Masa-71-deniz';

    let storage = await createMirroredStorage(backing);
    let vault = createVaultService({ primitives: noblePrimitives, storage, platform: createFakePlatform().platform });
    const registered = await vault.api.register({ firstName: 'Ada', lastName: 'Yılmaz', password: PASSWORD });
    assert.equal(registered.success, true);
    const saved = await vault.api.savePasswords(
        [{ id: 'e1', title: 'GitHub', username: 'ada', password: 'gh-parola' }], registered.revision);
    assert.equal(saved.success, true);
    vault.lock(false);
    await storage.flushed();

    // the app is started again: nothing but the backing is left
    storage = await createMirroredStorage(backing);
    vault = createVaultService({ primitives: noblePrimitives, storage, platform: createFakePlatform().platform });
    const { users } = await vault.api.getUsers();
    assert.deepEqual(users.map(u => u.username), ['Ada Yılmaz']);
    assert.equal((await vault.api.login(users[0].id, 'yanlis-sifre-123')).success, false);
    const login = await vault.api.login(users[0].id, PASSWORD);
    assert.equal(login.success, true);
    assert.deepEqual(login.data.map(item => item.title), ['GitHub']);
    vault.lock(false);
});
