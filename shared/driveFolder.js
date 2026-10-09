/**
 * The sync "folder" kept in the user's own Google Drive: the app's hidden application data
 * folder there, which only this app can see. Offers the same four operations the vault service
 * uses on a folder on disk (list, read, write, remove), over the Drive REST API.
 *
 * Only ever holds what the vault service writes: files encrypted on the device.
 *
 *   getAccessToken({ refresh }) -> Promise<string>   refresh: the last token was refused
 *   fetch                                            the host's fetch implementation
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
// What the vault service stores as the "folder" of a vault synced through Drive
export const DRIVE_FOLDER = 'gdrive:appdata';
export const isDriveFolder = (folder) => folder === DRIVE_FOLDER;

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_PREFIX = 'orenda-sync-';
const NAME_PATTERN = /^orenda-sync-[a-f0-9]{16}(-[a-f0-9]{16})?\.(opsync|opkeyring)$/;

function driveError(status) {
    const error = new Error(
        status === 401 || status === 403 ? 'Google Drive erişimi reddedildi. Yeniden bağlanmanız gerekebilir.'
            : status === 429 ? 'Google Drive şu an çok meşgul, biraz sonra yeniden denenecek.'
                : `Google Drive hatası (${status}).`
    );
    error.status = status;
    return error;
}

export function createDriveFolder({ getAccessToken, fetch: fetchImpl }) {
    // Drive addresses files by id, the vault service by name
    const ids = new Map();

    async function call(url, options = {}, retried = false) {
        const token = await getAccessToken({ refresh: retried });
        const response = await fetchImpl(url, {
            ...options,
            headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
        });
        // An access token lives for about an hour: ask for a new one once
        if (response.status === 401 && !retried) return call(url, options, true);
        return response;
    }

    function checkName(name) {
        if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
            throw new Error('Geçersiz dosya adı.');
        }
        return name;
    }

    // Drive allows several files with one name; the newest counts, the others are removed
    async function lookUp() {
        const newest = new Map();
        const duplicates = [];
        let pageToken = null;
        do {
            const query = new URLSearchParams({
                spaces: 'appDataFolder',
                q: `name contains '${FILE_PREFIX}' and trashed = false`,
                fields: 'nextPageToken, files(id, name, size, modifiedTime)',
                pageSize: '1000'
            });
            if (pageToken) query.set('pageToken', pageToken);
            const response = await call(`${API}?${query}`);
            if (response.status !== 200) throw driveError(response.status);
            const page = await response.json();
            for (const file of page.files || []) {
                if (typeof file.name !== 'string' || !NAME_PATTERN.test(file.name)) continue;
                const entry = {
                    id: file.id,
                    name: file.name,
                    size: Number(file.size) || 0,
                    mtimeMs: Date.parse(file.modifiedTime) || 0
                };
                const known = newest.get(entry.name);
                if (!known) {
                    newest.set(entry.name, entry);
                } else if (entry.mtimeMs > known.mtimeMs) {
                    duplicates.push(known.id);
                    newest.set(entry.name, entry);
                } else {
                    duplicates.push(entry.id);
                }
            }
            pageToken = page.nextPageToken || null;
        } while (pageToken);

        ids.clear();
        for (const entry of newest.values()) ids.set(entry.name, entry.id);
        for (const id of duplicates) {
            call(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
        }
        return [...newest.values()];
    }

    async function idOf(name) {
        if (!ids.has(name)) await lookUp();
        return ids.get(name) || null;
    }

    return {
        async list() {
            return (await lookUp()).map(({ name, size, mtimeMs }) => ({ name, size, mtimeMs }));
        },

        async read(name, maxBytes) {
            const id = await idOf(checkName(name));
            if (!id) throw new Error('Dosya bulunamadı.');
            const response = await call(`${API}/${encodeURIComponent(id)}?alt=media`);
            if (response.status === 404) {
                ids.delete(name);
                throw new Error('Dosya bulunamadı.');
            }
            if (response.status !== 200) throw driveError(response.status);
            const data = new Uint8Array(await response.arrayBuffer());
            if (data.length > maxBytes) throw new Error('Dosya çok büyük.');
            return data;
        },

        async write(name, bytes) {
            checkName(name);
            const body = Uint8Array.from(bytes);
            const existing = await idOf(name);
            if (existing) {
                const response = await call(`${UPLOAD_API}/${encodeURIComponent(existing)}?uploadType=media`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body
                });
                if (response.status === 200) return;
                if (response.status !== 404) throw driveError(response.status);
                ids.delete(name); // removed on another device meanwhile: create it again
            }

            // New file: its description and its content go up in one request
            const boundary = `orenda${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
            const head = new TextEncoder().encode(
                `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
                `${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n` +
                `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
            );
            const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
            const multipart = new Uint8Array(head.length + body.length + tail.length);
            multipart.set(head, 0);
            multipart.set(body, head.length);
            multipart.set(tail, head.length + body.length);

            const response = await call(`${UPLOAD_API}?uploadType=multipart&fields=id`, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: multipart
            });
            if (response.status !== 200) throw driveError(response.status);
            const created = await response.json();
            if (created && typeof created.id === 'string') ids.set(name, created.id);
        },

        async remove(name) {
            const id = await idOf(checkName(name));
            if (!id) return;
            const response = await call(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
            ids.delete(name);
            if (response.status !== 204 && response.status !== 200 && response.status !== 404) {
                throw driveError(response.status);
            }
        }
    };
}

/**
 * Teaches a host's `platform` (see shared/vaultService.js) to sync through Google Drive next to
 * whatever it could do before: "picking" the Drive folder connects the user's Google account.
 *
 *   connect() -> Promise<boolean>     asks the user to allow access; false when they declined
 */
export function addDriveSync(platform, { connect, getAccessToken, fetch: fetchImpl }) {
    const drive = createDriveFolder({ getAccessToken, fetch: fetchImpl });
    const base = {
        syncTargets: platform.syncTargets,
        pickFolder: platform.pickFolder,
        listFolder: platform.listFolder,
        readFolderFile: platform.readFolderFile,
        writeFolderFile: platform.writeFolderFile,
        removeFolderFile: platform.removeFolderFile
    };

    platform.syncTargets = () => [...(base.syncTargets ? base.syncTargets() : ['folder']), 'drive'];
    platform.pickFolder = async (request) => {
        if (request.target !== 'drive') return base.pickFolder(request);
        return (await connect()) ? { canceled: false, path: DRIVE_FOLDER } : { canceled: true };
    };
    platform.listFolder = (folder) => (isDriveFolder(folder) ? drive.list() : base.listFolder(folder));
    platform.readFolderFile = (folder, name, maxBytes) =>
        (isDriveFolder(folder) ? drive.read(name, maxBytes) : base.readFolderFile(folder, name, maxBytes));
    platform.writeFolderFile = (folder, name, bytes) =>
        (isDriveFolder(folder) ? drive.write(name, bytes) : base.writeFolderFile(folder, name, bytes));
    platform.removeFolderFile = (folder, name) =>
        (isDriveFolder(folder) ? drive.remove(name) : base.removeFolderFile(folder, name));
    return platform;
}
