let currentTheme = 'light';

window.addEventListener('themeDetected', (event) => {
    currentTheme = event.detail.theme;
    applyTheme();
});

const currentURL = window.location.href;
const regex = /https:\/\/www.roblox\.com\/(?:[a-z]{2}\/)?users\/(\d+)/;
const match = currentURL.match(regex);
let userId = null;
if (match && match[1]) {
    userId = match[1];
}

const retryFetch = async (url, retries = 5, delay = 3000) => {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(url);
            if (response.status === 429) {
                if (i < retries) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                } else {
                    throw new Error('Exceeded max retries for rate-limited request.');
                }
            } else if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i >= retries) {
                return null;
            }
        }
    }
    return null;
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
    return {
        likeMap,
        playerMap
    };
};

function applyTheme() {
    const isDarkMode = currentTheme === 'dark';
    const likeIconUrl = isDarkMode ?
        'https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg' :
        'https://images.rbxcdn.com/994d61715b1d8899f7c7abe114ec452a-common_sm_light_12032018.svg';

    const countColor = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
    const titleColor = isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgb(57, 59, 61)';


    const buttonTextColor = isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgb(57, 59, 61)';
    const buttonBgColor = isDarkMode ? 'rgb(45, 48, 51)' : 'rgb(242, 244, 245)';
    const buttonHoverBgColor = isDarkMode ? 'rgb(57, 60, 64)' : 'rgb(224, 226, 227)';
    const buttonActiveBgColor = isDarkMode ? 'rgb(69, 73, 77)' : 'rgb(210, 212, 213)';
    const buttonBorder = isDarkMode ? '0px solid rgba(255, 255, 255, 0.1)' : '0 solid rgba(0, 0, 0, 0.1)';

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

        const noGames = hiddenGamesContainer.querySelector('p');
        if (noGames) {
            noGames.style.color = titleColor;
            noGames.style.textAlign = 'center';
            noGames.style.width = '100%';
            noGames.style.padding = '20px 0';
        }
    });

    const tabButtons = document.querySelectorAll('.tab-button');
    const loadMoreButtons = document.querySelectorAll('.load-more-button');

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

    return likeIconUrl;
}

