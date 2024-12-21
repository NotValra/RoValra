if (window.location.pathname.startsWith('/catalog') || window.location.pathname.startsWith('/bundles')) {

    // Extract the item ID from the URL
    const itemId = parseInt(window.location.pathname.split('/')[2], 10);
    console.log("Extracted item ID:", itemId);


    fetch('https://raw.githubusercontent.com/workframes/roblox-owner-counts/refs/heads/main/items.json') // FRAMES GIVE ME MY MUTLI TOOL I HAVE WAITED WAYYYYYY TOO LONG AHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
        .then(response => response.json())
        .then(data => {
            const items = data.item || [];

            if (items.length === 0) {
                console.log('No items found in the fetched data.');
                return;
            }

            const item = items.find(item => item.id === itemId || parseInt(item.id, 10) === itemId);

            if (item) {
                console.log("Item found:", item);
// This makes sure even ur potato pc can run this
                const retryFindElement = (selector, maxRetries, delay, callback) => {
                    let retries = 0;
                    const interval = setInterval(() => {
                        const element = document.querySelector(selector);
                        if (element) {
                            clearInterval(interval);
                            callback(element);
                        } else if (retries >= maxRetries) {
                            clearInterval(interval);
                            console.log(`${selector} not found after ${maxRetries} retries.`);
                        }
                        retries++;
                    }, delay);
                };
// This finds location yes yes
                const contentElementCallback = (contentElement) => {
                    retryFindElement("#item-container", 20, 100, (itemContainerElement) => {
                        retryFindElement(".remove-panel.section-content.top-section", 20, 100, (removePanelElement) => {
                            retryFindElement("#item-info-container-frontend", 20, 100, (itemInfoContainerElement) => {
                                retryFindElement(".shopping-cart.item-details-info-content", 20, 100, (shoppingCartElement) => {
                                    retryFindElement("#item-details", 20, 100, (itemDetailsElement) => {
                                        retryFindElement(".price-row-container", 20, 100, (priceRowContainer) => {
                                            retryFindElement(".item-info-row-container", 20, 100, (iteminforowcontainer) => {
                                                retryFindElement(".text-label.row-label.price-label", 20, 100, (textlabelrowlabelpricelabel) => {
                                                    const salesDiv = document.createElement('div');
                                                    salesDiv.classList.add('item-sales');
                                                    salesDiv.innerHTML = `<strong>Sales:</strong> ${item.sales.toLocaleString()}`;
                                                    salesDiv.style.color = "#bdbebe";
                                                    salesDiv.style.marginTop = "10px";
                                                    salesDiv.style.marginLeft = "0px";

                                                    const revenueDiv = document.createElement('div');
                                                    revenueDiv.classList.add('item-revenue');
                                                    revenueDiv.innerHTML = `<strong>Revenue:</strong> $${(item.revenue / 100).toFixed(2)}`;
                                                    revenueDiv.style.color = "#bdbebe";
                                                    revenueDiv.style.marginTop = "10px";
                                                    revenueDiv.style.marginLeft = "0";

                                                    textlabelrowlabelpricelabel.appendChild(salesDiv);
                                                    textlabelrowlabelpricelabel.appendChild(revenueDiv);

                                                    console.log("If you see this that means Valra prob forgot to sleep and has now been awake for 24 hours.");
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                };

                retryFindElement(".content", 20, 100, contentElementCallback);

            } else {
                console.log("Item not found.");
            }
        })
        .catch(error => {
            // Something messed up hehe
            console.error('Error fetching data:', error);
        });
}




else
if (window.location.pathname.startsWith('/communities')) {
    console.log("GROUP!!! i mean community 😔");
    const groupId = window.location.pathname.split('/')[2];
    console.log("Group ID:", groupId);
    if (groupId) {
        // api stuff yes
        fetch(`https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=Asc`)
            .then(response => response.json())
            .then(data => {
                // This makes sure YOUR potato can run this (my (valras) pc would never require this)
                const retryInterval = 1000;
                const maxRetries = 10;

                function checkElements(retries = 0) {
                    const groupGamesContainer = document.querySelector('.group-games');
                    const containerHeader = document.querySelector("#group-container > div > div > div.group-details.col-xs-12.ng-scope.col-sm-9 > div > div:nth-child(3) > div > group-games > div > div.container-header");

                    if (!groupGamesContainer || !containerHeader) {
                        // in case of potato
                        if (retries < maxRetries) {
                            console.log(`Retrying... Attempt ${retries + 1}`);
                            setTimeout(() => checkElements(retries + 1), retryInterval);} 
                            else {console.log("Group likely aint games got👀🥒🔥");}}
                            else {

                        const hiddenGamesContainer = document.createElement('div');
                        hiddenGamesContainer.classList.add('hidden-games-list');
                        hiddenGamesContainer.style.display = 'none';
                        // Honestly no idea what this does 🤔😖
                        const gameLinks = Array.from(groupGamesContainer.querySelectorAll('a[href^="https://www.roblox.com/games/refer?PlaceId="]'));

                        const visibleGameIds = gameLinks.map(link => {
                            const url = new URL(link.href);
                            return url.searchParams.get('PlaceId'); 
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

                        groupGamesContainer.parentNode.appendChild(hiddenGamesContainer);


                        const experiencesButton = document.createElement('button');
                        experiencesButton.textContent = "Experiences";
                        experiencesButton.classList.add('tab-button', 'active-tab');

                        const hiddenGamesButton = document.createElement('button');
                        hiddenGamesButton.textContent = "Hidden Experiences";
                        hiddenGamesButton.classList.add('tab-button');


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

                checkElements();
            })
            .catch(error => {
                // Wow something didnt go as planned WHAAAAAAAAAAAAAAAAAAATTTTTTTTTTTTTTTTTTTTT
                console.error('Error fetching group games:', error);
            });
    }
}

// If not group yep
 else {
    const userId = window.location.pathname.split('/')[2];
    console.log("User ID:", userId);
    if (userId) {
        fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`)
            .then(response => response.json())
            .then(data => {
                const experiencesContainer = document.querySelector('.hlist.btr-games-list');
                const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
                const pager = profileGameSection ? profileGameSection.querySelector('.btr-pager') : null;
                // incase you hate QoL on roblox 🤔
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

//Makes it look all nice and cool like valra
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

// moves u to the hate qol file if hate qol
function loadNonBtrobloxFile() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('none-btroblox.js');
    document.body.appendChild(script);
}




