console.log('Switched to non-btroblox functionality');

// Extract User ID from the URL
const userId = window.location.pathname.split('/')[2];

if (userId) {
    // Fetch hidden games from the Roblox API
    fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`)
        .then(response => response.json())
        .then(data => {
            console.log('Fetched hidden games:', data);

            // Locate the container where we'll add the buttons
            const containerHeader = document.querySelector("#creations > div.profile-game.ng-scope.section > div.container-header");
            const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
            const switcherContainer = document.querySelector('.switcher.slide-switcher.games.ng-isolate-scope');
            const hiddenGamesContainer = document.createElement('div');
            hiddenGamesContainer.classList.add('hidden-games-list');
            hiddenGamesContainer.style.display = 'none'; // Hidden by default

            // Find all game links inside the switcher (to exclude games already visible)
            const switcherGames = Array.from(switcherContainer ? switcherContainer.querySelectorAll('a[href^="https://www.roblox.com/games/"]') : []);
            const visibleGameIds = switcherGames.map(link => {
                const urlParts = link.href.split('/');
                return urlParts[urlParts.length - 1]; // The game ID is the last part of the URL
            });

            // Filter out visible games and only show the hidden ones
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
                        gameLink.style.display = 'none'; // Hide actual link

                        gameElement.appendChild(gameName);
                        gameElement.appendChild(gameLink);
                        hiddenGamesContainer.appendChild(gameElement);

                        // Make the entire game element clickable
                        gameElement.addEventListener('click', () => {
                            window.open(gameLink.href, '_blank'); // Open game in a new tab
                        });
                    }
                });
            }

            // Create tab buttons
            const gamesButton = document.createElement('button');
            gamesButton.textContent = "Games";
            gamesButton.classList.add('tab-button', 'active-tab');

            const hiddenGamesButton = document.createElement('button');
            hiddenGamesButton.textContent = "Hidden Games";
            hiddenGamesButton.classList.add('tab-button');

            // Add functionality to switch tabs
            hiddenGamesButton.addEventListener('click', () => {
                switcherContainer.style.display = 'none';
                hiddenGamesContainer.style.display = 'block';
                hiddenGamesButton.classList.add('active-tab');
                gamesButton.classList.remove('active-tab');
            });

            gamesButton.addEventListener('click', () => {
                switcherContainer.style.display = 'block';
                hiddenGamesContainer.style.display = 'none';
                gamesButton.classList.add('active-tab');
                hiddenGamesButton.classList.remove('active-tab');
            });

            // Insert buttons into the container header (before the hidden games container)
            if (containerHeader) {
                containerHeader.appendChild(gamesButton);
                containerHeader.appendChild(hiddenGamesButton);

                // Now insert the hidden games container
                containerHeader.appendChild(hiddenGamesContainer);
            }
        })
        .catch(error => {
            console.error('Error fetching hidden games in non-btroblox mode:', error);
        });
}

// Add styles for the tabs and games
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
        margin-top: 17px;
    }
`;
document.head.appendChild(style);
