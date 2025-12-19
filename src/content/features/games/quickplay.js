

import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { launchGame, launchPrivateGame } from '../../core/utils/launcher.js';
import { getRegionData, getFullRegionName } from '../../core/regions.js';
import { createDropdownContent } from '../../core/ui/selects.js';
import { createButton } from '../../core/ui/buttons.js';
import { addTooltip as attachTooltip } from '../../core/ui/tooltip.js';
import { performJoinAction, getSavedPreferredRegion } from '../../core/preferredregion.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';


const PROCESSED_MARKER_CLASS = 'rovalra-quickplay-processed';
const GLOBAL_CONTAINER_ID = 'rovalra-private-servers-global-container';

const State = {
    currentUserId: null,
    activePlaceId: null,
    activeGameCardLink: null, 
    
    privateServerStatus: new Map(),
    privateServerList: new Map(),
    privateServerDetails: new Map(),
    thumbnails: new Map(),

    
    privateServersContainer: null,
    dropdownPanel: null,
    
    hideOverlayTimer: null, 
    isLoadingPrivateServers: false,
    currentNextPageCursor: null,
    
    regions: {},
    serverIpMap: {},

    cleanupTimers: new WeakMap() 
};



const Icons = {
    globe: () => createSvgPath("M19.3 16.9c.4-.7.7-1.5.7-2.4 0-2.5-2-4.5-4.5-4.5S11 12 11 14.5s2 4.5 4.5 4.5c.9 0 1.7-.3 2.4-.7l3.2 3.2 1.4-1.4zm-3.8.1c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5M12 20v2C6.48 22 2 17.52 2 12S6.48 2 12 2c4.84 0 8.87 3.44 9.8 8h-2.07c-.64-2.46-2.4-4.47-4.73-5.41V5c0 1.1-.9 2-2 2h-2v2c0 .55-.45 1-1 1H8v2h2v3H9l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.41 3.59 8 8 8"),
    privateServer: () => createSvgPath("M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1M7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2M20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1M7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2"),
    copy: () => createSvgPath("M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z", 20),
    generate: () => createSvgPath("M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8", 20, "scale(-1, 1)", "center"),
    configure: () => createSvgPath("M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6")
};

function createSvgPath(d, size = 22, transform = '', transformOrigin = '') {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "white");
    if (transform) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", transform);
        if (transformOrigin) g.setAttribute("transform-origin", transformOrigin);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        g.appendChild(path);
        svg.appendChild(g);
    } else {
        svg.innerHTML = `<path d="${d}"></path>`;
    }
    return svg;
}

function getCurrentUserId() {
    const userDataTag = document.querySelector('meta[name="user-data"]');
    return userDataTag?.dataset?.userid ? parseInt(userDataTag.dataset.userid, 10) : null;
}

function getGameIdsFromLink(href) {
    try {
        const urlObj = new URL(href, window.location.origin);
        const params = urlObj.searchParams;
        
        let placeId = params.get('PlaceId');
        if (!placeId) {
            const match = urlObj.pathname.match(/^\/games\/(\d+)/);
            if (match) placeId = match[1];
        }
        return { placeId, universeId: params.get('universeId') };
    } catch (e) {
        return { placeId: null, universeId: null };
    }
}

function showTemporaryTooltip(parent, text, duration = 1400) {
    const temp = document.createElement('div');
    temp.className = 'rovalra-ps-tooltip';
    Object.assign(temp.style, {
        position: 'absolute', zIndex: '10006', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.12s ease'
    });
    temp.innerHTML = text;
    document.body.appendChild(temp);
    
    const rect = parent.getBoundingClientRect();
    temp.style.left = `${rect.left + window.scrollX + (rect.width / 2)}px`;
    temp.style.top = `${rect.top + window.scrollY - 8}px`;
    temp.style.transform = 'translate(-50%, -100%)';
    
    requestAnimationFrame(() => temp.style.opacity = '1');
    setTimeout(() => {
        temp.style.opacity = '0';
        setTimeout(() => temp.remove(), 150);
    }, duration);
}

