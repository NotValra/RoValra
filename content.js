

if (window.location.pathname.startsWith('/catalog') || window.location.pathname.startsWith('/bundles')) {

    // Extract the item ID from the URL
    const itemId = parseInt(window.location.pathname.split('/')[2], 10);
    console.log("Extracted item ID:", itemId);

    fetch('https://raw.githubusercontent.com/workframes/roblox-owner-counts/refs/heads/main/items.json') 
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

                const retryFindElement = (selector, maxRetries, retryInterval, callback, fallbackSelector) => {
                    let retries = 0;
                    const interval = setInterval(() => {
                        let element = document.querySelector(selector);
                        if (!element && fallbackSelector) {
                            element = document.querySelector(fallbackSelector);
                        }

                        if (element) {
                            clearInterval(interval);
                            callback(element);
                        } else if (retries >= maxRetries) {
                            clearInterval(interval);
                            console.log(`${selector} and fallback ${fallbackSelector} not found after ${maxRetries} retries.`);
                        }
                        retries++;
                    }, retryInterval);
                };

                retryFindElement(
                    ".text-label.row-label.price-label", 
                    20, 
                    100, 
                    (foundElement) => {
                        const salesDiv = document.createElement('div');
                        salesDiv.classList.add('item-sales');
                        salesDiv.innerHTML = `<strong>Sales:</strong> ${item.sales.toLocaleString()}`;
                        salesDiv.style.color = "#bdbebe";
                        salesDiv.style.marginTop = "10px";
                        salesDiv.style.marginLeft = "0px";
                        foundElement.appendChild(salesDiv);
                        const revenueDiv = document.createElement('div');
                        revenueDiv.classList.add('item-revenue');
                        revenueDiv.innerHTML = `<strong>Revenue:</strong> $${(item.revenue / 100).toFixed(2)}`;
                        revenueDiv.style.color = "#bdbebe";
                        revenueDiv.style.marginTop = "10px";
                        revenueDiv.style.marginLeft = "0";
                        foundElement.appendChild(revenueDiv);
                    },
                    ".price-row-container"
                );
            } else {
                console.log("Item not found.");
            }
        })
        .catch(error => {
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
        fetch(`https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=Desc`)
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
        fetch(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Desc`)
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











// region thing yes yes
const placeId = window.location.pathname.split('/')[2];

const defaultRegions = ["HK", "FR", "NL", "GB", "AU", "IN", "DE", "PL", "JP", "SG", "BR", "US"];

let regionServerMap = {};
let regionCounts = {};

if (placeId) {
    chrome.runtime.sendMessage({ action: "getRobloxCookie" }, (response) => {
        if (response.success) {
            const robloxCookie = response.cookie;
            getServerInfo(placeId, robloxCookie, defaultRegions);
        } else {
            console.error("Error retrieving .ROBLOSECURITY cookie:", response.message);
        }
    });
} else {
    console.log("No valid placeId found in the URL");
}

async function getServerInfo(placeId, robloxCookie, regions) {
    const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Roblox/WinInet",
                "Referer": `https://www.roblox.com/games/${placeId}/`,
                "Origin": "https://roblox.com",
                "Cookie": `${robloxCookie}`,
            },
        });

        if (!response.ok) {
            console.error(`Error fetching servers, status code: ${response.status}`);
            const errorDetails = await response.text();
            console.error("Error details:", errorDetails);
            return;
        }

        const servers = await response.json();

        if (!servers.data || servers.data.length === 0) {
            return;
        }

        for (const server of servers.data) {
            await handleServer(server, placeId, robloxCookie, regions);
        }
        for (const [region, count] of Object.entries(regionCounts)) {
        }

    } catch (error) {
        console.error("Error fetching server data:", error);
    }
}

async function handleServer(server, placeId, robloxCookie, regions) {
    const serverId = server.id;

    try {
        const serverInfo = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
            method: 'POST',
            headers: {
                "User-Agent": "Roblox/WinInet",
                "Accept": "*/*",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language": "en,en-US;q=0.9",
                "Referer": `https://www.roblox.com/games/${placeId}/`,
                "Origin": "https://roblox.com",
            },
            body: new URLSearchParams({
                placeId: placeId,
                isTeleport: false,
                gameId: serverId,
                gameJoinAttemptId: serverId,
            }),
            credentials: 'include',
        });

        const ipData = await serverInfo.json();
        const ip = ipData?.joinScript?.UdmuxEndpoints?.[0]?.Address;

        if (!ip) {
            return;
        }

        const geolocationData = await fetchGeolocation(ip);
        if (!geolocationData) {
            return;
        }

        const countryCode = mapStateToRegion(geolocationData);
        if (regions.includes(countryCode)) {
            regionCounts[countryCode] = (regionCounts[countryCode] || 0) + 1;
            regionServerMap[countryCode] = server;

            updatePopup();
        }
    } catch (error) {
        console.error(`Error fetching server info for server ${serverId}:`, error);
    }
}

