import { observeElement } from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { getAllCategories } from '../../core/utils/itemCategories.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
let totalPrice = 0;
const processedBundleIds = new Set();
let totalPriceElement = null;
export const assetInfoCache = new Map();
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
    BODY_PARTS: [17, 27, 28, 29, 30, 31, 78, 79],
};

const ASSET_TYPE_IDS = {
    WEARABLES: new Set(),
    EMOTES: new Set(CONSTANT_IDS.EMOTES),
    ANIMATIONS: new Set(CONSTANT_IDS.ANIMATIONS),
    BODY_PARTS: new Set(CONSTANT_IDS.BODY_PARTS),
};

let accessoriesGrid = null;
let emotesGrid = null;
let animationsGrid = null;
let bodyPartsGrid = null;
let cosmeticsGrid = null;
let currentFilter = 'items';
let activeWearingUserId = null;
let activeWearingRequestId = 0;
const wearingSectionCache = new Map();
export const discoveredCategories = new Set();
let pillToggleWrapper = null;
export let isBodyPartsCategoryEnabled = true;
export let isAnimationsCategoryEnabled = true;
export let isEmotesCategoryEnabled = true;

export function enableAllCategories() {
    isBodyPartsCategoryEnabled = true;
    isAnimationsCategoryEnabled = true;
    isEmotesCategoryEnabled = true;
}

export async function loadAssetTypeIds() {
    try {
        const allCategories = await getAllCategories();
        allCategories.forEach((cat) => {
            const catName = (cat.category || cat.name || '')
                .replace(/\s+/g, '')
                .toLowerCase();
            if (catName.includes('animation')) {
                if (cat.subcategories) {
                    cat.subcategories.forEach((sub) => {
                        const subName = sub.subcategory.toLowerCase();
                        if (subName.includes('emote')) {
                            sub.assetTypeIds?.forEach((id) =>
                                ASSET_TYPE_IDS.EMOTES.add(id),
                            );
                        } else {
                            sub.assetTypeIds?.forEach((id) =>
                                ASSET_TYPE_IDS.ANIMATIONS.add(id),
                            );
                        }
                    });
                }
                cat.assetTypeIds?.forEach((id) =>
                    ASSET_TYPE_IDS.ANIMATIONS.add(id),
                );
            }
            const isWearable = [
                'accessories',
                'clothing',
                'classicclothing',
                'bundles',
            ].some((n) => catName.includes(n));
            if (isWearable) {
                cat.assetTypeIds?.forEach((id) =>
                    ASSET_TYPE_IDS.WEARABLES.add(id),
                );
                cat.subcategories?.forEach((sub) => {
                    sub.assetTypeIds?.forEach((id) =>
                        ASSET_TYPE_IDS.WEARABLES.add(id),
                    );
                });
            }
            if (catName.includes('bodyparts')) {
                cat.assetTypeIds?.forEach((id) =>
                    ASSET_TYPE_IDS.BODY_PARTS.add(id),
                );
                cat.subcategories?.forEach((sub) => {
                    sub.assetTypeIds?.forEach((id) =>
                        ASSET_TYPE_IDS.BODY_PARTS.add(id),
                    );
                });
            }
        });
    } catch (e) {
        console.error('RoValra: Failed to load dynamic asset type IDs', e);
    }
}

export const pendingItems = new Map();
const originalThumbnailCache = new Map();

function getOriginalThumbnailData(itemEl, assetId) {
    const cached = originalThumbnailCache.get(assetId);
    if (cached) return cached;

    const img = itemEl?.querySelector(
        'img[src], img[data-src], img[data-thumb-url]',
    );
    const imageUrl =
        img?.currentSrc ||
        img?.src ||
        img?.dataset?.src ||
        img?.dataset?.thumbUrl ||
        '';

    if (
        !imageUrl ||
        imageUrl.startsWith('data:') ||
        imageUrl === window.location.href
    ) {
        return null;
    }

    const thumbnailData = {
        state: 'Completed',
        targetId: assetId,
        imageUrl,
        thumbnailType: 'Asset',
    };
    originalThumbnailCache.set(assetId, thumbnailData);
    return thumbnailData;
}