function initializeData() {
    chrome.storage.local.get(['cachedRegions', 'rovalraDatacenters'], (result) => {
        if (result.cachedRegions) State.regions = result.cachedRegions;
        if (result.rovalraDatacenters) {
            result.rovalraDatacenters.forEach(entry => {
                if (entry.location && entry.dataCenterIds) {
                    entry.dataCenterIds.forEach(id => State.serverIpMap[id] = entry.location);
                }
            });
        }
    });
}

async function getVipServerDetails(vipServerId) {
    if (State.privateServerDetails.has(vipServerId)) return State.privateServerDetails.get(vipServerId);
    try {
        const res = await callRobloxApi({ subdomain: 'games', endpoint: `/v1/vip-servers/${vipServerId}` });
        const data = res.ok ? await res.json() : null;
        State.privateServerDetails.set(vipServerId, data);
        return data;
    } catch {
        State.privateServerDetails.set(vipServerId, null);
        return null;
    }
}

async function isVipServerActive(vipServerId) {
    if (State.privateServerStatus.has(vipServerId)) return State.privateServerStatus.get(vipServerId);
    try {
        const res = await callRobloxApi({ subdomain: 'games', endpoint: `/v1/vip-servers/${vipServerId}` });
        const isActive = res.ok && (await res.json()).active === true;
        State.privateServerStatus.set(vipServerId, isActive);
        return isActive;
    } catch {
        State.privateServerStatus.set(vipServerId, false);
        return false;
    }
}

async function getThumbnails(userIds) {
    const idsToFetch = userIds.filter(id => !State.thumbnails.has(id));
    if (idsToFetch.length > 0) {
        const items = idsToFetch.map(id => ({ id }));
        try {
            const result = await fetchThumbnails(items, 'AvatarHeadshot', '150x150', true);
            result.forEach((thumbData, userId) => {
                if (thumbData.state === 'Completed') State.thumbnails.set(userId, thumbData.imageUrl);
            });
        } catch (e) { console.error("Quick Play: Thumb fetch failed", e); }
    }
    const finalMap = {};
    userIds.forEach(id => { if (State.thumbnails.has(id)) finalMap[id] = State.thumbnails.get(id); });
    return finalMap;
}

function createGlobalPrivateServerContainer() {
    if (document.getElementById(GLOBAL_CONTAINER_ID)) return;

    const { element: dropdownPanel } = createDropdownContent(document.body, [], null, () => {}, () => {});
    dropdownPanel.id = GLOBAL_CONTAINER_ID;
    Object.assign(dropdownPanel.style, { width: '320px', minWidth: '0px', maxHeight: '400px' });
    dropdownPanel.setAttribute('data-state', 'closed');
    document.body.appendChild(dropdownPanel);

    State.dropdownPanel = dropdownPanel;
    State.privateServersContainer = dropdownPanel.querySelector('.flex-dropdown-menu');
    
    if (State.privateServersContainer) {
        State.privateServersContainer.className = 'rovalra-ps-list-container';
        State.privateServersContainer.addEventListener('scroll', (e) => {
            if (State.isLoadingPrivateServers || !State.currentNextPageCursor || !State.activePlaceId) return;
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollHeight - scrollTop - clientHeight < 50) {
                fetchAndDisplayPrivateServers(State.activePlaceId, true, State.currentNextPageCursor);
            }
        });
    }

    dropdownPanel.addEventListener('mouseenter', () => {
        clearTimeout(State.hideOverlayTimer);
        if (State.activeGameCardLink) {
            const timerId = State.cleanupTimers.get(State.activeGameCardLink);
            if (timerId) clearTimeout(timerId);
            State.activeGameCardLink.classList.add('quick-play-hover-active');
        }
    });

    dropdownPanel.addEventListener('mouseleave', () => {
        State.hideOverlayTimer = setTimeout(hidePrivateServersOverlay, 200);
        if (State.activeGameCardLink) {
            scheduleCardCleanup(State.activeGameCardLink);
        }
    });
}

