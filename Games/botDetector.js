const MAX_SERVERS_TO_CHECK = 50;
const BOT_PERCENTAGE_THRESHOLD = 10;
const SIMILARITY_THRESHOLD = 5;
const THUMBNAIL_BATCH_SIZE = 100;
const MIN_PLAYERS_TO_PROCESS = 3;
const ROBLOX_SERVER_URL_PATTERN = /^https:\/\/games\.roblox\.com\/v1\/games\/(\d+)\/servers\/Public/;

function getPlaceIdFromUrl(url) {
    const standardMatch = url.match(/\/games\/(\d+)/);
    if (standardMatch && standardMatch[1]) {
        return standardMatch[1];
    }
    
    const numericMatch = url.match(/\/games\/([0-9]+)/);
    if (numericMatch && numericMatch[1]) {
        return numericMatch[1];
    }
    
    const queryMatch = url.match(/[?&]placeId=(\d+)/i);
    if (queryMatch && queryMatch[1]) {
        return queryMatch[1];
    }
    
    const anyNumberMatch = url.match(/[^0-9](\d{8,})[^0-9]/);
    if (anyNumberMatch && anyNumberMatch[1]) {
        return anyNumberMatch[1];
    }
    
    return null;
}

class BotDetector {    
    constructor() {
        this.totalPlayersProcessed = 0;
        this.totalBotsFound = 0;
        this.serversProcessed = 0;
        this.suspiciousServers = 0;
        this.globalBotHashes = new Set();
        this.requestIntercepted = false;
        
        if (window.location.href.includes('/games/')) {
            const placeId = getPlaceIdFromUrl(window.location.href);
            if (placeId) {
                this.initialize();
            }
        }
        
        this.updateBotStats();    
    }async updateBotStats() {
        const descWrapper = document.getElementById('btr-description-wrapper');
        const gameDescContainer = document.querySelector('.game-description-container');
        
        const targetElement = descWrapper || gameDescContainer;
        
        if (!targetElement) return;

        const placeId = getPlaceIdFromUrl(window.location.href);
        
        if (!placeId) return;

        const isLightTheme = document.body.classList.contains('light-theme');
        const tooltipBgColor = isLightTheme ? 'rgb(255, 255, 255)' : 'rgb(18, 18, 21)';
        const tooltipTextColor = isLightTheme ? 'rgb(25, 25, 25)' : 'rgb(213, 215, 221)';
        const tooltipShadow = isLightTheme ? '0 2px 4px rgba(0, 0, 0, 0.1)' : '0 2px 4px rgba(0, 0, 0, 0.2)';
        const tooltipFontSize = '10px';

        let statsContainer = document.querySelector('.bot-stats-container');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.className = 'bot-stats-container';
            
            const style = document.createElement('style');
            style.textContent = `
                .bot-tooltip {
                    position: fixed !important;
                    background: ${tooltipBgColor};
                    color: ${tooltipTextColor};
                    padding: 6px 10px;
                    border-radius: 4px;
                    font-size: ${tooltipFontSize};
                    
                    font-weight: bold;
                    font-style: normal;
                    min-width: 200px;
                    max-width: 400px;
                    width: max-content;
                    text-align: center;
                    white-space: normal;
                    transform: translateY(-120%) translateX(-50%);
                    left: 50%;
                    top: 0;
                    z-index: 9999 !important;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.15s ease;
                    box-shadow: ${tooltipShadow};
                    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
                    letter-spacing: normal;
                    line-height: 15px;
                }
                
                .icon-moreinfo {
                    position: relative;
                    cursor: help;
                    transform: scale(0.8);
                    display: inline-block;
                    vertical-align: middle;
                    z-index: 1;
                }
            `;
            document.head.appendChild(style);
            
            statsContainer.style.cssText = `
                display: flex;
                margin-left: 12px;
                font-size: 14px;
                align-items: center;
                width: 100%;
                box-sizing: border-box;
                clear: both;
            `;
            targetElement.insertBefore(statsContainer, targetElement.firstChild);
        }
        
        const botPercentage = this.totalPlayersProcessed > 0 ? 
            ((this.totalBotsFound / this.totalPlayersProcessed) * 100) : 0;
            
        const gameNameElement = document.querySelector('.game-name');
        const gameName = gameNameElement ? gameNameElement.textContent.trim().split('\n')[0] : 'This game';

        const createTooltip = (content) => {
            const tooltip = document.createElement('div');
            tooltip.className = 'bot-tooltip';
            tooltip.textContent = content;
            return tooltip;
        };

