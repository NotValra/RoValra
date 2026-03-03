import { callRobloxApiJson, callRobloxApi } from '../../../core/api.js';
import DOMPurify from 'dompurify';
import { observeElement } from '../../../core/observer.js';
import { fetchThumbnails, createThumbnailElement } from '../../../core/thumbnail/thumbnails.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { formatPlayerCount } from '../../../core/games/playerCount.js';
import { safeHtml } from '../../../core/packages/dompurify.js';
import { performJoinAction, getSavedPreferredRegion } from '../../../core/preferredregion.js';
import { launchGame } from '../../../core/utils/launcher.js';
import { getAssets } from '../../../core/assets.js';

let lastValue = "";        
let lastSearchedQuery = ""; 
let searchAbortController = null;
const assets = getAssets();

async function fetchWithRetry(options, retries = 3) {
    try {
        const response = await callRobloxApi(options);
        if (response.status === 429) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return fetchWithRetry(options, retries - 1);
            }
        }
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        return await response.json();
    } catch (e) {
        if (retries > 0 && e.name !== 'AbortError') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchWithRetry(options, retries - 1);
        }
        throw e;
    }
}

async function performSearch(query) {
    if (!query || query.length < 2) {
        window._lastRoValraUserResult = null;
        window._lastRoValraGameResult = null;
        lastSearchedQuery = "";
        const menu = document.querySelector('ul.new-dropdown-menu');
        if (menu) {
            menu.querySelectorAll('.rovalra-quick-search-result').forEach(el => el.remove());
        }
        if (searchAbortController) {
            searchAbortController.abort();
        }
        return;
    }
    
    if (query === lastSearchedQuery) {

        injectExistingResult(); 
        return;
    }

    lastSearchedQuery = query;

    if (searchAbortController) {
        searchAbortController.abort();
    }
    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;

    const authedUserId = await getAuthenticatedUserId();
    if (signal.aborted) return;

    try {
        const [userSearchData, gameSearchData, settings] = await Promise.all([
            fetchWithRetry({
                subdomain: 'users',
                endpoint: '/v1/usernames/users',
                method: 'POST',
                body: {
                    usernames: [query],
                    excludeBannedUsers: false
                },
                signal
            }),
            fetchWithRetry({
                subdomain: 'apis',
                endpoint: `/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionid=${authedUserId}&pageType=Game`,
                signal
            }),
            new Promise(resolve => chrome.storage.local.get(['PreferredRegionEnabled'], resolve))
        ]);

        if (signal.aborted) return;
 
        // Clear previous results before populating new ones
        window._lastRoValraUserResult = null;
        window._lastRoValraGameResult = null;

        const userResult = userSearchData?.data?.[0];
        if (userResult) {
            if (signal.aborted) return;
            const [userThumbnailMap, presenceData] = await Promise.all([
                fetchThumbnails([{ id: userResult.id }], 'AvatarHeadshot', '48x48'),
                fetchWithRetry({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: [userResult.id] },
                    signal
                })
            ]);
            if (signal.aborted) return;
            const userThumbData = userThumbnailMap.get(userResult.id);
            const userPresence = presenceData?.userPresences?.[0];
            window._lastRoValraUserResult = createUserResultHtml(userResult, userThumbData, userPresence);
        }

        const gameResult = gameSearchData?.searchResults?.find(r => r.contentGroupType === 'Game' && r.contents?.length > 0);
        if (gameResult) {
        const game = gameResult.contents[0];
 
        if (signal.aborted) return;
        const [thumbnailMap, votesData] = await Promise.all([
            fetchThumbnails([{ id: game.universeId }], 'GameIcon', '50x50'),
            fetchWithRetry({
                subdomain: 'games',
                endpoint: `/v1/games/votes?universeIds=${game.universeId}`,
                signal
            })
        ]);
 
        if (signal.aborted) return;
        const voteInfo = votesData.data && votesData.data[0] ? votesData.data[0] : { upVotes: 0, downVotes: 0 };
        const totalVotes = voteInfo.upVotes + voteInfo.downVotes;
        const voteRatio = totalVotes > 0 ? Math.floor((voteInfo.upVotes / totalVotes) * 100) : 0;
 
        const thumbData = thumbnailMap.get(game.universeId);
        const thumbnailUrl = thumbData?.state === 'Completed' ? thumbData.imageUrl : '';
        const playerCount = formatPlayerCount(game.playerCount || 0);

            window._lastRoValraGameResult = createResultHtml(game, thumbnailUrl, playerCount, voteRatio, totalVotes, settings);
        }

        injectIntoMenu();
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('RoValra: Search Error', e);
    }
}

