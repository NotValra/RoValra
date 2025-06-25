let currentTheme = 'light';

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

    const hiddenGamesContainers = document.querySelectorAll('.hidden-games-list');
    hiddenGamesContainers.forEach(hiddenGamesContainer => {
        const gameElements = hiddenGamesContainer.querySelectorAll('.game-container');
        gameElements.forEach(gameElement => {
            const likeIcon = gameElement.querySelector('div > span:nth-child(1)');
            const playerIcon = gameElement.querySelector('div > span:nth-child(3)');
            const gameName = gameElement.querySelector('.game-name');


            if (likeIcon) {
                likeIcon.style.backgroundImage = `url(${likeIconUrl})`;
                likeIcon.style.backgroundPosition = isDarkMode ? '0px -32px' : '0px -32px';
            }

            if (playerIcon) {
                playerIcon.style.backgroundImage = `url(${likeIconUrl})`;
                playerIcon.style.backgroundPosition = isDarkMode ? '0px -48px' : '0px -48px';
            }

            if (gameName) {
                gameName.style.color = titleColor;
            }

            const likes = gameElement.querySelector('div > span:nth-child(2)');
            const players = gameElement.querySelector('div > span:nth-child(4)');

            if (likes) {
                likes.style.color = countColor;
            }
            if (players) {
                players.style.color = countColor;
            }
        });
    });

    const tabButtons = document.querySelectorAll('.tab-button');
    const loadMoreButtons = document.querySelectorAll('.load-more-button');

    const buttonTextColor = isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgb(57, 59, 61)';
    const buttonBgColor = isDarkMode ? 'rgb(45, 48, 51)' : 'rgb(242, 244, 245)';
    const buttonHoverBgColor = isDarkMode ? 'rgb(57, 60, 64)' : 'rgb(224, 226, 227)';
    const buttonActiveBgColor = isDarkMode ? 'rgb(69, 73, 77)' : 'rgb(210, 212, 213)';
    const buttonBorder = isDarkMode ? '0px solid rgba(255, 255, 255, 0.1)' : '0 solid rgba(0, 0, 0, 0.1)';

    tabButtons.forEach(button => {
        button.style.color = buttonTextColor;
        button.style.backgroundColor = button.classList.contains('active-tab') ? buttonActiveBgColor : buttonBgColor;
        button.style.border = buttonBorder;

        button.addEventListener('mouseover', () => {
            if (!button.classList.contains('active-tab')) {
                button.style.backgroundColor = buttonHoverBgColor;
            }
        });
        button.addEventListener('mouseout', () => {
            if (!button.classList.contains('active-tab')) {
                button.style.backgroundColor = buttonBgColor;
            } else {
                button.style.backgroundColor = buttonActiveBgColor;
            }
        });

        button.addEventListener('click', () => {
            tabButtons.forEach(btn => {
                btn.classList.remove('active-tab');
                btn.style.backgroundColor = buttonBgColor;
            });
            button.classList.add('active-tab');
            button.style.backgroundColor = buttonActiveBgColor;
        });
    });

    loadMoreButtons.forEach(button => {
        button.style.color = buttonTextColor;
        button.style.backgroundColor = buttonBgColor;
        button.style.border = buttonBorder;

        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = buttonHoverBgColor;
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = buttonBgColor;
        });
    });
}
if (window.location.pathname.includes('/communities')) {
    const currentURL = window.location.href;
    const languageMatch = currentURL.match(/https:\/\/www\.roblox\.com\/([a-z]{2}\/)/);
    let languagePrefix = '';
    if (languageMatch && languageMatch[0]) {
        languagePrefix = languageMatch[0]
    }
    const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?communities\/(\d+)/;
    const match = currentURL.match(regex);
    let groupId = null;
    if (match && match[1]) {
        groupId = match[1]
    }
    if (groupId) {
        async function fetchAllGroupGames() {
            let allGames = [];
            let nextCursor = null;
            let url = `https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=desc`;

            try {
                do {
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data && data.data) {
                        allGames = allGames.concat(data.data);
                        nextCursor = data.nextPageCursor;
                    } else {
                        nextCursor = null;
                    }
                    if (nextCursor)
                        url = `https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=desc&cursor=${nextCursor}`;

                } while (nextCursor);
                return allGames;
            } catch (error) {
                return [];
            }
        }

        let observer = null;
        let allGamesCache = null;
        let displayedGameCount = 0;
        let loadedGameIds = new Set();
        let hiddenGames = [];
        let hiddenGamesActive = false;
        const applyHiddenGamesLogic = async (retryCount = 0) => {
            if (observer) {
                observer.disconnect();
            }

            if (!allGamesCache) {
                allGamesCache = await fetchAllGroupGames();
            }

            let groupGamesContainer = document.querySelector('.group-games');
            let containerHeader = document.querySelector("#group-container > div > div > div.group-details.col-xs-12.ng-scope.col-sm-9 > div > group-games > div > div.container-header"); // shit was not being helpful

            if (!groupGamesContainer || !containerHeader) {
                const groupGamesElement = document.querySelector('group-games[ng-if*="library.currentGroup.areGroupGamesVisible"]');
                if (groupGamesElement) {
                    groupGamesContainer = groupGamesElement.querySelector('.group-games');
                    containerHeader = groupGamesElement.querySelector('div.section > div.container-header');
                }
            }


            if (!groupGamesContainer || !containerHeader) {
                if (retryCount < 5) {
                    setTimeout(() => applyHiddenGamesLogic(retryCount + 1), 1000);
                    return;
                } else {
                    observer = new MutationObserver(mutations => {
                        for (const mutation of mutations) {
                            if (mutation.addedNodes.length) {
                                for (const node of mutation.addedNodes) {
                                    if (node.classList && (node.classList.contains('group-games') || (node.id === "group-container" && node.querySelector('.group-games')) || node.tagName === 'GROUP-GAMES')) {
                                        applyHiddenGamesLogic();
                                        break;
                                    }
                                }
                            }
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                    return;
                }
            }

            if (observer) {
                observer.disconnect();
            }


            const hiddenGamesContainer = document.createElement('div');
            hiddenGamesContainer.classList.add('hidden-games-list');
            hiddenGamesContainer.style.display = 'none';
            hiddenGamesContainer.style.flexDirection = 'column';

            const hiddenGamesGrid = document.createElement('div');
            hiddenGamesGrid.classList.add('hidden-games-grid');
            hiddenGamesGrid.style.display = 'grid';
            hiddenGamesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
            hiddenGamesGrid.style.gap = '12px';
            hiddenGamesGrid.style.marginTop = '5px';

            const gameLinks = Array.from(groupGamesContainer.querySelectorAll('ul.game-cards > li.list-item > group-games-item > div.game-card-container > a.game-card-link'));
            const visibleGameIds = gameLinks.map(link => {
                try {
                    const url = new URL(link.href);
                    const placeId = url.searchParams.get('PlaceId');
                    return placeId ? parseInt(placeId, 10) : null;
                } catch (e) {
                    return null;
                }
            }).filter(id => id !== null);

            hiddenGames = allGamesCache.filter(game => {
                if (!game.rootPlace || !game.rootPlace.id) {
                    return false;
                }
                return !visibleGameIds.includes(game.rootPlace.id);
            });

            const { likeMap, playerMap } = await fetchGameDetails(hiddenGames);
            displayedGameCount = 0;
            loadedGameIds.clear();
            const loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Load More';
            loadMoreButton.classList.add('load-more-button', 'tab-button');
            loadMoreButton.style.display = 'none';
            loadMoreButton.style.position = 'relative';
            loadMoreButton.style.bottom = '0';
            loadMoreButton.style.marginTop = '5px';
            loadMoreButton.style.marginLeft = 'auto';
            loadMoreButton.style.marginRight = 'auto';
            loadMoreButton.style.paddingLeft = '0px';
            loadMoreButton.style.paddingRight = '0px';
            loadMoreButton.style.display = 'inline-block';
            loadMoreButton.style.width = '100%';

            hiddenGamesContainer.appendChild(hiddenGamesGrid);

            function displayGames(gamesToDisplay) {
                gamesToDisplay.forEach((game, index) => {
                    const gameId = game.rootPlace?.id;
                    const universeId = game.id;
                    if (loadedGameIds.has(universeId)) return;
                    loadedGameIds.add(universeId);
                    if (gameId) {
                        const gameElement = document.createElement('div');
                        gameElement.classList.add('game-container', 'shown');
                        gameElement.setAttribute('data-index', index);
                        gameElement.style.marginLeft = '1px';
                        gameElement.style.padding = '0px';


                        const gameLink = document.createElement('a');
                        gameLink.href = `https://www.roblox.com/games/${gameId}`;
                        gameLink.style.textDecoration = 'none';
                        gameLink.style.display = 'block';
                        gameLink.style.width = '150%';
                        gameLink.style.height = '100%';
                        gameElement.appendChild(gameLink)


                        const gameImage = document.createElement('img');
                        gameImage.style.alignSelf = 'center';
                        gameImage.style.width = '150px';
                        gameImage.style.height = '150px';
                        gameImage.style.borderRadius = '8px';
                        gameImage.style.marginBottom = '5px';
                        gameImage.style.transition = 'filter 0.5s ease';

                        const gameName = document.createElement('span');
                        let gameTitle = game.name;
                        gameName.classList.add('game-name');
                        gameName.setAttribute('data-full-name', gameTitle)
                        gameName.style.fontWeight = '700';
                        gameName.style.fontSize = '16px';
                        gameName.style.textAlign = 'left'
                        gameName.style.marginBottom = '5px'
                        gameName.style.width = "150px";
                        gameName.style.whiteSpace = 'normal';
                        gameName.style.overflowWrap = 'break-word';
                        const maxLength = 18;
                        if (gameTitle.length > maxLength) {
                            gameTitle = gameTitle.substring(0, maxLength - 3) + "...";
                        }
                        gameName.textContent = gameTitle;

                        const ratingContainer = document.createElement('div');
                        ratingContainer.style.display = 'flex';
                        ratingContainer.style.alignItems = 'center';

                        const likes = document.createElement('span');
                        likes.style.fontSize = '12px';
                        likes.textContent = '0%';
                        const players = document.createElement('span');
                        players.style.fontSize = '12px';
                        players.textContent = '0';

                        const likeIcon = document.createElement('span');
                        likeIcon.style.boxSizing = 'border-box';
                        likeIcon.style.display = 'inline-block';
                        likeIcon.style.height = '16px';
                        likeIcon.style.width = '16px';
                        likeIcon.style.textSizAdjust = '100%';
                        likeIcon.style.fontFamily = '"Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif';
                        likeIcon.style.fontSize = '12px';
                        likeIcon.style.fontWeight = '500';
                        likeIcon.style.lineHeight = '18px';
                        likeIcon.style.textAlign = 'start';
                        likeIcon.style.textWrap = 'wrap';
                        likeIcon.style.verticalAlign = 'middle';
                        likeIcon.style.whiteSpaceCollapse = 'collapse';
                        likeIcon.style.color = 'rgba(255, 255, 255, 0.7)';
                        likeIcon.style.backgroundImage = `url(https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg)`;
                        likeIcon.style.backgroundPositionX = '0px';
                        likeIcon.style.backgroundPositionY = '-32px';
                        likeIcon.style.backgroundRepeat = 'no-repeat';
                        likeIcon.style.backgroundSize = '32px';
                        likeIcon.style.cursor = 'pointer';
                        likeIcon.style.textRendering = 'auto';
                        likeIcon.style.WebkitFontSmoothing = 'antialiased';
                        likeIcon.style.listStyleImage = 'none';
                        likeIcon.style.listStylePosition = 'outside';
                        likeIcon.style.listStyleType = 'none';
                        likeIcon.style.marginRight = '5px'

                        const playerIcon = document.createElement('span');
                        playerIcon.style.boxSizing = 'border-box';
                        playerIcon.style.display = 'inline-block';
                        playerIcon.style.height = '16px';
                        playerIcon.style.width = '16px';
                        playerIcon.style.textSizAdjust = '100%';
                        playerIcon.style.fontFamily = '"Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif';
                        playerIcon.style.fontSize = '12px';
                        playerIcon.style.fontWeight = '500';
                        playerIcon.style.lineHeight = '18px';
                        playerIcon.style.textAlign = 'start';
                        playerIcon.style.textWrap = 'wrap';
                        playerIcon.style.verticalAlign = 'middle';
                        playerIcon.style.whiteSpaceCollapse = 'collapse';
                        playerIcon.style.color = 'rgba(255, 255, 255, 0.7)';
                        playerIcon.style.backgroundImage = `url(https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg)`;
                        playerIcon.style.backgroundPositionX = '0px';
                        playerIcon.style.backgroundPositionY = '-48px';
                        playerIcon.style.backgroundRepeat = 'no-repeat';
                        playerIcon.style.backgroundSize = '32px';
                        playerIcon.style.cursor = 'pointer';
                        playerIcon.style.textRendering = 'auto';
                        playerIcon.style.WebkitFontSmoothing = 'antialiased';
                        playerIcon.style.listStyleImage = 'none';
                        playerIcon.style.listStylePosition = 'outside';
                        playerIcon.style.listStyleType = 'none';
                        playerIcon.style.marginRight = '5px'
                        const likeRatio = likeMap.get(universeId) || 0;
                        likes.textContent = `${likeRatio}%`;
                        const playerCount = playerMap.get(universeId) || 0;
                        players.textContent = playerCount;
                        likes.style.marginRight = '10px';

                        retryFetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)
                            .then(response => response ? response.json() : null)
                            .then(thumbnailData => {
                                if (thumbnailData && thumbnailData.data && thumbnailData.data.length > 0 && thumbnailData.data[0].imageUrl) {
                                    gameImage.src = thumbnailData.data[0].imageUrl;
                                } else {
                                    gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                }
                            })
                            .catch(error => {
                                gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                            });


                        gameLink.appendChild(gameImage);
                        gameLink.appendChild(gameName);
                        gameLink.appendChild(ratingContainer);
                        ratingContainer.appendChild(likeIcon);
                        ratingContainer.appendChild(likes);
                        ratingContainer.appendChild(playerIcon);
                        ratingContainer.appendChild(players);

                        hiddenGamesGrid.appendChild(gameElement);


                        gameImage.addEventListener('mouseenter', () => {
                            gameImage.style.filter = 'brightness(0.8)';
                        });
                        gameImage.addEventListener('mouseleave', () => {
                            gameImage.style.filter = 'brightness(1)';
                        });
                        applyTheme()
                    }
                });
            }


            function loadMoreGames() {
                const gamesToLoad = hiddenGames.slice(displayedGameCount, displayedGameCount + 12);
                displayGames(gamesToLoad);
                displayedGameCount += gamesToLoad.length;
                if (displayedGameCount >= hiddenGames.length) {
                    loadMoreButton.style.display = 'none';
                }
                setTimeout(alignGameRows, 0);
            }

            if (hiddenGames.length === 0) {
                const noGames = document.createElement('p');
                noGames.textContent = "No hidden games found.";
                noGames.style.gridColumn = '1 / -1';
                hiddenGamesGrid.appendChild(noGames);
                loadMoreButton.style.display = 'none';
            } else {
                const initialGames = hiddenGames.slice(0, 12);
                displayGames(initialGames);
                displayedGameCount = initialGames.length;
                if (displayedGameCount < hiddenGames.length) {
                    loadMoreButton.style.display = 'block';
                } else {
                    loadMoreButton.style.display = 'none';
                }
                loadMoreButton.addEventListener('click', loadMoreGames);
            }

            hiddenGamesContainer.appendChild(loadMoreButton);
            groupGamesContainer.parentNode.insertBefore(hiddenGamesContainer, groupGamesContainer.nextSibling);

            function alignGameRows() {
                const gameContainers = Array.from(hiddenGamesGrid.querySelectorAll('.game-container.shown'));
                if (gameContainers.length === 0) return;

                let currentRowStart = gameContainers[0].offsetTop;
                let currentRow = [];
                let maxNameHeight = 0;

                gameContainers.forEach(container => {
                    if (container.offsetTop !== currentRowStart) {
                        currentRow.forEach(gameElement => {
                            const ratingContainer = gameElement.querySelector('.game-container > div');
                            if (ratingContainer) {
                                ratingContainer.style.paddingBottom = `${maxNameHeight - gameElement.querySelector('.game-name').offsetHeight}px`;
                            }
                        });

                        currentRowStart = container.offsetTop;
                        currentRow = [container];
                        maxNameHeight = container.querySelector('.game-name').offsetHeight;
                    } else {
                        currentRow.push(container);
                        maxNameHeight = Math.max(maxNameHeight, container.querySelector('.game-name').offsetHeight);
                    }
                });

                currentRow.forEach(gameElement => {
                    const ratingContainer = gameElement.querySelector('.game-container > div');
                    if (ratingContainer) {
                        ratingContainer.style.paddingBottom = `${maxNameHeight - gameElement.querySelector('.game-name').offsetHeight}px`;
                    }
                });
            }


            const experiencesButton = document.createElement('button');
            experiencesButton.textContent = "Experiences";
            experiencesButton.classList.add('tab-button', 'active-tab');


            const hiddenGamesButton = document.createElement('button');
            hiddenGamesButton.textContent = "Hidden Experiences";
            hiddenGamesButton.classList.add('tab-button');

            hiddenGamesButton.addEventListener('click', async () => {
                if (hiddenGamesActive) return;
                hiddenGamesActive = true;
                groupGamesContainer.style.display = 'none';
                hiddenGamesContainer.style.display = 'flex';
                hiddenGamesGrid.style.display = 'grid';
                hiddenGamesGrid.innerHTML = '';
                hiddenGamesButton.classList.add('active-tab');
                experiencesButton.classList.remove('active-tab');

                const gameLinks = Array.from(groupGamesContainer.querySelectorAll('ul.game-cards > li.list-item > group-games-item > div.game-card-container > a.game-card-link'));
                const visibleGameIds = gameLinks.map(link => {
                    try {
                        const url = new URL(link.href);
                        const placeId = url.searchParams.get('PlaceId');
                        return placeId ? parseInt(placeId, 10) : null;
                    } catch (e) {
                        return null;
                    }
                }).filter(id => id !== null);
                hiddenGames = allGamesCache.filter(game => {
                    if (!game.rootPlace || !game.rootPlace.id) {
                        return false;
                    }
                    return !visibleGameIds.includes(game.rootPlace.id);
                });
                const { likeMap, playerMap } = await fetchGameDetails(hiddenGames);
                displayedGameCount = 0;
                loadedGameIds.clear();


                function displayGames(gamesToDisplay) {
                    gamesToDisplay.forEach((game, index) => {
                        const gameId = game.rootPlace?.id;
                        const universeId = game.id;
                        if (loadedGameIds.has(universeId)) return;
                        loadedGameIds.add(universeId);

                        if (gameId) {
                            const gameElement = document.createElement('div');
                            gameElement.classList.add('game-container', 'shown');
                            gameElement.setAttribute('data-index', index);
                            gameElement.style.marginLeft = '1px';
                            gameElement.style.padding = '0px';


                            const gameLink = document.createElement('a');
                            gameLink.href = `https://www.roblox.com/games/${gameId}`;
                            gameLink.style.textDecoration = 'none';
                            gameLink.style.display = 'block';
                            gameLink.style.width = '150%';
                            gameLink.style.height = '100%';
                            gameElement.appendChild(gameLink)


                            const gameImage = document.createElement('img');
                            gameImage.style.alignSelf = 'center';
                            gameImage.style.width = '150px';
                            gameImage.style.height = '150px';
                            gameImage.style.borderRadius = '8px';
                            gameImage.style.marginBottom = '5px';
                            gameImage.style.transition = 'filter 0.5s ease';

                            const gameName = document.createElement('span');
                            let gameTitle = game.name;
                            gameName.classList.add('game-name');
                            gameName.setAttribute('data-full-name', gameTitle)
                            gameName.style.fontWeight = '700';
                            gameName.style.fontSize = '16px';
                            gameName.style.textAlign = 'left'
                            gameName.style.marginBottom = '5px'
                            gameName.style.width = "150px";
                            gameName.style.whiteSpace = 'normal';
                            gameName.style.overflowWrap = 'break-word';
                            const maxLength = 18;
                            if (gameTitle.length > maxLength) {
                                gameTitle = gameTitle.substring(0, maxLength - 3) + "...";
                            }
                            gameName.textContent = gameTitle;

                            const ratingContainer = document.createElement('div');
                            ratingContainer.style.display = 'flex';
                            ratingContainer.style.alignItems = 'center';

                            const likes = document.createElement('span');
                            likes.style.fontSize = '12px';
                            likes.textContent = '0%';
                            const players = document.createElement('span');
                            players.style.fontSize = '12px';
                            players.textContent = '0';

                            const likeIcon = document.createElement('span');
                            likeIcon.style.boxSizing = 'border-box';
                            likeIcon.style.display = 'inline-block';
                            likeIcon.style.height = '16px';
                            likeIcon.style.width = '16px';
                            likeIcon.style.textSizAdjust = '100%';
                            likeIcon.style.fontFamily = '"Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif';
                            likeIcon.style.fontSize = '12px';
                            likeIcon.style.fontWeight = '500';
                            likeIcon.style.lineHeight = '18px';
                            likeIcon.style.textAlign = 'start';
                            likeIcon.style.textWrap = 'wrap';
                            likeIcon.style.verticalAlign = 'middle';
                            likeIcon.style.whiteSpaceCollapse = 'collapse';
                            likeIcon.style.color = 'rgba(255, 255, 255, 0.7)';
                            likeIcon.style.backgroundImage = `url(https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg)`;
                            likeIcon.style.backgroundPositionX = '0px';
                            likeIcon.style.backgroundPositionY = '-32px';
                            likeIcon.style.backgroundRepeat = 'no-repeat';
                            likeIcon.style.backgroundSize = '32px';
                            likeIcon.style.cursor = 'pointer';
                            likeIcon.style.textRendering = 'auto';
                            likeIcon.style.WebkitFontSmoothing = 'antialiased';
                            likeIcon.style.listStyleImage = 'none';
                            likeIcon.style.listStylePosition = 'outside';
                            likeIcon.style.listStyleType = 'none';
                            likeIcon.style.marginRight = '5px'

                            const playerIcon = document.createElement('span');
                            playerIcon.style.boxSizing = 'border-box';
                            playerIcon.style.display = 'inline-block';
                            playerIcon.style.height = '16px';
                            playerIcon.style.width = '16px';
                            playerIcon.style.textSizAdjust = '100%';
                            playerIcon.style.fontFamily = '"Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif';
                            playerIcon.style.fontSize = '12px';
                            playerIcon.style.fontWeight = '500';
                            playerIcon.style.lineHeight = '18px';
                            playerIcon.style.textAlign = 'start';
                            playerIcon.style.textWrap = 'wrap';
                            playerIcon.style.verticalAlign = 'middle';
                            playerIcon.style.whiteSpaceCollapse = 'collapse';
                            playerIcon.style.color = 'rgba(255, 255, 255, 0.7)';
                            playerIcon.style.backgroundImage = `url(https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg)`;
                            playerIcon.style.backgroundPositionX = '0px';
                            playerIcon.style.backgroundPositionY = '-48px';
                            playerIcon.style.backgroundRepeat = 'no-repeat';
                            playerIcon.style.backgroundSize = '32px';
                            playerIcon.style.cursor = 'pointer';
                            playerIcon.style.textRendering = 'auto';
                            playerIcon.style.WebkitFontSmoothing = 'antialiased';
                            playerIcon.style.listStyleImage = 'none';
                            playerIcon.style.listStylePosition = 'outside';
                            playerIcon.style.listStyleType = 'none';
                            playerIcon.style.marginRight = '5px'
                            const likeRatio = likeMap.get(universeId) || 0;
                            likes.textContent = `${likeRatio}%`;
                            const playerCount = playerMap.get(universeId) || 0;
                            players.textContent = playerCount;
                            likes.style.marginRight = '10px';

                        retryFetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)
                            .then(response => response ? response.json() : null)
                            .then(thumbnailData => {
                                if (thumbnailData && thumbnailData.data && thumbnailData.data.length > 0 && thumbnailData.data[0].imageUrl) {
                                    gameImage.src = thumbnailData.data[0].imageUrl;
                                } else {
                                    gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                }
                            })
                            .catch(error => {
                                gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                            });


                        gameLink.appendChild(gameImage);
                        gameLink.appendChild(gameName);
                        gameLink.appendChild(ratingContainer);
                        ratingContainer.appendChild(likeIcon);
                        ratingContainer.appendChild(likes);
                        ratingContainer.appendChild(playerIcon);
                        ratingContainer.appendChild(players);

                        hiddenGamesGrid.appendChild(gameElement);


                        gameImage.addEventListener('mouseenter', () => {
                            gameImage.style.filter = 'brightness(0.8)';
                        });
                        gameImage.addEventListener('mouseleave', () => {
                            gameImage.style.filter = 'brightness(1)';
                        });
                        applyTheme();
                    }
                });
            }
            loadMoreButton.style.display = 'none';
            if (hiddenGames.length === 0) {
                const noGames = document.createElement('p');
                noGames.textContent = "No hidden games found.";
                noGames.style.gridColumn = '1 / -1';
                hiddenGamesGrid.appendChild(noGames);
            } else {
                const initialGames = hiddenGames.slice(0, 12);
                displayGames(initialGames);
                displayedGameCount = initialGames.length;
                if (displayedGameCount < hiddenGames.length) {
                    loadMoreButton.style.display = 'block';
                }
                loadMoreButton.addEventListener('click', () => {
                    const gamesToLoad = hiddenGames.slice(displayedGameCount, displayedGameCount + 12);
                    displayGames(gamesToLoad);
                    displayedGameCount += gamesToLoad.length;
                    if (displayedGameCount >= hiddenGames.length) {
                        loadMoreButton.style.display = 'none';
                    }
                });

            }
            applyTheme();
        });
        setTimeout(alignGameRows, 0);


        experiencesButton.addEventListener('click', () => {
            hiddenGamesActive = false;
            groupGamesContainer.style.display = 'block';
            hiddenGamesContainer.style.display = 'none';
            hiddenGamesGrid.style.display = 'none';
            experiencesButton.classList.add('active-tab');
            hiddenGamesButton.classList.remove('active-tab');
        });

        const createAndInsertButtons = (retryAttempt = 0) => {
            if (!containerHeader) {
                containerHeader = document.querySelector("#group-container > div > div > div.group-details.col-xs-12.ng-scope.col-sm-9 > div > group-games > div > div.container-header");
                if (!containerHeader) {
                    const groupGamesElement = document.querySelector('group-games[ng-if*="library.currentGroup.areGroupGamesVisible"]');
                    if (groupGamesElement) {
                        containerHeader = groupGamesElement.querySelector('div.section > div.container-header');
                    }
                }
            }

            if (containerHeader) {
                if (!containerHeader.querySelector('.tab-button')) {
                    containerHeader.appendChild(experiencesButton);
                    containerHeader.appendChild(hiddenGamesButton);
                } else {
                  
                }
            } else {
                if (retryAttempt < 5) {
                    setTimeout(() => createAndInsertButtons(retryAttempt + 1), 1000);
                } else {
                }
            }
        };

        createAndInsertButtons();

        if (currentTheme) {
            applyTheme();
        }

    };
    const checkUrlAndApply = () => {
        const currentHash = window.location.hash;
        if (currentHash === '#!/about') {
            applyHiddenGamesLogic();
        }
    };
    checkUrlAndApply();
    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                for (const node of mutation.addedNodes) {
                    if (node.classList && (node.classList.contains('group-games') || (node.id === "group-container" && node.querySelector('.group-games')) || node.tagName === 'GROUP-GAMES')) {
                        applyHiddenGamesLogic();
                        break;
                    }
                }
            }
        }
    });

    setTimeout(() => {
        observer.observe(document.body, { childList: true, subtree: true });
    }, 0);

    window.addEventListener('hashchange', () => {
        checkUrlAndApply();
    });
}
}