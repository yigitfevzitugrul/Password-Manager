// A stand-in for the part of the Google Drive REST API the app uses: the application data folder
// of one Google account, reached through `fetch`. Behaves like Drive where it matters for the app:
// files have ids, names are not unique, access tokens expire.
export function createFakeDrive() {
    const files = new Map(); // id -> { id, name, data, modifiedTime }
    let nextId = 1;
    let clock = Date.parse('2026-01-01T00:00:00Z');
    const drive = {
        files,
        validTokens: new Set(['token-1']),
        requests: [],
        failNext: null, // status the next request answers with
        offline: false,
        names: () => [...files.values()].map(file => file.name).sort(),
        put(name, data) {
            const id = `id${nextId++}`;
            clock += 1000;
            files.set(id, { id, name, data: Uint8Array.from(data), modifiedTime: new Date(clock).toISOString() });
            return id;
        }
    };

    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    drive.fetch = async (url, options = {}) => {
        if (drive.offline) throw new TypeError('fetch failed');
        const { pathname, searchParams } = new URL(url);
        const method = options.method || 'GET';
        drive.requests.push(`${method} ${pathname}`);

        const token = /^Bearer (.+)$/.exec((options.headers || {}).Authorization || '');
        if (!token || !drive.validTokens.has(token[1])) return json(401, { error: 'invalid token' });
        if (drive.failNext) {
            const status = drive.failNext;
            drive.failNext = null;
            return json(status, { error: 'failed' });
        }

        if (pathname === '/drive/v3/files' && method === 'GET') {
            if (searchParams.get('spaces') !== 'appDataFolder') return json(400, { error: 'spaces' });
            const prefix = /name contains '([^']+)'/.exec(searchParams.get('q') || '');
            const all = [...files.values()].filter(file => !prefix || file.name.includes(prefix[1]));
            // two entries per page, to exercise paging
            const start = Number(searchParams.get('pageToken') || 0);
            const page = all.slice(start, start + 2);
            return json(200, {
                nextPageToken: start + 2 < all.length ? String(start + 2) : undefined,
                files: page.map(file => ({ id: file.id, name: file.name, size: String(file.data.length), modifiedTime: file.modifiedTime }))
            });
        }

        const single = /^\/drive\/v3\/files\/([^/]+)$/.exec(pathname);
        if (single && method === 'GET') {
            const file = files.get(single[1]);
            if (!file) return json(404, { error: 'not found' });
            return new Response(Uint8Array.from(file.data), { status: 200 });
        }
        if (single && method === 'DELETE') {
            return files.delete(single[1]) ? new Response(null, { status: 204 }) : json(404, { error: 'not found' });
        }

        const upload = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(pathname);
        if (upload && method === 'PATCH') {
            const file = files.get(upload[1]);
            if (!file) return json(404, { error: 'not found' });
            clock += 1000;
            file.data = Uint8Array.from(options.body);
            file.modifiedTime = new Date(clock).toISOString();
            return json(200, { id: file.id });
        }

        if (pathname === '/upload/drive/v3/files' && method === 'POST') {
            const boundary = /boundary=(.+)$/.exec(options.headers['Content-Type'])[1];
            const body = Uint8Array.from(options.body);
            const text = new TextDecoder('latin1').decode(body);
            const parts = text.split(`--${boundary}`);
            const metadata = JSON.parse(parts[1].slice(parts[1].indexOf('\r\n\r\n') + 4).trim());
            if (!metadata.parents || metadata.parents[0] !== 'appDataFolder') return json(403, { error: 'outside the app folder' });
            const contentStart = text.indexOf('\r\n\r\n', text.indexOf(`--${boundary}`, boundary.length + 2)) + 4;
            const contentEnd = text.lastIndexOf(`\r\n--${boundary}--`);
            return json(200, { id: drive.put(metadata.name, body.slice(contentStart, contentEnd)) });
        }

        return json(400, { error: `unexpected ${method} ${pathname}` });
    };

    return drive;
}
