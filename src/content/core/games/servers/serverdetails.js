// adds information about servers

import { callRobloxApi } from '../../api.js';
import { observeElement } from '../../observer.js';


const CLASSES = {
    CONTAINER: 'rovalra-details-container',
    INFO_ROW: 'text-info',
    Region: 'rovalra-region-info',
    Uptime: 'rovalra-uptime-info',
    Performance: 'rovalra-performance-info',
    Version: 'rovalra-version-info',
    Full: 'rovalra-server-full-info',
    Private: 'rovalra-private-server-info',
    Purchase: 'rovalra-purchase-game-info',
    Inactive: 'rovalra-inactive-place-info'
};

const ORDERS = {
    Performance: 1,
    Uptime: 2,
    Version: 3,
    Region: 4,
    Purchase: 5,
    Status: 6
};

const STYLES = {
    container: 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 4px; min-height: 88px;',
    containerFriends: 'display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 8px; width: 100%; min-height: 88px;',
    row: 'display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 400;',
    icon: 'display: flex; align-items: center; flex-shrink: 0; height: 20px;',
    text: 'line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; flex: 1;'
};

const ICONS = {
    performanceHigh: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m16 6 2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    performanceLow: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m16 18 2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    uptime: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="m22 5.7-4.6-3.9-1.3 1.5 4.6 3.9zM7.9 3.4 6.6 1.9 2 5.7l1.3 1.5zM12.5 8H11v6l4.7 2.9.8-1.2-4-2.4zM12 4c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9m0 16c-3.9 0-7-3.1-7-7s3.1-7 7-7 7 3.1 7 7-3.1 7-7 7" fill="currentColor"/></svg>`,
    version: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    regionDefault: `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M11 8.17 6.49 3.66C8.07 2.61 9.96 2 12 2c5.52 0 10 4.48 10 10 0 2.04-.61 3.93-1.66 5.51l-1.46-1.46C19.59 14.87 20 13.48 20 12c0-3.35-2.07-6.22-5-7.41V5c0 1.1-.9 2-2 2h-2zm10.19 13.02-1.41 1.41-2.27-2.27C15.93 21.39 14.04 22 12 22 6.48 22 2 17.52 2 12c0-2.04.61-3.93 1.66-5.51L1.39 4.22 2.8 2.81zM11 18c-1.1 0-2-.9-2-2v-1l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.08 3.05 7.44 7 7.93z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    full: `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M11 8.17 6.49 3.66C8.07 2.61 9.96 2 12 2c5.52 0 10 4.48 10 10 0 2.04-.61 3.93-1.66 5.51l-1.46-1.46C19.59 14.87 20 13.48 20 12c0-3.35-2.07-6.22-5-7.41V5c0 1.1-.9 2-2 2h-2zm10.19 13.02-1.41 1.41-2.27-2.27C15.93 21.39 14.04 22 12 22 6.48 22 2 17.52 2 12c0-2.04.61-3.93 1.66-5.51L1.39 4.22 2.8 2.81zM11 18c-1.1 0-2-.9-2-2v-1l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.08 3.05 7.44 7 7.93z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    private: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    purchase: `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M11 8.17 6.49 3.66C8.07 2.61 9.96 2 12 2c5.52 0 10 4.48 10 10 0 2.04-.61 3.93-1.66 5.51l-1.46-1.46C19.59 14.87 20 13.48 20 12c0-3.35-2.07-6.22-5-7.41V5c0 1.1-.9 2-2 2h-2zm10.19 13.02-1.41 1.41-2.27-2.27C15.93 21.39 14.04 22 12 22 6.48 22 2 17.52 2 12c0-2.04.61-3.93 1.66-5.51L1.39 4.22 2.8 2.81zM11 18c-1.1 0-2-.9-2-2v-1l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.08 3.05 7.44 7 7.93z" stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
    inactive: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"/> stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`
};



