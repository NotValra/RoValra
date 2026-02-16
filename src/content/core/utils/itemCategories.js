import { callRobloxApiJson } from '../api.js';

let categoriesCache = null;
let pendingPromise = null;

async function fetchCategories() {
    if (categoriesCache) return categoriesCache;
    if (pendingPromise) return pendingPromise;

    pendingPromise = (async () => {
        try {
            const data = await callRobloxApiJson({
                subdomain: 'catalog',
                endpoint: '/v1/categories',
                method: 'GET'
            });

            const processed = [];
            const classicSubcats = ['ClassicShirts', 'ClassicTShirts', 'ClassicPants'];
            
            for (const cat of data) {
                if (cat.category === 'Clothing') {
                    const clothingSubcats = [];
                    const classicSubcategoryObjects = [];
                    const classicAssetTypeIds = new Set();

                    cat.subcategories.forEach(sub => {
                        if (classicSubcats.includes(sub.subcategory)) {
                            classicSubcategoryObjects.push(sub);
                            if (sub.assetTypeIds) sub.assetTypeIds.forEach(id => classicAssetTypeIds.add(id));
                        } else {
                            clothingSubcats.push(sub);
                        }
                    });

                    cat.subcategories = clothingSubcats;
                    cat.assetTypeIds = cat.assetTypeIds.filter(id => !classicAssetTypeIds.has(id));
                    processed.push(cat);

                    if (classicSubcategoryObjects.length > 0) {
                        processed.push({
                            category: 'ClassicClothing',
                            assetTypeIds: Array.from(classicAssetTypeIds),
                            bundleTypeIds: [],
                            categoryId: 999,
                            name: 'Classic Clothing',
                            orderIndex: cat.orderIndex,
                            subcategories: classicSubcategoryObjects,
                            isSearchable: true
                        });
                    }
                } else {
                    processed.push(cat);
                }
            }
            
            categoriesCache = processed;
            return processed;
        } catch (error) {
            console.error('RoValra: Failed to fetch item categories', error);
            categoriesCache = [];
            return [];
        }
    })();

    return pendingPromise;
}

export async function getAllCategories() {
    return await fetchCategories();
}

export async function getIdsByCategory(categoryName) {
    const categories = await fetchCategories();
    const cat = categories.find(c => c.category === categoryName || c.name === categoryName);
    
    if (!cat) return null;
    
    return {
        assetTypeIds: cat.assetTypeIds || [],
        bundleTypeIds: cat.bundleTypeIds || []
    };
}

export async function getIdsBySubcategory(subcategoryName) {
    const categories = await fetchCategories();
    
    for (const cat of categories) {
        const sub = cat.subcategories.find(s => s.subcategory === subcategoryName || s.name === subcategoryName);
        if (sub) {
            return {
                assetTypeIds: sub.assetTypeIds || [],
                bundleTypeIds: sub.bundleTypeIds || []
            };
        }
    }
    
    return null;
}