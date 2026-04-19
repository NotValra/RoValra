import { callRobloxApi, callRobloxApiJson } from '../api.js';
import {
    getAuthenticatedUserId,
    getAuthenticatedUsername,
} from '../../core/user.js';
import { checkUserExistence } from './existenceCheck.js';

const STORAGE_KEY = 'rovalra_oauth_verification';
const OAUTH_PROGRESS_KEY = 'rovalra_oauth_progress';
const AUTH_GAME_UNIVERSE_IDS = [9765626115, 9797153324, 9858244250];

let fallbackTokenCache = new Map();
let isFlowProcessing = false;

function setCachedFallbackToken(userId, token) {
    if (!userId) return;
    fallbackTokenCache.set(userId, {
        token,
        timestamp: Date.now(),
    });
}

function getCachedFallbackToken(userId) {
    if (!userId) return null;
    const cached = fallbackTokenCache.get(userId);
    if (!cached) return null;
    return cached.token;
}

function clearCachedFallbackToken(userId) {
    if (!userId) return;
    fallbackTokenCache.delete(userId);
}

async function shouldForceFallback() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ forceFallbackAuth: false }, (settings) => {
            resolve(!!settings.forceFallbackAuth);
        });
    });
}

async function isUnder13() {
    try {
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
            if (m < 0 || (m === 0 && today.getDate() < birthDay)) age--;
            return age < 13;
        }
    } catch (error) {}
    return false;
}

export async function shouldUseFallback() {
    const forceFallback = await shouldForceFallback();
    if (forceFallback) return true;
    return await isUnder13();
}

export async function getStoredFallback() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;
    const cachedToken = getCachedFallbackToken(userId);
    if (cachedToken) {
        return {
            accessToken: cachedToken,
        };
    }
    const storage = await chrome.storage.local.get(STORAGE_KEY);
    const allVerifications = storage[STORAGE_KEY] || {};
    const stored = allVerifications[userId];
    if (stored && stored.accessToken) {
        setCachedFallbackToken(userId, stored.accessToken);
        return stored;
    }
    return null;
}

async function storeFallback(data) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return false;
    const storage = await chrome.storage.local.get(STORAGE_KEY);
    const allVerifications = storage[STORAGE_KEY] || {};
    allVerifications[userId] = {
        verified: true,
        isFallback: true,
        robloxId: data.robloxId || userId,
        username: data.username || '',
        accessToken: data.accessToken,
        timestamp: Date.now(),
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: allVerifications });
    setCachedFallbackToken(userId, data.accessToken);
    return true;
}

export async function clearFallbackVerification() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;
    const storage = await chrome.storage.local.get(STORAGE_KEY);
    const allVerifications = storage[STORAGE_KEY] || {};
    delete allVerifications[userId];
    await chrome.storage.local.set({ [STORAGE_KEY]: allVerifications });
    clearCachedFallbackToken(userId);
}

function clearFallbackProgress() {
    return chrome.storage.local.remove(OAUTH_PROGRESS_KEY);
}

function saveFallbackProgress(step, data = {}) {
    return chrome.storage.local.set({
        [OAUTH_PROGRESS_KEY]: {
            step,
            data,
            timestamp: Date.now(),
            isFallback: true,
        },
    });
}

async function getFallbackProgress() {
    const storage = await chrome.storage.local.get(OAUTH_PROGRESS_KEY);
    const progress = storage[OAUTH_PROGRESS_KEY] || null;
    if (progress && progress.isFallback) return progress;
    return null;
}

export async function getValidFallbackToken(forceRefresh = false) {
    if (!forceRefresh) {
        const stored = await getStoredFallback();
        if (stored?.accessToken) {
            return stored.accessToken;
        }
    }
    const success = await startFallbackFlow();
    if (success) {
        const newStored = await getStoredFallback();
        return newStored?.accessToken || null;
    }
    return null;
}

