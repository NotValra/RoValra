import { callRobloxApi } from '../../../core/api.js';
import { observeElement, observeIntersection, observeResize } from '../../../core/observer.js';
import { fetchThumbnails, createThumbnailElement } from '../../../core/thumbnail/thumbnails.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { formatPlayerCount } from '../../../core/games/playerCount.js';
import { safeHtml } from '../../../core/packages/dompurify.js';
import { performJoinAction, getSavedPreferredRegion } from '../../../core/preferredregion.js';
import { launchGame, followUser } from '../../../core/utils/launcher.js';
import { getAssets } from '../../../core/assets.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { getFullRegionName, getRegionData } from '../../../core/regions.js';
import { createScrollButtons } from '../../../core/ui/general/scrollButtons.js';
import { showFriendListOverlay } from '../../../core/ui/games/friendListOverlay.js';
import { showConfirmationPrompt } from '../../../core/ui/confirmationPrompt.js';
import { log, logLevel } from '../../../core/logging.js';

let lastSearchedQuery = ""; 
let userSearchAbortController = null;
let gameSearchAbortController = null;
const userCache = new Map();
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

let searchSettings = {
    quickSearchEnabled: true,
    userSearchEnabled: true,
    gameSearchEnabled: true,
    friendSearchEnabled: true,
    searchHistoryEnabled: true
};

function updateSearchSettings() {
    chrome.storage.local.get(['quickSearchEnabled', 'userSearchEnabled', 'gameSearchEnabled', 'friendSearchEnabled', 'searchHistoryEnabled'], (result) => {
        if (result) Object.assign(searchSettings, result);
    });
}

async function fetchWithRetry(options, retries = 3, signal = null) {
    try {
        if (signal) options.signal = signal;
        
        const response = await callRobloxApi(options);
        if (response.status === 499) {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            throw abortError;
        }
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
            return fetchWithRetry(options, retries - 1, signal);
        }
        throw e;
    }
}