function createUserResultHtml(user, thumbData, presence) {
    const li = document.createElement('li');
    li.className = 'navbar-search-option rbx-clickable-li improved-search rovalra-quick-search-result';

    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        gap: '12px',
        maxHeight: "56px"
    });

    const link = document.createElement('a');
    link.href = `https://www.roblox.com/users/${user.id}/profile`;
    Object.assign(link.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        textDecoration: 'none',
        color: 'inherit',
        flex: '1',
        minWidth: '0'
    });

    const thumbContainer = document.createElement('span');
    thumbContainer.className = 'thumbnail-2d-container';
    Object.assign(thumbContainer.style, {
        position: 'relative',
        height: '48px',
        width: '48px',
        borderRadius: '50%',
        flexShrink: '0',
        overflow: 'visible'
    });

    const thumbEl = createThumbnailElement(thumbData, user.displayName, 'avatar-card-image', {
        height: '100%',
        width: '100%',
        borderRadius: '50%'
    });
    thumbContainer.appendChild(thumbEl);

    if (presence) {
        let presenceClass = '';
        let presenceColor = '';

        if (presence.userPresenceType === 1) { // Online
            presenceClass = 'online';
            presenceColor = 'rgb(0, 162, 255)';
        } else if (presence.userPresenceType === 2) { // In Game
            presenceClass = 'ingame';
            presenceColor = 'rgb(2, 183, 87)';
        } else if (presence.userPresenceType === 3) { // In Studio
            presenceClass = 'ingame';
            presenceColor = 'rgb(246, 136, 2)';
        }

        if (presenceClass) {
            const presenceIndicator = document.createElement('span');
            presenceIndicator.className = presenceClass;
            presenceIndicator.setAttribute('data-testid', 'presence-icon');
            Object.assign(presenceIndicator.style, {
                position: 'absolute', 
                bottom: '0px', 
                right: '0px', 
                width: '12px', 
                height: '12px', 
                backgroundColor: presenceColor,
                borderRadius: '50%',
                border: '2px solid var(--rovalra-container-background-color)'
            });
            thumbContainer.appendChild(presenceIndicator);
        }
    }

    const infoDiv = document.createElement('div');
    Object.assign(infoDiv.style, {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
        width: '100%'
    });

    const displayNameDiv = document.createElement('div');
    displayNameDiv.className = 'game-card-name';
    displayNameDiv.title = user.displayName;
    Object.assign(displayNameDiv.style, {
        fontSize: '16px',
        fontWeight: '500',
        color: 'var(--rovalra-main-text-color)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'flex',
        alignItems: 'center'
    });

    const displayNameSpan = document.createElement('span');
    displayNameSpan.textContent = user.displayName;
    Object.assign(displayNameSpan.style, {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    });
    displayNameDiv.appendChild(displayNameSpan);

    const secondaryInfoDiv = document.createElement('div');
    secondaryInfoDiv.className = 'game-card-info';
    Object.assign(secondaryInfoDiv.style, {
        fontSize: '12px',
        color: 'var(--rovalra-secondary-text-color)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    });
    secondaryInfoDiv.textContent = (presence && presence.userPresenceType === 2 && presence.lastLocation)
        ? `Playing ${presence.lastLocation}`
        : `@${user.name}`;

    infoDiv.appendChild(displayNameDiv);
    infoDiv.appendChild(secondaryInfoDiv);

    link.appendChild(thumbContainer);
    link.appendChild(infoDiv);

    if (user.hasVerifiedBadge) {
        if (displayNameDiv) {
            const badge = document.createElement('img');
            badge.src = assets.verifiedBadge;
            badge.alt = "Verified Badge";
            badge.title = "Verified";
            Object.assign(badge.style, { width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'middle', marginLeft: '5px', flexShrink: '0' });
            displayNameDiv.appendChild(badge);
        }
    }

    container.appendChild(link);

    if (presence && presence.userPresenceType === 2 && presence.gameId) {
        const buttonsContainer = document.createElement('div');
        Object.assign(buttonsContainer.style, {
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            flexShrink: '0',
            paddingRight: '12px'
        });

        const playBtn = document.createElement('button');
        playBtn.innerHTML = `<span class="icon-common-play" style="width: 30px; height: 30px; display: inline-block;"></span>`;
        Object.assign(playBtn.style, {
            backgroundColor: 'var(--rovalra-playbutton-color)',
            border: 'none',
            borderRadius: '8px',
            width: '36px',
            height: '36px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s',
            flexShrink: '0'
        });

        playBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            launchGame(presence.rootPlaceId, presence.gameId);
        };
        buttonsContainer.appendChild(playBtn);
        container.appendChild(buttonsContainer);
    }

    li.appendChild(container);
    return li;
}
 
