// adds information about servers

import { callRobloxApi } from '../../api.js';
import { observeElement } from '../../observer.js';
import { loadDatacenterMap, datacenterList } from '../../regions.js';
import { getPlaceIdFromUrl } from '../../idExtractor.js';
import {
    fetchServerDetails,
    fetchServerRegion,
    getServerRegion,
    getServerUptimeIsEstimate,
    getServerUptime,
    getServerVersion,
    formatUptime,
} from '../../apis/serverApi.js';
import { ts } from '../../locale/i18n.js';
import { addTooltip } from '../../ui/tooltip.js';

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
    Inactive: 'rovalra-inactive-place-info',
};

const ORDERS = {
    Performance: 1,
    Uptime: 2,
    Version: 3,
    Region: 5,
    Purchase: 6,
    Status: 7,
};

const STYLES = {
    container:
        'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 4px;',
    containerFriends:
        'display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 8px; width: 100%;',
    row: 'display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 400;',
    icon: 'display: flex; align-items: center; flex-shrink: 0; height: 20px;',
    text: 'line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; flex: 1;',
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
    inactive: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V12M12 16H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"/> stroke="currentColor" fill="currentColor" stroke-width="0.01"/></svg>`,
};

const serverNetworkInfo = new Map();

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

const cacheReadyPromise = new Promise((resolve) => {
    loadDatacenterMap()
        .then(resolve)
        .catch(() => resolve());

    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    chrome.storage.local.get(
        [
            'ServerlistmodificationsEnabled',
            'enableShareLink',
            'EnableServerUptime',
            'EnableServerRegion',
            'EnablePlaceVersion',
            'EnableFullServerID',
            'EnableFullServerIndicators',
            'EnableServerPerformance',
            'EnableMiscIndicators',
            'EnableDatacenterandId',
        ],
        (res) => {
            if (res?.ServerlistmodificationsEnabled !== undefined)
                isServerListModificationsEnabled =
                    res.ServerlistmodificationsEnabled;
            if (res?.enableShareLink !== undefined)
                isShareLinkEnabled = res.enableShareLink;
            if (res?.EnableServerUptime !== undefined)
                isServerUptimeEnabled = res.EnableServerUptime;
            if (res?.EnableServerRegion !== undefined)
                isServerRegionEnabled = res.EnableServerRegion;
            if (res?.EnablePlaceVersion !== undefined)
                isPlaceVersionEnabled = res.EnablePlaceVersion;
            if (res?.EnableFullServerID !== undefined)
                isFullServerIDEnabled = res.EnableFullServerID;
            if (res?.EnableFullServerIndicators !== undefined)
                isFullServerIndicatorsEnabled = res.EnableFullServerIndicators;
            if (res?.EnableServerPerformance !== undefined)
                isServerPerformanceEnabled = res.EnableServerPerformance;
            if (res?.EnableMiscIndicators !== undefined)
                isMiscIndicatorsEnabled = res.EnableMiscIndicators;
            if (res?.EnableDatacenterandId !== undefined)
                isDatacenterAndIdEnabled = res.EnableDatacenterandId;

            resolve();
        },
    );

    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.ServerlistmodificationsEnabled) {
                isServerListModificationsEnabled =
                    changes.ServerlistmodificationsEnabled.newValue;
                if (!isServerListModificationsEnabled) {
                    document
                        .querySelectorAll(
                            '.rovalra-details-container, .rovalra-server-extra-details, .rovalra-copy-join-link, .rovalra-meta-pill',
                        )
                        .forEach((el) => el.remove());
                } else {
                }
            }
            if (changes.enableShareLink)
                isShareLinkEnabled = changes.enableShareLink.newValue;
            if (changes.EnableServerUptime)
                isServerUptimeEnabled = changes.EnableServerUptime.newValue;
            if (changes.EnableServerRegion)
                isServerRegionEnabled = changes.EnableServerRegion.newValue;
            if (changes.EnablePlaceVersion)
                isPlaceVersionEnabled = changes.EnablePlaceVersion.newValue;
            if (changes.EnableServerUptime || changes.EnablePlaceVersion)
                refreshContainerMinHeights();
            if (changes.EnableFullServerID)
                isFullServerIDEnabled = changes.EnableFullServerID.newValue;
            if (changes.EnableFullServerIndicators)
                isFullServerIndicatorsEnabled =
                    changes.EnableFullServerIndicators.newValue;
            if (changes.EnableServerPerformance)
                isServerPerformanceEnabled =
                    changes.EnableServerPerformance.newValue;
            if (changes.EnableMiscIndicators)
                isMiscIndicatorsEnabled = changes.EnableMiscIndicators.newValue;
            if (changes.EnableDatacenterandId) {
                isDatacenterAndIdEnabled =
                    changes.EnableDatacenterandId.newValue;
                document
                    .querySelectorAll('[data-rovalra-serverid]')
                    .forEach((server) => {
                        displayIpAndDcId(server);
                    });
            }
        }
    });
});