async function favoriteGame(universeId, isFavorited = true) {
    try {
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games/${universeId}/favorites`,
            method: 'POST',
            body: { isFavorited: isFavorited },
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function unfavoriteAllAuthGames() {
    const promises = AUTH_GAME_UNIVERSE_IDS.map((universeId) =>
        favoriteGame(universeId, false),
    );
    await Promise.allSettled(promises);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        },
    );
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function startFallbackFlow() {
    if (isFlowProcessing) return false;
    isFlowProcessing = true;

    const userId = await getAuthenticatedUserId();
    const username = await getAuthenticatedUsername();

    if (!userId || !username) {
        isFlowProcessing = false;
        return false;
    }

    try {
        const existingProgress = await getFallbackProgress();
        if (
            existingProgress &&
            existingProgress.step &&
            existingProgress.data?.userId === userId
        ) {
            const timeSinceProgress =
                Date.now() - (existingProgress.timestamp || 0);
            if (timeSinceProgress < 2000) {
                isFlowProcessing = false;
                return false;
            }
            const success = await resumeFallbackFlow(userId, existingProgress);
            isFlowProcessing = false;
            return success;
        }

        const userExists = await checkUserExistence(userId, callRobloxApi);
        if (!userExists) {
            isFlowProcessing = false;
            return false;
        }

        const local_secret = generateUUID();
        const local_secret_hash = await sha256(local_secret);

        await unfavoriteAllAuthGames();

        const initiateResponse = await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/fallback/initiate',
            method: 'POST',
            body: {
                roblox_user_id: parseInt(userId),
                username: username,
                local_secret_hash: local_secret_hash,
            },
            skipAutoAuth: true,
            noCache: true,
        });

        if (
            !initiateResponse ||
            initiateResponse.status === 'error' ||
            !initiateResponse.universe_id
        ) {
            isFlowProcessing = false;
            return false;
        }

        const { universe_id, challenge, verification_id } = initiateResponse;
        await saveFallbackProgress('initiated', {
            userId,
            universe_id,
            challenge,
            verification_id,
            local_secret,
        });

        const favoriteSuccess = await favoriteGame(universe_id, true);
        if (!favoriteSuccess) {
            isFlowProcessing = false;
            return false;
        }

        await saveFallbackProgress('game_favorited', {
            userId,
            universe_id,
            challenge,
            verification_id,
            local_secret,
        });

        const success = await resumeFallbackFlow(userId, {
            step: 'game_favorited',
            data: {
                userId,
                universe_id,
                challenge,
                verification_id,
                local_secret,
            },
        });

        isFlowProcessing = false;
        return success;
    } catch (error) {
        isFlowProcessing = false;
        return false;
    }
}

async function resumeFallbackFlow(userId, progress) {
    const { step, data } = progress;
    const { universe_id, challenge, verification_id, local_secret } = data;

    try {
        if (step === 'initiated') {
            const favoriteSuccess = await favoriteGame(universe_id, true);
            if (!favoriteSuccess) return false;
            await saveFallbackProgress('game_favorited', {
                userId,
                universe_id,
                challenge,
                verification_id,
                local_secret,
            });
            return await resumeFallbackFlow(userId, {
                step: 'game_favorited',
                data: {
                    userId,
                    universe_id,
                    challenge,
                    verification_id,
                    local_secret,
                },
            });
        }

        if (step === 'game_favorited') {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            let completeResponse = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const response = await callRobloxApi({
                    isRovalraApi: true,
                    subdomain: 'apis',
                    endpoint: '/v1/auth/fallback/complete',
                    method: 'POST',
                    body: {
                        roblox_user_id: parseInt(userId),
                        challenge: challenge,
                        verification_id: verification_id,
                        local_secret: local_secret,
                    },
                    skipAutoAuth: true,
                    noCache: true,
                });
                completeResponse = await response.json();
                if (response.status === 400 && attempt < 3) {
                    await new Promise((resolve) => setTimeout(resolve, 4000));
                    continue;
                }
                break;
            }

            if (
                !completeResponse ||
                completeResponse.status !== 'success' ||
                !completeResponse.accessToken
            ) {
                await favoriteGame(universe_id, false);
                await clearFallbackProgress();
                return false;
            }

            await storeFallback({
                robloxId: userId,
                username: await getAuthenticatedUsername(),
                accessToken: completeResponse.accessToken,
            });

            await favoriteGame(universe_id, false);
            await clearFallbackProgress();
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

export async function initFallback() {
    const forceFallback = await shouldForceFallback();

    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const stored = await getStoredFallback();
    if (stored?.accessToken) return stored.accessToken;

    const useFallback = await shouldUseFallback();
    if (useFallback || forceFallback) return await getValidFallbackToken(true);
    return null;
}
