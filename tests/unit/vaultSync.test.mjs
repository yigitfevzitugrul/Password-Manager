// Sync between devices: the merge rules on their own, then several simulated devices
// sharing one "cloud folder".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { applyUiChanges, mergeStates, ensureItemIds, sanitizeState, pruneTombstones, TOMBSTONE_RETENTION_MS }
    from '../../shared/vaultSync.js';
import { noblePrimitives } from '../../shared/noblePrimitives.js';
import { bytesToUtf8 } from '../../shared/bytes.js';
import { createDevice, createCloud } from './_fakes.mjs';

const require = createRequire(import.meta.url);
const nodePrimitives = require('../../electron/nodePrimitives.cjs');

const PASSWORD = 'kavun-Masa-71-deniz';
const NEW_PASSWORD = 'limon-Kapi-48-bulut';

const entry = (id, extra = {}) => ({ id, title: id, username: 'kullanıcı', password: `pw-${id}`, ...extra });
const ids = (items) => items.map(item => item.id).sort();
const find = (items, id) => items.find(item => item.id === id);
const edit = (items, id, change) => items.map(item => (item.id === id ? { ...item, ...change } : item));
const without = (items, id) => items.filter(item => item.id !== id);
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
// Same entries with the same content, whatever their order
const exactSnapshot = (items) => JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id))
    .map(item => Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))));
// ...as a page sees them: the copy of the device that made an edit does not carry the stored modification time
const snapshot = (items) => exactSnapshot(items.map(({ mtime, ...content }) => content));

test('a save only changes what the user changed', () => {
    const stored = [entry('1', { mtime: 100 }), entry('2', { mtime: 100 })];

    // nothing changed: nothing is re-stamped
    let result = applyUiChanges(stored, [entry('1'), entry('2')], stored, 500);
    assert.deepEqual(result.items, stored);
    assert.deepEqual([result.removedIds, result.unseen], [[], false]);

    // one entry edited, one added, one removed
    result = applyUiChanges(stored, [entry('1', { password: 'yeni' }), entry('3')], stored, 500);
    assert.deepEqual(result.items.map(item => [item.id, item.mtime]), [['1', 500], ['3', 500]]);
    assert.deepEqual(result.removedIds, ['2']);

    // the clock went backwards: an edit is still newer than what it replaces
    result = applyUiChanges(stored, [entry('1', { password: 'yeni' }), entry('2')], stored, 50);
    assert.equal(find(result.items, '1').mtime, 101);

    // the vault already holds another device's changes that the page has not seen:
    // entry 4 arrived, entry 2 was changed, entry 1 was removed
    const current = [entry('2', { title: 'başka cihazda değişti', mtime: 300 }), entry('4', { mtime: 300 })];
    result = applyUiChanges(stored, [entry('1'), entry('2'), entry('5')], current, 500);
    assert.deepEqual(ids(result.items), ['2', '4', '5']);
    assert.equal(find(result.items, '2').title, 'başka cihazda değişti', 'untouched entry keeps the newer stored version');
    assert.deepEqual([result.removedIds, result.unseen], [[], true], 'entries the page never saw are not "removed by the user"');

    // user and another device changed the same entry: the user's version wins, the other password is kept
    const theirs = [entry('1', { password: 'onların-şifresi', mtime: 300 }), entry('2', { mtime: 100 })];
    result = applyUiChanges(stored, [entry('1', { password: 'benim-şifrem' }), entry('2')], theirs, 500);
    assert.equal(find(result.items, '1').password, 'benim-şifrem');
    assert.deepEqual(find(result.items, '1').passwordHistory.map(h => h.password), ['onların-şifresi']);
});

