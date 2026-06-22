import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';

export const USER_CURRENCY_CHANGED_EVENT = 'rovalra:user-currency-changed';

const currencyCache = new Map();
const activeCurrencyRequests = new Map();
let currencyTrackingInitialized = false;

function emitCurrencyChange(userId, currencyData) {
    document.dispatchEvent(
        new CustomEvent(USER_CURRENCY_CHANGED_EVENT, {
            detail: {
                userId: String(userId),
                currencyData,
            },
        }),
    );
}

export async function setCachedUserCurrency(userId, currencyData) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId || !currencyData) return null;

    const robux = Number(currencyData.robux);
    if (!Number.isFinite(robux)) return null;

    const data = {
        robux,
        lastChecked: Number(currencyData.lastChecked) || Date.now(),
    };

    currencyCache.set(String(targetId), data);
    emitCurrencyChange(targetId, data);
    return data;
}

export async function updateUserCurrency(userId) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId) return null;

    const key = String(targetId);

    if (currencyCache.has(key)) {
        return currencyCache.get(key);
    }

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

            await setCachedUserCurrency(targetId, currencyData);
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

    const key = String(targetId);

    if (currencyCache.has(key)) {
        return currencyCache.get(key);
    }

    return (await updateUserCurrency(targetId)) || null;
}

export async function getCachedUserCurrency(userId) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId) return null;

    const key = String(targetId);
    return currencyCache.get(key) || null;
}

export function initUserCurrencyTracking() {
    if (currencyTrackingInitialized) return;
    currencyTrackingInitialized = true;
    getUserCurrency();
}
