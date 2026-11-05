const LEGACY_KEY = 'rovalra_friend_labels';
const STORAGE_KEY = 'rovalra_friend_labels_v2';
const MAX_NAME_LENGTH = 24;
const DEFAULT_COLOR = '#64748b';
const ICONS = new Set(['none', 'star', 'favorite', 'shield', 'videogame_asset', 'workspace_premium', 'push_pin']);

let state = null;
let loading = null;
let writeQueue = Promise.resolve();
const subscribers = new Set();

function cleanName(value) {
    return typeof value === 'string' ? value.trim().slice(0, MAX_NAME_LENGTH) : '';
}

function cleanColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
        ? value.toLowerCase()
        : DEFAULT_COLOR;
}

function cleanIcon(value) {
    return ICONS.has(value) ? value : 'none';
}

function cleanData(value) {
    const definitions = {};
    const assignments = {};

    for (const [id, definition] of Object.entries(value?.definitions || {})) {
        if (!/^[a-zA-Z\d_-]{1,80}$/.test(id)) continue;
        const name = cleanName(definition?.name);
        if (!name) continue;
        definitions[id] = {
            name,
            color: cleanColor(definition.color),
            icon: cleanIcon(definition.icon),
        };
    }

    for (const [userId, id] of Object.entries(value?.assignments || {})) {
        if (/^\d+$/.test(userId) && Object.hasOwn(definitions, id)) {
            assignments[userId] = id;
        }
    }

    return { version: 2, definitions, assignments };
}

function migrateLegacy(legacy) {
    const definitions = {};
    const assignments = {};
    const existing = new Map();

    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        for (const [userId, value] of Object.entries(legacy)) {
            const name = cleanName(value);
            if (!/^\d+$/.test(userId) || !name) continue;
            const key = name.toLocaleLowerCase();
            let id = existing.get(key);
            if (!id) {
                id = `legacy_${existing.size + 1}`;
                definitions[id] = { name, color: DEFAULT_COLOR, icon: 'none' };
                existing.set(key, id);
            }
            assignments[userId] = id;
        }
    }

    return { version: 2, definitions, assignments };
}

function publish() {
    for (const listener of subscribers) {
        try {
            listener();
        } catch (error) {
            console.warn('RoValra: Friend label listener failed', error);
        }
    }
}

export async function loadFriendLabelStore() {
    if (state) return state;
    if (loading) return loading;

    loading = (async () => {
        const stored = await chrome.storage.local.get([STORAGE_KEY, LEGACY_KEY]);
        const existing = stored[STORAGE_KEY];

        if (existing !== undefined) {
            if (!existing || existing.version !== 2) {
                throw new Error('Unsupported Friend Labels storage version');
            }
            state = cleanData(existing);
        } else {
            state = migrateLegacy(stored[LEGACY_KEY]);
            await chrome.storage.local.set({ [STORAGE_KEY]: state });
        }

        return state;
    })();

    try {
        return await loading;
    } finally {
        loading = null;
    }
}

export function subscribeFriendLabels(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
}

export function getFriendLabel(userId) {
    const id = state?.assignments[String(userId)];
    return id ? { id, ...state.definitions[id] } : null;
}

export function getLabelDefinitions() {
    return Object.entries(state?.definitions || {})
        .map(([id, definition]) => ({ id, ...definition }))
        .sort((first, second) => first.name.localeCompare(second.name));
}

async function update(mutator) {
    const operation = writeQueue.catch(() => {}).then(async () => {
        await loadFriendLabelStore();
        const draft = structuredClone(state);
        const result = mutator(draft);
        const next = cleanData(draft);
        await chrome.storage.local.set({ [STORAGE_KEY]: next });
        state = next;
        publish();
        return result;
    });
    writeQueue = operation;
    return operation;
}

export async function createLabelDefinition({ name, color, icon }) {
    const cleaned = cleanName(name);
    if (!cleaned) throw new Error('Label name is required');
    return update((draft) => {
        const id = `label_${crypto.randomUUID().replaceAll('-', '')}`;
        draft.definitions[id] = {
            name: cleaned,
            color: cleanColor(color),
            icon: cleanIcon(icon),
        };
        return id;
    });
}

export async function updateLabelDefinition(id, { name, color, icon }) {
    const cleaned = cleanName(name);
    if (!cleaned) throw new Error('Label name is required');
    return update((draft) => {
        if (!draft.definitions[id]) throw new Error('Label no longer exists');
        draft.definitions[id] = {
            name: cleaned,
            color: cleanColor(color),
            icon: cleanIcon(icon),
        };
    });
}

export async function deleteLabelDefinition(id) {
    return update((draft) => {
        if (!draft.definitions[id]) return;
        delete draft.definitions[id];
        for (const [userId, assignedId] of Object.entries(draft.assignments)) {
            if (assignedId === id) delete draft.assignments[userId];
        }
    });
}

export async function assignFriendLabel(userId, id) {
    if (!/^\d+$/.test(String(userId))) return;
    return update((draft) => {
        if (!draft.definitions[id]) throw new Error('Label no longer exists');
        draft.assignments[String(userId)] = id;
    });
}

export async function removeFriendLabel(userId) {
    return update((draft) => {
        delete draft.assignments[String(userId)];
    });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY] || !state) return;
    const incoming = changes[STORAGE_KEY].newValue;
    if (!incoming || incoming.version !== 2) return;
    state = cleanData(incoming);
    publish();
});
