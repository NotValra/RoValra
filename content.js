

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
        fetch(`https://games.roblox.com/v2/groups/${groupId}/gamesV2?accessFilter=1&limit=50&sortOrder=desc`)
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






const pathname = window.location.pathname;
let placeId = null;

if (pathname.includes('/games/')) {
    placeId = pathname.split('/')[2];
}
const defaultRegions = ["HK", "FR", "NL", "GB", "AU", "IN", "DE", "PL", "JP", "SG", "BR", "US"];
let regionServerMap = {};
let regionCounts = {};
let allServers = [];
let userRegion = null;
let userIP = null;
let serverLocations = {}; 
let userLocation = null;
let serverScores = {}; 
if (placeId) {
    fetchUserLocation();
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
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function getServerInfo(placeId, robloxCookie, regions) {
    let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
    try {
        let totalRequests = 0;
        let serverPromises = [];
        const BATCH_SIZE = 1;
        let rateLimited = false;
        const REQUEST_DELAY = 1500;
        while (url && totalRequests < 1) {
            await delay(REQUEST_DELAY);
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Roblox/WinInet",
                    "Referer": `https://www.roblox.com/games/${placeId}/`,
                    "Origin": "https://roblox.com",
                    "Cookie": `${robloxCookie}`,
                    "Cache-Control": "no-cache",
                },
            });
            if (response.status === 429) {
                rateLimited = true;
                break;
            }
            if (!response.ok) {
                console.log(`Error fetching servers, status code: ${response.status}`);
                const errorDetails = await response.text();
                console.log("Error details:", errorDetails);
                return;
            }
            const servers = await response.json();
            if (!servers.data || servers.data.length === 0) {
                return;
            }
           for (const server of servers.data) {
                serverPromises.push(handleServer(server, placeId, robloxCookie, regions));
                allServers.push(server);
            }
           while (serverPromises.length > 0) {
                const batch = serverPromises.splice(0, BATCH_SIZE);
                await Promise.all(batch);
            }
            url = servers.nextPageCursor
                ? `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100&cursor=${servers.nextPageCursor}`
                : null;
            totalRequests++;
        }
        if (rateLimited) {
            showRateLimitedMessage();
        } else {
            updatePopup();
        }
    } catch (error) {
        console.log("Error fetching server data:", error);
    }
}

