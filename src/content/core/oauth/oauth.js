// TODO Remove console logs

const STORAGE_KEY = "rovalra_oauth_verification";
const TOKEN_EXPIRATION_BUFFER_MS = 5 * 60 * 1000; 
import { callRobloxApi } from '../api.js';
import { getAuthenticatedUserId } from '../user.js';

const existenceCache = new Map();
const prefixCache = new Map();
let activeOAuthPromise = null;

export async function init() {
    try {
        console.log("RoValra: Script loaded. Syncing session...");
        

        const token = await getValidAccessToken(true);

        if (token) {
            console.log("RoValra: Session synchronized successfully.");
        } else {
            console.log("RoValra: No active session or re-auth required.");
        }
    } catch (error) {
        console.error("RoValra: Error during script initialization", error);
    }
}
export async function getValidAccessToken(forceRefresh = false) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const storage = await chrome.storage.local.get(STORAGE_KEY);
    let allVerifications = storage[STORAGE_KEY] || {};
    let storedVerification = allVerifications[userId];

    if (!storedVerification || !storedVerification.accessToken) {
        const success = await startOAuthFlow(true);
        if (success) {
            const newStorage = await chrome.storage.local.get(STORAGE_KEY);
            return newStorage[STORAGE_KEY]?.[userId]?.accessToken || null;
        }
        return null;
    }

    if (storedVerification.robloxId != userId) {
        const success = await startOAuthFlow(true);
        if (success) {
            const newStorage = await chrome.storage.local.get(STORAGE_KEY);
            return newStorage[STORAGE_KEY]?.[userId]?.accessToken || null;
        }
        return null;
    }

    const isExpired = storedVerification.expiresAt && Date.now() > (storedVerification.expiresAt - TOKEN_EXPIRATION_BUFFER_MS);
    
    if (!forceRefresh && !isExpired) {
        return storedVerification.accessToken;
    }

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/auth/badges',
            headers: { 'Authorization': `Bearer ${storedVerification.accessToken}` },
            skipAutoAuth: true,
            noCache: true
        });

        if (!response.ok) {
            console.warn(`RoValra: Session invalid (Status ${response.status}). Triggering re-auth...`);
            const success = await startOAuthFlow(true);
            if (success) {
                const updated = await chrome.storage.local.get(STORAGE_KEY);
                return updated[STORAGE_KEY]?.[userId]?.accessToken || null;
            }
            return null;
        }


        const updatedStorage = await chrome.storage.local.get(STORAGE_KEY);
        return updatedStorage[STORAGE_KEY]?.[userId]?.accessToken || storedVerification.accessToken;

    } catch (error) {
        console.error("RoValra: Network error during token sync:", error);
        return storedVerification.accessToken; 
    }
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

async function checkUserExistence(userId) {
    if (existenceCache.has(userId)) {
        return existenceCache.get(userId);
    }

    try {
        const userIdHash = await sha256(userId.toString());
        const prefix = userIdHash.substring(0, 5);

        let matches = prefixCache.get(prefix);

        if (!matches) {
            const response = await callRobloxApi({
                isRovalraApi: true,
                subdomain: 'apis',
                endpoint: `/v1/auth/existence/${prefix}`,
                method: 'GET',
                skipAutoAuth: true
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && Array.isArray(data.matches)) {
                    matches = data.matches;
                    prefixCache.set(prefix, matches);
                }
            }
        }

        if (matches) {
            const exists = matches.includes(userIdHash);
            existenceCache.set(userId, exists);
            return exists;
        }
    } catch (error) {
        console.error("RoValra: Error checking user existence", error);
    }
    return false;
}

async function startOAuthFlow(silent = false) {

    const userId = await getAuthenticatedUserId();
    if (!userId) return false;

    if (!silent) {
        console.warn("RoValra: Non-silent OAuth flow is not implemented as per the background-only request.");
        return Promise.resolve(false);
    }

    if (activeOAuthPromise) return activeOAuthPromise;

    activeOAuthPromise = (async () => {
        const userExists = await checkUserExistence(userId);
        if (!userExists) {
            return false;
        }

        try {
            console.log("RoValra: Attempting direct OAuth authorization POST request...");

            const response = await callRobloxApi({
                subdomain: 'apis', 
                endpoint: '/oauth/v1/authorizations',
                method: 'POST',
                body: {
                    "clientId": "5835339573709822795",
                    "responseTypes": ["Code"],
                    "redirectUri": "https://apis.rovalra.com/v1/auth/callback",
                    "scopes": [
                        { "scopeType": "openid", "operations": ["read"] },
                        { "scopeType": "profile", "operations": ["read"] }
                    ],
                    "resourceInfos": [{
                        "owner": { "id": "447170745", "type": "User" },
                        "resources": {}
                    }]
                }
            });

            if (response.ok) {
                const authResponse = await response.json();
                const locationUrl = authResponse.location;

                if (!locationUrl) {
                    console.error("RoValra: OAuth authorization response did not contain a location URL.", authResponse);
                    return false;
                }

                console.log("RoValra: Got authorization code. Fetching token from callback URL...");

                const tokenResponse = await callRobloxApi({
                    fullUrl: locationUrl,
                    method: 'GET',
                    isRovalraApi: true
                });

                if (!tokenResponse.ok) {
                    console.error("RoValra: Failed to get token from callback URL.", await tokenResponse.text());
                    return false;
                }

                const tokenData = await tokenResponse.json();

                if (tokenData.status === 'success' && tokenData.access_token && tokenData.user_id && tokenData.username) {
                    console.log("RoValra: OAuth Successful!", tokenData);

                    const expiresAt = tokenData.expires_at ? tokenData.expires_at * 1000 : null;
                    
                    const storage = await chrome.storage.local.get(STORAGE_KEY);
                    const allVerifications = storage[STORAGE_KEY] || {};

                    allVerifications[userId] = {
                        verified: true,
                        robloxId: tokenData.user_id,
                        username: tokenData.username,
                        accessToken: tokenData.access_token,
                        expiresAt: expiresAt,
                        timestamp: Date.now()
                    };

                    await chrome.storage.local.set({ [STORAGE_KEY]: allVerifications });
                    return true;
                } else {
                    console.error("RoValra: Invalid token data received from backend.", tokenData);
                    return false;
                }
            } else {
                console.error("RoValra: OAuth authorization POST request failed with status " + response.status, await response.text());
                return false;
            }

        } catch (error) {
            console.error("RoValra: Error during direct OAuth authorization request.", error);
            return false;
        }
    })();

    try {
        return await activeOAuthPromise;
    } finally {
        activeOAuthPromise = null;
    }
}