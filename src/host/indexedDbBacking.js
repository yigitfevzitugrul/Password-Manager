/**
 * Backing for mirroredStorage.js: the app's files in IndexedDB (one record per file).
 */
const DB_NAME = 'orenda-pass';
const STORE = 'files';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function createIndexedDbBacking() {
    const db = await openDatabase();

    const run = (mode, action) => new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const result = action(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });

    return {
        async loadAll() {
            const entries = [];
            await run('readonly', (store) => {
                store.openCursor().onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) return;
                    entries.push([cursor.key, cursor.value]);
                    cursor.continue();
                };
            });
            return entries;
        },
        put: (name, record) => run('readwrite', store => { store.put(record, name); }),
        delete: (name) => run('readwrite', store => { store.delete(name); })
    };
}