async function performUserSearch(query) {
    if (userSearchAbortController) {
        userSearchAbortController.abort();
    }
    userSearchAbortController = new AbortController();
    const signal = userSearchAbortController.signal;

    try {
        const authedUserId = await getAuthenticatedUserId();
        if (signal.aborted) return;

        const promises = [];
        if (searchSettings.userSearchEnabled && query.length >= 2) {
            promises.push(fetchWithRetry({
                subdomain: 'users',
                endpoint: '/v1/usernames/users',
                method: 'POST',
                body: {
                    usernames: [query],
                    excludeBannedUsers: false
                }
            }, 3, signal));
        } else {
            promises.push(Promise.resolve(null));
        }

        const localFriendsPromise = new Promise(resolve => {
            chrome.storage.local.get(['rovalra_friends_data'], (result) => {
                if (!searchSettings.friendSearchEnabled) {
                    resolve([]);
                    return;
                }

                const friendsData = result.rovalra_friends_data?.[authedUserId];
                if (!friendsData?.friendsList) {
                    resolve([]);
                    return;
                }
                const lowerQuery = query.toLowerCase();
                const matches = friendsData.friendsList.filter(f => 
                    (f.username && f.username.toLowerCase().includes(lowerQuery)) || 
                    (f.displayName && f.displayName.toLowerCase().includes(lowerQuery)) ||
                    (f.combinedName && f.combinedName.toLowerCase().includes(lowerQuery))
                );
                resolve(matches.slice(0, 5));
            });
        });
        promises.push(localFriendsPromise);

        localFriendsPromise.then(async (localFriends) => {
            if (signal.aborted) return;
            
            if (localFriends.length > 0) {
                const validUsers = localFriends.map(f => ({
                    id: f.id,
                    name: f.username,
                    displayName: f.combinedName,
                    hasVerifiedBadge: f.isVerified,
                    isBanned: f.isDeleted,
                    isTrusted: f.isTrusted
                }));

                const thumbnailMap = await fetchThumbnails(validUsers.map(u => ({ id: u.id })), 'AvatarHeadshot', '48x48', false, signal);
                if (signal.aborted) return;

                const presencePromise = fetchWithRetry({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: validUsers.map(u => u.id) }
                }, 3, signal).catch(() => null);

                const [presenceData] = await Promise.all([presencePromise]);
                if (signal.aborted) return;

                const presences = presenceData?.userPresences || [];
                const presenceMap = new Map(presences.map(p => [p.userId, p]));

                window._lastRoValraFriendResults = validUsers.map(friendUser => {
                    if (window._lastRoValraUserResult && window._lastRoValraUserResult.dataset.userId == friendUser.id) {
                        return null;
                    }
                    const thumbData = thumbnailMap.get(friendUser.id);
                    const presence = presenceMap.get(friendUser.id);
                    return createUserResultHtml(friendUser, thumbData, presence, true, friendUser.isTrusted);
                }).filter(el => el !== null);
            } else {
                window._lastRoValraFriendResults = [];
            }
            injectIntoMenu();
        }).catch(e => {
            if (e.name !== 'AbortError') log(logLevel.ERROR, 'RoValra: Friend Search Error', e);
        });

        const [userSearchData, localFriends] = await Promise.all(promises);

        if (signal.aborted) return;

        const userResult = userSearchData?.data?.[0];
        const friendIdsFromSearch = localFriends.map(f => f.id);
        let userResultIsFriend = false;
        let userResultFriendData = null;

        if (userResult) {
            userResultIsFriend = friendIdsFromSearch.includes(userResult.id);
            if (userResultIsFriend) {
                userResultFriendData = localFriends.find(f => f.id === userResult.id);
            }
        }
        const uniqueFriends = localFriends.filter(f => !userResult || f.id !== userResult.id);
        const uniqueFriendIds = uniqueFriends.map(f => f.id);

        if (userResult) {
            if (signal.aborted) return;
            
            const promises2 = [
                fetchThumbnails([{ id: userResult.id }], 'AvatarHeadshot', '48x48'),
                fetchWithRetry({
                    subdomain: 'presence',
                    endpoint: '/v1/presence/users',
                    method: 'POST',
                    body: { userIds: [userResult.id] },
                }, 3, signal)
            ];

            if (!userResultIsFriend) {
                promises2.push(
                    userCache.has(userResult.id) ? 
                    Promise.resolve(userCache.get(userResult.id)) :
                    fetchWithRetry({
                        subdomain: 'users',
                        endpoint: `/v1/users/${userResult.id}`,
                    }, 3, signal).then(userData => {
                        if (userData) {
                            userCache.set(userResult.id, userData);
                        }
                        return userData;
                    })
                );
            } else {
                promises2.push(Promise.resolve(null));
            }

            const [userThumbnailMap, presenceData, fetchedUserDetails] = await Promise.all(promises2);
            if (signal.aborted) return;

            let userDetails = fetchedUserDetails;
            let isTrusted = false;

            if (userResultIsFriend && userResultFriendData) {
                userDetails = {
                    id: userResultFriendData.id,
                    name: userResultFriendData.username,
                    displayName: userResultFriendData.combinedName,
                    hasVerifiedBadge: userResultFriendData.isVerified,
                    isBanned: userResultFriendData.isDeleted
                };
                isTrusted = userResultFriendData.isTrusted;
            } else if (!userDetails && userResult) {
                 userDetails = {
                    id: userResult.id,
                    name: userResult.name,
                    displayName: userResult.displayName,
                    hasVerifiedBadge: userResult.hasVerifiedBadge,
                    isBanned: false
                };
            }

            const userThumbData = userThumbnailMap.get(userResult.id);
            const userPresence = presenceData?.userPresences?.[0];
            window._lastRoValraUserResult = createUserResultHtml(userDetails, userThumbData, userPresence, userResultIsFriend, isTrusted);
            
            if (window._lastRoValraFriendResults) {
                window._lastRoValraFriendResults = window._lastRoValraFriendResults.filter(el => el.dataset.userId != userResult.id);
            }
        } else {
            window._lastRoValraUserResult = null;
        }

        injectIntoMenu();
    } catch (e) {
        if (e.name !== 'AbortError') log(logLevel.ERROR, 'RoValra: User Search Error', e);
    }
}

