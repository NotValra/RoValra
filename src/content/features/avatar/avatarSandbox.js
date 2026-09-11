import { observeElement } from '../../core/observer.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createSpinnerContainer } from '../../core/ui/spinner.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { fetchThumbnails, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import { getAllCategories } from '../../core/utils/itemCategories.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getCurrentAvatar } from '../../core/apis/avatar.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';
import { ts } from '../../core/locale/i18n.js';

const EXCLUSIVE_ASSET_TYPE_IDS = new Set([2, 11, 12, 17, 18, 27, 28, 29, 30, 31, 77]);
const MAX_PER_STACKABLE_TYPE = 10;
const SEARCH_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 400;
const RENDER_DEBOUNCE_MS = 350;
const RENDER_MAX_ATTEMPTS = 4;
const RENDER_RETRY_DELAY_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let overlayOpen = false;

function bodyColorsToPayload(bodyColor3s) {
    return {
        headColor: bodyColor3s?.headColor3,
        torsoColor: bodyColor3s?.torsoColor3,
        rightArmColor: bodyColor3s?.rightArmColor3,
        leftArmColor: bodyColor3s?.leftArmColor3,
        rightLegColor: bodyColor3s?.rightLegColor3,
        leftLegColor: bodyColor3s?.leftLegColor3,
    };
}

async function renderAvatarPreview(baseAvatar, assets) {
    const payload = {
        thumbnailConfig: {
            thumbnailId: 1,
            thumbnailType: '2d',
            size: '420x420',
        },
        avatarDefinition: {
            assets: assets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType,
                currentVersionId: asset.currentVersionId,
            })),
            bodyColors: bodyColorsToPayload(baseAvatar.bodyColor3s),
            scales: baseAvatar.scales,
            playerAvatarType: { playerAvatarType: baseAvatar.playerAvatarType },
        },
    };

    let lastError = null;
    for (let attempt = 1; attempt <= RENDER_MAX_ATTEMPTS; attempt++) {
        try {
            const response = await callRobloxApi({
                subdomain: 'avatar',
                endpoint: '/v1/avatar/render',
                method: 'POST',
                body: payload,
                noCache: true,
            });

            if (response.ok) {
                const data = await response.json();
                if (data?.imageUrl) return data.imageUrl;
                lastError = new Error('Render response missing an imageUrl');
            } else {
                lastError = new Error(`Render failed with status ${response.status}`);
            }
        } catch (error) {
            lastError = error;
        }

        if (attempt < RENDER_MAX_ATTEMPTS) await sleep(RENDER_RETRY_DELAY_MS);
    }

    throw lastError;
}

async function searchCatalog({ keyword, categoryId, subcategoryId, cursor }) {
    const params = new URLSearchParams({
        limit: String(SEARCH_LIMIT),
        sortType: '3',
    });
    if (keyword) params.set('keyword', keyword);
    if (categoryId) params.set('category', categoryId);
    if (subcategoryId) params.set('subcategory', subcategoryId);
    if (cursor) params.set('cursor', cursor);

    return callRobloxApiJson({
        subdomain: 'catalog',
        endpoint: `/v1/search/items/details?${params.toString()}`,
    });
}

async function resolveAssetDetails(assetId) {
    const response = await callRobloxApi({
        subdomain: 'catalog',
        endpoint: '/v1/catalog/items/details',
        method: 'POST',
        body: { items: [{ itemType: 'Asset', id: assetId }] },
    });

    if (!response.ok) return null;
    const data = await response.json();
    const detail = data?.data?.[0];
    if (!detail?.assetType?.id) return null;

    return {
        id: detail.id,
        name: detail.name,
        assetType: { id: detail.assetType.id, name: detail.assetType.name },
        currentVersionId: detail.currentVersionId ?? detail.assetVersionId ?? null,
    };
}

async function resolveBundleAssets(bundleId) {
    const bundleDetails = await callRobloxApiJson({
        subdomain: 'catalog',
        endpoint: `/v1/bundles/${bundleId}/details`,
    });

    const bundledAssetRefs = (bundleDetails?.items || []).filter((item) => item.type === 'Asset');
    if (bundledAssetRefs.length === 0) return [];

    const detailsResponse = await callRobloxApi({
        subdomain: 'catalog',
        endpoint: '/v1/catalog/items/details',
        method: 'POST',
        body: {
            items: bundledAssetRefs.map((item) => ({ itemType: 'Asset', id: item.id })),
        },
    });

    if (!detailsResponse.ok) return [];
    const detailsData = await detailsResponse.json();

    return (detailsData?.data || [])
        .filter((item) => item.assetType?.id)
        .map((item) => ({
            id: item.id,
            name: item.name,
            assetType: { id: item.assetType.id, name: item.assetType.name },
            currentVersionId: item.currentVersionId ?? item.assetVersionId ?? null,
        }));
}

