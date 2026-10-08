// In-memory stand-ins for everything the vault service gets from its host, so the service can be
// tested as it will run on any platform: storage, dialogs, clipboard, network and a "cloud folder".
import { createVaultService } from '../../shared/vaultService.js';

export function createMemoryStorage(files = new Map()) {
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

// Folders shared between devices, like a cloud drive: folder path -> (file name -> { data, mtimeMs })
export function createCloud() {
    const folders = new Map();
    let clock = 1000;
    return {
        folder(path) {
            if (!folders.has(path)) folders.set(path, new Map());
            return folders.get(path);
        },
        tick: () => ++clock
    };
}

// A host with a clipboard, a "documents folder" (external), scripted dialogs and a cloud drive
export function createFakePlatform({ external = new Map(), cloud = createCloud(), deviceName = 'Test Cihazı' } = {}) {
    const host = {
        external,
        cloud,
        clipboardText: '',
        lockedNotifications: 0,
        vaultChanges: [],
        onVaultChanged: null,
        openedUrls: [],
        cancelSave: false,
        pick: null, // path the next "open file" dialog returns, null = canceled
        folder: null, // path the next "pick folder" dialog returns, null = canceled
        offline: false, // the cloud folder cannot be reached
        http: async () => { throw new Error('offline'); }
    };
    const reachable = (folder) => {
        if (host.offline) throw new Error('klasöre ulaşılamıyor');
        return cloud.folder(folder);
    };

    host.platform = {
        getVersion: () => '1.1.0',
        notifyLocked: () => { host.lockedNotifications++; },
        notifyVaultChanged: (change) => {
            host.vaultChanges.push(change);
            if (host.onVaultChanged) host.onVaultChanged(change);
        },
        getDeviceName: () => deviceName,
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
        },
        pickFolder: async () => (host.folder ? { canceled: false, path: host.folder } : { canceled: true }),
        listFolder: async (folder) => [...reachable(folder).entries()]
            .map(([name, file]) => ({ name, size: file.data.length, mtimeMs: file.mtimeMs })),
        readFolderFile: async (folder, name) => {
            const file = reachable(folder).get(name);
            if (!file) throw new Error('not found');
            return Uint8Array.from(file.data);
        },
        writeFolderFile: async (folder, name, bytes) => {
            reachable(folder).set(name, { data: Uint8Array.from(bytes), mtimeMs: cloud.tick() });
        },
        removeFolderFile: async (folder, name) => { reachable(folder).delete(name); }
    };
    return host;
}

/**
 * One device: its own storage and host, and `ui`, which behaves like the app's page:
 * it holds the entries it was last given and sends them back with their revision.
 */
export function createDevice(primitives, { files, external, cloud, deviceName } = {}) {
    const storage = createMemoryStorage(files);
    const host = createFakePlatform({ external, cloud, deviceName });
    const service = createVaultService({ primitives, storage, platform: host.platform });

    const ui = {
        items: [],
        revision: undefined,
        frozen: false, // true: the page does not process "vault changed" events (it is busy or lagging)
        opened(result) {
            ui.items = result.data;
            ui.revision = result.revision;
            return result;
        },
        async save(items) {
            ui.items = items;
            const result = await service.api.savePasswords(items, ui.revision);
            if (!ui.frozen && !(ui.revision >= result.revision)) ui.revision = result.revision;
            return result;
        }
    };
    host.onVaultChanged = (change) => {
        if (ui.frozen) return;
        ui.items = change.items;
        ui.revision = change.revision;
    };

    return { ...service, storage, host, ui };
}
