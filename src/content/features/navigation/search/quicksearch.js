import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { fetchThumbnails, createThumbnailElement } from '../../../core/thumbnail/thumbnails.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { formatPlayerCount } from '../../../core/games/playerCount.js';
import { safeHtml } from '../../../core/packages/dompurify.js';
import { performJoinAction, getSavedPreferredRegion } from '../../../core/preferredregion.js';
import { launchGame } from '../../../core/utils/launcher.js';
import { getAssets } from '../../../core/assets.js';
import { createPill } from '../../../core/ui/general/pill.js';

let lastSearchedQuery = ""; 
let searchAbortController = null;
const assets = getAssets();
const STORAGE_KEY = 'rovalra_search_history';
const MAX_HISTORY = 50;
let initialSearchValue = "";

const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

let cachedFriendsData = null;
let friendsFetchPromise = null;
let cachedUserId = null;

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
        window._lastRoValraFriendResults = [];
        lastSearchedQuery = "";
        const menu = document.querySelector('ul.new-dropdown-menu');
        if (menu) {
            menu.querySelectorAll('.rovalra-quick-search-result').forEach(el => el.remove());
        }
        if (searchAbortController) {
            searchAbortController.abort('Query too short');
        }
        return;
    }
    
    if (query === lastSearchedQuery) {

        injectExistingResult(); 
        return;
    }

    lastSearchedQuery = query;

    if (searchAbortController) {
        searchAbortController.abort('New search started');
    }
    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;

    try {
        const authedUserId = await getAuthenticatedUserId();
        if (signal.aborted) return;

        if (cachedUserId !== authedUserId) {
            cachedFriendsData = null;
            friendsFetchPromise = null;
            cachedUserId = authedUserId;
        }

        let friendsPromise;
        if (cachedFriendsData) {
            friendsPromise = Promise.resolve(cachedFriendsData);
        } else if (friendsFetchPromise) {
            friendsPromise = friendsFetchPromise;
        } else {
            friendsFetchPromise = fetchWithRetry({
                subdomain: 'friends',
                endpoint: `/v1/users/${authedUserId}/friends/online`,
                signal
            }).then(data => {
                cachedFriendsData = data;
                return data;
            }).catch(e => {
                friendsFetchPromise = null;
                if (e.name === 'AbortError') throw e;
                return { data: [] };
            });
            friendsPromise = friendsFetchPromise;
        }

        const [userSearchData, gameSearchData, settings, friendsData, friendSearchData] = await Promise.all([
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
            new Promise(resolve => chrome.storage.local.get(['PreferredRegionEnabled'], resolve)),
            friendsPromise,
            fetchWithRetry({
                subdomain: 'friends',
                endpoint: `/v1/users/${authedUserId}/friends/search?limit=5&userSort=FriendScore&query=${encodeURIComponent(query)}`,
                signal
            })
        ]);

        if (signal.aborted) return;
 
        // Clear previous results before populating new ones
        window._lastRoValraUserResult = null;
        window._lastRoValraGameResult = null;
        window._lastRoValraFriendResults = [];

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

        if (friendSearchData?.PageItems) {
            const friendIds = friendSearchData.PageItems.map(f => f.id);
            if (friendIds.length > 0) {
                const uniqueFriendIds = userResult ? friendIds.filter(id => id !== userResult.id) : friendIds;

                if (uniqueFriendIds.length > 0) {
                    const [usersData, presenceData] = await Promise.all([
                        fetchWithRetry({
                            subdomain: 'users',
                            endpoint: '/v1/users',
                            method: 'POST',
                            body: { userIds: uniqueFriendIds, excludeBannedUsers: false },
                            signal
                        }),
                        fetchWithRetry({
                            subdomain: 'presence',
                            endpoint: '/v1/presence/users',
                            method: 'POST',
                            body: { userIds: uniqueFriendIds },
                            signal
                        })
                    ]);

                    if (signal.aborted) return;

                    const users = usersData?.data || [];
                    const presences = presenceData?.userPresences || [];
                    const presenceMap = new Map(presences.map(p => [p.userId, p]));

                    if (users.length > 0) {
                        const thumbnailMap = await fetchThumbnails(users.map(u => ({ id: u.id })), 'AvatarHeadshot', '48x48');
                        if (signal.aborted) return;

                        window._lastRoValraFriendResults = users.map(friendUser => {
                            const thumbData = thumbnailMap.get(friendUser.id);
                            const presence = presenceMap.get(friendUser.id);
                            return createUserResultHtml(friendUser, thumbData, presence);
                        });
                    }
                }
            }
        }

        const gameResult = gameSearchData?.searchResults?.find(r => r.contentGroupType === 'Game' && r.contents?.length > 0);
        if (gameResult) {
        const game = gameResult.contents[0];
        const friendPlaying = friendsData?.data?.find(f => f.userPresence?.universeId === game.universeId);
 
        if (signal.aborted) return;
        const promises = [
            fetchThumbnails([{ id: game.universeId }], 'GameIcon', '50x50'),
            fetchWithRetry({
                subdomain: 'games',
                endpoint: `/v1/games/votes?universeIds=${game.universeId}`,
                signal
            })
        ];

        if (friendPlaying) {
            promises.push(fetchThumbnails([{ id: friendPlaying.id }], 'AvatarHeadshot', '48x48'));
            promises.push(fetchWithRetry({
                subdomain: 'users',
                endpoint: `/v1/users/${friendPlaying.id}`,
                signal
            }).catch(e => {
                if (e.name === 'AbortError') throw e;
                return null;
            }));
        }

        const results = await Promise.all(promises);
        const thumbnailMap = results[0];
        const votesData = results[1];
 
        if (signal.aborted) return;
        const voteInfo = votesData.data && votesData.data[0] ? votesData.data[0] : { upVotes: 0, downVotes: 0 };
        const totalVotes = voteInfo.upVotes + voteInfo.downVotes;
        const voteRatio = totalVotes > 0 ? Math.floor((voteInfo.upVotes / totalVotes) * 100) : 0;
 
        const thumbData = thumbnailMap.get(game.universeId);
        const thumbnailUrl = thumbData?.state === 'Completed' ? thumbData.imageUrl : '';
        const playerCount = formatPlayerCount(game.playerCount || 0);

        let friendInfo = null;
        if (friendPlaying && results[2]) {
            const friendThumbMap = results[2];
            const friendUserData = results[3];
            const fThumb = friendThumbMap.get(friendPlaying.id);
            if (fThumb && fThumb.state === 'Completed') {
                friendInfo = {
                    id: friendPlaying.id,
                    name: friendUserData ? (friendUserData.displayName || friendUserData.name) : 'Friend',
                    thumbnailUrl: fThumb.imageUrl
                };
            }
        }

            window._lastRoValraGameResult = createResultHtml(game, thumbnailUrl, playerCount, voteRatio, totalVotes, settings, friendInfo);
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
 
function createResultHtml(game, thumbnailUrl, playerCount, voteRatio, totalVotes, settings, friendInfo) {
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

    if (friendInfo) {
        const friendContainer = document.createElement('div');
        Object.assign(friendContainer.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '6px',
            flexShrink: '0'
        });

        const friendLink = document.createElement('a');
        friendLink.href = `https://www.roblox.com/users/${friendInfo.id}/profile`;
        friendLink.title = friendInfo.name;
        Object.assign(friendLink.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            flexShrink: '0'
        });
        
        friendLink.onclick = (e) => e.stopPropagation();

        const friendThumb = document.createElement('img');
        friendThumb.src = friendInfo.thumbnailUrl;
        friendThumb.alt = friendInfo.name;
        Object.assign(friendThumb.style, {
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '1px solid var(--rovalra-border-color)'
        });
        
        friendLink.appendChild(friendThumb);
        friendContainer.appendChild(friendLink);
        container.appendChild(friendContainer);
    }

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
    if (window._lastRoValraFriendResults && window._lastRoValraFriendResults.length > 0) {
        window._lastRoValraFriendResults.slice().reverse().forEach(friendResult => {
            menu.prepend(friendResult);
        });
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
        if (window._lastRoValraFriendResults && window._lastRoValraFriendResults.length > 0) {
            window._lastRoValraFriendResults.slice().reverse().forEach(friendResult => {
                menu.prepend(friendResult);
            });
        }
        if (window._lastRoValraUserResult) {
            menu.prepend(window._lastRoValraUserResult);
        }
    }
}

