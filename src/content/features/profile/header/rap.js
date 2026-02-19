import { observeElement } from '../../../core/observer.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { callRobloxApi } from '../../../core/api.js';
import { createItemCard } from '../../../core/ui/items/items.js';
import { fetchThumbnails as fetchThumbnailsBatch } from '../../../core/thumbnail/thumbnails.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getUsernameFromPageData, getDisplayNameFromPageData } from '../../../core/utils.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { createProfileHeaderButton } from '../../../core/ui/profile/header/button.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import DOMPurify from 'dompurify';

const userCollectiblesCache = new Map();
const itemThumbnailCache = new Map();
const rapDisplayIdentifier = 'rovalra-user-rap-display';


export function getOrCreateRovalraContainer(observedElement) {
    const CONTAINER_ID = 'rovalra-profile-button-container';
    const isNewLayout = observedElement.classList.contains('profile-header-names');

    const parentToCheck = isNewLayout ? observedElement : observedElement.parentElement;
    let rovalraContainer = parentToCheck.querySelector(`.${CONTAINER_ID}`);

    if (!rovalraContainer) {
        rovalraContainer = document.createElement('div');
        rovalraContainer.className = CONTAINER_ID;

        if (isNewLayout) {
            Object.assign(rovalraContainer.style, {
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-start',
                marginTop: '12px' 
            });
            observedElement.appendChild(rovalraContainer);
        } else {
            Object.assign(rovalraContainer.style, {
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-start'
            });
            observedElement.insertAdjacentElement('afterend', rovalraContainer);
        }
    }
    return rovalraContainer;
}


async function fetchUserCollectibles(userId) {
    if (userCollectiblesCache.has(userId)) return userCollectiblesCache.get(userId);

    let totalRap = 0;
    let allItems = [];
    let cursor = '';
    const limit = 100;
    let retries = 0;
    const maxRetries = Infinity;

    try {
        do {
            let response;
            try {
                response = await callRobloxApi({
                    subdomain: 'inventory',
                    endpoint: `/v1/users/${userId}/assets/collectibles?sortOrder=Asc&limit=${limit}&cursor=${cursor}`,
                    method: 'GET',
                });
            } catch (e) {
                if (retries < maxRetries) {
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                    continue; 
                }
                throw e; 
            }

            if (response.status === 429) { 
                const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
                console.warn(`RoValra (RAP): Rate limited. Retrying after ${retryAfter} seconds.`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue; 
            }
            if (response.status === 403) return 'Private'; 
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);

            const currentPageData = await response.json();
            currentPageData.data.forEach(item => {
                if (typeof item.recentAveragePrice === 'number') totalRap += item.recentAveragePrice;
                allItems.push(item);
            });
            cursor = currentPageData.nextPageCursor;
        } while (cursor);

        const result = { totalRap, items: allItems };
        userCollectiblesCache.set(userId, result);
        return result;
    } catch (error) {
        console.error('RoValra: Failed to fetch user collectibles:', error);
        return null;
    }
}


async function fetchItemThumbnails(items, thumbnailCache, signal) {
    const itemsToFetch = items.filter(item => !thumbnailCache.has(item.assetId));
    if (itemsToFetch.length === 0) return;

    const itemsForBatch = itemsToFetch.map(item => ({ id: item.assetId }));
    const fetchedThumbnailsMap = await fetchThumbnailsBatch(itemsForBatch, 'Asset', '150x150', false, signal);

    fetchedThumbnailsMap.forEach((thumbData, id) => {
        thumbnailCache.set(id, thumbData);
    });
}


