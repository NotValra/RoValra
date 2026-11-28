import { callRobloxApi } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

const STORAGE_KEY = 'rovalra_api_keys';
const API_KEY_NAME = 'Extension API key';
const API_KEY_DESCRIPTION =
    'Used by RoValra for local API requests only.\nNever used outside your local device.';
const OLD_API_KEY_NAME = 'RoValra API key';
const API_KEY_SCOPES_VERSION = 1;
const API_KEY_SCOPES = [
    {
        scopeType: 'user.inventory-item',
        targetParts: ['*'],
        operations: ['read'],
    },
];

function keyHasRequiredScopes(key) {
    const scopes = key.cloudAuthUserConfiguredProperties?.scopes;
    if (!Array.isArray(scopes)) return false;
    return API_KEY_SCOPES.every((required) =>
        scopes.some(
            (s) =>
                s.scopeType === required.scopeType &&
                required.operations.every((op) => s.operations?.includes(op)),
        ),
    );
}

export async function getValidApiKey() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const storage = await chrome.storage.local.get(STORAGE_KEY);
    const allUserKeys = storage[STORAGE_KEY] || {};
    const storedData = allUserKeys[userId];

    if (
        storedData &&
        storedData.apiKey &&
        storedData.description === API_KEY_DESCRIPTION &&
        storedData.scopesVersion === API_KEY_SCOPES_VERSION
    ) {
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

        const oldKeys =
            listData.cloudAuthInfo?.filter(
                (key) =>
                    key.cloudAuthUserConfiguredProperties?.name ===
                    OLD_API_KEY_NAME,
            ) || [];

        for (const oldKey of oldKeys) {
            await callRobloxApi({
                subdomain: 'apis',
                endpoint: `/cloud-authentication/v1/apiKey/${oldKey.id}`,
                method: 'DELETE',
            }).catch(() => {});
        }

        const matchingKeys =
            listData.cloudAuthInfo?.filter(
                (key) =>
                    key.cloudAuthUserConfiguredProperties?.name ===
                        API_KEY_NAME &&
                    key.cloudAuthUserConfiguredProperties?.description ===
                        API_KEY_DESCRIPTION,
            ) || [];

        const existingKey = matchingKeys.find(keyHasRequiredScopes);

        for (const outdatedKey of matchingKeys) {
            if (outdatedKey === existingKey) continue;
            await callRobloxApi({
                subdomain: 'apis',
                endpoint: `/cloud-authentication/v1/apiKey/${outdatedKey.id}`,
                method: 'DELETE',
            }).catch(() => {});
        }

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
                        scopes: API_KEY_SCOPES,
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
                description: API_KEY_DESCRIPTION,
                scopesVersion: API_KEY_SCOPES_VERSION,
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
