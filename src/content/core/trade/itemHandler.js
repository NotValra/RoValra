import { callRobloxApi } from '../api';

const itemValueCache = new Map();
const rolimonsCache = new Map();

const fetchQueue = new Set();
let fetchTimer = null;

document.addEventListener('rovalra-tradable-items-response', (e) => {
    const data = e.detail;
    if (data && Array.isArray(data.items)) {
        data.items.forEach((item) => {
            if (Array.isArray(item.instances)) {
                item.instances.forEach((inst) => {
                    if (inst.collectibleItemInstanceId) {
                        itemValueCache.set(inst.collectibleItemInstanceId, {
                            ...inst,
                            rap: inst.recentAveragePrice,
                            serial: inst.serialNumber,
                            stock: inst.assetStock,
                            assetId: item.itemTarget.targetId,
                        });
                    }
                });
            }
        });
    }
});

export function getCachedItemValue(instanceId) {
    return itemValueCache.get(instanceId);
}

export function getCachedRolimonsItem(assetId) {
    return rolimonsCache.get(assetId);
}

export async function fetchRolimonsItems(ids) {
    const uniqueIds = [...new Set(ids)].filter((id) => !rolimonsCache.has(id));

    if (uniqueIds.length === 0) return;

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            endpoint: `/v1/rolimons/items?item_ids=${uniqueIds.join(',')}`,
        });
        if (response.ok) {
            const json = await response.json();
            if (json.success && json.items) {
                Object.entries(json.items).forEach(([id, data]) => {
                    rolimonsCache.set(id, data);
                });
                document.dispatchEvent(
                    new CustomEvent('rovalra-rolimons-data-update', {
                        detail: Object.keys(json.items),
                    }),
                );
            }
        }
    } catch (e) {
        console.warn('[RoValra] Failed to fetch Rolimons data', e);
    }
}

export function queueRolimonsFetch(id) {
    if (rolimonsCache.has(id)) return;
    fetchQueue.add(id);

    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(async () => {
        const ids = Array.from(fetchQueue);
        fetchQueue.clear();
        if (ids.length === 0) return;

        await fetchRolimonsItems(ids);
    }, 1000);
}
