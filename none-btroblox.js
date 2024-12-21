console.log('Switched to non-btroblox functionality');
// I AINT making new comments for the same script but for people who HATE QoL 🦢🦢🦢🦢🦢🦢🦢🦢
const userId = window.location.pathname.split('/')[2];

if (userId) {
    fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`)
        .then(response => response.json())
        .then(data => {
            console.log('Fetched hidden games:', data);

            const containerHeader = document.querySelector("#creations > div.profile-game.ng-scope.section > div.container-header");
            const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
            const switcherContainer = document.querySelector('.switcher.slide-switcher.games.ng-isolate-scope');
            const hiddenGamesContainer = document.createElement('div');
            hiddenGamesContainer.classList.add('hidden-games-list');
            hiddenGamesContainer.style.display = 'none';

            const switcherGames = Array.from(switcherContainer ? switcherContainer.querySelectorAll('a[href^="https://www.roblox.com/games/"]') : []);
            const visibleGameIds = switcherGames.map(link => {
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
            const gamesButton = document.createElement('button');
            gamesButton.textContent = "Games";
            gamesButton.classList.add('tab-button', 'active-tab');

            const hiddenGamesButton = document.createElement('button');
            hiddenGamesButton.textContent = "Hidden Games";
            hiddenGamesButton.classList.add('tab-button');

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
            if (containerHeader) {
                containerHeader.appendChild(gamesButton);
                containerHeader.appendChild(hiddenGamesButton);
                containerHeader.appendChild(hiddenGamesContainer);
            }
        })
        .catch(error => {
            console.error('Error fetching hidden games in non-btroblox mode:', error);
        });
}

// Makes it cool and good looking like valra (No lie)
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
