import { observeElement } from '../../core/observer.js';
import { getIdsByCategory, getIdsBySubcategory } from '../../core/utils/itemCategories.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';

const ASSET_TYPE_IDS = {
    WEARABLES: new Set(),
    EMOTES: new Set()
};

let accessoriesGrid = null;
let emotesGrid = null;
let currentFilter = 'Accessories';

async function loadAssetTypeIds() {
    try {
        const [accessories, clothing, classicClothing, emotes, bundles, animations] = await Promise.all([
            getIdsByCategory('Accessories'),
            getIdsByCategory('Clothing'),
            getIdsByCategory('ClassicClothing'),
            getIdsBySubcategory('Emotes'),
            getIdsByCategory('Bundles'),
            getIdsByCategory('AvatarAnimations')
        ]);

        const addIds = (source, targetSet) => {
            if (source?.assetTypeIds) source.assetTypeIds.forEach(id => targetSet.add(id));
        };

        addIds(accessories, ASSET_TYPE_IDS.WEARABLES);
        addIds(clothing, ASSET_TYPE_IDS.WEARABLES);
        addIds(classicClothing, ASSET_TYPE_IDS.WEARABLES);
        addIds(bundles, ASSET_TYPE_IDS.WEARABLES);
        addIds(emotes, ASSET_TYPE_IDS.EMOTES);
        addIds(animations, ASSET_TYPE_IDS.EMOTES);
    } catch (e) {
        console.error('RoValra: Failed to load asset type IDs', e);
    }
}

const assetInfoCache = new Map();
const pendingItems = new Map();


function updateScrollButtonStates(container, leftBtn, rightBtn) {
    if (!container || !leftBtn || !rightBtn) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    

    const isScrollable = scrollWidth > clientWidth + 5;

    if (!isScrollable) {
        leftBtn.style.display = 'none';
        rightBtn.style.display = 'none';
        return; 
    } else {
        leftBtn.style.display = 'flex';
        rightBtn.style.display = 'flex';
    }
    
    if (scrollLeft <= 5) {
        leftBtn.classList.add('rovalra-btn-disabled');
    } else {
        leftBtn.classList.remove('rovalra-btn-disabled');
    }

    const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 5;
    if (isAtEnd) {
        rightBtn.classList.add('rovalra-btn-disabled');
    } else {
        rightBtn.classList.remove('rovalra-btn-disabled');
    }
}

function getTargetGrid(assetTypeId) {
    if (ASSET_TYPE_IDS.EMOTES.has(assetTypeId)) return emotesGrid;
    return accessoriesGrid;
}

function updateTabVisibility() {
    if (!accessoriesGrid || !emotesGrid) return;
    
    const container = accessoriesGrid.parentElement;
    if (currentFilter === 'Accessories') {
        accessoriesGrid.style.display = 'flex';
        emotesGrid.style.display = 'none';
    } else {
        accessoriesGrid.style.display = 'none';
        emotesGrid.style.display = 'flex';
    }
    if (container) container.scrollLeft = 0;
}
function createCategorizedWearingSection() {
    const section = document.createElement('div');
    section.className = 'section rovalra-container'; 
    section.style.cssText = 'margin-bottom: 24px; display: block; width: 100%; float: left; clear: both;';

    const header = document.createElement('div');
    header.className = 'container-header';
    header.style.cssText = 'display: flex;  margin-bottom: 12px; width: 100%;';

    const title = document.createElement('h2');
    title.textContent = 'Currently Wearing';
    title.style.margin = '0';
    title.style.marginRight = 'auto';
    title.style.textAlign = 'left';
    title.style.float = 'none';
    
    const pillToggle = createPillToggle({
        options: [
            { text: 'Accessories', value: 'Accessories' },
            { text: 'Emotes', value: 'Emotes' }
        ],
        initialValue: 'Accessories',
        onChange: (value) => {
            currentFilter = value;
            updateTabVisibility();
            setTimeout(() => updateScrollButtonStates(scrollContainer, leftButton, rightButton), 50);
        }
    });

    header.append(title, pillToggle);
    
    const scrollContainerWrapper = document.createElement('div');
    scrollContainerWrapper.className = 'rovalra-scroll-wrapper';
    scrollContainerWrapper.style.cssText = 'position: relative; width: 100%; display: flex; align-items: center;';

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'rovalra-items-scroll-container';
    scrollContainer.style.cssText = 'overflow-x: auto; scroll-behavior: smooth; padding: 10px 0; flex-grow: 1; display: block;';

    accessoriesGrid = document.createElement('div');
    accessoriesGrid.className = 'rovalra-category-grid wearables';
    accessoriesGrid.style.cssText = 'display: flex; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';

    emotesGrid = document.createElement('div');
    emotesGrid.className = 'rovalra-category-grid emotes';
    emotesGrid.style.cssText = 'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';

    scrollContainer.append(accessoriesGrid, emotesGrid);

    const { leftButton, rightButton } = createScrollButtons({
        onLeftClick: () => { scrollContainer.scrollLeft -= 600; },
        onRightClick: () => { scrollContainer.scrollLeft += 600; }
    });

    leftButton.classList.add('rovalra-scroll-btn', 'left');
    rightButton.classList.add('rovalra-scroll-btn', 'right');

    scrollContainer.addEventListener('scroll', () => updateScrollButtonStates(scrollContainer, leftButton, rightButton));

    scrollContainerWrapper.append(leftButton, scrollContainer, rightButton);
    section.append(header, scrollContainerWrapper);

    setTimeout(() => updateScrollButtonStates(scrollContainer, leftButton, rightButton), 100);

    return section;
}

