import { callRobloxApi } from '../../api.js';
import { getUserIdFromUrl } from '../../idExtractor.js';

const trackedProfileUserIds = new Set();

export function init() {
    const userId = Number(getUserIdFromUrl());

    if (!Number.isInteger(userId) || trackedProfileUserIds.has(userId)) return;

    trackedProfileUserIds.add(userId);

    callRobloxApi({
        endpoint: '/v1/auth/views',
        method: 'POST',
        isRovalraApi: true,
        body: {
            user_id: userId,
        },
        noCache: true,
    }).catch(() => {});
}
