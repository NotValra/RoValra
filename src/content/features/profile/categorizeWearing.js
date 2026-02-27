import { observeElement } from '../../core/observer.js';
import { getAllCategories } from '../../core/utils/itemCategories.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { safeHtml } from '../../core/packages/dompurify.js'
// TODO make roseals currently wearing replace rovalras.
let totalPrice = 0;
const processedBundleIds = new Set();
let totalPriceElement = null;

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const CONSTANT_IDS = {
    ANIMATIONS: [48, 50, 51, 52, 53, 54, 55],
    EMOTES: [61],
    BODY_PARTS: [17, 27, 28, 29, 30, 31, 78, 79]
};

const ASSET_TYPE_IDS = {
    WEARABLES: new Set(),
    EMOTES: new Set(CONSTANT_IDS.EMOTES),
    ANIMATIONS: new Set(CONSTANT_IDS.ANIMATIONS),
    BODY_PARTS: new Set(CONSTANT_IDS.BODY_PARTS)
};

let accessoriesGrid = null;
let emotesGrid = null;
let animationsGrid = null;
let bodyPartsGrid = null;
let currentFilter = 'Items';
const discoveredCategories = new Set();
let pillToggleWrapper = null;
let isBodyPartsCategoryEnabled = true;
let isAnimationsCategoryEnabled = true;
let isEmotesCategoryEnabled = true;

async function loadAssetTypeIds() {
    try {
        const allCategories = await getAllCategories();
        allCategories.forEach(cat => {
            const catName = (cat.category || cat.name || "").replace(/\s+/g, '').toLowerCase();
            if (catName.includes('animation')) {
                if (cat.subcategories) {
                    cat.subcategories.forEach(sub => {
                        const subName = sub.subcategory.toLowerCase();
                        if (subName.includes('emote')) {
                            sub.assetTypeIds?.forEach(id => ASSET_TYPE_IDS.EMOTES.add(id));
                        } else {
                            sub.assetTypeIds?.forEach(id => ASSET_TYPE_IDS.ANIMATIONS.add(id));
                        }
                    });
                }
                cat.assetTypeIds?.forEach(id => ASSET_TYPE_IDS.ANIMATIONS.add(id));
            } 
            const isWearable = ['accessories', 'clothing', 'classicclothing', 'bundles'].some(n => catName.includes(n));
            if (isWearable) {
                cat.assetTypeIds?.forEach(id => ASSET_TYPE_IDS.WEARABLES.add(id));
                cat.subcategories?.forEach(sub => {
                    sub.assetTypeIds?.forEach(id => ASSET_TYPE_IDS.WEARABLES.add(id));
                });
            }
        });
    } catch (e) {
        console.error('RoValra: Failed to load dynamic asset type IDs', e);
    }
}

const assetInfoCache = new Map();
const pendingItems = new Map();

function updateTotalDisplay() {
    if (!totalPriceElement) {
        totalPriceElement = document.getElementById('rovalra-wearing-total-price');
    }
    if (totalPriceElement) {
        if (totalPrice > 0) {
            totalPriceElement.innerHTML = safeHtml`
                <span class="icon-robux-16x16" style="vertical-align: middle; margin: 0 4px 0 8px;"></span>
                <span style="font-weight: 600;">${totalPrice.toLocaleString()}</span>
            `;
        } else {
            totalPriceElement.innerHTML = '';
        }
    }
}