let rovalraDatacentersCache = null;
let isShareLinkEnabled = true;
let isServerUptimeEnabled = true;
let isServerRegionEnabled = true;
let isPlaceVersionEnabled = true;
let isFullServerIDEnabled = true;
let isFullServerIndicatorsEnabled = true;
let isServerPerformanceEnabled = true;
let isMiscIndicatorsEnabled = true; 
let isDatacenterAndIdEnabled = true;
let isServerListModificationsEnabled = true;

const serverVersionsCache = {};

const cacheReadyPromise = new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve();

    chrome.storage.local.get([
        'rovalraDatacenters', 
        'ServerlistmodificationsEnabled',
        'enableShareLink', 
        'EnableServerUptime', 
        'EnableServerRegion', 
        'EnablePlaceVersion',
        'EnableFullServerID',
        'EnableFullServerIndicators',
        'EnableServerPerformance',
        'EnableMiscIndicators',
        'EnableDatacenterandId'
    ], (res) => {
        if (res?.rovalraDatacenters) rovalraDatacentersCache = res.rovalraDatacenters;
        
        if (res?.ServerlistmodificationsEnabled !== undefined) isServerListModificationsEnabled = res.ServerlistmodificationsEnabled;
        if (res?.enableShareLink !== undefined) isShareLinkEnabled = res.enableShareLink;
        if (res?.EnableServerUptime !== undefined) isServerUptimeEnabled = res.EnableServerUptime;
        if (res?.EnableServerRegion !== undefined) isServerRegionEnabled = res.EnableServerRegion;
        if (res?.EnablePlaceVersion !== undefined) isPlaceVersionEnabled = res.EnablePlaceVersion;
        if (res?.EnableFullServerID !== undefined) isFullServerIDEnabled = res.EnableFullServerID;
        if (res?.EnableFullServerIndicators !== undefined) isFullServerIndicatorsEnabled = res.EnableFullServerIndicators;
        if (res?.EnableServerPerformance !== undefined) isServerPerformanceEnabled = res.EnableServerPerformance;
        if (res?.EnableMiscIndicators !== undefined) isMiscIndicatorsEnabled = res.EnableMiscIndicators;
        if (res?.EnableDatacenterandId !== undefined) isDatacenterAndIdEnabled = res.EnableDatacenterandId;

        resolve();
    });

    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.rovalraDatacenters) rovalraDatacentersCache = changes.rovalraDatacenters.newValue;
            if (changes.ServerlistmodificationsEnabled) {
                isServerListModificationsEnabled = changes.ServerlistmodificationsEnabled.newValue;
                if (!isServerListModificationsEnabled) {
                    document.querySelectorAll('.rovalra-details-container, .rovalra-server-extra-details, .rovalra-copy-join-link').forEach(el => el.remove());
                } else {
                }
            }
            if (changes.enableShareLink) isShareLinkEnabled = changes.enableShareLink.newValue;
            if (changes.EnableServerUptime) isServerUptimeEnabled = changes.EnableServerUptime.newValue;
            if (changes.EnableServerRegion) isServerRegionEnabled = changes.EnableServerRegion.newValue;
            if (changes.EnablePlaceVersion) isPlaceVersionEnabled = changes.EnablePlaceVersion.newValue;
            if (changes.EnableFullServerID) isFullServerIDEnabled = changes.EnableFullServerID.newValue;
            if (changes.EnableFullServerIndicators) isFullServerIndicatorsEnabled = changes.EnableFullServerIndicators.newValue;
            if (changes.EnableServerPerformance) isServerPerformanceEnabled = changes.EnableServerPerformance.newValue;
            if (changes.EnableMiscIndicators) isMiscIndicatorsEnabled = changes.EnableMiscIndicators.newValue;
            if (changes.EnableDatacenterandId) {
                isDatacenterAndIdEnabled = changes.EnableDatacenterandId.newValue;
                document.querySelectorAll('[data-rovalra-serverid]').forEach(server => {
                    displayIpAndDcId(server);
                });
            }
        }
    });
});


