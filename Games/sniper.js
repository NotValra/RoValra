// I hate stalkers.... Idek why I didnt think this would be used for stalking when i added it.


const REQUEST_LIMIT = 5;
let requestQueue = [];
let lastRequestTime = 0;
let isRateLimited = false;
let rateLimitStartTime = 0;

let previousSearch = JSON.parse(localStorage.getItem('previousSearch')) || {
    placeId: null,
    userId: null,
    initialImageUrl: null,
    nextPageCursor: null,
    requestCount: 0,
    startTime: 0,
    requestId: null
};


async function delayRequest() {
    return new Promise(resolve => {
        if (requestQueue.length >= REQUEST_LIMIT) {
            const timeToWait = (requestQueue[0] + 1000) - Date.now()
            if (timeToWait > 0) {
                setTimeout(resolve, timeToWait)
            } else {
                requestQueue.shift();
                resolve()
            }

        } else {
            resolve()
        }

    })
}
function recordRequest() {
    requestQueue.push(Date.now())
    if (requestQueue.length > REQUEST_LIMIT) {
        requestQueue.shift()
    }
}

function getPlaceIdFromUrl() {
    const url = window.location.href;
    const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
    const match = url.match(regex);


    if (match && match[1]) {
        return match[1];
    } else {
        return null;
    }
}


async function fetchUserIdFromUsername(username) {
    const url = "https://users.roblox.com/v1/usernames/users";
    let retries = 0
    const maxRetries = 5
    while (retries <= maxRetries) {
        await delayRequest()
        recordRequest()
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                body: JSON.stringify({
                    usernames: [username],
                    excludeBannedUsers: false,
                }),
            });
            if (response.status === 429) {
                if (!isRateLimited) {
                    isRateLimited = true;
                    rateLimitStartTime = Date.now()
                    console.warn("Too many user lookup requests, attempting to spam until un-rate-limited.");
                }
                const delay = Math.random() * 1000 + 2300;
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
                continue;
            }
            if (isRateLimited) {
                const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
                isRateLimited = false;
                rateLimitStartTime = 0;
            }
            if (!response.ok) {
                console.error("Failed to fetch user ID:", response.status, response.statusText);
                return null;
            }
            const data = await response.json();
            if (data && data.data && data.data.length > 0) {
                return data.data[0].id;
            } else {
                return null;
            }
            retries = maxRetries + 1
        } catch (error) {
            console.error("Error fetching user ID:", error);
            return null;
        }
    }
    return null;
}

