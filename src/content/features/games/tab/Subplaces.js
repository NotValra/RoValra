import { fetchThumbnails as fetchThumbnailsBatch, createThumbnailElement } from '../../../core/thumbnail/thumbnails.js';
import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import DOMPurify from 'dompurify';

const PAGE_SIZE = 12;

export async function init() {
  chrome.storage.local.get(['subplacesEnabled'], async (result) => {
    if (result.subplacesEnabled) {
        const fetchUniverseId = async (placeId) => {
            try {
                const response = await callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch universe ID: ${response.status}`);
                }

                const data = await response.json();
                if (data?.[0]?.universeId) {
                    return data[0].universeId;
                }
                throw new Error("Universe ID not found in the API response.");
            } catch (error) {
                throw error;
            }
        };

        const fetchUniverseDetails = async (universeId) => {
            try {
                const response = await callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/games?universeIds=${universeId}`,
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch universe details: ${response.status}`);
                }

                const data = await response.json();
                if (data?.data?.[0]) {
                    return data.data[0];
                }
                throw new Error("Universe details not found in the API response.");
            } catch (error) {
                throw error;
            }
        };

        const checkSubplaceJoinability = async (placeId) => {
            try {
                const attemptId = self.crypto.randomUUID(); 
                
                const response = await callRobloxApi({
                    subdomain: 'gamejoin',
                    endpoint: '/v1/join-game',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        placeId: parseInt(placeId, 10),
                        gameJoinAttemptId: attemptId
                    })
                });

                if (!response.ok) {
                    return null;
                }

                return await response.json();
            } catch (error) {
                return null;
            }
        };

        const fetchAllSubplaces = async (universeId) => {
            let allSubplaces = [];
            let nextCursor = '';
            const maxRetries = 3;

            do {
                let retryCount = 0;
                let success = false;

                while (retryCount < maxRetries && !success) {
                    try {
                        const endpoint = nextCursor 
                            ? `/v2/universes/${universeId}/places?limit=100&cursor=${nextCursor}`
                            : `/v2/universes/${universeId}/places?limit=100`;

                        const response = await callRobloxApi({
                            subdomain: 'develop',
                            endpoint: endpoint,
                            method: 'GET'
                        });

                        if (!response.ok) {
                            if (response.status === 429) {
                                const delay = Math.pow(2, retryCount) * 1000;
                                await new Promise(resolve => setTimeout(resolve, delay));
                                retryCount++;
                                continue;
                            }
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const data = await response.json();
                        if (data?.data) {
                            allSubplaces.push(...data.data);
                        }
                        nextCursor = data?.nextPageCursor || '';
                        success = true;

                    } catch (error) {
                        retryCount++;
                        if (retryCount >= maxRetries) {
                            return allSubplaces; 
                        }
                        await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                    }
                }
            } while (nextCursor);

            allSubplaces.sort((a, b) => {
                if (a.isRootPlace && !b.isRootPlace) {
                    return -1;
                }
                if (!a.isRootPlace && b.isRootPlace) {
                    return 1;
                }
                return 0;
            });

            return allSubplaces;
        };

        const fetchThumbnails = async (gamesToDisplay) => {
            if (gamesToDisplay.length === 0) return new Map();
            try {
                return await fetchThumbnailsBatch(gamesToDisplay, 'PlaceIcon', '150x150');
            } catch (e) {
                return new Map();
            }
        };

        const injectStyles = () => {
            if (document.getElementById('rovalra-subplaces-styles')) return;
            const style = document.createElement('style');
            style.id = 'rovalra-subplaces-styles';
            style.textContent = `

                .rovalra-subplaces-list {
                    display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    gap: 12px;
                }
                .rovalra-subplace-card { justify-self: center; width: 150px; height: 240px; }
                .rovalra-subplace-card .game-card-link { display: flex; flex-direction: column; height: 100%; text-decoration: none; }
                .rovalra-subplace-card .game-card-thumb-container { width: 150px; height: 150px; border-radius: 8px; margin-bottom: 5px; background-color: var(--rovalra-secondary-text-color); }
                .rovalra-subplace-card .game-card-thumb { width: 100%; height: 100%; border-radius: 8px; }
                .rovalra-subplace-card .game-card-name {
                    font-weight: 500; font-size: 16px; width: 150px;
                    color: var(--rovalra-main-text-color);
                    white-space: normal;
                    word-wrap: break-word;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .rovalra-subplace-card p { color: var(--rovalra-main-text-color); }
                
                .rovalra-load-more-wrapper { width: 100%; display: flex; justify-content: center; }
                .rovalra-load-more-btn {
                    display: none; margin-top: 15px; width: 100%; max-width: 768px;
                    background-color: var(--rovalra-container-background-color); color: var(--rovalra-main-text-color);
                    border: 1px solid var(--sp-btn-border);
                }
                
                .rovalra-subplaces-search-wrapper {
                    margin-bottom: 16px;
                }
            `;
            document.head.appendChild(style);
        };

        const createSubplaceCard = (subplace, thumbnailData) => {
            const card = document.createElement('div');
            card.className = 'rovalra-subplace-card game-card-container';

            const link = document.createElement('a');
            link.className = 'game-card-link';
            link.href = `https://www.roblox.com/games/${subplace.id}`;

            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'game-card-thumb-container'; 
            const thumbnailElement = createThumbnailElement(thumbnailData, subplace.name, 'game-card-thumb');
            thumbContainer.appendChild(thumbnailElement);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'game-card-name game-name-title';

            nameSpan.dataset.fullName = subplace.name;
            nameSpan.title = subplace.name;
            nameSpan.textContent = subplace.name;

            const detailsContainer = document.createElement('div');
            detailsContainer.appendChild(nameSpan);

            if (subplace.isRootPlace) {
                const rootLabel = document.createElement('p');
                rootLabel.textContent = 'Root Place';
                rootLabel.style.cssText = 'font-size: 13px; color: var(--rovalra-secondary-text-color); margin-top: 4px;';
                detailsContainer.appendChild(rootLabel);
            }

            link.append(thumbContainer, detailsContainer);

            card.appendChild(link);
            return card;
        };

        const createSubplacesTab = (subplaces, horizontalTabs, contentSection) => {
            let displayedCount = 0;
            let allDisplayed = false;

            const subplaceTab = document.createElement('li');
            subplaceTab.id = 'tab-subplaces';
            subplaceTab.className = 'rbx-tab tab-subplaces';
            subplaceTab.innerHTML = `<a class="rbx-tab-heading"><span class="text-lead">Subplaces</span></a>`;

            const subplacesContentDiv = document.createElement('div');
            subplacesContentDiv.className = 'tab-pane';
            subplacesContentDiv.id = 'subplaces-content-pane';

            const searchWrapper = document.createElement('div');
            searchWrapper.className = 'rovalra-subplaces-search-wrapper';
            const searchInputComponent = createStyledInput({
                id: 'rovalra-subplaces-search',
                label: 'Search subplaces',
                placeholder: ' '
            });
            searchWrapper.appendChild(searchInputComponent.container);
            const searchInput = searchInputComponent.input;

            const subplacesContainer = document.createElement('div');
            subplacesContainer.className = 'rovalra-subplaces-list';

            const loadMoreWrapper = document.createElement('div');
            loadMoreWrapper.className = 'rovalra-load-more-wrapper';
            const loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Load More';
            loadMoreButton.className = 'rovalra-load-more-btn btn-control-md';
            loadMoreWrapper.appendChild(loadMoreButton);

            subplacesContentDiv.append(searchWrapper, subplacesContainer, loadMoreWrapper);

            const otherPanes = contentSection.querySelectorAll('.tab-pane');
            const hasPaneWithBackground = Array.from(otherPanes).some(pane => {
                const style = window.getComputedStyle(pane);
                const bgColor = style.backgroundColor;
                return bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
            });
            if (hasPaneWithBackground) {
                subplacesContentDiv.style.backgroundColor = 'var(--rovalra-container-background-color)';
            }

            const displaySubplaces = async (gamesToDisplay) => {
                const thumbnails = await fetchThumbnails(gamesToDisplay);
                gamesToDisplay.forEach(subplace => {
                    const card = createSubplaceCard(subplace, thumbnails.get(subplace.id));
                    subplacesContainer.appendChild(card);
                });
            };

            const loadMore = async () => {
                const toLoad = subplaces.slice(displayedCount, displayedCount + PAGE_SIZE);
                if (toLoad.length > 0) {
                    await displaySubplaces(toLoad);
                    displayedCount += toLoad.length;
                }
                if (displayedCount >= subplaces.length) {
                    allDisplayed = true;
                    loadMoreWrapper.style.display = 'none';
                }
            };

            if (subplaces.length === 0) {
                subplacesContainer.innerHTML = '<p style="grid-column: 1 / -1;">No subplaces found.</p>';
                loadMoreWrapper.style.display = 'none';
            } else {
                loadMore(); 
                if (subplaces.length > PAGE_SIZE) {
                    loadMoreButton.style.display = 'block';
                    loadMoreButton.addEventListener('click', loadMore);
                }
            }

            searchInput.addEventListener('input', async () => {
                const term = searchInput.value.trim().toLowerCase();
                if (term && !allDisplayed) {
                    while (!allDisplayed) {
                        await loadMore();
                    }
                }
                subplacesContainer.querySelectorAll('.rovalra-subplace-card').forEach(c => {
                    const name = c.querySelector('.game-card-name')?.dataset.fullName?.toLowerCase() || '';
                    c.style.display = name.includes(term) ? '' : 'none';
                });
                loadMoreWrapper.style.display = term ? 'none' : (allDisplayed ? 'none' : 'flex');
            });

            horizontalTabs.appendChild(subplaceTab);
            contentSection.appendChild(subplacesContentDiv);

            subplaceTab.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.rbx-tab.active, .tab-pane.active').forEach(el => el.classList.remove('active'));
                subplaceTab.classList.add('active');
                subplacesContentDiv.classList.add('active');
                if (window.location.hash !== '#!/subplaces') window.location.hash = '#!/subplaces';
            });

            if (window.location.hash === '#!/subplaces') {
                setTimeout(() => subplaceTab.click(), 200);
            }
        };


        const initializeSubplacesFeature = async (tabContainer) => {
            if (tabContainer.dataset.rovalraSubplacesInitialized === 'true') {
                return;
            }
            tabContainer.dataset.rovalraSubplacesInitialized = 'true';

            const placeId = getPlaceIdFromUrl();
            if (!placeId) {
                return;
            }

            const contentSection = document.querySelector('.tab-content.rbx-tab-content');
            if (!contentSection) {
                return;
            }

            document.querySelector('.tab-subplaces')?.remove();
            document.getElementById('subplaces-content-pane')?.remove();

            try {
                const universeId = await fetchUniverseId(placeId);
                if (universeId) {
                    const subplaces = await fetchAllSubplaces(universeId);
                    
                    const universeDetails = await fetchUniverseDetails(universeId);

                    if (universeDetails && universeDetails.rootPlaceId && universeDetails.rootPlaceId.toString() !== placeId) {
                        
                        const rootPlaceData = subplaces.find(p => p.isRootPlace);
                        const rootPlaceName = DOMPurify.sanitize(rootPlaceData ? rootPlaceData.name : "the main experience");
                        const rootPlaceId = universeDetails.rootPlaceId;
                        const joinData = await checkSubplaceJoinability(placeId);
                        
                        const bannerTitle = `You are currently viewing a subplace of [${rootPlaceName}](https://www.roblox.com/games/${rootPlaceId}).`;
                        
                        let bannerDescription = "Some experiences may disable joining subplaces.";
                        
                        if (joinData && joinData.status === 12) {
                             bannerDescription = "This subplace cannot be joined due to join restrictions.";
                        }
                        if (joinData && joinData.status === 2) {
                             bannerDescription = "This subplace can be joined.";
                        }


                        const checkBannerInterval = setInterval(() => {
                            if (window.GameBannerManager) {
                                clearInterval(checkBannerInterval);
                                const subplaceIcon = `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M13 22h8v-7h-3v-4h-5V9h3V2H8v7h3v2H6v4H3v7h8v-7H8v-2h8v2h-3z"></path></svg>`;
                                
                                window.GameBannerManager.addNotice(bannerTitle, subplaceIcon, bannerDescription);
                            }
                        }, 200);
                    }

                    createSubplacesTab(subplaces, tabContainer, contentSection);
                }
            } catch (error) {
                tabContainer.dataset.rovalraSubplacesInitialized = 'false'; 
            }
        };

        const onTabContainerRemoved = () => {
            const oldTabContainer = document.querySelector('[data-rovalra-subplaces-initialized]');
            if (oldTabContainer) {
                oldTabContainer.dataset.rovalraSubplacesInitialized = 'false';
            }
        };

        injectStyles();

        if (observeElement && typeof observeElement === 'function') {
            observeElement(
                '#horizontal-tabs',
                (tabContainer) => initializeSubplacesFeature(tabContainer),
                { onRemove: onTabContainerRemoved }
            );
        }
    }
  });
}