import { callRobloxApi, callRobloxApiJson } from '../api.js';
import { getAuthenticatedUserId } from '../user.js';
import {
    getUserDescription,
    updateUserDescription,
    isTextFiltered,
} from '../profile/descriptionhandler.js';
import {
    syncDonatorTier,
    getCurrentUserTier,
} from '../settings/handlesettings.js';
import {
    CREATOR_USER_ID,
    CONTRIBUTOR_USER_IDS,
    TESTER_USER_IDS,
    ARTIST_BADGE_USER_ID,
    RAT_BADGE_USER_ID,
    BLAHAJ_BADGE_USER_ID,
    CAM_BADGE_USER_ID,
    alice_badge_user_id,
    GILBERT_USER_ID,
} from '../configs/userIds.js';

const settingsCache = new Map();

const TRUSTED_USER_IDS = [
    CREATOR_USER_ID,
    ...CONTRIBUTOR_USER_IDS,
    ...TESTER_USER_IDS,

    ARTIST_BADGE_USER_ID,
    RAT_BADGE_USER_ID,
    BLAHAJ_BADGE_USER_ID,
    CAM_BADGE_USER_ID,
    alice_badge_user_id,
    GILBERT_USER_ID,
].filter(Boolean);

const DESCRIPTION_BASED_SETTINGS = ['status', 'environment'];

async function getStatusFromDescription(description) {
    if (description === null) return null;

    const statusLine = description
        .split('\n')
        .find((line) => line.trim().startsWith('s:'));
    let status = statusLine ? statusLine.trim().substring(2).trim() : null;
    return status;
}

async function getEnvironmentFromDescription(description) {
    if (!description) return null;
    const envLine = description
        .split('\n')
        .find((line) => line.trim().startsWith('e:'));
    if (envLine) {
        const parsedId = parseInt(envLine.trim().substring(2), 10);
        if (!isNaN(parsedId)) {
            return parsedId;
        }
    }
    return null;
}

async function fetchAndProcessSettings(userId, options = {}) {
    const authenticatedUserId = await getAuthenticatedUserId();
    const isOwnProfile =
        authenticatedUserId && String(authenticatedUserId) === String(userId);

    if (isOwnProfile) {
        await syncDonatorTier();
    }
    const isDonator = getCurrentUserTier() >= 1;

    let apiSettings = {};
    let apiProvidedMeaningfulSettings = false;
    try {
        const data = await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: `/v1/users/${userId}/settings`,
            method: 'GET',
            skipAutoAuth: true,
        });

        if (data.status === 'success' && data.settings) {
            apiSettings = data.settings;

            if (
                (apiSettings.environment === 0 ||
                    apiSettings.environment === 1) &&
                apiSettings.status === '' &&
                Object.keys(apiSettings).length === 2
            ) {
                apiProvidedMeaningfulSettings = false;
            } else {
                apiProvidedMeaningfulSettings = true;
            }
        }
    } catch (error) {
        console.warn(
            'RoValra: Failed to fetch settings from API, falling back to description where applicable.',
            error,
        );
        apiProvidedMeaningfulSettings = false;
    }

    let description = null;
    let originalDescription = null;

    if (options.useDescription) {
        originalDescription = await getUserDescription(userId);
        description = originalDescription;
    }

    let finalStatus = null;
    let finalEnvironment = 1;

    if (apiProvidedMeaningfulSettings) {
        finalStatus = apiSettings.status;
        finalEnvironment = apiSettings.environment;
    }
    const statusFromDesc =
        description !== null
            ? await getStatusFromDescription(description)
            : null;
    const envFromDesc =
        description !== null
            ? await getEnvironmentFromDescription(description)
            : null;

    if (
        options.useDescription &&
        DESCRIPTION_BASED_SETTINGS.includes('status')
    ) {
        if (isOwnProfile) {
            if (
                isDonator &&
                statusFromDesc &&
                (!apiProvidedMeaningfulSettings || !finalStatus)
            ) {
                try {
                    const res = await callRobloxApiJson({
                        isRovalraApi: true,
                        subdomain: 'apis',
                        endpoint: '/v1/auth/settings',
                        method: 'POST',
                        body: JSON.stringify({
                            key: 'status',
                            value: statusFromDesc,
                        }),
                    });
                    if (res && res.status === 'success') {
                        finalStatus = statusFromDesc;
                        apiProvidedMeaningfulSettings = true;
                    }
                } catch (e) {
                    console.error('Failed to migrate status to API.', e);
                }
            }

            if (
                isDonator &&
                statusFromDesc &&
                apiProvidedMeaningfulSettings &&
                description !== null
            ) {
                description = description
                    .split('\n')
                    .filter((line) => !line.trim().startsWith('s:'))
                    .join('\n')
                    .trimEnd();
            }

            if ((!isDonator || !finalStatus) && statusFromDesc) {
                finalStatus = statusFromDesc;
            }
        } else {
            if (!finalStatus) finalStatus = statusFromDesc;
        }
    }

    if (
        options.useDescription &&
        DESCRIPTION_BASED_SETTINGS.includes('environment')
    ) {
        if (isOwnProfile) {
            if (
                isDonator &&
                envFromDesc &&
                (!apiProvidedMeaningfulSettings || finalEnvironment === 1)
            ) {
                try {
                    const res = await callRobloxApiJson({
                        isRovalraApi: true,
                        subdomain: 'apis',
                        endpoint: '/v1/auth/settings',
                        method: 'POST',
                        body: JSON.stringify({
                            key: 'environment',
                            value: String(envFromDesc),
                        }),
                    });
                    if (res && res.status === 'success') {
                        finalEnvironment = envFromDesc;
                        apiProvidedMeaningfulSettings = true;
                    }
                } catch (e) {
                    console.error('Failed to migrate environment to API.', e);
                }
            }

            if (
                isDonator &&
                envFromDesc &&
                apiProvidedMeaningfulSettings &&
                description !== null
            ) {
                description = description
                    .split('\n')
                    .filter((line) => !line.trim().startsWith('e:'))
                    .join('\n')
                    .trimEnd();
            }

            if (
                (!isDonator || !finalEnvironment || finalEnvironment === 1) &&
                envFromDesc
            ) {
                finalEnvironment = envFromDesc;
            }
        } else {
            if (!finalEnvironment || finalEnvironment === 1)
                finalEnvironment = envFromDesc;
        }
    }

    if (
        isOwnProfile &&
        originalDescription !== null &&
        description !== originalDescription
    ) {
        await updateUserDescription(userId, description);
    }

    const isTrusted = TRUSTED_USER_IDS.includes(String(userId));
    if (finalStatus && !isTrusted && (await isTextFiltered(finalStatus))) {
        finalStatus = null;
    }

    return {
        status: finalStatus,
        environment: finalEnvironment || 1,
        canUseApi: apiProvidedMeaningfulSettings,
    };
}

export function getUserSettings(userId, options = {}) {
    const cacheKey = `${userId}-${options.useDescription || false}`;
    if (!settingsCache.has(cacheKey)) {
        settingsCache.set(cacheKey, fetchAndProcessSettings(userId, options));
    }
    return settingsCache.get(cacheKey);
}
