import { callRobloxApi, callRobloxApiJson } from '../api.js';
import { getValidAccessToken } from '../oauth/oauth.js';
// A script for getting and setting user description with pre text filter checks to prevent losing a users description if addition is tagged.
export async function getUserDescription(userId) {
    try {
        const userData = await callRobloxApiJson({
            subdomain: 'users',
            endpoint: `/v1/users/${userId}`,
        });

        return userData ? userData.description || '' : null;
    } catch (error) {
        console.error(
            `RoValra: Failed to get description for user ${userId}`,
            error,
        );
        return null;
    }
}

export async function isTextFiltered(text) {
    if (!text) return false;
    try {
        const filterResponse = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/game-update-notifications/v1/filter',
            method: 'POST',
            body: JSON.stringify(text),
        });
        return filterResponse?.isFiltered;
    } catch (error) {
        console.error('RoValra: Failed to check text with filter', error);
        return true; // Assume it's filtered on error to be safe.
    }
}

export async function updateUserDescription(userId, newDescription) {
    try {
        const filterResponse = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/game-update-notifications/v1/filter',
            method: 'POST',
            body: JSON.stringify(newDescription),
        });

        if (filterResponse?.isFiltered) {
            return 'Filtered';
        }

        const updateResponse = await callRobloxApi({
            subdomain: 'users',
            endpoint: '/v1/description',
            method: 'POST',
            body: { description: newDescription },
        });

        if (!updateResponse.ok && updateResponse.status === 400) {
            return 'Filtered';
        }
        return updateResponse.ok;
    } catch (error) {
        console.error(
            `RoValra: Failed to update description for user ${userId}`,
            error,
        );
        return false;
    }
}

/**
 * Updates a user setting via the RoValra API.
 * @param {string} key The setting key to update (e.g., 'environment', 'status').
 * @param {any} value The new value for the setting. Will be converted to string.
 * @returns {Promise<boolean>} True if the update was successful, false otherwise.
 */
export async function updateUserSettingViaApi(key, value) {
    try {
        const token = await getValidAccessToken(false, false);
        if (!token) return false;

        const response = await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/settings',
            method: 'POST',
            body: JSON.stringify({ key, value: String(value) }),
        });
        if (response && response.status === 'success' && response.setting) {
            return response.setting.value;
        }
        return false;
    } catch (error) {
        console.error(
            `RoValra: Failed to update setting '${key}' via API.`,
            error,
        );
        return false;
    }
}
