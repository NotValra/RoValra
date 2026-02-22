import { callRobloxApi } from '../../../core/api.js';
import { observeElement, observeAttributes } from '../../../core/observer.js';
import { fetchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { createDevProductCard } from '../../../core/ui/games/devProductsUI.js';
import { createButton } from '../../../core/ui/buttons.js';
import { createDropdown } from '../../../core/ui/dropdown.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { createScrollButtons } from '../../../core/ui/general/scrollButtons.js';

async function fetchUniverseId(placeId) {
    const metaData = document.getElementById('game-detail-meta-data');
    if (metaData && metaData.dataset.universeId) {
        return metaData.dataset.universeId;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            method: 'GET'
        });

        if (!response.ok) throw new Error('Failed to fetch universe ID');
        const data = await response.json();
        return data?.[0]?.universeId;
    } catch (error) {
        console.error('RoValra: Error fetching universe ID', error);
        return null;
    }
}

async function fetchDevProducts(universeId) {
    let allProducts = [];
    let cursor = null;

    try {
        do {
            const endpoint = `/developer-products/v2/universes/${universeId}/developerproducts?limit=100` + (cursor ? `&cursor=${cursor}` : '');
            const response = await callRobloxApi({
                subdomain: 'apis',
                endpoint: endpoint,
                method: 'GET'
            });

            if (!response.ok) throw new Error('Failed to fetch developer products');
            const data = await response.json();
            
            if (data?.developerProducts) {
                allProducts = allProducts.concat(data.developerProducts);
            }
            
            cursor = data?.nextPageCursor;
        } while (cursor);

        return allProducts;
    } catch (error) {
        console.error('RoValra: Error fetching developer products', error);
        return allProducts;
    }
}

