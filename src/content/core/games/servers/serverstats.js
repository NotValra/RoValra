// Server stats like total servers and versions

import { callRobloxApi } from '../../api.js';
import { addTooltip } from '../../ui/tooltip.js';
import DOMPurify from 'dompurify';
import { observeElement, startObserving } from '../../observer.js';


let versionDataCache = null;


let statsBarObserverAttached = false;


async function fetchLatestPlaceVersion(placeId) {
    if (!placeId) return null;

    try {
        const response = await callRobloxApi({
            subdomain: 'develop',
            endpoint: '/v1/assets/latest-versions',
            method: 'POST',
            body: {
                assetIds: [parseInt(placeId, 10)],
                versionStatus: 'Published'
            }
        });

        if (!response.ok) {
            throw new Error(`Roblox API request failed with status: ${response.status}`);
        }

        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            if (result.status === 'Success' && result.versionNumber) {
                return result.versionNumber;
            }
        }

        return null;
    } catch (error) {
        console.error('RoValra Server Stats: Failed to fetch latest place version from Roblox.', error);
        return null;
    }
}


export async function fetchServerStats(placeId) {
    if (!placeId) return null;

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/v1/servers/counts?place_id=${placeId}`,
            method: 'GET',
            isRovalraApi: true
        });

        if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status !== 'success' || !data.counts) {
            throw new Error("API returned an error or invalid data.");
        }

        const robloxVersion = await fetchLatestPlaceVersion(placeId);
        
        if (robloxVersion) {
            data.counts.newest_place_version = robloxVersion;
        }

        return data.counts;
    } catch (error) {
        console.error('RoValra Server Stats: Failed to fetch server statistics.', error);
        return null;
    }
}


function detectTheme() {
    return document.body.classList.contains('dark-theme') ? 'dark' : 'light';
}


function createStatItem(icon, label, value, theme) {
    return `
        <div class="rovalra-stat-item">
            <div class="stat-icon ${theme}">${icon}</div>
            <div class="stat-text">
                <span class="stat-value ${theme}">${value.toLocaleString()}</span>
                <span class="stat-label ${theme}">${label}</span>
            </div>
        </div>`;
}


function applyVersionAttributes(element) {
    if (!versionDataCache) return;

    const serverItemContainer = element || document.getElementById('rbx-public-game-server-item-container');
    if (serverItemContainer && !serverItemContainer.hasAttribute('data-newest-version')) {
        if (versionDataCache.newest_place_version) {
            serverItemContainer.dataset.newestVersion = versionDataCache.newest_place_version;
        }
        if (versionDataCache.oldest_place_version) {
            serverItemContainer.dataset.oldestVersion = versionDataCache.oldest_place_version;
        }
    }
}


async function createStatsBarUI(serverListContainer) {
    if (serverListContainer.dataset.statsBarInitialized) return;
    serverListContainer.dataset.statsBarInitialized = 'true';

    let settings;
    try {
        settings = await new Promise((resolve, reject) => {
            chrome.storage.local.get(['TotalServersEnabled', 'GameVersionEnabled', 'OldestVersionEnabled'], result => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                resolve(result);
            });
        });
    } catch (error) {
        console.error('RoValra Server Stats: Failed to fetch settings.', error);
        return;
    }

    if (settings.TotalServersEnabled !== true) {
        return;
    }

    const header = serverListContainer.querySelector('.container-header');
    if (!header) return;
    
    serverListContainer.querySelector('.rovalra-stats-container')?.remove();

    const counts = versionDataCache;
    const theme = detectTheme();
    
    const hasRegions = counts.regions && Object.keys(counts.regions).length > 0;
    
    const hasActiveStats = counts.total_servers > 0 && hasRegions;

    if (!hasActiveStats && !counts.newest_place_version) {
        return;
    }

    const statsContainer = document.createElement('div');
    statsContainer.className = 'rovalra-stats-container';
    statsContainer.style.cssText = 'display: flex; gap: 0; margin-bottom: 9px; margin-left: 9px; gap: 4.5px; align-items: center;';


    if (hasActiveStats) {
        const totalServersBar = document.createElement('div');
        totalServersBar.className = `rovalra-region-stats-bar ${theme}`;
        const totalIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1M7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2M20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1M7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2" fill="currentColor"></path></svg>`;
        totalServersBar.innerHTML = DOMPurify.sanitize(createStatItem(totalIcon, 'Total Servers', counts.total_servers, theme));
        addTooltip(totalServersBar, 'Total servers RoValra is tracking under this experience', { position: 'top' });
        statsContainer.appendChild(totalServersBar);
    }


    if (settings.GameVersionEnabled === true && counts.newest_place_version) {
        const versionBar = document.createElement('div');
        versionBar.className = `rovalra-region-stats-bar ${theme}`;
        const versionIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8z" fill="currentColor"></path></svg>`;
        versionBar.innerHTML = DOMPurify.sanitize(createStatItem(versionIcon, 'Version', `v${counts.newest_place_version}`, theme));
        addTooltip(versionBar, 'The current version published.', { position: 'top' });
        statsContainer.appendChild(versionBar);
    }


    if (settings.OldestVersionEnabled === true && counts.oldest_place_version && hasActiveStats) {
        const oldestVersionBar = document.createElement('div');
        oldestVersionBar.className = `rovalra-region-stats-bar ${theme}`;
        const oldestVersionIcon = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: scaleX(-1);"><path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8z" fill="currentColor"></path></svg>`;
        oldestVersionBar.innerHTML = DOMPurify.sanitize(createStatItem(oldestVersionIcon, 'Oldest', `v${counts.oldest_place_version}`, theme));
        addTooltip(oldestVersionBar, 'The oldest version a server is currently running.', { position: 'top' });
        statsContainer.appendChild(oldestVersionBar);
    }
    
    if (serverListContainer.closest('#roseal-running-game-instances-container')) {
        const controls = document.getElementById('rovalra-main-controls');
        const options = serverListContainer.querySelector('.server-list-options');
        
        if (controls && serverListContainer.contains(controls)) {
            controls.insertAdjacentElement('afterend', statsContainer);
        } else if (options) {
            options.insertAdjacentElement('afterend', statsContainer);
        } else {
            serverListContainer.appendChild(statsContainer);
        }
    } else {
        header.insertAdjacentElement('afterend', statsContainer);
    }
}


export async function initGlobalStatsBar() {
    if (statsBarObserverAttached) {
        return;
    }

    const placeId = window.location.pathname.match(/\/games\/(\d+)\//)?.[1];
    if (!placeId) {
        return;
    }

    statsBarObserverAttached = true;
    startObserving();

    observeElement('#rbx-public-game-server-item-container', (element) => {
        applyVersionAttributes(element);
    });

    observeElement('#rbx-public-running-games', (element) => {
        if (versionDataCache) {
            createStatsBarUI(element);
        }
    });

    try {
        const data = await fetchServerStats(placeId);
        if (data) {
            versionDataCache = data;
            applyVersionAttributes();
            const serverListContainer = document.getElementById('rbx-public-running-games');
            if (serverListContainer) {
                createStatsBarUI(serverListContainer);
            }
        }
    } catch (error) {
        console.error('RoValra Server Stats: Failed to initialize stats bar.', error);
    }
}


export function getVersionDataCache() {
    return versionDataCache;
}


export function resetStatsBarObserver() {
    statsBarObserverAttached = false;
    versionDataCache = null;
}