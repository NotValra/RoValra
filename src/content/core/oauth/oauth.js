// TODO Remove console logs

const STORAGE_KEY = 'rovalra_oauth_verification';
const OAUTH_PROGRESS_KEY = 'rovalra_oauth_progress';
const TOKEN_EXPIRATION_BUFFER_MS = 5 * 60 * 1000;
import { callRobloxApi } from '../api.js';
import { getAuthenticatedUserId } from '../user.js';
import { shouldUseFallback, getValidFallbackToken } from './fallback.js';
import { checkUserExistence } from './existenceCheck.js';

let activeOAuthPromise = null;

export async function init() {
    try {
        console.log('RoValra: Script loaded. Syncing session...');
        const token = await getValidAccessToken(true);

        if (token) {
            console.log('RoValra: Session synchronized successfully.');
        } else {
            console.log('RoValra: No active session or re-auth required.');
        }
    } catch (error) {
        console.error('RoValra: Error during script initialization', error);
    }
}

function clearOAuthProgress() {
    return chrome.storage.local.remove(OAUTH_PROGRESS_KEY);
}

function saveOAuthProgress(step, data = {}) {
    return chrome.storage.local.set({
        [OAUTH_PROGRESS_KEY]: {
            step,
            data,
            timestamp: Date.now(),
        },
    });
}

async function getOAuthProgress() {
    const storage = await chrome.storage.local.get(OAUTH_PROGRESS_KEY);
    return storage[OAUTH_PROGRESS_KEY] || null;
}

export async function getValidAccessToken(forceRefresh = false) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const useFallback = await shouldUseFallback();
    if (useFallback) {
        console.log('RoValra: Using fallback authentication (skipping OAuth)');
        await clearOAuthProgress();
        return await getValidFallbackToken(forceRefresh);
    }

    const storage = await chrome.storage.local.get(STORAGE_KEY);
    let allVerifications = storage[STORAGE_KEY] || {};
    let storedVerification = allVerifications[userId];

    if (!storedVerification || !storedVerification.accessToken) {
        const success = await startOAuthFlow(true);
        if (success) {
            const newStorage = await chrome.storage.local.get(STORAGE_KEY);
            return newStorage[STORAGE_KEY]?.[userId]?.accessToken || null;
        }
        console.log('RoValra: OAuth failed, trying fallback...');
        await clearOAuthProgress();
        return await getValidFallbackToken(forceRefresh);
    }

    if (storedVerification.robloxId != userId) {
        const success = await startOAuthFlow(true);
        if (success) {
            const newStorage = await chrome.storage.local.get(STORAGE_KEY);
            return newStorage[STORAGE_KEY]?.[userId]?.accessToken || null;
        }
        console.log('RoValra: OAuth failed (wrong user), trying fallback...');
        await clearOAuthProgress();
        return await getValidFallbackToken(forceRefresh);
    }

    if (!forceRefresh) {
        return storedVerification.accessToken;
    }

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/badges',
            headers: {
                Authorization: `Bearer ${storedVerification.accessToken}`,
            },
            skipAutoAuth: true,
            noCache: true,
        });

        if (!response.ok) {
            console.warn(
                `RoValra: Session invalid (Status ${response.status}). Triggering re-auth...`,
            );
            const success = await startOAuthFlow(true);
            if (success) {
                const updated = await chrome.storage.local.get(STORAGE_KEY);
                return updated[STORAGE_KEY]?.[userId]?.accessToken || null;
            }
            console.log('RoValra: OAuth re-auth failed, trying fallback...');
            await clearOAuthProgress();
            return await getValidFallbackToken(true);
        }

        const updatedStorage = await chrome.storage.local.get(STORAGE_KEY);
        return (
            updatedStorage[STORAGE_KEY]?.[userId]?.accessToken ||
            storedVerification.accessToken
        );
    } catch (error) {
        console.error('RoValra: Network error during token sync:', error);
        return storedVerification.accessToken;
    }
}

