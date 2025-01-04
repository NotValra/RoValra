const retryFetch = async (url, retries = 5, delay = 3000) => {
    try {
        const response = await fetch(url);
        if (response.status === 429) {
            if (retries > 0) {
                console.log(`Rate limited, retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return retryFetch(url, retries - 1, delay * 2);
            } else {
                console.error('Max retries reached, giving up on:', url);
                return null;
            }
        }
        return response;
    } catch (error) {
        console.error('Fetch error:', error);
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


if (window.location.pathname.startsWith('/communities')) {
    console.log("GROUP!!! i mean community 😔");
    const groupId = window.location.pathname.split('/')[2];
    console.log("Group ID:", groupId);
    if (groupId) {
        // api stuff yes
        fetch(`https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=desc`)
            .then(response => response.json())
            .then(async data => {
                // This makes sure YOUR potato can run this (my (valras) pc would never require this)
                const retryInterval = 1000;
                const maxRetries = 10;

                async function checkElements(retries = 0) { // Make checkElements async
                    const groupGamesContainer = document.querySelector('.group-games');
                    const containerHeader = document.querySelector("#group-container > div > div > div.group-details.col-xs-12.ng-scope.col-sm-9 > div > div:nth-child(3) > div > group-games > div > div.container-header");

                    if (!groupGamesContainer || !containerHeader) {
                        // in case of potato
                        if (retries < maxRetries) {
                            console.log(`Retrying... Attempt ${retries + 1}`);
                            setTimeout(() => checkElements(retries + 1), retryInterval);
                        }
                        else {
                            console.log("Group likely aint games got👀🥒🔥");
                        }
                    }
                    else {
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


                        // Honestly no idea what this does 🤔😖
                         const gameLinks = Array.from(groupGamesContainer.querySelectorAll('a[href^="https://www.roblox.com/games/refer?PlaceId="]'));

                        const visibleGameIds = gameLinks.map(link => {
                             const url = new URL(link.href);
                            return parseInt(url.searchParams.get('PlaceId'), 10); 
                        });
                        // Filter hidden games (doesnt work im lazy)
                         const hiddenGames = data.data.filter(game => {
                            if (!game.rootPlace || !game.rootPlace.id) {
                                return false; 
                            }
                           return !visibleGameIds.includes(game.rootPlace.id);
                        });
                        
                        const { likeMap, playerMap } = await fetchGameDetails(hiddenGames)
                         let displayedGameCount = 0;
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
                                        playerIcon.style.backgroundPositionY = '-48px'; // Corrected line
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


                                        // gets the games thumbnail so it looks all nice and nice
                                        retryFetch(`https://www.roblox.com/item-thumbnails?params=[{"assetId":${gameId}}]`)
                                            .then(response => response ? response.json() : null)
                                            .then(thumbnailData => {
                                                if (thumbnailData && thumbnailData.length > 0 && thumbnailData[0].thumbnailUrl) {
                                                    gameImage.src = thumbnailData[0].thumbnailUrl;
                                                } else {
                                                    gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                                }

                                            })
                                            .catch(error => {
                                                console.error('Error fetching thumbnail for game:', gameId, error);
                                                gameImage.src = 'https://t4.rbxcdn.com/f652a7f81606a413f9814925e122a54a';
                                            });




                                    gameLink.appendChild(gameImage);
                                    gameLink.appendChild(gameName);
                                    gameLink.appendChild(ratingContainer)
                                    ratingContainer.appendChild(likeIcon)
                                    ratingContainer.appendChild(likes);
                                    ratingContainer.appendChild(playerIcon)
                                    ratingContainer.appendChild(players)

                                     hiddenGamesGrid.appendChild(gameElement);


                                    gameImage.addEventListener('mouseenter', () => {
                                        gameImage.style.filter = 'brightness(0.8)';
                                    });
                                    gameImage.addEventListener('mouseleave', () => {
                                        gameImage.style.filter = 'brightness(1)';
                                    });

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
                        }

                         if (hiddenGames.length === 0) {
                            const noGames = document.createElement('p');
                            noGames.textContent = "No hidden games found.";
                            hiddenGamesGrid.appendChild(noGames);
                        } else {
                            const initialGames = hiddenGames.slice(0, 6);
                                displayGames(initialGames);
                                displayedGameCount = initialGames.length;
                                if (displayedGameCount < hiddenGames.length) {
                                   loadMoreButton.style.display = 'block';
                                 }
                                 loadMoreButton.addEventListener('click', loadMoreGames);

                        }
                        hiddenGamesContainer.appendChild(loadMoreButton)
                        groupGamesContainer.parentNode.appendChild(hiddenGamesContainer);


                        const experiencesButton = document.createElement('button');
                        experiencesButton.textContent = "Experiences";
                        experiencesButton.classList.add('tab-button', 'active-tab');

                        const hiddenGamesButton = document.createElement('button');
                        hiddenGamesButton.textContent = "Hidden Experiences";
                        hiddenGamesButton.classList.add('tab-button');


                        hiddenGamesButton.addEventListener('click', () => {
                            groupGamesContainer.style.display = 'none';
                             hiddenGamesContainer.style.display = 'flex';
                             hiddenGamesGrid.style.display = 'grid';
                            hiddenGamesButton.classList.add('active-tab');
                            experiencesButton.classList.remove('active-tab');
                        });

                        experiencesButton.addEventListener('click', () => {
                            groupGamesContainer.style.display = 'block';
                            hiddenGamesContainer.style.display = 'none';
                            hiddenGamesGrid.style.display = 'none';
                            experiencesButton.classList.add('active-tab');
                            hiddenGamesButton.classList.remove('active-tab');
                        });

                        containerHeader.appendChild(experiencesButton);
                        containerHeader.appendChild(hiddenGamesButton);
                    }
                }

                checkElements();
            })
            .catch(error => {
                // Wow something didnt go as planned WHAAAAAAAAAAAAAAAAAAATTTTTTTTTTTTTTTTTTTTT
                console.error('Error fetching group games:', error);
            });
    }
}