import { callRobloxApi } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

const STORAGE_KEY = 'rovalra_api_keys';
const API_KEY_NAME = 'RoValra API key';
const API_KEY_DESCRIPTION =
    'RoValra API key, used for local API requests only.\nNever used outside your local device.';

export async function getValidApiKey() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const storage = await chrome.storage.local.get(STORAGE_KEY);
    const allUserKeys = storage[STORAGE_KEY] || {};
    const storedData = allUserKeys[userId];

    if (storedData && storedData.apiKey) {
        return storedData.apiKey;
    }

    try {
        const canUseResponse = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/cloud-authentication/v1/canUseApiKeys',
            method: 'POST',
            body: {},
        });

        if (!canUseResponse.ok) return null;
        const canUseData = await canUseResponse.json();
        if (!canUseData.canUseApiKeys) return null;

        const listResponse = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/cloud-authentication/v1/apiKeys',
            method: 'POST',
            body: { cursor: '', limit: 10, reverse: false },
        });

        if (!listResponse.ok) return null;
        const listData = await listResponse.json();

        const existingKey = listData.cloudAuthInfo?.find(
            (key) =>
                key.cloudAuthUserConfiguredProperties?.name === API_KEY_NAME &&
                key.cloudAuthUserConfiguredProperties?.description ===
                    API_KEY_DESCRIPTION,
        );

        let resultData;

        if (existingKey) {
            const regenResponse = await callRobloxApi({
                subdomain: 'apis',
                endpoint: `/cloud-authentication/v1/apiKey/${existingKey.id}/regenerate`,
                method: 'POST',
                body: {},
            });
            if (!regenResponse.ok) return null;
            resultData = await regenResponse.json();
        } else {
            const createResponse = await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/cloud-authentication/v1/apiKey',
                method: 'POST',
                body: {
                    cloudAuthUserConfiguredProperties: {
                        name: API_KEY_NAME,
                        description: API_KEY_DESCRIPTION,
                        isEnabled: true,
                        allowedCidrs: ['0.0.0.0/0'],
                        scopes: [],
                    },
                },
            });
            if (!createResponse.ok) return null;
            resultData = await createResponse.json();
        }

        if (resultData && resultData.apikeySecret) {
            const apiKey = resultData.apikeySecret;
            allUserKeys[userId] = {
                apiKey: apiKey,
                id: resultData.cloudAuthInfo.id,
                timestamp: Date.now(),
            };

            await chrome.storage.local.set({ [STORAGE_KEY]: allUserKeys });
            return apiKey;
        }
    } catch (error) {
        console.error('RoValra: Failed to manage API key', error);
    }

    return null;
}

export async function invalidateApiKey() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    const storage = await chrome.storage.local.get(STORAGE_KEY);
    const allUserKeys = storage[STORAGE_KEY] || {};

    if (allUserKeys[userId]) {
        delete allUserKeys[userId];
        await chrome.storage.local.set({ [STORAGE_KEY]: allUserKeys });
    }
}

export async function init() {
    await getValidApiKey();
}
