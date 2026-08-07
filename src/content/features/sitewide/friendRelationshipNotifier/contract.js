export const FRIEND_LIST_KEY = 'rovalra_friend_relationship_ids_v1';
export const FRIEND_UPDATES_KEY =
    'rovalra_friend_relationship_notifications_v1';
export const FRIEND_UPDATE_INTERVAL = 60_000;

export function normalizeUserId(value) {
    const userId = String(value ?? '');
    return /^[1-9]\d*$/.test(userId) ? userId : null;
}

export function normalizeUserIds(value) {
    // Friend IDs are only stored as arrays.
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizeUserId).filter(Boolean))];
}

export function normalizeUpdate(value) {
    const id = typeof value?.id === 'string' ? value.id : '';
    const userId = normalizeUserId(value?.userId);
    const change = value?.change;
    if (!id || !userId || !['added', 'removed'].includes(change)) return null;

    return { id, userId, change };
}

export function normalizeUpdates(value) {
    const pending = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return pending;
    }

    for (const [userId, notifications] of Object.entries(value)) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId || !Array.isArray(notifications)) continue;

        const notificationIds = new Set();
        pending[normalizedUserId] = notifications.flatMap((notification) => {
            const normalized = normalizeUpdate(notification);
            if (!normalized || notificationIds.has(normalized.id)) return [];

            notificationIds.add(normalized.id);
            return [normalized];
        });
    }

    return pending;
}

export function normalizeFriendLists(value) {
    const snapshots = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return snapshots;
    }

    for (const [userId, ids] of Object.entries(value)) {
        const normalizedUserId = normalizeUserId(userId);
        if (!normalizedUserId || !Array.isArray(ids)) continue;

        snapshots[normalizedUserId] = normalizeUserIds(ids);
    }

    return snapshots;
}