function showRateLimitedMessage() {
    const serverPopup = document.querySelector('.nav.nav-tabs');
    if (!serverPopup) return;
    const existingButtonContainer = document.querySelector('.server-buttons-container');
    if (existingButtonContainer) {
        existingButtonContainer.remove();
    }
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('rate-limited-message');
    messageContainer.style.color = "red";
    messageContainer.style.fontSize = "16px";
    messageContainer.style.fontWeight = "bold";
    messageContainer.style.textAlign = "center";
    messageContainer.style.padding = "0px";
    messageContainer.style.gap = "0px";
    messageContainer.style.marginTop = "10px";
    messageContainer.style.backgroundColor = "#393b3d";
    messageContainer.style.borderRadius = "6px";
    messageContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
    messageContainer.textContent = "Region Selector is rate-limited. Wait before trying again";
    const refreshButton = document.createElement('button');
    refreshButton.textContent = "Refresh";
    refreshButton.style.padding = "20px 20px";
    refreshButton.style.marginLeft = "10px";
    refreshButton.style.backgroundColor = "#24292e";
    refreshButton.style.border = "1px solid #444";
    refreshButton.style.borderRadius = "6px";
    refreshButton.style.cursor = "pointer";
    refreshButton.style.padding = "10px";
    refreshButton.style.fontSize = "13.4px";
    refreshButton.style.fontWeight = "600";
    refreshButton.style.color = "white";
    refreshButton.style.transition = "all 0.3s ease";
    refreshButton.style.transition = "background-color 0.3s ease, transform 0.3s ease, border-color 0.3s ease";
    refreshButton.addEventListener("mouseenter", () => {
        refreshButton.style.backgroundColor = "#4c5053";
        refreshButton.style.borderColor = "#24292e";
        refreshButton.style.transform = "scale(1.05)";
    });
    refreshButton.addEventListener("mouseleave", () => {
        refreshButton.style.backgroundColor = "#24292e";
        refreshButton.style.borderColor = "#4c5053";
        refreshButton.style.transform = "scale(1)";
    });
    refreshButton.addEventListener("click", () => {
        location.reload();
    });
    messageContainer.appendChild(refreshButton);
    serverPopup.parentNode.insertBefore(messageContainer, serverPopup.nextSibling);
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
           serverLocations[server.id] = geolocationData;
            if (userLocation){
                scoreServer(server, userLocation, geolocationData, server.fps, server.ping);
             }
             updatePopup();
         }
    } catch (error) {
        console.log(`Error fetching server info for server ${serverId}:`, error);
    }
}
function updatePopup(retries = 5) {
    const serverPopup = document.querySelector(".nav.nav-tabs");
    if (!serverPopup) {
      if (retries > 0) {
        console.log("Retrying to find .nav.nav-tabs...");
        setTimeout(() => updatePopup(retries - 1), 1000);
      } else {
        console.error(".nav.nav-tabs not found after multiple retries.");
      }
      return;
    }
  
    const existingButtonContainer = document.querySelector(".server-buttons-container");
    if (existingButtonContainer) {
      existingButtonContainer.remove();
    }
  
    const buttonContainer = document.createElement("div");
    buttonContainer.classList.add("server-buttons-container");
    buttonContainer.style.display = "flex";
    buttonContainer.style.flexWrap = "wrap";
    buttonContainer.style.gap = "10px";
    buttonContainer.style.marginTop = "6px";
    buttonContainer.style.padding = "10px";
    buttonContainer.style.backgroundColor = "#393b3d";
    buttonContainer.style.borderRadius = "6px";
    buttonContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
  
     const bestServerButton = document.createElement("button");
    let bestServerRegion = "N/A";
    let bestServer = null;
  
      if (allServers.length > 0 && userLocation) {
          bestServer = findBestServer();
          if (bestServer) {
             for (const [region, server] of Object.entries(regionServerMap)) {
                  if (server.id === bestServer.id) {
                      bestServerRegion = region;
                  }
              }
          }
     }
  
     if (bestServer == null || bestServerRegion == "N/A"){
             if(allServers.length > 0){
                bestServer = findBestServer()
               if (bestServer) {
                  for (const [region, server] of Object.entries(regionServerMap)) {
                      if (server.id === bestServer.id) {
                          bestServerRegion = region;
                      }
                   }
               }
              }
          if (bestServer == null || bestServerRegion == "N/A"){
              bestServerRegion = "N/A"
          }
  
     }
      bestServerButton.textContent = `Best Ping`;
    bestServerButton.style.padding = "10px 15px";
     bestServerButton.style.backgroundColor = "#0366d6";
     bestServerButton.style.border = "1px solid #0366d6";
      bestServerButton.style.borderRadius = "6px";
     bestServerButton.style.cursor = "pointer";
      bestServerButton.style.fontSize = "13.4px";
      bestServerButton.style.fontWeight = "600";
      bestServerButton.style.color = "white";
      bestServerButton.style.transition = "all 0.3s ease";
      bestServerButton.addEventListener("mouseover", () => {
        bestServerButton.style.backgroundColor = "#24292e";
        bestServerButton.style.borderColor = "#444";
      });
      bestServerButton.addEventListener("mouseout", () => {
         bestServerButton.style.backgroundColor = "#0366d6";
        bestServerButton.style.borderColor = "#0366d6";
      });
      bestServerButton.addEventListener("click", async() => {
         if (userRegion === "US") {
             showUSWarningModal(async () => {
               if (bestServerRegion === "N/A"){
                   await fetchUserLocation();
                 }
                 joinBestServer(bestServer);
             });
          } else {
             if (bestServerRegion === "N/A"){
                await fetchUserLocation();
              }
            joinBestServer(bestServer);
         }
       
      });
      buttonContainer.appendChild(bestServerButton);
    
  
    const regionButtons = []; 
    for (const [region, count] of Object.entries(regionCounts)) {
      const button = document.createElement("button");
      button.textContent = `${region}: ${count} servers`; // Start with servers
      button.style.padding = "10px 15px";
      button.style.backgroundColor = "#24292e";
      button.style.border = "1px solid #444";
      button.style.borderRadius = "6px";
      button.style.cursor = "pointer";
      button.style.fontSize = "15px";
      button.style.fontWeight = "600";
      button.style.color = "white";
      button.style.flexGrow = "1";
      button.style.flexShrink = "1";
      button.style.minWidth = "50px";
      button.style.textAlign = "center";
      button.style.transition = "background-color 0.3s ease, transform 0.3s ease";
       button.addEventListener('mouseover', () => {
              button.style.backgroundColor = "#4c5053";
              button.style.borderRadius = "6px";
              button.style.borderColor = "#24292e";
              button.style.transform = "scale(1.05)";
          });
          button.addEventListener('mouseout', () => {
               button.style.backgroundColor = "#24292e";
              button.style.borderRadius = "6px";
             button.style.borderColor = "#4c5053";
              button.style.transform = "scale(1)";
          });
          button.addEventListener("click", () => {
          const serverId = regionServerMap[region]?.id;
          if (serverId) {
             const url = `https://www.roblox.com/games/start?placeId=16302670534&launchData=${placeId}/${serverId}`;
             window.open(url, '_blank');
          } else {
             console.error("Server ID not found for region:", region);
          }
       });
      buttonContainer.appendChild(button);
      regionButtons.push(button); 
    }
  
  
    serverPopup.parentNode.insertBefore(buttonContainer, serverPopup.nextSibling);
  

    const adjustButtonText = () => {
        let totalWidth = 0;
        regionButtons.forEach((button) => {
          totalWidth += button.offsetWidth + 10;
        });
  
       if (totalWidth > buttonContainer.offsetWidth) {
            regionButtons.forEach((button) => {
            const [region, count] = button.textContent.split(": ");
            button.textContent = `${region}: ${count.split(" ")[0]}`;
            });
       } else {
            regionButtons.forEach((button) => {
                  const [region, count] = button.textContent.split(": ");
                   if (!count.includes("servers")) {
                       button.textContent = `${region}: ${count} servers`;
                   }
               });
       }
    };
  
  
      const buttonCheckInterval = setInterval(() => {
          const checkButtonContainer = document.querySelector('.server-buttons-container');
          if (checkButtonContainer) {
              adjustButtonText();
              clearInterval(buttonCheckInterval);
          }
      }, 500);
  
        window.addEventListener('resize',adjustButtonText);
  }
