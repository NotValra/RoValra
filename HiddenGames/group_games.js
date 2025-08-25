let currentTheme = 'light';
let isPrimaryUiInitialized = false;

window.addEventListener('themeDetected', (event) => {
    currentTheme = event.detail.theme;
    applyTheme();
});

const retryFetch = async (url, retries = 5, delay = 3000) => {
    try {
        const response = await fetch(url);
        if (response.status === 429) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                return retryFetch(url, retries - 1, delay * 2);
            } else {
                return null;
            }
        }
        return response;
    } catch (error) {
        return null;
    }
};

const fetchGameDetails = async (games) => {
    const likeMap = new Map();
    const playerMap = new Map();
    if (!games || games.length === 0) {
        return { likeMap, playerMap };
    }
    for (let i = 0; i < games.length; i += 50) {
        const batch = games.slice(i, i + 50);
        const universeIds = batch.map(game => game.id).join(',');
        if (universeIds.length > 0) {
            const likeDataPromise = retryFetch(`https://games.roblox.com/v1/games/votes?universeIds=${universeIds}`).then(response => response ? response.json() : null);
            const playerDataPromise = retryFetch(`https://games.roblox.com/v1/games?universeIds=${universeIds}`).then(response => response ? response.json() : null);
            const [likeData, playerData] = await Promise.all([likeDataPromise, playerDataPromise]);
            if (likeData && likeData.data) {
                likeData.data.forEach(item => {
                    const totalVotes = item.upVotes + item.downVotes;
                    const likeRatio = totalVotes > 0 ? Math.round((item.upVotes / totalVotes) * 100) : 0;
                    likeMap.set(item.id, likeRatio);
                });
            }
            if (playerData && playerData.data) {
                playerData.data.forEach(item => {
                    playerMap.set(item.id, item.playing);
                });
            }
        }
    }
    return { likeMap, playerMap };
};

function applyTheme() {
    const isDarkMode = currentTheme === 'dark';
    const likeIconUrl = isDarkMode
        ? 'https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg'
        : 'https://images.rbxcdn.com/994d61715b1d8899f7c7abe114ec452a-common_sm_light_12032018.svg';
    const countColor = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgb(57, 59, 61)';
    const titleColor = isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgb(57, 59, 61)';
    const hiddenGamesContainers = document.querySelectorAll('.hidden-games-list, .hidden-games-list-fallback');
    hiddenGamesContainers.forEach(hiddenGamesContainer => {
        const gameElements = hiddenGamesContainer.querySelectorAll('.game-container');
        gameElements.forEach(gameElement => {
            const likeIcon = gameElement.querySelector('.like-icon');
            const playerIcon = gameElement.querySelector('.player-icon');
            const gameName = gameElement.querySelector('.game-name');
            if (likeIcon) {
                likeIcon.style.backgroundImage = `url(${likeIconUrl})`;
                likeIcon.style.backgroundPosition = '0px -32px';
            }
            if (playerIcon) {
                playerIcon.style.backgroundImage = `url(${likeIconUrl})`;
                playerIcon.style.backgroundPosition = '0px -48px';
            }
            if (gameName) gameName.style.color = titleColor;
            const likes = gameElement.querySelector('.likes-count');
            const players = gameElement.querySelector('.players-count');
            if (likes) likes.style.color = countColor;
            if (players) players.style.color = countColor;
        });
    });
}


