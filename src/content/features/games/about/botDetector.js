import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import DOMPurify from 'dompurify';

const MAX_SERVERS_TO_CHECK = 50;
const BOT_PERCENTAGE_THRESHOLD = 10;
const SIMILARITY_THRESHOLD = 5;
const MIN_PLAYERS_TO_PROCESS = 3;

function getPlaceIdFromUrl(url) {
    const standardMatch = url.match(/\/games\/(\d+)/);
    if (standardMatch && standardMatch[1]) return standardMatch[1];
    
    const numericMatch = url.match(/\/games\/([0-9]+)/);
    if (numericMatch && numericMatch[1]) return numericMatch[1];
    
    const queryMatch = url.match(/[?&]placeId=(\d+)/i);
    if (queryMatch && queryMatch[1]) return queryMatch[1];
    
    const anyNumberMatch = url.match(/[^0-9](\d{8,})[^0-9]/);
    if (anyNumberMatch && anyNumberMatch[1]) return anyNumberMatch[1];
    
    return null;
}

class BotDetector {    
    constructor() {
        this.totalPlayersProcessed = 0;
        this.totalBotsFound = 0;
        this.requestIntercepted = false;
        this.initialScanComplete = false;

        if (window.location.href.includes('/games/')) {
            const placeId = getPlaceIdFromUrl(window.location.href);
            if (placeId) {
                this.initialize();
            }
        }
        
        this.updateBotStats();    
    }

    async updateBotStats() {
        const descWrapper = document.getElementById('btr-description-wrapper');
        const gameDescContainer = document.querySelector('.game-description-container');
        const targetElement = descWrapper || gameDescContainer;
        
        if (!targetElement) return;

        const placeId = getPlaceIdFromUrl(window.location.href);
        if (!placeId) return;

        const isLightTheme = document.body.classList.contains('light-theme');
        const tooltipTextColor = "var(--rovalra-secondary-text-color)";

        let statsContainer = document.querySelector('.bot-stats-container');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.className = 'bot-stats-container';
            statsContainer.style.cssText = `
                display: flex;
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
        const tooltipText = `Bots are accounts running automated scripts to farm items. A single user can sometimes run 50+ bots.\n\nKeep in mind that this is not a fault of the game developers. This information can be inaccurate if an experience is mainly played by new Roblox accounts.`;

        if (botPercentage > 20) {
            statsContainer.innerHTML = DOMPurify.sanitize(`
                <div style="display: flex; align-items: center; gap: 4px; color: ${tooltipTextColor};">
                    <span style="font-weight: 500;"><span style="color: var(--rovalra-main-text-color)">${gameName}</span> has a lot of bots</span>
                    <i class="icon-moreinfo"></i>
                </div>
            `);
            const infoIcon = statsContainer.querySelector('.icon-moreinfo');
            addTooltip(infoIcon, tooltipText, { position: 'top' });
        } else if (botPercentage > BOT_PERCENTAGE_THRESHOLD) {
            statsContainer.innerHTML = DOMPurify.sanitize(`
                <div style="display: flex; align-items: center; gap: 4px; color: ${tooltipTextColor};">
                    <span style="font-weight: 500;"><span style="color: var(--rovalra-main-text-color);">${gameName}</span> has some bots but mostly real players</span>
                    <i class="icon-moreinfo"></i>
                </div>
            `);
            const infoIcon = statsContainer.querySelector('.icon-moreinfo');
            addTooltip(infoIcon, tooltipText, { position: 'top' });
        } else {
            statsContainer.innerHTML = '';
        }
    }

    async initialize() {
        const placeId = getPlaceIdFromUrl(window.location.href);
        if (placeId) {
            await this.fetchServerData(placeId);
        }
    }

    async fetchServerData(placeId) {
        if (this.initialScanComplete) return;
        
        try {
            if (this.requestIntercepted) return;

            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/games/${placeId}/servers/Public?limit=50`,
                method: 'GET'
            });
            
            if (!response.ok) return;

            const data = await response.json();
            
            if (data && data.data && Array.isArray(data.data)) {
                this.requestIntercepted = true;
                const servers = data.data.slice(0, MAX_SERVERS_TO_CHECK);
                this.scanServers(placeId, servers);
            }
        } catch (error) {
        }
    }

    refreshServerData() {
        const placeId = getPlaceIdFromUrl(window.location.href);
        if (placeId) {
            this.requestIntercepted = false;
            this.fetchServerData(placeId);
            return true;
        }
        return false;
    }

    async calculateImageHash(imageUrl) {
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
    }

    calculateHashDistance(hash1, hash2) {
        let distance = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) distance++;
        }
        return distance;
    }

    async getThumbnails(playerTokens) {
        try {
            if (playerTokens.length === 0) return [];
            
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
                    const response = await callRobloxApi({
                        subdomain: 'thumbnails',
                        endpoint: '/v1/batch',
                        method: 'POST',
                        body: requestData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data && data.data) {
                            results.push(...data.data);
                        }
                    } else if (response.status === 429) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (batchError) {
                }
            }
            
            return results
                .filter(item => item.state === "Completed")
                .map(item => item.imageUrl);
        } catch (error) {
            return [];
        }
    }

    async scanServers(placeId, servers) {
        try {
            if (!servers || !Array.isArray(servers) || servers.length === 0) return;
            
            let allPlayerTokens = [];
            const MAX_THUMBNAILS_PER_SERVER = 5;
            
            servers.forEach((server) => {
                const serverTokens = (server.playerTokens || []).slice(0, MAX_THUMBNAILS_PER_SERVER);
                allPlayerTokens.push(...serverTokens);
            });

            const allImageUrls = await this.getThumbnails(allPlayerTokens);
            
            if (!allImageUrls.length) return;

            const MIN_THUMBNAILS_REQUIRED = 200;
            if (allImageUrls.length < MIN_THUMBNAILS_REQUIRED) {
                this.requestIntercepted = false;
                return;
            }

            const hashes = await Promise.all(
                allImageUrls.map(url => this.calculateImageHash(url))
            );
            
            const validHashes = hashes.filter(hash => hash !== null);
            const similarGroups = new Map();
            const COMPARISON_GROUP_SIZE = 10;
            
            for (let groupStart = 0; groupStart < validHashes.length; groupStart += COMPARISON_GROUP_SIZE) {
                const groupEnd = Math.min(groupStart + COMPARISON_GROUP_SIZE, validHashes.length);
                const currentGroup = validHashes.slice(groupStart, groupEnd);
                
                for (let i = 0; i < currentGroup.length; i++) {
                    for (let j = i + 1; j < currentGroup.length; j++) {
                        const distance = this.calculateHashDistance(currentGroup[i], currentGroup[j]);
                        
                        if (distance <= SIMILARITY_THRESHOLD) {
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

            this.updateBotStats();
            this.initialScanComplete = true; 

            setTimeout(() => {
                this.requestIntercepted = false;
            }, 10000);
        } catch (error) {
            this.requestIntercepted = false;
        }
    }
};

window.BotDetector = BotDetector;

export function init() {
    chrome.storage.local.get({ botdataEnabled: false }, function(settings) {
        if (settings.botdataEnabled && window.location.href.includes('/games/')) {
            const placeId = getPlaceIdFromUrl(window.location.href);
            if (placeId) {
                window.botDetector = new BotDetector();
                
                if (observeElement && typeof observeElement === 'function') {
                    observeElement(
                        '#btr-description-wrapper, .game-description-container',
                        () => {
                            if (window.botDetector) {
                                window.botDetector.updateBotStats();
                            }
                        }
                    );
                }
            }
        }
    });
}