export function createUUID() {
    return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function getLocationFromDataCenterId(id) {
    if (!rovalraDatacentersCache || !id) return null;
    const numId = Number(id);
    if (isNaN(numId)) return null;

    return rovalraDatacentersCache.find(entry => 
        (Array.isArray(entry.dataCenterIds) && entry.dataCenterIds.includes(numId)) || 
        entry.dataCenterId === numId
    ) || null;
}

export function getFullLocationName(data) {
    if (!data || typeof data !== 'object') return "Unknown Region";
    const loc = data.location || data;
    const { city, region } = loc;
    
    const parts = [city, (region && region !== city) ? region : null];
    
    return [...new Set(parts.filter(Boolean))].join(', ') || "Unknown Region";
}

function formatUptimeString(seconds) {
    if (seconds < 60) return null;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m~`);
    return parts.join(' ') || '0m~';
}

function normalizeText(s) {
    return s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
}

function extractCountryCode(regionName) {
    if (!regionName || !rovalraDatacentersCache?.length) return null;

    const parts = regionName.split(',').map(p => p.trim());
    for (const part of parts) {
        const id = Number(part);
        if (!isNaN(id)) {
            const loc = getLocationFromDataCenterId(id);
            if (loc?.location?.country) return loc.location.country.toLowerCase();
        }
    }

    const targetParts = parts.map(normalizeText);
    for (const entry of rovalraDatacentersCache) {
        const loc = entry.location || entry;
        if (!loc.country) continue;
        
        const city = normalizeText(loc.city);
        const region = normalizeText(loc.region);
        
        if (targetParts.includes(city) || targetParts.includes(region)) {
            return loc.country.toLowerCase();
        }
    }
    return null;
}

function removeCountryFromRegion(regionName) {
    if (!regionName || !rovalraDatacentersCache) return regionName;
    
    const parts = regionName.split(',').map(p => p.trim());
    if (parts.length <= 1) return regionName;

    const countrySet = new Set(rovalraDatacentersCache.flatMap(entry => {
        const loc = entry.location || entry;
        return [loc.country, loc.country_name].filter(Boolean).map(normalizeText);
    }));

    const filtered = parts.filter(part => {
        const norm = normalizeText(part);
        return !countrySet.has(norm) && !/^[A-Za-z]{2}$/.test(part);
    });

    return filtered.join(', ') || regionName;
}



export function getOrCreateDetailsContainer(server) {
    if (!isServerListModificationsEnabled) {
        return server.querySelector(`.${CLASSES.CONTAINER}`);
    }

    let container = server.querySelector(`.${CLASSES.CONTAINER}`);
    if (container) return container;

    container = document.createElement('div');
    container.className = CLASSES.CONTAINER;

    const isFriends = server.classList.contains('rbx-friends-game-server-item');
    container.style.cssText = isFriends ? STYLES.containerFriends : STYLES.container;


    const statusNode = server.querySelector('.text-info.rbx-game-status');

    if (statusNode && statusNode.parentNode) {
  
        statusNode.parentNode.insertBefore(container, statusNode.nextSibling);
    } else {
        const detailsParent = server.querySelector('.rbx-game-server-details, .rbx-friends-game-server-details');
        if (detailsParent) {
            detailsParent.prepend(container);
        } else {
            server.appendChild(container);
        }
    }
    return container;
}
export function createInfoElement(className, svg, text) {
    const element = document.createElement('div');
    element.className = `${className} ${CLASSES.INFO_ROW}`;
    element.style.cssText = STYLES.row;
    element.style.color = 'var(--rovalra-main-text-color)';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'rovalra-icon-wrapper';
    iconSpan.style.cssText = STYLES.icon;
    iconSpan.innerHTML = svg;
    
    const textSpan = document.createElement('span');
    textSpan.style.cssText = STYLES.text;
    textSpan.textContent = text;

    element.appendChild(iconSpan);
    element.appendChild(textSpan);
    return element;
}

function updateInfoElement(container, type, iconHTML, text, isVisible = true) {
    if (!container) return;

    const className = CLASSES[type];
    let element = container.querySelector(`.${className}`);

    if (!isVisible) {
        if (element) element.style.display = 'none';
        return;
    }

    if (!element) {
        element = createInfoElement(className, iconHTML, text);
        const orderIndex = ORDERS[type] || ORDERS.Status;
        element.style.order = orderIndex;
        container.appendChild(element);
    }

    const iconWrapper = element.querySelector('.rovalra-icon-wrapper');
    const textWrapper = element.querySelector('span:not(.rovalra-icon-wrapper)');
    
    if (iconWrapper) iconWrapper.innerHTML = iconHTML;
    if (textWrapper) textWrapper.textContent = text;
    
    element.style.display = 'flex';
    return element;
}

function clearExclusiveStatuses(container) {
    [CLASSES.Uptime, CLASSES.Version, CLASSES.Region, CLASSES.Full, CLASSES.Private, CLASSES.Purchase, CLASSES.Inactive]
        .forEach(cls => container.querySelector(`.${cls}`)?.remove());
}

function injectStyles() {
    if (document.getElementById('rovalra-dynamic-styles')) return;

    const style = document.createElement('style');
    style.id = 'rovalra-dynamic-styles';
    style.textContent = `
        .server-id-text span.show-on-hover {
            background-color: rgb(33, 33, 33);
            color: transparent;
            border-radius: 0px;
            padding: 0 4px;
            transition: background-color 0.2s ease, color 0.2s ease;
            cursor: default;
        }
        .server-id-text:hover span.show-on-hover {
            background-color: transparent;
            color: inherit;
        }
    `;
    document.head.appendChild(style);
}

function enableAvatarLinks(server) {
    const avatarLinks = server.querySelectorAll('.avatar-card-link');
    avatarLinks.forEach(link => {
        if (link.dataset.rovalraHooked) return;
        link.addEventListener('click', (e) => e.stopPropagation());
        link.dataset.rovalraHooked = 'true';
    });
}



export function displayPerformance(server, fps, serverLocations = {}) {
    if (!isServerPerformanceEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Performance', '', '', false);
        return;
    }

    if (serverLocations[server.dataset.rovalraServerid] === 'private') return;

    const container = getOrCreateDetailsContainer(server);
    let text = 'Server Performance Unknown';
    let icon = ICONS.performanceHigh;
    let visible = false;

    if (fps === 'fetching') {
        text = 'Server Performance Loading...';
        visible = true;
    } else if (typeof fps === 'number') {
        const percent = Math.min(100, Math.round((fps / 60) * 100));
        text = `Server Performance ${percent}%`;
        icon = percent < 50 ? ICONS.performanceLow : ICONS.performanceHigh;
        visible = true;
    }

    updateInfoElement(container, 'Performance', icon, text, visible);
}

export function displayUptime(server, uptime, serverLocations = {}) {
    if (!isServerUptimeEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Uptime', '', '', false);
        return;
    }

    if (serverLocations[server.dataset.rovalraServerid] === 'private') return;

    const container = getOrCreateDetailsContainer(server);
    let text = 'Unknown';
    let visible = false;

    if (uptime === 'fetching') {
        text = 'Loading...';
        visible = true;
    } else if (typeof uptime === 'number') {
        const fmt = formatUptimeString(uptime);
        if (fmt) {
            text = fmt;
            visible = true;
        }
    }

    updateInfoElement(container, 'Uptime', ICONS.uptime, text, visible);
}

export function displayPlaceVersion(server, version, serverLocations = {}) {
    if (!isPlaceVersionEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Version', '', '', false);
        return;
    }

    if (serverLocations[server.dataset.rovalraServerid] === 'private') return;

    const container = getOrCreateDetailsContainer(server);
    let text = 'Version Unknown';
    let visible = false;

    if (version && version !== 'Unknown') {
        text = `Version ${version}`;
        const containerList = document.getElementById('rbx-public-game-server-item-container');
        if (containerList) {
            if (String(version) === containerList.dataset.newestVersion) text += ' (Latest)';
            else if (String(version) === containerList.dataset.oldestVersion) text += ' (Oldest)';
        }
        visible = true;
    }

    updateInfoElement(container, 'Version', ICONS.version, text, visible);
}

export function displayRegion(server, regionName, serverLocations = {}) {
    if (!isServerRegionEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Region', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    
    if (regionName && regionName !== 'Unknown Region') {
        container.querySelector(`.${CLASSES.Full}`)?.remove();
        container.querySelector(`.${CLASSES.Private}`)?.remove();
    }

    let text = "Unknown";
    let icon = ICONS.regionDefault;
    let visible = false;

    if (regionName && regionName !== "Unknown Region" && regionName !== "N/A" && regionName !== "Unknown") {
        const countryCode = extractCountryCode(regionName);
        text = removeCountryFromRegion(regionName);
        
        if (text === "Unknown" || text === "N/A" || !text) {
            visible = false;
        } else {
            if (countryCode) {
                icon = `<img src="https://flagcdn.com/w40/${countryCode}.png" srcset="https://flagcdn.com/w80/${countryCode}.png 2x" width="20" height="14" alt="${countryCode}" style="display: block;">`;
            }
            visible = true;
        }
    }

    updateInfoElement(container, 'Region', icon, text, visible);
}

export function displayIpAndDcId(server) {
    let extraDiv = server.querySelector('.rovalra-server-extra-details');

    if (!isFullServerIDEnabled || !isDatacenterAndIdEnabled || !isServerListModificationsEnabled) {
        if (extraDiv) {
            extraDiv.remove();
        }
        return;
    }
    
    let idDiv = server.querySelector('.server-id-text');
    if (!idDiv) return;

    if (!extraDiv) {
        extraDiv = document.createElement('div');
        idDiv.after(extraDiv);
    }
    
    extraDiv.className = 'rovalra-server-extra-details text-info xsmall';

    const ip = server.dataset.rovalraIp;
    const dcId = server.dataset.rovalraDcId;

    extraDiv.style.cssText = `font-size: 9px; margin-top: 2px; display: flex; justify-content: space-between; min-height: 12px; padding: 0 8px; box-sizing: border-box;`;
    extraDiv.innerHTML = '';

    if (isDatacenterAndIdEnabled) {
        const ipSpan = document.createElement('span');
        ipSpan.textContent = ip || '---';
        extraDiv.appendChild(ipSpan);

        const dcIdSpan = document.createElement('span');
        dcIdSpan.textContent = dcId || '---';
        extraDiv.appendChild(dcIdSpan);
    }
}

export function displayServerFullStatus(server) {
    if (!isFullServerIndicatorsEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Full', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    container.querySelector(`.${CLASSES.Region}`)?.remove();
    updateInfoElement(container, 'Full', ICONS.full, "Server is Full", true);
}

export function displayPrivateServerStatus(server) {
    if (!isMiscIndicatorsEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Private', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    clearExclusiveStatuses(container);
    updateInfoElement(container, 'Private', ICONS.private, "Playing in a private server", true);
}

export function displayPurchaseGameStatus(server) {
    if (!isMiscIndicatorsEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Purchase', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    clearExclusiveStatuses(container);
    updateInfoElement(container, 'Purchase', ICONS.purchase, "Buy game to see regions.", true);
}

export function displayInactivePlaceStatus(server) {
    if (server) {
        server.remove();
    }
}

export async function fetchServerUptime(placeId, serverIds, serverLocations, serverUptimes) {
    const validIds = serverIds.filter(id => id && id !== 'null');
    if (!validIds.length) return;

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/v1/server_details?place_id=${placeId}&server_ids=${validIds.join(',')}`,
            method: 'GET',
            isRovalraApi: true
        });

        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        
        if (data.status !== 'success' || !data.servers) throw new Error('Invalid API Data');

        const now = new Date();
        const foundIds = new Set();

        data.servers.forEach(info => {
            const { server_id, first_seen, place_version, city, region, country, ip_address, datacenter_id } = info;
            if (!server_id) return;
            
            foundIds.add(server_id);

            if (place_version) serverVersionsCache[server_id] = place_version;

            const versionToDisplay = place_version || serverVersionsCache[server_id];

            let uptime = 'N/A';
            if (first_seen) {
                const date = new Date(first_seen.endsWith('Z') ? first_seen : first_seen + 'Z');
                if (!isNaN(date)) uptime = Math.max(0, (now - date) / 1000);
            }
            serverUptimes[server_id] = uptime;

            let regionStr = null;
            const locParts = [city, (region && region !== city) ? region : null, country].filter(p => p && p !== 'Unknown');
            if (locParts.length) {
                regionStr = [...new Set(locParts)].join(', ');
                serverLocations[server_id] = regionStr;
            }

   
            const serverEls = document.querySelectorAll(`[data-rovalra-serverid="${server_id}"]`);
            
            serverEls.forEach(serverEl => {
                if (ip_address != null) serverEl.dataset.rovalraIp = ip_address;
                if (datacenter_id != null) serverEl.dataset.rovalraDcId = datacenter_id;

                displayPlaceVersion(serverEl, versionToDisplay, serverLocations);
                displayUptime(serverEl, uptime, serverLocations);
                if (regionStr) {
                    displayRegion(serverEl, regionStr, serverLocations);
                }
                displayIpAndDcId(serverEl);
            });
        });

        validIds.filter(id => !foundIds.has(id)).forEach(id => {
            serverUptimes[id] = 'N/A';
            
            const matchingEls = document.querySelectorAll(`[data-rovalra-serverid="${id}"]`);
            matchingEls.forEach(el => {
                displayUptime(el, 'N/A', serverLocations);
                if (!serverLocations[id]) displayServerFullStatus(el);
            });
        });

    } catch (e) {
        validIds.forEach(id => {
            serverUptimes[id] = 'N/A';
            const matchingEls = document.querySelectorAll(`[data-rovalra-serverid="${id}"]`);
            matchingEls.forEach(el => {
                displayUptime(el, 'N/A', serverLocations);
            });
        });
    }
}
export async function fetchAndDisplayRegion(server, serverId, serverIpMap, serverLocations) {
    let placeId = server.dataset.placeid || window.location.href.match(/\/games\/(\d+)\//)?.[1];
    if (!placeId) {
        if (!serverLocations[serverId]) displayServerFullStatus(server);
        return;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: { placeId: parseInt(placeId), gameId: serverId, gameJoinAttemptId: createUUID() }
        });

        if (server.dataset.rovalraServerid !== serverId) return;

        if (response.ok) {
            const info = await response.json();
            const joinBtn = server.querySelector('.game-server-join-btn');

            if (info.joinScript) {
                const joinScript = info.joinScript;
                let changed = false;
                
                if (joinScript.DataCenterId != null && !server.dataset.rovalraDcId) {
                    server.dataset.rovalraDcId = joinScript.DataCenterId;
                    changed = true;
                }

                if (!server.dataset.rovalraIp) {
                    let ip = null;
                    if (joinScript.UdmuxEndpoints && joinScript.UdmuxEndpoints.length > 0 && joinScript.UdmuxEndpoints[0].Address) {
                        ip = joinScript.UdmuxEndpoints[0].Address;
                    } else if (joinScript.MachineAddress) {
                        ip = joinScript.MachineAddress;
                    }

                    if (ip) {
                        server.dataset.rovalraIp = ip;
                        changed = true;
                    }
                }

                if (changed) {
                    displayIpAndDcId(server);
                }
            }

            if (info.status === 12) {
                if (info.message?.includes("private instance")) {
                    if (!serverLocations[serverId]) {
                        serverLocations[serverId] = 'private';
                        displayPrivateServerStatus(server);
                    }
                    return;
                }
                if (info.message?.toLowerCase().includes("purchase access")) {
                    if (!serverLocations[serverId]) {
                        serverLocations[serverId] = 'purchase';
                        displayPurchaseGameStatus(server);
                    }
                    return;
                }
            }


            if (info.status === 5) {
                if (!serverLocations[serverId]) {
                    serverLocations[serverId] = 'inactive';
                    displayInactivePlaceStatus(server);
                }
                return;
            }
            
            if (info.status === 22) {
                if (isFullServerIndicatorsEnabled) {
                    if (joinBtn) {
                        joinBtn.textContent = info.queuePosition > 0 ? `Join (${info.queuePosition} In Queue)` : 'Server Full';
                        joinBtn.classList.replace('btn-primary-md', 'btn-secondary-md');
                    }
                    if (!serverLocations[serverId]) displayServerFullStatus(server);
                }
                return;
            }

            if (info.joinScript?.PlaceVersion) {
                if (!serverVersionsCache[serverId]) {
                    serverVersionsCache[serverId] = info.joinScript.PlaceVersion;
                    displayPlaceVersion(server, info.joinScript.PlaceVersion, serverLocations);
                }
            }

            if (!serverLocations[serverId] || serverLocations[serverId] === 'Unknown Region' || serverLocations[serverId] === 'Unknown') {
                const dcId = info.joinScript?.DataCenterId;
                let locInfo = (dcId && serverIpMap?.[dcId]) ? serverIpMap[dcId] : null;

                if (!locInfo && dcId) {
                    await cacheReadyPromise;
                    locInfo = getLocationFromDataCenterId(dcId);
                }

                if (locInfo) {
                    const fullName = getFullLocationName(locInfo);
                    serverLocations[serverId] = fullName;
                    displayRegion(server, fullName, serverLocations);
                }
            }
        }
    } catch (err) {
        if (!serverLocations[serverId]) displayServerFullStatus(server);
    }
}