async function fetchAndDisplayPrivateServers(placeId, loadMore = false, nextPageCursor = null) {
    if (State.isLoadingPrivateServers) return;
    State.isLoadingPrivateServers = true;
    const isDark = document.body.classList.contains('dark-theme');

    try {
        if (!loadMore) {
            State.privateServersContainer.innerHTML = `<p style="color: ${isDark ? '#fff' : '#000'}; text-align: center; padding: 10px 0;">Loading...</p>`;
            
            if (State.privateServerList.has(placeId)) {
                const cached = State.privateServerList.get(placeId);
                const thumbs = await getThumbnails(cached.servers.map(s => s.owner.id));
                renderPrivateServers(placeId, cached.servers, cached.nextPageCursor, thumbs, false);
                State.isLoadingPrivateServers = false;
                return;
            }
        }

        let res;
        let retryDelay = 1000; 
        
        while (true) {
            if (State.activePlaceId !== placeId || !State.dropdownPanel.classList.contains('visible')) {
                State.isLoadingPrivateServers = false;
                return; 
            }

            res = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/games/${placeId}/private-servers?limit=100&sortOrder=Desc${nextPageCursor ? `&cursor=${nextPageCursor}` : ''}`
            });

            if (res.status === 429) {
                if (!loadMore) {
                    State.privateServersContainer.innerHTML = `<p style="color: ${isDark ? '#fff' : '#000'}; text-align: center; padding: 10px 0;">Rate limited. Retrying...</p>`;
                }
                
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                retryDelay = Math.min(retryDelay * 2, 8000);
                
                continue; 
            }

            break;
        }

        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();

        let serversToDisplay = data.data;
        
        if (State.currentUserId) {
            const checks = await Promise.all(data.data.map(async (s) => {
                if (s.owner.id === State.currentUserId) {
                    const active = await isVipServerActive(s.vipServerId);
                    return active ? s : null;
                }
                return s;
            }));
            serversToDisplay = checks.filter(s => s !== null);
        }

        const thumbs = await getThumbnails(serversToDisplay.map(s => s.owner.id));

        if (loadMore) {
            const cached = State.privateServerList.get(placeId) || { servers: [], nextPageCursor: null };
            cached.servers.push(...serversToDisplay);
            cached.nextPageCursor = data.nextPageCursor;
            renderPrivateServers(placeId, serversToDisplay, data.nextPageCursor, thumbs, true);
        } else {
            State.privateServerList.set(placeId, { servers: serversToDisplay, nextPageCursor: data.nextPageCursor });
            renderPrivateServers(placeId, serversToDisplay, data.nextPageCursor, thumbs, false);
        }

    } catch (e) {
        if (State.activePlaceId === placeId) {
            State.privateServersContainer.innerHTML = `<p style="text-align: center;">Could not load servers.</p>`;
        }
    } finally {
        State.isLoadingPrivateServers = false;
    }
}

function renderPrivateServers(placeId, servers, nextPageCursor, thumbnails, append) {
    const isDark = document.body.classList.contains('dark-theme');
    if (!append) State.privateServersContainer.innerHTML = '';
    State.currentNextPageCursor = nextPageCursor;

    if (!servers.length && !append) {
        const msg = document.createElement('p');
        msg.textContent = 'No active private servers found.';
        Object.assign(msg.style, { color: isDark ? '#949ba4' : '#5F6368', textAlign: 'center', padding: '10px 0' });
        State.privateServersContainer.appendChild(msg);
        return;
    }

    const fragment = document.createDocumentFragment();

    servers.forEach(server => {
        const el = document.createElement('div');
        el.className = 'private-server-item';

        const thumbUrl = thumbnails[server.owner.id];
        el.innerHTML = `
            <a href="https://www.roblox.com/users/${server.owner.id}/profile" target="_blank" class="private-server-owner-thumb-link" onclick="event.stopPropagation()">
                <img class="private-server-owner-thumb" src="${thumbUrl || ''}">
            </a>
            <div class="private-server-info">
                <span class="private-server-name" title="${server.name}">${server.name}</span>
                <span class="private-server-players">${server.players.length} / ${server.maxPlayers}</span>
            </div>
        `;

        if (server.owner.id === State.currentUserId) {
            const actions = document.createElement('div');
            actions.className = 'private-server-owner-actions';
            
            const createActionBtn = (icon, tooltip, onClick, initDisabled = false) => {
                const btn = createButton('', 'secondary');
                btn.classList.add('private-server-action-btn');
                btn.append(icon());
                attachTooltip(btn, tooltip, { position: 'top' });
                btn.disabled = initDisabled;
                btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(btn); };
                return btn;
            };

            actions.append(
                createActionBtn(Icons.configure, 'Configure', () => window.open(`https://www.roblox.com/private-server/configure/${server.vipServerId}`, '_blank')),
                createActionBtn(Icons.copy, 'Copy Link', async (btn) => {
                    btn.disabled = true;
                    const details = await getVipServerDetails(server.vipServerId);
                    if (details?.link) {
                        await navigator.clipboard.writeText(details.link);
                        showTemporaryTooltip(btn, 'Copied!');
                    } else showTemporaryTooltip(btn, 'Error!');
                    setTimeout(() => btn.disabled = false, 1500);
                }, true),
                createActionBtn(Icons.generate, 'Generate New Link', async (btn) => {
                    const oldContent = btn.innerHTML;
                    btn.innerHTML = '...'; btn.disabled = true;
                    const res = await callRobloxApi({ subdomain: 'games', endpoint: `/v1/vip-servers/${server.vipServerId}`, method: 'PATCH', body: { newJoinCode: true } });
                    if (res.ok) {
                        State.privateServerDetails.delete(server.vipServerId);
                    }
                    setTimeout(() => { btn.innerHTML = oldContent; btn.disabled = false; }, 1500);
                })
            );
            getVipServerDetails(server.vipServerId).then(d => { 
                const copyBtn = actions.querySelector('button:nth-child(2)');
                if (d?.link && copyBtn) copyBtn.disabled = false; 
            });
            el.appendChild(actions);
        }

        const joinBtn = document.createElement('button');
        joinBtn.className = 'private-server-join-btn';
        joinBtn.innerHTML = `<span class="icon-common-play"></span>`;
        joinBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            launchPrivateGame(placeId, server.accessCode, server.vipServerId);
            hidePrivateServersOverlay();
        };
        el.appendChild(joinBtn);
        fragment.appendChild(el);
    });

    State.privateServersContainer.appendChild(fragment);
}