async function showInventoryOverlay(userId, items, totalRapString, hideSerial) {
    const displayName = await getDisplayNameFromPageData() || "User";
    const allItems = items.sort((a, b) => (b.recentAveragePrice || 0) - (a.recentAveragePrice || 0));
    let filteredItems = [...allItems];
    let currentLoadController = null;
    let isPaginating = false;

    const loadMoreItems = async () => {
        if (isPaginating || currentLoadController?.signal.aborted) return;

        const itemsToLoad = filteredItems.splice(0, 50);
        if (itemsToLoad.length === 0) return;

        isPaginating = true;

        const loadingMessage = document.createElement('p'); 
        loadingMessage.textContent = 'Loading more items...'; 
        loadingMessage.className = 'loading-message text-secondary'; 
        loadingMessage.style.gridColumn = '1 / -1'; 
        loadingMessage.style.textAlign = 'center'; 
        itemListContainer.appendChild(loadingMessage); 

        currentLoadController = new AbortController(); 
        try { 
            await fetchItemThumbnails(itemsToLoad, itemThumbnailCache, currentLoadController.signal); 
            if (currentLoadController.signal.aborted) return; 
            itemsToLoad.forEach(item => { 
                const card = createItemCard(item, itemThumbnailCache, { showSerial: true, hideSerial }); 
                itemListContainer.appendChild(card); 
            }); 
        } catch (error) { 
            if (error.name !== 'AbortError') { 
                console.error("RoValra: Failed to fetch item thumbnails.", error); 
            } 
        } finally { 
            loadingMessage.remove(); 
            isPaginating = false; 
        } 
    };

    const handleSearch = () => {
        if (currentLoadController) currentLoadController.abort();
        itemListContainer.innerHTML = '';
        const term = searchInput.input.value.toLowerCase().trim();
        filteredItems = allItems.filter(item => item.name.toLowerCase().includes(term));
        if (filteredItems.length > 0) {
            loadMoreItems();
        } else {
            setEmpty('No items match your search.');
        }
    };

    const bodyContent = document.createElement('div');
    bodyContent.style.cssText = 'display: flex; flex-direction: column; min-height: 0; gap: 16px;'; // Verified

    const searchInput = createStyledInput({
        id: 'rovalra-rap-search',
        label: 'Search by item name',
        placeholder: ' '
    });

    const itemListContainer = document.createElement('div');
    itemListContainer.className = 'rovalra-inventory-list';
    itemListContainer.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); grid-auto-rows:max-content; gap:8px; margin-bottom:10px;'; // Verified
    bodyContent.append(searchInput.container, itemListContainer);

    const rolimonsLink = document.createElement('a');
    rolimonsLink.href = `https://www.rolimons.com/player/${userId}`;
    rolimonsLink.target = '_blank';
    rolimonsLink.rel = 'noopener noreferrer';
    rolimonsLink.className = 'rolimons-link'; 
    rolimonsLink.style.cssText = 'display: inline-flex; align-items: center; margin-left: 12px; color: var(--rovalra-secondary-text-color);'; // Verified
    rolimonsLink.innerHTML = `<svg focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z"></path></svg>`;

    const overlayTitleText = `${displayName}'s Collectibles (${totalRapString} RAP)`;

    const { overlay, close } = createOverlay({
        title: overlayTitleText,
        bodyContent: bodyContent,
        maxWidth: '1000px',
        maxHeight: '85vh'
    });

    const actualTitleElement = overlay.querySelector('.rovalra-overlay-header');
    if (actualTitleElement) {
        actualTitleElement.append(rolimonsLink);
        addTooltip(rolimonsLink, "Open in Rolimon's", { position: 'top', container: overlay });
    }

    searchInput.input.addEventListener('input', handleSearch);

    const scrollTarget = overlay.querySelector('.rovalra-overlay-body');
    scrollTarget.addEventListener('scroll', () => {
        const isNearBottom = scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 250;
        if (isNearBottom && !isPaginating && filteredItems.length > 0) {
            loadMoreItems();
        }
    });

    const setEmpty = (message) => {
        itemListContainer.innerHTML = DOMPurify.sanitize(`<p class="text-secondary" style="grid-column:1/-1;text-align:center;">${message}</p>`);
    };

    if (allItems.length > 0) {
        loadMoreItems();
    } else {
        setEmpty("This user's inventory is private or has no limiteds.");
    }
}


async function addUserRapDisplay(observedElement) {
    const targetContainer = getOrCreateRovalraContainer(observedElement);
    if (!targetContainer || targetContainer.querySelector(`.${rapDisplayIdentifier}`)) return;

    const userId = getUserIdFromUrl();
    if (!userId) return;


    const robuxIcon = document.createElement('span');
    robuxIcon.className = 'icon-robux-16x16 rovalra-dynamic-icon';
    


    const rapText = document.createElement('span');
    rapText.innerText = '...'; 

    const rapDisplay = createProfileHeaderButton({
        id: rapDisplayIdentifier,
        content: [robuxIcon, rapText],
        backgroundColor: '#02aa51', 
        textColor: 'var(--rovalra-main-text-color)' 
    });

    targetContainer.appendChild(rapDisplay);

    const collectibleResult = await fetchUserCollectibles(userId);

    if (collectibleResult === null) {
        rapText.innerText = 'Error';
        return;
    }

    if (collectibleResult === 'Private') {
        rapText.innerText = 'Private';
        addTooltip(rapDisplay, "Open in Rolimon's", { position: 'top' });

        rapDisplay.addEventListener('click', async () => {
            const username = await getUsernameFromPageData() || 'this user';
            const bodyContent = document.createElement('div');
            bodyContent.innerHTML = DOMPurify.sanitize(`You are about to be redirected to ${username}'s profile on Rolimon's, an external website for trading and item values.<br><br>Do you want to continue?`);

            const { close } = createOverlay({
                title: 'Continue to Rolimon\'s',
                bodyContent: bodyContent,
                actions: [
                    (() => {
                        const continueButton = document.createElement('button');
                        continueButton.className = 'btn-primary-md';
                        continueButton.innerText = 'Continue to Rolimon\'s';
                        continueButton.onclick = () => {
                            window.open(`https://www.rolimons.com/player/${userId}`, '_blank');
                            close();
                        };
                        return continueButton;
                    })()
                ],
                showLogo: 'rolimonsIcon'
            });
        });
    } else {
        const rapString = collectibleResult.totalRap.toLocaleString();
        rapText.innerText = rapString;

        rapDisplay.addEventListener('click', async () => {
            const settings = await new Promise(resolve => chrome.storage.local.get({ HideSerial: false }, resolve));
            const cachedData = userCollectiblesCache.get(userId);
            const items = cachedData ? cachedData.items : [];
            showInventoryOverlay(userId, items, rapString, settings.HideSerial);
        });
    }
}

export function init() {
    chrome.storage.local.get({ userRapEnabled: true }, function(data) {
        if (data.userRapEnabled) {
            observeElement('.flex-nowrap.gap-small.flex, .profile-header-names', addUserRapDisplay, { multiple: true });
        }
    });
}