function isExclusiveAssetType(assetTypeId) {
    return EXCLUSIVE_ASSET_TYPE_IDS.has(Number(assetTypeId));
}

function toggleAssetEquip(sandboxState, asset) {
    const existingIndex = sandboxState.assets.findIndex((a) => a.id === asset.id);
    if (existingIndex !== -1) {
        sandboxState.assets.splice(existingIndex, 1);
        return { equipped: false };
    }

    const assetTypeId = Number(asset.assetType?.id);
    if (isExclusiveAssetType(assetTypeId)) {
        sandboxState.assets = sandboxState.assets.filter(
            (a) => Number(a.assetType?.id) !== assetTypeId,
        );
    } else {
        const countOfType = sandboxState.assets.filter(
            (a) => Number(a.assetType?.id) === assetTypeId,
        ).length;
        if (countOfType >= MAX_PER_STACKABLE_TYPE) {
            return { equipped: false, limitReached: true };
        }
    }

    sandboxState.assets.push(asset);
    return { equipped: true };
}

function createItemCard(item, thumbnail) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'rovalra-avatar-sandbox-card';

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'rovalra-item-thumb-container';
    const thumbEl = createThumbnailElement(thumbnail, item.name, 'rovalra-item-thumb');
    thumbContainer.appendChild(thumbEl);

    const name = document.createElement('div');
    name.className = 'rovalra-item-name';
    name.textContent = item.name;

    card.append(thumbContainer, name);
    return card;
}

function buildCategoryItems(categories) {
    const items = [{ value: '', label: ts('avatarSandbox.allCategories') }];
    categories
        .filter((category) => category.isSearchable !== false && category.categoryId)
        .forEach((category) => {
            items.push({ value: String(category.categoryId), label: category.name || category.category });
        });
    return items;
}

function buildSubcategoryItems(category) {
    const items = [{ value: '', label: ts('avatarSandbox.allSubcategories') }];
    (category?.subcategories || []).forEach((sub) => {
        const subId = sub.subcategoryId ?? sub.id;
        if (!subId) return;
        items.push({ value: String(subId), label: sub.name || sub.subcategory });
    });
    return items;
}