function showPrivateServerOverlay(gameLink, placeId) {
    if (State.activeGameCardLink === gameLink) {
        hidePrivateServersOverlay();
        return;
    }
    if (State.activeGameCardLink) State.activeGameCardLink.classList.remove('quick-play-hover-active');

    State.activeGameCardLink = gameLink;
    State.activePlaceId = placeId;
    gameLink.classList.add('quick-play-hover-active');

    const dropdown = State.dropdownPanel;
    if (!dropdown) return;

    const rect = gameLink.getBoundingClientRect();
    const width = 320;
    dropdown.style.width = `${width}px`;

    let left = rect.left + window.scrollX + (rect.width / 2) - (width / 2);
    left = Math.max(10, Math.min(left, document.documentElement.clientWidth - width - 10));
    const top = rect.bottom + window.scrollY + 8;

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.classList.add('visible');
    try { dropdown.setAttribute('data-state', 'open'); } catch(e){}

    fetchAndDisplayPrivateServers(placeId);
}

function hidePrivateServersOverlay() {
    if (State.dropdownPanel && State.dropdownPanel.matches(':hover')) return;

    if (!State.dropdownPanel || !State.dropdownPanel.classList.contains('visible')) return;
    
    if (State.activeGameCardLink) State.activeGameCardLink.classList.remove('quick-play-hover-active');
    
    State.dropdownPanel.classList.remove('visible');
    try { State.dropdownPanel.setAttribute('data-state', 'closed'); } catch(e){}
    
    State.activeGameCardLink = null;
    State.activePlaceId = null;
    State.currentNextPageCursor = null;
}

