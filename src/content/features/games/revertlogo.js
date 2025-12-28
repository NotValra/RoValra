import { observeElement } from '../../core/observer.js';
import { getAssets } from '../../core/assets.js';
import { loadDatacenterMap, getRegionData, getFullRegionName } from '../../core/regions.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApi } from '../../core/api.js'; 
import DOMPurify from 'dompurify';
import { launchGame } from '../../core/utils/launcher.js';

import { 
    showLoadingOverlay, 
    updateLoadingOverlayText, 
    updateServerInfo, 
    showLoadingOverlayResult, 
    hideLoadingOverlay 
} from '../../core/ui/startModal/gamelaunchmodal.js';

const HIDE_ROBLOX_UI_CLASS = 'rovalra-hide-roblox-dialogs';

const styles = `
    body.${HIDE_ROBLOX_UI_CLASS} .foundation-web-dialog-overlay,
    body.${HIDE_ROBLOX_UI_CLASS} .MuiModal-root,
    body.${HIDE_ROBLOX_UI_CLASS} .ReactModalPortal,
    body.${HIDE_ROBLOX_UI_CLASS} iframe#gamelaunch {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
        z-index: -9999 !important;
    }

    .rovalra-info-icon {
        fill: rgb(32, 34, 39); 
    }
    .dark-theme .rovalra-info-icon {
        fill: rgb(247, 247, 248) !important;
    }
    .light-theme .rovalra-info-icon {
        fill: rgb(32, 34, 39) !important;
    }
`;

try {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = styles;
    (document.head || document.documentElement).appendChild(styleSheet);
} catch(e) { }


function openInterface(onCancel, customLogo) {
    document.body.classList.add(HIDE_ROBLOX_UI_CLASS);
    showLoadingOverlay(() => {
        closeInterface();
        if (onCancel) onCancel();
    }, customLogo);
}

function closeInterface(force = false) {
    document.body.classList.remove(HIDE_ROBLOX_UI_CLASS);
    hideLoadingOverlay(force);
}


let serverIpMap = {};
let REGIONS = {};
let lastProcessedGameLaunchSrc = null;
let gameLaunchElementExists = false;
let interceptedServerData = null;
let currentGameId = null;


async function ensureDatacenterDataIsParsed() {
    try {
        if (Object.keys(serverIpMap).length > 0) return;

        await loadDatacenterMap();
        const regionData = await getRegionData();
        REGIONS = regionData.regions;
        
        const result = await Promise.race([
            new Promise((resolve) => chrome.storage.local.get('rovalraDatacenters', resolve)),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
        ]);

        const serverListData = result.rovalraDatacenters;
        if (serverListData && Array.isArray(serverListData)) {
            serverListData.forEach(entry => {
                if (!entry.location || !entry.dataCenterIds) return;
                entry.dataCenterIds.forEach(id => { serverIpMap[id] = entry.location; });
            });
        }
    } catch (error) {
        console.warn("Rovalra: Failed to load datacenter map", error);
    }
}

async function fetchGameDetails(placeId) {
    if (!placeId) return { name: "Roblox Experience", iconUrl: null };
    try {
        const detailsReq = await callRobloxApi({
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            subdomain: 'games'
        });
        const detailsData = await detailsReq.json();
        const name = detailsData[0]?.name || "Unknown Experience";

        let iconUrl = null;
        try {
            const thumbMap = await fetchThumbnails([{ id: parseInt(placeId, 10) }], 'PlaceIcon', '150x150', false);
            const thumbData = thumbMap.get(parseInt(placeId, 10));
            if (thumbData && thumbData.state === 'Completed') {
                iconUrl = thumbData.imageUrl;
            }
        } catch (e) {
            
        }

        return { name, iconUrl };
    } catch (e) {
        return { name: "Roblox Experience", iconUrl: null };
    }
}

async function fetchServerUptime(placeId, serverId) {
    if (!placeId || !serverId) return null;
    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            endpoint: `/v1/servers/details?place_id=${placeId}&server_ids=${serverId}`
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data?.servers?.[0]?.first_seen || null;
    } catch (error) {
        return null;
    }
}