function recalculateTotalPrice() {
    totalPrice = 0;
    processedBundleIds.clear();
    
    const allCards = document.querySelectorAll('.rovalra-category-grid .rovalra-item-card');
    
    allCards.forEach(card => {
        if (card.classList.contains('shimmer')) return;

        const link = card.querySelector('a.rovalra-item-card-link');
        if (!link) return;

        const match = link.href.match(/\/(catalog|bundles)\/(\d+)\//);
        if (!match) return;

        const assetId = parseInt(match[2]);
        const info = assetInfoCache.get(assetId);

        if (!info || !info.assetType || !info.assetType.id) {
            return;
        }

        if (ASSET_TYPE_IDS.EMOTES.has(info.assetType.id)) {
            return;
        }

        const price = parseFloat(card.dataset.rovalraPrice);
        if (isNaN(price) || price === 0) {
            return;
        }

        const bundleId = card.dataset.rovalraBundleId;
        const isBundle = link.href.includes('/bundles/');

        if (bundleId) {
            if (!processedBundleIds.has(bundleId)) {
                totalPrice += price;
                processedBundleIds.add(bundleId);
            }
        } else {
            totalPrice += price;
        }
    });

    updateTotalDisplay();
}

function updateScrollButtonStates(container, leftBtn, rightBtn) {
    if (!container || !leftBtn || !rightBtn) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const isScrollable = scrollWidth > clientWidth + 5;
    leftBtn.style.display = isScrollable ? 'flex' : 'none';
    rightBtn.style.display = isScrollable ? 'flex' : 'none';
    leftBtn.classList.toggle('rovalra-btn-disabled', scrollLeft <= 5);
    const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 5;
    rightBtn.classList.toggle('rovalra-btn-disabled', isAtEnd);
}

function getCategoryName(assetTypeId) {
    const id = parseInt(assetTypeId);
    if (isEmotesCategoryEnabled && ASSET_TYPE_IDS.EMOTES.has(id)) return 'Emotes';
    if (isAnimationsCategoryEnabled && ASSET_TYPE_IDS.ANIMATIONS.has(id)) return 'Animations';
    if (isBodyPartsCategoryEnabled && ASSET_TYPE_IDS.BODY_PARTS.has(id)) return 'Body Parts';
    return 'Items';
}

function refreshPillToggle() {
    if (!pillToggleWrapper) return;
    const options = Array.from(discoveredCategories).map(cat => ({ text: cat, value: cat }));
    const categoryOrder = ['Items'];
    if (isBodyPartsCategoryEnabled) categoryOrder.push('Body Parts');
    if (isAnimationsCategoryEnabled) categoryOrder.push('Animations');
    if (isEmotesCategoryEnabled) categoryOrder.push('Emotes');

    options.sort((a, b) => {
        const indexA = categoryOrder.indexOf(a.value);
        const indexB = categoryOrder.indexOf(b.value);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
    pillToggleWrapper.innerHTML = '';
    if (options.length === 0) return;
    const newPillToggle = createPillToggle({
        options: options,
        initialValue: discoveredCategories.has(currentFilter) ? currentFilter : options[0].value,
        onChange: (value) => {
            currentFilter = value;
            updateTabVisibility();
            const container = document.querySelector('.rovalra-items-scroll-container');
            if (container) {
                const left = container.parentElement.querySelector('.left');
                const right = container.parentElement.querySelector('.right');
                setTimeout(() => updateScrollButtonStates(container, left, right), 50);
            }
        }
    });
    pillToggleWrapper.appendChild(newPillToggle);
    updateTabVisibility();
}

function updateTabVisibility() {
    if (!accessoriesGrid) return;
    accessoriesGrid.style.display = currentFilter === 'Items' ? 'flex' : 'none';
    if (emotesGrid) emotesGrid.style.display = currentFilter === 'Emotes' ? 'flex' : 'none';
    if (animationsGrid) animationsGrid.style.display = currentFilter === 'Animations' ? 'flex' : 'none';
    if (bodyPartsGrid) {
        bodyPartsGrid.style.display = currentFilter === 'Body Parts' ? 'flex' : 'none';
    }
    const container = accessoriesGrid.parentElement;
    if (container) container.scrollLeft = 0;
}

function createCategorizedWearingSection() {
    const section = document.createElement('div');
    section.className = 'section rovalra-container'; 
    section.style.cssText = 'margin-bottom: 24px; display: block; width: 100%; clear: both; float: none;';

    const header = document.createElement('div');
    header.className = 'container-header';
    header.style.cssText = 'display: flex; margin-bottom: 12px; width: 100%; align-items: center;';

    const title = document.createElement('h2');
    title.textContent = 'Currently Wearing';
    title.style.margin = '0';

    totalPriceElement = document.createElement('div');
    totalPriceElement.id = 'rovalra-wearing-total-price';
    totalPriceElement.style.cssText = 'display: flex; align-items: center; color: var(--rovalra-secondary-text-color); font-size: 16px;';

    const spacer = document.createElement('div');
    spacer.style.flexGrow = '1';
    
    pillToggleWrapper = document.createElement('div');
    pillToggleWrapper.className = 'rovalra-pill-wrapper';
    header.append(title, totalPriceElement, spacer, pillToggleWrapper);
    
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'rovalra-scroll-wrapper';
    scrollWrapper.style.cssText = 'position: relative; width: 100%; display: flex; align-items: center;';

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'rovalra-items-scroll-container';
    scrollContainer.style.cssText = 'overflow-x: auto; scroll-behavior: smooth; padding: 10px 0; flex-grow: 1; display: block;';

    accessoriesGrid = document.createElement('div');
    accessoriesGrid.className = 'rovalra-category-grid wearables';
    accessoriesGrid.style.cssText = 'display: flex; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
    
    scrollContainer.append(accessoriesGrid);

    if (isEmotesCategoryEnabled) {
        emotesGrid = document.createElement('div');
        emotesGrid.className = 'rovalra-category-grid emotes';
        emotesGrid.style.cssText = 'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
        scrollContainer.append(emotesGrid);
    }

    if (isAnimationsCategoryEnabled) {
        animationsGrid = document.createElement('div');
        animationsGrid.className = 'rovalra-category-grid animations';
        animationsGrid.style.cssText = 'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
        scrollContainer.append(animationsGrid);
    }

    if (isBodyPartsCategoryEnabled) {
        bodyPartsGrid = document.createElement('div');
        bodyPartsGrid.className = 'rovalra-category-grid body-parts';
        bodyPartsGrid.style.cssText = 'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
        scrollContainer.append(bodyPartsGrid);
    }

    const { leftButton, rightButton } = createScrollButtons({
        onLeftClick: () => { scrollContainer.scrollLeft -= 600; },
        onRightClick: () => { scrollContainer.scrollLeft += 600; }
    });

    leftButton.classList.add('rovalra-scroll-btn', 'left');
    rightButton.classList.add('rovalra-scroll-btn', 'right');
    scrollContainer.addEventListener('scroll', () => updateScrollButtonStates(scrollContainer, leftButton, rightButton));

    scrollWrapper.append(leftButton, scrollContainer, rightButton);
    section.append(header, scrollWrapper);
    return section;
}

function addItemToCategoryView(itemEl, assetId) {
    const info = assetInfoCache.get(assetId);
    if (!info || !accessoriesGrid) return;
    const category = getCategoryName(info.assetType.id);
    let targetGrid;
    switch (category) {
        case 'Emotes': targetGrid = emotesGrid; break;
        case 'Animations': targetGrid = animationsGrid; break;
        case 'Body Parts': targetGrid = bodyPartsGrid; break;
        default: targetGrid = accessoriesGrid;
    }
    if (!targetGrid.querySelector(`a[href*="/${assetId}/"]`)) {
        targetGrid.appendChild(createItemCard(assetId, {}, { cardStyles: { width: '150px', flexShrink: 0 } }));
        if (!discoveredCategories.has(category)) {
            discoveredCategories.add(category);
            refreshPillToggle();
        }
        const container = targetGrid.parentElement;
        updateScrollButtonStates(container, container.parentElement.querySelector('.left'), container.parentElement.querySelector('.right'));
    }
    itemEl.style.display = 'none';
}

function handleItemDetection(itemEl) {
    if (itemEl.closest('.profile-store')) return; 
    const link = itemEl.querySelector('a.item-card-link');
    if (!link) return;
    const match = link.getAttribute('href')?.match(/\/(catalog|bundles)\/(\d+)\//);
    if (!match) return;
    const assetId = parseInt(match[2]);
    if (assetInfoCache.has(assetId)) addItemToCategoryView(itemEl, assetId);
    else {
        if (!pendingItems.has(assetId)) pendingItems.set(assetId, []);
        pendingItems.get(assetId).push(itemEl);
    }
}

export async function init() {
    const result = await new Promise(resolve => chrome.storage.local.get(['categorizeWearingEnabled', 'CategorizeBodyParts', 'CategorizeAnimations', 'CategorizeEmotes'], resolve));
    if (!result.categorizeWearingEnabled) return;

    isBodyPartsCategoryEnabled = result.CategorizeBodyParts !== false;
    isAnimationsCategoryEnabled = result.CategorizeAnimations !== false;
    isEmotesCategoryEnabled = result.CategorizeEmotes !== false;

    await loadAssetTypeIds();

    observeElement('.profile-tab-content', (content) => {
        if (document.getElementById('rovalra-main-categorized-wrapper')) return;
        
        const originalWearing = content.querySelector('.profile-currently-wearing, .roseal-currently-wearing');
        const categorizedSection = createCategorizedWearingSection();
        categorizedSection.id = 'rovalra-main-categorized-wrapper';

        if (originalWearing) {
            originalWearing.before(categorizedSection);
            originalWearing.style.cssText = 'display: none !important; height: 0px !important; margin: 0px !important; padding: 0px !important; opacity: 0 !important; pointer-events: none !important;';
        } else {
            content.prepend(categorizedSection);
        }
    }, { multiple: true });

    observeElement('.profile-currently-wearing, .roseal-currently-wearing', (wearing) => {
        wearing.style.cssText = 'display: none !important; height: 0px !important; margin: 0px !important; padding: 0px !important; opacity: 0 !important; pointer-events: none !important;';
        if (!document.getElementById('rovalra-main-categorized-wrapper')) {
             const categorizedSection = createCategorizedWearingSection();
             categorizedSection.id = 'rovalra-main-categorized-wrapper';
             wearing.before(categorizedSection);
        }
    }, { multiple: true });

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
        .profile-store, .favorite-games-container, .profile-communities { 
            clear: both !important; 
            display: block !important; 
        }
        .profile-currently-wearing, .roseal-currently-wearing {
            display: none !important;
            height: 0px !important;
            margin: 0px !important;
            padding: 0px !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        .rovalra-items-scroll-container::-webkit-scrollbar { display: none; }
        .rovalra-scroll-btn {
            position: absolute; z-index: 10; top: 50%; transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.6) !important; border-radius: 50%;
            width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
            border: none; cursor: pointer; color: white; opacity: 0; 
            transition: opacity 0.25s ease; pointer-events: none;
        }
        .rovalra-scroll-btn.left { left: 5px; }
        .rovalra-scroll-btn.right { right: 5px; }
        .rovalra-scroll-wrapper:hover .rovalra-scroll-btn { opacity: 1; pointer-events: auto; }
        .rovalra-scroll-btn.rovalra-btn-disabled { opacity: 0.25 !important; cursor: default; pointer-events: none; }
    `;
    document.head.appendChild(hideStyle);

    const selectors = [
        '.profile-currently-wearing [id="collection-carousel-item"]', 
        '.profile-currently-wearing .carousel-item',
        '.roseal-currently-wearing [id="collection-carousel-item"]'
    ];
    selectors.forEach(selector => {
        observeElement(selector, (item) => {
            if (!item.dataset.rovalraProcessed) {
                item.dataset.rovalraProcessed = "true";
                handleItemDetection(item);
            }
                    const debouncedRecalculate = debounce(recalculateTotalPrice, 250);

        observeElement('.rovalra-category-grid .rovalra-item-card', debouncedRecalculate, {
            multiple: true,
            onRemove: debouncedRecalculate
        });
        }, { multiple: true });
    });
}