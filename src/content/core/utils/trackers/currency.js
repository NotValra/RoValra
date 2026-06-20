import { callRobloxApiJson } from '../../api';
import { getAuthenticatedUserId } from '../../user';

const currencyCache = new Map();
const activeCurrencyRequests = new Map();

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

            currencyCache.set(key, currencyData);
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
    getUserCurrency();
}
