// Extract User ID from the URL
const userId = window.location.pathname.split('/')[2];

if (userId) {
    // Fetch hidden games from the Roblox API
    fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`)
        .then(response => response.json())
        .then(data => {
            // Locate the "Experiences" header container and elements specific to btroblox
            const experiencesContainer = document.querySelector('.hlist.btr-games-list');
            const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
            const pager = profileGameSection ? profileGameSection.querySelector('.btr-pager') : null; // Find the btr-pager inside profile-game section

            // If btroblox elements (with 'btr' class) are not found, log the switch to the console
            if (!experiencesContainer) {
                console.log('Switching to non-btroblox functionality');
                loadNonBtrobloxFile(); // Load non-btroblox functionality
                return; // Exit the current function to prevent further processing
            }

            // Process btroblox-specific logic
            const containerHeader = document.querySelector('.container-header'); // This is not from btroblox, so we keep it as-is
            const hiddenGamesContainer = document.createElement('div');
            hiddenGamesContainer.classList.add('hidden-games-list');
            hiddenGamesContainer.style.display = 'none'; // Hide by default

            // Find all game links in the "Experiences" section (inside the hlist.btr-games-list)
            const gameLinks = Array.from(
                experiencesContainer.querySelectorAll('a[href^="https://www.roblox.com/games/"]')
            );

            // Extract the game IDs from the links
            const visibleGameIds = gameLinks.map(link => {
                const urlParts = link.href.split('/');
                return urlParts[urlParts.length - 1]; // The game ID is the last part of the URL
            });

            // Filter and add only hidden games (those not in the visible list)
            const hiddenGames = data.data.filter(game => {
                const gameId = game.rootPlace?.id; // Extract the rootPlace ID
                return gameId && !visibleGameIds.includes(gameId.toString()); // Exclude visible games
            });

            if (hiddenGames.length === 0) {
                const noGames = document.createElement('p');
                noGames.textContent = "No hidden games found.";
                hiddenGamesContainer.appendChild(noGames);
            } else {
                hiddenGames.forEach(game => {
                    const gameId = game.rootPlace?.id; // Extract the rootPlace ID
                    if (gameId) {
                        const gameElement = document.createElement('div');
                        gameElement.classList.add('game-item');

                        const gameName = document.createElement('span');
                        gameName.textContent = game.name;
                        gameName.classList.add('game-name'); // Add class for hover effect

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

            // Add the hidden games container to the page
            if (containerHeader && experiencesContainer) {
                experiencesContainer.parentNode.appendChild(hiddenGamesContainer);

                // Create tab buttons
                const experiencesButton = document.createElement('button');
                experiencesButton.textContent = "Experiences";
                experiencesButton.classList.add('tab-button', 'active-tab');

                const hiddenGamesButton = document.createElement('button');
                hiddenGamesButton.textContent = "Hidden Experiences";
                hiddenGamesButton.classList.add('tab-button');

                // Add functionality to switch tabs
                hiddenGamesButton.addEventListener('click', () => {
                    experiencesContainer.style.display = 'none';
                    hiddenGamesContainer.style.display = 'block';
                    hiddenGamesButton.classList.add('active-tab');
                    experiencesButton.classList.remove('active-tab');

                    // Hide the btr-pager inside the profile-game section when on the Hidden Games tab
                    if (pager) {
                        pager.style.display = 'none'; // Hide btr-pager
                    }
                });

                experiencesButton.addEventListener('click', () => {
                    experiencesContainer.style.display = 'block';
                    hiddenGamesContainer.style.display = 'none';
                    experiencesButton.classList.add('active-tab');
                    hiddenGamesButton.classList.remove('active-tab');

                    // Show the btr-pager inside the profile-game section when back on the Experiences tab
                    if (pager) {
                        pager.style.display = 'block'; // Show btr-pager
                    }
                });

                // Insert buttons into the container header
                containerHeader.appendChild(experiencesButton);
                containerHeader.appendChild(hiddenGamesButton);
            }
        })
        .catch(error => {
            console.error('Error fetching hidden games:', error);
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
        cursor: pointer; /* Make the entire item clickable */
        transition: box-shadow 0.3s ease-in-out; /* Smooth transition for the glow effect */
    }
    .game-name {
        display: inline-block;
        color: white;
    }
    .game-item:hover {
        box-shadow: 0 0 15px 5px rgba(255, 255, 255, 0.7); /* Glow effect around the button */
    }
    .game-item a {
        display: none; /* Hide actual link */
    }
    .hidden-games-list {
        margin-top: 20px;
    }
`;
document.head.appendChild(style);

// Function to load non-btroblox fallback
function loadNonBtrobloxFile() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('none-btroblox.js'); // Assuming 'none-btroblox.js' is your fallback file
    document.body.appendChild(script);
}