test('merging gives the same result on both sides', () => {
    const cases = [
        // later change wins
        [[entry('1', { title: 'eski', mtime: 10 })], [entry('1', { title: 'yeni', mtime: 20 })]],
        // same time, different content
        [[entry('1', { title: 'a', mtime: 10 })], [entry('1', { title: 'b', mtime: 10 })]],
        // same time, one already carries the other's password in its history
        [[entry('1', { password: 'x', mtime: 10, passwordHistory: [{ password: 'y', changedAt: 5 }] })],
            [entry('1', { password: 'x', mtime: 10 })]],
        // different passwords
        [[entry('1', { password: 'p1', mtime: 10 })], [entry('1', { password: 'p2', mtime: 20 })]],
        // entries only one side has
        [[entry('1', { mtime: 10 })], [entry('2', { mtime: 10 }), entry('3', { mtime: 10 })]]
    ];
    for (const [left, right] of cases) {
        const a = mergeStates({ items: left, tombstones: {} }, { items: right, tombstones: {} });
        const b = mergeStates({ items: right, tombstones: {} }, { items: left, tombstones: {} });
        assert.equal(exactSnapshot(a.items), exactSnapshot(b.items));
        // merging again changes nothing
        const again = mergeStates({ items: a.items, tombstones: a.tombstones }, { items: right, tombstones: {} });
        assert.equal(again.itemsChanged, false);
        assert.equal(exactSnapshot(again.items), exactSnapshot(a.items));
    }

    const merged = mergeStates(
        { items: [entry('1', { password: 'p1', mtime: 10 })], tombstones: {} },
        { items: [entry('1', { password: 'p2', mtime: 20 })], tombstones: {} }
    );
    assert.equal(merged.items[0].password, 'p2');
    assert.deepEqual(merged.items[0].passwordHistory, [{ password: 'p1', changedAt: 10 }], 'the losing password is not lost');
    assert.equal(merged.itemsChanged, true);
});

test('removed entries stay removed unless they were changed afterwards', () => {
    const local = { items: [entry('old', { mtime: 10 }), entry('edited-later', { mtime: 60 })], tombstones: {} };
    const remote = { items: [], tombstones: { old: 50, 'edited-later': 50, unknown: 50 } };

    const merged = mergeStates(local, remote);
    assert.deepEqual(ids(merged.items), ['edited-later']);
    assert.deepEqual(merged.tombstones, { old: 50, unknown: 50 }, 'the entry that survived no longer counts as removed');
    assert.deepEqual([merged.itemsChanged, merged.tombstonesChanged], [true, true]);

    // the other way round: the removal reaches a device that still offers the old entry
    const back = mergeStates({ items: [], tombstones: { old: 50 } }, { items: [entry('old', { mtime: 10 })], tombstones: {} });
    assert.deepEqual([back.items, back.itemsChanged], [[], false]);

    const now = 10 * TOMBSTONE_RETENTION_MS;
    assert.deepEqual(pruneTombstones({ recent: now - 1000, ancient: now - TOMBSTONE_RETENTION_MS - 1 }, now), { recent: now - 1000 });
});

test('data from another device is checked before it is merged', () => {
    const cleaned = sanitizeState({
        items: [entry('1', { mtime: 5 }), entry('1', { mtime: 9, title: 'newer duplicate' }), { title: 'no id' }, 'text', null, [1]],
        tombstones: { a: 5, b: 'x', c: -1, d: Infinity }
    });
    assert.deepEqual(cleaned.items.map(item => item.title), ['newer duplicate']);
    assert.deepEqual(cleaned.tombstones, { a: 5 });
    assert.deepEqual(sanitizeState(null), { items: [], tombstones: {} });
    assert.deepEqual(sanitizeState({ items: 'x', tombstones: [] }), { items: [], tombstones: {} });

    let counter = 0;
    const withIds = ensureItemIds([{ title: 'no id' }, entry('1'), entry('1')], () => `new-${++counter}`);
    assert.deepEqual([withIds.items.map(item => item.id), withIds.changed], [['new-1', '1', 'new-2'], true]);
    assert.equal(ensureItemIds([entry('1')], () => 'x').changed, false);
});