async function fetchUserPresence(userId) { 
    if (!userId) return null;
    try {
        const response = await callRobloxApi({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [parseInt(userId, 10)] }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data?.userPresences?.[0]?.rootPlaceId || data?.userPresences?.[0]?.placeId || null;
    } catch (e) {
        return null;
    } 
}

const buildInfoList = (gameId, isPrivateServer, regionCode, regionName, serverInfo, placeVersion, serverChannel, rccVersion, serverUptime, ownerInfo) => {
    const liClass = `class="rovalra-details-li"`;

    const verIcon = `<svg class="rovalra-info-icon" viewBox="0 0 24 24"><path d="M21 10.12h-6.78l2.74-2.82c-2.73-2.7-7.15-2.8-9.88-.1-2.73 2.71-2.73 7.08 0 9.79s7.15 2.71 9.88 0C18.32 15.65 19 14.08 19 12.1h2c0 1.98-.88 4.55-2.64 6.29-3.51 3.48-9.21 3.48-12.72 0-3.5-3.47-3.53-9.11-.02-12.58s9.14-3.47 12.65 0L21 3zM12.5 8v4.25l3.5 2.08-.72 1.21L11 13V8z"></path></svg>`;
    const timeIcon = `<svg class="rovalra-info-icon" viewBox="0 0 24 24"><path d="m22 5.7-4.6-3.9-1.3 1.5 4.6 3.9zM7.9 3.4 6.6 1.9 2 5.7l1.3 1.5zM12.5 8H11v6l4.7 2.9.8-1.2-4-2.4zM12 4c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9m0 16c-3.9 0-7-3.1-7-7s3.1-7 7-7 7 3.1 7 7-3.1 7-7 7"></path></svg>`;
    const rccIcon = `<svg class="rovalra-info-icon" viewBox="0 0 24 24"><path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2m0 14H3V5h18z"></path></svg>`;
    const privIcon = `<svg class="rovalra-info-icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z"></path></svg>`;
    const channelIcon = `<svg class="rovalra-info-icon" viewBox="0 0 24 24"><path d="M15 9H9v6h6zm-2 4h-2v-2h2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2zm-4 6H7V7h10z"></path></svg>`;

    const listItems = [];

    if (gameId) {
        listItems.push(`<li ${liClass}><strong>ServerID:</strong> <span class="rovalra-spoiler">${gameId}</span></li>`);
    }
    
    if (isPrivateServer) listItems.push(`<li ${liClass}>${privIcon}<strong>Private Server</strong></li>`);
    
    if (ownerInfo) {
        const ownerProfileUrl = `https://www.roblox.com/users/${ownerInfo.id}/profile`;
        const ownerIconHtml = ownerInfo.thumbnailUrl
            ? `<img src="${ownerInfo.thumbnailUrl}" style="width:16px;height:16px;border-radius:50%;margin-right:6px;vertical-align:text-bottom;" alt="Owner">`
            : `<span style="width:16px;height:16px;border-radius:50%;margin-right:6px;background-color:#555;display:inline-block;vertical-align:text-bottom;"></span>`;
        listItems.push(`<li ${liClass}>${ownerIconHtml}<strong>Owner:</strong> <a href="${ownerProfileUrl}" target="_blank" style="color: #fff; text-decoration: underline;">${ownerInfo.displayName}</a></li>`);
    }

    if (regionCode && regionName) {
        const flagCountryCode = regionCode.toLowerCase().split('-')[0];
        const flagUrl = `https://flagcdn.com/w20/${flagCountryCode}.png`;
        listItems.push(`<li ${liClass}><img src="${flagUrl}" alt="${regionCode}"> ${regionName}</li>`);
    }

    if (placeVersion) listItems.push(`<li ${liClass}>${verIcon} <strong>Version:</strong> ${placeVersion}</li>`);

    if (serverUptime) {
        const firstSeenDate = new Date(serverUptime);
        const now = new Date();
        let remainingSeconds = (now - firstSeenDate) / 1000;
        const days = Math.floor(remainingSeconds / 86400);
        remainingSeconds %= 86400;
        const hours = Math.floor(remainingSeconds / 3600);
        remainingSeconds %= 3600;
        const minutes = Math.floor(remainingSeconds / 60);
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
        listItems.push(`<li ${liClass}>${timeIcon} <strong>Uptime:</strong> ${parts.join(' ')}</li>`);
    }

    if (rccVersion) listItems.push(`<li ${liClass}>${rccIcon} <strong>RCC:</strong> ${rccVersion}</li>`);
    
    const channelText = serverChannel || "Production";

    listItems.push(`
        <li ${liClass}>
            ${channelIcon} 
            <strong>Server Channel:</strong> 
            <div class="rovalra-channel-wrapper">
                <span class="rovalra-channel-truncated">${channelText}</span>
                <span class="rovalra-channel-tooltip">${channelText}</span>
            </div>
        </li>
    `);
    
    return DOMPurify.sanitize(listItems.join(''));
};

async function pollClientStatus(targetPlaceId) {
    let clientStatusReceived = false;
    let pollingInterval = null;
    let isDownloadOptionShown = false;
    let unknownStatusCount = 0;

    const triggerSuccess = () => {
        if (!clientStatusReceived) {
            clientStatusReceived = true;
            if (pollingInterval) clearInterval(pollingInterval);
            
            showLoadingOverlayResult("Have Fun!", { 
                text: "Close", 
                onClick: () => {
                    if (pollingInterval) clearInterval(pollingInterval);
                    closeInterface(true); 
                }
            });
            cleanupListeners();
        }
    };

    const showDownloadUI = () => {
        if (document.getElementById('rovalra-download-dialog-container')) return;

        const startDownload = () => {
            window.open(`https://www.roblox.com/download/client?_=${Date.now()}`, '_blank');
        };

        startDownload();

        hideLoadingOverlay();

        const dialogWrapper = document.createElement('div');
        dialogWrapper.id = 'rovalra-download-dialog-container';
        dialogWrapper.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background-color: rgba(0,0,0,0.6);';
        // Roblox download ui
        dialogWrapper.innerHTML = DOMPurify.sanitize(`<div role="dialog" id="radix-0" aria-describedby="radix-2" aria-labelledby="radix-1" data-state="open" class="relative radius-large bg-surface-100 stroke-muted stroke-standard foundation-web-dialog-content shadow-transient-high install-dialog" data-size="Large" tabindex="-1" style="pointer-events: auto;"><div class="absolute foundation-web-dialog-close-container"><button type="button" class="foundation-web-close-affordance flex stroke-none bg-none cursor-pointer relative clip group/interactable focus-visible:outline-focus disabled:outline-none bg-over-media-100 padding-medium radius-circle" aria-label="Close"><div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div><span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-x size-[var(--icon-size-large)]"></span></button></div><div class="padding-x-xlarge padding-top-xlarge padding-bottom-xlarge content-default"><div class="flex flex-col gap-xlarge padding-xlarge"><div class="flex flex-col gap-xsmall"><h2 id="radix-1" class="text-heading-medium content-emphasis padding-none">Thanks for downloading Roblox</h2><p class="text-body-large">Just follow the steps below to install Roblox. Download should start in a few seconds. If it doesn't, <a id="rovalra-restart-download" href="#" class="download-link-underline">restart the download</a>.</p></div><div></div> <div class="flex gap-xxlarge"><section class="flex flex-col gap-large grow basis-0"><h3 class="text-title-large content-emphasis padding-none">Install Instructions</h3><ol class="download-instructions-list flex flex-col gap-xlarge margin-none padding-left-large text-body-medium"><li class="padding-left-medium">Once downloaded, double-click the <b>RobloxPlayerInstaller.exe</b> file in your Downloads folder.</li><li class="padding-left-medium">Double-click the <b>RobloxPlayerInstaller</b> to install the app.</li><li class="padding-left-medium">Follow the instructions to install Roblox to your computer.</li><li class="padding-left-medium">Now that it’s installed, <a id="download-join-experience" class="download-link-underline" style="cursor: pointer;">join the experience</a>.</li></ol></section><div></div> <div class="stroke-standard stroke-default"></div><div></div> <section class="flex flex-col grow basis-0 gap-xxlarge"><div class="flex flex-col gap-small"><h3 class="text-label-large content-emphasis padding-none">Don't forget the mobile app</h3><p class="text-body-medium">Scan this code with your phone's camera to get Roblox.</p></div><div class="flex grow justify-center items-center bg-shift-100 radius-medium padding-x-large"><div class="radius-medium padding-small bg-[white]"><img class="size-2100" src="https://images.rbxcdn.com/79852c254bf43f36.webp" alt=""></div></div></section></div></div></div></div>`, { ADD_ATTR: ['id'] });
        
        document.body.appendChild(dialogWrapper);

        const closeDialog = () => {
            dialogWrapper.remove();
            closeInterface(true);
        };

        const closeBtn = dialogWrapper.querySelector('button[aria-label="Close"]');
        if (closeBtn) closeBtn.onclick = closeDialog;

        const joinLink = dialogWrapper.querySelector('#download-join-experience');
        if (joinLink) {
            joinLink.onclick = (e) => {
                e.preventDefault();
                closeDialog();
                if (targetPlaceId) launchGame(targetPlaceId);
            };
        }

        const restartLink = dialogWrapper.querySelector('#rovalra-restart-download');
        if (restartLink) {
            restartLink.onclick = (e) => {
                e.preventDefault();
                startDownload();
            };
        }
    };

    const triggerDownloadOption = () => {
        if (!clientStatusReceived && !isDownloadOptionShown) {
            isDownloadOptionShown = true;

            showLoadingOverlayResult("Roblox not detected", {
                text: "Download Roblox",
                onClick: showDownloadUI
            });

            setTimeout(() => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.includes("Download Roblox")) {
                        const wrapper = document.createElement('div');
                        wrapper.innerHTML = DOMPurify.sanitize(`<button type="button" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-medium height-1000 padding-x-medium bg-action-emphasis content-action-emphasis grow" style="text-decoration: none;"><div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div><span class="padding-y-xsmall text-truncate-end text-no-wrap">Download Roblox</span></button>`);
                        const newBtn = wrapper.firstChild;
                        if (newBtn) {
                            newBtn.onclick = showDownloadUI;
                            btn.replaceWith(newBtn);
                        }
                        break;
                    }
                }
            }, 50);
        }
    };

    const performClientStatusCheck = async () => {
        try {
            const response = await callRobloxApi({ 
                subdomain: 'apis', 
                endpoint: '/matchmaking-api/v1/client-status', 
                method: 'GET',
                noCache: true
            });
            if (response.ok) {
                const data = await response.json();
                handleClientStatus(data);
            }
        } catch (e) {}
    };

    const handleClientStatus = (data) => {
        if (data && data.status) {
            if (data.status === 'Unknown') {
                unknownStatusCount++;
                if (unknownStatusCount >= 3) {
                    triggerDownloadOption();
                } else {
                    setTimeout(() => {
                        performClientStatusCheck();
                    }, 1000);
                }
            } else {
                unknownStatusCount = 0;
                if (isDownloadOptionShown) {
                    isDownloadOptionShown = false;
                    updateLoadingOverlayText("Joining Server...");
                }
                if (data.status === 'InGame') {
                    triggerSuccess();
                }
            }
        }
    };

    const handleGameLaunchSuccess = () => triggerSuccess();

    const cleanupListeners = () => {
        document.removeEventListener('rovalra-game-launch-success', handleGameLaunchSuccess);
        if (pollingInterval) clearInterval(pollingInterval);
    };

    document.addEventListener('rovalra-game-launch-success', handleGameLaunchSuccess);

    const currentUserElement = document.querySelector('meta[name="user-data"]');
    const currentUserId = currentUserElement ? currentUserElement.dataset.userid : null;

    if (currentUserId) {
        performClientStatusCheck();

        pollingInterval = setInterval(async () => {
            if (!document.body.classList.contains(HIDE_ROBLOX_UI_CLASS)) {
                cleanupListeners();
                return;
            }

            performClientStatusCheck();

            try {
                const resp = await callRobloxApi({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: [parseInt(currentUserId, 10)] }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const presence = data?.userPresences?.[0];
                    if (presence && (presence.userPresenceType === 2 || presence.userPresenceType === 4)) {
                        if (targetPlaceId && presence.rootPlaceId === parseInt(targetPlaceId, 10)) {
                            triggerSuccess();
                        } else if (!targetPlaceId) {
                            triggerSuccess();
                        }
                    }
                }
            } catch (e) {}
        }, 3000); 
    }
}

