import { fetchThumbnails as fetchThumbnailsBatch } from '../../../core/thumbnail/thumbnails.js';
import { createGameCard } from '../../../core/ui/games/gameCard.js';
import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import DOMPurify from 'dompurify';
import { createTab } from '../../../core/ui/games/tab.js';

const PAGE_SIZE = 12;

export async function init() {
  chrome.storage.local.get(['subplacesEnabled'], async (result) => {
    if (result.subplacesEnabled) {
        const fetchUniverseId = async (placeId) => {
          
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
           
        };

        const fetchUniverseDetails = async (universeId) => {
            if (document.hidden) {
                await new Promise(resolve => {
                    const onVisibilityChange = () => {
                        if (!document.hidden) {
                            document.removeEventListener('visibilitychange', onVisibilityChange);
                            resolve();
                        }
                    };
                    document.addEventListener('visibilitychange', onVisibilityChange);
                });
            }

            let attempts = 0;
            while (attempts < 5) {
                try {
                    const response = await callRobloxApi({
                        subdomain: 'games',
                        endpoint: `/v1/games?universeIds=${universeId}`,
                        method: 'GET'
                    });

                    if (response.status === 429) {
                        attempts++;
                        await new Promise(r => setTimeout(r, 2000 * attempts));
                        continue;
                    }

                    if (!response.ok) {
                        throw new Error(`Failed to fetch universe details: ${response.status}`);
                    }

                    const data = await response.json();
                    if (data?.data?.[0]) {
                        return data.data[0];
                    }
                    throw new Error("Universe details not found in the API response.");
                } catch (e) {
                    if (attempts >= 4) throw e;
                    attempts++;
                    await new Promise(r => setTimeout(r, 1000));
                }
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




        const createSubplacesTab = (universeId, horizontalTabs, contentSection) => {
            const { contentPane: subplacesContentDiv } = createTab({
                id: 'subplaces',
                label: 'Subplaces',
                container: horizontalTabs,
                contentContainer: contentSection,
                hash: '#!/subplaces'
            });

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

            let isLoaded = false;

            const initData = async () => {
                if (isLoaded) return;
                isLoaded = true;

                subplacesContainer.innerHTML = '<div class="spinner spinner-default"></div>';
                loadMoreWrapper.style.display = 'none';

                try {
                    const subplaces = await fetchAllSubplaces(universeId);
                    const universeDetails = await fetchUniverseDetails(universeId);
                    const placeId = getPlaceIdFromUrl();

                    if (universeDetails && universeDetails.rootPlaceId && universeDetails.rootPlaceId.toString() !== placeId) {
                        const rootPlaceData = subplaces.find(p => p.isRootPlace);
                        const rootPlaceName = DOMPurify.sanitize(rootPlaceData ? rootPlaceData.name : "the main experience");
                        const rootPlaceId = universeDetails.rootPlaceId;
                        const joinData = await checkSubplaceJoinability(placeId);
                        
                        const bannerTitle = `You are currently viewing a subplace of ${rootPlaceName}.`;
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

                    subplacesContainer.innerHTML = '';

                    let displayedCount = 0;
                    let allDisplayed = false;

                    const displaySubplaces = async (gamesToDisplay) => {
                        const thumbnails = await fetchThumbnails(gamesToDisplay);
                        gamesToDisplay.forEach(subplace => {
                            const gameData = { id: subplace.id, name: subplace.name, rootPlaceId: subplace.id };
                            const stats = { thumbnails };
                            const card = createGameCard({ game: gameData, stats, showVotes: false, showPlayers: false });
                            card.classList.add('rovalra-subplace-card', 'game-card-container');
                            const nameEl = card.querySelector('.game-card-name');
                            if (nameEl) nameEl.dataset.fullName = subplace.name;
                            if (subplace.isRootPlace) {
                                const rootLabel = document.createElement('p');
                                rootLabel.textContent = 'Root Place';
                                rootLabel.className = 'root-place-label';
                                const link = card.querySelector('.game-card-link');
                                if (link) link.appendChild(rootLabel);
                            }
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

                } catch (e) {
                    subplacesContainer.innerHTML = '<p style="grid-column: 1 / -1; padding: 20px;">Failed to load subplaces.</p>';
                }
            };

            const checkUrl = () => {
                if (window.location.hash.includes('#!/subplaces')) {
                    initData();
                }
            };

            window.addEventListener('hashchange', checkUrl);
            checkUrl();
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
                    createSubplacesTab(universeId, tabContainer, contentSection);
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