async function loadAndRenderProducts(storeTab, placeId) {
    if (storeTab.dataset.rovalraDevProductsLoaded === 'true') return;
    storeTab.dataset.rovalraDevProductsLoaded = 'true';

    const universeId = await fetchUniverseId(placeId);
    if (!universeId) return;

    const products = await fetchDevProducts(universeId);
    if (!products || products.length === 0) return;

    let gamePassesContainer = storeTab.querySelector('#roseal-game-passes') || storeTab.querySelector('#rbx-game-passes');
    let passesList = gamePassesContainer ? gamePassesContainer.querySelector('ul.store-cards') : null;
    let headerContainer = gamePassesContainer ? gamePassesContainer.querySelector('.container-header') : null;
    let rosealFilters = gamePassesContainer ? gamePassesContainer.querySelector('.store-item-filters') : null;
    let noPassesMessage = gamePassesContainer ? gamePassesContainer.querySelector('.section-content-off') : null;

    if (!gamePassesContainer) {
        gamePassesContainer = document.createElement('div');
        gamePassesContainer.id = 'rbx-game-passes';
        gamePassesContainer.className = 'container-list game-dev-store game-passes';
        
        headerContainer = document.createElement('div');
        headerContainer.className = 'container-header';
        
        passesList = document.createElement('ul');
        passesList.id = 'rbx-passes-container';
        passesList.className = 'hlist store-cards gear-passes-container';
        
        gamePassesContainer.appendChild(headerContainer);
        gamePassesContainer.appendChild(passesList);
        storeTab.appendChild(gamePassesContainer);
    } else {
        if (!headerContainer) {
            headerContainer = document.createElement('div');
            headerContainer.className = 'container-header';
            gamePassesContainer.prepend(headerContainer);
        }
        if (!passesList) {
            passesList = document.createElement('ul');
            passesList.id = 'rbx-passes-container';
            passesList.className = 'hlist store-cards gear-passes-container';
            gamePassesContainer.appendChild(passesList);
        }
    }

    const devProductsList = document.createElement('ul');
    devProductsList.className = 'hlist store-cards rovalra-dev-products-container';
    devProductsList.style.display = 'none';
    

    const paginationContainer = document.createElement('div');
    paginationContainer.style.display = 'none';
    paginationContainer.style.justifyContent = 'center';
    paginationContainer.style.alignItems = 'center';
    paginationContainer.style.marginTop = '15px';
    paginationContainer.style.gap = '15px';

    const ITEMS_PER_PAGE = 58;
    let currentPage = 0;
    let currentSortedItems = [];
    let renderId = 0;
    const globalThumbnailMap = new Map();

    const updatePaginationControls = () => {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(currentSortedItems.length / ITEMS_PER_PAGE);
        
        if (totalPages <= 1) return;

        const { leftButton, rightButton } = createScrollButtons({
            onLeftClick: () => {
                if (currentPage > 0) {
                    currentPage--;
                    renderPage();
                }
            },
            onRightClick: () => {
                if (currentPage < totalPages - 1) {
                    currentPage++;
                    renderPage();
                }
            }
        });

        if (currentPage === 0) {
            leftButton.style.opacity = '0.5';
            leftButton.style.cursor = 'default';
        }
        if (currentPage >= totalPages - 1) {
            rightButton.style.opacity = '0.5';
            rightButton.style.cursor = 'default';
        }

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `${currentPage + 1} / ${totalPages}`;
        pageInfo.className = 'text-secondary';
        pageInfo.style.fontWeight = '500';

        paginationContainer.appendChild(leftButton);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(rightButton);
    };

    const renderPage = async () => {
        const currentRenderId = ++renderId;
        devProductsList.innerHTML = '';
        
        const start = currentPage * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = currentSortedItems.slice(start, end);

        const cardMap = new Map();

        pageItems.forEach(product => {
            const hasIcon = product.IconImageAssetId && product.IconImageAssetId > 0;
            let thumbnailData = hasIcon ? { state: 'Pending' } : { state: 'Broken' };

            if (hasIcon && globalThumbnailMap.has(product.IconImageAssetId)) {
                thumbnailData = globalThumbnailMap.get(product.IconImageAssetId);
            }

            const card = createDevProductCard({
                id: product.ProductId,
                name: product.Name,
                price: product.PriceInRobux,
                thumbnail: thumbnailData,
                universeId
            });
            devProductsList.appendChild(card);
            cardMap.set(product.ProductId, card);
        });
        
        updatePaginationControls();

        const productsToFetch = pageItems.filter(p => 
            p.IconImageAssetId > 0 && !globalThumbnailMap.has(p.IconImageAssetId)
        );

        if (productsToFetch.length === 0) return;

        const thumbnailMap = await fetchThumbnails(
            productsToFetch.map(p => ({ id: p.IconImageAssetId })),
            'Asset',
            '150x150'
        );

        if (currentRenderId !== renderId) return;

        productsToFetch.forEach(product => {
            const thumbData = thumbnailMap.get(product.IconImageAssetId);
            const oldCard = cardMap.get(product.ProductId);
            
            if (thumbData) {
                globalThumbnailMap.set(product.IconImageAssetId, thumbData);

                if ((thumbData.state === 'Pending' || thumbData.state === 'InReview') && thumbData.finalUpdate) {
                    thumbData.finalUpdate.then(finalData => {
                        if (finalData) {
                            globalThumbnailMap.set(product.IconImageAssetId, finalData);
                        }
                    });
                }

                if (oldCard) {
                const newCard = createDevProductCard({
                    id: product.ProductId,
                    name: product.Name,
                    price: product.PriceInRobux,
                    thumbnail: thumbData,
                    universeId
                });
                oldCard.replaceWith(newCard);
                }
            }
        });
    };

    const renderProducts = (items) => {
        currentSortedItems = items;
        currentPage = 0;
        renderPage();
    };

    gamePassesContainer.appendChild(devProductsList);
    gamePassesContainer.appendChild(paginationContainer);

    headerContainer.innerHTML = '';
    const controlsDiv = document.createElement('div');
    controlsDiv.style.display = 'flex';
    controlsDiv.style.gap = '10px';
    controlsDiv.style.alignItems = 'center';
    controlsDiv.style.marginBottom = '12px';

    const hasPasses = passesList.children.length > 0;

    let currentSortField = 'Created';
    let currentSortOrder = 'Desc';
    let currentSearchTerm = '';

    const sortProducts = () => {
        let items = [...products];
        const trimmedSearch = currentSearchTerm ? currentSearchTerm.trim() : '';

        if (trimmedSearch) {
            const terms = trimmedSearch.toLowerCase().split(/\s+/);
            items = items.filter(p => {
                const name = (p.Name || '').toLowerCase();
                return terms.every(term => name.includes(term));
            });
        }

        const sorted = items.sort((a, b) => {
            let valA, valB;
            switch (currentSortField) {
                case 'Price':
                    valA = a.PriceInRobux ?? 0;
                    valB = b.PriceInRobux ?? 0;
                    break;
                case 'Name':
                    valA = (a.Name || '').toLowerCase();
                    valB = (b.Name || '').toLowerCase();
                    break;
                case 'Updated':
                    valA = a.Updated ? new Date(a.Updated).getTime() : 0;
                    valB = b.Updated ? new Date(b.Updated).getTime() : 0;
                    break;
                case 'Created':
                default:
                    valA = a.ProductId ?? 0;
                    valB = b.ProductId ?? 0;
                    break;
            }

            if (valA < valB) return currentSortOrder === 'Asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'Asc' ? 1 : -1;
            return 0;
        });
        renderProducts(sorted);
    };

    const sortFieldDropdown = createDropdown({
        items: [
            { value: 'Created', label: 'Sort by Created' },
            { value: 'Price', label: 'Sort by Price' },
            { value: 'Updated', label: 'Sort by Updated' },
            { value: 'Name', label: 'Sort by Name' }
        ],
        initialValue: 'Created',
        onValueChange: (value) => {
            currentSortField = value;
            sortProducts();
        }
    });

    const sortOrderDropdown = createDropdown({
        items: [
            { value: 'Asc', label: 'Sort Ascending' },
            { value: 'Desc', label: 'Sort Descending' }
        ],
        initialValue: 'Desc',
        onValueChange: (value) => {
            currentSortOrder = value;
            sortProducts();
        }
    });
    
    const searchInput = createStyledInput({
        id: 'rovalra-dev-product-search',
        label: 'Search',
        placeholder: ' '
    });
    searchInput.container.style.width = '250px';
    searchInput.input.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value;
        sortProducts();
    });

    let passesTab, devTab;
    
    const filterWrapper = document.createElement('div');
    filterWrapper.style.marginBottom = '10px';
    filterWrapper.style.display = 'flex';
    filterWrapper.style.gap = '10px';
    filterWrapper.appendChild(searchInput.container);
    filterWrapper.appendChild(sortFieldDropdown.element);
    filterWrapper.appendChild(sortOrderDropdown.element);

    const updateTabState = (isPasses) => {
        if (isPasses) {
            passesList.style.display = '';
            if (rosealFilters) rosealFilters.style.display = '';
            if (noPassesMessage) noPassesMessage.style.display = '';
            devProductsList.style.display = 'none';
            paginationContainer.style.display = 'none';
            filterWrapper.style.display = 'none';
            passesTab.className = 'btn-primary-md rovalra-ui-btn rovalra-btn-primary';
            devTab.className = 'btn-control-md rovalra-ui-btn rovalra-btn-secondary';
        } else {
            passesList.style.display = 'none';
            if (rosealFilters) rosealFilters.style.display = 'none';
            if (noPassesMessage) noPassesMessage.style.display = 'none';
            devProductsList.style.display = '';
            paginationContainer.style.display = 'flex';
            filterWrapper.style.display = 'flex';
            passesTab.className = 'btn-control-md rovalra-ui-btn rovalra-btn-secondary';
            devTab.className = 'btn-primary-md rovalra-ui-btn rovalra-btn-primary';
        }
    };

    passesTab = createButton('Passes', hasPasses ? 'primary' : 'secondary', {
        onClick: () => updateTabState(true)
    });
    
    devTab = createButton('Developer Products', !hasPasses ? 'primary' : 'secondary', {
        onClick: () => updateTabState(false)
    });

    if (hasPasses) {
        passesList.style.display = '';
        if (rosealFilters) rosealFilters.style.display = '';
        if (noPassesMessage) noPassesMessage.style.display = '';
        devProductsList.style.display = 'none';
        paginationContainer.style.display = 'none';
        filterWrapper.style.display = 'none';
    } else {
        passesList.style.display = 'none';
        if (rosealFilters) rosealFilters.style.display = 'none';
        if (noPassesMessage) noPassesMessage.style.display = 'none';
        devProductsList.style.display = '';
        paginationContainer.style.display = 'flex';
        filterWrapper.style.display = 'flex';
    }

    controlsDiv.appendChild(passesTab);
    controlsDiv.appendChild(devTab);
    headerContainer.appendChild(controlsDiv);
    headerContainer.appendChild(filterWrapper);
    
    sortProducts();
}

export function init() {
    chrome.storage.local.get({ EnableDevProducts: true }, (settings) => {
        if (!settings.EnableDevProducts) return;

        observeElement('.tab-pane.store', (storeTab) => {
            const placeId = getPlaceIdFromUrl();
            if (!placeId) return;

            const checkActive = () => {
                if (storeTab.classList.contains('active')) {
                    loadAndRenderProducts(storeTab, placeId);
                }
            };

            checkActive();
            observeAttributes(storeTab, (mutation) => {
                if (mutation.attributeName === 'class') {
                    checkActive();
                }
            }, ['class']);
        });
    });
}