function addItemToCategoryView(itemEl, assetId) {
    const info = assetInfoCache.get(assetId);
    if (!info || !accessoriesGrid || !emotesGrid) return;

    const targetGrid = getTargetGrid(info.assetType.id);
    const exists = accessoriesGrid.querySelector(`a[href*="/${assetId}/"]`) || 
                   emotesGrid.querySelector(`a[href*="/${assetId}/"]`);

    if (!exists) {
        const card = createItemCard(assetId, {}, {
            cardStyles: { width: '150px', flexShrink: 0 }
        });
        targetGrid.appendChild(card);
        
        const container = accessoriesGrid.parentElement;
        const wrapper = container.parentElement;
        const left = wrapper.querySelector('.rovalra-scroll-btn.left');
        const right = wrapper.querySelector('.rovalra-scroll-btn.right');
        updateScrollButtonStates(container, left, right);
    }

    itemEl.style.display = 'none';
}

function handleItemDetection(itemEl) {
    const link = itemEl.querySelector('a.item-card-link');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    const match = href.match(/\/(catalog|bundles)\/(\d+)\//);
    if (!match) return;

    const assetId = parseInt(match[2]);
    if (assetInfoCache.has(assetId)) {
        addItemToCategoryView(itemEl, assetId);
    } else {
        if (!pendingItems.has(assetId)) pendingItems.set(assetId, []);
        pendingItems.get(assetId).push(itemEl);
    }
}

async function setupCategorizedWearing() {
    observeElement('.profile-tab-content', (content) => {
        if (document.getElementById('rovalra-main-categorized-wrapper')) return;
        const categorizedSection = createCategorizedWearingSection();
        categorizedSection.id = 'rovalra-main-categorized-wrapper';
        categorizedSection.style.order = '-1';
        content.prepend(categorizedSection);
    }, { multiple: true });
}

export async function init() {
    const result = await new Promise(resolve => chrome.storage.local.get('categorizeWearingEnabled', resolve));
    if (!result.categorizeWearingEnabled) return;

    await loadAssetTypeIds();
    await setupCategorizedWearing();

    window.addEventListener('rovalra-catalog-details', (e) => {
        const data = e.detail?.data;
        if (!Array.isArray(data)) return;
        data.forEach(item => {
            const typeId = item.assetType || item.assetTypeId;
            if (item.id && typeId) {
                assetInfoCache.set(item.id, { id: item.id, assetType: { id: typeId } });
                if (pendingItems.has(item.id)) {
                    pendingItems.get(item.id).forEach(el => addItemToCategoryView(el, item.id));
                    pendingItems.delete(item.id);
                }
            }
        });
    });

    const hideStyle = document.createElement('style');
    hideStyle.innerHTML = `
        .profile-currently-wearing, .roseal-currently-wearing { display: none !important; }
        .rovalra-items-scroll-container::-webkit-scrollbar { display: none; }
        .rovalra-items-scroll-container { -ms-overflow-style: none; scrollbar-width: none; }

        .rovalra-scroll-btn {
            position: absolute;
            z-index: 10;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.6) !important;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex; 
            align-items: center;
            justify-content: center;
            border: none;
            cursor: pointer;
            color: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            opacity: 0; 
            transition: opacity 0.25s ease, filter 0.2s ease, background 0.2s ease;
            pointer-events: none;
        }

        .rovalra-scroll-btn.left { left: 5px; }
        .rovalra-scroll-btn.right { right: 5px; }

        .rovalra-scroll-wrapper:hover .rovalra-scroll-btn {
            opacity: 1;
            pointer-events: auto;
        }

        .rovalra-scroll-btn.rovalra-btn-disabled {
            opacity: 0.25 !important;
            filter: grayscale(1);
            cursor: default;
            pointer-events: none;
        }

        .rovalra-scroll-btn:hover:not(.rovalra-btn-disabled) {
            background: rgba(0, 0, 0, 0.8) !important;
        }
    `;
    document.head.appendChild(hideStyle);

    const selectors = ['.profile-currently-wearing [id="collection-carousel-item"]', '.profile-currently-wearing .carousel-item'];
    selectors.forEach(selector => {
        observeElement(selector, (item) => {
            if (!item.dataset.rovalraProcessed) {
                item.dataset.rovalraProcessed = "true";
                handleItemDetection(item);
            }
        }, { multiple: true });
    });
}