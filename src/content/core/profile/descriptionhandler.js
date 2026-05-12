import { callRobloxApi, callRobloxApiJson } from '../api.js';
import { getValidAccessToken } from '../oauth/oauth.js';
import { User } from '../user.js';
import { updateUserSettingViaApi } from '../donators/settingHandler.js';
// A script for getting and setting user description with pre text filter checks to prevent losing a users description if addition is tagged.

const STATUS_MIGRATION_KEY = 'rovalra_status_migration_done';
const ENVIRONMENT_MIGRATION_KEY = 'rovalra_environment_migration_done';

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

export async function migrateLegacyStatus() {
    try {
        const result = await chrome.storage.local.get(STATUS_MIGRATION_KEY);
        if (result[STATUS_MIGRATION_KEY]) return;

        const userId = await User.uid();
        if (!userId) {
            await chrome.storage.local.set({ [STATUS_MIGRATION_KEY]: true });
            return;
        }

        const description = await getUserDescription(userId);
        if (!description) {
            await chrome.storage.local.set({ [STATUS_MIGRATION_KEY]: true });
            return;
        }

        const match = description.match(/^s:(.+)/m);
        if (!match) {
            await chrome.storage.local.set({ [STATUS_MIGRATION_KEY]: true });
            return;
        }

        const legacyStatus = match[1].trim();
        if (!legacyStatus) {
            await chrome.storage.local.set({ [STATUS_MIGRATION_KEY]: true });
            return;
        }

        console.log(
            `RoValra: Found legacy status in description. Migrating: "${legacyStatus}"`,
        );

        const updatedValue = await updateUserSettingViaApi(
            'status',
            legacyStatus,
        );

        if (typeof updatedValue === 'string') {
            const cleanedDescription = description
                .replace(/^s:.*$/m, '')
                .trim();

            if (cleanedDescription) {
                const updateResult = await updateUserDescription(
                    userId,
                    cleanedDescription,
                );
                if (updateResult === true) {
                    console.log(
                        'RoValra: Successfully cleaned legacy status line from description.',
                    );
                } else {
                    console.warn(
                        'RoValra: Could not clean description (may be filtered or failed), but status was migrated.',
                    );
                }
            }

            console.log('RoValra: Successfully migrated legacy status to API.');
        } else {
            console.warn('RoValra: Failed to migrate legacy status via API.');
        }

        await chrome.storage.local.set({ [STATUS_MIGRATION_KEY]: true });
    } catch (error) {
        console.error('RoValra: Failed to migrate legacy status.', error);
        await chrome.storage.local.set({ [STATUS_MIGRATION_KEY]: true });
    }
}

export async function migrateLegacyEnvironment() {
    try {
        const result = await chrome.storage.local.get(
            ENVIRONMENT_MIGRATION_KEY,
        );
        if (result[ENVIRONMENT_MIGRATION_KEY]) return;

        const userId = await User.uid();
        if (!userId) {
            await chrome.storage.local.set({
                [ENVIRONMENT_MIGRATION_KEY]: true,
            });
            return;
        }

        const description = await getUserDescription(userId);
        if (!description) {
            await chrome.storage.local.set({
                [ENVIRONMENT_MIGRATION_KEY]: true,
            });
            return;
        }

        const match = description.match(/^e:(\d+)/m);
        if (!match) {
            await chrome.storage.local.set({
                [ENVIRONMENT_MIGRATION_KEY]: true,
            });
            return;
        }

        const envId = parseInt(match[1], 10);
        if (isNaN(envId)) {
            await chrome.storage.local.set({
                [ENVIRONMENT_MIGRATION_KEY]: true,
            });
            return;
        }

        console.log(
            `RoValra: Found legacy environment in description. Migrating: ${envId}`,
        );

        const updatedValue = await updateUserSettingViaApi(
            'environment',
            envId,
        );

        if (typeof updatedValue === 'string') {
            const cleanedDescription = description
                .replace(/^e:.*$/m, '')
                .trim();

            if (cleanedDescription) {
                const updateResult = await updateUserDescription(
                    userId,
                    cleanedDescription,
                );
                if (updateResult === true) {
                    console.log(
                        'RoValra: Successfully cleaned legacy environment line from description.',
                    );
                } else {
                    console.warn(
                        'RoValra: Could not clean description (may be filtered or failed), but environment was migrated.',
                    );
                }
            }

            console.log(
                'RoValra: Successfully migrated legacy environment to API.',
            );
        } else {
            console.warn(
                'RoValra: Failed to migrate legacy environment via API.',
            );
        }

        await chrome.storage.local.set({ [ENVIRONMENT_MIGRATION_KEY]: true });
    } catch (error) {
        console.error('RoValra: Failed to migrate legacy environment.', error);
        await chrome.storage.local.set({ [ENVIRONMENT_MIGRATION_KEY]: true });
    }
}