async function performGameSearch(query) {
    if (!searchSettings.gameSearchEnabled) return;

    if (gameSearchAbortController) {
        gameSearchAbortController.abort();
    }
    gameSearchAbortController = new AbortController();
    const signal = gameSearchAbortController.signal;

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
                signal: signal
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

        const [gameSearchData, settings, friendsData] = await Promise.all([
            fetchWithRetry({
                subdomain: 'apis',
                endpoint: `/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionid=${authedUserId}&pageType=Game`
            }, 3, signal),
            new Promise(resolve => chrome.storage.local.get(['PreferredRegionEnabled'], resolve)),
            friendsPromise
        ]);

        if (signal.aborted) return;

        const gameResult = gameSearchData?.searchResults?.find(r => r.contentGroupType === 'Game' && r.contents?.length > 0);
        if (gameResult) {
        const game = gameResult.contents[0];
        const friendsPlaying = friendsData?.data?.filter(f => f.userPresence?.universeId === game.universeId) || [];
 
        if (signal.aborted) return;
        const promises = [
            fetchThumbnails([{ id: game.universeId }], 'GameIcon', '50x50'),
            fetchWithRetry({
                subdomain: 'games',
                endpoint: `/v1/games/votes?universeIds=${game.universeId}`
            }, 3, signal)
        ];

        if (friendsPlaying.length > 0) {
            promises.push(fetchThumbnails(friendsPlaying.map(f => ({ id: f.id })), 'AvatarHeadshot', '48x48'));
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

        let friendsInfo = [];
        if (friendsPlaying.length > 0 && results[2]) {
            const friendThumbMap = results[2];
            friendsInfo = friendsPlaying.map(f => {
                const fThumb = friendThumbMap.get(f.id);
                if (fThumb && fThumb.state === 'Completed') {
                    return {
                        id: f.id,
                        userId: f.id,
                        name: f.displayName || f.name,
                        displayName: f.displayName,
                        combinedName: `${f.displayName || f.name} (@${f.name})`,
                        username: f.name,
                        thumbnailUrl: fThumb.imageUrl,
                        rootPlaceId: f.userPresence.rootPlaceId,
                        gameInstanceId: f.userPresence.gameId
                    };
                }
                return null;
            }).filter(f => f !== null);
        }

            window._lastRoValraGameResult = createResultHtml(game, thumbnailUrl, playerCount, voteRatio, totalVotes, settings, friendsInfo);
        }

        injectIntoMenu();
    } catch (e) {
        if (e.name !== 'AbortError') log(logLevel.ERROR, 'RoValra: Game Search Error', e);
    }
}