async function startOAuthFlow(silent = false) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return false;

    if (!silent) {
        console.warn(
            'RoValra: Non-silent OAuth flow is not implemented as per the background-only request.',
        );
        return Promise.resolve(false);
    }

    if (activeOAuthPromise) return activeOAuthPromise;

    const existingProgress = await getOAuthProgress();
    if (existingProgress && existingProgress.step) {
        console.log(
            'RoValra: Resuming OAuth flow from step:',
            existingProgress.step,
        );
        const success = await resumeOAuthFlow(userId, existingProgress);
        await clearOAuthProgress();
        return success;
    }

    activeOAuthPromise = (async () => {
        try {
            console.log('RoValra: Starting new OAuth flow...');

            console.log('RoValra: Checking birthdate...');
            const birthResponse = await callRobloxApi({
                subdomain: 'users',
                endpoint: '/v1/birthdate',
                method: 'GET',
            });

            if (birthResponse.ok) {
                const data = await birthResponse.json();
                const { birthYear, birthMonth, birthDay } = data;

                const today = new Date();
                let age = today.getFullYear() - birthYear;
                const m = today.getMonth() + 1 - birthMonth;
                if (m < 0 || (m === 0 && today.getDate() < birthDay)) {
                    age--;
                }

                if (age < 13) {
                    console.log(
                        'RoValra: User is under 13. Will use fallback auth.',
                    );
                    await clearOAuthProgress();
                    return false;
                }
            }

            await saveOAuthProgress('birthdate_checked', { userId });

            const userExists = await checkUserExistence(userId, callRobloxApi);
            if (!userExists) {
                await clearOAuthProgress();
                return false;
            }

            await saveOAuthProgress('existence_verified', { userId });

            try {
                console.log(
                    'RoValra: Attempting direct OAuth authorization POST request...',
                );

                const response = await callRobloxApi({
                    subdomain: 'apis',
                    endpoint: '/oauth/v1/authorizations',
                    method: 'POST',
                    body: {
                        clientId: '5835339573709822795',
                        responseTypes: ['Code'],
                        redirectUri:
                            'https://apis.rovalra.com/v1/auth/callback',
                        scopes: [
                            { scopeType: 'openid', operations: ['read'] },
                            { scopeType: 'profile', operations: ['read'] },
                        ],
                        resourceInfos: [
                            {
                                owner: { id: userId.toString(), type: 'User' },
                                resources: {},
                            },
                        ],
                    },
                });

                if (response.ok) {
                    const authResponse = await response.json();
                    const locationUrl = authResponse.location;

                    if (!locationUrl) {
                        console.error(
                            'RoValra: OAuth authorization response did not contain a location URL.',
                            authResponse,
                        );
                        await clearOAuthProgress();
                        return false;
                    }

                    console.log(
                        'RoValra: Got authorization code. Fetching token from callback URL...',
                    );

                    await saveOAuthProgress('got_auth_code', {
                        userId,
                        locationUrl,
                    });

                    const tokenResponse = await callRobloxApi({
                        fullUrl: locationUrl,
                        method: 'GET',
                        isRovalraApi: true,
                    });

                    if (!tokenResponse.ok) {
                        console.error(
                            'RoValra: Failed to get token from callback URL.',
                            await tokenResponse.text(),
                        );
                        await clearOAuthProgress();
                        return false;
                    }

                    const tokenData = await tokenResponse.json();

                    if (
                        tokenData.status === 'success' &&
                        tokenData.access_token &&
                        tokenData.user_id &&
                        tokenData.username
                    ) {
                        console.log('RoValra: OAuth Successful!', tokenData);

                        const storage =
                            await chrome.storage.local.get(STORAGE_KEY);
                        const allVerifications = storage[STORAGE_KEY] || {};

                        allVerifications[userId] = {
                            verified: true,
                            robloxId: tokenData.user_id,
                            username: tokenData.username,
                            accessToken: tokenData.access_token,
                            timestamp: Date.now(),
                        };

                        await chrome.storage.local.set({
                            [STORAGE_KEY]: allVerifications,
                        });

                        await clearOAuthProgress();
                        return true;
                    } else {
                        console.error(
                            'RoValra: Invalid token data received from backend.',
                            tokenData,
                        );
                        await clearOAuthProgress();
                        return false;
                    }
                } else {
                    console.error(
                        'RoValra: OAuth authorization POST request failed with status ' +
                            response.status,
                        await response.text(),
                    );
                    await clearOAuthProgress();
                    return false;
                }
            } catch (error) {
                console.error(
                    'RoValra: Error during direct OAuth authorization request.',
                    error,
                );
                await clearOAuthProgress();
                return false;
            }
        } catch (error) {
            console.error(
                'RoValra: Error during direct OAuth authorization request.',
                error,
            );
            await clearOAuthProgress();
            return false;
        }
    })();

    try {
        return await activeOAuthPromise;
    } finally {
        activeOAuthPromise = null;
    }
}

