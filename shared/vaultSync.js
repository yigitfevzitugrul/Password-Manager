/**
 * Merging vaults that were changed on different devices.
 * Pure functions, no storage and no encryption: given the same inputs every device
 * computes the same result, so devices converge without a server deciding for them.
 *
 * A vault state is { items, tombstones }:
 *   items      - the vault entries; each has a string `id` and a modification time `mtime`
 *                that is maintained here (not by the UI)
 *   tombstones - { id: time } for entries that were removed for good, so that a device
 *                that still has the entry does not bring it back
 */

// Removed entries are remembered this long. A device that stays offline longer can resurrect them.
export const TOMBSTONE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PASSWORD_HISTORY = 10;
const MAX_ITEMS = 20000;

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTime = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * When the entry was last changed. Entries saved before sync existed have no `mtime`
 * and fall back to the times the UI recorded.
 */
export function itemTime(item) {
    if (isTime(item.mtime)) return item.mtime;
    if (isTime(item.updatedAt)) return item.updatedAt;
    if (isTime(item.createdAt)) return item.createdAt;
    return 0;
}

// JSON with sorted keys: equal content gives equal text, whatever order the properties were set in
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort()
            .filter(key => value[key] !== undefined)
            .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

const contentOf = (item) => {
    const { mtime, ...content } = item;
    return canonical(content);
};

export const sameContent = (a, b) => contentOf(a) === contentOf(b);

/**
 * Gives every entry a string id (very old vaults may lack them).
 * @returns {{items: object[], changed: boolean}}
 */
export function ensureItemIds(items, createId) {
    let changed = false;
    const seen = new Set();
    const result = items.map(item => {
        if (typeof item.id === 'string' && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            return item;
        }
        changed = true;
        let id;
        do { id = createId(); } while (seen.has(id));
        seen.add(id);
        return { ...item, id };
    });
    return { items: result, changed };
}

/**
 * Called on every save. The UI sends its whole list, but that list may be older than the vault:
 * another device's changes can have been merged in after the UI last received the entries.
 * So the save is applied as a set of changes: whatever differs between `base` (the entries the UI
 * was working from) and `next` (what it sends now) is what the user did; everything else is kept
 * as it is in `current` (the vault right now).
 * Also records the modification time of the entries the user changed.
 * @returns {{items: object[], removedIds: string[], unseen: boolean}}
 *          unseen: the result contains changes the UI does not know about yet
 */
export function applyUiChanges(base, next, current, now) {
    const baseById = new Map(base.map(item => [item.id, item]));
    const currentById = new Map(current.map(item => [item.id, item]));
    const nextIds = new Set(next.map(item => item.id));
    const items = [];
    let unseen = false;

    for (const item of next) {
        const before = baseById.get(item.id);
        const stored = currentById.get(item.id);

        if (!before || !sameContent(before, item)) {
            // Added or edited by the user
            let changed = { ...item, mtime: Math.max(now, stored ? itemTime(stored) + 1 : 0) };
            if (stored && before && !sameContent(stored, before)) {
                // ...while another device changed it too: its password is kept in the history
                changed = keepLosingPassword(changed, stored);
                unseen = true;
            }
            items.push(changed);
        } else if (stored) {
            // Untouched by the user: the stored version stays (it may be newer than the UI's copy)
            if (!sameContent(stored, item)) unseen = true;
            items.push(stored);
        } else {
            // Untouched by the user and removed by another device meanwhile: stays removed
            unseen = true;
        }
    }

    // Entries that arrived from another device and that the UI has not seen yet are kept
    for (const item of current) {
        if (!nextIds.has(item.id) && !baseById.has(item.id)) {
            items.push(item);
            unseen = true;
        }
    }

    // Only entries the UI knew about and dropped were removed by the user
    const removedIds = base.filter(item => !nextIds.has(item.id)).map(item => item.id);
    return { items, removedIds, unseen };
}

export function pruneTombstones(tombstones, now) {
    const kept = {};
    for (const [id, time] of Object.entries(tombstones)) {
        if (now - time < TOMBSTONE_RETENTION_MS) kept[id] = time;
    }
    return kept;
}