function createUserResultHtml(user, thumbData, presence, isFriend = false, isTrusted = false) {
    const li = document.createElement('li');
    li.className = 'navbar-search-option rbx-clickable-li improved-search rovalra-quick-search-result';
    li.dataset.userId = user.id;

    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        padding: '6px 0px',
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
    link.addEventListener('click', () => {
        addSearchTerm({ type: 'user', id: user.id, name: user.displayName, thumbnail: thumbData?.imageUrl });
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
    
    let statusText = `@${user.name}`;
    if (presence && presence.userPresenceType === 2 && presence.lastLocation) {
        statusText = `Playing ${presence.lastLocation}`;
    } else if (isFriend) {
        statusText = isTrusted ? "You are trusted connections" : "You are connections";
    }
    secondaryInfoDiv.textContent = statusText;

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

    if (user.isBanned) {
        if (displayNameDiv) {
            const lockIcon = document.createElement('div');
            addTooltip(lockIcon, 'This user has been permanently banned', { position: 'bottom' });
            Object.assign(lockIcon.style, {
                width: '16px',
                height: '16px',
                display: 'inline-block',
                verticalAlign: 'middle',
                marginLeft: '5px',
                flexShrink: '0',
                backgroundColor: 'var(--rovalra-secondary-text-color)',
                webkitMask: `url("${assets.lock}") no-repeat center / contain`,
                mask: `url("${assets.lock}") no-repeat center / contain`
            });
            displayNameDiv.appendChild(lockIcon);
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
            transition: 'background-color 0.2s, filter 0.2s',
            flexShrink: '0'
        });

        playBtn.addEventListener('mouseenter', () => {
            playBtn.style.filter = 'brightness(0.9)';
        });
        playBtn.addEventListener('mouseleave', () => {
            playBtn.style.filter = '';
        });

        playBtn.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        playBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isFriend) {
                followUser(user.id);
            } else {
                launchGame(presence.rootPlaceId, presence.gameId);
            }
        };
        buttonsContainer.appendChild(playBtn);
        container.appendChild(buttonsContainer);
    }

    li.appendChild(container);
    return li;
}
 
function createResultHtml(game, thumbnailUrl, playerCount, voteRatio, totalVotes, settings, friendsInfo) {
    const li = document.createElement('li');
    li.className = 'navbar-search-option rbx-clickable-li improved-search rovalra-quick-search-result';
 
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        padding: '6px 0px',
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
    link.addEventListener('click', () => {
        addSearchTerm({ type: 'game', id: game.rootPlaceId, universeId: game.universeId, name: game.name, thumbnail: thumbnailUrl });
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
        gap: '3px',
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

        regionBtn.addEventListener('mouseenter', () => {
            regionBtn.style.filter = 'brightness(0.9)';
        });
        regionBtn.addEventListener('mouseleave', () => {
            regionBtn.style.filter = '';
        });

        (async () => {
            try {
                await getRegionData();
                const savedRegion = await getSavedPreferredRegion();
                let tooltipText;
                if (!savedRegion || savedRegion === 'AUTO') {
                    tooltipText = 'Join Preferred Region<br><b>Best Region (Auto)</b>';
                } else {
                    const regionName = getFullRegionName(savedRegion);
                    tooltipText = `Join Preferred Region<br><b>${regionName}</b>`;
                }
                addTooltip(regionBtn, tooltipText, { position: 'top' });
            } catch (e) {
                addTooltip(regionBtn, "Join Preferred Region", { position: 'top' });
            }
        })();

        regionBtn.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

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
            transition: 'background-color 0.2s, filter 0.2s',
        flexShrink: '0'
    });

        playBtn.addEventListener('mouseenter', () => {
            playBtn.style.filter = 'brightness(0.9)';
        });
        playBtn.addEventListener('mouseleave', () => {
            playBtn.style.filter = '';
        });

    playBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

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
    if (window._lastRoValraFriendResults && window._lastRoValraFriendResults.length > 0) {
        window._lastRoValraFriendResults.slice().reverse().forEach(friendResult => {
            menu.prepend(friendResult);
        });
    }
    if (window._lastRoValraUserResult) {
        menu.prepend(window._lastRoValraUserResult);
    }

    const firstResult = menu.querySelector('.rovalra-quick-search-result');
    const currentlySelected = menu.querySelector('.new-selected');
    if (firstResult && currentlySelected && !currentlySelected.classList.contains('rovalra-quick-search-result')) {
        currentlySelected.classList.remove('new-selected');
        firstResult.classList.add('new-selected');
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

    const firstResult = menu?.querySelector('.rovalra-quick-search-result');
    const currentlySelected = menu?.querySelector('.new-selected');
    if (firstResult && currentlySelected && !currentlySelected.classList.contains('rovalra-quick-search-result')) {
        currentlySelected.classList.remove('new-selected');
        firstResult.classList.add('new-selected');
    }
}

async function getHistory() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
}

