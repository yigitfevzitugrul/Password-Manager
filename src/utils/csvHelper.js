/**
 * Export / Import Helper for JSON and CSV password data
 */

function escapeCsvField(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}

/**
 * Export password array to CSV format
 */
export function exportToCSV(passwords) {
    const headers = ['Title', 'Username', 'Password', 'URL', 'Category', 'Notes', 'Favorite', 'TOTP_Secret'];
    const rows = passwords.map(p => [
        escapeCsvField(p.title || ''),
        escapeCsvField(p.username || ''),
        escapeCsvField(p.password || ''),
        escapeCsvField(p.url || ''),
        escapeCsvField(p.category || 'other'),
        escapeCsvField(p.notes || ''),
        escapeCsvField(p.isFavorite ? 'true' : 'false'),
        escapeCsvField(p.totpSecret || '')
    ].join(','));

    return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Export password array to formatted JSON
 */
export function exportToJSON(passwords) {
    const cleanData = passwords.map(p => ({
        id: p.id,
        title: p.title || '',
        username: p.username || '',
        password: p.password || '',
        url: p.url || '',
        category: p.category || 'other',
        notes: p.notes || '',
        isFavorite: !!p.isFavorite,
        totpSecret: p.totpSecret || '',
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now()
    }));

    return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        appName: 'SifreYonetici',
        items: cleanData
    }, null, 2);
}

/**
 * Trigger browser file download
 */
export function triggerDownload(content, filename, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Robust CSV parser that handles quoted strings with commas and newlines
 */
export function parseCSV(text) {
    const lines = [];
    let row = [];
    let insideQuotes = false;
    let field = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                field += '"';
                i++; // skip escaped quote
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            row.push(field.trim());
            field = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            row.push(field.trim());
            if (row.some(f => f.length > 0)) {
                lines.push(row);
            }
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field.trim());
        if (row.some(f => f.length > 0)) {
            lines.push(row);
        }
    }

    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    // Find column indexes
    const colIndex = {
        title: headers.findIndex(h => ['title', 'name', 'sitename', 'service'].includes(h)),
        username: headers.findIndex(h => ['username', 'login', 'email', 'user'].includes(h)),
        password: headers.findIndex(h => ['password', 'pass', 'pwd'].includes(h)),
        url: headers.findIndex(h => ['url', 'website', 'uri', 'link'].includes(h)),
        category: headers.findIndex(h => ['category', 'folder', 'group'].includes(h)),
        notes: headers.findIndex(h => ['notes', 'note', 'comment', 'comments'].includes(h)),
        totpSecret: headers.findIndex(h => ['totpsecret', 'totp', 'otp', 'authenticator'].includes(h)),
        isFavorite: headers.findIndex(h => ['favorite', 'fav', 'starred'].includes(h))
    };

    // If title isn't found, try first column
    if (colIndex.title === -1 && lines[0].length > 0) colIndex.title = 0;
    if (colIndex.password === -1) {
        colIndex.password = headers.findIndex(h => h.includes('pass'));
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const title = (colIndex.title !== -1 && line[colIndex.title]) ? line[colIndex.title] : '';
        const username = (colIndex.username !== -1 && line[colIndex.username]) ? line[colIndex.username] : '';
        const password = (colIndex.password !== -1 && line[colIndex.password]) ? line[colIndex.password] : '';
        const url = (colIndex.url !== -1 && line[colIndex.url]) ? line[colIndex.url] : '';
        const category = (colIndex.category !== -1 && line[colIndex.category]) ? line[colIndex.category] : 'other';
        const notes = (colIndex.notes !== -1 && line[colIndex.notes]) ? line[colIndex.notes] : '';
        const totpSecret = (colIndex.totpSecret !== -1 && line[colIndex.totpSecret]) ? line[colIndex.totpSecret] : '';
        const isFavorite = (colIndex.isFavorite !== -1 && line[colIndex.isFavorite]) ? line[colIndex.isFavorite] === 'true' : false;

        if (title || username || password) {
            results.push({
                title: title || 'İsimsiz Kayıt',
                username,
                password,
                url,
                category: category || 'other',
                notes,
                totpSecret,
                isFavorite
            });
        }
    }

    return results;
}

/**
 * Parse JSON import file (native export or array of objects)
 */
export function parseJSON(text) {
    try {
        const data = JSON.parse(text);
        let items = [];
        if (Array.isArray(data)) {
            items = data;
        } else if (data && Array.isArray(data.items)) {
            items = data.items;
        } else if (data && Array.isArray(data.passwords)) {
            items = data.passwords;
        } else {
            return [];
        }

        return items.map(item => ({
            title: item.title || item.name || 'İsimsiz Kayıt',
            username: item.username || item.login || item.email || '',
            password: item.password || item.pass || '',
            url: item.url || item.website || '',
            category: item.category || 'other',
            notes: item.notes || item.note || '',
            totpSecret: item.totpSecret || item.totp || '',
            isFavorite: !!(item.isFavorite || item.favorite)
        }));
    } catch (e) {
        console.error('JSON parse error:', e);
        return [];
    }
}