export function isExcludedButton(node) {
    if (!node || !node.classList) return false;
    return node.classList.contains('rovalra-copy-join-link') ||
           node.classList.contains('rovalra-vip-invite-link') ||
           node.getAttribute('data-bind') === 'game-context-menu';
}

export function cleanupServerUI(server) {
    const toRemove = ['.server-performance'];
    server.querySelectorAll(toRemove.join(',')).forEach(el => {
        if (!isExcludedButton(el)) el.remove();
    });
    
    server.querySelectorAll('.text-info.rbx-game-status').forEach(el => {
        el.textContent = el.textContent.replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '').trim();
    });
}

let cleanupObserverInitialized = false;

export function attachCleanupObserver(server) {
    if (cleanupObserverInitialized) return;
    cleanupObserverInitialized = true;

    observeElement('.share-button, .server-performance', (node) => {
        if (!isExcludedButton(node) && node.closest('[data-rovalra-serverid]')) {
            node.remove();
        }
    }, { multiple: true });
}

export async function addCopyJoinLinkButton(server, serverId) {
    await cacheReadyPromise;
    if (isShareLinkEnabled === false || !isServerListModificationsEnabled) return;

    if (server.querySelector('.rovalra-copy-join-link')) return;

    const placeId = server.dataset.placeid || window.location.href.match(/\/games\/(\d+)\//)?.[1];
    if (!placeId) return;

    const btn = document.createElement('button');
    btn.className = 'btn-full-width btn-control-xs btn-primary-md btn-min-width rovalra-copy-join-link';
    btn.textContent = 'Share';
    btn.style.cssText = 'margin-top: 5px; width: 100%;';
    
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const link = `https://www.fishstrap.app/v1/joingame?placeId=${placeId}&gameInstanceId=${serverId}`;
        navigator.clipboard.writeText(link).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Share', 2000);
        });
    };

    const joinBtn = server.querySelector('.game-server-join-btn');
    if (joinBtn) {
        joinBtn.style.width = '100%';
        joinBtn.after(btn);
    } else {
        server.querySelector('.rbx-game-server-details')?.appendChild(btn);
    }
}