        const setupTooltipBehavior = (infoIcon, tooltip) => {
            infoIcon.addEventListener('mouseenter', () => {
                if (tooltip.parentElement !== document.body) {
                    document.body.appendChild(tooltip);
                }
                
                const iconRect = infoIcon.getBoundingClientRect();
                tooltip.style.left = `${iconRect.left + (iconRect.width / 2)}px`;
                tooltip.style.top = `${iconRect.top}px`;
                
                tooltip.style.opacity = '1';
            });
            
            infoIcon.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
            });
        };

        if (botPercentage > 20) {
            statsContainer.innerHTML = `                <div style="display: flex; align-items: center; gap: 4px; color: ${tooltipTextColor};">
                    <span style="font-weight: 500;"><span style="color: ${isLightTheme ? 'rgb(25, 25, 25)' : 'rgb(247, 247, 248)'};">${gameName}</span> has a lot of bots</span>
                    <i class="icon-moreinfo"></i>
                </div>
            `;
            const infoIcon = statsContainer.querySelector('.icon-moreinfo');
            const tooltip = createTooltip(`Bots are accounts running automated scripts to farm items, a single user can sometimes run 50+ bots.\n\nKeep in mind that this is not a fault of the game devs.`);
            infoIcon.appendChild(tooltip);
            setupTooltipBehavior(infoIcon, tooltip);
        } else if (botPercentage > BOT_PERCENTAGE_THRESHOLD) {
            statsContainer.innerHTML = `                <div style="display: flex; align-items: center; gap: 4px; color: ${tooltipTextColor};">
                    <span style="font-weight: 500;"><span style="color: ${isLightTheme ? 'rgb(25, 25, 25)' : 'rgb(247, 247, 248)'};">${gameName}</span> has some bots but mostly real players</span>
                    <i class="icon-moreinfo"></i>                </div>
            `;
            const infoIcon = statsContainer.querySelector('.icon-moreinfo');
            const tooltip = createTooltip(`Bots are accounts running automated scripts to farm items, a single user can sometimes run 50+ bots.\n\nKeep in mind that this is not a fault of the game devs.`);
            infoIcon.appendChild(tooltip);
            setupTooltipBehavior(infoIcon, tooltip);
        } else {
            statsContainer.innerHTML = '';
        }
    }    async initialize() {
        const currentUrl = window.location.href;
        const placeId = getPlaceIdFromUrl(currentUrl);
        
        if (placeId) {
            await this.fetchServerData(placeId);
        }
    }

    async fetchServerData(placeId) {
        try {
            if (this.requestIntercepted) {
                return;
            }

            const serverUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=50`;
            const response = await fetch(serverUrl);
            
            if (!response.ok) {
                return;
            }

            const data = await response.json();
            
            if (data && data.data && Array.isArray(data.data)) {
                this.requestIntercepted = true;
                const servers = data.data.slice(0, MAX_SERVERS_TO_CHECK);
                this.scanServers(placeId, servers);
            }
        } catch (error) {
            
        }
    }    refreshServerData() {
        const placeId = getPlaceIdFromUrl(window.location.href);
        if (placeId) {
            this.requestIntercepted = false;
            this.fetchServerData(placeId);
            return true;
        }
        return false;
    }async calculateImageHash(imageUrl) {
        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            
            return new Promise((resolve) => {
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 8;
                        canvas.height = 8;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, 8, 8);
                        
                        const data = ctx.getImageData(0, 0, 8, 8).data;
                        let hash = '';
                        
                        let avg = 0;
                        for (let i = 0; i < data.length; i += 4) {
                            avg += (data[i] + data[i + 1] + data[i + 2]) / 3;
                        }
                        avg = avg / (data.length / 4);
                        
                        for (let i = 0; i < data.length; i += 4) {
                            const pixel = (data[i] + data[i + 1] + data[i + 2]) / 3;
                            hash += pixel > avg ? '1' : '0';
                        }
                        
                        resolve(hash);
                    } catch (canvasError) {
                        resolve(null);
                    }
                };
                
                img.onerror = () => resolve(null);
                img.src = imageUrl;
            });
        } catch (error) {
            return null;
        }
    }    calculateHashDistance(hash1, hash2) {
        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) distance++;
        }
        return distance;
    }    
    
    async getThumbnails(playerTokens) {
        try {
            if (playerTokens.length === 0) {
                return [];
            }
            
            const results = [];
            const batchSize = 50;
            
            for (let i = 0; i < playerTokens.length; i += batchSize) {
                const batchTokens = playerTokens.slice(i, i + batchSize);
                
                const requestData = batchTokens.map(token => ({
                    requestId: token.slice(0, 10),
                    token: token,
                    type: "AvatarHeadshot",
                    size: "150x150",
                    format: "Png",
                    isCircular: false
                }));
                
                try {
                    const response = await fetch('https://thumbnails.roblox.com/v1/batch', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestData)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        
                        if (data && data.data) {
                            results.push(...data.data);
                        }
                    } else {
                        if (response.status === 429) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                } catch (batchError) {
                    
                }
            }
            
            const completedItems = results.filter(item => item.state === "Completed");
            return completedItems.map(item => item.imageUrl);
                
        } catch (error) {
            return [];
        }
    }    async processServer(serverData) {
        const playerTokens = serverData.playerTokens || [];
        const playerCount = serverData.playing || 0;

        if (playerCount < MIN_PLAYERS_TO_PROCESS) return null;

        const imageUrls = await this.getThumbnails(playerTokens);
        if (!imageUrls.length) return null;

        const hashes = await Promise.all(
            imageUrls.map(url => this.calculateImageHash(url))
        );
        const validHashes = hashes.filter(hash => hash !== null);

        let similarPairsCount = 0;
        let botHashes = new Set();

        for (let i = 0; i < validHashes.length; i++) {
            for (let j = i + 1; j < validHashes.length; j++) {
                const distance = this.calculateHashDistance(validHashes[i], validHashes[j]);
                if (distance <= SIMILARITY_THRESHOLD) {
                    similarPairsCount++;
                    botHashes.add(validHashes[i]);
                    botHashes.add(validHashes[j]);
                }
            }
        }

        return {
            serverID: serverData.id,
            botsFound: botHashes.size,
            totalPlayers: playerCount,
            similarPairs: similarPairsCount
        };
    }    async scanServers(placeId, servers) {
        try {
            if (!servers || !Array.isArray(servers) || servers.length === 0) {
                return;
            }
            
            const serverSizes = servers.map(s => s.playing || 0);
            const avgServerSize = serverSizes.reduce((a, b) => a + b, 0) / servers.length;
            const maxServerSize = Math.max(...serverSizes);
            const minServerSize = Math.min(...serverSizes);            let allPlayerTokens = [];
            const MAX_THUMBNAILS_PER_SERVER = 5;
            
            servers.forEach((server) => {
                const serverTokens = (server.playerTokens || []).slice(0, MAX_THUMBNAILS_PER_SERVER);
                allPlayerTokens.push(...serverTokens);
            });

            const allImageUrls = await this.getThumbnails(allPlayerTokens);
            
            if (!allImageUrls.length) {
                return;
            }

            const MIN_THUMBNAILS_REQUIRED = 200;
            if (allImageUrls.length < MIN_THUMBNAILS_REQUIRED) {
                const statusText = document.getElementById('bot-scan-status');
                if (statusText) {
                    statusText.textContent = `Not enough data (${allImageUrls.length}/${MIN_THUMBNAILS_REQUIRED} thumbnails required)`;
                }
                
                this.requestIntercepted = false;
                return;
            }            const hashes = await Promise.all(
                allImageUrls.map(url => this.calculateImageHash(url))
            );
            
            const validHashes = hashes.filter(hash => hash !== null);
            
            const similarGroups = new Map();
            let totalSimilarPairs = 0;
            const COMPARISON_GROUP_SIZE = 10;
            let totalComparisons = 0;
            
            for (let groupStart = 0; groupStart < validHashes.length; groupStart += COMPARISON_GROUP_SIZE) {
                const groupEnd = Math.min(groupStart + COMPARISON_GROUP_SIZE, validHashes.length);
                const currentGroup = validHashes.slice(groupStart, groupEnd);
                
                for (let i = 0; i < currentGroup.length; i++) {
                    for (let j = i + 1; j < currentGroup.length; j++) {
                        totalComparisons++;
                        const distance = this.calculateHashDistance(currentGroup[i], currentGroup[j]);
                        
                        if (distance <= SIMILARITY_THRESHOLD) {
                            totalSimilarPairs++;
                            
                            if (!similarGroups.has(currentGroup[i])) {
                                similarGroups.set(currentGroup[i], new Set([currentGroup[i]]));
                            }
                            similarGroups.get(currentGroup[i]).add(currentGroup[j]);
                        }
                    }
                }
            }

            const botGroups = Array.from(similarGroups.values()).filter(group => group.size >= 2);
            const totalBots = botGroups.reduce((total, group) => total + group.size, 0);

            this.totalPlayersProcessed = validHashes.length;
            this.totalBotsFound = totalBots;
            this.serversProcessed = servers.length;

            if (totalBots > 0) {
                this.suspiciousServers++;
            }
            
            const botPercentage = (this.totalBotsFound / this.totalPlayersProcessed) * 100;
            
            this.updateBotStats();
            
            setTimeout(() => {
                this.requestIntercepted = false;
            }, 10000);        } catch (error) {
            this.requestIntercepted = false;
        }
    }
    
      debugFetchServerData() {
        const placeId = getPlaceIdFromUrl(window.location.href);
        if (!placeId) {
            return false;
        }
        this.fetchServerData(placeId);
        return true;
    }
};

window.BotDetector = BotDetector;

if (window.location.href.includes('/games/')) {
    chrome.storage.local.get({ botdataEnabled: false }, function(settings) {
        if (settings.botdataEnabled) {
            window.botDetector = new BotDetector();
        }
    });
}