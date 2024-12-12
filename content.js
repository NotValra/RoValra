if (window.location.pathname.startsWith('/communities')) {
    console.log("GROUP!!!");
    const groupId = window.location.pathname.split('/')[2];
    console.log("Group ID:", groupId);

    if (groupId) {
        // Fetch group games from the Roblox API
        fetch(`https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=Asc`)
            .then(response => response.json())
            .then(data => {
                const retryInterval = 1000; // Time in milliseconds between retries (1 second)
                const maxRetries = 10; // Max number of retries before stopping

                function checkElements(retries = 0) {
                    const groupGamesContainer = document.querySelector('.group-games');
                    const containerHeader = document.querySelector("#group-container > div > div > div.group-details.col-xs-12.ng-scope.col-sm-9 > div > div:nth-child(3) > div > group-games > div > div.container-header");

                    if (!groupGamesContainer || !containerHeader) {
                        if (retries < maxRetries) {
                            console.log(`Retrying... Attempt ${retries + 1}`);
                            setTimeout(() => checkElements(retries + 1), retryInterval);
                        } else {
                            console.log("Group games container or header not found, most likely meaning the group has no games.");
                        }
                    } else {
                        console.log("Elements found successfully!");

                        const hiddenGamesContainer = document.createElement('div');
                        hiddenGamesContainer.classList.add('hidden-games-list');
                        hiddenGamesContainer.style.display = 'none';

                        // Find all visible game links by checking all anchor tags in groupGamesContainer
                        const gameLinks = Array.from(groupGamesContainer.querySelectorAll('a[href^="https://www.roblox.com/games/refer?PlaceId="]'));

                        // Get the game IDs from the visible game links by extracting the PlaceId query parameter
                        const visibleGameIds = gameLinks.map(link => {
                            const url = new URL(link.href);
                            return url.searchParams.get('PlaceId'); // Extracts PlaceId
                        });

                        // Loop through all game containers (all classes) and find any hidden games
                        const hiddenGames = data.data.filter(game => {
                            const gameId = game.rootPlace?.id;
                            return gameId && !visibleGameIds.includes(gameId.toString());
                        });

                        if (hiddenGames.length === 0) {
                            const noGames = document.createElement('p');
                            noGames.textContent = "No hidden games found.";
                            hiddenGamesContainer.appendChild(noGames);
                        } else {
                            hiddenGames.forEach(game => {
                                const gameId = game.rootPlace?.id;
                                if (gameId) {
                                    const gameElement = document.createElement('div');
                                    gameElement.classList.add('game-item');

                                    const gameName = document.createElement('span');
                                    gameName.textContent = game.name;
                                    gameName.classList.add('game-name');

                                    const gameLink = document.createElement('a');
                                    gameLink.href = `https://www.roblox.com/games/${gameId}`;
                                    gameLink.target = "_blank";
                                    gameLink.style.display = 'none';

                                    gameElement.appendChild(gameName);
                                    gameElement.appendChild(gameLink);
                                    hiddenGamesContainer.appendChild(gameElement);

                                    gameElement.addEventListener('click', () => {
                                        window.open(gameLink.href, '_blank');
                                    });
                                }
                            });
                        }

                        groupGamesContainer.parentNode.appendChild(hiddenGamesContainer);

                        // Create tab buttons
                        const experiencesButton = document.createElement('button');
                        experiencesButton.textContent = "Experiences";
                        experiencesButton.classList.add('tab-button', 'active-tab');

                        const hiddenGamesButton = document.createElement('button');
                        hiddenGamesButton.textContent = "Hidden Experiences";
                        hiddenGamesButton.classList.add('tab-button');

                        // Add tab functionality
                        hiddenGamesButton.addEventListener('click', () => {
                            groupGamesContainer.style.display = 'none';
                            hiddenGamesContainer.style.display = 'block';
                            hiddenGamesButton.classList.add('active-tab');
                            experiencesButton.classList.remove('active-tab');
                        });

                        experiencesButton.addEventListener('click', () => {
                            groupGamesContainer.style.display = 'block';
                            hiddenGamesContainer.style.display = 'none';
                            experiencesButton.classList.add('active-tab');
                            hiddenGamesButton.classList.remove('active-tab');
                        });

                        containerHeader.appendChild(experiencesButton);
                        containerHeader.appendChild(hiddenGamesButton);
                    }
                }

                // Start checking for the elements
                checkElements();
            })
            .catch(error => {
                console.error('Error fetching group games:', error);
            });
    }
}


 else {
    const userId = window.location.pathname.split('/')[2];
    console.log("User ID:", userId);
    if (userId) {
        // Fetch hidden games from the Roblox API
        fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`)
            .then(response => response.json())
            .then(data => {
                // Original user-specific logic
                const experiencesContainer = document.querySelector('.hlist.btr-games-list');
                const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
                const pager = profileGameSection ? profileGameSection.querySelector('.btr-pager') : null;

                if (!experiencesContainer) {
                    console.log('Switching to non-btroblox functionality');
                    loadNonBtrobloxFile();
                    return;
                }

                const containerHeader = document.querySelector('.container-header');
                const hiddenGamesContainer = document.createElement('div');
                hiddenGamesContainer.classList.add('hidden-games-list');
                hiddenGamesContainer.style.display = 'none';

                const gameLinks = Array.from(
                    experiencesContainer.querySelectorAll('a[href^="https://www.roblox.com/games/"]')
                );

                const visibleGameIds = gameLinks.map(link => {
                    const urlParts = link.href.split('/');
                    return urlParts[urlParts.length - 1];
                });

                const hiddenGames = data.data.filter(game => {
                    const gameId = game.rootPlace?.id;
                    return gameId && !visibleGameIds.includes(gameId.toString());
                });

                if (hiddenGames.length === 0) {
                    const noGames = document.createElement('p');
                    noGames.textContent = "No hidden games found.";
                    hiddenGamesContainer.appendChild(noGames);
                } else {
                    hiddenGames.forEach(game => {
                        const gameId = game.rootPlace?.id;
                        if (gameId) {
                            const gameElement = document.createElement('div');
                            gameElement.classList.add('game-item');

                            const gameName = document.createElement('span');
                            gameName.textContent = game.name;
                            gameName.classList.add('game-name');

                            const gameLink = document.createElement('a');
                            gameLink.href = `https://www.roblox.com/games/${gameId}`;
                            gameLink.target = "_blank";
                            gameLink.style.display = 'none';

                            gameElement.appendChild(gameName);
                            gameElement.appendChild(gameLink);
                            hiddenGamesContainer.appendChild(gameElement);

                            gameElement.addEventListener('click', () => {
                                window.open(gameLink.href, '_blank');
                            });
                        }
                    });
                }

                experiencesContainer.parentNode.appendChild(hiddenGamesContainer);

                const experiencesButton = document.createElement('button');
                experiencesButton.textContent = "Experiences";
                experiencesButton.classList.add('tab-button', 'active-tab');

                const hiddenGamesButton = document.createElement('button');
                hiddenGamesButton.textContent = "Hidden Experiences";
                hiddenGamesButton.classList.add('tab-button');

                hiddenGamesButton.addEventListener('click', () => {
                    experiencesContainer.style.display = 'none';
                    hiddenGamesContainer.style.display = 'block';
                    hiddenGamesButton.classList.add('active-tab');
                    experiencesButton.classList.remove('active-tab');

                    if (pager) {
                        pager.style.display = 'none';
                    }
                });

                experiencesButton.addEventListener('click', () => {
                    experiencesContainer.style.display = 'block';
                    hiddenGamesContainer.style.display = 'none';
                    experiencesButton.classList.add('active-tab');
                    hiddenGamesButton.classList.remove('active-tab');

                    if (pager) {
                        pager.style.display = 'block';
                    }
                });

                containerHeader.appendChild(experiencesButton);
                containerHeader.appendChild(hiddenGamesButton);
            })
            .catch(error => {
                console.error('Error fetching hidden games:', error);
            });
    }
}

// Add styles for tabs and games
const style = document.createElement('style');
style.textContent = `
    .tab-button {
        margin-left: 10px;
        padding: 5px 10px;
        background-color: #444;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
    }
    .tab-button:hover {
        background-color: #555;
    }
    .active-tab {
        background-color: #666;
    }
    .game-item {
        background-color: #333;
        color: white;
        padding: 10px;
        margin: 5px 0;
        border-radius: 5px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: box-shadow 0.3s ease-in-out;
    }
    .game-name {
        display: inline-block;
        color: white;
    }
    .game-item:hover {
        box-shadow: 0 0 15px 5px rgba(255, 255, 255, 0.7);
    }
    .game-item a {
        display: none;
    }
    .hidden-games-list {
        margin-top: 20px;
    }
`;
document.head.appendChild(style);

// Function to load non-btroblox fallback
function loadNonBtrobloxFile() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('none-btroblox.js');
    document.body.appendChild(script);
}