if (window.location.pathname.includes('/communities')) {
    const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?communities\/(\d+)/;
    const match = window.location.href.match(regex);
    let groupId = match?.[1] || null;

    if (groupId) {
        let allGamesCache = null;
        let publicGamesCache = null;

        const fetchGroupGames = async (accessFilter) => {
            if (accessFilter === 1 && allGamesCache) return allGamesCache;
            if (accessFilter === 2 && publicGamesCache) return publicGamesCache;
            let games = [];
            let nextCursor = null;
            let url = `https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=${accessFilter}&limit=50&sortOrder=desc`;
            try {
                do {
                    const response = await retryFetch(url);
                    const data = response ? await response.json() : null;
                    if (data?.data) {
                        games = games.concat(data.data);
                        nextCursor = data.nextPageCursor;
                    } else {
                        nextCursor = null;
                    }
                    if (nextCursor) {
                        url = `https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=${accessFilter}&limit=50&sortOrder=desc&cursor=${nextCursor}`;
                    }
                } while (nextCursor);
                if (accessFilter === 1) allGamesCache = games;
                else if (accessFilter === 2) publicGamesCache = games;
                return games;
            } catch (error) {
                return [];
            }
        };

        const mainObserver = new MutationObserver((mutations, observer) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        const selector = '.group-games, group-games[ng-if*="areGroupGamesVisible"]';
                        let gamesContainer = node.matches?.(selector) ? node : node.querySelector(selector);
                        if (gamesContainer?.querySelector('.container-header')) {
                            initializeHiddenGames(gamesContainer, gamesContainer.querySelector('.container-header'));
                            observer.disconnect();
                            return;
                        }
                    }
                }
            }
        });

        const displayGames = (gamesToDisplay, likeMap, playerMap, loadedGameIds, targetGrid = null) => {
            const hiddenGamesPrimaryGrid = document.querySelector('.hidden-games-grid');
            const grid = targetGrid || hiddenGamesPrimaryGrid;
            if (!grid) {
                return;
            }
            gamesToDisplay.forEach((game) => {
                const universeId = game.id;
                const gameId = game.rootPlace?.id;
                if (!gameId || loadedGameIds.has(universeId)) return;
                loadedGameIds.add(universeId);
                const gameCard = document.createElement('div');
                gameCard.classList.add('game-container');
                gameCard.innerHTML = `
                    <a href="https://www.roblox.com/games/${gameId}" style="text-decoration:none; color:inherit;">
                        <div class="thumbnail-container" style="width: 150px; height: 150px;">
                            <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" style="width:150px; height:150px; background-color:#393b3d; border-radius:8px;" data-universe-id="${universeId}">
                        </div>
                        <div class="game-name" style="font-weight:bold; margin-top:5px;">${game.name}</div>
                        <div style="display:flex; align-items:center; margin-top:5px;">
                            <span class="like-icon" style="width: 16px; height: 16px; display: inline-block; background-repeat: no-repeat; background-size: auto; vertical-align: middle; margin-right: 5px;"></span>
                            <span class="likes-count" style="font-size:12px; margin-right: 10px;">${likeMap.get(universeId) || '--'}%</span>
                            <span class="player-icon" style="width: 16px; height: 16px; display: inline-block; background-repeat: no-repeat; background-size: auto; vertical-align: middle; margin-right: 5px;"></span>
                            <span class="players-count" style="font-size:12px;">${playerMap.get(universeId) || '0'}</span>
                        </div>
                    </a>`;
                grid.appendChild(gameCard);
                const thumbnailContainer = gameCard.querySelector('.thumbnail-container');
                const img = thumbnailContainer.querySelector('img');
                const useFallbackThumbnail = () => { thumbnailContainer.innerHTML = `<div class="thumbnail-2d-container icon-in-review dark-mode" style="width: 150px; height: 150px; border-radius: 8px;"></div>`; };
                img.onerror = useFallbackThumbnail;
                retryFetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)
                    .then(res => res ? res.json() : null)
                    .then(thumbData => {
                        const thumbnailInfo = thumbData?.data?.[0];
                        if (thumbnailInfo && thumbnailInfo.state === 'Completed' && thumbnailInfo.imageUrl) {
                            img.src = thumbnailInfo.imageUrl;
                        } else {
                            useFallbackThumbnail();
                        }
                    }).catch(err => {
                        useFallbackThumbnail();
                    });
            });
            applyTheme();
        };

        const initializeHiddenGames = async (groupGamesContainer, containerHeader) => {
            isPrimaryUiInitialized = true;
            await fetchGroupGames(1);
            let hiddenGamesCache = null;
            let visibleGamesListElement = groupGamesContainer.querySelector('.group-experiences-container, ul.game-cards');
            if (!visibleGamesListElement) {
                return;
            }
            let hiddenGamesActive = false;
            const hiddenGamesContainer = document.createElement('div');
            hiddenGamesContainer.classList.add('hidden-games-list');
            hiddenGamesContainer.style.display = 'none';
            const hiddenGamesGrid = document.createElement('div');
            hiddenGamesGrid.classList.add('hidden-games-grid');
            hiddenGamesGrid.style.display = 'grid';
            hiddenGamesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
            hiddenGamesGrid.style.gap = '20px 12px';
            const loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Load More';
            loadMoreButton.classList.add('load-more-button');
            hiddenGamesContainer.append(hiddenGamesGrid, loadMoreButton);
            
            const section = groupGamesContainer.querySelector('.section');
            if (section) {
                section.appendChild(hiddenGamesContainer); // No more bug
            } else {
                groupGamesContainer.parentNode.insertBefore(hiddenGamesContainer, groupGamesContainer.nextSibling); // Fallback but bug :C 
            }

            const updateLoadMoreButtonWidth = () => { if (hiddenGamesGrid.offsetWidth > 0) loadMoreButton.style.width = `${hiddenGamesGrid.offsetWidth}px`; };
            window.addEventListener('resize', updateLoadMoreButtonWidth);

            const setupHiddenGames = async () => {
                if (hiddenGamesCache) {
                    hiddenGamesGrid.innerHTML = '';
                    let displayedGameCount = 0;
                    const loadedGameIds = new Set();
                    const { games, likeMap, playerMap } = hiddenGamesCache;
                    const loadMoreFromCache = () => {
                        const gamesToLoad = games.slice(displayedGameCount, displayedGameCount + 12);
                        displayGames(gamesToLoad, likeMap, playerMap, loadedGameIds);
                        displayedGameCount += gamesToLoad.length;
                        loadMoreButton.style.display = displayedGameCount >= games.length ? 'none' : 'block';
                    };
                    loadMoreButton.onclick = loadMoreFromCache;
                    loadMoreFromCache();
                    return;
                }
                const publicGames = await fetchGroupGames(2);
                const publicGameIds = new Set(publicGames.map(game => game.id));
                const hiddenGames = allGamesCache.filter(game => !publicGameIds.has(game.id));
                hiddenGamesGrid.innerHTML = '';
                if (hiddenGames.length === 0) {
                    hiddenGamesGrid.innerHTML = "<p>No hidden games found.</p>";
                    loadMoreButton.style.display = 'none';
                    return;
                }
                const { likeMap, playerMap } = await fetchGameDetails(hiddenGames);
                hiddenGamesCache = { games: hiddenGames, likeMap, playerMap };
                let displayedGameCount = 0;
                const loadedGameIds = new Set();
                const loadMoreFresh = () => {
                    const gamesToLoad = hiddenGames.slice(displayedGameCount, displayedGameCount + 12);
                    displayGames(gamesToLoad, likeMap, playerMap, loadedGameIds);
                    displayedGameCount += gamesToLoad.length;
                    loadMoreButton.style.display = displayedGameCount >= hiddenGames.length ? 'none' : 'block';
                };
                loadMoreButton.onclick = loadMoreFresh;
                loadMoreFresh();
                setTimeout(updateLoadMoreButtonWidth, 0);
            };
            if (containerHeader.querySelector('h2')) containerHeader.querySelector('h2').remove();
            const styleTabButton = (button) => {
                Object.assign(button.style, {
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    cursor: 'pointer', userSelect: 'none', minWidth: '64px', border: '0px', margin: '0px', textDecoration: 'none',
                    transition: 'background-color 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1), border-color 250ms cubic-bezier(0.4, 0, 0.2, 1), color 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                    fontFamily: 'Builder Sans, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif',
                    fontSize: '16px', fontWeight: '600', lineHeight: '100%', borderRadius: '8px', padding: '10px 16px',
                    minHeight: '40px', textTransform: 'none', boxShadow: 'none', color: 'var(--color-content-emphasis)',
                });
            };
            const experiencesButton = document.createElement('button');
            experiencesButton.textContent = "Experiences";
            experiencesButton.classList.add('active-tab');
            const hiddenGamesButton = document.createElement('button');
            hiddenGamesButton.textContent = "Hidden Experiences";
            styleTabButton(experiencesButton);
            styleTabButton(hiddenGamesButton);
            styleTabButton(loadMoreButton);
            const buttonContainer = document.createElement('div');
            Object.assign(buttonContainer.style, { display: 'flex', gap: '12px', width: '100%' });
            buttonContainer.append(experiencesButton, hiddenGamesButton);
            if (!containerHeader.querySelector('.tab-button-container')) {
                buttonContainer.classList.add('tab-button-container');
                containerHeader.append(buttonContainer);
            }
            const getThemeColors = () => currentTheme === 'dark' ? { active: 'var(--color-shift-400)', inactive: 'var(--dark-mode-surface-300)', hover: 'var(--color-shift-400)' } : { active: 'var(--color-shift-400)', inactive: 'var(--color-action-standard-background)', hover: 'var(--color-state-hover)' };
            const setActiveButtonStyles = () => {
                const colors = getThemeColors();
                document.querySelectorAll('.tab-button-container button').forEach(btn => {
                    btn.style.backgroundColor = btn.classList.contains('active-tab') ? colors.active : colors.inactive;
                });
            };
            [experiencesButton, hiddenGamesButton, loadMoreButton].forEach(button => {
                button.addEventListener('mouseover', () => { if (!button.classList.contains('active-tab')) button.style.backgroundColor = getThemeColors().hover; });
                button.addEventListener('mouseout', () => { if (!button.classList.contains('active-tab')) button.style.backgroundColor = getThemeColors().inactive; });
            });
            hiddenGamesButton.addEventListener('click', () => {
                if (hiddenGamesActive) return;
                hiddenGamesActive = true;
                visibleGamesListElement.style.display = 'none';
                hiddenGamesContainer.style.display = 'block';
                hiddenGamesButton.classList.add('active-tab');
                experiencesButton.classList.remove('active-tab');
                setActiveButtonStyles();
                setupHiddenGames();
            });
            experiencesButton.addEventListener('click', () => {
                if (!hiddenGamesActive) return;
                hiddenGamesActive = false;
                visibleGamesListElement.style.display = '';
                hiddenGamesContainer.style.display = 'none';
                experiencesButton.classList.add('active-tab');
                hiddenGamesButton.classList.remove('active-tab');
                setActiveButtonStyles();
            });
            setActiveButtonStyles();
            loadMoreButton.style.backgroundColor = getThemeColors().inactive;
        };

        const startObserver = () => {
            setTimeout(() => {
                if (document.body) {
                    mainObserver.observe(document.body, { childList: true, subtree: true });
                } else {
                    startObserver();
                }
            }, 100);
        };

        const createFallbackToggleButton = (hiddenGames) => {
            let hiddenGamesVisible = false;
            const hiddenGamesContainer = document.createElement('div');
            hiddenGamesContainer.classList.add('hidden-games-list-fallback');
            hiddenGamesContainer.style.display = 'none';
            hiddenGamesContainer.style.marginTop = '20px';
            const hiddenGamesGrid = document.createElement('div');
            hiddenGamesGrid.style.display = 'grid';
            hiddenGamesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
            hiddenGamesGrid.style.gap = '20px 12px';
            hiddenGamesContainer.appendChild(hiddenGamesGrid);

            const toggleButton = document.createElement('button');
            toggleButton.id = 'ro-hidden-games-fallback-btn';
            toggleButton.textContent = `Show ${hiddenGames.length} Hidden Experiences`;
            Object.assign(toggleButton.style, {
                cursor: 'pointer', border: '0px', fontFamily: 'Builder Sans, sans-serif', fontSize: '14px',
                fontWeight: '600', borderRadius: '8px', padding: '8px 12px', marginLeft: '16px',
                backgroundColor: 'var(--color-action-standard-background)', color: 'var(--color-content-emphasis)',
                verticalAlign: 'middle'
            });

            toggleButton.addEventListener('click', async () => {
                hiddenGamesVisible = !hiddenGamesVisible;
                toggleButton.textContent = hiddenGamesVisible ? 'Hide Hidden Experiences' : `Show ${hiddenGames.length} Hidden Experiences`;
                hiddenGamesContainer.style.display = hiddenGamesVisible ? 'block' : 'none';
                if (hiddenGamesVisible && !hiddenGamesGrid.hasChildNodes()) {
                    hiddenGamesGrid.innerHTML = `<p style="color: var(--color-content-emphasis);">Loading game details...</p>`;
                    const { likeMap, playerMap } = await fetchGameDetails(hiddenGames);
                    hiddenGamesGrid.innerHTML = '';
                    displayGames(hiddenGames, likeMap, playerMap, new Set(), hiddenGamesGrid);
                }
            });

            const membersHeader = document.querySelector('h2[ng-bind*="Heading.Members"]');
            const wallContainer = document.querySelector('.container-header:has(h2[ng-bind*="Heading.Wall"])');

            if (membersHeader && membersHeader.parentElement) {
                membersHeader.parentElement.appendChild(toggleButton);
                const membersSection = membersHeader.closest('.section');
                if (membersSection && membersSection.parentElement) {
                    membersSection.parentElement.insertBefore(hiddenGamesContainer, membersSection.nextSibling);
                }
            } else if (wallContainer) {
                wallContainer.appendChild(toggleButton);
                if (wallContainer.parentElement) {
                    wallContainer.parentElement.insertBefore(hiddenGamesContainer, wallContainer);
                }
            } else {
                document.getElementById('content')?.appendChild(hiddenGamesContainer);
            }
        };

        const checkUrlAndApply = () => {
            isPrimaryUiInitialized = false;
            if (window.location.hash === '#!/about') {
                const gamesContainer = document.querySelector('.group-games, group-games[ng-if*="areGroupGamesVisible"]');
                if (gamesContainer?.querySelector('.container-header')) {
                    initializeHiddenGames(gamesContainer, gamesContainer.querySelector('.container-header'));
                } else {
                    startObserver();
                }

                setTimeout(async () => {
                    if (isPrimaryUiInitialized || document.getElementById('ro-hidden-games-fallback-btn')) {
                        return;
                    }
                    const allGames = await fetchGroupGames(1);
                    const publicGames = await fetchGroupGames(2);
                    const publicGameIds = new Set(publicGames.map(game => game.id));
                    const hiddenGames = allGames.filter(game => !publicGameIds.has(game.id));
                    if (hiddenGames.length > 0) {
                        createFallbackToggleButton(hiddenGames);
                    }
                }, 3000);
            }
        };

        window.addEventListener('hashchange', checkUrlAndApply);
        checkUrlAndApply();
    }
}