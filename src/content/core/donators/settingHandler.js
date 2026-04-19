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
const memoryCache = new Map();
const pendingResolvers = new Map();

const DESCRIPTION_BASED_SETTINGS = ['status', 'environment'];

async function saveToCache(cacheKey, settings) {
    const cacheData = {
        data: settings,
        timestamp: Date.now(),
    };
    memoryCache.set(cacheKey, cacheData);
    await cache.set('user_settings', cacheKey, cacheData, 'local');
}

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

    const isTrusted = TRUSTED_USER_IDS.has(String(userId));
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

    const processedKeys = new Set();

    try {
        const authedId = await getAuthenticatedUserId();
        const authenticatedUserId = authedId ? String(authedId) : null;

        const userIdsToFetch = currentBatch
            .map((item) => item.userId)
            .filter(
                (id, index, self) =>
                    String(id) !== authenticatedUserId &&
                    self.indexOf(id) === index,
            )
            .slice(0, BATCH_MAX_SIZE);

        const userIdsToFetchStrings = userIdsToFetch.map((id) => String(id));

        if (userIdsToFetch.length > 0) {
            const data = await callRobloxApiJson({
                isRovalraApi: true,
                subdomain: 'apis',
                endpoint: `/v1/users/settings?user_ids=${userIdsToFetchStrings.join(',')}`,
                method: 'GET',
                skipAutoAuth: true,
            });

            if (data.status === 'success' && data.settings) {
                for (const [userId, apiSettings] of Object.entries(
                    data.settings,
                )) {
                    const batchItems = currentBatch.filter(
                        (item) => String(item.userId) === String(userId),
                    );

                    for (const item of batchItems) {
                        const cacheKey = `${userId}-${item.options.useDescription || false}`;
                        if (processedKeys.has(cacheKey)) continue;

                        const settings = await processApiSettings(
                            userId,
                            apiSettings,
                            item.options,
                        );

                        await saveToCache(cacheKey, settings);
                        processedKeys.add(cacheKey);

                        const resolvers = pendingResolvers.get(cacheKey);
                        if (resolvers) {
                            resolvers.forEach((r) => r.resolve(settings));
                            pendingResolvers.delete(cacheKey);
                        }
                    }
                }
            }
        }

        for (const batchItem of currentBatch) {
            const cacheKey = `${batchItem.userId}-${batchItem.options.useDescription || false}`;
            if (!processedKeys.has(cacheKey)) {
                const settings = await fetchAndProcessSettings(
                    batchItem.userId,
                    batchItem.options,
                );

                await saveToCache(cacheKey, settings);
                processedKeys.add(cacheKey);

                const resolvers = pendingResolvers.get(cacheKey);
                if (resolvers) {
                    resolvers.forEach((r) => r.resolve(settings));
                    pendingResolvers.delete(cacheKey);
                }
            }
        }
    } catch (error) {
        console.warn(
            'RoValra: Batch settings fetch failed, falling back to individual requests.',
            error,
        );

        for (const batchItem of currentBatch) {
            const cacheKey = `${batchItem.userId}-${batchItem.options.useDescription || false}`;
            try {
                const settings = await fetchAndProcessSettings(
                    batchItem.userId,
                    batchItem.options,
                );

                const resolvers = pendingResolvers.get(cacheKey);
                if (resolvers) {
                    resolvers.forEach((r) => r.resolve(settings));
                    pendingResolvers.delete(cacheKey);
                }
            } catch (e) {
                const resolvers = pendingResolvers.get(cacheKey);
                if (resolvers) {
                    resolvers.forEach((r) => r.reject(e));
                    pendingResolvers.delete(cacheKey);
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

    const isTrusted = TRUSTED_USER_IDS.has(String(userId));
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
    const authedId = await getAuthenticatedUserId();
    const authenticatedUserId = authedId ? String(authedId) : null;
    const strUserId = String(userId);
    const isOwnProfile =
        authenticatedUserId && strUserId === authenticatedUserId;

    const cacheKey = `${strUserId}-${options.useDescription || false}`;

    if (!options.noCache) {
        const memCached = memoryCache.get(cacheKey);
        if (memCached) {
            const staleThreshold = isOwnProfile ? 30000 : 300000;
            const isStale =
                Date.now() - (memCached.timestamp || 0) > staleThreshold;
            if (isStale && !pendingResolvers.has(cacheKey)) {
                if (options.disableBatch) {
                    fetchAndProcessSettings(userId, options).then((settings) =>
                        saveToCache(cacheKey, settings),
                    );
                } else {
                    batchQueue.push({ userId, options });
                    pendingResolvers.set(cacheKey, [
                        {
                            resolve: () => {},
                            reject: () => {},
                        },
                    ]);
                    if (!batchTimeout) {
                        batchTimeout = setTimeout(
                            processBatchQueue,
                            BATCH_DELAY_MS,
                        );
                    }
                }
            }
            return memCached.data;
        }

        const cached = await cache.get('user_settings', cacheKey, 'local');
        if (cached) {
            memoryCache.set(cacheKey, cached);
            const staleThreshold = isOwnProfile ? 30000 : 300000;
            const isStale =
                Date.now() - (cached.timestamp || 0) > staleThreshold;
            if (isStale && !pendingResolvers.has(cacheKey)) {
                if (options.disableBatch) {
                    fetchAndProcessSettings(userId, options).then((settings) =>
                        saveToCache(cacheKey, settings),
                    );
                } else {
                    batchQueue.push({ userId, options });
                    pendingResolvers.set(cacheKey, [
                        {
                            resolve: () => {},
                            reject: () => {},
                        },
                    ]);
                    if (!batchTimeout) {
                        batchTimeout = setTimeout(
                            processBatchQueue,
                            BATCH_DELAY_MS,
                        );
                    }
                }
            }
            return cached.data;
        }
    }

    if (pendingResolvers.has(cacheKey)) {
        return new Promise((resolve, reject) => {
            pendingResolvers.get(cacheKey).push({ resolve, reject });
        });
    }

    if (options.disableBatch) {
        const settings = await fetchAndProcessSettings(userId, options);
        await saveToCache(cacheKey, settings);

        return settings;
    }

    return new Promise((resolve, reject) => {
        batchQueue.push({ userId, options });
        pendingResolvers.set(cacheKey, [{ resolve, reject }]);

        if (!batchTimeout) {
            batchTimeout = setTimeout(processBatchQueue, BATCH_DELAY_MS);
        }
    });
}