async function fetchServers(placeId, initialImageUrl, updateRequestCount, updateRateLimitCount, onServerFound, onComplete, isCancelledRef, setNotFoundMessage, setRateLimitMessage, nextPageCursor = null) {
    if (!placeId) {
        return;
    }

    let found = (previousSearch.requestId !== null);
    let serverCount = previousSearch.requestCount || 0;
    let currentRequestCount = 0;

    updateRequestCount(serverCount);

    while (!found) {
        if (isCancelledRef.current) {
            if (onComplete) {
                onComplete()
            }
            return;
        }
        const timeSinceLastRequest = Date.now() - lastRequestTime;
        let minDelay = 100;
        let maxDelay = 100;
        const jitter = Math.random() * (maxDelay - minDelay) + minDelay;
        if (timeSinceLastRequest < jitter && !isRateLimited) {
            const waitTime = jitter - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100`;
        if (nextPageCursor) {
            url += `&cursor=${nextPageCursor}`;
        }
        
        let retries = 0;
        const maxRetries = 5;
        while (retries <= maxRetries) {
            if (isCancelledRef.current) {
                if (onComplete) {
                    onComplete()
                }
                return;
            }
            let isRateLimitedOnThisRequest = false
            await delayRequest();
            recordRequest();

            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                    credentials: "include", // Added this since roblox patched the sniper, ofc if it wasnt patched this wouldnt be here.
                });


                if (response.status === 429) {
                    if (!isRateLimited) {
                        isRateLimited = true;
                        rateLimitStartTime = Date.now()
                        isRateLimitedOnThisRequest = true
                        setRateLimitMessage("Roblox is rate-limiting the requests. Gonna take a bit.");
                    }
                    const delay = Math.random() * 1000 + 2300;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries++;
                    continue;
                }

                if (isRateLimited) {
                    const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
                    isRateLimited = false;
                    rateLimitStartTime = 0;
                    setRateLimitMessage("");
                }

                if (!response.ok) {
                    return;
                }
                currentRequestCount++;
                const data = await response.json();
                if (data && data.data) {
                    serverCount += data.data.length;
                    if (updateRequestCount) {
                        updateRequestCount(serverCount);
                    }
                    const thumbnailResult = await fetchThumbnails(data.data, initialImageUrl, updateRateLimitCount, isCancelledRef);
                    if (thumbnailResult && typeof thumbnailResult === 'object' && thumbnailResult.status === "FOUND") {
                        found = true;
                        previousSearch.requestId = thumbnailResult.requestId;
                        localStorage.setItem('previousSearch', JSON.stringify(previousSearch));
                        if (onServerFound) {
                            const joinButtonContainer = document.querySelector('#joinButtonContainer');
                            if (joinButtonContainer) {
                                const joinButton = joinButtonContainer.querySelector('#joinButton');
                                if (joinButton) {
                                    
                                }
                            }
                            onServerFound(thumbnailResult.requestId);
                        }
                        return;
                    }

                }
                nextPageCursor = data.nextPageCursor;

                if (!nextPageCursor) {
                    previousSearch.nextPageCursor = null;
                    localStorage.setItem('previousSearch', JSON.stringify(previousSearch));
                    if (!found) {
                        setNotFoundMessage("User Not Found");
                    }
                    if (onComplete) {
                        onComplete()
                    }
                    return;
                }

                previousSearch.nextPageCursor = nextPageCursor;
                previousSearch.requestCount = serverCount;
                localStorage.setItem('previousSearch', JSON.stringify(previousSearch));

                retries = maxRetries + 1;
            } catch (error) {
                console.error("Error fetching servers:", error);
                if (onComplete) {
                    onComplete()
                }
                return;
            }
        }
        lastRequestTime = Date.now();
    }
}



async function fetchThumbnails(servers, initialImageUrl, updateRateLimitCount, isCancelledRef) {
    if (!servers || servers.length === 0) {
        return null;
    }

    let allThumbnailPayload = [];
    for (const server of servers) {
        if (server.playerTokens && server.playerTokens.length > 0) {
            const serverPayload = server.playerTokens.map(token => ({
                token: token,
                type: "AvatarHeadshot",
                size: "150x150",
                requestId: server.id
            }));
            allThumbnailPayload.push(...serverPayload);
        }
    }

    if (allThumbnailPayload.length === 0) {
        return null;
    }

    const BATCH_SIZE = 100;
    let allThumbnailResponses = [];
    const fetchPromises = [];
    for (let i = 0; i < allThumbnailPayload.length; i += BATCH_SIZE) {
        const batch = allThumbnailPayload.slice(i, i + BATCH_SIZE);

        const fetchPromise = new Promise(async (resolve) => {
            let retries = 0
            const maxRetries = 5
            while (retries <= maxRetries) {
                if (isCancelledRef.current) {
                    resolve();
                    return;
                }
                let isRateLimitedOnThisRequest = false
                await delayRequest();
                recordRequest()
                try {
                    const response = await fetch("https://thumbnails.roblox.com/v1/batch", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        },
                        credentials: "include",
                        body: JSON.stringify(batch),
                    });
                    if (response.status === 429) {
                        if (!isRateLimited) {
                            isRateLimited = true;
                            rateLimitStartTime = Date.now()
                            if (updateRateLimitCount) {
                                updateRateLimitCount();
                            }
                            isRateLimitedOnThisRequest = true
                            console.warn("Too many requests, waiting:", delay / 1000, "seconds. Retry:", retries + 1);
                        }
                        const delay = Math.random() * 2000 + 3000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        retries++;
                        continue
                    }

                    if (isRateLimited) {
                        const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
                        isRateLimited = false;
                        rateLimitStartTime = 0;
                    }
                    if (!response.ok) {
                        console.error("Failed to fetch thumbnail batch:", response.status, response.statusText);
                        resolve()
                        return;
                    }


                    const data = await response.json();
                    for (const thumbnail of data.data) {
                        if (thumbnail.imageUrl === initialImageUrl) {
                            resolve({ status: "FOUND", requestId: thumbnail.requestId });
                            return;
                        }
                        allThumbnailResponses.push(...data.data)
                    }
                    resolve();
                    retries = maxRetries + 1
                }
                catch (error) {
                    console.error("Error fetching thumbnail batch:", error);
                    resolve()
                }
            }

        });

        fetchPromises.push(fetchPromise);
    }

    const results = await Promise.all(fetchPromises);

    const foundResult = results.find(res => res && res.status === "FOUND")
    if (foundResult) {
        return foundResult
    }
    return allThumbnailResponses;
}

async function fetchInitialThumbnail(targetid, updateRateLimitCount, isCancelledRef, setNoThumbnailMessage) {
    const initialPayload = [
        {
            type: "AvatarHeadshot",
            size: "150x150",
            targetid: targetid
        }
    ];
    let retries = 0;
    const maxRetries = 5;
    while (retries <= maxRetries) {
        if (isCancelledRef.current) {
            return null;
        }
        let isRateLimitedOnThisRequest = false;
        await delayRequest();
        recordRequest()
        try {
            const response = await fetch("https://thumbnails.roblox.com/v1/batch", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    "Cache-Control": "no-cache",
                },
                body: JSON.stringify(initialPayload),
            });

            if (response.status === 429) {
                if (!isRateLimited) {
                    isRateLimited = true;
                    rateLimitStartTime = Date.now()
                    if (updateRateLimitCount) {
                        updateRateLimitCount();
                    }
                    isRateLimitedOnThisRequest = true
                    console.warn("Too many initial thumbnail requests, attempting to spam until un-rate-limited.");
                }
                const delay = Math.random() * 10 + 20;
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
                continue
            }
            if (isRateLimited) {
                const timeUnRateLimited = (Date.now() - rateLimitStartTime) / 1000
                isRateLimited = false
                rateLimitStartTime = 0;
            }

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            if (data && data.data && data.data[0]) {
                if (data.data[0].imageUrl) {
                    return data.data[0].imageUrl;
                } else if (data.data[0].state === "Blocked") {
                    return "NO_THUMBNAIL";
                } else {
                    return null;
                }
            } else {
                return null;
            }
            retries = maxRetries + 1;
        } catch (error) {
            return null;
        }
    }
}

let sniperUIElements = {};
let isSniping = false;
let isCancelledRef = { current: false };
function clearPreviousSearch() {
    localStorage.removeItem('previousSearch');
    previousSearch = {
        placeId: null,
        userId: null,
        initialImageUrl: null,
        nextPageCursor: null,
        requestCount: 0,
        startTime: 0,
        requestId: null
    };
}


function createSniperUI() {
    const thumbnailImage = document.createElement('img');
    thumbnailImage.src = 'data:image/svg+xml,%3Csvg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"%3E%3CCircle cx="50" cy="50" r="49" stroke="%23808080" stroke-width="2" stroke-dasharray="6 6"/%3E%3C/svg%3E'; 
    thumbnailImage.style.cssText = `
        width: 55px;
        height: 55px;
        border-radius: 50%;
        margin-right: 15px;
        object-fit: cover; 
        background-color: var(--input-background); 
        border: var(--input-border); 
    `;

    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder = 'User ID or Username';
    inputField.style.cssText = `
            margin-bottom: 0px;
            padding: 8px;
            height: 36px;
            border-radius: 8px; 
            border: var(--input-border);
            font-size: 14px;
             color: var(--input-text);
             background-color: var(--input-background);
             pointer-events: auto;
             margin-right: 5px;
        `;
    inputField.value = previousSearch.userId || '';

    const startButton = document.createElement('button');
    startButton.textContent = 'Search';
    startButton.style.cssText = `
        padding: 5px 15px;
        background-color: var(--button-background);
        color: var(--Start-Sniper);
        border: none;
        border-radius: 8px; 
        cursor: pointer;
        font-size: 16px;
        height: 36px;
        font-weight: 400;
        transition: background-color 0.3s, transform 0.3s;
         pointer-events: auto;
         margin-right: 5px;
         width: 140px; 
    `;
    startButton.classList.add('sniper-button');

    const requestCountLabel = document.createElement('span');
    requestCountLabel.textContent = 'Servers Searched:';
    requestCountLabel.style.cssText = `
        color: var(--text-color-stuff);
        font-size: 16px;
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
        font-weight: 400;
        pointer-events: none;
        margin-right: 5px; 
    `;
    const requestCountNumber = document.createElement('span');
    requestCountNumber.textContent = `${previousSearch.requestCount || 0}`;
    requestCountNumber.style.cssText = `
        color: var(--text-color-stuff);
        font-size: 16px;
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
        font-weight: 400;
        pointer-events: none;
    `;
    const requestCountDisplay = document.createElement('div');
    requestCountDisplay.style.cssText = `
        display: flex;
        flex-direction: row; 
        align-items: baseline;
        margin-right: 15px; 
    `;
    requestCountDisplay.appendChild(requestCountLabel);
    requestCountDisplay.appendChild(requestCountNumber);


    const elapsedTimeLabel = document.createElement('span');
    elapsedTimeLabel.textContent = 'Time:';
    elapsedTimeLabel.style.cssText = `
        color: var(--text-color-stuff);
        font-size: 16px;
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
        font-weight: 400;
        pointer-events: none;
        margin-right: 5px; 
    `;
    const elapsedTimeNumber = document.createElement('span');
    elapsedTimeNumber.textContent = '0s';
    elapsedTimeNumber.style.cssText = `
        color: var(--text-color-stuff);
        font-size: 16px;
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
        font-weight: 400;
        pointer-events: none;
    `;
    const elapsedTimeDisplay = document.createElement('div');
    elapsedTimeDisplay.style.cssText = `
        display: flex;
        flex-direction: row; 
        align-items: baseline; 
    `;
    elapsedTimeDisplay.appendChild(elapsedTimeLabel);
    elapsedTimeDisplay.appendChild(elapsedTimeNumber);


    const displayContainer = document.createElement('div');
    displayContainer.style.cssText = `
        display: flex;
        flex-direction: row; 
        align-items: baseline; 
        margin-right: 5px;
        margin-left: 5px;
    `;
    displayContainer.appendChild(requestCountDisplay);
    displayContainer.appendChild(elapsedTimeDisplay);


    return { thumbnailImage, inputField, startButton, requestCountDisplay, elapsedTimeDisplay, displayContainer, requestCountNumber, elapsedTimeNumber };
}

function applyJoinButtonStyle(joinButton) {
    const robloxPlayButton = document.querySelector('.btn-common-play-game-lg.btn-primary-md.btn-full-width[data-testid="play-button"]');
    if (robloxPlayButton) {
        const computedStyle = window.getComputedStyle(robloxPlayButton);
        joinButton.style.backgroundColor = computedStyle.backgroundColor;
        joinButton.style.color = computedStyle.color;
        joinButton.style.border = computedStyle.border;
        joinButton.style.borderRadius = computedStyle.borderRadius;
        joinButton.style.fontSize = computedStyle.fontSize;
        joinButton.style.fontWeight = computedStyle.fontWeight;
        joinButton.style.padding = '7px 15px';
    } else {
        joinButton.style.backgroundColor = 'var(--join-button-background)';
        joinButton.style.color = 'white';
        joinButton.style.padding = '7px 15px';
    }

    joinButton.style.cursor = 'pointer';
    joinButton.style.transition = 'background-color 0.3s, transform 0.3s';
    joinButton.style.pointerEvents = 'auto';
    joinButton.style.width = '100%';
    joinButton.style.boxSizing = 'border-box';
    joinButton.style.textAlign = 'center';
    joinButton.style.borderRadius = '8px';
}

async function fetchThemeFromAPI() {
    try {
        const bodyElement = document.querySelector('body.rbx-body');
        if (bodyElement) {
            if (bodyElement.classList.contains('dark-theme')) {
                return 'dark';
            } else if (bodyElement.classList.contains('light-theme')) {
                return 'light';
            }
        }
        console.warn('Theme class not found on body element, defaulting to light.');
        return 'light';
    } catch (error) {
        console.error('Error fetching theme from body element:', error);
        return 'light'; 
    }
}


function injectButton() {
    const removalDate = new Date();
    removalDate.setDate(removalDate.getDate() + 14); // Sets the removal date to yesterday

    const currentDate = new Date();

    // If the current date is on or after the removal date, do not inject the UI
    if (currentDate >= removalDate) {
        return;
    }

    let targetElement = document.querySelector("#rbx-public-running-games");
    if (!targetElement) {
        targetElement = document.querySelector("#running-game-instances-container");
        if (!targetElement) {
            console.error("Target element not found to inject button");
            return;
        }
    }

    // The rest of your injectButton function remains the same...
    sniperUIElements = createSniperUI();
    const { thumbnailImage, inputField, startButton, displayContainer } = sniperUIElements;

    const sniperHeaderLabel = document.createElement('div');
    sniperHeaderLabel.textContent = 'User Sniper';
    sniperHeaderLabel.style.cssText = `
        color: var(--text-color-header);
        font-size: 18px;
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
        font-weight: bold;
        margin-bottom: 10px;
        text-align: left;
        margin-left: 5px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'sniper-button-container';
    buttonContainer.style.cssText = `
        display: flex;
        justify-content: flex-start;
        align-items: center;
        margin-bottom: 5px;
    `;
    buttonContainer.appendChild(thumbnailImage);
    buttonContainer.appendChild(inputField);
    buttonContainer.appendChild(startButton);
    buttonContainer.appendChild(displayContainer);

    const messageContainer = document.createElement('div');
    messageContainer.id = 'messageContainer';
    messageContainer.style.cssText = `
        display: flex;
        justify-content: center;
        width: 100%;
        margin-top: 5px;
        color: var(--text-color);
        font-size: 14px;
        font-family: "Builder Sans", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
        font-weight: bold;
    `;

    const disabledUIContainer = document.createElement('div');
    disabledUIContainer.style.cssText = `
        position: relative;
        padding: 10px;
        border-radius: 8px;
        background-color: var(--overlay-background);
        pointer-events: none;
    `;

    const formattedDate = removalDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: var(--text-color-header);
        text-align: center;
        z-index: 10;
        background-color: rgba(0, 0, 0, 0.6);
        border-radius: 8px;
        pointer-events: auto;
    `;
    
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: bold;">User Sniping Has Been Completely Patched by Roblox</div>
        <div style="font-size: 16px; margin-top: 8px;">don't shoot the messenger🥺</div>
        <div style="font-size: 14px; margin-top: 20px; opacity: 0.8;">This will be removed on ${formattedDate}.</div>
    `;


    inputField.disabled = true;
    startButton.disabled = true;
    startButton.style.cursor = 'not-allowed';
    startButton.onclick = null; 

    disabledUIContainer.appendChild(sniperHeaderLabel);
    disabledUIContainer.appendChild(buttonContainer);
    disabledUIContainer.appendChild(messageContainer);
    disabledUIContainer.appendChild(overlay);

    targetElement.insertBefore(disabledUIContainer, targetElement.firstChild);

    startButton.onclick = null;
}


async function initialize() {
    let universalSniperEnabled = true; 
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const settings = await new Promise((resolve) => {
            chrome.storage.local.get({ universalSniperEnabled: true }, (result) => {
                resolve(result);
            });
        });
        universalSniperEnabled = settings.universalSniperEnabled;
    }

    if (!universalSniperEnabled) {
        return;
    }

    if (getPlaceIdFromUrl() == null) {
        clearPreviousSearch()
    }

    let attempts = 0;
    const maxAttempts = 300; 
    const startTime = performance.now();

    function checkForElement(timestamp) {
        const publicRunningGames = document.querySelector("#rbx-public-running-games");
        const runningGameInstances = document.querySelector("#running-game-instances-container");
        
        const isPublicRunningGamesReady = publicRunningGames !== null;
        const isRunningGameInstancesReady = runningGameInstances !== null && runningGameInstances.children.length > 0;
        
        if (isPublicRunningGamesReady || isRunningGameInstancesReady) {
            injectButton();
            fetchThemeFromAPI().then(theme => {
                updateThemeStyles(theme);
            });
            return;
        }

        attempts++;
        
        if (attempts < maxAttempts) {
            requestAnimationFrame(checkForElement);
        } else {
            console.warn("Could not find target element after 10 seconds");
        }
    }

    requestAnimationFrame(checkForElement);
}

function updateThemeStyles(theme) {
    if (theme === 'dark') {
        document.documentElement.style.setProperty('--text-color', 'rgb(255, 255, 255)');
        document.documentElement.style.setProperty('--overlay-background', 'rgb(68, 72, 76)');
        document.documentElement.style.setProperty('--button-background', 'rgba(208, 217, 251, 0.08)');
        document.documentElement.style.setProperty('--button-hover-background', 'rgb(0, 176, 111)');
        document.documentElement.style.setProperty('--border-color', '#444');
        document.documentElement.style.setProperty('--border-color-hover', '#24292e');
        document.documentElement.style.setProperty('--input-background', 'rgba(139, 147, 180, 0.08)');
        document.documentElement.style.setProperty('--join-button-background', 'rgb(0, 176, 111)');
        document.documentElement.style.setProperty('--input-border', '1px solid rgba(208, 217, 251, 0.12)');
        document.documentElement.style.setProperty('--Start-Sniper', 'rgb(247, 247, 248)');
        document.documentElement.style.setProperty('--input-text', 'rgb(247, 247, 248)');
        document.documentElement.style.setProperty('--text-color-stuff', 'rgb(213, 215, 221)');
        document.documentElement.style.setProperty('--text-color-header', 'rgb(247, 247, 248)');


    } else if (theme === 'light') {
        document.documentElement.style.setProperty('--text-color', 'rgb(73, 77, 90)');
        document.documentElement.style.setProperty('--overlay-background', 'rgb(245, 245, 245)');
        document.documentElement.style.setProperty('--button-background', 'rgba(27, 37, 75, 0.12)');
        document.documentElement.style.setProperty('--button-hover-background', 'rgb(0, 176, 111)');
        document.documentElement.style.setProperty('--border-color', '#ccc');
        document.documentElement.style.setProperty('--border-color-hover', '#999');
        document.documentElement.style.setProperty('--input-background', 'rgba(27, 37, 75, 0.08)');
        document.documentElement.style.setProperty('--join-button-background', 'rgb(0, 176, 111)');
        document.documentElement.style.setProperty('--input-border', '1px solid rgba(27, 37, 75, 0.12)');
        document.documentElement.style.setProperty('--Start-Sniper', 'rgb(32, 34, 39)');
        document.documentElement.style.setProperty('--input-text', 'rgb(32, 34, 39)');
        document.documentElement.style.setProperty('--text-color-stuff', 'rgb(57, 59, 61)');
        document.documentElement.style.setProperty('--text-color-header', 'rgb(32, 34, 39)');
    } else {
        updateThemeStyles('light');
    }
}

initialize()