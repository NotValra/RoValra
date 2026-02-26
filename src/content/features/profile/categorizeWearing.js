// TODO Finish this script, remove the hard coded asset types, make it use pilltoggles.js and make items only be on a single line when im not lazy

import { observeElement } from '../../core/observer.js';
import { getIdsByCategory, getIdsBySubcategory } from '../../core/utils/itemCategories.js';
import { createItemCard } from '../../core/ui/items/items.js';

const ASSET_TYPE_IDS = {
    WEARABLES: new Set([
        8, 41, 42, 43, 44, 45, 46, 47, 57, 58, 11, 12, 2, 64, 65, 66, 67, 68, 69, 70, 71, 72, 79
    ]),
    EMOTES: new Set([61])
};

async function loadAssetTypeIds() {
    try {
        const [accessories, clothing, classicClothing, emotes] = await Promise.all([
            getIdsByCategory('Accessories'),
            getIdsByCategory('Clothing'),
            getIdsByCategory('ClassicClothing'),
            getIdsBySubcategory('Emotes')
        ]);
        const addIds = (source, targetSet) => {
            if (source?.assetTypeIds) source.assetTypeIds.forEach(id => targetSet.add(id));
        };
        addIds(accessories, ASSET_TYPE_IDS.WEARABLES);
        addIds(clothing, ASSET_TYPE_IDS.WEARABLES);
        addIds(classicClothing, ASSET_TYPE_IDS.WEARABLES);
        addIds(emotes, ASSET_TYPE_IDS.EMOTES);
    } catch (e) {
        console.error('RoValra: Failed to load asset type IDs', e);
    }
}

const assetInfoCache = new Map();
const pendingItems = new Map();
let mainCategorizedWrapper = null;
let grids = {};

function getCategoryName(assetTypeId) {
    if (ASSET_TYPE_IDS.WEARABLES.has(assetTypeId)) return 'Accessories & Clothing';
    if (ASSET_TYPE_IDS.EMOTES.has(assetTypeId)) return 'Emotes';
    return null;
}

function createCategoryGrid(title) {
    const section = document.createElement('div');
    section.className = 'rovalra-container section';
    section.style.cssText = 'margin-bottom: 24px; display: block;';

    const header = document.createElement('div');
    header.className = 'container-header';
    header.innerHTML = `<h2>${title}</h2>`;

    const grid = document.createElement('div');
    grid.className = 'rovalra-category-grid';
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
        padding: 10px 0;
    `;

    section.append(header, grid);
    return { section, grid };
}

function moveItemToRoValra(itemEl, assetId) {
    const info = assetInfoCache.get(assetId);
    if (!info || !mainCategorizedWrapper) return;

    const categoryName = getCategoryName(info.assetType.id);
    if (!categoryName) return;

    if (!grids[categoryName]) {
        const { section, grid } = createCategoryGrid(categoryName);
        grids[categoryName] = grid;
        mainCategorizedWrapper.appendChild(section);
    }

    const exists = grids[categoryName].querySelector(`a[href*="/catalog/${assetId}/"]`);
    if (!exists) {
        const card = createItemCard(assetId, {}, {
            cardStyles: { width: '100%' }
        });
        grids[categoryName].appendChild(card);
    }

    itemEl.style.display = 'none';
}

function handleItemDetection(itemEl) {
    const link = itemEl.querySelector('a.item-card-link');
    if (!link) return;

    let href = link.getAttribute('href');
    if (!href) return;

    const match = href.match(/\/catalog\/(\d+)\//);
    if (!match) return;

    const assetId = parseInt(match[1]);
    
    if (assetInfoCache.has(assetId)) {
        moveItemToRoValra(itemEl, assetId);
    } else {
        if (!pendingItems.has(assetId)) pendingItems.set(assetId, []);
        pendingItems.get(assetId).push(itemEl);
    }
}

async function setupMainWrapper() {

    observeElement('.profile-tab-content', (content) => {
        if (document.getElementById('rovalra-main-categorized-wrapper')) return;

        mainCategorizedWrapper = document.createElement('div');
        mainCategorizedWrapper.id = 'rovalra-main-categorized-wrapper';
        mainCategorizedWrapper.style.cssText = 'width: 100%; order: -1; margin-bottom: 20px;';

        content.prepend(mainCategorizedWrapper);
        
        grids = {}; 
    }, { multiple: true });
}

export async function init() {
    const result = await new Promise(resolve => chrome.storage.local.get('categorizeWearingEnabled', resolve));
    if (!result.categorizeWearingEnabled) return;

    console.log('RoValra: Initializing Categorized Wearing...');

    await loadAssetTypeIds();
    await setupMainWrapper();

    window.addEventListener('rovalra-catalog-details', (e) => {
        const data = e.detail?.data;
        if (!Array.isArray(data)) return;
        data.forEach(item => {
            if (item.id && item.assetType) {
                assetInfoCache.set(item.id, { id: item.id, assetType: { id: item.assetType } });
                if (pendingItems.has(item.id)) {
                    pendingItems.get(item.id).forEach(el => moveItemToRoValra(el, item.id));
                    pendingItems.delete(item.id);
                }
            }
        });
    });

    const hideStyle = document.createElement('style');
    hideStyle.innerHTML = `
        .profile-currently-wearing, .roseal-currently-wearing {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
            visibility: hidden !important;
        }
    `;
    document.head.appendChild(hideStyle);


    observeElement('.profile-currently-wearing [id="collection-carousel-item"]', (item) => {
        if (!item.dataset.rovalraMoved) {
            handleItemDetection(item);
        }
    }, { multiple: true });

    observeElement('.profile-currently-wearing .carousel-item', (item) => {
        if (!item.dataset.rovalraMoved) {
            handleItemDetection(item);
        }
    }, { multiple: true });
}