async function getHistory() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
}

async function addSearchTerm(term) {
    if (!term || !term.trim()) return;
    const cleanTerm = term.trim();
    let history = await getHistory();
    history = history.filter(t => t.toLowerCase() !== cleanTerm.toLowerCase());
    history.unshift(cleanTerm);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    await chrome.storage.local.set({ [STORAGE_KEY]: history });
}

async function renderSearchHistory(container) {
    if (container.querySelector('.rovalra-search-history-section')) return;
    const history = await getHistory();

    const section = document.createElement('div');
    section.className = 'game-sort-header-container rovalra-search-history-section';
    section.style.marginTop = '20px';
    
    section.innerHTML = `
        <div class="container-header">
            <h2 class="sort-header"><span>Search History</span></h2>
        </div>
        <div class="rovalra-history-list" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 0;"></div>
    `;

    const list = section.querySelector('.rovalra-history-list');
    
    if (history.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-secondary';
        emptyMsg.textContent = "You don't have any search history.";
        emptyMsg.style.paddingLeft = '12px';
        list.appendChild(emptyMsg);
    } else {
        history.forEach(term => {
            const pill = createPill(term, null, { isButton: true });
            pill.addEventListener('click', () => {
                const input = document.getElementById('navbar-search-input');
                if (input) {
                    input.value = term;
                    input.focus();
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            list.appendChild(pill);
        });
    }

    container.appendChild(section);
}

export function init() {
    const debouncedSearch = debounce(performSearch, 150);

    const seeker = setInterval(() => {
        const input = document.getElementById('navbar-search-input');
        if (input) {
            clearInterval(seeker);
            initialSearchValue = input.value;
            
            input.addEventListener('input', () => {
                const currentVal = (input.value || "").trim();
                debouncedSearch(currentVal);
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = input.value;
                    if (val !== initialSearchValue) {
                        addSearchTerm(val);
                        initialSearchValue = val;
                    }
                }
            });

            observeElement('ul.new-dropdown-menu', () => {
                injectExistingResult();
            });

            observeElement('section[data-testid="SearchLandingPageOmniFeedTestId"]', (container) => {
                renderSearchHistory(container);
            });
        }
    }, 500);
}