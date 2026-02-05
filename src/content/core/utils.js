import { callRobloxApi } from './api.js';
import { getUserIdFromUrl } from './idExtractor.js';

export const getCsrfToken = (() => {
    let csrfToken = null;
    let pendingPromise = null;

    const fetchToken = async () => {
        try {
            const metaTag = document.querySelector('meta[name="csrf-token"]');
            if (metaTag?.dataset?.token) {
                csrfToken = metaTag.dataset.token;
                return csrfToken;
            }
            
            
           
        } catch (error) {
            console.error("RoValra (Utils): Failed to get CSRF token.", error);
            pendingPromise = null; 
            return null;
        }
    };

    const getToken = () => {
        if (csrfToken) return Promise.resolve(csrfToken);
        if (pendingPromise) return pendingPromise;
        return (pendingPromise = fetchToken());
    };

    getToken.setToken = (newToken) => {
        csrfToken = newToken;
        pendingPromise = null; 
    };

    return getToken;
})();

export { getUserIdFromUrl };

export async function getUsernameFromPageData() {
    const userId = getUserIdFromUrl();
    if (!userId) {
        return null;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'users',
            endpoint: `/v1/users/${userId}`,
            method: 'GET'
        });
        if (response.ok) {
            const data = await response.json();
            return data.name;
        }
    } catch (e) {}
    return null;
}

export async function getDisplayNameFromPageData() {
    const userId = getUserIdFromUrl();
    if (!userId) {
        return null;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'users',
            endpoint: `/v1/users/${userId}`,
            method: 'GET'
        });
        if (response.ok) {
            const data = await response.json();
            return data.displayName;
        }
    } catch (e) {}
    return null;
}