function updateTotalDisplay() {
    if (!totalPriceElement) {
        totalPriceElement = document.getElementById(
            'rovalra-wearing-total-price',
        );
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

export function recalculateTotalPrice() {
    totalPrice = 0;
    processedBundleIds.clear();

    const allCards = document.querySelectorAll(
        '.rovalra-category-grid .rovalra-item-card',
    );

    allCards.forEach((card) => {
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

function getCategoryName(assetTypeId, assetTypeName = '') {
    const name = String(assetTypeName).replace(/\s+/g, '').toLowerCase();
    if (isEmotesCategoryEnabled && name.includes('emote')) return 'emotes';
    if (isAnimationsCategoryEnabled && name.includes('animation'))
        return 'animations';
    if (
        isBodyPartsCategoryEnabled &&
        (name.includes('body') ||
            ['head', 'face', 'torso', 'rightarm', 'leftarm', 'rightleg', 'leftleg'].includes(name))
    ) {
        return 'bodyParts';
    }
    const id = parseInt(assetTypeId);
    if (isEmotesCategoryEnabled && ASSET_TYPE_IDS.EMOTES.has(id))
        return 'emotes';
    if (isAnimationsCategoryEnabled && ASSET_TYPE_IDS.ANIMATIONS.has(id))
        return 'animations';
    if (isBodyPartsCategoryEnabled && ASSET_TYPE_IDS.BODY_PARTS.has(id))
        return 'bodyParts';
    return 'items';
}

function refreshPillToggle() {
    if (!pillToggleWrapper) return;
    const options = Array.from(discoveredCategories).map((cat) => ({
        text: ts(`categorizeWearing.${cat}`),
        value: cat,
    }));
    const categoryOrder = ['items'];
    if (isBodyPartsCategoryEnabled) categoryOrder.push('bodyParts');
    if (isAnimationsCategoryEnabled) categoryOrder.push('animations');
    if (isEmotesCategoryEnabled) categoryOrder.push('emotes');
    categoryOrder.push('cosmetics');

    options.sort((a, b) => {
        const indexA = categoryOrder.indexOf(a.value);
        const indexB = categoryOrder.indexOf(b.value);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
    pillToggleWrapper.innerHTML = '';
    if (options.length === 0) {
        if (accessoriesGrid) accessoriesGrid.style.display = 'none';
        if (emotesGrid) emotesGrid.style.display = 'none';
        if (animationsGrid) animationsGrid.style.display = 'none';
        if (bodyPartsGrid) bodyPartsGrid.style.display = 'none';
        if (cosmeticsGrid) cosmeticsGrid.style.display = 'none';
        return;
    }

    let initialValueForToggle;

    // If user has explicitly selected a category (i.e. not the default 'items') and it's still available, respect it.
    if (currentFilter !== 'items' && discoveredCategories.has(currentFilter)) {
        initialValueForToggle = currentFilter;
    } else {
        // Otherwise, find the best available default according to the visual order.
        const bestDefault = categoryOrder.find((cat) =>
            discoveredCategories.has(cat),
        );
        if (bestDefault) {
            initialValueForToggle = bestDefault;
        } else if (options.length > 0) {
            initialValueForToggle = options[0].value; // Fallback
        } else {
            updateTabVisibility(null);
            return;
        }
    }

    const newPillToggle = createPillToggle({
        options: options,
        initialValue: initialValueForToggle,
        onChange: (value) => {
            currentFilter = value;
            const cacheEntry = getWearingCacheEntry();
            if (cacheEntry) cacheEntry.currentFilter = value;
            updateTabVisibility(value);
            const container = document.querySelector(
                '.rovalra-items-scroll-container',
            );
            if (container) {
                const left = container.parentElement.querySelector('.left');
                const right = container.parentElement.querySelector('.right');
                setTimeout(
                    () => updateScrollButtonStates(container, left, right),
                    50,
                );
            }
        },
    });
    pillToggleWrapper.appendChild(newPillToggle);
    updateTabVisibility(initialValueForToggle);
}

function updateTabVisibility(filter) {
    if (!accessoriesGrid) return;
    accessoriesGrid.style.display = filter === 'items' ? 'flex' : 'none';
    if (emotesGrid)
        emotesGrid.style.display = filter === 'emotes' ? 'flex' : 'none';
    if (animationsGrid)
        animationsGrid.style.display =
            filter === 'animations' ? 'flex' : 'none';
    if (bodyPartsGrid) {
        bodyPartsGrid.style.display = filter === 'bodyParts' ? 'flex' : 'none';
    }
    if (cosmeticsGrid)
        cosmeticsGrid.style.display = filter === 'cosmetics' ? 'flex' : 'none';
    const container = accessoriesGrid.parentElement;
    if (container) container.scrollLeft = 0;
}

function getWearingCacheEntry(userId = activeWearingUserId) {
    if (!userId) return null;
    return wearingSectionCache.get(String(userId)) || null;
}

function setCategorizedSectionRefs(section) {
    accessoriesGrid = section.querySelector('.rovalra-category-grid.wearables');
    emotesGrid = section.querySelector('.rovalra-category-grid.emotes');
    animationsGrid = section.querySelector('.rovalra-category-grid.animations');
    bodyPartsGrid = section.querySelector('.rovalra-category-grid.body-parts');
    cosmeticsGrid = section.querySelector('.rovalra-category-grid.cosmetics');
    pillToggleWrapper = section.querySelector('.rovalra-pill-wrapper');
    totalPriceElement = section.querySelector('#rovalra-wearing-total-price');
}

function getCategoriesFromSection(section) {
    const categories = new Set();
    if (
        section.querySelector('.rovalra-category-grid.wearables')?.children
            .length
    ) {
        categories.add('items');
    }
    if (
        section.querySelector('.rovalra-category-grid.body-parts')?.children
            .length
    ) {
        categories.add('bodyParts');
    }
    if (
        section.querySelector('.rovalra-category-grid.animations')?.children
            .length
    ) {
        categories.add('animations');
    }
    if (
        section.querySelector('.rovalra-category-grid.emotes')?.children.length
    ) {
        categories.add('emotes');
    }
    if (
        section.querySelector('.rovalra-category-grid.cosmetics')?.children.length
    ) {
        categories.add('cosmetics');
    }
    return categories;
}

function restoreCachedWearingSection(userId, content, cached) {
    if (!cached?.section || !content) return false;

    const existingSection = document.getElementById(
        'rovalra-main-categorized-wrapper',
    );
    if (existingSection && existingSection !== cached.section) {
        existingSection.remove();
    }

    setCategorizedSectionRefs(cached.section);
    discoveredCategories.clear();
    const categories =
        cached.categories?.size > 0
            ? cached.categories
            : getCategoriesFromSection(cached.section);
    categories.forEach((category) => discoveredCategories.add(category));

    currentFilter =
        cached.currentFilter && discoveredCategories.has(cached.currentFilter)
            ? cached.currentFilter
            : discoveredCategories.has('items')
              ? 'items'
              : Array.from(discoveredCategories)[0] || 'items';

    const originalWearing = content.querySelector(
        '.profile-currently-wearing, .roseal-currently-wearing',
    );
    if (!cached.section.isConnected) {
        if (originalWearing) {
            originalWearing.before(cached.section);
            hideOriginalWearingSection(originalWearing);
        } else {
            content.prepend(cached.section);
        }
    }

    updateTabVisibility(currentFilter);
    recalculateTotalPrice();
    activeWearingUserId = String(userId);
    return true;
}

export function createCategorizedWearingSection() {
    totalPrice = 0;
    processedBundleIds.clear();
    totalPriceElement = null;
    accessoriesGrid = null;
    emotesGrid = null;
    animationsGrid = null;
    bodyPartsGrid = null;
    cosmeticsGrid = null;
    pillToggleWrapper = null;
    discoveredCategories.clear();
    const section = document.createElement('div');
    section.className = 'section rovalra-container';
    section.style.cssText =
        'margin-bottom: 24px; display: block; width: 100%; clear: both; float: none;';

    const header = document.createElement('div');
    header.className = 'container-header';
    header.style.cssText =
        'display: flex; margin-bottom: 12px; width: 100%; align-items: center;';

    const title = document.createElement('h2');
    title.textContent = ts('categorizeWearing.currentlyWearing');
    title.style.margin = '0';

    totalPriceElement = document.createElement('div');
    totalPriceElement.id = 'rovalra-wearing-total-price';
    totalPriceElement.style.cssText =
        'display: flex; align-items: center; color: var(--rovalra-secondary-text-color); font-size: 16px;';

    const spacer = document.createElement('div');
    spacer.style.flexGrow = '1';

    pillToggleWrapper = document.createElement('div');
    pillToggleWrapper.className = 'rovalra-pill-wrapper';
    header.append(title, totalPriceElement, spacer, pillToggleWrapper);

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'rovalra-scroll-wrapper';
    scrollWrapper.style.cssText =
        'position: relative; width: 100%; display: flex; align-items: center;';

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'rovalra-items-scroll-container';
    scrollContainer.style.cssText =
        'overflow-x: auto; scroll-behavior: smooth; padding: 10px 0; flex-grow: 1; display: block;';

    accessoriesGrid = document.createElement('div');
    accessoriesGrid.className = 'rovalra-category-grid wearables';
    accessoriesGrid.style.cssText =
        'display: flex; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';

    scrollContainer.append(accessoriesGrid);

    if (isEmotesCategoryEnabled) {
        emotesGrid = document.createElement('div');
        emotesGrid.className = 'rovalra-category-grid emotes';
        emotesGrid.style.cssText =
            'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
        scrollContainer.append(emotesGrid);
    }

    if (isAnimationsCategoryEnabled) {
        animationsGrid = document.createElement('div');
        animationsGrid.className = 'rovalra-category-grid animations';
        animationsGrid.style.cssText =
            'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
        scrollContainer.append(animationsGrid);
    }

    if (isBodyPartsCategoryEnabled) {
        bodyPartsGrid = document.createElement('div');
        bodyPartsGrid.className = 'rovalra-category-grid body-parts';
        bodyPartsGrid.style.cssText =
            'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
        scrollContainer.append(bodyPartsGrid);
    }

    cosmeticsGrid = document.createElement('div');
    cosmeticsGrid.className = 'rovalra-category-grid cosmetics';
    cosmeticsGrid.style.cssText =
        'display: none; flex-wrap: nowrap; gap: 12px; width: max-content; min-width: 100%;';
    scrollContainer.append(cosmeticsGrid);

    const { leftButton, rightButton } = createScrollButtons({
        onLeftClick: () => {
            scrollContainer.scrollLeft -= 600;
        },
        onRightClick: () => {
            scrollContainer.scrollLeft += 600;
        },
    });

    leftButton.classList.add('rovalra-scroll-btn', 'left');
    rightButton.classList.add('rovalra-scroll-btn', 'right');
    scrollContainer.addEventListener('scroll', () =>
        updateScrollButtonStates(scrollContainer, leftButton, rightButton),
    );

    scrollWrapper.append(leftButton, scrollContainer, rightButton);
    section.append(header, scrollWrapper);
    return section;
}

function getProfileAssetEntries(profileData) {
    const entries = [];
    const seenIds = new Set();

    const backgroundId = Number(
        profileData?.components?.ProfileBackground?.assetId,
    );
    if (backgroundId) {
        seenIds.add(backgroundId);
        entries.push({ id: backgroundId, typeId: null, category: 'cosmetics' });
    }

    (profileData?.components?.CurrentlyWearing?.assets || []).forEach(
        (asset) => {
            const id = Number(asset.assetId);
            if (!id || seenIds.has(id)) return;

            seenIds.add(id);
            entries.push({
                id,
                typeId: null,
            });
        });

    return entries;
}

function hideOriginalWearingSection(wearing) {
    if (!wearing) return;
    wearing.style.cssText =
        'display: none !important; height: 0px !important; margin: 0px !important; padding: 0px !important; opacity: 0 !important; pointer-events: none !important;';
}

function ensureCategorizedSection(content) {
    let categorizedSection = document.getElementById(
        'rovalra-main-categorized-wrapper',
    );
    if (categorizedSection) {
        setCategorizedSectionRefs(categorizedSection);
        return categorizedSection;
    }

    categorizedSection = createCategorizedWearingSection();
    categorizedSection.id = 'rovalra-main-categorized-wrapper';
    if (activeWearingUserId) {
        wearingSectionCache.set(String(activeWearingUserId), {
            section: categorizedSection,
            categories: new Set(),
            currentFilter,
        });
    }

    const originalWearing = content?.querySelector(
        '.profile-currently-wearing, .roseal-currently-wearing',
    );

    if (originalWearing) {
        originalWearing.before(categorizedSection);
        hideOriginalWearingSection(originalWearing);
    } else if (content) {
        content.prepend(categorizedSection);
    }

    return categorizedSection;
}

async function loadCurrentlyWearing(content, profileData) {
    const userId = getUserIdFromUrl();
    if (!userId || !profileData) return;

    const cached = wearingSectionCache.get(String(userId));
    if (restoreCachedWearingSection(userId, content, cached)) return;

    const wrapper = document.getElementById('rovalra-main-categorized-wrapper');
    if (activeWearingUserId === String(userId) && wrapper) return;

    activeWearingUserId = String(userId);
    const requestId = ++activeWearingRequestId;
    if (wrapper) wrapper.remove();

    ensureCategorizedSection(content);

    try {
        if (
            requestId !== activeWearingRequestId ||
            activeWearingUserId !== String(userId)
        ) {
            return;
        }

        const entries = getProfileAssetEntries(profileData);
        if (entries.length === 0) {
            document
                .getElementById('rovalra-main-categorized-wrapper')
                ?.remove();
            wearingSectionCache.delete(String(userId));
            return;
        }

        entries.forEach((entry) => {
            assetInfoCache.set(entry.id, {
                id: entry.id,
                assetType: entry.typeId ? { id: entry.typeId } : null,
                rovalraCategory: entry.category,
            });
            addItemToCategoryView(null, entry.id);
        });

        const cacheEntry = wearingSectionCache.get(String(userId));
        if (cacheEntry) {
            cacheEntry.categories = new Set(discoveredCategories);
            cacheEntry.currentFilter = currentFilter;
        }
    } catch (e) {
        console.error(
            'RoValra: Failed to load currently wearing avatar data',
            e,
        );
        document.getElementById('rovalra-main-categorized-wrapper')?.remove();
        wearingSectionCache.delete(String(userId));
        activeWearingUserId = null;
    }
}

export function addItemToCategoryView(itemEl, assetId) {
    if (itemEl && itemEl.dataset.rovalraCategorized === 'true') return;
    const info = assetInfoCache.get(assetId);
    if (!accessoriesGrid) return;
    const category =
        info?.rovalraCategory ||
        (info?.assetType
            ? getCategoryName(info.assetType.id, info.assetType.name)
            : 'items');
    let targetGrid;
    switch (category) {
        case 'emotes':
            targetGrid = emotesGrid;
            break;
        case 'animations':
            targetGrid = animationsGrid;
            break;
        case 'bodyParts':
            targetGrid = bodyPartsGrid;
            break;
        case 'cosmetics':
            targetGrid = cosmeticsGrid;
            break;
        default:
            targetGrid = accessoriesGrid;
    }

    const exists = Array.from(targetGrid.children).some(
        (child) =>
            child.dataset.rovalraPendingId == assetId ||
            child.querySelector(`a[href*="/${assetId}/"]`),
    );

    if (!exists) {
        if (itemEl) itemEl.dataset.rovalraCategorized = 'true';
        const thumbnailData = getOriginalThumbnailData(itemEl, assetId);
        const card = createItemCard(assetId, {
            thumbnailData,
        });
        card.dataset.rovalraPendingId = assetId;
        targetGrid.appendChild(card);
        if (!discoveredCategories.has(category)) {
            discoveredCategories.add(category);
            const cacheEntry = getWearingCacheEntry();
            if (cacheEntry) {
                cacheEntry.categories.add(category);
                cacheEntry.currentFilter = currentFilter;
            }
            refreshPillToggle();
        }
        const container = targetGrid.parentElement;
        updateScrollButtonStates(
            container,
            container.parentElement.querySelector('.left'),
            container.parentElement.querySelector('.right'),
        );
        recalculateTotalPrice();
    }
    if (itemEl) itemEl.style.display = 'none';
}

function moveAssetCardToCategory(assetId) {
    const info = assetInfoCache.get(assetId);
    if (!info?.assetType || info.rovalraCategory === 'cosmetics') return;

    const category = getCategoryName(
        info.assetType.id,
        info.assetType.name,
    );
    const grids = [
        accessoriesGrid,
        emotesGrid,
        animationsGrid,
        bodyPartsGrid,
        cosmeticsGrid,
    ].filter(Boolean);
    const targetGrid = {
        items: accessoriesGrid,
        emotes: emotesGrid,
        animations: animationsGrid,
        bodyParts: bodyPartsGrid,
    }[category];
    if (!targetGrid) return;

    const card = grids
        .flatMap((grid) => Array.from(grid.children))
        .find(
            (candidate) =>
                candidate.dataset.rovalraPendingId == assetId ||
                candidate.querySelector(`a[href*="/${assetId}/"]`),
        );
    if (!card || card.parentElement === targetGrid) return;

    targetGrid.appendChild(card);
    discoveredCategories.add(category);
    refreshPillToggle();
}

export async function init() {
    const result = await new Promise((resolve) =>
        chrome.storage.local.get(
            [
                'categorizeWearingEnabled',
                'CategorizeBodyParts',
                'CategorizeAnimations',
                'CategorizeEmotes',
            ],
            resolve,
        ),
    );
    if (!result.categorizeWearingEnabled) return;

    isBodyPartsCategoryEnabled = result.CategorizeBodyParts !== false;
    isAnimationsCategoryEnabled = result.CategorizeAnimations !== false;
    isEmotesCategoryEnabled = result.CategorizeEmotes !== false;

    await loadAssetTypeIds();

    observeElement(
        '.profile-tab-content',
        (content) => {
            const originalWearing = content.querySelector(
                '.profile-currently-wearing, .roseal-currently-wearing',
            );

            if (originalWearing) {
                hideOriginalWearingSection(originalWearing);
            }

            loadCurrentlyWearing(content);
        },
        { multiple: true },
    );

    observeElement(
        '.profile-currently-wearing, .roseal-currently-wearing',
        (wearing) => {
            hideOriginalWearingSection(wearing);
            const content = wearing.closest('.profile-tab-content');
            if (content) loadCurrentlyWearing(content);
        },
        { multiple: true },
    );

    window.addEventListener('rovalra-catalog-details', (e) => {
        const data = e.detail?.data;
        if (!Array.isArray(data)) return;
        data.forEach((item) => {
            const rawAssetType = item.assetType || item.assetTypeId;
            const assetTypeObject =
                rawAssetType && typeof rawAssetType === 'object'
                    ? rawAssetType
                    : null;
            const typeId = assetTypeObject?.id ||
                (Number.isFinite(Number(rawAssetType))
                    ? Number(rawAssetType)
                    : null);
            const typeName =
                assetTypeObject?.name ||
                (typeof rawAssetType === 'string' ? rawAssetType : '');
            if (item.id && (typeId || typeName)) {
                assetInfoCache.set(item.id, {
                    id: item.id,
                    assetType: { id: typeId, name: typeName },
                    rovalraCategory: assetInfoCache.get(item.id)
                        ?.rovalraCategory,
                });
                moveAssetCardToCategory(item.id);
                if (pendingItems.has(item.id)) {
                    const elements = pendingItems.get(item.id);
                    if (elements.length === 0) {
                        addItemToCategoryView(null, item.id);
                    } else {
                        elements.forEach((el) =>
                            addItemToCategoryView(el, item.id),
                        );
                    }
                    pendingItems.delete(item.id);
                }
            }
        });
    });

    window.addEventListener('rovalra-profile-platform-response', (event) => {
        const content = document.querySelector('.profile-tab-content');
        if (content) loadCurrentlyWearing(content, event.detail);
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
            border: none; cursor: pointer; color: white; opacity: 1; 
            transition: opacity 0.25s ease; pointer-events: auto;
        }
        .rovalra-scroll-btn.left { left: 5px; }
        .rovalra-scroll-btn.right { right: 5px; }
        .rovalra-scroll-btn.rovalra-btn-disabled { opacity: 0.25 !important; cursor: default; pointer-events: auto; }
    `;
    document.body.style.overflowX = 'hidden';
    document.head.appendChild(hideStyle);

    const debouncedRecalculate = debounce(recalculateTotalPrice, 250);
    observeElement(
        '.rovalra-category-grid .rovalra-item-card',
        debouncedRecalculate,
        {
            multiple: true,
            onRemove: debouncedRecalculate,
        },
    );

    window.addEventListener('popstate', () => {
        activeWearingUserId = null;
        const content = document.querySelector('.profile-tab-content');
        if (content) loadCurrentlyWearing(content);
    });
}