async function addSearchTerm(term) {
    if (!searchSettings.searchHistoryEnabled) return;
    if (!term) return;
    
    let entry;
    let valueToCheck;

    if (typeof term === 'string') {
        if (!term.trim()) return;
        valueToCheck = term.trim();
        entry = valueToCheck;
    } else {
        valueToCheck = term.name;
        entry = { 
            name: term.name, 
            thumbnail: term.thumbnail,
            type: term.type,
            id: term.id,
            universeId: term.universeId,
            timestamp: Date.now()
        };
    }

    let history = await getHistory();
    history = history.filter(item => {
        const itemValue = typeof item === 'string' ? item : item.name;
        if (itemValue.toLowerCase() === valueToCheck.toLowerCase()) return false;

        if (typeof term !== 'string' && typeof item !== 'string') {
            // Check for matching ID within the same type (handles both games and users)
            if (item.type === term.type && String(item.id) === String(term.id)) return false;
        }

        return true;
    });
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    await chrome.storage.local.set({ [STORAGE_KEY]: history });
}

async function updateThumbnails(items) {
    const users = items.filter(i => i.type === 'user').map(i => ({ id: parseInt(i.id), pill: i.pill }));
    const games = items.filter(i => i.type === 'game').map(i => ({ id: parseInt(i.universeId || i.id), pill: i.pill }));

    const promises = [];
    if (users.length) promises.push(fetchThumbnails(users.map(u => ({ id: u.id })), 'AvatarHeadshot', '48x48').then(map => ({ type: 'user', map, items: users })));
    if (games.length) promises.push(fetchThumbnails(games.map(g => ({ id: g.id })), 'GameIcon', '50x50').then(map => ({ type: 'game', map, items: games })));

    if (promises.length > 0) {
        const results = await Promise.all(promises);
        const history = await getHistory();
        let changed = false;

        results.forEach(({ type, map, items }) => {
            items.forEach(({ id, pill }) => {
                if (map.has(id)) {
                    const newData = map.get(id);
                    if (newData && newData.state === 'Completed') {
                        const img = pill.querySelector('img');
                        if (img && img.src !== newData.imageUrl) {
                            img.src = newData.imageUrl;
                        }
                        
                        const storedId = pill.dataset.historyId;
                        const historyItem = history.find(h => 
                            typeof h !== 'string' && 
                            String(h.id) === String(storedId) && 
                            h.type === type
                        );

                        if (historyItem) {
                            historyItem.thumbnail = newData.imageUrl;
                            historyItem.timestamp = Date.now();
                            changed = true;
                        }
                    }
                }
            });
        });

        if (changed) {
            await chrome.storage.local.set({ [STORAGE_KEY]: history });
        }
    }
}

function handleButtonState(btn, shouldDisable) {
    const currentlyDisabled = btn.classList.contains('rovalra-btn-disabled');
    
    if (shouldDisable) {
        if (!currentlyDisabled) {
            btn.classList.add('rovalra-btn-disabled');
            // Double click prevention
            btn.style.pointerEvents = 'auto';
            
            if (btn._timeout) clearTimeout(btn._timeout);
            btn._timeout = setTimeout(() => {
                if (btn.classList.contains('rovalra-btn-disabled')) {
                    btn.style.pointerEvents = 'none';
                }
            }, 1000);
        }
    } else {
        if (currentlyDisabled) {
            btn.classList.remove('rovalra-btn-disabled');
            btn.style.pointerEvents = '';
            if (btn._timeout) {
                clearTimeout(btn._timeout);
                btn._timeout = null;
            }
        }
    }
}

