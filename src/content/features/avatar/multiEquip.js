import * as storage from "../../core/chrome/localStorage.js";
import { getIdsByCategory, getIdsBySubcategory } from '../../core/utils/itemCategories.js';

export function init() {
    const updateState = async (enabled) => {
        document.dispatchEvent(new CustomEvent('rovalra-multi-equip', { detail: { enabled } }));

        if (enabled) {
            try {
                const [accData, clothingData, hairData] = await Promise.all([
                    getIdsByCategory('Accessories'),
                    getIdsByCategory('Clothing'),
                    getIdsBySubcategory('HairAccessories')
                ]);

                const accIds = new Set(accData?.assetTypeIds || []);
                if (hairData?.assetTypeIds) hairData.assetTypeIds.forEach(id => accIds.add(id));

                document.dispatchEvent(new CustomEvent('rovalra-multi-equip', {
                    detail: {
                        enabled,
                        accessories: Array.from(accIds),
                        layered: clothingData?.assetTypeIds || []
                    }
                }));
            } catch (e) {
                console.warn("RoValra: Failed to fetch dynamic categories for multi-equip", e);
            }
        }
    };

    storage.get('multiEquipEnabled').then((data) => {
        updateState(data.multiEquipEnabled === true);
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.multiEquipEnabled) {
            updateState(changes.multiEquipEnabled.newValue === true);
        }
    });
}