export async function enhanceServer(server, context) {
    await cacheReadyPromise;

    if (!isServerListModificationsEnabled) return;

    injectStyles();

    const { serverLocations, serverUptimes, serverPerformanceCache, uptimeBatch, serverIpMap, processUptimeBatch } = context;

    if (!server._rovalraListener) {
        server._rovalraListener = () => enhanceServer(server, context);
        server.addEventListener('rovalra-serverid-set', server._rovalraListener);
    }

    const serverId = server.getAttribute('data-rovalra-serverid');
    if (!serverId) return;

    const lastId = server._rovalraLastProcessedId;
    if (lastId && lastId !== serverId) {
        server.dataset.rovalraEnhanced = 'false';
        cleanupServerUI(server);
    } else if (server.dataset.rovalraEnhanced === 'true' && lastId === serverId) {
        enableAvatarLinks(server);
    }

    server._rovalraLastProcessedId = serverId;
    server.dataset.rovalraEnhanced = 'true';
    
    server.classList.add('rovalra-checked');

    cleanupServerUI(server);
    attachCleanupObserver(server);
    getOrCreateDetailsContainer(server);



    displayPerformance(server, serverPerformanceCache[serverId] ?? 'Unknown', serverLocations);
    
    const cachedUptime = serverUptimes[serverId];
    displayUptime(server, cachedUptime !== undefined ? cachedUptime : 'fetching', serverLocations);

    const cachedVersion = serverVersionsCache[serverId];
    displayPlaceVersion(server, cachedVersion || 'Unknown', serverLocations);

    const cachedLocation = serverLocations[serverId];
    displayRegion(server, cachedLocation || 'Unknown', serverLocations);


    const apiData = server._rovalraApiData;
    if (apiData && (apiData.server_id || apiData.id) === serverId) {
        if (apiData.place_version) {
            serverVersionsCache[serverId] = apiData.place_version;
            displayPlaceVersion(server, apiData.place_version, serverLocations);
        }
        if (apiData.first_seen) {
            const date = new Date(apiData.first_seen.endsWith('Z') ? apiData.first_seen : apiData.first_seen + 'Z');
            const uptime = isNaN(date) ? 0 : Math.max(0, (new Date() - date) / 1000);
            serverUptimes[serverId] = uptime;
            displayUptime(server, uptime, serverLocations);
        }
        const locParts = [apiData.city, apiData.region, apiData.country].filter(Boolean);
        if (locParts.length) {
            const locStr = [...new Set(locParts)].join(', ');
            serverLocations[serverId] = locStr;
            displayRegion(server, locStr, serverLocations);
        }
    }


    if (isServerUptimeEnabled || isServerRegionEnabled || isPlaceVersionEnabled) {
        if (serverUptimes[serverId] === undefined) {
            serverUptimes[serverId] = 'fetching';
            uptimeBatch.add(serverId);
            clearTimeout(server._rovalraUptimeTimeout);
            server._rovalraUptimeTimeout = setTimeout(() => processUptimeBatch(), 100);
        } else if (serverUptimes[serverId] === 'fetching') {
            displayUptime(server, 'fetching', serverLocations);
        }
    }

    fetchAndDisplayRegion(server, serverId, serverIpMap, serverLocations);

    displayIpAndDcId(server);
    addCopyJoinLinkButton(server, serverId);
    enableAvatarLinks(server);


    if (isFullServerIDEnabled) {
        let idDiv = server.querySelector('.server-id-text');
        if (!idDiv) {
            idDiv = document.createElement('div');
            idDiv.className = 'server-id-text text-info xsmall';
            
            const appendTarget = server.querySelector('.rovalra-copy-join-link') || server.querySelector('.game-server-join-btn');
            appendTarget ? appendTarget.after(idDiv) : server.querySelector('.rbx-game-server-details')?.appendChild(idDiv);
        }
        
        idDiv.style.cssText = 'font-size: 9px; margin-top: 6px; text-align: center; width: 100%; white-space: normal; word-break: break-all;';
        idDiv.innerHTML = ''; 
        
        const prefixSpan = document.createElement('span');
        prefixSpan.textContent = 'ID: ';
        prefixSpan.style.userSelect = 'none';
        
        const uuidSpan = document.createElement('span');
        uuidSpan.textContent = serverId;

        const hasFriendLink = server.querySelector('.avatar-card-link') !== null;
        if (hasFriendLink) {
            uuidSpan.classList.add('show-on-hover');
        }
        
        idDiv.appendChild(prefixSpan);
        idDiv.appendChild(uuidSpan);
    }
}