const customLogoId = "rovalra-custom-logo";
const targetSelectors = ["span.app-icon-bluebg.app-icon-windows.app-icon-size-96", "div.MuiGrid-root div.app-icon-bluebg.app-icon-windows", '.app-icon-windows.app-icon-bluebg'];

function applyCustomLogo(imageData, element) {
    if (element) {
        const size = (element.closest("div[role='dialog']") || element.closest(".MuiDialog-paper")) ? {width:"64px",height:"64px"} : {width:"96px",height:"96px"};
        if (element.id === customLogoId) { Object.assign(element.style, size); return; }
        const img = document.createElement("img");
        img.id = customLogoId; img.src = imageData;
        Object.assign(img.style, { ...size, objectFit: "contain" });
        element.replaceWith(img);
    }
}

function initRevertLogo() {
    chrome.storage.local.get({ revertLogo: false, customLogoData: null }, (settings) => {
        if (settings.revertLogo === true && settings.customLogoData) {
            const callback = (el) => applyCustomLogo(settings.customLogoData, el);
            targetSelectors.forEach(selector => observeElement(selector, callback));
        }
    });
}

function initializeJoinDialogEnhancer() {
    document.addEventListener('rovalra-game-servers-response', (event) => {
        const { data } = event.detail;
        if (data && data.data && Array.isArray(data.data) && currentGameId) {
            const server = data.data.find(s => s.id === currentGameId);
            if (server) {
                interceptedServerData = { playing: server.playing, maxPlayers: server.maxPlayers, fps: server.fps, ping: server.ping };
            }
        }
    });

    chrome.storage.local.get({ whatamIJoiningEnabled: true, AlwaysGetInfo: false, customLogoData: null, revertLogo: false }, (settings) => {
        
        const processGameLaunchData = async (gameLaunchFrame) => {
            gameLaunchElementExists = true;
            const gameLaunchSrc = gameLaunchFrame?.src;

            if (!gameLaunchSrc || !gameLaunchSrc.includes('placelauncherurl:') || gameLaunchSrc === lastProcessedGameLaunchSrc) return;
            
            lastProcessedGameLaunchSrc = gameLaunchSrc;
            currentGameId = null;
            interceptedServerData = null;

            const logoToUse = (settings.revertLogo === true && settings.customLogoData) ? settings.customLogoData : null;

            openInterface(() => {
                lastProcessedGameLaunchSrc = null;
            }, logoToUse);

            let urlParams;
            let placeId;
            try {
                const urlString = gameLaunchSrc.substring(gameLaunchSrc.indexOf('placelauncherurl:'));
                const decodedUrlString = decodeURIComponent(urlString.split('+')[0].substring(17));
                urlParams = new URLSearchParams(new URL(decodedUrlString).search);
                placeId = urlParams.get('placeId');
            } catch (e) {
                showLoadingOverlayResult("Error parsing URL", { text: "Close", onClick: () => closeInterface(true) });
                return;
            }

            if (!placeId && urlParams.get('request') === 'RequestFollowUser') {
                const userId = urlParams.get('userId');
                if (userId) {
                    updateLoadingOverlayText("Finding user...");
                    placeId = await fetchUserPresence(userId);
                } 
            }

            let gameDetailsPromise = Promise.resolve({ name: "Roblox Experience", iconUrl: null });
            if(placeId) {
                gameDetailsPromise = fetchGameDetails(placeId);
            }

            const requestType = urlParams.get('request');
            const isRequestGame = requestType === 'RequestGame' || requestType === 'RequestGameJob';
            
            const hasGameId = urlParams.has('gameId');
            const hasAccessCode = urlParams.has('accessCode');
            const isGenericJoin = isRequestGame && !hasGameId && !hasAccessCode;
            const isPrivateServer = requestType === 'RequestPrivateGame';
            const isFollowingUser = requestType === 'RequestFollowUser';

            if (hasGameId) {
                currentGameId = urlParams.get('gameId');
            }

            let joinApiResponse = null;

            if (settings.AlwaysGetInfo) {
                updateLoadingOverlayText("Fetching server info..."); 
                try {
                    await ensureDatacenterDataIsParsed();

                    let retries = 0;
                    const MAX_RETRIES = 5; 

                    while (!joinApiResponse && document.body.classList.contains(HIDE_ROBLOX_UI_CLASS) && retries < MAX_RETRIES) {
                        retries++;
                        
                        try {
                            let response = null;
                            const apiBody = { gameJoinAttemptId: crypto.randomUUID(), placeId: parseInt(placeId, 10) };

                            if (isGenericJoin) {
                                response = await callRobloxApi({
                                    subdomain: 'gamejoin', endpoint: '/v1/join-game', method: 'POST', body: apiBody
                                });
                            }
                            else if (isPrivateServer) {
                                const accessCode = urlParams.get('accessCode');
                                const linkCode = urlParams.get('linkCode') || "";
                                response = await callRobloxApi({
                                    subdomain: 'gamejoin', endpoint: '/v1/join-private-game', method: 'POST', 
                                    body: { ...apiBody, accessCode, linkCode, isTeleport: false }
                                });
                            }
                            else if (isFollowingUser) {
                                const userIdToFollow = urlParams.get('userId');
                                response = await callRobloxApi({
                                    subdomain: 'gamejoin', endpoint: '/v1/play-with-user', method: 'POST', 
                                    body: { userIdToFollow: parseInt(userIdToFollow, 10) }
                                });
                            }
                            else if (currentGameId) {
                                response = await callRobloxApi({
                                    subdomain: 'gamejoin', endpoint: '/v1/join-game-instance', method: 'POST', 
                                    body: { ...apiBody, gameId: currentGameId }
                                });
                            }

                            if (response && response.ok) {
                                const data = await response.json();

                                if (data?.status === 12 || (data?.message && data.message.includes("non-root place"))) {
                                    showLoadingOverlayResult(data.message || "Cannot join: Non-root place restrictions.", { 
                                        text: "Close", 
                                        onClick: () => closeInterface(true) 
                                    });
                                    return; 
                                }

                                if (data?.joinScript) {
                                    joinApiResponse = data;
                                    break;
                                }
                            }
                        } catch (innerErr) {
                            console.error("Join API attempt failed:", innerErr);
                        }

                        if (!joinApiResponse && retries < MAX_RETRIES) {
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    if (joinApiResponse?.joinScript?.GameId) {
                        currentGameId = joinApiResponse.joinScript.GameId;
                    }

                } catch (e) {
                    console.error("Error in server info fetch loop:", e);
                }
            }

            if (!document.body.classList.contains(HIDE_ROBLOX_UI_CLASS)) {
                return;
            }

            try {
                const joinScript = joinApiResponse?.joinScript;
                let regionCode, regionName, ownerInfo, serverUptime;

                if (joinScript) {
                    const resolvedGameId = joinScript.GameId || currentGameId;
                    
                    if (joinScript.PrivateServerOwnerID) {
                        try {
                            const ownerId = joinScript.PrivateServerOwnerID;
                            const [uData, thumbMap] = await Promise.all([
                                callRobloxApi({ subdomain: 'users', endpoint: '/v1/users', method: 'POST', body: { userIds: [ownerId] } }).then(r=>r.json()),
                                fetchThumbnails([{ id: ownerId }], 'AvatarHeadshot', '48x48', false)
                            ]);
                            const thumbData = thumbMap.get(ownerId);
                            if (uData?.data?.[0]) {
                                ownerInfo = { 
                                    id: uData.data[0].id, 
                                    displayName: uData.data[0].displayName, 
                                    thumbnailUrl: thumbData?.imageUrl || null
                                };
                            }
                        } catch(e) {}
                    }

                    const dataCenterId = joinScript.DataCenterId;
                    if (dataCenterId && serverIpMap[dataCenterId]) {
                        const loc = serverIpMap[dataCenterId];
                        regionCode = loc.country;
                        regionName = loc.region ? `${loc.city}, ${loc.region}` : loc.city;
                    }

                    if (resolvedGameId) {
                        serverUptime = await fetchServerUptime(placeId, resolvedGameId);
                    }
                
                    const htmlDetails = buildInfoList(resolvedGameId, isPrivateServer, regionCode, regionName, interceptedServerData, joinScript.PlaceVersion, joinScript.ChannelName, joinScript.RccVersion, serverUptime, ownerInfo);

                    const gameDetails = await gameDetailsPromise;
                    updateServerInfo(gameDetails.name, gameDetails.iconUrl, htmlDetails);
                    updateLoadingOverlayText(`Joining Server...`);
                } 
                else {
                    if (currentGameId) {
                        serverUptime = await fetchServerUptime(placeId, currentGameId);
                    }
                    const htmlDetails = buildInfoList(currentGameId, isPrivateServer, null, null, interceptedServerData, null, null, null, serverUptime, null);
                    
                    const details = await gameDetailsPromise;
                    updateServerInfo(details.name, details.iconUrl, htmlDetails);
                    updateLoadingOverlayText(`Waiting for Roblox...`);
                }

                pollClientStatus(placeId);

            } catch (e) {
                console.error("Rendering error:", e);
                const details = await gameDetailsPromise;
                updateServerInfo(details.name, details.iconUrl, null);
                updateLoadingOverlayText(`Launching...`);
                pollClientStatus(placeId);
            }
        };

        if (!settings.whatamIJoiningEnabled) return;

        observeElement('#gamelaunch', processGameLaunchData, { 
            observeAttributes: true,
            onRemove: () => { gameLaunchElementExists = false; }
        });
    });
}

function initialize() {
    try {
        initRevertLogo();
        initializeJoinDialogEnhancer();
    } catch (e) { }
}

export function init() {
    closeInterface(true);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}