async function openSandbox() {
    if (overlayOpen) return;
    overlayOpen = true;

    const body = document.createElement('div');
    body.className = 'rovalra-avatar-sandbox-body';

    const previewPane = document.createElement('div');
    previewPane.className = 'rovalra-avatar-sandbox-preview';

    const previewFrame = document.createElement('div');
    previewFrame.className = 'rovalra-avatar-sandbox-preview-frame';

    const previewImage = document.createElement('img');
    previewImage.alt = ts('avatarSandbox.title');
    previewFrame.appendChild(previewImage);

    const previewLoading = createSpinnerContainer({
        size: '32px',
        containerClass: 'rovalra-avatar-sandbox-preview-loading',
    });
    previewFrame.appendChild(previewLoading);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn-secondary-md';
    resetButton.textContent = ts('avatarSandbox.reset');

    previewPane.append(previewFrame, resetButton);

    const browserPane = document.createElement('div');
    browserPane.className = 'rovalra-avatar-sandbox-browser';

    const controlsRow = document.createElement('div');
    controlsRow.className = 'rovalra-avatar-sandbox-controls';

    const { container: searchContainer, input: searchInput } = createStyledInput({
        id: 'rovalra-avatar-sandbox-search',
        label: ts('avatarSandbox.searchPlaceholder'),
        placeholder: ' ',
    });
    searchContainer.classList.add('rovalra-avatar-sandbox-search');

    const categoryDropdownSlot = document.createElement('div');
    const subcategoryDropdownSlot = document.createElement('div');

    controlsRow.append(searchContainer, categoryDropdownSlot, subcategoryDropdownSlot);

    const grid = document.createElement('div');
    grid.className = 'rovalra-avatar-sandbox-grid';

    const loadMoreButton = document.createElement('button');
    loadMoreButton.type = 'button';
    loadMoreButton.className = 'btn-secondary-md rovalra-avatar-sandbox-load-more';
    loadMoreButton.textContent = ts('avatarSandbox.loadMore');
    loadMoreButton.style.display = 'none';

    const equippedSection = document.createElement('div');
    equippedSection.className = 'rovalra-avatar-sandbox-equipped-section';

    const equippedTitle = document.createElement('div');
    equippedTitle.className = 'rovalra-avatar-sandbox-equipped-title';

    const equippedList = document.createElement('div');
    equippedList.className = 'rovalra-avatar-sandbox-equipped-list';

    equippedSection.append(equippedTitle, equippedList);

    browserPane.append(controlsRow, grid, loadMoreButton, equippedSection);
    body.append(previewPane, browserPane);

    createOverlay({
        title: ts('avatarSandbox.title'),
        bodyContent: body,
        maxWidth: '900px',
        maxHeight: 'calc(100vh - 40px)',
        showLogo: true,
        overflowVisible: true,
        onClose: () => {
            overlayOpen = false;
        },
    });

    const sandboxState = {
        baseAvatar: null,
        assets: [],
        categories: [],
        selectedCategoryId: '',
        selectedSubcategoryId: '',
        nextPageCursor: null,
        searchToken: 0,
    };

    let renderTimer = null;
    let renderRequestId = 0;

    function setPreviewLoading(isLoading) {
        previewLoading.style.display = isLoading ? 'flex' : 'none';
    }

    function scheduleRender() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(doRender, RENDER_DEBOUNCE_MS);
    }

    async function doRender() {
        if (!sandboxState.baseAvatar) return;
        const requestId = ++renderRequestId;
        setPreviewLoading(true);
        try {
            const imageUrl = await renderAvatarPreview(sandboxState.baseAvatar, sandboxState.assets);
            if (requestId !== renderRequestId) return;
            previewImage.src = imageUrl;
        } catch {
            if (requestId !== renderRequestId) return;
            showSystemAlert(ts('avatarSandbox.renderFailed'), 'error');
        } finally {
            if (requestId === renderRequestId) setPreviewLoading(false);
        }
    }

    function refreshEquippedList() {
        equippedTitle.textContent = ts('avatarSandbox.equipped', {
            count: sandboxState.assets.length,
        });
        equippedList.innerHTML = '';

        if (sandboxState.assets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'rovalra-avatar-sandbox-empty';
            empty.textContent = ts('avatarSandbox.noneEquipped');
            equippedList.appendChild(empty);
            return;
        }

        sandboxState.assets.forEach((asset) => {
            const chip = document.createElement('div');
            chip.className = 'rovalra-avatar-sandbox-chip';

            const label = document.createElement('span');
            label.textContent = asset.name;
            chip.appendChild(label);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.title = ts('avatarSandbox.remove');
            removeButton.innerHTML = '&times;';
            removeButton.addEventListener('click', () => {
                toggleAssetEquip(sandboxState, asset);
                refreshEquippedList();
                scheduleRender();
            });
            chip.appendChild(removeButton);

            equippedList.appendChild(chip);
        });
    }

    async function handleItemClick(item, card) {
        card.disabled = true;
        try {
            const alreadyEquipped = sandboxState.assets.some((a) => a.id === item.id);

            if (alreadyEquipped) {
                toggleAssetEquip(sandboxState, { id: item.id });
            } else if (item.itemType === 'Bundle') {
                const bundleAssets = await resolveBundleAssets(item.id);
                if (bundleAssets.length === 0) {
                    showSystemAlert(ts('avatarSandbox.equipFailed'), 'error');
                    return;
                }
                bundleAssets.forEach((asset) => toggleAssetEquip(sandboxState, asset));
            } else {
                const asset = item.assetType?.id
                    ? {
                          id: item.id,
                          name: item.name,
                          assetType: { id: item.assetType.id, name: item.assetType.name },
                          currentVersionId: null,
                      }
                    : await resolveAssetDetails(item.id);

                if (!asset) {
                    showSystemAlert(ts('avatarSandbox.equipFailed'), 'error');
                    return;
                }
                toggleAssetEquip(sandboxState, asset);
            }

            refreshEquippedList();
            scheduleRender();
        } catch {
            showSystemAlert(ts('avatarSandbox.equipFailed'), 'error');
        } finally {
            card.disabled = false;
        }
    }

    async function runSearch(reset) {
        const searchToken = reset ? ++sandboxState.searchToken : sandboxState.searchToken;

        if (reset) {
            sandboxState.nextPageCursor = null;
            grid.innerHTML = '';
            grid.appendChild(createShimmerGrid(12));
        }

        loadMoreButton.style.display = 'none';

        let response;
        try {
            response = await searchCatalog({
                keyword: searchInput.value.trim(),
                categoryId: sandboxState.selectedCategoryId,
                subcategoryId: sandboxState.selectedSubcategoryId,
                cursor: reset ? null : sandboxState.nextPageCursor,
            });
        } catch {
            if (searchToken !== sandboxState.searchToken) return;
            if (reset) grid.innerHTML = '';
            const errorText = document.createElement('div');
            errorText.className = 'rovalra-avatar-sandbox-empty';
            errorText.textContent = ts('avatarSandbox.noResults');
            grid.appendChild(errorText);
            return;
        }

        if (searchToken !== sandboxState.searchToken) return;
        if (reset) grid.innerHTML = '';

        const results = response?.data || [];
        sandboxState.nextPageCursor = response?.nextPageCursor || response?.nextCursor || null;

        if (results.length === 0 && reset) {
            const emptyText = document.createElement('div');
            emptyText.className = 'rovalra-avatar-sandbox-empty';
            emptyText.textContent = ts('avatarSandbox.noResults');
            grid.appendChild(emptyText);
            return;
        }

        const assetTargets = results.filter((item) => item.itemType !== 'Bundle');
        const bundleTargets = results.filter((item) => item.itemType === 'Bundle');

        const [assetThumbs, bundleThumbs] = await Promise.all([
            assetTargets.length
                ? fetchThumbnails(assetTargets.map((item) => ({ id: item.id })), 'Asset', '150x150')
                : new Map(),
            bundleTargets.length
                ? fetchThumbnails(bundleTargets.map((item) => ({ id: item.id })), 'BundleThumbnail', '150x150')
                : new Map(),
        ]);

        if (searchToken !== sandboxState.searchToken) return;

        results.forEach((item) => {
            const thumbnail =
                item.itemType === 'Bundle'
                    ? bundleThumbs.get(Number(item.id))
                    : assetThumbs.get(Number(item.id));
            const card = createItemCard(item, thumbnail);
            card.addEventListener('click', () => handleItemClick(item, card));
            grid.appendChild(card);
        });

        loadMoreButton.style.display = sandboxState.nextPageCursor ? 'inline-flex' : 'none';
    }

    let searchDebounceTimer = null;
    searchInput.addEventListener('input', () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => runSearch(true), SEARCH_DEBOUNCE_MS);
    });

    loadMoreButton.addEventListener('click', () => runSearch(false));

    resetButton.addEventListener('click', () => {
        if (!sandboxState.baseAvatar) return;
        sandboxState.assets = (sandboxState.baseAvatar.assets || []).map((asset) => ({ ...asset }));
        refreshEquippedList();
        scheduleRender();
    });

    let subcategoryDropdown = null;
    function mountSubcategoryDropdown(category) {
        if (subcategoryDropdown) {
            subcategoryDropdown.destroy();
            subcategoryDropdown = null;
        }
        sandboxState.selectedSubcategoryId = '';
        subcategoryDropdown = createDropdown({
            items: buildSubcategoryItems(category),
            initialValue: '',
            placeholder: ts('avatarSandbox.allSubcategories'),
            onValueChange: (value) => {
                sandboxState.selectedSubcategoryId = value;
                runSearch(true);
            },
        });
        subcategoryDropdownSlot.innerHTML = '';
        subcategoryDropdownSlot.appendChild(subcategoryDropdown.element);
    }

    function mountCategoryDropdown() {
        categoryDropdownSlot.innerHTML = '';
        const categoryDropdown = createDropdown({
            items: buildCategoryItems(sandboxState.categories),
            initialValue: '',
            placeholder: ts('avatarSandbox.allCategories'),
            onValueChange: (value) => {
                sandboxState.selectedCategoryId = value;
                const category = sandboxState.categories.find(
                    (cat) => String(cat.categoryId) === value,
                );
                mountSubcategoryDropdown(category);
                runSearch(true);
            },
        });
        categoryDropdownSlot.appendChild(categoryDropdown.element);
    }

    mountCategoryDropdown();
    mountSubcategoryDropdown(null);

    refreshEquippedList();
    grid.appendChild(createShimmerGrid(12));

    try {
        const userId = await getAuthenticatedUserId();
        const [avatarData, categories] = await Promise.all([
            getCurrentAvatar(userId),
            getAllCategories(),
        ]);

        sandboxState.baseAvatar = avatarData;
        sandboxState.assets = (avatarData.assets || []).map((asset) => ({ ...asset }));
        sandboxState.categories = categories;

        mountCategoryDropdown();

        refreshEquippedList();
        doRender();
        runSearch(true);
    } catch {
        grid.innerHTML = '';
        const errorText = document.createElement('div');
        errorText.className = 'rovalra-avatar-sandbox-empty';
        errorText.textContent = ts('avatarSandbox.noResults');
        grid.appendChild(errorText);
    }
}

function injectButton(container) {
    if (container.querySelector('.rovalra-avatar-sandbox-btn')) return;

    const li = document.createElement('li');
    li.style.float = 'left';
    li.style.marginLeft = '5px';
    li.style.display = 'flex';
    li.style.alignItems = 'center';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary-xs rovalra-avatar-sandbox-btn';
    button.textContent = ts('avatarSandbox.button');
    button.addEventListener('click', () => openSandbox());

    li.appendChild(button);
    container.appendChild(li);
}

export function init() {
    if (!window.location.pathname.includes('/my/avatar')) return;

    chrome.storage.local.get('avatarSandboxEnabled', (data) => {
        if (!data.avatarSandboxEnabled) return;
        observeElement('.breadcrumb-container', injectButton, { multiple: true });
    });
}