function forceCleanOtherCards(exceptCard) {
    const activeCards = document.querySelectorAll('.game-card-link.quick-play-hover-active');
    activeCards.forEach(card => {
        if (card !== exceptCard) {
            if (State.activeGameCardLink === card && State.dropdownPanel?.matches(':hover')) {
                return; 
            }
            performCardCleanup(card);
        }
    });
}

function performCardCleanup(gameLink) {
    gameLink.classList.remove('quick-play-hover-active');
    if (!gameLink.matches(':hover')) {
        gameLink.querySelector('.hover-background')?.remove();
        gameLink.querySelector('.play-button-overlay')?.remove();
        gameLink.classList.remove('game-tile-styles');
        gameLink.querySelectorAll('.quick-play-original-stats').forEach(el => el.classList.remove('quick-play-original-stats'));
    }
}

function scheduleCardCleanup(gameLink) {
    const existing = State.cleanupTimers.get(gameLink);
    if (existing) clearTimeout(existing);

    const timerId = setTimeout(() => {
        if (gameLink.matches(':hover')) return;

        if (State.activeGameCardLink === gameLink && State.dropdownPanel?.matches(':hover')) {
            return;
        }

        if (State.activeGameCardLink === gameLink) {
             hidePrivateServersOverlay(); 
        }

        performCardCleanup(gameLink);

    }, 100);

    State.cleanupTimers.set(gameLink, timerId);
}

async function setupHoverCard(gameLink, settings) {
    forceCleanOtherCards(gameLink);

    const existing = State.cleanupTimers.get(gameLink);
    if (existing) clearTimeout(existing);

    if (gameLink.querySelector('.play-button-overlay')) {
        gameLink.classList.add('quick-play-hover-active');
        return;
    }

    gameLink.classList.add('game-tile-styles');
    const isSpecialLayout = gameLink.closest('.featured-game-container, .featured-grid-item-container');

    if (!isSpecialLayout) {
        const hoverBg = document.createElement('div');
        hoverBg.className = 'hover-background';
        gameLink.appendChild(hoverBg);
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'play-button-overlay';
    const wrapper = document.createElement('div');
    wrapper.className = 'play-buttons-wrapper';

    const { placeId, universeId } = getGameIdsFromLink(gameLink.href);

    const handlePreferredJoin = async (e) => {
        e.preventDefault(); e.stopPropagation(); hidePrivateServersOverlay();
        if (!placeId) return;
        try {
            const savedRegion = await getSavedPreferredRegion();
            await performJoinAction(placeId, universeId, savedRegion === 'AUTO' ? null : savedRegion);
        } catch (err) { }
    };

    const handleNormalJoin = (e) => {
        e.preventDefault(); e.stopPropagation(); hidePrivateServersOverlay();
        if (placeId) launchGame(placeId);
    };

    const playBtn = document.createElement('button');
    playBtn.className = 'play-game-button';
    playBtn.innerHTML = `<span class="icon-common-play"></span>`;
    
    if (settings.PreferredRegionEnabled && settings.playbuttonpreferredregionenabled) {
        playBtn.onclick = handlePreferredJoin;
        if (settings.robloxPreferredRegion === 'AUTO') attachTooltip(playBtn, 'Join Fastest Server');
        else addRegionTooltip(playBtn);
    } else {
        playBtn.onclick = handleNormalJoin;
    }
    wrapper.appendChild(playBtn);

    if (settings.PreferredRegionEnabled && !settings.playbuttonpreferredregionenabled) {
        const regionBtn = document.createElement('button');
        regionBtn.className = 'server-browser-button';
        regionBtn.appendChild(Icons.globe());
        regionBtn.onclick = handlePreferredJoin;
        if (settings.robloxPreferredRegion === 'AUTO') attachTooltip(regionBtn, 'Join Fastest Server');
        else addRegionTooltip(regionBtn);
        wrapper.appendChild(regionBtn);
    }

    if (settings.privateservers) {
        const psBtn = document.createElement('button');
        psBtn.className = 'private-servers-button';
        psBtn.append(Icons.privateServer());
        attachTooltip(psBtn, 'Private Servers');
        psBtn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (placeId) showPrivateServerOverlay(gameLink, placeId);
        };
        wrapper.appendChild(psBtn);

        gameLink.addEventListener('mouseenter', () => {
            if (State.dropdownPanel?.classList.contains('visible') && State.activeGameCardLink === gameLink) {
                clearTimeout(State.hideOverlayTimer);
            }
        });
        gameLink.addEventListener('mouseleave', () => {
            if (State.activeGameCardLink === gameLink) {
                State.hideOverlayTimer = setTimeout(hidePrivateServersOverlay, 200);
            }
        });
    }

    overlay.appendChild(wrapper);
    gameLink.appendChild(overlay);

    if (!isSpecialLayout) {
        gameLink.querySelectorAll('.game-card-info:has(.icon-votes-gray), .game-card-info:has(.icon-playing-counts-gray), .game-card-friend-info')
            .forEach(el => el.classList.add('quick-play-original-stats'));
    }

    requestAnimationFrame(() => gameLink.classList.add('quick-play-hover-active'));
}