const initHiddenGamesFeature = (profileGameSection) => {
    if (profileGameSection.dataset.hiddenGamesInitialized === 'true') {
        return;
    }
    profileGameSection.dataset.hiddenGamesInitialized = 'true';

    fetch(`https://inventory.roblox.com/v1/users/${userId}/places/inventory?itemsPerPage=100&placesTab=Created`)
        .then(response => {
            if (!response) throw new Error("Initial fetch returned null, likely due to network errors or retries failing.");
            return response.json();
        })
        .then(async initialData => {
            let allGames = (initialData.data || []).map(game => ({
                id: game.universeId,
                name: game.name,
                rootPlace: {
                    id: game.placeId
                }
            }));
            let nextCursor = initialData.nextPageCursor;

            while (nextCursor) {
                const nextResponse = await fetch(`https://inventory.roblox.com/v1/users/${userId}/places/inventory?itemsPerPage=100&placesTab=Created&cursor=${nextCursor}`);
                const nextData = await nextResponse.json();
                if (nextData && nextData.data) {
                    const mappedData = nextData.data.map(game => ({
                        id: game.universeId,
                        name: game.name,
                        rootPlace: {
                            id: game.placeId
                        }
                    }));
                    allGames = allGames.concat(mappedData);
                    nextCursor = nextData.nextPageCursor;
                } else {
                    nextCursor = null;
                }
            }

            const experiencesContainer = document.querySelector('.hlist.btr-games-list');
            if (profileGameSection) {
                profileGameSection.style.marginBottom = '0';
                profileGameSection.style.paddingTop = '2px';
            }
            let allHiddenGames;
            if (!experiencesContainer) {
                let containerHeader = profileGameSection.querySelector(".container-header");
                if (!containerHeader) {
                    const gameSection = document.querySelector('.profile-game.section') ||
                        document.querySelector('#creations') ||
                        document.querySelector('.profile-game');
                    if (gameSection) {
                        containerHeader = document.createElement('div');
                        containerHeader.classList.add('container-header');
                        containerHeader.style.display = 'flex';
                        containerHeader.style.alignItems = 'center';
                        containerHeader.style.margin = '12px 0';
                        containerHeader.style.padding = '0 12px';
                        gameSection.insertBefore(containerHeader, gameSection.firstChild);
                    } else {
                        return;
                    }
                }

                if (containerHeader) {
                    const experiencesHeader = containerHeader.querySelector('h3[ng-non-bindable]');
                    if (experiencesHeader) {
                        experiencesHeader.remove();
                    }
                    containerHeader.style.gap = '8px';
                }

                const switcherContainer = document.querySelector('.switcher.slide-switcher.games.ng-isolate-scope');
                if (!switcherContainer) {
                    return;
                }
                const hiddenGamesWrapper = document.createElement('div');
                hiddenGamesWrapper.classList.add('hidden-games-wrapper');
                hiddenGamesWrapper.style.display = 'none';
                hiddenGamesWrapper.style.flexDirection = 'column';
                const hiddenGamesContainer = document.createElement('div');
                hiddenGamesContainer.classList.add('hidden-games-list');
                hiddenGamesContainer.style.display = 'grid';
                hiddenGamesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
                hiddenGamesContainer.style.gap = '12px';
                hiddenGamesContainer.style.marginTop = '5px';
                hiddenGamesContainer.style.width = '100%';
                hiddenGamesContainer.style.boxSizing = 'border-box';
                hiddenGamesContainer.style.padding = '0 10px';
                hiddenGamesContainer.style.overflowX = 'hidden';
                const switcherGames = Array.from(switcherContainer ? switcherContainer.querySelectorAll('a[href^="https://www.roblox.com/games/"]') : []);
                const visibleGameIds = switcherGames.map(link => {
                    const urlParts = link.href.split('/');
                    return urlParts[urlParts.length - 1];
                });

                allHiddenGames = allGames.filter(game => {
                    const gameId = game.rootPlace?.id;
                    return gameId && !visibleGameIds.includes(gameId.toString());
                });

                let displayedGameCount = 0;
                const loadMoreButton = document.createElement('button');
                loadMoreButton.textContent = 'Load More';
                loadMoreButton.className = 'load-more-button tab-button';
                
                Object.assign(loadMoreButton.style, {
                    boxSizing: 'border-box',
                    border: '1px solid transparent',
                    margin: '20px auto',
                    padding: '0 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '120px',
                    height: '36px',
                    width: 'auto',
                    fontSize: '14px',
                    fontWeight: '500',
                    textAlign: 'center',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s, border-color 0.2s'
                });

                const loadMoreButtonWrapper = document.createElement('div');
                loadMoreButtonWrapper.style.width = '100%';
                loadMoreButtonWrapper.style.display = 'flex';
                loadMoreButtonWrapper.style.justifyContent = 'center';
                loadMoreButtonWrapper.appendChild(loadMoreButton);
                hiddenGamesWrapper.appendChild(hiddenGamesContainer);
                const {
                    likeMap,
                    playerMap
                } = await fetchGameDetails(allHiddenGames)

                const sanitizeHTML = (str) => {
                    const temp = document.createElement('div');
                    temp.textContent = str;
                    return temp.innerHTML;
                };

                function displayGames(gamesToDisplay) {
                    gamesToDisplay.forEach((game, index) => {
                        const gameId = game.rootPlace?.id;
                        const universeId = game.id;
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
                            let gameTitle = sanitizeHTML(game.name);
                            gameName.classList.add('game-name');
                            gameName.setAttribute('data-full-name', gameTitle)
                            gameName.style.fontWeight = '700';
                            gameName.style.fontSize = '16px';
                            gameName.style.textAlign = 'left'
                            gameName.style.marginBottom = '5px'
                            gameName.style.width = "150px";
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
                            likeIcon.style.backgroundImage = applyTheme();
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
                            playerIcon.style.backgroundImage = applyTheme();
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
                            applyTheme()
                            const likeRatio = likeMap.get(universeId) || 0
                            likes.textContent = `${likeRatio}%`;
                            const playerCount = playerMap.get(universeId) || 0
                            players.textContent = playerCount
                            likes.style.marginRight = '10px'
                            retryFetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)
                                .then(response => response ? response.json() : null)
                                .then(thumbnailData => {
                                    if (thumbnailData && thumbnailData.data && thumbnailData.data.length > 0 && thumbnailData.data[0].imageUrl) {
                                        const thumbnailUrl = thumbnailData.data[0].imageUrl;
                                        gameImage.src = thumbnailUrl;
                                    } else {
                                        gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                    }
                                })
                                .catch(error => {
                                    gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                });
                            gameLink.appendChild(gameImage);
                            gameLink.appendChild(gameName);
                            gameLink.appendChild(ratingContainer)
                            ratingContainer.appendChild(likeIcon)
                            ratingContainer.appendChild(likes);
                            ratingContainer.appendChild(playerIcon)
                            ratingContainer.appendChild(players)
                            hiddenGamesContainer.appendChild(gameElement);
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

                function loadMoreGames(isBTR) {
                    const gamesToLoad = allHiddenGames.slice(displayedGameCount, displayedGameCount + (isBTR ? 12 : 10));
                    displayGames(gamesToLoad);
                    applyTheme()
                    displayedGameCount += gamesToLoad.length;
                    if (displayedGameCount >= allHiddenGames.length) {
                        loadMoreButtonWrapper.style.display = 'none';
                    } else {
                        loadMoreButtonWrapper.style.display = 'flex';
                    }
                }
                if (allHiddenGames.length === 0) {
                    const noGames = document.createElement('p');
                    noGames.textContent = "No hidden experiences found.";
                    noGames.style.gridColumn = '1 / -1';
                    noGames.style.textAlign = 'center';
                    noGames.style.width = '100%';
                    noGames.style.padding = '20px 0';
                    noGames.style.margin = '0';
                    noGames.style.fontSize = '16px';
                    hiddenGamesContainer.appendChild(noGames);
                    loadMoreButtonWrapper.style.display = 'none'
                } else {
                    loadMoreGames(false);
                    if (displayedGameCount < allHiddenGames.length) {
                        loadMoreButtonWrapper.style.display = 'flex';
                    }
                    loadMoreButton.addEventListener('click', () => loadMoreGames(false));
                }
                if (allHiddenGames.length > 0) {
                    hiddenGamesWrapper.appendChild(loadMoreButtonWrapper)
                }
                const experiencesButton = document.createElement('button');
                experiencesButton.textContent = "Experiences";
                experiencesButton.classList.add('tab-button', 'active-tab');
                experiencesButton.style.padding = '8px 16px';
                experiencesButton.style.borderRadius = '8px';
                experiencesButton.style.cursor = 'pointer';
                experiencesButton.style.transition = 'background-color 0.2s ease';
                experiencesButton.style.margin = '0 4px';
                experiencesButton.style.fontWeight = 'bold';
                experiencesButton.style.minWidth = '120px';
                experiencesButton.style.outline = 'none';
                
                const hiddenGamesButton = document.createElement('button');
                hiddenGamesButton.textContent = "Hidden Experiences";
                hiddenGamesButton.classList.add('tab-button');
                hiddenGamesButton.style.padding = '8px 16px';
                hiddenGamesButton.style.borderRadius = '8px';
                hiddenGamesButton.style.cursor = 'pointer';
                hiddenGamesButton.style.transition = 'background-color 0.2s ease';
                hiddenGamesButton.style.margin = '0 4px';
                hiddenGamesButton.style.fontWeight = 'bold';
                hiddenGamesButton.style.minWidth = '120px';
                hiddenGamesButton.style.outline = 'none';
                
                hiddenGamesButton.addEventListener('click', () => {
                    switcherContainer.style.display = 'none';
                    hiddenGamesWrapper.style.display = 'flex';
                    hiddenGamesButton.classList.add('active-tab');
                    experiencesButton.classList.remove('active-tab');
                    if (allHiddenGames.length > 0 && displayedGameCount < allHiddenGames.length)
                        loadMoreButtonWrapper.style.display = 'flex';
                    applyTheme();
                });
                experiencesButton.addEventListener('click', () => {
                    switcherContainer.style.display = 'block';
                    hiddenGamesWrapper.style.display = 'none';
                    experiencesButton.classList.add('active-tab');
                    hiddenGamesButton.classList.remove('active-tab');
                    loadMoreButtonWrapper.style.display = 'none'
                });
                if (containerHeader) {
                    containerHeader.appendChild(experiencesButton);
                    containerHeader.appendChild(hiddenGamesButton);
                    profileGameSection.appendChild(hiddenGamesWrapper);
                }
                if (currentTheme) {
                    applyTheme()
                }
            } else {
                const buttonContainer = document.createElement('div');
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '10px';
                const experiencesButton = document.createElement('button');
                experiencesButton.textContent = "Experiences";
                experiencesButton.classList.add('tab-button', 'active-tab');
                
                experiencesButton.style.padding = '8px 16px';
                experiencesButton.style.borderRadius = '8px';
                experiencesButton.style.cursor = 'pointer';
                experiencesButton.style.transition = 'background-color 0.2s ease';
                experiencesButton.style.fontWeight = 'bold';
                experiencesButton.style.minWidth = '120px';
                experiencesButton.style.outline = 'none';
                
                const hiddenGamesButton = document.createElement('button');
                hiddenGamesButton.textContent = "Hidden Experiences";
                hiddenGamesButton.classList.add('tab-button');

                hiddenGamesButton.style.padding = '8px 16px';
                hiddenGamesButton.style.borderRadius = '8px';
                hiddenGamesButton.style.cursor = 'pointer';
                hiddenGamesButton.style.transition = 'background-color 0.2s ease';
                hiddenGamesButton.style.fontWeight = 'bold';
                hiddenGamesButton.style.minWidth = '120px';
                hiddenGamesButton.style.outline = 'none';
                
                buttonContainer.appendChild(experiencesButton);
                buttonContainer.appendChild(hiddenGamesButton);
                let containerHeader = profileGameSection.querySelector('.container-header');
                if (containerHeader) {
                    const experiencesHeader = containerHeader.querySelector('h3[ng-non-bindable]');
                    if (experiencesHeader) {
                        experiencesHeader.remove();
                    }
                    containerHeader.style.justifyContent = 'flex-start';
                    containerHeader.appendChild(buttonContainer);
                }
                const hiddenGamesWrapper = document.createElement('div');
                hiddenGamesWrapper.classList.add('hidden-games-wrapper');
                hiddenGamesWrapper.style.display = 'none';
                hiddenGamesWrapper.style.flexDirection = 'column';
                hiddenGamesWrapper.style.marginTop = '12px';
                const hiddenGamesContainer = document.createElement('div');
                hiddenGamesContainer.classList.add('hidden-games-list');
                hiddenGamesContainer.style.display = 'grid';
                hiddenGamesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
                hiddenGamesContainer.style.gap = '20px';
                hiddenGamesContainer.style.width = '100%';
                hiddenGamesContainer.style.boxSizing = 'border-box';
                const gameCards = Array.from(
                    profileGameSection.querySelectorAll('.game-card-link')
                );
                const visibleGameIds = gameCards.map(link => {
                    const match = link.href.match(/\/games\/(\d+)/);
                    return match ? match[1] : null;
                }).filter(id => id);
                allHiddenGames = allGames.filter(game => {
                    const gameId = game.rootPlace?.id;
                    return gameId && !visibleGameIds.includes(gameId.toString());
                });

                hiddenGamesWrapper.appendChild(hiddenGamesContainer);
                const {
                    likeMap,
                    playerMap
                } = await fetchGameDetails(allHiddenGames)

                function displayGames(gamesToDisplay) {
                    gamesToDisplay.forEach((game, index) => {
                        const gameId = game.rootPlace?.id;
                        const universeId = game.id;
                        if (gameId) {
                            const gameElement = document.createElement('div');
                            gameElement.classList.add('game-container', 'shown');
                            gameElement.setAttribute('data-index', index);
                            gameElement.style.padding = '0px';
                            const gameLink = document.createElement('a');
                            gameLink.href = `https://www.roblox.com/games/${gameId}`;
                            gameLink.style.textDecoration = 'none';
                            gameLink.style.display = 'flex';
                            gameLink.style.flexDirection = 'column';
                            gameLink.style.height = '100%';
                            gameElement.appendChild(gameLink)
                            const gameImage = document.createElement('img');
                            gameImage.style.width = '150px';
                            gameImage.style.height = '150px';
                            gameImage.style.borderRadius = '8px';
                            gameImage.style.marginBottom = '8px';
                            gameImage.style.transition = 'filter 0.5s ease';
                            const gameName = document.createElement('span');
                            let gameTitle = game.name;
                            gameName.classList.add('game-name');
                            gameName.setAttribute('data-full-name', gameTitle)
                            gameName.style.fontWeight = '500';
                            gameName.style.fontSize = '14px';
                            gameName.style.textAlign = 'left'
                            gameName.style.marginBottom = '5px'
                            gameName.style.width = "150px";
                            gameName.style.whiteSpace = 'nowrap';
                            gameName.style.overflow = 'hidden';
                            gameName.style.textOverflow = 'ellipsis';
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
                            likeIcon.style.backgroundImage = `url(https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg)`;
                            likeIcon.style.backgroundPositionX = '0px';
                            likeIcon.style.backgroundPositionY = '-32px';
                            likeIcon.style.backgroundRepeat = 'no-repeat';
                            likeIcon.style.backgroundSize = '32px';
                            likeIcon.style.marginRight = '5px';
                            const playerIcon = document.createElement('span');
                            playerIcon.style.boxSizing = 'border-box';
                            playerIcon.style.display = 'inline-block';
                            playerIcon.style.height = '16px';
                            playerIcon.style.width = '16px';
                            playerIcon.style.backgroundImage = `url(https://images.rbxcdn.com/87b4f6103befbe2c1e9c13eb9d7064db-common_sm_dark_12032018.svg)`;
                            playerIcon.style.backgroundPositionX = '0px';
                            playerIcon.style.backgroundPositionY = '-48px';
                            playerIcon.style.backgroundRepeat = 'no-repeat';
                            playerIcon.style.backgroundSize = '32px';
                            playerIcon.style.marginRight = '5px';
                            const likeRatio = likeMap.get(universeId) || 0
                            likes.textContent = `${likeRatio}%`;
                            const playerCount = playerMap.get(universeId) || 0
                            players.textContent = playerCount
                            likes.style.marginRight = '10px'
                            applyTheme()
                            retryFetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`)
                                .then(response => response ? response.json() : null)
                                .then(thumbnailData => {
                                    if (thumbnailData && thumbnailData.data && thumbnailData.data.length > 0 && thumbnailData.data[0].imageUrl) {
                                        const thumbnailUrl = thumbnailData.data[0].imageUrl;
                                        gameImage.src = thumbnailUrl;
                                    } else {
                                        gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                    }
                                })
                                .catch(error => {
                                    gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                });
                            gameLink.appendChild(gameImage);
                            gameLink.appendChild(gameName);
                            gameLink.appendChild(ratingContainer)
                            ratingContainer.appendChild(likeIcon)
                            ratingContainer.appendChild(likes);
                            ratingContainer.appendChild(playerIcon)
                            ratingContainer.appendChild(players)
                            hiddenGamesContainer.appendChild(gameElement);
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
                
                applyTheme()
                if (allHiddenGames.length === 0) {
                    const noGames = document.createElement('p');
                    noGames.textContent = "No hidden experiences found.";
                    noGames.style.gridColumn = '1 / -1';
                    noGames.style.textAlign = 'center';
                    noGames.style.width = '100%';
                    noGames.style.padding = '20px 0';
                    noGames.style.margin = '0';
                    noGames.style.fontSize = '16px';
                    hiddenGamesContainer.appendChild(noGames);
                } else {
                    displayGames(allHiddenGames);
                }

                profileGameSection.appendChild(hiddenGamesWrapper);
                const gridView = profileGameSection.querySelector('.game-grid');
                const slideshowView = profileGameSection.querySelector('#games-switcher');
                const pagers = profileGameSection.querySelectorAll('.btr-pager-holder, .load-more-button');
                
                hiddenGamesButton.addEventListener('click', () => {
                    if (gridView) gridView.style.display = 'none';
                    if (slideshowView) slideshowView.style.display = 'none';
                    pagers.forEach(p => p.style.display = 'none');
                    hiddenGamesWrapper.style.display = 'flex';
                    applyTheme();
                });
                experiencesButton.addEventListener('click', () => {
                    if (gridView) gridView.style.display = '';
                    if (slideshowView) slideshowView.style.display = '';
                    pagers.forEach(p => p.style.display = '');
                    hiddenGamesWrapper.style.display = 'none';
                    applyTheme();
                });
            }
            if (currentTheme) {
                applyTheme()
            }
        })
        .catch(error => {
            if (profileGameSection) {
                profileGameSection.dataset.hiddenGamesInitialized = 'false';
            }
        });
};

function runInitialization() {
    if (userId) {
        const observer = new MutationObserver((mutationsList, obs) => {
            const profileGameSection = document.querySelector('.profile-game.section');

            if (!profileGameSection || profileGameSection.dataset.hiddenGamesInitialized === 'true') {
                return;
            }

            const gamesListReady = profileGameSection.querySelector('.game-card, .switcher-item, .btr-game-card');

            if (gamesListReady) {
                obs.disconnect();
                initHiddenGamesFeature(profileGameSection);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialization);
} else {
    runInitialization();
}