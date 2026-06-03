import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';

export const USER_CURRENCY_DATA_KEY = 'rovalra_user_currency_v1';
const USER_CURRENCY_CACHE_DURATION = 30 * 1000;

let currencyTrackingInterval = null;
const activeCurrencyRequests = new Map();

async function getStoredCurrencyData(userId) {
    const result = await new Promise((resolve) =>
        chrome.storage.local.get([USER_CURRENCY_DATA_KEY], resolve),
    );

    const allUsersCurrencyData = result[USER_CURRENCY_DATA_KEY] || {};
    return {
        allUsersCurrencyData,
        currentUserData: allUsersCurrencyData[userId] || null,
    };
}

async function storeCurrencyData(userId, currencyData) {
    const { allUsersCurrencyData } = await getStoredCurrencyData(userId);
    allUsersCurrencyData[userId] = currencyData;

    await new Promise((resolve) =>
        chrome.storage.local.set(
            { [USER_CURRENCY_DATA_KEY]: allUsersCurrencyData },
            resolve,
        ),
    );
}

export async function updateUserCurrency(userId) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId) return null;

    const key = String(targetId);
    if (activeCurrencyRequests.has(key)) {
        return activeCurrencyRequests.get(key);
    }

    const requestPromise = (async () => {
        try {
            const response = await callRobloxApiJson({
                subdomain: 'economy',
                endpoint: `/v1/users/${targetId}/currency`,
                method: 'GET',
                useBackground: true,
                noCache: true,
            });

            const robux = Number(response?.robux);
            if (!Number.isFinite(robux)) return null;

            const currencyData = {
                robux,
                lastChecked: Date.now(),
            };

            await storeCurrencyData(targetId, currencyData);
            return currencyData;
        } catch (error) {
            console.error('RoValra: Failed to update user currency', error);
            return null;
        }
    })();

    activeCurrencyRequests.set(key, requestPromise);
    requestPromise.finally(() => activeCurrencyRequests.delete(key));

    return requestPromise;
}

export async function getUserCurrency(userId) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId) return null;

    const { currentUserData } = await getStoredCurrencyData(targetId);
    const now = Date.now();
    const isFresh =
        currentUserData &&
        now - (currentUserData.lastChecked || 0) <=
            USER_CURRENCY_CACHE_DURATION;

    if (isFresh) return currentUserData;

    return (await updateUserCurrency(targetId)) || currentUserData || null;
}

export async function getCachedUserCurrency(userId) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId) return null;

    const { currentUserData } = await getStoredCurrencyData(targetId);
    return currentUserData || null;
}

export function initUserCurrencyTracking() {
    getUserCurrency();

    if (!currencyTrackingInterval) {
        currencyTrackingInterval = setInterval(async () => {
            const userId = await getAuthenticatedUserId();
            if (!userId) return;

            await updateUserCurrency(userId);
        }, USER_CURRENCY_CACHE_DURATION);
    }
}
