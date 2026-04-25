import { callRobloxApi } from '../../../core/api.js';
import { fetchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { launchGame } from '../../../core/utils/launcher.js';
import { initServerIdExtraction } from '../../../core/games/servers/serverids.js';
import { loadDatacenterMap, serverIpMap } from '../../../core/regions.js';
import { initGlobalStatsBar } from '../../../core/games/servers/serverstats.js';
import { observeElement, startObserving } from '../../../core/observer.js';
import { initRegionFilters } from '../../../core/games/servers/filters/regionfilters.js';
import { initUptimeFilters } from '../../../core/games/servers/filters/uptimefilters.js';
import { initVersionFilters } from '../../../core/games/servers/filters/versionfilters.js';
import { createButton } from '../../../core/ui/buttons.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import DOMPurify from 'dompurify';
import { t, ts } from '../../../core/locale/i18n.js';
import {
    enhanceServer,
    displayPerformance,
    fetchServerUptime,
    displayUptime,
    displayPlaceVersion,
    displayRegion,
    displayServerFullStatus,
    displayPrivateServerStatus,
    displayInactivePlaceStatus,
    isExcludedButton,
    createUUID,
    getFullLocationName,
    fetchAndDisplayRegion,
    addCopyJoinLinkButton,
    attachCleanupObserver,
    cleanupServerUI,
    getOrCreateDetailsContainer,
    createInfoElement,
} from '../../../core/games/servers/serverdetails.js';

const SHARED_STYLES = `
    #rovalra-main-controls {
        display: flex;
        align-items: center;
        flex: 1; 
        margin-left: 5px; 
        gap: 10px; 
        flex-wrap: nowrap;
    }

    #rovalra-main-controls .rovalra-dropdown-container {
        margin: 0 !important; 
    }

    .filter-button-alignment {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 8px;
        min-height: 38px; 
        box-sizing: border-box;
    }
    
    .filter-button-alignment svg { width: 20px; height: 20px; }

    body.rovalra-filter-active .rbx-public-running-games-footer { display: none !important; }
`;

export const _state = {
    serverIpMap: null,
    serverLocations: {},
    serverUptimes: {},
    serverPerformanceCache: {},
    vipStatusCache: {},
    uptimeBatch: new Set(),
    collectedPlayerTokens: [],
    recentlyUsedTokens: [],
    serverDataCache: new Map(),

    originalServerElements: [],
    isFilterActive: false,
    targetActiveCount: 0,
    elements: {
        container: null,
        clearButton: null,
    },
    filterSettings: {
        serverFilter: true,
        region: true,
        uptime: true,
        version: true,
    },
};

async function isServerActive(placeId, gameId) {
    if (!gameId) return false;
    try {
        const response = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: {
                placeId: parseInt(placeId, 10),
                gameId: gameId,
                isTeleport: false,
            },
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 2 || data.status === 22;
    } catch (e) {
        return false;
    }
}

export function init() {
    if (
        typeof chrome === 'undefined' ||
        !chrome.storage ||
        !chrome.storage.local
    ) {
        safeInitAll();
        return;
    }
    chrome.storage.local.get(
        [
            'ServerlistmodificationsEnabled',
            'ServerFilterEnabled',
            'RegionFiltersEnabled',
            'UptimeFiltersEnabled',
            'VersionFiltersEnabled',
        ],
        (settings) => {
            if (
                settings &&
                settings.ServerlistmodificationsEnabled === false &&
                settings.ServerFilterEnabled === false
            )
                return;

            if (settings) {
                _state.filterSettings = {
                    serverFilter: settings.ServerFilterEnabled !== false,
                    region: settings.RegionFiltersEnabled !== false,
                    uptime: settings.UptimeFiltersEnabled !== false,
                    version: settings.VersionFiltersEnabled !== false,
                };
            }
            safeInitAll();
        },
    );
}

export function forceInit() {
    safeInitAll();
}

function safeInitAll() {
    if (!document.getElementById('rovalra-filter-shared-styles')) {
        const s = document.createElement('style');
        s.id = 'rovalra-filter-shared-styles';
        s.textContent = SHARED_STYLES;
        document.head.appendChild(s);
    }

    try {
        if (typeof loadDatacenterMap === 'function')
            loadDatacenterMap().catch(() => {});
    } catch (e) {}
    try {
        if (typeof initServerIdExtraction === 'function')
            initServerIdExtraction();
    } catch (e) {}
    try {
        if (typeof initGlobalStatsBar === 'function') initGlobalStatsBar();
    } catch (e) {}

    startController();
}

function createFilterUI(parentContainer) {
    if (
        _state.elements.container &&
        document.body.contains(_state.elements.container)
    )
        return;

    const container = document.createElement('div');
    container.id = 'rovalra-main-controls';
    if (parentContainer.closest('#roseal-running-game-instances-container')) {
        parentContainer.insertAdjacentElement('afterend', container);
        container.style.marginTop = '5px';
        container.style.marginBottom = '5px';
    } else {
        parentContainer.appendChild(container);
    }
    _state.elements.container = container;

    const filters = _state.filterSettings;

    if (filters.serverFilter) {
        if (filters.version)
            try {
                if (typeof initVersionFilters === 'function')
                    initVersionFilters();
            } catch (e) {}
        if (filters.uptime)
            try {
                if (typeof initUptimeFilters === 'function')
                    initUptimeFilters();
            } catch (e) {}
        if (filters.region)
            try {
                if (typeof initRegionFilters === 'function')
                    initRegionFilters();
            } catch (e) {}
    }

    createClearButton(container);
}

function createClearButton(container) {
    const wrapper = document.createElement('div');
    wrapper.id = 'rovalra-clear-filter-btn';
    wrapper.className = 'rbx-refresh-button-wrapper';
    wrapper.style.cssText = 'margin-left: auto; display: none;';

    const btn = createButton(ts('serverList.clear'), 'secondary');
    btn.classList.add('filter-button-alignment');
    btn.innerHTML = DOMPurify.sanitize(
        `<span>${ts('serverList.clear')}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6L18 18"/></svg>`,
    );

    btn.addEventListener('click', () => {
        clearAllFilters();
    });

    wrapper.appendChild(btn);
    container.appendChild(wrapper);
    _state.elements.clearButton = wrapper;
}

function handleFilterActivation() {
    if (_state.isFilterActive) return;

    const serverListContainer = document.querySelector(
        '#rbx-public-game-server-item-container',
    );
    if (serverListContainer && !_state.originalServerElements.length) {
        _state.originalServerElements = Array.from(
            serverListContainer.children,
        );
    }

    _state.isFilterActive = true;
    document.body.classList.add('rovalra-filter-active');

    if (_state.elements.clearButton) {
        _state.elements.clearButton.style.display = 'flex';
    }

    const defaultFooter = document.querySelector(
        '.rbx-public-running-games-footer',
    );
    if (defaultFooter) defaultFooter.style.display = 'none';
}

function clearAllFilters() {
    const serverListContainer = document.querySelector(
        '#rbx-public-game-server-item-container',
    );

    document.getElementById('rovalra-load-more-btn')?.remove();
    removeAutoLoadingIndicator();

    if (serverListContainer && _state.originalServerElements.length) {
        serverListContainer.innerHTML = '';
        _state.originalServerElements.forEach((el) => {
            el.style.display = 'block';
            serverListContainer.appendChild(el);
        });
    }

    _state.isFilterActive = false;
    _state.originalServerElements = [];
    document.body.classList.remove('rovalra-filter-active');

    if (_state.elements.clearButton) {
        _state.elements.clearButton.style.display = 'none';
    }

    const footer = document.querySelector('.rbx-public-running-games-footer');
    if (footer) footer.style.display = 'block';

    document.dispatchEvent(new CustomEvent('rovalraClearFilters'));

    const rbxRefresh = document
        .getElementById('rbx-public-running-games')
        ?.querySelector('.rbx-refresh');
    if (rbxRefresh) setTimeout(() => rbxRefresh.click(), 50);
}

function attachGlobalListeners() {
    document.addEventListener('rovalraRegionSelected', (ev) => {
        if (ev.detail?.regionCode) handleFilterActivation();
    });
    document.addEventListener('rovalraUptimeSelected', () => {
        handleFilterActivation();
    });
    document.addEventListener('rovalraVersionSelected', () => {
        handleFilterActivation();
    });

    document.addEventListener('rovalraRegionServersLoaded', async (ev) => {
        const detail = ev && ev.detail;

        if (detail && detail.error) {
            displayMessageInContainer(detail.error, true);
            return;
        }

        if (!detail) return;

        const servers = detail.servers || [];
        const nextCursor = detail.next_cursor;
        const append = !!detail.append;
        const regionCode = detail.regionCode;

        const serverListContainer = document.querySelector(
            '#rbx-public-game-server-item-container',
        );
        if (!serverListContainer) return;

        if (!append) {
            serverListContainer.innerHTML = '';
            _state.targetActiveCount = 6;
            showAutoLoadingIndicator(serverListContainer);
        }

        if (servers.length > 0) {
            await renderAndAppendServers(
                servers,
                serverListContainer,
                getPlaceIdFromUrl(),
            );

            removeAutoLoadingIndicator();

            const activeCount = serverListContainer.querySelectorAll(
                'li[data-rovalra-serverid]',
            ).length;

            if (activeCount < _state.targetActiveCount && nextCursor) {
                showAutoLoadingIndicator(serverListContainer);
                document.dispatchEvent(
                    new CustomEvent('rovalraRequestRegionServers', {
                        detail: {
                            regionCode,
                            cursor: nextCursor,
                            append: true,
                        },
                    }),
                );
            } else {
                manageLoadMoreButton(nextCursor, regionCode);
                if (activeCount === 0) {
                    const isRegion =
                        regionCode &&
                        !['newest', 'oldest'].includes(regionCode) &&
                        !regionCode.startsWith('version-');
                    if (isRegion) {
                        displayMessageInContainer(
                            ts('serverList.allServersInactive'),
                            false,
                        );
                    }
                }
            }
        } else if (!append) {
            displayMessageInContainer(
                await t('serverList.noServersApi'),
                false,
            );
        } else {
            document.getElementById('rovalra-load-more-btn')?.remove();
        }
    });

    document.addEventListener('rovalraRequestError', async (ev) => {
        const errorMessage =
            ev.detail?.message || (await t('serverList.loadErrorApi'));
        displayMessageInContainer(errorMessage, true);
        removeAutoLoadingIndicator();
    });

    document.addEventListener('rovalra-server-inactive', (ev) => {
        const serverId = ev.detail?.serverId;
        if (!serverId) return;
        const serverElement = document.querySelector(
            `li[data-rovalra-serverid="${serverId}"]`,
        );
        if (serverElement) serverElement.remove();
    });
}

function showAutoLoadingIndicator(container) {
    removeAutoLoadingIndicator();
    const loader = document.createElement('div');
    loader.id = 'rovalra-auto-fetch-loader';
    loader.style.cssText =
        'width: 100%; text-align: center; padding: 20px; margin-top: 10px;';
    loader.innerHTML = DOMPurify.sanitize(`

        <div style="display: flex; justify-content: center;"><span class="spinner spinner-default"></span></div>
    `);
    if (container.parentElement) {
        container.parentElement.appendChild(loader);
    }
}

function removeAutoLoadingIndicator() {
    document.getElementById('rovalra-auto-fetch-loader')?.remove();
}

function manageLoadMoreButton(nextCursor, regionCode) {
    document.getElementById('rovalra-load-more-btn')?.remove();
    removeAutoLoadingIndicator();

    if (nextCursor) {
        const serverListContainer = document.querySelector(
            '#rbx-public-game-server-item-container',
        );
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'rovalra-load-more-btn';
        loadMoreButton.textContent = ts('subplaces.loadMore');
        loadMoreButton.className = 'btn-control-sm rbx-upgrade-now-button';
        loadMoreButton.style.width = '100%';
        loadMoreButton.style.display = 'block';
        loadMoreButton.style.marginTop = '10px';
        loadMoreButton.style.cursor = 'pointer';

        loadMoreButton.addEventListener('click', () => {
            const currentCount = serverListContainer.querySelectorAll(
                'li[data-rovalra-serverid]',
            ).length;
            _state.targetActiveCount = currentCount + 6;

            showAutoLoadingIndicator(serverListContainer);
            loadMoreButton.remove();

            document.dispatchEvent(
                new CustomEvent('rovalraRequestRegionServers', {
                    detail: { regionCode, cursor: nextCursor, append: true },
                }),
            );
        });

        if (serverListContainer && serverListContainer.parentElement) {
            serverListContainer.parentElement.appendChild(loadMoreButton);
        }
    }
}

const _started = { value: false };
function startController() {
    if (_started.value) return;
    _started.value = true;

    try {
        if (typeof startObserving === 'function') startObserving();
    } catch (e) {}

    loadServerIpMap()
        .then(() => {
            initializeEnhancementObserver();
        })
        .catch(() => {
            initializeEnhancementObserver();
        });

    attachGlobalListeners();

    observeElement(
        '.server-list-options',
        (optionsBar) => {
            createFilterUI(optionsBar);
        },
        { multiple: false },
    );
}

function getPlaceIdFromUrl() {
    return (
        window.location.pathname.match(/\/games\/(\d+)\//)?.[1] ||
        window.location.pathname.match(/\/(\d{5,})\b/)?.[1] ||
        ''
    );
}

async function loadServerIpMap() {
    try {
        if (typeof loadDatacenterMap === 'function') await loadDatacenterMap();
        _state.serverIpMap = serverIpMap;
    } catch (e) {}

    _state.serverIpMap = null;
}

export function processUptimeBatch() {
    if (_state.uptimeBatch.size === 0) return;
    const placeId = window.location.pathname.match(/\/games\/(\d+)\//)?.[1];
    if (!placeId) return;

    const batch = Array.from(_state.uptimeBatch);
    _state.uptimeBatch.clear();
    try {
        fetchServerUptime(
            placeId,
            batch,
            _state.serverLocations,
            _state.serverUptimes,
        ).catch(() => {});
    } catch (e) {}
}

function initializeEnhancementObserver() {
    const serverSelector =
        '.rbx-public-game-server-item, .rbx-friends-game-server-item';
    let uptimeDebounce = null;
    const scheduleUptime = () => {
        clearTimeout(uptimeDebounce);
        uptimeDebounce = setTimeout(() => processUptimeBatch(), 120);
    };

    try {
        observeElement(
            serverSelector,
            (el) => {
                try {
                    enhanceServer(el, {
                        serverLocations: _state.serverLocations,
                        serverUptimes: _state.serverUptimes,
                        serverPerformanceCache: _state.serverPerformanceCache,
                        vipStatusCache: _state.vipStatusCache,
                        uptimeBatch: _state.uptimeBatch,
                        serverIpMap: _state.serverIpMap,
                        processUptimeBatch,
                    }).catch(() => {});
                } catch (e) {}
                scheduleUptime();
            },
            { multiple: true },
        );

        try {
            setTimeout(() => processUptimeBatch(), 50);
        } catch (e) {}
    } catch (e) {}
}

try {
    document.addEventListener('rovalra-game-servers-response', (event) => {
        try {
            const detail = event && event.detail;
            if (!detail) return;
            const placeId = getPlaceIdFromUrl();
            const data = detail.data || detail;
            const serversArray = Array.isArray(data.data)
                ? data.data
                : Array.isArray(data)
                  ? data
                  : null;
            if (!serversArray) return;

            (async () => {
                for (const serverData of serversArray) {
                    const serverId =
                        serverData.id ||
                        serverData.server_id ||
                        serverData.serverId;
                    if (!serverId) continue;

                    _state.serverDataCache.set(serverId, serverData);
                    const fps =
                        serverData.fps ??
                        serverData.FPS ??
                        serverData.performance ??
                        null;
                    if (typeof fps === 'number') {
                        _state.serverPerformanceCache[serverId] = fps;
                    }

                    if (
                        serverData.playerTokens &&
                        Array.isArray(serverData.playerTokens)
                    ) {
                        _state.collectedPlayerTokens.push(
                            ...serverData.playerTokens,
                        );
                        if (_state.collectedPlayerTokens.length > 2000)
                            _state.collectedPlayerTokens.splice(
                                0,
                                _state.collectedPlayerTokens.length - 2000,
                            );
                    }

                    const serverElement = document.querySelector(
                        `[data-rovalra-serverid="${serverId}"]`,
                    );
                    if (serverElement) {
                        if (
                            serverElement.querySelector(
                                '.rovalra-unknown-count-icon',
                            )
                        ) {
                            const newCard = await createServerCardFromApi(
                                serverData,
                                placeId,
                            );
                            if (newCard) {
                                serverElement.replaceWith(newCard);
                            }
                        } else {
                            if (typeof fps === 'number') {
                                try {
                                    displayPerformance(
                                        serverElement,
                                        fps,
                                        _state.serverLocations,
                                    );
                                } catch (e) {}
                            }
                        }
                    }
                }
            })();
        } catch (e) {}
    });
} catch (e) {}

export async function createServerCardFromRobloxApi(server, placeId) {
    try {
        const listItemClass =
            'rbx-public-game-server-item col-md-3 col-sm-4 col-xs-6';
        const serverItem = document.createElement('li');
        serverItem.className = listItemClass;
        const serverId = server.id || server.server_id || '';
        serverItem.dataset.rovalraServerid = serverId;

        const playerTokens = server.playerTokens || [];
        let playerThumbnailsHTML = '';

        if (playerTokens.length > 0) {
            const thumbnailItems = playerTokens
                .slice(0, 12)
                .map((token) => ({ id: token }));
            const thumbnailMap = await fetchThumbnails(
                thumbnailItems,
                'PlayerToken',
                '150x150',
            );

            playerThumbnailsHTML = playerTokens
                .slice(0, 12)
                .map((token) => {
                    const thumbData = thumbnailMap.get(token);
                    return `<span class="avatar avatar-headshot-md player-avatar"><span class="thumbnail-2d-container avatar-card-image"><img src="${thumbData?.imageUrl || ''}" alt="Player"></span></span>`;
                })
                .join('');
        }
        const remainingPlayers = server.playing - playerTokens.length;
        const extraPlayersHTML =
            remainingPlayers > 0
                ? `<span class="avatar avatar-headshot-md player-avatar hidden-players-placeholder">+${remainingPlayers}</span>`
                : '';
        const playerThumbnailsContainerHTML = `<div class="player-thumbnails-container">${playerThumbnailsHTML}${extraPlayersHTML}</div>`;

        const serverDetailsHTML = `
            <div class="text-info rbx-game-status rbx-public-game-server-status text-overflow">${await t('serverList.peopleMax', { playing: server.playing, maxPlayers: server.maxPlayers })}</div>
            <div class="server-player-count-gauge border"><div class="gauge-inner-bar border" style="width: ${(server.playing / server.maxPlayers) * 100}%;"></div></div>`;

        serverItem.innerHTML = DOMPurify.sanitize(`
            <div class="card-item card-item-public-server">
                ${playerThumbnailsContainerHTML}
                <div class="rbx-public-game-server-details game-server-details">
                    ${serverDetailsHTML}
                </div>
            </div>`);

        if (placeId) {
            const detailsDiv = serverItem.querySelector('.game-server-details');
            const joinBtn = document.createElement('button');
            joinBtn.className =
                'btn-full-width btn-control-xs rbx-public-game-server-join game-server-join-btn btn-primary-md btn-min-width';
            joinBtn.textContent = await t('serverList.join');
            joinBtn.onclick = () => launchGame(placeId, serverId);
            detailsDiv.appendChild(joinBtn);
        }

        try {
            serverItem._rovalraApiData = server;
            serverItem.setAttribute('data-rovalra-api', '1');
        } catch (e) {}

        if (typeof server.fps === 'number') {
            _state.serverPerformanceCache[serverId] = server.fps;
        }

        enhanceServer(serverItem, _state);
        return serverItem;
    } catch (e) {
        return null;
    }
}

export async function createServerCardFromApi(server, placeId = '') {
    try {
        const listItemClass =
            'rbx-public-game-server-item col-md-3 col-sm-4 col-xs-6';
        const serverItem = document.createElement('li');
        serverItem.className = listItemClass;
        const serverId = server.server_id || server.id || '';
        serverItem.dataset.rovalraServerid = serverId;

        const cachedServerData = _state.serverDataCache.get(serverId);
        if (cachedServerData) {
            if (
                typeof cachedServerData.playing === 'number' &&
                typeof server.playing !== 'number'
            ) {
                server.playing = cachedServerData.playing;
                server.maxPlayers = cachedServerData.maxPlayers;
            }
            if (cachedServerData.playerTokens && !server.playerTokens) {
                server.playerTokens = cachedServerData.playerTokens;
            }
        }

        const hasPlayerCount =
            typeof server.playing === 'number' &&
            typeof server.maxPlayers === 'number';
        let thumbnailsHTML = '';
        const placeholderSrc =
            'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTAgMTUwIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI0UzRTNFMyIvPjwvc3ZnPg==';

        const playerTokens = server.playerTokens || [];
        const displayLimit = 6;

        if (playerTokens.length > 0) {
            let itemsToDisplay = playerTokens.slice(0, displayLimit);
            let remainingCount = 0;

            if (hasPlayerCount && server.playing > displayLimit) {
                itemsToDisplay = playerTokens.slice(0, displayLimit - 1);
                remainingCount = server.playing - itemsToDisplay.length;
            }

            const thumbnailItems = itemsToDisplay.map((token) => ({
                id: token,
            }));
            try {
                const thumbnailMap = await fetchThumbnails(
                    thumbnailItems,
                    'PlayerToken',
                    '150x150',
                );
                thumbnailsHTML = thumbnailItems
                    .map((item) => {
                        const thumbData = thumbnailMap.get(item.id);
                        const src =
                            thumbData && thumbData.imageUrl
                                ? thumbData.imageUrl
                                : placeholderSrc;
                        return `<span class="avatar avatar-headshot-md player-avatar"><span class="thumbnail-2d-container avatar-card-image"><img src="${src}" alt="Player"></span></span>`;
                    })
                    .join('');

                if (remainingCount > 0) {
                    thumbnailsHTML += `<span class="avatar avatar-headshot-md player-avatar hidden-players-placeholder">+${remainingCount}</span>`;
                }
            } catch (e) {}
        } else if (!hasPlayerCount || server.playing > 0) {
            let tokensToFetch = [];
            let fetchCount = displayLimit;
            let addPlaceholder = false;
            let remainingCount = 0;

            if (hasPlayerCount && server.playing > displayLimit) {
                fetchCount = displayLimit - 1;
                addPlaceholder = true;
                remainingCount = server.playing - fetchCount;
            }

            if (
                _state.collectedPlayerTokens &&
                _state.collectedPlayerTokens.length > 0
            ) {
                let availableTokens = _state.collectedPlayerTokens.filter(
                    (t) => !_state.recentlyUsedTokens.includes(t),
                );

                if (availableTokens.length < fetchCount) {
                    availableTokens = [..._state.collectedPlayerTokens];
                }

                for (let i = 0; i < fetchCount; i++) {
                    if (availableTokens.length === 0) break;
                    const randomIndex = Math.floor(
                        Math.random() * availableTokens.length,
                    );
                    const token = availableTokens[randomIndex];
                    tokensToFetch.push({ id: token });
                    availableTokens.splice(randomIndex, 1);
                    _state.recentlyUsedTokens.push(token);
                }

                if (_state.recentlyUsedTokens.length > 60)
                    _state.recentlyUsedTokens.splice(
                        0,
                        _state.recentlyUsedTokens.length - 60,
                    );
            }

            if (tokensToFetch.length > 0) {
                try {
                    const thumbnailMap = await fetchThumbnails(
                        tokensToFetch,
                        'PlayerToken',
                        '150x150',
                    );
                    thumbnailsHTML = tokensToFetch
                        .map((t) => {
                            const data = thumbnailMap.get(t.id);
                            const src =
                                data && data.imageUrl
                                    ? data.imageUrl
                                    : placeholderSrc;
                            return `<span class="avatar avatar-headshot-md player-avatar"><span class="thumbnail-2d-container avatar-card-image"><img src="${src}" alt="Player"></span></span>`;
                        })
                        .join('');
                } catch (e) {}
            }
            if (addPlaceholder) {
                thumbnailsHTML += `<span class="avatar avatar-headshot-md player-avatar hidden-players-placeholder">+${remainingCount}</span>`;
            }
        }

        if (!thumbnailsHTML && (!hasPlayerCount || server.playing > 0)) {
            let placeholderCount = displayLimit;
            let addPlaceholder = false;
            let remainingCount = 0;

            if (hasPlayerCount && server.playing > displayLimit) {
                placeholderCount = displayLimit - 1;
                addPlaceholder = true;
                remainingCount = server.playing - placeholderCount;
            }

            for (let i = 0; i < placeholderCount; i++) {
                thumbnailsHTML += `<span class="avatar avatar-headshot-md player-avatar"><span class="thumbnail-2d-container avatar-card-image"><img src="${placeholderSrc}" alt="Player"></span></span>`;
            }

            if (addPlaceholder) {
                thumbnailsHTML += `<span class="avatar avatar-headshot-md player-avatar hidden-players-placeholder">+${remainingCount}</span>`;
            }
        }

        const playerThumbnailsContainerHTML = `
            <div class="player-thumbnails-container" style="position: relative;">
                ${thumbnailsHTML}
                ${!hasPlayerCount ? `<span class="icon-moreinfo rovalra-unknown-count-icon" style="position: absolute; top: -11px; right: -15px; z-index: 5; cursor: help;"></span>` : ''}
            </div>`;

        const serverDetailsHTML = hasPlayerCount
            ? `
            <div class="text-info rbx-game-status rbx-public-game-server-status text-overflow">${await t('serverList.peopleMax', { playing: server.playing, maxPlayers: server.maxPlayers })}</div>
            <div class="server-player-count-gauge border"><div class="gauge-inner-bar border" style="width: ${(server.playing / server.maxPlayers) * 100}%;"></div></div>`
            : `
            <div class="text-info rbx-game-status rbx-public-game-server-status text-overflow">${await t('serverList.playerCountUnknownLabel')}</div>
            <div class="server-player-count-gauge border"><div class="gauge-inner-bar border" style="width: 0%;"></div></div>`;

        serverItem.innerHTML = DOMPurify.sanitize(`
            <div class="card-item card-item-public-server">
                ${playerThumbnailsContainerHTML}
                <div class="rbx-public-game-server-details game-server-details">
                    ${serverDetailsHTML}
                </div>
            </div>`);

        if (!hasPlayerCount) {
            const infoIcon = serverItem.querySelector(
                '.rovalra-unknown-count-icon',
            );
            if (infoIcon) {
                addTooltip(
                    infoIcon,
                    await t('serverList.playerCountUnknownTooltip'),
                    { position: 'top' },
                );
            }
        }

        if (placeId) {
            const detailsDiv = serverItem.querySelector('.game-server-details');
            const joinBtn = document.createElement('button');
            joinBtn.className =
                'btn-full-width btn-control-xs rbx-public-game-server-join game-server-join-btn btn-primary-md btn-min-width';
            joinBtn.textContent = await t('serverList.join');
            joinBtn.onclick = () => launchGame(placeId, serverId);
            detailsDiv.appendChild(joinBtn);
        }

        try {
            serverItem._rovalraApiData = server;
            serverItem.setAttribute('data-rovalra-api', '1');
        } catch (e) {}
        enhanceServer(serverItem, _state);
        return serverItem;
    } catch (e) {
        return null;
    }
}

async function renderAndAppendServers(servers, serverListContainer, placeId) {
    const activeServers = [];
    for (const s of servers) {
        if (await isServerActive(placeId, s.id || s.server_id)) {
            activeServers.push(s);
        }
    }

    const serverCardPromises = activeServers.map((server) => {
        if (server.playerTokens) {
            return createServerCardFromRobloxApi(server, placeId);
        } else {
            return createServerCardFromApi(server, placeId);
        }
    });

    const serverCards = await Promise.all(serverCardPromises);
    serverCards.forEach((serverItem) => {
        if (serverItem) serverListContainer.appendChild(serverItem);
    });
    equalizeCardHeights();
}

function equalizeCardHeights() {
    const serverListContainer = document.querySelector(
        '#rbx-public-game-server-item-container',
    );
    if (!serverListContainer) return;
    const serverCards = serverListContainer.querySelectorAll(
        '.rbx-public-game-server-item .card-item',
    );
    if (serverCards.length < 2) return;
    serverCards.forEach((card) => (card.style.minHeight = ''));
    let maxHeight = 0;
    serverCards.forEach((card) => {
        if (card.offsetHeight > maxHeight) {
            maxHeight = card.offsetHeight;
        }
    });
    serverCards.forEach((card) => (card.style.minHeight = `${maxHeight}px`));
}
function displayMessageInContainer(message, isError = false) {
    const serverListContainer = document.querySelector(
        '#rbx-public-game-server-item-container',
    );
    if (!serverListContainer) return;

    serverListContainer.innerHTML = '';

    document.getElementById('rovalra-load-more-btn')?.remove();
    removeAutoLoadingIndicator();

    const listItem = document.createElement('li');
    listItem.style.width = '100%';
    listItem.style.textAlign = 'center';
    listItem.style.padding = '40px 10px';
    listItem.style.listStyleType = 'none';
    listItem.className = 'rbx-public-game-server-item';

    const textEl = document.createElement('div');
    textEl.textContent = message;

    textEl.className = isError ? 'text-error' : 'text-secondary';
    textEl.style.fontSize = '16px';
    textEl.style.fontWeight = '500';

    listItem.appendChild(textEl);
    serverListContainer.appendChild(listItem);
}
export {
    enhanceServer,
    displayPerformance,
    displayUptime,
    displayPlaceVersion,
    displayRegion,
    displayServerFullStatus,
    displayPrivateServerStatus,
    displayInactivePlaceStatus,
    isExcludedButton,
    createUUID,
    getFullLocationName,
    fetchServerUptime,
    fetchAndDisplayRegion,
    addCopyJoinLinkButton,
    attachCleanupObserver,
    cleanupServerUI,
    getOrCreateDetailsContainer,
    createInfoElement,
};