test('devices sharing a folder converge', async () => {
    const cloud = createCloud();
    const folder = cloud.folder('/bulut/kasa');

    async function newDevice(name, primitives = nodePrimitives, password = PASSWORD) {
        const device = createDevice(primitives, { cloud, deviceName: name });
        device.ui.opened(await device.api.register({ firstName: name, lastName: 'Cihaz', password }));
        device.host.folder = '/bulut/kasa';
        return device;
    }
    async function syncAll(...devices) {
        for (let round = 0; round < 3; round++) {
            for (const device of devices) {
                const result = await device.api.syncNow();
                assert.equal(result.success, true, result.error);
            }
        }
        for (const device of devices) {
            assert.equal(snapshot(device.ui.items), snapshot(devices[0].ui.items), 'every device shows the same entries');
        }
    }

    // --- first device starts the sync ---
    const desktop = await newDevice('Masaüstü');
    await desktop.ui.save([entry('a1'), entry('a2')]);
    assert.deepEqual(desktop.api.getSyncStatus(), { enabled: false });
    assert.equal((await desktop.api.enableSync('yanlis-sifre-123')).success, false);
    assert.equal(folder.size, 0, 'nothing is written for a wrong master password');
    desktop.host.folder = null;
    assert.equal((await desktop.api.enableSync(PASSWORD)).canceled, true);
    desktop.host.folder = '/bulut/kasa';
    let result = await desktop.api.enableSync(PASSWORD);
    assert.deepEqual([result.success, result.joined, result.status.enabled, result.status.error], [true, false, true, null]);
    assert.deepEqual([...folder.keys()].map(name => name.split('.').pop()).sort(), ['opkeyring', 'opsync']);
    for (const file of folder.values()) {
        assert.ok(!bytesToUtf8(file.data).includes('pw-a1'), 'files in the folder are encrypted');
    }
    assert.equal((await desktop.api.enableSync(PASSWORD)).success, false, 'already on');

    // --- a device with another master password cannot join and leaves the folder alone ---
    const stranger = await newDevice('Yabancı', nodePrimitives, 'baska-Bir-91-sifre');
    result = await stranger.api.enableSync('baska-Bir-91-sifre');
    assert.equal(result.success, false);
    assert.match(result.error, /farklı bir ana şifre/);
    assert.deepEqual([stranger.api.getSyncStatus().enabled, folder.size], [false, 2]);

    // --- second device (pure-JS crypto, like a phone) joins with the same master password ---
    const phone = await newDevice('Telefon', noblePrimitives);
    await phone.ui.save([entry('b1')]);
    result = await phone.api.enableSync(PASSWORD);
    assert.deepEqual([result.success, result.joined], [true, true]);
    assert.deepEqual(ids(phone.ui.items), ['a1', 'a2', 'b1'], 'the page was given the merged entries');
    await syncAll(desktop, phone);
    assert.deepEqual(ids(desktop.ui.items), ['a1', 'a2', 'b1']);
    assert.deepEqual(desktop.api.getSyncStatus().devices.map(d => d.name), ['Telefon']);

    // --- an edit travels to the other device ---
    await desktop.ui.save(edit(desktop.ui.items, 'a1', { title: 'masaüstünde düzenlendi' }));
    await syncAll(desktop, phone);
    assert.equal(find(phone.ui.items, 'a1').title, 'masaüstünde düzenlendi');

    // --- the page lags behind the vault: its save must not undo what was merged in ---
    phone.ui.frozen = true;
    await desktop.ui.save([...desktop.ui.items, entry('a3')]);
    await desktop.api.syncNow();
    await phone.api.syncNow(); // the phone's vault now has a3, its page does not
    assert.deepEqual(ids(phone.ui.items), ['a1', 'a2', 'b1']);
    await phone.ui.save(edit(phone.ui.items, 'b1', { title: 'telefonda düzenlendi' }));
    phone.ui.frozen = false;
    phone.api.logout();
    phone.ui.opened(await phone.api.login((await phone.api.getUsers()).users[0].id, PASSWORD));
    assert.deepEqual(ids(phone.ui.items), ['a1', 'a2', 'a3', 'b1'], 'a3 survived the stale save');
    assert.equal(phone.api.getSyncStatus().enabled, true, 'sync settings are loaded again after login');
    await syncAll(desktop, phone);
    assert.equal(find(desktop.ui.items, 'b1').title, 'telefonda düzenlendi');
    assert.deepEqual(ids(desktop.ui.items), ['a1', 'a2', 'a3', 'b1'], 'and nothing was deleted on the other device');

    // --- removing an entry for good removes it everywhere, even from a device that was offline ---
    phone.host.offline = true;
    await desktop.ui.save(without(desktop.ui.items, 'a2'));
    await desktop.api.syncNow();
    await phone.ui.save(edit(phone.ui.items, 'a3', { title: 'çevrimdışı düzenleme' }));
    result = await phone.api.syncNow();
    assert.equal(result.success, false);
    assert.match(phone.api.getSyncStatus().error, /ulaşılamıyor/);
    phone.host.offline = false;
    await syncAll(desktop, phone);
    assert.deepEqual(ids(phone.ui.items), ['a1', 'a3', 'b1'], 'a2 is gone on the device that was offline');
    assert.equal(find(desktop.ui.items, 'a3').title, 'çevrimdışı düzenleme', 'and its own offline edit arrived');
    assert.equal(phone.api.getSyncStatus().error, null);

    // --- ...unless the entry was edited after it was removed elsewhere ---
    phone.host.offline = true;
    await desktop.ui.save(without(desktop.ui.items, 'a1'));
    await desktop.api.syncNow();
    await pause();
    await phone.ui.save(edit(phone.ui.items, 'a1', { title: 'silindikten sonra düzenlendi' }));
    phone.host.offline = false;
    await syncAll(phone, desktop);
    assert.equal(find(desktop.ui.items, 'a1').title, 'silindikten sonra düzenlendi');

    // --- both devices change the same password: the later one wins, the other is kept in the history ---
    phone.host.offline = true;
    await desktop.ui.save(edit(desktop.ui.items, 'b1', { password: 'masaüstü-şifresi' }));
    await desktop.api.syncNow();
    await pause();
    await phone.ui.save(edit(phone.ui.items, 'b1', { password: 'telefon-şifresi' }));
    phone.host.offline = false;
    await syncAll(desktop, phone);
    for (const device of [desktop, phone]) {
        const item = find(device.ui.items, 'b1');
        assert.equal(item.password, 'telefon-şifresi');
        assert.ok(item.passwordHistory.some(h => h.password === 'masaüstü-şifresi'), 'the other password is in the history');
    }

    // --- changing the master password: sync keeps working and new devices join with the new password ---
    assert.equal((await desktop.api.changePassword(PASSWORD, NEW_PASSWORD)).success, true);
    desktop.api.logout();
    assert.deepEqual(desktop.api.getSyncStatus(), { enabled: false }, 'nothing about sync is visible while locked');
    assert.equal((await desktop.api.syncNow()).success, false);
    desktop.ui.opened(await desktop.api.login((await desktop.api.getUsers()).users[0].id, NEW_PASSWORD));
    assert.equal(desktop.api.getSyncStatus().enabled, true);

    const tablet = await newDevice('Tablet', nodePrimitives, NEW_PASSWORD);
    result = await tablet.api.enableSync(NEW_PASSWORD);
    assert.deepEqual([result.success, result.joined], [true, true]);
    const late = await newDevice('Eski Şifreli', nodePrimitives);
    assert.equal((await late.api.enableSync(PASSWORD)).success, false, 'the old master password no longer opens the keyring');
    await syncAll(desktop, phone, tablet);
    assert.deepEqual(ids(tablet.ui.items), ['a1', 'a3', 'b1']);
    assert.deepEqual(desktop.api.getSyncStatus().devices.map(d => d.name).sort(), ['Tablet', 'Telefon']);

    // --- turning sync off on one device ---
    assert.equal((await phone.api.disableSync()).success, true);
    assert.deepEqual(phone.api.getSyncStatus(), { enabled: false });
    assert.deepEqual(ids(phone.ui.items), ['a1', 'a3', 'b1'], 'the vault stays on the device');
    await syncAll(desktop, tablet);
    assert.deepEqual(desktop.api.getSyncStatus().devices.map(d => d.name), ['Tablet']);
    await phone.ui.save([...phone.ui.items, entry('yalnız-telefonda')]);
    await syncAll(desktop, tablet);
    assert.ok(!find(desktop.ui.items, 'yalnız-telefonda'), 'a device that left no longer shares its changes');

    // --- what is stored (not only what is shown) is identical on the devices that still sync ---
    const stored = [];
    for (const [device, password] of [[desktop, NEW_PASSWORD], [tablet, NEW_PASSWORD]]) {
        device.api.logout();
        const opened = await device.api.login((await device.api.getUsers()).users[0].id, password);
        stored.push(exactSnapshot(opened.data));
    }
    assert.equal(stored[0], stored[1]);

    for (const device of [desktop, phone, tablet, stranger, late]) device.lock(false);
});
