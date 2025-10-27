
(function() {
    'use strict';

    function main() {
        let currentTheme;
        let isInitialized = false;
        let subplacesDataCache = null;
        let lastKnownPlaceId = null;
        let subplacesContentDiv = null;
        let searchBar = null;
        let loadMoreButton = null;
        let subplacesContainer = null;

        async function initializeSubplacesFeature() {
            if (isInitialized) {
                return;
            }
            const placeId = extractPlaceId();
            if (!placeId) {
                return;
            }
            isInitialized = true;
            try {
                const universeId = await fetchUniverseId(placeId);
                if (universeId) {
                    subplacesDataCache = await fetchSubplaces(universeId);
                    await createSubplacesTab(subplacesDataCache);
                } else {
                    isInitialized = false;
                }
            } catch (error) {
                isInitialized = false;
            }
        }

        const pageObserver = new MutationObserver((mutations, observer) => {
            const currentPlaceId = extractPlaceId();
            if (!currentPlaceId) return;

            if (currentPlaceId !== lastKnownPlaceId) {
                lastKnownPlaceId = currentPlaceId;
                isInitialized = false;
                subplacesDataCache = null;
                document.querySelector('.tab-subplaces')?.remove();
                document.getElementById('subplaces-content-pane')?.remove();
            }

            const horizontalTabs = document.getElementById('horizontal-tabs');
            const contentSection = document.querySelector('.tab-content.rbx-tab-content');
            if (!horizontalTabs || !contentSection) return;

            if (!isInitialized) {
                initializeSubplacesFeature();
            } else {
                const subplacesTabExists = document.querySelector('.tab-subplaces');
                if (!subplacesTabExists && subplacesDataCache) {
                    createSubplacesTab(subplacesDataCache).catch(e => {});
                }
            }
        });

        pageObserver.observe(document.body, { childList: true, subtree: true });

        function getThemeFromBody() {
            return document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        }

        currentTheme = getThemeFromBody();
        const themeObserver = new MutationObserver(() => {
            const newTheme = getThemeFromBody();
            if (newTheme !== currentTheme) {
                currentTheme = newTheme;
                applyTheme();
            }
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        function applyTheme() {
            const isDarkMode = currentTheme === 'dark';
            const backgroundColor = isDarkMode ? '#272930' : 'rgb(247, 247, 248)';
            const textColor = isDarkMode ? '#ddd' : '#1a1a1a';
            const searchBarBackgroundColor = isDarkMode ? 'rgb(29, 30, 31)' : '#f0f0f0';
            const buttonBackgroundColor = isDarkMode ? '#272930' : '#e0e0e0';
            const gameContainerColor = isDarkMode ? '#272930' : 'rgb(247, 247, 248)';
            const gameContainerBorder = isDarkMode ? '0px solid #555' : '';
            const searchBarBorder = isDarkMode ? '0px solid #555' : '1px solid #bbb';
            const loadMoreBorder = isDarkMode ? '1px solid #555' : '1px solid #bbb';

            if (subplacesContentDiv) {
                subplacesContentDiv.style.backgroundColor = backgroundColor;
                if (searchBar) {
                    searchBar.style.backgroundColor = searchBarBackgroundColor;
                    searchBar.style.color = textColor;
                    searchBar.style.border = searchBarBorder;
                }
                if (loadMoreButton) {
                    loadMoreButton.style.backgroundColor = buttonBackgroundColor;
                    loadMoreButton.style.color = textColor;
                    loadMoreButton.style.border = loadMoreBorder;
                }
                if (subplacesContainer) {
                    subplacesContainer.querySelectorAll('.game-container').forEach(container => {
                        container.style.backgroundColor = gameContainerColor;
                        container.style.border = gameContainerBorder;
                    });
                    subplacesContainer.querySelectorAll('.game-name, p').forEach(el => el.style.color = textColor);
                }
            }
        }

        function extractPlaceId() {
            const match = window.location.href.match(/games\/(\d+)/);
            return match ? match[1] : null;
        }

        const retryFetch = async (url, retries = 3, delay = 2000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url);
                    if (response.status === 429) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        continue;
                    }
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response;
                } catch (error) {
                    if (i === retries - 1) throw error;
                }
            }
        };

        async function fetchUniverseId(placeId) {
            const url = `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`;
            const response = await fetch(url, { method: 'GET', credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error fetching Universe ID! status: ${response.status}`);
            const data = await response.json();
            if (data?.[0]?.universeId) return data[0].universeId;
            throw new Error("Universe ID not found in the API response.");
        }

        async function fetchSubplaces(universeId, cursor = null, allSubplaces = []) {
            let url = `https://develop.roblox.com/v1/universes/${universeId}/places?isUniverseCreation=false&limit=100&sortOrder=Asc`;
            if (cursor) url += `&cursor=${cursor}`;
            const response = await fetch(url, { method: 'GET', credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error fetching subplaces! status: ${response.status}`);
            const data = await response.json();
            if (data?.data) {
                allSubplaces.push(...data.data);
                if (data.nextPageCursor) return fetchSubplaces(universeId, data.nextPageCursor, allSubplaces);
            }
            return allSubplaces;
        }

        async function createSubplacesTab(subplaces) {
            const horizontalTabs = document.getElementById('horizontal-tabs');
            const contentSection = document.querySelector('.tab-content.rbx-tab-content');
            if (!horizontalTabs || !contentSection) throw new Error("Required tab containers not found.");

            document.querySelector('.tab-subplaces')?.remove();
            document.getElementById('subplaces-content-pane')?.remove();

            const subplaceTab = document.createElement('li');
            subplaceTab.className = 'rbx-tab tab-subplaces';
            subplaceTab.innerHTML = `<a class="rbx-tab-heading"><span class="text-lead">Subplaces</span></a>`;
            horizontalTabs.appendChild(subplaceTab);

            subplacesContentDiv = document.createElement('div');
            subplacesContentDiv.className = 'tab-pane';
            subplacesContentDiv.id = 'subplaces-content-pane';

            searchBar = document.createElement('input');
            searchBar.type = 'text';
            searchBar.placeholder = 'Search subplaces...';
            searchBar.className = 'subplace-search';
            searchBar.style.cssText = 'width: 100%; margin-bottom: 10px; padding: 8px; box-sizing: border-box; border-radius: 4px; border: 1px solid #bbb;';
            subplacesContentDiv.appendChild(searchBar);

            subplacesContainer = document.createElement('div');
            subplacesContainer.className = 'subplaces-list';
            subplacesContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;';
            subplacesContentDiv.appendChild(subplacesContainer);

            let displayedCount = 0, allDisplayed = false;
            const loadMoreWrapper = document.createElement('div');
            loadMoreWrapper.style.cssText = 'width: 100%; display: flex; justify-content: center;';
            loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Load More';
            loadMoreButton.className = 'load-more-button btn-control-md';
            loadMoreButton.style.cssText = 'display: none; margin-top: 15px; width: 100%; max-width: 768px;';
            loadMoreWrapper.appendChild(loadMoreButton);

            const displaySubplaces = async (gamesToDisplay) => {
                const sanitizeHTML = (str) => {
                    const temp = document.createElement('div');
                    temp.textContent = str;
                    return temp.innerHTML;
                };

                const placeIds = gamesToDisplay.map(p => p.id);
                const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeIds.join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`;
                const thumbnails = new Map();
                try {
                    const response = await retryFetch(url);
                    if (response) (await response.json()).data?.forEach(item => thumbnails.set(item.targetId, item.imageUrl));
                } catch (e) {}

                gamesToDisplay.forEach(subplace => {
                    const sanitizedName = sanitizeHTML(subplace.name);
                    const gameEl = document.createElement('div');
                    gameEl.className = 'game-container';
                    gameEl.style.cssText = 'padding: 0px; border-radius: 8px;';
                    const link = document.createElement('a');
                    link.href = `/games/${subplace.id}`;
                    link.style.textDecoration = 'none';
                    link.innerHTML = ` 
                        <img src="${thumbnails.get(subplace.id) || ''}" style="width: 150px; height: 150px; border-radius: 8px; margin-bottom: 5px; display: block;">
                        <span class="game-name" data-full-name="${sanitizedName}" style="font-weight: 700; font-size: 16px; width: 150px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; height: 2.4em; line-height: 1.2em;">
                            ${sanitizedName}
                        </span>`;
                    gameEl.appendChild(link);
                    subplacesContainer.appendChild(gameEl);
                });
                applyTheme();
            };

            const loadMore = async () => {
                const toLoad = subplaces.slice(displayedCount, displayedCount + 12);
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
            } else {
                await loadMore();
                if (!allDisplayed) {
                    loadMoreButton.style.display = 'block';
                    loadMoreButton.addEventListener('click', loadMore);
                    subplacesContentDiv.appendChild(loadMoreWrapper);
                }
            }
            
            searchBar.addEventListener('input', async () => {
                const term = searchBar.value.trim().toLowerCase();
                if (term && !allDisplayed) await loadMore();
                subplacesContainer.querySelectorAll('.game-container').forEach(c => {
                    const name = c.querySelector('.game-name')?.dataset.fullName.toLowerCase() || '';
                    c.style.display = name.includes(term) ? '' : 'none';
                });
                loadMoreWrapper.style.display = term ? 'none' : (allDisplayed ? 'none' : 'flex');
            });

            contentSection.appendChild(subplacesContentDiv);
            subplaceTab.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.rbx-tab.active, .tab-pane.active').forEach(el => el.classList.remove('active'));
                subplaceTab.classList.add('active');
                subplacesContentDiv.classList.add('active');
                if (window.location.hash !== '#!/subplaces') window.location.hash = '#!/subplaces';
            });

            if (window.location.hash === '#!/subplaces') setTimeout(() => subplaceTab.click(), 200);
            applyTheme();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }
})();