export function getRowServerId(server) {
    if (!server) return null;
    const serverId = server.getAttribute('data-rovalra-serverid');
    if (serverId) return serverId;
    if (server.classList.contains('rbx-private-game-server-item')) {
        return server.dataset.accessCode || null;
    }
    return null;
}

function getServerRows(serverId) {
    if (!serverId) return [];
    const id = CSS.escape(String(serverId));
    return Array.from(
        document.querySelectorAll(
            `[data-rovalra-serverid="${id}"], .rbx-private-game-server-item[data-access-code="${id}"]`,
        ),
    ).filter((server) => getRowServerId(server) === String(serverId));
}

function setServerNetworkInfo(serverId, ip, dcId) {
    if (!serverId) return;
    const existing = serverNetworkInfo.get(serverId) || {};
    serverNetworkInfo.set(serverId, {
        ip: ip ?? existing.ip ?? null,
        dcId: dcId ?? existing.dcId ?? null,
    });
}

function restoreJoinButton(server) {
    const joinBtn = server.querySelector(
        '.game-server-join-btn, .rovalra-join-btn',
    );
    if (!joinBtn || joinBtn.dataset.rovalraOriginalLabel === undefined) return;

    const joinLabel = joinBtn.querySelector('.text-no-wrap') || joinBtn;
    joinLabel.textContent = joinBtn.dataset.rovalraOriginalLabel;
    joinBtn.classList.replace('btn-secondary-md', 'btn-primary-md');
    delete joinBtn.dataset.rovalraOriginalLabel;
}

function markJoinButtonFull(server) {
    const joinBtn = server.querySelector(
        '.game-server-join-btn, .rovalra-join-btn',
    );
    if (!joinBtn) return;

    const joinLabel = joinBtn.querySelector('.text-no-wrap') || joinBtn;
    if (joinBtn.dataset.rovalraOriginalLabel === undefined) {
        joinBtn.dataset.rovalraOriginalLabel = joinLabel.textContent;
    }
    joinLabel.textContent = ts('common.joinServerFull');
    joinBtn.classList.replace('btn-primary-md', 'btn-secondary-md');
}

function resetServerRow(server) {
    server
        .querySelectorAll(
            `.${CLASSES.CONTAINER}, .rovalra-meta-pill, .rovalra-meta-icons, .rovalra-server-extra-details`,
        )
        .forEach((el) => el.remove());
    restoreJoinButton(server);
    server._rovalraApiData = null;
    server.removeAttribute('data-rovalra-api');
}

function displayServerStatus(server, status) {
    if (status === 'full') {
        if (!isFullServerIndicatorsEnabled) return;
        markJoinButtonFull(server);
        displayServerFullStatus(server);
    } else if (status === 'purchase') {
        displayPurchaseGameStatus(server);
    } else if (status === 'inactive') {
        displayInactivePlaceStatus(server);
    }
}

export function createUUID() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
}
function getLocationFromDataCenterId(id) {
    if (!datacenterList || !id) return null;
    const numId = Number(id);
    if (isNaN(numId)) return null;

    return (
        datacenterList.find(
            (entry) =>
                (Array.isArray(entry.dataCenterIds) &&
                    entry.dataCenterIds.includes(numId)) ||
                entry.dataCenterId === numId,
        ) || null
    );
}

export function getFullLocationName(data) {
    if (!data || typeof data !== 'object') return 'Unknown Region';
    const loc = data.location || data;
    const { city, region } = loc;

    const parts = [city, region && region !== city ? region : null];

    return [...new Set(parts.filter(Boolean))].join(', ') || 'Unknown Region';
}

function normalizeText(s) {
    return s
        ? s
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .trim()
        : '';
}