const retryFindElement = (selector, maxRetries, interval, callback) => {
    let retries = 0;
    const intervalId = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
            clearInterval(intervalId);
            callback(element);
        } else if (retries >= maxRetries) {
            clearInterval(intervalId);
        }
        retries++;
    }, interval);
};

retryFindElement(".nav.nav-tabs", 20, 100, (tabgameinstances) => {
    const tabs = document.querySelectorAll(".rbx-tab");

    tabs.forEach((tab) => {
        const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.attributeName === "class") {
                    if (tab.classList.contains("active")) {

                        const contentId = tab.getAttribute("data-target");
                        const activeContent = document.querySelector(contentId || ".tab-content.rbx-tab-content.section");

                        if (activeContent) {
                            handleTabContentChange(activeContent);
                        }
                    }
                }
            });
        });

        observer.observe(tab, { attributes: true });
    });
});


function handleTabContentChange(contentElement) {
    const allContentElements = document.querySelectorAll(".tab-content.rbx-tab-content.section");

    allContentElements.forEach((element) => {
        if (element !== contentElement) {
            element.style.display = "none";
        }
    });

    contentElement.style.display = "block";
}

retryFindElement(".nav.nav-tabs", 20, 100, (tabgameinstances) => {
    const regionDiv = document.createElement('div');
    regionDiv.classList.add('stuff');

    const toggleButton = document.createElement('button');
    toggleButton.textContent = "Show Servers";
    toggleButton.style.marginTop = "0px";
    toggleButton.style.backgroundColor = "transparent";
    toggleButton.style.color = "white";
    toggleButton.style.border = "none";
    toggleButton.style.padding = "10px 20px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.fontWeight = "Bold";

    const serverPopup = document.createElement('div');
    serverPopup.classList.add('server-popup');
    serverPopup.style.display = "none";
    regionDiv.appendChild(toggleButton);
    regionDiv.appendChild(serverPopup);

    toggleButton.addEventListener("click", () => {
        const isHidden = serverPopup.style.display === "none";
        serverPopup.style.display = isHidden ? "block" : "none";
        toggleButton.textContent = isHidden ? "Hide Servers" : "Show Servers";
        const tabContent = document.querySelector('.tab-content.rbx-tab-content.section');
        if (tabContent) {
            tabContent.style.display = isHidden ? "none" : "block";
        }
    });

    tabgameinstances.appendChild(regionDiv);
    
    const tabContent = document.querySelector('.tab-content.rbx-tab-content.section');
    if (tabContent) {
        const observer = new MutationObserver(() => {
            const isTabVisible = window.getComputedStyle(tabContent).display !== "none";

            if (isTabVisible && serverPopup.style.display === "block") {
                serverPopup.style.display = "none";
                toggleButton.textContent = "Show Servers";
            }
        });

        observer.observe(tabContent, { attributes: true, childList: true, subtree: false });
    }
});

function updatePopup() {
    const serverPopup = document.querySelector('.server-popup');
    if (!serverPopup) return;

    serverPopup.innerHTML = '';

    for (const [region, count] of Object.entries(regionCounts)) {
        const button = document.createElement('button');
        button.textContent = `${region}: ${count} servers`;
        button.style.margin = "5px";
        button.style.padding = "5px 10px";
        button.style.backgroundColor = "transparent";
        button.style.border = "none";
        button.style.cursor = "pointer";
        button.style.width = "70%";
        button.style.fontSize = "15px";
        button.style.fontWeight = "bold";
        button.style.color = "white";

        button.addEventListener("click", () => {
            const serverId = regionServerMap[region]?.id;
            if (serverId) {
                const url = `https://www.roblox.com/games/start?placeId=16302670534&launchData=${placeId}/${serverId}`;
                window.open(url, '_blank');
            } else {
                console.error("Server ID not found for region:", region);
            }
        });

        serverPopup.appendChild(button);
    }
}

async function fetchGeolocation(ip) {
    try {
        const response = await fetch(`https://get.geojs.io/v1/ip/country/${ip}.json`);
        if (response.status === 200) {
            const data = await response.json();

            return {
                name: data.name || "Unknown",
                countryCode: data.country || "Unknown",
                countryCode3: data.country_3 || "Unknown",
                ip: data.ip || ip,
            };
        }
    } catch (error) {
        console.error(`Error fetching geolocation for IP ${ip}:`, error);
    }
    return null;
}

function mapStateToRegion(data) {
    if (data.countryCode === "US") {
        return "US";
    }
    return data.countryCode;
}
