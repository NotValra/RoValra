import { getAuthenticatedUserId } from '../../user';

const AVATAR_INVENTORY_DATA_KEY = 'rovalra_avatar_inventory_v1';

export async function getAvatarInventoryData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await chrome.storage.local.get([AVATAR_INVENTORY_DATA_KEY]);
    const allUsersInventory = result[AVATAR_INVENTORY_DATA_KEY] || {};
    const currentUserData = allUsersInventory[userId];

    return {
        totals: { totalItems: 0 },
        items: {},
        scanCursors: {},
        scanComplete: {},
        ...(currentUserData || {}),
        isScanning: !!currentUserData?.isScanning,
    };
}

export async function getCachedAvatarInventoryData() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const result = await chrome.storage.local.get([AVATAR_INVENTORY_DATA_KEY]);
    const allUsersInventory = result[AVATAR_INVENTORY_DATA_KEY] || {};
    return allUsersInventory[userId] || null;
}

export async function getAvatarInventoryItem(itemId) {
    const data = await getAvatarInventoryData();
    if (!data) return null;

    return data.items?.[String(itemId)] || null;
}

export function initAvatarInventoryTracking() {
    getAuthenticatedUserId().then((userId) => {
        if (!userId) return;
        chrome.runtime.sendMessage({
            action: 'triggerAvatarInventoryScan',
            userId,
        });
    });
}