async function addRegionTooltip(button) {
    const saved = await new Promise(r => chrome.storage.local.get('robloxPreferredRegion', res => r(res)));
    const regionCode = saved.robloxPreferredRegion;
    const text = (regionCode && State.regions[regionCode]) 
        ? `Join Preferred Region<br><b>${getFullRegionName(regionCode)}</b>` 
        : 'Select Preferred Region';
    attachTooltip(button, text);
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = CSS_STYLES;
    document.head.appendChild(style);
}

function initializeQuickPlay() {
    if (window.hasRunQuickPlayScript) return;
    window.hasRunQuickPlayScript = true;
    window.EMULATE_API_FAILURE = true;

    injectStyles();
    State.currentUserId = getCurrentUserId();
    initializeData();
    createGlobalPrivateServerContainer();

    chrome.storage.local.get({
        PreferredRegionEnabled: true,
        privateservers: true,
        playbuttonpreferredregionenabled: true,
        robloxPreferredRegion: 'AUTO'
    }, (settings) => {
        const onCardFound = (gameLink) => {
            if (gameLink.closest('[data-testid="event-experience-link"]')) {
                return;
            }
            if (gameLink.classList.contains(PROCESSED_MARKER_CLASS)) return;
            gameLink.classList.add(PROCESSED_MARKER_CLASS);
            
            gameLink.addEventListener('mouseenter', () => setupHoverCard(gameLink, settings));
            gameLink.addEventListener('mouseleave', () => scheduleCardCleanup(gameLink));
        };

        observeElement('a.game-card-link[href*="/games/"]', onCardFound, { multiple: true });
    });

    window.addEventListener('beforeunload', () => {
        State.dropdownPanel?.remove();
        document.getElementById('rovalra-global-quickplay-tooltip')?.remove();
        window.hasRunQuickPlayScript = false;
    }, { once: true });
}

export function init() {
    chrome.storage.local.get({ QuickPlayEnable: true }, (settings) => {
        if (settings.QuickPlayEnable) {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeQuickPlay);
            else initializeQuickPlay();
        }
    });
}

