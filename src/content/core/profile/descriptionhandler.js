import { callRobloxApi, callRobloxApiJson } from '../api.js';
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