async function fetchGeolocation(ip) {
    try {
        const response = await fetch(`https://get.geojs.io/v1/ip/country/${ip}.json`);
        if (response.status === 200) {
            const data = await response.json();
            const locationData = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`);
            const location = await locationData.json();
             return {
                name: data.name || "Unknown",
                countryCode: data.country || "Unknown",
                countryCode3: data.country_3 || "Unknown",
                 latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude),
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
async function fetchUserLocation(retries = 2) {
    try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        userIP = data.ip;
        const geolocationData = await fetchGeolocation(userIP);
        if (geolocationData) {
            userLocation = geolocationData;
            userRegion = mapStateToRegion(geolocationData);
        } else {
            if (retries > 0){
              console.log("retrying location fetch...")
             await delay(1000)
              await fetchUserLocation(retries -1)
            }
          }
    } catch (error) {
        console.error("Error fetching user location:", error);
        if (retries > 0){
          console.log("retrying location fetch...")
             await delay(1000)
              await fetchUserLocation(retries -1)
            }
    }
}
// Figures out the best server by using black magic and something about how big earth it
function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371;

      const dLat = deg2rad(lat2 - lat1);
      const dLon = deg2rad(lon2 - lon1);

      const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
       const distance = earthRadius * c;
      return distance;
  }
  function deg2rad(deg) {
    return deg * (Math.PI / 180)
  }
function scoreServer(server, userLocation, serverLocation, fps, ping) {
    const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        serverLocation.latitude,
        serverLocation.longitude
    );

    const normalizedFPS = (fps - 0) / (60 - 0);
    const normalizedPing = (300 - ping) / (300 - 0);

    const clampedFPS = Math.max(0, Math.min(1, normalizedFPS));
    const clampedPing = Math.max(0, Math.min(1, normalizedPing));

   const distanceScore = Math.max(0, 1 - (distance / 3000));


    const fpsWeight = 0.5;
    const distanceWeight = 0.2;
    const pingWeight = 0.3;


    const score = (fpsWeight * clampedFPS) +
        (distanceWeight * distanceScore) +
         (pingWeight * clampedPing);


    serverScores[server.id] = score;
}

  function findBestServer() {
    if (allServers.length === 0 || !userLocation) {
        return null;
    }

    let bestServer = null;
    let bestScore = -Infinity;
    
    for (const server of allServers) {
      const serverScore = serverScores[server.id]
        if (serverScore > bestScore){
             bestScore = serverScore
            bestServer = server;
        }
    }
    return bestServer;
}

function joinBestServer(server) {
     if (!server) {
        console.log("No server found with a score.");
          if (allServers.length > 0) {
              const firstServer = allServers[0]
                  const serverId = firstServer.id;
                   if (serverId) {
                        const url = `https://www.roblox.com/games/start?placeId=16302670534&launchData=${placeId}/${serverId}`;
                         window.open(url, '_blank');
                    } else {
                            console.error("Server ID not found for region:");
                    }
          }
        return;
    }
    const serverId = server.id;
     if (serverId) {
            const url = `https://www.roblox.com/games/start?placeId=16302670534&launchData=${placeId}/${serverId}`;
            window.open(url, '_blank');
        } else {
                console.error("Server ID not found for region:");
    }
}
function showUSWarningModal(proceedCallback) {
    const modalOverlay = document.createElement('div');
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.zIndex = '1000';

    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#393b3d';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '8px';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    modalContent.style.textAlign = 'center';
    modalContent.style.color = "white";

    const warningText = document.createElement('p');
    warningText.textContent = "This extension is unable to accurately locate servers in the USA. Proceed with caution.";
    warningText.style.marginBottom = '20px';
    warningText.style.fontSize = "17px";
    warningText.style.fontWeight = '600';


     const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = "10px";
      buttonContainer.style.justifyContent = 'center';

    const proceedButton = document.createElement('button');
    proceedButton.textContent = 'Proceed';
    proceedButton.style.padding = '10px 15px';
    proceedButton.style.backgroundColor = '#f05c6c';
    proceedButton.style.border = 'none';
     proceedButton.style.borderRadius = '6px';
    proceedButton.style.cursor = 'pointer';
     proceedButton.style.fontSize = '15px';
    proceedButton.style.fontWeight = '600';
    proceedButton.style.color = 'white';
     proceedButton.style.transition = "all 0.3s ease";
     proceedButton.addEventListener("mouseover", () => {
          proceedButton.style.backgroundColor = "#A03D48";
      });
      proceedButton.addEventListener("mouseout", () => {
         proceedButton.style.backgroundColor = "#f05c6c";
      });
    proceedButton.addEventListener('click', () => {
        modalOverlay.remove();
        proceedCallback();
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
     cancelButton.style.padding = '10px 15px';
    cancelButton.style.backgroundColor = '#24292e';
     cancelButton.style.border = '1px solid #24292e';
      cancelButton.style.borderRadius = '6px';
     cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontSize = '15px';
    cancelButton.style.fontWeight = '600';
    cancelButton.style.color = 'white';
    cancelButton.style.transition = "all 0.3s ease";
     cancelButton.addEventListener("mouseover", () => {
         cancelButton.style.backgroundColor = "#4c5053";
       });
      cancelButton.addEventListener("mouseout", () => {
        cancelButton.style.backgroundColor = "#24292e";
      });
    cancelButton.addEventListener('click', () => {
        modalOverlay.remove();
    });
      buttonContainer.appendChild(proceedButton);
    buttonContainer.appendChild(cancelButton)
    modalContent.appendChild(warningText);
     modalContent.appendChild(buttonContainer);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
}