/**
 * Makes sure data read from another device's file has the expected shape before it is merged.
 * (The file is authenticated by the sync key, this guards against bugs and format changes.)
 */
export function sanitizeState(parsed) {
    const byId = new Map();
    const rawItems = isPlainObject(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
    for (const item of rawItems.slice(0, MAX_ITEMS)) {
        if (!isPlainObject(item) || typeof item.id !== 'string' || !item.id || item.id.length > 200) continue;
        const existing = byId.get(item.id);
        if (!existing || itemTime(item) > itemTime(existing)) byId.set(item.id, item);
    }

    const tombstones = {};
    const rawTombstones = isPlainObject(parsed) && isPlainObject(parsed.tombstones) ? parsed.tombstones : {};
    for (const [id, time] of Object.entries(rawTombstones)) {
        if (isTime(time) && id.length <= 200) tombstones[id] = time;
    }
    return { items: [...byId.values()], tombstones };
}

// When two devices changed the same entry, the password of the version that loses is kept in the
// winner's history instead of disappearing.
function keepLosingPassword(winner, loser) {
    if (typeof loser.password !== 'string' || !loser.password || loser.password === winner.password) return winner;
    const history = Array.isArray(winner.passwordHistory) ? winner.passwordHistory : [];
    if (history.some(entry => isPlainObject(entry) && entry.password === loser.password)) return winner;

    const passwordHistory = [...history, { password: loser.password, changedAt: itemTime(loser) }]
        .sort((a, b) => (b.changedAt || 0) - (a.changedAt || 0))
        .slice(0, MAX_PASSWORD_HISTORY);
    return { ...winner, passwordHistory };
}

// The later change wins. Equal times are decided by rules that give the same answer on every device.
function mergeItem(a, b) {
    const timeA = itemTime(a);
    const timeB = itemTime(b);
    if (sameContent(a, b)) return timeB > timeA ? b : a;

    let winner;
    if (timeA !== timeB) {
        winner = timeA > timeB ? a : b;
    } else {
        const historyA = Array.isArray(a.passwordHistory) ? a.passwordHistory.length : 0;
        const historyB = Array.isArray(b.passwordHistory) ? b.passwordHistory.length : 0;
        if (historyA !== historyB) winner = historyA > historyB ? a : b;
        else winner = contentOf(a) >= contentOf(b) ? a : b;
    }
    return keepLosingPassword(winner, winner === a ? b : a);
}

/**
 * Merges another device's state into the local one.
 * The local order of entries is kept; entries only the other device has are added at the end.
 * @returns {{items: object[], tombstones: object, itemsChanged: boolean, tombstonesChanged: boolean}}
 */
export function mergeStates(local, remote) {
    const tombstones = { ...local.tombstones };
    for (const [id, time] of Object.entries(remote.tombstones)) {
        tombstones[id] = Math.max(tombstones[id] ?? 0, time);
    }

    // An entry changed after it was removed elsewhere survives; otherwise the removal wins
    const survives = (item) => {
        const removedAt = tombstones[item.id];
        if (removedAt === undefined) return true;
        if (itemTime(item) > removedAt) {
            delete tombstones[item.id];
            return true;
        }
        return false;
    };

    const remoteById = new Map(remote.items.map(item => [item.id, item]));
    const localIds = new Set();
    const items = [];
    let itemsChanged = false;

    for (const item of local.items) {
        localIds.add(item.id);
        const other = remoteById.get(item.id);
        const merged = other ? mergeItem(item, other) : item;
        if (!survives(merged)) {
            itemsChanged = true;
            continue;
        }
        if (merged !== item) itemsChanged = true;
        items.push(merged);
    }

    for (const item of remote.items) {
        if (localIds.has(item.id) || !survives(item)) continue;
        items.push(item);
        itemsChanged = true;
    }

    return {
        items,
        tombstones,
        itemsChanged,
        tombstonesChanged: canonical(tombstones) !== canonical(local.tombstones)
    };
}