const CSS_STYLES = `
.scroller-new, .scroller { z-index: 5 !Important; }
a.game-tile-styles.game-card-link { position: relative; display: block; z-index: 2; transform: translateZ(0); }
a.game-tile-styles.game-card-link:hover { z-index: 2; }
a.game-tile-styles.game-card-link::after { content: ''; position: absolute; top: -2.5%; left: -2.5%; width: 105%; height: 105%; z-index: 1; }
a.game-tile-styles.game-card-link::before, .hover-background { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 12px; opacity: 0; transition: opacity 0.15s ease-out, transform 0.15s ease-out; pointer-events: none; will-change: transform, opacity; }
a.game-tile-styles.game-card-link::before { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); z-index: -2; }
.hover-background { background-color: rgb(39, 41, 48); transform: scale(1); z-index: -1; }
body:not(.dark-theme) .hover-background { background-color: rgb(247, 247, 248); }
a.game-tile-styles.game-card-link:hover::before, a.game-tile-styles.game-card-link.quick-play-hover-active::before { opacity: 1; }
a.game-tile-styles.game-card-link:hover .hover-background, a.game-tile-styles.game-card-link.quick-play-hover-active .hover-background { opacity: 1; transform: scale(1.05); }
a.game-tile-styles.game-card-link:hover .game-card-name, a.game-tile-styles.game-card-link.quick-play-hover-active .game-card-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
a.game-tile-styles.game-card-link:hover .game-card-native-ad, a.game-tile-styles.game-card-link.quick-play-hover-active .game-card-native-ad { display: none; }
.quick-play-original-stats { z-index: 5; transition: transform 0.15s ease-out; will-change: transform; }
a.game-tile-styles.game-card-link:hover .quick-play-original-stats.game-card-friend-info,
a.game-tile-styles.game-card-link.quick-play-hover-active .quick-play-original-stats.game-card-friend-info { transform: translateY(-30px); }
a.game-tile-styles.game-card-link:hover .quick-play-original-stats.game-card-info:not(.game-card-friend-info),
a.game-tile-styles.game-card-link.quick-play-hover-active .quick-play-original-stats.game-card-info:not(.game-card-friend-info) { transform: translateY(-25px); }
.play-button-overlay { display: flex; flex-direction: column; position: absolute; bottom: 0px; left: 0px; right: 0px; z-index: 10; opacity: 0; gap: 0px; transform: translateY(0px); transition: opacity 0.2s ease-out, transform 0.2s ease-out; pointer-events: none; }
a.game-tile-styles.game-card-link:hover .play-button-overlay, a.game-tile-styles.game-card-link.quick-play-hover-active .play-button-overlay { opacity: 1; transform: translateY(0); transition-delay: 0.1s; }
.play-buttons-wrapper { display: flex; gap: 4px; width: 100%; }
.play-game-button, .server-browser-button, .private-servers-button { pointer-events: auto; background-color: rgb(51, 95, 255); color: white; border: none; padding: 4px; line-height: 0; border-radius: 6px; cursor: pointer; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; height: 28px; }
.play-game-button:hover, .server-browser-button:hover, .private-servers-button:hover { background-color: rgba(41, 82, 233, 1); }
.play-game-button { flex-grow: 1; position: relative; }
.server-browser-button, .private-servers-button { position: relative; flex-shrink: 0; padding: 0 6px; }
.rovalra-ps-tooltip { position: fixed; background-color: #232527; color: #FFFFFF; padding: 7px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; white-space: normal; line-height: 1.4; text-align: center; z-index: 10003; visibility: hidden; opacity: 0; transition: opacity 0.15s ease; pointer-events: none; min-width: max-content; }
.tooltip, .tooltip.in, .tooltip.fade.in { z-index: 10010 !important; }
.tooltip .tooltip-inner { z-index: 10011 !important; }
body:not(.dark-theme) .rovalra-ps-tooltip { background-color: #FFFFFF; color: #1E2024; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
.private-server-item { display: flex; align-items: center; padding: 12px; border-radius: 8px; transition: background-color 0.2s; }
.private-server-item:not(:last-child) { margin-bottom: 8px; }
.private-server-item:hover { background-color: #2c2e37; }
.private-server-info { display: flex; flex-direction: column; gap: 3px; color: #c1c6ce; font-size: 13px; flex-grow: 1; min-width: 0; flex: 1 1 auto; }
.private-server-name { font-weight: 500; color: #f0f2f5; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.private-server-players { color: #f0f2f5a4; flex: none; white-space: nowrap; }
.private-server-owner-thumb-link { flex-shrink: 0; margin-right: 12px; display: block; }
.private-server-owner-thumb { width: 40px; height: 40px; border-radius: 50%; background-color: var(--surface-neutral-tertiary); }
body:not(.dark-theme) .private-server-owner-thumb { background-color: var(--surface-neutral-secondary); }
.private-server-owner-actions { display: flex; gap: 8px; margin-left: 12px; flex-shrink: 0; }
.private-server-join-btn, .private-server-action-btn { border: none; border-radius: 6px; cursor: pointer; transition: background-color 0.2s, opacity 0.2s; display: flex; align-items: center; justify-content: center; color: white; position: relative; height: 28px; flex-shrink: 0; }
.private-server-join-btn { background-color: rgb(51, 95, 255); width: 48px; margin-left: 8px; }
.private-server-join-btn .icon-common-play { transform: scale(0.9); }
.private-server-join-btn:hover { background-color: rgba(41, 82, 233, 1); }
.private-server-action-btn { background-color: #4f545c; width: 28px !important; padding: 0 !important; box-sizing: border-box; }
.private-server-action-btn:hover { background-color: #5d636d; }
.private-server-action-btn:disabled { background-color: #4f545c; opacity: 0.5; cursor: not-allowed; }
.private-server-action-btn svg, .private-server-action-btn img { width: 20px !important; height: 20px !important; display: block; }
body:not(.dark-theme) .private-server-item:hover { background-color: #F0F1F2; }
body:not(.dark-theme) .private-server-info { color: #5F6368; }
body:not(.dark-theme) .private-server-name { color: #1E2024; }
body:not(.dark-theme) .private-server-players { color: #5F6368; }
body:not(.dark-theme) .private-server-action-btn { background-color: #E8EAED; }
body:not(.dark-theme) .private-server-action-btn:hover { background-color: #D2D5D9; }
body:not(.dark-theme) .private-server-action-btn svg { fill: #3C4043; }
#rovalra-private-servers-global-container { position: absolute; z-index: 10002; display: flex; flex-direction: column; border-radius: 12px; opacity: 0; visibility: hidden; transform: translateY(-5px) scale(0.98); transition: opacity 0.2s ease, transform 0.2s ease, visibility 0s linear 0.2s; pointer-events: none; overflow-y: auto; overflow-x: hidden; }
#rovalra-private-servers-global-container.visible { opacity: 1; visibility: visible; transform: translateY(0) scale(1); transition-delay: 0s; pointer-events: auto; }
.rovalra-ps-list-container { padding: 8px; flex-grow: 1; box-sizing: border-box; }
#rovalra-private-servers-global-container::-webkit-scrollbar { width: 8px; }
#rovalra-private-servers-global-container::-webkit-scrollbar-track { background: transparent; }
#rovalra-private-servers-global-container::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.2); border-radius: 4px; }
body:not(.dark-theme) #rovalra-private-servers-global-container::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.2); }
.rovalra-ps-list-container .private-server-item { background-color: var(--surface-neutral-secondary); }
.featured-game-container a.game-tile-styles.game-card-link::after,
.featured-game-container a.game-tile-styles.game-card-link::before,
.featured-game-container .hover-background { position: absolute; top: 16px; left: 16px; background: none; border: none; cursor: pointer; padding: 4px; color: #FFF; }
`;