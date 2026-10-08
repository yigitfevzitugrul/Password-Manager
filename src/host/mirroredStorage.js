/**
 * Storage for the shared vault code where only asynchronous storage exists (a WebView, a browser).
 * The vault code needs synchronous storage, so every file is kept in memory and each change is
 * written through to the `backing` in the order it was made.
 *
 * backing:
 *   loadAll() -> Promise<[name, { data: Uint8Array, mtimeMs: number }][]>
 *   put(name, { data, mtimeMs }) -> Promise
 *   delete(name) -> Promise
 */
export async function createMirroredStorage(backing, { now = Date.now, onError = () => {} } = {}) {
    const files = new Map();
    for (const [name, record] of await backing.loadAll()) {
        files.set(name, { data: Uint8Array.from(record.data), mtimeMs: record.mtimeMs });
    }

    let queue = Promise.resolve();
    const writeThrough = (operation) => {
        queue = queue.then(operation).catch(onError);
    };

    function check(name) {
        const parts = String(name).split('/');
        if (parts.some(part => part === '' || part === '.' || part === '..' || /[\\:]/.test(part))) {
            throw new Error('Geçersiz dosya adı.');
        }
        return parts.join('/');
    }

    return {
        read(name) {
            const record = files.get(check(name));
            return record ? Uint8Array.from(record.data) : null;
        },

        write(name, bytes) {
            const key = check(name);
            const record = { data: Uint8Array.from(bytes), mtimeMs: now() };
            files.set(key, record);
            writeThrough(() => backing.put(key, { data: Uint8Array.from(record.data), mtimeMs: record.mtimeMs }));
        },

        exists(name) {
            return files.has(check(name));
        },

        remove(name) {
            const key = check(name);
            if (!files.delete(key)) return;
            writeThrough(() => backing.delete(key));
        },

        list(dir) {
            const prefix = `${check(dir)}/`;
            return [...files.keys()]
                .filter(name => name.startsWith(prefix))
                .map(name => name.slice(prefix.length))
                .filter(name => !name.includes('/'));
        },

        stat(name) {
            const record = files.get(check(name));
            return record ? { size: record.data.length, mtimeMs: record.mtimeMs } : null;
        },

        // Resolves when everything written so far has reached the backing
        flushed: () => queue
    };
}
