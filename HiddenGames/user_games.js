const userId = window.location.pathname.split('/')[2];
    console.log("User ID:", userId);
    if (userId) {
        fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Desc`)
            .then(response => response.json())
            .then(data => {
                const experiencesContainer = document.querySelector('.hlist.btr-games-list');
                 const profileGameSection = document.querySelector('.profile-game.section.ng-scope');
                  const pager = profileGameSection ? profileGameSection.querySelector('.btr-pager') : null;
                // incase you hate QoL on roblox 🤔
                if (!experiencesContainer) {
                    console.log('Switching to non-btroblox functionality');
                   
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