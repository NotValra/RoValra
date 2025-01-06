console.log("Subplaces.js: Script started.");

function extractPlaceId() {
    const url = window.location.href;
    const regex = /\/games\/(\d+)/;
    const match = url.match(regex);

    if (match && match[1]) {
        console.log("Extracted Place ID:", match[1]);
        return match[1];
    } else {
        console.error("Place ID not found in URL.");
        return null;
    }
}

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


async function fetchUniverseId(placeId) {
    const url = `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`;
    try {
        const response = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data && Array.isArray(data) && data.length > 0 && data[0].universeId) {
            return data[0].universeId;
        } else {
            throw new Error("Universe ID not found in the API response");
        }
    } catch (error) {
        console.error("Error fetching Universe ID:", error);
        throw error;
    }
}


async function fetchSubplaces(universeId, cursor = null, allSubplaces = []) {
    let url = `https://develop.roblox.com/v1/universes/${universeId}/places?isUniverseCreation=false&limit=100&sortOrder=Asc`;
    if (cursor) {
        url += `&cursor=${cursor}`;
    }

    try {
        const response = await fetch(url, { method: 'GET', credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data && data.data) {
            const currentSubplaces = data.data;
            allSubplaces = allSubplaces.concat(currentSubplaces);

            if (data.nextPageCursor) {
                return fetchSubplaces(universeId, data.nextPageCursor, allSubplaces);
            } else {
                return allSubplaces;
            }
        }
        return allSubplaces;
    } catch (error) {
        console.error("Error fetching subplaces:", error);
        throw error;
    }
}



async function createSubplacesTab(subplaces) {
    const horizontalTabs = document.getElementById('horizontal-tabs');
    if (!horizontalTabs) {
        console.error("Tabs container not found");
        return;
    }

    const subplaceTab = document.createElement('li');
    subplaceTab.className = 'rbx-tab tab-subplaces';
    subplaceTab.innerHTML = `
      <a class="rbx-tab-heading">
          <span class="text-lead">Subplaces</span>
      </a>
  `;
    horizontalTabs.appendChild(subplaceTab);

    const subplacesContentDiv = document.createElement('div');
    subplacesContentDiv.className = 'tab-pane';
    subplacesContentDiv.id = 'subplaces';


    const searchBar = document.createElement('input');
    searchBar.type = 'text';
    searchBar.placeholder = 'Search subplaces...';
    searchBar.className = 'subplace-search';
    searchBar.style.width = '100%';
    searchBar.style.marginBottom = '10px';
    searchBar.style.padding = '8px';
    searchBar.style.boxSizing = 'border-box';
    searchBar.style.borderRadius = '4px';
    searchBar.style.border = '1px solid #555';
    searchBar.style.backgroundColor = '#242424';
    searchBar.style.color = '#ddd';
    searchBar.style.transition = 'border-color 0.3s ease';
    searchBar.addEventListener('focus', () => {
        searchBar.style.borderColor = '#888';
    });
    searchBar.addEventListener('blur', () => {
        searchBar.style.borderColor = '#555';
    });
    subplacesContentDiv.appendChild(searchBar);

    const subplacesContainer = document.createElement('div');
    subplacesContainer.classList.add('subplaces-list');
    subplacesContainer.style.display = 'grid';
    subplacesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
    subplacesContainer.style.gap = '12px';
    subplacesContainer.style.marginTop = '5px';
    subplacesContentDiv.appendChild(subplacesContainer);

    let displayedSubplaceCount = 0;
    let allDisplayed = false;

    const loadMoreButton = document.createElement('button');
    loadMoreButton.textContent = 'Load More';
    loadMoreButton.classList.add('load-more-button', 'tab-button');
    loadMoreButton.style.display = 'none';
    loadMoreButton.style.position = 'relative';
    loadMoreButton.style.bottom = '0';
    loadMoreButton.style.marginTop = '5px';
    loadMoreButton.style.paddingLeft = '0px';
    loadMoreButton.style.paddingRight = '0px';
    loadMoreButton.style.display = 'block';
    loadMoreButton.style.minWidth = '120px';
    loadMoreButton.style.width = '950px';
    loadMoreButton.style.height = '35px';
    loadMoreButton.style.textAlign = 'center';
    const loadMoreButtonWrapper = document.createElement('div');
    loadMoreButtonWrapper.style.width = '100%';
    loadMoreButtonWrapper.style.display = 'flex';
    loadMoreButtonWrapper.style.paddingRight = '10px';
    loadMoreButtonWrapper.style.justifyContent = 'center';
    loadMoreButtonWrapper.appendChild(loadMoreButton);


    function displaySubplaces(gamesToDisplay) {
        gamesToDisplay.forEach(async (subplace, index) => {
            const gameId = subplace.id;

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
                let gameTitle = subplace.name;
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
                subplacesContainer.appendChild(gameElement);
                gameImage.addEventListener('mouseenter', () => {
                    gameImage.style.filter = 'brightness(0.8)';
                });
                gameImage.addEventListener('mouseleave', () => {
                    gameImage.style.filter = 'brightness(1)';
                });
            };
        })
    }

    function filterSubplaces(searchTerm) {
        const allGameContainers = Array.from(subplacesContainer.querySelectorAll('.game-container'));
        allGameContainers.forEach(container => {
            const gameNameSpan = container.querySelector('.game-name');
            if (gameNameSpan) {
                const fullName = gameNameSpan.getAttribute('data-full-name') || "";
                const nameText = fullName.toLowerCase();
                if (nameText.includes(searchTerm.toLowerCase())) {
                    container.style.display = '';
                }
                else {
                    container.style.display = 'none';
                }
            }
        })

    }

    async function loadAllSubplaces() {
        if (allDisplayed) return;
        let remainingSubplaces = subplaces.slice(displayedSubplaceCount);
        if (remainingSubplaces.length > 0) {

            displaySubplaces(remainingSubplaces);
            displayedSubplaceCount += remainingSubplaces.length;
        }
        if (displayedSubplaceCount >= subplaces.length) {
           loadMoreButtonWrapper.style.display = 'none';
            allDisplayed = true;
        }
    }

    searchBar.addEventListener('input', () => {
        const searchTerm = searchBar.value.trim();
        filterSubplaces(searchTerm);
        if (searchTerm) {
            loadAllSubplaces();
        } else {
            const allGameContainers = Array.from(subplacesContainer.querySelectorAll('.game-container'));
            allGameContainers.forEach(container => {
                container.style.display = '';
            })
            if (subplaces.length > 12) {
                loadMoreButtonWrapper.style.display = 'flex'
                loadMoreButton.style.display = 'block'
            }
        }
    });


    displaySubplaces(subplaces.slice(0, 12));
    displayedSubplaceCount += 12;

    if (subplaces.length > 12) {
        loadMoreButton.style.display = 'block';
    }

    function loadMoreSubplaces() {
        const subplacesToLoad = subplaces.slice(displayedSubplaceCount, displayedSubplaceCount + 12);
        displaySubplaces(subplacesToLoad);
        displayedSubplaceCount += subplacesToLoad.length;

         if (displayedSubplaceCount >= subplaces.length) {
            loadMoreButtonWrapper.style.display = 'none';
        }
        else {
         loadMoreButtonWrapper.style.display = 'flex';
        }
    }


     if (subplaces.length <= 12) {
         loadMoreButtonWrapper.style.display = 'none';
     }

    if (subplaces.length === 0) {
        const noGames = document.createElement('p');
        noGames.textContent = "No subplaces found.";
        noGames.style.gridColumn = '1 / -1';
        subplacesContainer.appendChild(noGames);
        loadMoreButtonWrapper.style.display = 'none';
    } else {
        if (displayedSubplaceCount < subplaces.length) {
            if (subplaces.length > 12)
             loadMoreButtonWrapper.style.display = 'flex';
        }
        loadMoreButton.addEventListener('click', () => loadMoreSubplaces());
    }

    if (subplaces.length > 0) {
        subplacesContentDiv.appendChild(loadMoreButtonWrapper);
    }


  let contentSection = document.querySelector('.tab-content.rbx-tab-content.section');
    if (!contentSection) {
        contentSection = document.querySelector('.tab-content.rbx-tab-content');
    }

    if (contentSection) {
      contentSection.appendChild(subplacesContentDiv);
    }


    subplaceTab.addEventListener('click', () => {
        document.querySelectorAll('.rbx-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        subplaceTab.classList.add('active');
        subplacesContentDiv.classList.add('active');
    });
}


(async function () {
    const placeId = extractPlaceId();
    if (!placeId) return;

    try {
        const universeId = await fetchUniverseId(placeId);
        if (universeId) {
            const subplaces = await fetchSubplaces(universeId);
            createSubplacesTab(subplaces);
        }
    } catch (error) {
        console.error("Error initializing subplaces:", error);
    }
})();