function updateScrollButtonStates(container, leftBtn, rightBtn) {
    if (!container || !leftBtn || !rightBtn) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const isScrollable = scrollWidth > clientWidth + 5;

    if (!isScrollable) {
        leftBtn.style.display = 'none';
        rightBtn.style.display = 'none';
        return;
    }

    leftBtn.style.display = 'flex';
    rightBtn.style.display = 'flex';

    handleButtonState(leftBtn, scrollLeft <= 5);
    handleButtonState(rightBtn, scrollLeft + clientWidth >= scrollWidth - 5);
}

async function renderSearchHistory(container) {
    if (container.querySelector('.rovalra-search-history-section')) {
        container.querySelector('.rovalra-search-history-section').remove();
    }
    const history = await getHistory();

    const section = document.createElement('div');
    section.className = 'game-sort-header-container rovalra-search-history-section';
    section.style.marginTop = '20px';
    
    section.innerHTML = `
        <div class="container-header">
            <h2 class="sort-header"><span>Search History</span></h2>
        </div>
    `;

    if (history.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-secondary';
        emptyMsg.textContent = "You don't have any search history.";
        emptyMsg.style.padding = '10px 12px';
        section.appendChild(emptyMsg);
        container.appendChild(section);
        return;
    }

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'rovalra-history-scroll-wrapper';
    scrollWrapper.id = 'rovalra-history-list-scroll';
    scrollWrapper.style.position = 'relative';
    scrollWrapper.style.padding = '10px 0';

    const listContainer = document.createElement('div');
    listContainer.className = 'rovalra-history-list-container';
    listContainer.style.overflowX = 'auto';
    listContainer.style.scrollBehavior = 'smooth';
    
    listContainer.style.scrollbarWidth = 'none'; // Firefox
    listContainer.style.msOverflowStyle = 'none';  // IE and Edge
    if (!document.getElementById('rovalra-history-scrollbar-style')) {
        const style = document.createElement('style');//verified
        style.id = 'rovalra-history-scrollbar-style';
        style.textContent = `
            #rovalra-history-list-scroll .rovalra-history-list-container::-webkit-scrollbar { display: none; }
            #rovalra-history-list-scroll .rovalra-scroll-btn {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                z-index: 10;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background-color: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: opacity 0.2s, background-color 0.2s;
                border: none;
                color: white;
            }
            #rovalra-history-list-scroll .rovalra-scroll-btn:hover {
                background-color: rgba(0, 0, 0, 0.8);
            }
            #rovalra-history-list-scroll .rovalra-scroll-btn.left { left: 0; }
            #rovalra-history-list-scroll .rovalra-scroll-btn.right { right: 0; }
            #rovalra-history-list-scroll .rovalra-scroll-btn.rovalra-btn-disabled {
                opacity: 0;
                cursor: default;
                pointer-events: none;
            }
        `;// Verified
        document.head.appendChild(style);
    }

    const list = document.createElement('div');
    list.className = 'rovalra-history-list';
    list.style.display = 'flex';
    list.style.flexWrap = 'nowrap';
    list.style.gap = '8px';
    list.style.padding = '0 40px'; 

    history.forEach(item => {
        let term;
        let iconUrl = null;

        if (typeof item === 'string') {
            term = item;
        } else {
            term = item.name;
            iconUrl = item.thumbnail;
        }

        const pill = createPill(term, null, { isButton: true, iconUrl });
        pill.style.flexShrink = '0';

        if (typeof item !== 'string' && item.id && item.type) {
            pill.dataset.historyId = item.id;
            pill.dataset.historyType = item.type;
            if (item.universeId) pill.dataset.historyUniverseId = item.universeId;
            pill.dataset.timestamp = item.timestamp || 0;
        }

        pill.addEventListener('click', () => {
            if (typeof item === 'object' && item !== null && item.type && item.id) {
                if (item.type === 'user') {
                    window.location.href = `https://www.roblox.com/users/${item.id}/profile`;
                } else if (item.type === 'game') {
                    window.location.href = `https://www.roblox.com/games/${item.id}/`;
                }
            } else {
                const input = document.getElementById('navbar-search-input');
                if (input) {
                    input.value = term;
                    input.focus();
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        const deleteBtn = document.createElement('div');
        Object.assign(deleteBtn.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            marginLeft: '6px',
            cursor: 'pointer',
            borderRadius: '50%',
            transition: 'background-color 0.2s',
            position: 'relative',
            zIndex: '2'
        });

        const deleteIcon = document.createElement('div');
        Object.assign(deleteIcon.style, {
            width: '16px',
            height: '16px',
            backgroundColor: 'currentColor',
            webkitMask: `url("${assets.delete}") no-repeat center / contain`,
            mask: `url("${assets.delete}") no-repeat center / contain`,
            opacity: '0.7'
        });
        deleteBtn.appendChild(deleteIcon);

        deleteBtn.addEventListener('mouseenter', () => {
            deleteBtn.style.backgroundColor = 'var(--color-state-hover)';
            deleteIcon.style.opacity = '1';
        });
        deleteBtn.addEventListener('mouseleave', () => {
            deleteBtn.style.backgroundColor = 'transparent';
            deleteIcon.style.opacity = '0.7';
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            showConfirmationPrompt({
                title: 'Delete Search History',
                message: 'Are you sure you want to delete this search history entry?',
                confirmText: 'Delete',
                confirmType: 'primary-destructive',
                onConfirm: async () => {
                    const currentHistory = await getHistory();
                    const newHistory = currentHistory.filter(h => {
                        if (typeof item === 'string') {
                            return h !== item;
                        } else {
                            if (typeof h === 'string') return true;
                            return !(String(h.id) === String(item.id) && h.type === item.type);
                        }
                    });
                    await chrome.storage.local.set({ [STORAGE_KEY]: newHistory });
                    renderSearchHistory(container);
                }
            });
        });

        pill.appendChild(deleteBtn);
        list.appendChild(pill);
    });

    listContainer.appendChild(list);
    const { leftButton, rightButton } = createScrollButtons({
        onLeftClick: (e) => {
            if (!e.currentTarget.classList.contains('rovalra-btn-disabled')) {
                listContainer.scrollLeft -= 300;
            }
        },
        onRightClick: (e) => {
            if (!e.currentTarget.classList.contains('rovalra-btn-disabled')) {
                listContainer.scrollLeft += 300;
            }
        }
    });

    leftButton.classList.add('rovalra-scroll-btn', 'left');
    rightButton.classList.add('rovalra-scroll-btn', 'right');
    
    listContainer.addEventListener('scroll', () => updateScrollButtonStates(listContainer, leftButton, rightButton));
    
    scrollWrapper.appendChild(leftButton);
    scrollWrapper.appendChild(listContainer);
    scrollWrapper.appendChild(rightButton);

    section.appendChild(scrollWrapper);
    container.appendChild(section);

    if (container._rovalraResizeCleanup) {
        container._rovalraResizeCleanup();
    }

    setTimeout(() => updateScrollButtonStates(listContainer, leftButton, rightButton), 100);
    const { unobserve } = observeResize(listContainer, () => updateScrollButtonStates(listContainer, leftButton, rightButton));
    container._rovalraResizeCleanup = unobserve;
    
    const itemsToUpdateQueue = new Set();
    let updateTimeout = null;

    const processQueue = () => {
        if (itemsToUpdateQueue.size > 0) {
            updateThumbnails(Array.from(itemsToUpdateQueue));
            itemsToUpdateQueue.clear();
        }
        updateTimeout = null;
    };

    list.querySelectorAll('[data-history-id]').forEach(pill => {
        const unobserver = observeIntersection(pill, (entry) => {
            if (entry.isIntersecting) {
                const timestamp = parseInt(pill.dataset.timestamp || '0');
                if (Date.now() - timestamp > 300000) {
                    const id = pill.dataset.historyId;
                    const type = pill.dataset.historyType;
                    const universeId = pill.dataset.historyUniverseId;

                    if (id && type) {
                        itemsToUpdateQueue.add({ id, type, universeId, pill });
                        unobserver.unobserve();
                        if (!updateTimeout) {
                            updateTimeout = setTimeout(processQueue, 100);
                        }
                    }
                }
            }
        }, { root: listContainer, threshold: 0.1 });
    });
}

export function init() {
    updateSearchSettings();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.quickSearchEnabled || changes.userSearchEnabled || changes.gameSearchEnabled || changes.friendSearchEnabled || changes.searchHistoryEnabled) {
                updateSearchSettings();
            }
        }
    });

    const debouncedGameSearch = debounce(performGameSearch, 300);
    const debouncedUserSearch = debounce(performUserSearch, 100);

    const seeker = setInterval(() => {
        const input = document.getElementById('navbar-search-input');
        if (input) {
            clearInterval(seeker);
            initialSearchValue = input.value;
            
            input.addEventListener('input', () => {
                if (!searchSettings.quickSearchEnabled) return;
                const currentVal = (input.value || "").trim();

                if (currentVal === lastSearchedQuery) return;
                lastSearchedQuery = currentVal;

                if (userSearchAbortController) userSearchAbortController.abort('New search initiated');
                if (gameSearchAbortController) gameSearchAbortController.abort('New search initiated');

                window._lastRoValraUserResult = null;
                window._lastRoValraGameResult = null;
                window._lastRoValraFriendResults = [];
                injectIntoMenu();

                if (currentVal.length < 1) {
                    return;
                }

                debouncedUserSearch(currentVal);

                if (currentVal.length >= 2) {
                    debouncedGameSearch(currentVal);
                } else {
                    window._lastRoValraUserResult = null;
                    window._lastRoValraGameResult = null;
                }
            });

            input.addEventListener('keydown', (e) => {
                if (!searchSettings.quickSearchEnabled) return;

                const menu = document.querySelector('ul.new-dropdown-menu');
                const isMenuVisible = menu && menu.offsetParent !== null;

                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (isMenuVisible) {
                        const items = Array.from(menu.querySelectorAll('li.navbar-search-option'));
                        if (items.length > 0) {
                            e.preventDefault();
                            e.stopPropagation();

                            let selectedIndex = items.findIndex(item => item.classList.contains('new-selected'));

                            if (selectedIndex !== -1) {
                                items[selectedIndex].classList.remove('new-selected');
                            }

                            if (e.key === 'ArrowDown') {
                                selectedIndex++;
                                if (selectedIndex >= items.length) selectedIndex = 0;
                            } else {
                                selectedIndex--;
                                if (selectedIndex < 0) selectedIndex = items.length - 1;
                            }

                            items[selectedIndex].classList.add('new-selected');
                        }
                    }
                } else if (e.key === 'Enter') {
                    let handled = false;
                    if (isMenuVisible) {
                        const selected = menu.querySelector('li.navbar-search-option.new-selected');
                        if (selected) {
                            const link = selected.querySelector('a');
                            if (link) {
                                e.preventDefault();
                                e.stopPropagation();
                                link.click();
                                handled = true;
                            }
                        }
                    }

                    if (!handled) {
                        const val = input.value;
                        if (val !== initialSearchValue) {
                            addSearchTerm(val);
                            initialSearchValue = val;
                        }
                    }
                }
            });

            observeElement('ul.new-dropdown-menu', () => {
                if (searchSettings.quickSearchEnabled) {
                    injectExistingResult();
                }
            });

            observeElement('section[data-testid="SearchLandingPageOmniFeedTestId"]', (container) => {
                if (searchSettings.searchHistoryEnabled) {
                    renderSearchHistory(container);
                }
            }, {
                onRemove: (container) => {
                    if (container._rovalraResizeCleanup) {
                        container._rovalraResizeCleanup();
                        delete container._rovalraResizeCleanup;
                    }
                }
            });
}
    }, 300);
}