function extractCountryCode(regionName) {
    if (!regionName || !datacenterList?.length) return null;

    const parts = regionName.split(',').map((p) => p.trim());
    for (const part of parts) {
        const id = Number(part);
        if (!isNaN(id)) {
            const loc = getLocationFromDataCenterId(id);
            if (loc?.location?.country)
                return loc.location.country.toLowerCase();
        }
    }

    const targetParts = parts.map(normalizeText);
    for (const entry of datacenterList) {
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

let regionDisplayNames = null;

function getCountryName(countryCode) {
    try {
        regionDisplayNames ??= new Intl.DisplayNames(
            [document.documentElement.lang || navigator.language, 'en'],
            { type: 'region' },
        );
        const name = regionDisplayNames.of(countryCode.toUpperCase());
        if (name && name.toUpperCase() !== countryCode.toUpperCase())
            return name;
    } catch {}

    const entry = datacenterList?.find(
        (e) => (e.location || e).country?.toLowerCase() === countryCode,
    );
    return (entry?.location || entry)?.country_name || null;
}

function removeCountryFromRegion(regionName) {
    if (!regionName || !datacenterList) return regionName;

    const parts = regionName.split(',').map((p) => p.trim());
    if (parts.length <= 1) return regionName;

    const countrySet = new Set(
        datacenterList.flatMap((entry) => {
            const loc = entry.location || entry;
            return [loc.country, loc.country_name]
                .filter(Boolean)
                .map(normalizeText);
        }),
    );

    const filtered = parts.filter((part) => {
        const norm = normalizeText(part);
        return !countrySet.has(norm) && !/^[A-Za-z]{2}$/.test(part);
    });

    return filtered.join(', ') || regionName;
}

function normalizeRegionName(...values) {
    const parts = values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value && !/^unknown$/i.test(value));
    return [...new Set(parts)].join(', ') || null;
}

function applyContainerMinHeight(container, isFriends) {
    const rows =
        (isServerUptimeEnabled ? 1 : 0) + (isPlaceVersionEnabled ? 1 : 0);
    if (rows === 2) container.style.minHeight = isFriends ? '48px' : '44px';
    else if (rows === 1) container.style.minHeight = '20px';
    else container.style.minHeight = '';
}

function refreshContainerMinHeights() {
    document.querySelectorAll(`.${CLASSES.CONTAINER}`).forEach((container) => {
        if (container.closest('.rbx-private-game-server-item')) return;
        applyContainerMinHeight(
            container,
            !!container.closest('.rbx-friends-game-server-item'),
        );
    });
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
    const isPrivate = server.classList.contains('rbx-private-game-server-item');
    if (isPrivate) {
        container.style.cssText =
            'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 4px; width: 100%;';
    } else {
        container.style.cssText = isFriends
            ? STYLES.containerFriends
            : STYLES.container;
        applyContainerMinHeight(container, isFriends);
    }

    const statusNode = server.querySelector('.text-info.rbx-game-status');

    if (statusNode && statusNode.parentNode) {
        statusNode.parentNode.insertBefore(container, statusNode.nextSibling);
    } else {
        const modernLeftWrapper = server.querySelector(
            '.flex.items-center.gap-medium.min-width-0',
        );
        const detailsParent =
            modernLeftWrapper ||
            server.querySelector(
                '.rbx-game-server-details, .rbx-friends-game-server-details',
            );

        if (detailsParent) {
            if (modernLeftWrapper) {
                const column = detailsParent.querySelector(
                    '.flex.flex-col.min-width-0',
                );
                if (column) {
                    column.appendChild(container);
                } else {
                    detailsParent.appendChild(container);
                }
            } else {
                detailsParent.prepend(container);
            }
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

    if (!element) {
        element = createInfoElement(className, iconHTML, text);
        const orderIndex = ORDERS[type] || ORDERS.Status;
        element.style.order = orderIndex;
        container.appendChild(element);
    }

    const iconWrapper = element.querySelector('.rovalra-icon-wrapper');
    const textWrapper = element.querySelector(
        'span:not(.rovalra-icon-wrapper)',
    );

    if (iconWrapper) iconWrapper.innerHTML = iconHTML;
    if (textWrapper) textWrapper.textContent = text;

    if (!isVisible) {
        element.style.display = 'none';
        element.style.visibility = 'visible';
    } else {
        element.style.display = 'flex';
        element.style.visibility = 'visible';
    }

    return element;
}

function getOrCreateMetaIcons(server) {
    let meta = server.querySelector('.server-meta-icons');
    if (meta) return meta;

    const gauge = server.querySelector('.server-player-count-gauge');
    if (!gauge) return null;

    meta = document.createElement('div');
    meta.className = 'server-meta-icons rovalra-meta-icons';
    gauge.after(meta);
    return meta;
}

function updateMetaPill(server, type, iconHTML, text, isVisible, tooltip = '') {
    const className = CLASSES[type];
    const meta = isVisible ? getOrCreateMetaIcons(server) : null;
    let pill = server.querySelector(`.rovalra-meta-pill.${className}`);

    if (!meta && !pill) {
        const container = getOrCreateDetailsContainer(server);
        return updateInfoElement(container, type, iconHTML, text, isVisible);
    }

    if (!pill) {
        pill = document.createElement('span');
        pill.className = `server-meta-badge-tip rovalra-meta-pill ${className}`;
        pill.style.order = ORDERS[type] || ORDERS.Status;
        pill.innerHTML = `<div class="foundation-web-badge flex items-center select-none gap-[var(--size-150)] radius-circle height-600 width-[fit-content] padding-x-small bg-shift-200 content-emphasis stroke-none"><span class="rovalra-icon-wrapper"></span><span class="rovalra-pill-text text-no-wrap text-truncate-split text-label-small padding-y-xsmall padding-right-xxsmall content-emphasis"></span></div>`;
        addTooltip(pill, () => pill.dataset.rovalraTooltip || '', {
            position: 'top',
            shouldShow: () => !!pill.dataset.rovalraTooltip,
        });
        meta.appendChild(pill);
    }

    pill.dataset.rovalraTooltip = tooltip;
    pill.querySelector('.rovalra-icon-wrapper').innerHTML = iconHTML;
    pill.querySelector('.rovalra-pill-text').textContent = text;
    pill.style.display = isVisible ? '' : 'none';

    server.querySelector(`.${CLASSES.CONTAINER} > .${className}`)?.remove();

    return pill;
}

function clearExclusiveStatuses(server, container) {
    [
        CLASSES.Uptime,
        CLASSES.Version,
        CLASSES.Region,
        CLASSES.Full,
        CLASSES.Private,
        CLASSES.Purchase,
        CLASSES.Inactive,
    ].forEach((cls) => container.querySelector(`.${cls}`)?.remove());
    server.querySelector(`.rovalra-meta-pill.${CLASSES.Region}`)?.remove();
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
        .${CLASSES.CONTAINER}:not(:has(> :not([style*="display: none"]))) {
            margin: 0 !important;
        }
        .rovalra-meta-icons {
            display: flex;
            gap: 4px;
            margin-top: 6px;
        }
        .server-meta-icons:has(.rovalra-meta-pill) {
            flex-wrap: wrap;
            row-gap: 4px;
        }
        .rovalra-meta-pill {
            display: inline-flex;
            min-width: 0;
            max-width: 100%;
            cursor: default;
        }
        .rovalra-meta-pill .foundation-web-badge {
            max-width: 100%;
        }
        .rovalra-meta-pill .rovalra-icon-wrapper {
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
        .rovalra-meta-pill .rovalra-icon-wrapper svg {
            width: 14px;
            height: 14px;
        }
        .rovalra-meta-pill .rovalra-pill-text {
            overflow: hidden;
            text-overflow: ellipsis;
        }
    `;
    document.head.appendChild(style);
}

function shouldSpoilerServerId(server) {
    return (
        server.dataset.rovalraIsFriendServer === 'true' ||
        server.dataset.rovalraIsRecentServer === 'true' ||
        server.classList.contains('rbx-friends-game-server-item') ||
        !!server.querySelector(
            '.player-thumbnails-container .avatar-card-link[href*="/users/"]',
        )
    );
}

function enableAvatarLinks(server) {
    const avatarLinks = server.querySelectorAll('.avatar-card-link');
    avatarLinks.forEach((link) => {
        if (link.dataset.rovalraHooked) return;
        link.addEventListener('click', (e) => e.stopPropagation());
        link.dataset.rovalraHooked = 'true';
    });
}

export function displayPerformance(server, fps, serverLocations = {}) {
    if (!isServerPerformanceEnabled || !isServerListModificationsEnabled) {
        updateMetaPill(server, 'Performance', '', '', false);
        return;
    }

    let text = 'Unknown';
    let icon = ICONS.performanceHigh;
    let visible = false;

    if (fps === 'fetching') {
        text = ts('serverInfo.loading');
        visible = true;
    } else if (typeof fps === 'number') {
        const percent = Math.min(100, Math.round((fps / 60) * 100));
        text = `${percent}%`;
        icon = percent < 50 ? ICONS.performanceLow : ICONS.performanceHigh;
        visible = true;
    }

    updateMetaPill(
        server,
        'Performance',
        icon,
        text,
        visible,
        ts('serverInfo.performanceTooltip'),
    );
}

export function displayUptime(
    server,
    uptime,
    isEstimate,
    serverLocations = {},
) {
    if (!isServerUptimeEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Uptime', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    let text = '1m~';
    let visible = true;

    if (uptime === 'fetching') {
        text = ts('serverInfo.loading');
    } else if (typeof uptime === 'number') {
        text = formatUptime(uptime, isEstimate);
    } else if (uptime === 'N/A') {
        text = '1m~';
    } else {
        visible = false;
    }

    updateInfoElement(container, 'Uptime', ICONS.uptime, text, visible);
}

export function displayPlaceVersion(server, version, serverLocations = {}) {
    if (!isPlaceVersionEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Version', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    let text = ts('serverInfo.versionUnknown');
    let visible = false;

    const existingVersion = container.querySelector(`.${CLASSES.Version}`);
    if (
        (!version || version === 'Unknown') &&
        existingVersion?.dataset.rovalraVersion
    ) {
        return existingVersion;
    }

    if (version && version !== 'Unknown') {
        text = ts('serverInfo.version', { version });
        const containerList = document.getElementById(
            'rbx-public-game-server-item-container',
        );
        if (containerList) {
            if (String(version) === containerList.dataset.newestVersion)
                text += ts('serverInfo.latest');
            else if (String(version) === containerList.dataset.oldestVersion)
                text += ts('serverInfo.oldest');
        }
        visible = true;
    }

    const element = updateInfoElement(
        container,
        'Version',
        ICONS.version,
        text,
        visible,
    );
    if (element) {
        if (visible) element.dataset.rovalraVersion = String(version);
        else delete element.dataset.rovalraVersion;
    }
}

export function displayRegion(server, regionName, serverLocations = {}) {
    if (!isServerRegionEnabled || !isServerListModificationsEnabled) {
        updateMetaPill(server, 'Region', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);

    if (regionName && regionName !== 'Unknown Region') {
        container.querySelector(`.${CLASSES.Full}`)?.remove();
        container.querySelector(`.${CLASSES.Private}`)?.remove();
    }

    let text = 'Unknown';
    let countryName = null;
    let icon = ICONS.regionDefault;
    let visible = false;

    if (
        regionName &&
        regionName !== 'Unknown Region' &&
        regionName !== 'N/A' &&
        regionName !== 'Unknown'
    ) {
        const countryCode = extractCountryCode(regionName);
        text = removeCountryFromRegion(regionName);

        if (text === 'Unknown' || text === 'N/A' || !text) {
            visible = false;
        } else {
            if (countryCode) {
                countryName =
                    countryCode === 'us'
                        ? text.split(',').pop().trim()
                        : getCountryName(countryCode);
                icon = `<img src="https://flagcdn.com/w40/${countryCode}.png" srcset="https://flagcdn.com/w80/${countryCode}.png 2x" width="16" height="12" alt="${countryCode}" style="display: block; border-radius: 2px;">`;
            }
            visible = true;
        }
    }

    updateMetaPill(
        server,
        'Region',
        icon,
        countryName || text,
        visible,
        ts('serverInfo.regionTooltip', { region: text }),
    );
}

function displayRegionForServerId(serverId, regionName, serverLocations) {
    getServerRows(serverId).forEach((server) =>
        displayRegion(server, regionName, serverLocations),
    );
}

export function displayIpAndDcId(server) {
    let extraDiv = server.querySelector('.rovalra-server-extra-details');

    if (
        !isFullServerIDEnabled ||
        !isDatacenterAndIdEnabled ||
        !isServerListModificationsEnabled
    ) {
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

    const { ip, dcId } = serverNetworkInfo.get(getRowServerId(server)) || {};

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
    const regionElement = server.querySelector(`.${CLASSES.Region}`);
    const hasRegion =
        regionElement &&
        regionElement.style.display !== 'none' &&
        !['Unknown', 'N/A', 'Unknown Region'].includes(
            regionElement.textContent.trim(),
        );

    if (hasRegion) {
        container.querySelector(`.${CLASSES.Full}`)?.remove();
        return;
    }

    updateInfoElement(
        container,
        'Full',
        ICONS.full,
        ts('serverInfo.serverFull'),
        true,
    );
}

export function displayPrivateServerStatus(server) {
    if (!isMiscIndicatorsEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Private', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    clearExclusiveStatuses(server, container);
    updateInfoElement(
        container,
        'Private',
        ICONS.private,
        ts('serverInfo.privateServer'),
        true,
    );
}

export function displayPurchaseGameStatus(server) {
    if (!isMiscIndicatorsEnabled || !isServerListModificationsEnabled) {
        const container = getOrCreateDetailsContainer(server);
        updateInfoElement(container, 'Purchase', '', '', false);
        return;
    }

    const container = getOrCreateDetailsContainer(server);
    clearExclusiveStatuses(server, container);
    updateInfoElement(
        container,
        'Purchase',
        ICONS.purchase,
        ts('serverInfo.purchaseGame'),
        true,
    );
}

export function displayInactivePlaceStatus(server) {
    if (server?.dataset.rovalraAddedByFilter === 'true') {
        server.remove();
    }
}

export async function fetchServerUptime(
    placeId,
    serverIds,
    serverLocations,
    serverUptimes,
    serverStatuses = {},
) {
    const validIds = serverIds.filter((id) => id && id !== 'null');
    if (!validIds.length) return;

    try {
        const response = await fetchServerDetails(placeId, validIds);

        if (!response.servers || response.servers.length === 0) {
            throw new Error('Invalid API Data');
        }

        const now = new Date();
        const foundIds = new Set();

        response.servers.forEach((info) => {
            const {
                serverId,
                placeVersion,
                isEstimate,
                uptime,
                region,
                ipAddress,
                datacenterId,
                city,
                regionName,
                country,
            } = info;
            if (!serverId) return;

            foundIds.add(serverId);

            const versionToDisplay = getServerVersion(serverId) || placeVersion;

            const normalizedRegion = normalizeRegionName(region);
            if (normalizedRegion) {
                serverLocations[serverId] = normalizedRegion;
            }

            setServerNetworkInfo(serverId, ipAddress, datacenterId);

            getServerRows(serverId).forEach((serverEl) => {
                displayPlaceVersion(
                    serverEl,
                    versionToDisplay,
                    serverLocations,
                );
                displayUptime(serverEl, uptime, isEstimate, serverLocations);
                if (normalizedRegion) {
                    displayRegion(serverEl, normalizedRegion, serverLocations);
                }
                displayIpAndDcId(serverEl);
            });
        });

        validIds
            .filter((id) => !foundIds.has(id))
            .forEach((id) => {
                getServerRows(id).forEach((el) => {
                    displayUptime(
                        el,
                        getServerUptime(id),
                        getServerUptimeIsEstimate(id),
                        serverLocations,
                    );
                    if (!getServerRegion(id) && !serverStatuses[id])
                        displayServerFullStatus(el);
                });
            });
    } catch (e) {
        console.error('Failed to fetch server details:', e);
        validIds.forEach((id) => {
            getServerRows(id).forEach((el) => {
                displayUptime(
                    el,
                    getServerUptime(id),
                    getServerUptimeIsEstimate(id),
                    serverLocations,
                );
            });
        });
    }
}
export async function fetchAndDisplayRegion(
    server,
    serverId,
    serverIpMap,
    serverLocations,
    options = {},
) {
    const serverStatuses = options.serverStatuses || {};
    const showFullIfUnknown = () => {
        if (serverLocations[serverId] || serverStatuses[serverId]) return;
        getServerRows(serverId).forEach((row) => displayServerFullStatus(row));
    };

    let placeId = server.dataset.placeid || getPlaceIdFromUrl();
    if (!placeId) {
        showFullIfUnknown();
        return;
    }

    try {
        const info = await fetchServerRegion(placeId, serverId, options);
        const status = Number(info.status);
        const joinScript = info.joinScript;

        if (
            joinScript?.GameId &&
            !options.isPrivate &&
            String(joinScript.GameId).toLowerCase() !==
                String(serverId).toLowerCase()
        ) {
            return;
        }

        if (joinScript) {
            const ip =
                joinScript.UdmuxEndpoints?.[0]?.Address ||
                joinScript.MachineAddress ||
                null;
            setServerNetworkInfo(serverId, ip, joinScript.DataCenterId);
            getServerRows(serverId).forEach((row) => displayIpAndDcId(row));
        }

        if (status === 12) {
            if (info.message?.includes('private instance')) {
            } else if (
                info.message?.toLowerCase().includes('purchase access')
            ) {
                if (!serverStatuses[serverId]) {
                    serverStatuses[serverId] = 'purchase';
                    getServerRows(serverId).forEach((row) =>
                        displayServerStatus(row, 'purchase'),
                    );
                }
                return;
            }
        }

        if (status === 5) {
            if (!serverStatuses[serverId]) {
                serverStatuses[serverId] = 'inactive';
                getServerRows(serverId).forEach((row) =>
                    displayServerStatus(row, 'inactive'),
                );
            }
            return;
        }

        if (status === 22) {
            serverStatuses[serverId] = 'full';
            getServerRows(serverId).forEach((row) =>
                displayServerStatus(row, 'full'),
            );
            return;
        }

        if (joinScript?.PlaceVersion && !getServerVersion(serverId)) {
            getServerRows(serverId).forEach((row) =>
                displayPlaceVersion(
                    row,
                    joinScript.PlaceVersion,
                    serverLocations,
                ),
            );
        }

        if (!serverLocations[serverId]) {
            const dcId = joinScript?.DataCenterId;
            let locInfo =
                dcId && serverIpMap?.[dcId] ? serverIpMap[dcId] : null;

            if (!locInfo && dcId) {
                await cacheReadyPromise;
                locInfo = getLocationFromDataCenterId(dcId);
            }

            if (locInfo) {
                const fullName = normalizeRegionName(
                    getFullLocationName(locInfo),
                );
                if (fullName && !serverLocations[serverId]) {
                    serverLocations[serverId] = fullName;

                    displayRegionForServerId(
                        serverId,
                        fullName,
                        serverLocations,
                    );
                }
            }
        }
    } catch (err) {
        showFullIfUnknown();
    }
}

export function isExcludedButton(node) {
    if (!node || !node.classList) return false;
    return (
        node.classList.contains('rovalra-copy-join-link') ||
        node.classList.contains('rovalra-vip-invite-link') ||
        node.getAttribute('data-bind') === 'game-context-menu'
    );
}

export function cleanupServerUI(server) {
    const toRemove = ['.server-performance'];
    server.querySelectorAll(toRemove.join(',')).forEach((el) => {
        if (!isExcludedButton(el)) el.remove();
    });

    server.querySelectorAll('.text-info.rbx-game-status').forEach((el) => {
        el.textContent = el.textContent
            .replace(/^\s*(Region:|Ping:|Server is full).*$/gim, '')
            .trim();
    });
}

let cleanupObserverInitialized = false;

export function attachCleanupObserver(server) {
    if (cleanupObserverInitialized) return;
    cleanupObserverInitialized = true;

    observeElement(
        '.share-button, .server-performance',
        (node) => {
            if (
                !isExcludedButton(node) &&
                node.closest('[data-rovalra-serverid]')
            ) {
                node.remove();
            }
        },
        { multiple: true },
    );
}

export async function addCopyJoinLinkButton(server, serverId) {
    await cacheReadyPromise;
    if (isShareLinkEnabled === false || !isServerListModificationsEnabled)
        return;

    if (server.querySelector('.rovalra-copy-join-link')) return;

    const placeId = server.dataset.placeid || getPlaceIdFromUrl();
    if (!placeId) return;

    const btn = document.createElement('button');
    btn.className =
        'btn-full-width btn-control-xs btn-primary-md btn-min-width rovalra-copy-join-link';
    btn.textContent = ts('common.share');
    btn.style.cssText = 'margin-top: 5px; width: 100%;';

    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentServerId = getRowServerId(server) || serverId;
        const link = `https://www.fishstrap.app/v1/joingame?placeId=${placeId}&gameInstanceId=${currentServerId}`;
        navigator.clipboard.writeText(link).then(() => {
            btn.textContent = ts('common.copied');
            setTimeout(() => (btn.textContent = ts('common.share')), 2000);
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

    const {
        serverLocations,
        serverStatuses = {},
        serverUptimes,
        serverPerformanceCache,
        uptimeBatch,
        serverIpMap,
        processUptimeBatch,
    } = context;

    if (!server._rovalraListener) {
        server._rovalraListener = () => enhanceServer(server, context);
        server.addEventListener(
            'rovalra-serverid-set',
            server._rovalraListener,
        );
    }

    const serverId = getRowServerId(server);
    const isPrivate = server.classList.contains('rbx-private-game-server-item');

    if (!serverId) return;

    const lastId = server._rovalraLastProcessedId;
    if (lastId && lastId !== serverId) {
        server.dataset.rovalraEnhanced = 'false';
        resetServerRow(server);
        cleanupServerUI(server);
    } else if (
        server.dataset.rovalraEnhanced === 'true' &&
        lastId === serverId
    ) {
        enableAvatarLinks(server);
    }

    server._rovalraLastProcessedId = serverId;
    server.dataset.rovalraEnhanced = 'true';

    server.classList.add('rovalra-checked');

    if (!server._rovalraUptimeListener) {
        server._rovalraUptimeListener = (e) => {
            const currentServerId = getRowServerId(server);
            if (
                currentServerId &&
                String(e.detail.serverId) === String(currentServerId)
            ) {
                displayUptime(
                    server,
                    e.detail.uptime,
                    e.detail.isEstimate,
                    serverLocations,
                );
            }
        };
        server.addEventListener(
            'rovalra-uptime-update',
            server._rovalraUptimeListener,
        );
    }

    cleanupServerUI(server);
    attachCleanupObserver(server);
    getOrCreateDetailsContainer(server);

    displayPerformance(
        server,
        serverPerformanceCache[serverId] ?? 'Unknown',
        serverLocations,
    );

    if (!isPrivate) {
        const cachedUptime = getServerUptime(serverId);
        const cachedIsEstimate = getServerUptimeIsEstimate(serverId);
        displayUptime(
            server,
            cachedUptime !== null ? cachedUptime : 'fetching',
            cachedIsEstimate,
        );
    }

    displayPlaceVersion(
        server,
        getServerVersion(serverId) || 'Unknown',
        serverLocations,
    );

    const cachedLocation = serverLocations[serverId];
    displayRegion(server, cachedLocation || 'Unknown', serverLocations);
    if (serverStatuses[serverId]) {
        displayServerStatus(server, serverStatuses[serverId]);
    }

    const cachedApiData = context.serverDataCache?.get(String(serverId));
    const attachedApiData = server._rovalraApiData;
    const attachedApiDataId = attachedApiData?.server_id || attachedApiData?.id;
    const apiData =
        cachedApiData &&
        String(cachedApiData.server_id || cachedApiData.id) === String(serverId)
            ? cachedApiData
            : attachedApiData && String(attachedApiDataId) === String(serverId)
              ? attachedApiData
              : null;
    if (apiData) server._rovalraApiData = apiData;
    if (apiData) {
        if (apiData.place_version && !getServerVersion(serverId)) {
            displayPlaceVersion(server, apiData.place_version, serverLocations);
        }
        if (apiData.first_seen && !isPrivate && !getServerUptime(serverId)) {
            const date = new Date(
                apiData.first_seen.endsWith('Z')
                    ? apiData.first_seen
                    : apiData.first_seen + 'Z',
            );
            const uptime = isNaN(date)
                ? 0
                : Math.max(0, (new Date() - date) / 1000);
            displayUptime(server, uptime, true, serverLocations);
        }
        const locStr = normalizeRegionName(
            apiData.city,
            apiData.region,
            apiData.country,
        );
        if (locStr) {
            serverLocations[serverId] = locStr;
            displayRegion(server, locStr, serverLocations);
        }
    }

    if (
        isServerUptimeEnabled ||
        isServerRegionEnabled ||
        isPlaceVersionEnabled
    ) {
        if (getServerUptime(serverId) === null && !isPrivate) {
            uptimeBatch.add(serverId);
            clearTimeout(server._rovalraUptimeTimeout);
            server._rovalraUptimeTimeout = setTimeout(
                () => processUptimeBatch(),
                100,
            );
            displayUptime(server, 'fetching', true, serverLocations);
        }
    }

    fetchAndDisplayRegion(server, serverId, serverIpMap, serverLocations, {
        isPrivate,
        accessCode: server.dataset.accessCode,
        serverStatuses,
    });

    displayIpAndDcId(server);
    if (!isPrivate) {
        addCopyJoinLinkButton(server, serverId);
    }
    enableAvatarLinks(server);

    if (isFullServerIDEnabled && !isPrivate) {
        let idDiv = server.querySelector('.server-id-text');
        if (!idDiv) {
            idDiv = document.createElement('div');
            idDiv.className = 'server-id-text text-info xsmall';

            const appendTarget =
                server.querySelector('.rovalra-share-btn-container') ||
                server.querySelector('.rovalra-copy-join-link') ||
                server.querySelector('.game-server-join-btn');
            appendTarget
                ? appendTarget.after(idDiv)
                : server
                      .querySelector('.rbx-game-server-details')
                      ?.appendChild(idDiv);
        }

        idDiv.style.cssText =
            'font-size: 9px; margin-top: 6px; text-align: center; width: 100%; white-space: normal; word-break: break-all;';
        idDiv.innerHTML = '';

        const prefixSpan = document.createElement('span');
        prefixSpan.textContent = ts('common.id');
        prefixSpan.style.userSelect = 'none';

        const uuidSpan = document.createElement('span');
        uuidSpan.textContent = serverId;

        if (shouldSpoilerServerId(server)) {
            uuidSpan.classList.add('show-on-hover');
        }

        idDiv.appendChild(prefixSpan);
        idDiv.appendChild(uuidSpan);
    }
}