async function resumeOAuthFlow(userId, progress) {
    const { step, data } = progress;

    try {
        if (step === 'birthdate_checked') {
            const userExists = await checkUserExistence(userId, callRobloxApi);
            if (!userExists) return false;

            await saveOAuthProgress('existence_verified', { userId });
            return await resumeOAuthFlow(userId, {
                step: 'existence_verified',
                data: { userId },
            });
        }

        if (step === 'existence_verified') {
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/oauth/v1/authorizations',
                method: 'POST',
                body: {
                    clientId: '5835339573709822795',
                    responseTypes: ['Code'],
                    redirectUri: 'https://apis.rovalra.com/v1/auth/callback',
                    scopes: [
                        { scopeType: 'openid', operations: ['read'] },
                        { scopeType: 'profile', operations: ['read'] },
                    ],
                    resourceInfos: [
                        {
                            owner: { id: userId.toString(), type: 'User' },
                            resources: {},
                        },
                    ],
                },
            });

            if (response.ok) {
                const authResponse = await response.json();
                const locationUrl = authResponse.location;

                if (!locationUrl) {
                    console.error(
                        'RoValra: OAuth authorization response did not contain a location URL.',
                        authResponse,
                    );
                    await clearOAuthProgress();
                    return false;
                }

                console.log(
                    'RoValra: Got authorization code. Fetching token from callback URL...',
                );

                await saveOAuthProgress('got_auth_code', {
                    userId,
                    locationUrl,
                });

                const tokenResponse = await callRobloxApi({
                    fullUrl: locationUrl,
                    method: 'GET',
                    isRovalraApi: true,
                });

                if (!tokenResponse.ok) {
                    console.error(
                        'RoValra: Failed to get token from callback URL.',
                        await tokenResponse.text(),
                    );
                    await clearOAuthProgress();
                    return false;
                }

                const tokenData = await tokenResponse.json();

                if (
                    tokenData.status === 'success' &&
                    tokenData.access_token &&
                    tokenData.user_id &&
                    tokenData.username
                ) {
                    console.log(
                        'RoValra: OAuth Successful (resumed)!',
                        tokenData,
                    );

                    const storage = await chrome.storage.local.get(STORAGE_KEY);
                    const allVerifications = storage[STORAGE_KEY] || {};

                    allVerifications[userId] = {
                        verified: true,
                        robloxId: tokenData.user_id,
                        username: tokenData.username,
                        accessToken: tokenData.access_token,
                        timestamp: Date.now(),
                    };

                    await chrome.storage.local.set({
                        [STORAGE_KEY]: allVerifications,
                    });

                    await clearOAuthProgress();
                    return true;
                } else {
                    console.error(
                        'RoValra: Invalid token data received from backend.',
                        tokenData,
                    );
                    await clearOAuthProgress();
                    return false;
                }
            } else {
                console.error(
                    'RoValra: OAuth authorization POST request failed with status ' +
                        response.status,
                    await response.text(),
                );
                await clearOAuthProgress();
                return false;
            }
        }

        console.warn('RoValra: Unknown OAuth progress step:', step);
        await clearOAuthProgress();
        return false;
    } catch (error) {
        console.error('RoValra: Error resuming OAuth flow:', error);
        await clearOAuthProgress();
        return false;
    }
}
