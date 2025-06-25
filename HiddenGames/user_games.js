let currentTheme = 'light';

window.addEventListener('themeDetected', (event) => {
    currentTheme = event.detail.theme;
    applyTheme();
});
const currentURL = window.location.href;
const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?users\/(\d+)/;
        const match = currentURL.match(regex);
        let userId = null;
    if (match && match[1]) {
        userId = match[1]
     }

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

document.addEventListener('DOMContentLoaded', function() { 
    if (userId) {
        fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Desc`)
            .then(response => response.json())
            .then(async initialData => {
                let allGames = initialData.data || [];
                let nextCursor = initialData.nextPageCursor;
                while (nextCursor) {
                    const nextResponse = await fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Desc&cursor=${nextCursor}`);
                    const nextData = await nextResponse.json();
                    if (nextData && nextData.data) {
                        allGames = allGames.concat(nextData.data);
                        nextCursor = nextData.nextPageCursor;
                    } else {
                        nextCursor = null;
                    }
                }
                const experiencesContainer = document.querySelector('.hlist.btr-games-list');
                const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
                const pager = profileGameSection ? profileGameSection.querySelector('.btr-pager') : null;
                if (profileGameSection) {
                    profileGameSection.style.marginBottom = '0';
                    profileGameSection.style.paddingTop = '2px';
                }
                // incase you hate QoL on roblox 🤔

                let allHiddenGames;
                 if (!experiencesContainer) {
                   
                    let containerHeader = document.querySelector("#creations > div.profile-game.ng-scope.section > div.container-header");

                    if (!containerHeader) {
                        containerHeader = document.querySelector(".profile-game.section.ng-scope > div.container-header");
                    }
                    
                    if (!containerHeader) {
                        containerHeader = document.querySelector("#creations > div.profile-game.ng-scope.section .container-header");
                    }
                    
                    if (!containerHeader) {
                        containerHeader = document.querySelector(".profile-game.section > div.container-header");
                    }
                    
                    if (!containerHeader) {
                        containerHeader = document.querySelector("#creations .container-header");
                    }
                    
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
                        }
                    }
                    const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
                    if (profileGameSection) {
                        profileGameSection.style.marginBottom = '0';
                        profileGameSection.style.paddingTop = '2px';
                    }
                    const switcherContainer = document.querySelector('.switcher.slide-switcher.games.ng-isolate-scope');
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
                    loadMoreButton.classList.add('load-more-button', 'tab-button');
                    loadMoreButton.style.display = 'block';
                    loadMoreButton.style.position = 'relative';
                    loadMoreButton.style.padding = '8px 16px';
                    loadMoreButton.style.borderRadius = '8px';
                    loadMoreButton.style.cursor = 'pointer';
                    loadMoreButton.style.transition = 'background-color 0.2s ease';
                    loadMoreButton.style.margin = '12px auto';
                    loadMoreButton.style.minWidth = '120px';

                    const loadMoreButtonWrapper = document.createElement('div');
                    loadMoreButtonWrapper.style.width = '100%';
                    loadMoreButtonWrapper.style.display = 'flex';
                    loadMoreButtonWrapper.style.justifyContent = 'center';
                    loadMoreButtonWrapper.style.padding = '0 10px';
                    loadMoreButtonWrapper.appendChild(loadMoreButton);


                    hiddenGamesWrapper.appendChild(hiddenGamesContainer);



                    const { likeMap, playerMap } = await fetchGameDetails(allHiddenGames)
                    // Ik ik there is 2 of these functions, Well i got it working ok??? i dont wanna fix something i that doesnt change anything 😠
                    // wawa wa im going insane wa wa wa wa idek what code this is i gotta start writing stuff manually more, ALSO ROREGION SUCKS STRAIGHT ASSSSSSSS
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
                                let gameTitle = game.name;
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
                                            gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a'; // This code is so bad, idk why i did it like this 😭
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
                         if(displayedGameCount < allHiddenGames.length){
                             loadMoreButtonWrapper.style.display = 'flex';
                        }
                        loadMoreButton.addEventListener('click', () => loadMoreGames(false));
                    }
                      if (allHiddenGames.length > 0){
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
                        containerHeader.appendChild(hiddenGamesWrapper);
                    } else {
                    }
                     if(currentTheme){
                       applyTheme()
                     }
                } else {
                
                    let containerHeader = document.querySelector('.container-header');

                    if (!containerHeader) {
                        containerHeader = experiencesContainer.querySelector('.container-header');
                    }
                    if (!containerHeader) {
                        containerHeader = document.querySelector('.container-header');
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

                    const gameLinks = Array.from(
                        experiencesContainer.querySelectorAll('a[href^="https://www.roblox.com/games/"]')
                    );
                    const visibleGameIds = gameLinks.map(link => {
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
                    loadMoreButton.classList.add('load-more-button', 'tab-button');
                    loadMoreButton.style.display = 'block';
                    loadMoreButton.style.position = 'relative';
                    loadMoreButton.style.padding = '8px 16px';
                    loadMoreButton.style.borderRadius = '8px';
                    loadMoreButton.style.cursor = 'pointer';
                    loadMoreButton.style.transition = 'background-color 0.2s ease';
                    loadMoreButton.style.margin = '12px auto';
                    loadMoreButton.style.minWidth = '120px';

                    const loadMoreButtonWrapper = document.createElement('div');
                    loadMoreButtonWrapper.style.width = '100%';
                    loadMoreButtonWrapper.style.display = 'flex';
                    loadMoreButtonWrapper.style.justifyContent = 'center';
                    loadMoreButtonWrapper.style.padding = '0 10px';
                    loadMoreButtonWrapper.appendChild(loadMoreButton);

                    hiddenGamesWrapper.appendChild(hiddenGamesContainer);


                    const { likeMap, playerMap } = await fetchGameDetails(allHiddenGames)

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
                                let gameTitle = game.name;
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
                                playerIcon.style.backgroundRepeat = 'no-repeat';
                                playerIcon.style.backgroundSize = '32px';
                                playerIcon.style.cursor = 'pointer';
                                playerIcon.style.textRendering = 'auto';
                                playerIcon.style.WebkitFontSmoothing = 'antialiased';
                                playerIcon.style.listStyleImage = 'none';
                                playerIcon.style.listStylePosition = 'outside';
                                playerIcon.style.listStyleType = 'none';
                                playerIcon.style.marginRight = '5px'
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
                      function loadMoreGames(isBTR) {
                        const gamesToLoad = allHiddenGames.slice(displayedGameCount, displayedGameCount + (isBTR ? 12 : 10));
                        displayGames(gamesToLoad);
                        displayedGameCount += gamesToLoad.length;
                        if (displayedGameCount >= allHiddenGames.length) {
                            loadMoreButtonWrapper.style.display = 'none';
                        } else {
                          loadMoreButtonWrapper.style.display = 'flex';
                        }
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
                         loadMoreButtonWrapper.style.display = 'none'
                    } else {
                        loadMoreGames(true);
                         if (displayedGameCount < allHiddenGames.length) {
                            loadMoreButtonWrapper.style.display = 'flex';
                        }
                        loadMoreButton.addEventListener('click', () => loadMoreGames(true));
                    }
                      if(allHiddenGames.length > 0){
                        hiddenGamesWrapper.appendChild(loadMoreButtonWrapper)
                     }
                    experiencesContainer.parentNode.appendChild(hiddenGamesWrapper);
                    const experiencesButton = document.createElement('button');
                    experiencesButton.textContent = "Experiences";
                    experiencesButton.classList.add('tab-button', 'active-tab');


                    const hiddenGamesButton = document.createElement('button');
                    hiddenGamesButton.textContent = "Hidden Experiences";
                    hiddenGamesButton.classList.add('tab-button');

                    let headerContainer = document.querySelector('.container-header');
                    if (!headerContainer) {
                        headerContainer = document.querySelector('.profile-game-container .container-header');
                    }
                    if (!headerContainer) {
                        headerContainer = document.createElement('div');
                        headerContainer.classList.add('container-header');
                        headerContainer.style.display = 'flex';
                        headerContainer.style.gap = '8px';
                        headerContainer.style.alignItems = 'center';
                        headerContainer.style.marginBottom = '16px';
                        headerContainer.style.gap = '8px';
                        headerContainer.style.alignItems = 'center';
                        headerContainer.style.marginBottom = '16px';
                        headerContainer.style.paddingLeft = '4px';
                        experiencesContainer.parentNode.insertBefore(headerContainer, experiencesContainer);
                    }

                    headerContainer.appendChild(experiencesButton);
                    headerContainer.appendChild(hiddenGamesButton);

                    hiddenGamesButton.addEventListener('click', () => {
                        experiencesContainer.style.display = 'none';
                        hiddenGamesWrapper.style.display = 'flex';
                        hiddenGamesButton.classList.add('active-tab');
                        experiencesButton.classList.remove('active-tab');

                        if (pager) {
                            pager.style.display = 'none';
                        }
                           if (allHiddenGames.length > 0 && displayedGameCount < allHiddenGames.length)
                            loadMoreButtonWrapper.style.display = 'flex';

                    });

                    experiencesButton.addEventListener('click', () => {
                        experiencesContainer.style.display = 'block';
                        hiddenGamesWrapper.style.display = 'none';
                        experiencesButton.classList.add('active-tab');
                        hiddenGamesButton.classList.remove('active-tab');
                        if (pager) {
                            pager.style.display = 'block';
                        }
                         loadMoreButtonWrapper.style.display = 'none';
                    });

                    if (containerHeader) {
                        containerHeader.appendChild(experiencesButton);
                        containerHeader.appendChild(hiddenGamesButton);
                    } else {
                    }
                }
                  if(currentTheme){
                       applyTheme()
                     }
            })

            .catch(error => {
            });
    }
});