(function() {
    'use strict';

    let currentTheme;
    let isTabCreationInitiated = false;
    let subplacesDataCache = null; 

    let subplacesContentDiv = null;
    let searchBar = null;
    let loadMoreButton = null;
    let subplacesContainer = null;



    
    async function initializeSubplacesFeature() {
        if (isTabCreationInitiated) {
            return; 
        }
        isTabCreationInitiated = true;

        const placeId = extractPlaceId();
        if (!placeId) {
            console.error("Subplaces Script: Could not find Place ID on this page.");
            return;
        }

        try {
            if (!subplacesDataCache) {
                const universeId = await fetchUniverseId(placeId);
                if (universeId) {
                    subplacesDataCache = await fetchSubplaces(universeId);
                } else {
                    console.warn("Subplaces Script: Could not retrieve Universe ID.");
                    return;
                }
            }

            if (subplacesDataCache) {
                await createSubplacesTab(subplacesDataCache);

                if (window.location.hash === '#!/subplaces') {
                    setTimeout(() => {
                        const tabElement = document.querySelector('.tab-subplaces');
                        if (tabElement && !tabElement.classList.contains('active')) {
                            tabElement.click();
                        }
                    }, 200); 
                }
            }
        } catch (error) {
            console.error("Subplaces Script: An error occurred during initialization:", error);
            isTabCreationInitiated = false; 
        }
    }


    
    const pageObserver = new MutationObserver((mutations, observer) => {
        const horizontalTabs = document.getElementById('horizontal-tabs');
        const contentSection = document.querySelector('.tab-content.rbx-tab-content');

        if (horizontalTabs && contentSection && !isTabCreationInitiated) {
            initializeSubplacesFeature();
        }

        const subplacesTabExists = document.querySelector('.tab-subplaces');
        if (horizontalTabs && contentSection && isTabCreationInitiated && !subplacesTabExists) {
            if (subplacesDataCache) {
                createSubplacesTab(subplacesDataCache).catch(e => console.error("Subplaces Script: Failed to re-create tab:", e));
            }
        }
    });

    pageObserver.observe(document.body, {
        childList: true,
        subtree: true
    });



    function getThemeFromBody() {
        if (!document.body) return 'light';
        return document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    }

    if (document.body) {
        currentTheme = getThemeFromBody();
        const themeObserver = new MutationObserver(() => {
            const newTheme = getThemeFromBody();
            if (newTheme !== currentTheme) {
                currentTheme = newTheme;
                applyTheme();
            }
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } else {
        window.addEventListener('DOMContentLoaded', () => {
             currentTheme = getThemeFromBody();
        });
    }

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
                subplacesContainer.querySelectorAll('.game-name').forEach(gameName => {
                    gameName.style.color = textColor;
                });
                subplacesContainer.querySelectorAll('p').forEach(p => {
                    p.style.color = textColor;
                });
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
                    console.warn(`Subplaces Script: Rate limited. Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; 
                    continue;
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            } catch (error) {
                console.error(`Subplaces Script: Fetch error for ${url}`, error);
                if (i === retries - 1) throw error; 
            }
        }
    };

    async function fetchUniverseId(placeId) {
        const url = `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`;
        const response = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error fetching Universe ID! status: ${response.status}`);
        const data = await response.json();
        if (data && Array.isArray(data) && data.length > 0 && data[0].universeId) {
            return data[0].universeId;
        } else {
            throw new Error("Universe ID not found in the API response.");
        }
    }

    async function fetchSubplaces(universeId, cursor = null, allSubplaces = []) {
        let url = `https://develop.roblox.com/v1/universes/${universeId}/places?isUniverseCreation=false&limit=100&sortOrder=Asc`;
        if (cursor) {
            url += `&cursor=${cursor}`;
        }
        const response = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error fetching subplaces! status: ${response.status}`);
        const data = await response.json();

        if (data && data.data) {
            allSubplaces.push(...data.data);
            if (data.nextPageCursor) {
                return fetchSubplaces(universeId, data.nextPageCursor, allSubplaces);
            }
        }
        return allSubplaces;
    }

    async function createSubplacesTab(subplaces) {
        const horizontalTabs = document.getElementById('horizontal-tabs');
        const contentSection = document.querySelector('.tab-content.rbx-tab-content');

        if (!horizontalTabs || !contentSection) {
            throw new Error("Required tab containers not found when trying to create tab.");
        }
        
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
        searchBar.style.cssText = 'width: 100%; margin-bottom: 10px; padding: 8px; box-sizing: border-box; border-radius: 4px; border: 1px solid #bbb; transition: border-color 0.3s ease;';
        subplacesContentDiv.appendChild(searchBar);

        subplacesContainer = document.createElement('div');
        subplacesContainer.className = 'subplaces-list';
        subplacesContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 5px;';
        subplacesContentDiv.appendChild(subplacesContainer);

        
        let displayedSubplaceCount = 0;
        let allDisplayed = false;

        const loadMoreButtonWrapper = document.createElement('div');
        loadMoreButtonWrapper.style.cssText = 'width: 100%; display: flex; padding-right: 10px; justify-content: center;';

        loadMoreButton = document.createElement('button');
        loadMoreButton.textContent = 'Load More';
        loadMoreButton.className = 'load-more-button btn-control-md'; 
        loadMoreButton.style.cssText = 'display: none; margin-top: 15px; width: 100%; max-width: 768px;';
        loadMoreButtonWrapper.appendChild(loadMoreButton);

        async function fetchThumbnailsInBatch(placeIds) {
            const batchSize = 100; 
            const thumbnailUrlMap = new Map();
            for (let i = 0; i < placeIds.length; i += batchSize) {
                const batchIds = placeIds.slice(i, i + batchSize);
                const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${batchIds.join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`;
                try {
                    const response = await retryFetch(url);
                    if (response) {
                        const thumbnailData = await response.json();
                        thumbnailData.data?.forEach(item => thumbnailUrlMap.set(item.targetId, item.imageUrl));
                    }
                } catch (error) {
                    console.error("Subplaces Script: Failed to fetch a batch of thumbnails.", error);
                }
            }
            return thumbnailUrlMap;
        }

        async function displaySubplaces(gamesToDisplay) {
            const placeIds = gamesToDisplay.map(p => p.id);
            const thumbnails = await fetchThumbnailsInBatch(placeIds);

            gamesToDisplay.forEach(subplace => {
                const gameElement = document.createElement('div');
                gameElement.className = 'game-container';
                gameElement.style.padding = '0px';
                gameElement.style.borderRadius = '8px';

                const gameLink = document.createElement('a');
                gameLink.href = `/games/${subplace.id}`;
                gameLink.style.textDecoration = 'none';

                const gameImage = document.createElement('img');
                gameImage.src = thumbnails.get(subplace.id) || 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                gameImage.style.cssText = 'width: 150px; height: 150px; border-radius: 8px; margin-bottom: 5px; display: block;';
                
                const gameName = document.createElement('span');
                gameName.className = 'game-name';
                gameName.setAttribute('data-full-name', subplace.name);
                gameName.textContent = subplace.name.length > 20 ? subplace.name.substring(0, 18) + "..." : subplace.name;
                gameName.style.cssText = 'font-weight: 700; font-size: 16px; width: 150px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

                gameLink.appendChild(gameImage);
                gameLink.appendChild(gameName);
                gameElement.appendChild(gameLink);
                subplacesContainer.appendChild(gameElement);
            });
            applyTheme(); 
        }

        function filterSubplaces(searchTerm) {
            const term = searchTerm.toLowerCase();
            subplacesContainer.querySelectorAll('.game-container').forEach(container => {
                const name = container.querySelector('.game-name')?.getAttribute('data-full-name').toLowerCase() || '';
                container.style.display = name.includes(term) ? '' : 'none';
            });
            loadMoreButtonWrapper.style.display = searchTerm ? 'none' : (allDisplayed ? 'none' : 'flex');
        }

        async function loadAllForSearch() {
            if (allDisplayed) return;
            const remaining = subplaces.slice(displayedSubplaceCount);
            if (remaining.length > 0) {
                await displaySubplaces(remaining);
                displayedSubplaceCount = subplaces.length;
            }
            allDisplayed = true;
            loadMoreButtonWrapper.style.display = 'none';
        }

        searchBar.addEventListener('input', () => {
            const searchTerm = searchBar.value.trim();
            if (searchTerm) {
                loadAllForSearch().then(() => filterSubplaces(searchTerm));
            } else {
                filterSubplaces('');
            }
        });
        
        const initialDisplayCount = 12;
        async function loadMoreSubplaces() {
            const toLoad = subplaces.slice(displayedSubplaceCount, displayedSubplaceCount + initialDisplayCount);
            if (toLoad.length > 0) {
                await displaySubplaces(toLoad);
                displayedSubplaceCount += toLoad.length;
            }
            if (displayedSubplaceCount >= subplaces.length) {
                allDisplayed = true;
                loadMoreButtonWrapper.style.display = 'none';
            }
        }
        
        if (subplaces.length === 0) {
            subplacesContainer.innerHTML = '<p style="grid-column: 1 / -1;">No subplaces found.</p>';
        } else {
            await loadMoreSubplaces(); 
            if (!allDisplayed) {
                loadMoreButton.style.display = 'block';
                loadMoreButton.addEventListener('click', loadMoreSubplaces);
                subplacesContentDiv.appendChild(loadMoreButtonWrapper);
            }
        }

        contentSection.appendChild(subplacesContentDiv);
        subplaceTab.addEventListener('click', () => {
            document.querySelectorAll('.rbx-tab.active').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-pane.active').forEach(pane => pane.classList.remove('active'));
            subplaceTab.classList.add('active');
            subplacesContentDiv.classList.add('active');
            window.location.hash = '#!/subplaces';
        });

        applyTheme();
    }
})();