function createResultHtml(game, thumbnailUrl, playerCount, voteRatio, totalVotes, settings) {
    const li = document.createElement('li');
    li.className = 'navbar-search-option rbx-clickable-li improved-search rovalra-quick-search-result';
 
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        gap: '12px',
        maxHeight: "56px"
    });

    const link = document.createElement('a');
    link.className = 'new-navbar-search-anchor';
    link.href = `https://www.roblox.com/games/${game.rootPlaceId}/yep`;
    Object.assign(link.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: '1',
        minWidth: '0',
        textDecoration: 'none',
        color: 'inherit'
    });

    const votePercentageClass = totalVotes > 0 ? '' : 'hidden';
    const noVoteClass = totalVotes === 0 ? '' : 'hidden';
 
    link.innerHTML = safeHtml`
        <span class="thumbnail-2d-container" style="height: 48px; width: 48px; border-radius: 8px; flex-shrink: 0;">
            <img src="${thumbnailUrl}" style="height: 100%; width: 100%; border-radius: 8px;">
        </span>
        <div style="display: flex; flex-direction: column; justify-content: center; overflow: hidden; width: 100%;">
            <div class="game-card-name" title="${game.name}" style="font-size: 16px; font-weight: 500; color: var(--rovalra-main-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${game.name}</div>
            <div class="game-card-info" style="display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; color: var(--rovalra-secondary-text-color);">
                <span class="info-label icon-votes-gray"></span>
                <span class="info-label vote-percentage-label ${votePercentageClass}">${voteRatio}%</span>
                <span class="info-label no-vote ${noVoteClass}"></span>
                <span class="info-label icon-playing-counts-gray" style="margin-left: 8px;"></span>
                <span class="info-label playing-counts-label">${playerCount}</span>
            </div>
        </div>
    `, { ADD_ATTR: ['style', 'class', 'href', 'title'] };

    const buttonsContainer = document.createElement('div');
    Object.assign(buttonsContainer.style, {
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        flexShrink: '0',
        paddingRight: '12px'
        
    });

    if (settings && settings.PreferredRegionEnabled) {
        const regionBtn = document.createElement('button');
        regionBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19.3 16.9c.4-.7.7-1.5.7-2.4 0-2.5-2-4.5-4.5-4.5S11 12 11 14.5s2 4.5 4.5 4.5c.9 0 1.7-.3 2.4-.7l3.2 3.2 1.4-1.4zm-3.8.1c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5M12 20v2C6.48 22 2 17.52 2 12S6.48 2 12 2c4.84 0 8.87 3.44 9.8 8h-2.07c-.64-2.46-2.4-4.47-4.73-5.41V5c0 1.1-.9 2-2 2h-2v2c0 .55-.45 1-1 1H8v2h2v3H9l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.41 3.59 8 8 8"></path></svg>`;
        Object.assign(regionBtn.style, {
            backgroundColor: 'var(--rovalra-playbutton-color)',
            border: 'none',
            borderRadius: '8px',
            width: '36px',
            height: '36px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'filter 0.2s',
            flexShrink: '0'
        });

        regionBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const region = await getSavedPreferredRegion();
            performJoinAction(game.rootPlaceId, game.universeId, region === 'AUTO' ? null : region);
        };
        buttonsContainer.appendChild(regionBtn);
    }

    const playBtn = document.createElement('button');
    playBtn.innerHTML = `<span class="icon-common-play" style="width: 30px; height: 30px; display: inline-block;"></span>`;
    Object.assign(playBtn.style, {
        backgroundColor: 'var(--rovalra-playbutton-color)',
        border: 'none',
        borderRadius: '8px',
        width: '36px',
        height: '36px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.2s',
        flexShrink: '0'
    });

    playBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        launchGame(game.rootPlaceId);
    };
    buttonsContainer.appendChild(playBtn);

    container.appendChild(link);
    container.appendChild(buttonsContainer);
    li.appendChild(container);
    return li;
}

function injectIntoMenu() {
    const menu = document.querySelector('ul.new-dropdown-menu');
    if (!menu) return;

    menu.querySelectorAll('.rovalra-quick-search-result').forEach(el => el.remove());
    
    if (window._lastRoValraGameResult) {
        menu.prepend(window._lastRoValraGameResult);
    }
    if (window._lastRoValraUserResult) {
        menu.prepend(window._lastRoValraUserResult);
    }
}

function injectExistingResult() {
    const menu = document.querySelector('ul.new-dropdown-menu');
    if (menu && !menu.querySelector('.rovalra-quick-search-result')) {
        if (window._lastRoValraGameResult) {
            menu.prepend(window._lastRoValraGameResult);
        }
        if (window._lastRoValraUserResult) {
            menu.prepend(window._lastRoValraUserResult);
        }
    }
}

function checkValue(input) {
    const currentVal = (input.value || "").trim();
    
    if (currentVal !== lastValue) {
        lastValue = currentVal; 
        
        performSearch(currentVal);
    }
}

export function init() {
    const seeker = setInterval(() => {
        const input = document.getElementById('navbar-search-input');
        if (input) {
            clearInterval(seeker);
            
            input.addEventListener('input', () => checkValue(input));

            setInterval(() => checkValue(input), 500);

            observeElement('ul.new-dropdown-menu', () => {
                injectExistingResult();
            });
        }
    }, 500);
}