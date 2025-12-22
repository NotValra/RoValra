import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { fetchThumbnails, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import { createAvatarFilterUI } from '../../core/ui/FiltersUI.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createButton } from '../../core/ui/buttons.js';
import { createItemCard } from '../../core/ui/items/items.js';
import DOMPurify from 'dompurify';


const CSS = `
    .rovalra-checker-container {
        width: 100%;
        margin: 20px auto;
        display: flex;
        flex-direction: column;
        gap: 15px;
    }
    .rovalra-checker-tabs {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-bottom: 15px;
        width: 100%;
    }
    #rovalra-fx-container {
    margin-bottom: 10px !Important
    }
    .rovalra-checker-tab {
        flex: 1;
        text-align: center;
        padding: 8px 16px;
        cursor: pointer;
        border-radius: 8px;
        font-weight: 600;
        background-color: var(--rovalra-container-background-color);
        color: var(--rovalra-secondary-text-color);
        transition: all 0.2s ease;
    }
    .rovalra-checker-tab.active {
        background-color: rgb(51, 95, 255);
        color: white;
        border-color: rgb(51, 95, 255);
    }
    .rovalra-results-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 10px;
        width: 100%;
    }
    .rovalra-status-text {
        text-align: center;
        font-weight: 500;
        margin-top: 5px;
    }
    #rovalra-fx-dropdown .padding-x-large {
        padding-left: 24px !important;
        padding-right: 24px !important;
        padding-top: 16px !important;
    }
`;

function injectStyles() {
    if (document.getElementById('rovalra-item-checker-styles')) return;
    const style = document.createElement('style');
    style.id = 'rovalra-item-checker-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
}

const getUserId = () => {
    const match = window.location.pathname.match(/^\/(?:[a-z]{2}\/)?users\/(\d+)/);
    return match ? match[1] : null;
};

async function getUserDisplayName(userId) {
    try {
        const response = await callRobloxApi({ subdomain: 'users', endpoint: `/v1/users/${userId}` });
        const data = await response.json();
        return data.displayName || data.name;
    } catch {
        return 'User';
    }
}

async function checkItemOwnership(userId, itemId, itemType = 'Asset') {
    const endpoint = itemType === 'Bundle' 
        ? `/v1/users/${userId}/items/Bundle/${itemId}`
        : `/v1/users/${userId}/items/Asset/${itemId}`;

    try {
        const response = await callRobloxApi({
            subdomain: 'inventory',
            endpoint: endpoint
        });

        if (response.status === 404) return false;
        if (!response.ok) return false;

        const data = await response.json();
        return data && data.data && data.data.length > 0;
    } catch (error) {
        return false;
    }
}

async function fetchItemDetails(itemId, itemType) {
    try {
        if (itemType === 'Bundle') {
            const endpoint = `/v1/bundles/${itemId}/details`;
            const response = await callRobloxApi({ subdomain: 'catalog', endpoint });
            if (!response.ok) return null;
            return await response.json();
        } else {
            const endpoint = `/v2/assets/${itemId}/details`;
            const response = await callRobloxApi({ subdomain: 'economy', endpoint });
            if (!response.ok) return null;
            const data = await response.json();
            if (data) data.name = data.Name;
            return data;
        }
    } catch {
        return null;
    }
}

async function injectItemChecker(container) {
    if (container.querySelector('#rovalra-item-checker-container')) return;
    injectStyles();

    const userId = getUserId();
    if (!userId) return;

    const displayName = await getUserDisplayName(userId);

    const wrapper = document.createElement('div');
    wrapper.id = 'rovalra-item-checker-container';
    wrapper.className = 'rovalra-checker-container';

    const explanation = document.createElement('p');
    explanation.className = 'text-label';
    explanation.style.textAlign = 'center';
    explanation.textContent = `Check if ${displayName} owns specific items`;
    wrapper.appendChild(explanation);

    const controlsContainer = document.createElement('div');
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.gap = '10px';
    controlsContainer.style.maxWidth = '400px';
    controlsContainer.style.width = '100%';
    controlsContainer.style.margin = '0 auto';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.gap = '10px';
    topRow.style.alignItems = 'center';

    const { container: inputContainer, input: idInput } = createStyledInput({
        id: 'rovalra-check-item-id',
        label: 'Item ID',
        placeholder: ' '
    });
    inputContainer.style.flexGrow = '1';

    const checkBtn = createButton('Check', 'secondary');
    checkBtn.style.height = '40px';
    checkBtn.style.width = '100%';
    checkBtn.style.marginBottom = '0';

    const statusText = document.createElement('div');
    statusText.className = 'rovalra-status-text';
    statusText.style.display = 'none';

    checkBtn.onclick = async () => {
        const itemId = idInput.value.trim();
        if (!itemId) return;

        checkBtn.disabled = true;
        checkBtn.textContent = '...';
        statusText.style.display = 'none';


        let owned = await checkItemOwnership(userId, itemId, 'Asset');
        let details = await fetchItemDetails(itemId, 'Asset');
        
        if (!details) {
            owned = await checkItemOwnership(userId, itemId, 'Bundle');
            details = await fetchItemDetails(itemId, 'Bundle');
        }

        checkBtn.disabled = false;
        checkBtn.textContent = 'Check';

        if (details) {
            statusText.textContent = owned 
                ? `${displayName} owns "${details.name}"` 
                : `${displayName} does not own "${details.name}"`;
            statusText.style.color = owned ? 'var(--rovalra-main-text-color)' : 'var(--rovalra-secondary-text-color)';
        } else {
            statusText.textContent = 'Invalid Item ID or Error';
            statusText.style.color = 'var(--rovalra-secondary-text-color)';
        }
        statusText.style.display = 'block';
    };

    wrapper.append(controlsContainer, statusText);

    const filterConfig = [
        { id: 'rovalra-check-creator', label: 'Creator Name', type: 'text' },
        { id: 'rovalra-check-minprice', label: 'Min Price', type: 'number', min: 0 },
        { 
            id: 'rovalra-check-limiteds', 
            label: 'Limiteds', 
            type: 'toggle',
            onChange: (isChecked) => {
                if (isChecked) {
                    const el = document.getElementById('rovalra-check-recent');
                    if (el && el.setChecked) el.setChecked(false);
                }
            }
        },
        { 
            id: 'rovalra-check-recent', 
            label: 'Recently Published', 
            type: 'toggle',
            onChange: (isChecked) => {
                if (isChecked) {
                    const el = document.getElementById('rovalra-check-limiteds');
                    if (el && el.setChecked) el.setChecked(false);
                }
            }
        },
        { id: 'rovalra-check-offsale', label: 'Include Offsale', type: 'toggle', initialValue: true },
        {
            id: 'rovalra-check-limit', label: 'Limit', type: 'dropdown',
            options: [
                { value: '120', label: '120' },
                { value: '240', label: '240' },
                { value: '480', label: '480' }
            ],
            initialValue: '120'
        }
    ];

    const resultsContainer = document.createElement('div');
    resultsContainer.style.marginTop = '20px';
    
    const tabs = document.createElement('div');
    tabs.className = 'rovalra-checker-tabs';
    tabs.style.display = 'none';
    
    const ownedTab = document.createElement('div');
    ownedTab.className = 'rovalra-checker-tab active';
    ownedTab.textContent = 'Owned';
    
    const unownedTab = document.createElement('div');
    unownedTab.className = 'rovalra-checker-tab';
    unownedTab.textContent = 'Unowned';

    const ownedGrid = document.createElement('div');
    ownedGrid.className = 'rovalra-results-grid';
    
    const unownedGrid = document.createElement('div');
    unownedGrid.className = 'rovalra-results-grid';
    unownedGrid.style.display = 'none';

    ownedTab.onclick = () => {
        ownedTab.classList.add('active');
        unownedTab.classList.remove('active');
        ownedGrid.style.display = 'grid';
        unownedGrid.style.display = 'none';
    };

    unownedTab.onclick = () => {
        unownedTab.classList.add('active');
        ownedTab.classList.remove('active');
        unownedGrid.style.display = 'grid';
        ownedGrid.style.display = 'none';
    };

    tabs.append(ownedTab, unownedTab);
    resultsContainer.append(tabs, ownedGrid, unownedGrid);

    const performScan = async (creatorName, minPrice, limiteds, recent, offsale, limit) => {
        const applyBtn = document.getElementById('rovalra-price-apply-btn');
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Scanning...';
        }

        ownedGrid.innerHTML = '';
        unownedGrid.innerHTML = '';
        tabs.style.display = 'none';
        statusText.style.display = 'block';
        statusText.textContent = 'Scanning catalog...';
        statusText.style.color = 'var(--rovalra-secondary-text-color)';

        try {
            let items = [];
            let cursor = '';
            let fetchedCount = 0;
            
            let sortType = recent ? 3 : 1; 
            let categoryFilter = limiteds ? 2 : 1; 

            while (fetchedCount < limit) {
                let url = `/v2/search/items/details?limit=120&cursor=${cursor}`;
                if (creatorName) url += `&creatorName=${encodeURIComponent(creatorName)}`;
                if (minPrice) url += `&minPrice=${minPrice}`;
                if (offsale) url += `&includeNotForSale=true`;
                
                if (recent) {
                    url += `&sortType=3`; 
                } else if (limiteds) {
                    url += `&categoryFilter=2`;
                }

                const res = await callRobloxApi({ subdomain: 'catalog', endpoint: url });
                if (!res.ok) break;
                
                const data = await res.json();
                if (data.data) {
                    items = items.concat(data.data);
                    fetchedCount += data.data.length;
                }
                
                cursor = data.nextPageCursor;
                if (!cursor) break;
            }

            items = items.slice(0, limit);
            statusText.textContent = `Checking ownership of ${items.length} items...`;

            const ownershipPromises = items.map(async (item) => {
                const owned = await checkItemOwnership(userId, item.id, item.itemType);
                return { item, owned };
            });

            const results = await Promise.all(ownershipPromises);
            
            const ownedItems = results.filter(r => r.owned).map(r => r.item);
            const unownedItems = results.filter(r => !r.owned).map(r => r.item);

            const renderItems = async (itemList, grid) => {
                if (itemList.length === 0) {
                    grid.innerHTML = DOMPurify.sanitize('<p style="grid-column: 1/-1; text-align: center; color: var(--rovalra-secondary-text-color);">No items found.</p>');
                    return;
                }

                const assets = itemList.filter(i => i.itemType !== 'Bundle');
                const bundles = itemList.filter(i => i.itemType === 'Bundle');

                const thumbPromises = [];
                if (assets.length) thumbPromises.push(fetchThumbnails(assets.map(i => ({ id: i.id })), 'Asset', '150x150'));
                if (bundles.length) thumbPromises.push(fetchThumbnails(bundles.map(i => ({ id: i.id })), 'BundleThumbnail', '150x150'));

                const thumbResults = await Promise.all(thumbPromises);
                const thumbMap = new Map();
                thumbResults.forEach(map => {
                    for (const [k, v] of map) thumbMap.set(k, v);
                });

                itemList.forEach(item => {
                    let displayPrice = item.lowestPrice;
                    if (displayPrice === undefined || displayPrice === null) displayPrice = item.lowestResalePrice;
                    if (displayPrice === undefined || displayPrice === null) displayPrice = item.price;

                    let priceText = null;
                    let recentAveragePrice = 0;

                    if (displayPrice === 0) {
                        priceText = 'Free';
                    } else if (displayPrice === undefined || displayPrice === null) {
                        priceText = 'Offsale';
                    } else {
                        recentAveragePrice = displayPrice;
                    }

                    const itemData = { ...item, assetId: item.id, recentAveragePrice, priceText, itemType: item.itemType };
                    const card = createItemCard(itemData, thumbMap, { showOnHold: false, showSerial: false });
                    card.style.width = '100%';
                    grid.appendChild(card);
                });
            };

            await Promise.all([
                renderItems(ownedItems, ownedGrid),
                renderItems(unownedItems, unownedGrid)
            ]);

            tabs.style.display = 'flex';
            statusText.textContent = `Found ${ownedItems.length} owned items.`;
            statusText.style.color = 'var(--rovalra-main-text-color)';

        } catch (e) {
            console.error(e);
            statusText.textContent = 'Error scanning items.';
            statusText.style.color = 'var(--rovalra-secondary-text-color)';
        } finally {
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Apply Filter';
            }
        }
    };

    const onApplyFilters = () => {
        const creatorInput = document.getElementById('rovalra-check-creator');
        const creatorName = creatorInput?.value || '';
        const minPrice = document.getElementById('rovalra-check-minprice')?.value || '';
        const limiteds = document.getElementById('rovalra-check-limiteds')?.getAttribute('aria-checked') === 'true';
        const recent = document.getElementById('rovalra-check-recent')?.getAttribute('aria-checked') === 'true';
        const offsale = document.getElementById('rovalra-check-offsale')?.getAttribute('aria-checked') === 'true';
        const limit = parseInt(document.getElementById('rovalra-check-limit')?.value || '120');

        if (!creatorName && !recent) {
            if (creatorInput) {
                const base = creatorInput.closest('.rovalra-catalog-input-base');
                const fieldset = base?.querySelector('.rovalra-catalog-input-fieldset');
                if (fieldset) {
                    fieldset.style.borderColor = '#d32f2f';
                    fieldset.style.borderWidth = '2px';
                    const clearError = () => {
                        fieldset.style.borderColor = '';
                        fieldset.style.borderWidth = '';
                        creatorInput.removeEventListener('input', clearError);
                    };
                    creatorInput.addEventListener('input', clearError);
                }
            }
            return false;
        }

        performScan(creatorName, minPrice, limiteds, recent, offsale, limit);
        return true;
    };

    const filterUI = createAvatarFilterUI({
        avatarFiltersEnabled: true,
        searchbarEnabled: false,
        onApply: onApplyFilters,
        filterConfig: filterConfig
    });

    filterUI.style.marginBottom = '0';
    filterUI.style.flexShrink = '0';

    const toggleBtn = filterUI.querySelector('#rovalra-fx-toggle-btn');
    if (toggleBtn) {
        toggleBtn.style.width = 'auto';
        toggleBtn.style.minWidth = '100px';
        toggleBtn.style.height = '40px';
        toggleBtn.querySelector('span').textContent = 'Filter';
    }

    topRow.append(inputContainer, filterUI);
    controlsContainer.append(topRow, checkBtn);
    wrapper.append(resultsContainer);

    container.appendChild(wrapper);
}

export function init() {
    chrome.storage.local.get({ privateInventoryEnabled: false }, (settings) => {
        if (settings.privateInventoryEnabled) {
            observeElement('div.section-content-off:not(.btr-section-content-off)', injectItemChecker);
        }
    });
}
