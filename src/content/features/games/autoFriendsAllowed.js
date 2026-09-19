import { callRobloxApi } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';

let listening = false;

// A failed purchase still answers, with FailureReason set, which is also how
// the site itself tells the two apart.
async function allowFriends(event) {
    const { vipServerId, FailureReason } = event.detail || {};
    if (!vipServerId || FailureReason !== undefined) return;
    if (!(await settings.autoFriendsAllowedEnabled)) return;

    try {
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${vipServerId}/permissions`,
            method: 'PATCH',
            body: { friendsAllowed: true },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        console.error(
            'RoValra: Failed to allow friends on private server',
            error,
        );
    }
}

export function init() {
    if (listening) return;
    listening = true;

    document.addEventListener('rovalra-private-server-created', allowFriends);
}
