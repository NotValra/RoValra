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
    TRUSTED_USER_IDS,
    ARTIST_BADGE_USER_ID,
    RAT_BADGE_USER_ID,
    BLAHAJ_BADGE_USER_ID,
    CAM_BADGE_USER_ID,
    alice_badge_user_id,
    GILBERT_USER_ID,
} from '../configs/userIds.js';
import * as cache from '../storage/cacheHandler.js';

const BATCH_MAX_SIZE = 50;
const BATCH_DELAY_MS = 10;
let batchQueue = [];
let batchTimeout = null;
let batchInProgress = false;
const pendingResolvers = new Map();

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
            noCache: isOwnProfile,
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
    let finalGradient = null;

    if (apiProvidedMeaningfulSettings) {
        finalStatus = apiSettings.status;
        finalEnvironment = apiSettings.environment;
        finalGradient = apiSettings.gradient;
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
        gradient: finalGradient,
        canUseApi: apiProvidedMeaningfulSettings,
        anonymous_leaderboard:
            apiSettings.anonymous_leaderboard === 'true' ||
            apiSettings.anonymous_leaderboard === true,
    };
}

async function processBatchQueue() {
    if (batchInProgress || batchQueue.length === 0) return;

    batchInProgress = true;
    const currentBatch = [...batchQueue];
    batchQueue = [];
    clearTimeout(batchTimeout);
    batchTimeout = null;

    try {
        const authenticatedUserId = await getAuthenticatedUserId();

        const userIdsToFetch = currentBatch
            .map((item) => item.userId)
            .filter((id) => String(id) !== String(authenticatedUserId))
            .slice(0, BATCH_MAX_SIZE);

        if (userIdsToFetch.length > 0) {
            const data = await callRobloxApiJson({
                isRovalraApi: true,
                subdomain: 'apis',
                endpoint: `/v1/users/settings?user_ids=${userIdsToFetch.join(',')}`,
                method: 'GET',
                skipAutoAuth: true,
            });

            if (data.status === 'success' && data.settings) {
                for (const [userId, apiSettings] of Object.entries(
                    data.settings,
                )) {
                    const batchItem = currentBatch.find(
                        (item) => String(item.userId) === String(userId),
                    );
                    if (!batchItem) continue;

                    const settings = await processApiSettings(
                        userId,
                        apiSettings,
                        batchItem.options,
                    );

                    const cacheKey = `${userId}-${batchItem.options.useDescription || false}`;
                    await cache.set(
                        'user_settings',
                        cacheKey,
                        {
                            data: settings,
                            timestamp: Date.now(),
                        },
                        'local',
                    );

                    if (pendingResolvers.has(userId)) {
                        pendingResolvers.get(userId).resolve(settings);
                        pendingResolvers.delete(userId);
                    }
                }
            }
        }

        for (const batchItem of currentBatch) {
            const isOwnProfile =
                String(batchItem.userId) === String(authenticatedUserId);
            const wasNotInBatch =
                !userIdsToFetch.includes(batchItem.userId) && !isOwnProfile;

            if (isOwnProfile || wasNotInBatch) {
                const settings = await fetchAndProcessSettings(
                    batchItem.userId,
                    batchItem.options,
                );

                const cacheKey = `${batchItem.userId}-${batchItem.options.useDescription || false}`;
                await cache.set(
                    'user_settings',
                    cacheKey,
                    {
                        data: settings,
                        timestamp: Date.now(),
                    },
                    'local',
                );

                if (pendingResolvers.has(batchItem.userId)) {
                    pendingResolvers.get(batchItem.userId).resolve(settings);
                    pendingResolvers.delete(batchItem.userId);
                }
            }
        }
    } catch (error) {
        console.warn(
            'RoValra: Batch settings fetch failed, falling back to individual requests.',
            error,
        );

        for (const batchItem of currentBatch) {
            try {
                const settings = await fetchAndProcessSettings(
                    batchItem.userId,
                    batchItem.options,
                );

                if (pendingResolvers.has(batchItem.userId)) {
                    pendingResolvers.get(batchItem.userId).resolve(settings);
                    pendingResolvers.delete(batchItem.userId);
                }
            } catch (e) {
                if (pendingResolvers.has(batchItem.userId)) {
                    pendingResolvers.get(batchItem.userId).reject(e);
                    pendingResolvers.delete(batchItem.userId);
                }
            }
        }
    } finally {
        batchInProgress = false;
        if (batchQueue.length > 0) {
            batchTimeout = setTimeout(processBatchQueue, BATCH_DELAY_MS);
        }
    }
}

async function processApiSettings(userId, apiSettings, options) {
    const authenticatedUserId = await getAuthenticatedUserId();
    const isOwnProfile =
        authenticatedUserId && String(authenticatedUserId) === String(userId);

    if (isOwnProfile) {
        await syncDonatorTier();
    }
    const isDonator = getCurrentUserTier() >= 1;

    let apiProvidedMeaningfulSettings = false;

    if (apiSettings && typeof apiSettings === 'object') {
        if (
            (apiSettings.environment === 0 || apiSettings.environment === 1) &&
            apiSettings.status === '' &&
            Object.keys(apiSettings).length === 2
        ) {
            apiProvidedMeaningfulSettings = false;
        } else {
            apiProvidedMeaningfulSettings = true;
        }
    }

    let description = null;
    let originalDescription = null;

    if (options.useDescription) {
        originalDescription = await getUserDescription(userId);
        description = originalDescription;
    }

    let finalStatus = null;
    let finalEnvironment = 1;
    let finalGradient = null;

    if (apiProvidedMeaningfulSettings) {
        finalStatus = apiSettings.status;
        finalEnvironment = apiSettings.environment;
        finalGradient = apiSettings.gradient;
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
        gradient: finalGradient,
        canUseApi: apiProvidedMeaningfulSettings,
        anonymous_leaderboard:
            apiSettings.anonymous_leaderboard === 'true' ||
            apiSettings.anonymous_leaderboard === true,
    };
}

export async function getUserSettings(userId, options = {}) {
    const authenticatedUserId = await getAuthenticatedUserId();
    const isOwnProfile =
        authenticatedUserId && String(authenticatedUserId) === String(userId);

    const cacheKey = `${userId}-${options.useDescription || false}`;

    const cached = await cache.get('user_settings', cacheKey, 'local');
    if (!options.noCache && cached && Date.now() - cached.timestamp < 60000) {
        return cached.data;
    }

    if (options.disableBatch || isOwnProfile) {
        const settings = await fetchAndProcessSettings(userId, options);

        await cache.set(
            'user_settings',
            cacheKey,
            {
                data: settings,
                timestamp: Date.now(),
            },
            'local',
        );

        return settings;
    }

    return new Promise((resolve, reject) => {
        batchQueue.push({ userId, options });
        pendingResolvers.set(userId, { resolve, reject });

        if (!batchTimeout) {
            batchTimeout = setTimeout(processBatchQueue, BATCH_DELAY_MS);
        }
    });
}
