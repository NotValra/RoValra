/**
 * @file This script provides a function to create game cards for Roblox games.
 *

 * Create a game card by providing a place ID. The card will handle loading.
 * const gameCardById = createGameCard(920587237);
 * document.body.appendChild(gameCardById);
 * 
 * Or create a card with pre-fetched data for synchronous rendering.
 * @example
 * const gameData = {
 *   id: 6284583030, // Universe ID
 *   name: 'Adopt Me!',
 *   rootPlaceId: 920587237,
 *    ... other game properties from Roblox API
 * };
 *  You would also fetch stats like player count, likes, and thumbnails.
 * const gameCardWithData = createGameCard({ game: gameData, stats: fetchedStats });
 * document.body.appendChild(gameCardWithData);
 * 
 * You can also customize what is displayed on the card.
 * @example
 * const customCard = createGameCard({
 *   placeId: 1818, 
 *   showVotes: false, // Don't show the like/dislike ratio
 *   showPlayers: false // Don't show the current player count
 * });
 * document.body.appendChild(customCard);
 */
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../thumbnail/thumbnails.js';
import { safeHtml } from '../../packages/dompurify.js';
import { formatPlayerCount } from '../../games/playerCount.js';
import { callRobloxApi } from '../../api.js';
import { showFriendListOverlay } from './friendListOverlay.js';
import { getCachedFriendsList } from '../../utils/trackers/friendslist.js';

const BATCH_WAIT = 50;
const MAX_BATCH = 50;

const placeQueue = new Map();
let placeTimer = null;
const universeQueue = new Map();
let universeTimer = null;
const fallbackVoteQueue = new Map();
let fallbackVoteTimer = null;

async function fetchWithRetry(subdomain, endpoint, retries = 3) {
    try {
        const res = await callRobloxApi({ subdomain, endpoint, method: 'GET' });
        if (res.status === 429 && retries > 0) {
            await new Promise((r) => setTimeout(r, 1000 * (4 - retries)));
            return fetchWithRetry(subdomain, endpoint, retries - 1);
        }
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    } catch (e) {
        if (retries > 0) {
            await new Promise((r) => setTimeout(r, 1000));
            return fetchWithRetry(subdomain, endpoint, retries - 1);
        }
        throw e;
    }
}

function flushPlaceQueue() {
    const currentMap = new Map(placeQueue);
    placeQueue.clear();
    placeTimer = null;

    const ids = Array.from(currentMap.keys());
    for (let i = 0; i < ids.length; i += MAX_BATCH) {
        const chunk = ids.slice(i, i + MAX_BATCH);
        const query = chunk
            .map((id) => `placeIds=${encodeURIComponent(id)}`)
            .join('&');

        fetchWithRetry('games', `/v1/games/multiget-place-details?${query}`)
            .then((data) => {
                const detailsByPlaceId = new Map(
                    (Array.isArray(data) ? data : []).map((detail) => [
                        String(detail.placeId),
                        detail,
                    ]),
                );

                chunk.forEach((id) => {
                    const resolvers = currentMap.get(id);
                    const detail = detailsByPlaceId.get(id);
                    if (detail) {
                        resolvers.forEach((resolver) =>
                            resolver.resolve(detail),
                        );
                    } else {
                        resolvers.forEach((resolver) =>
                            resolver.reject(new Error('Place not found')),
                        );
                    }
                });
            })
            .catch((error) => {
                chunk.forEach((id) => {
                    const resolvers = currentMap.get(id);
                    if (resolvers) {
                        resolvers.forEach((resolver) => resolver.reject(error));
                    }
                });
            });
    }
}

function getPlaceDetails(placeId) {
    const id = String(placeId);
    return new Promise((resolve, reject) => {
        if (!placeQueue.has(id)) placeQueue.set(id, []);
        placeQueue.get(id).push({ resolve, reject });
        if (!placeTimer) placeTimer = setTimeout(flushPlaceQueue, BATCH_WAIT);
    });
}

function flushFallbackVoteQueue() {
    const currentMap = new Map(fallbackVoteQueue);
    fallbackVoteQueue.clear();
    fallbackVoteTimer = null;

    const ids = Array.from(currentMap.keys());
    for (let i = 0; i < ids.length; i += MAX_BATCH) {
        const chunk = ids.slice(i, i + MAX_BATCH);
        fetchWithRetry(
            'games',
            `/v1/games/votes?universeIds=${chunk.join(',')}`,
        )
            .then((data) => {
                const voteMap = new Map(
                    (data?.data || []).map((vote) => [String(vote.id), vote]),
                );

                chunk.forEach((id) => {
                    const vote = voteMap.get(id) || {
                        upVotes: 0,
                        downVotes: 0,
                    };
                    currentMap
                        .get(id)
                        .forEach((resolver) => resolver.resolve(vote));
                });
            })
            .catch((error) => {
                chunk.forEach((id) => {
                    currentMap
                        .get(id)
                        .forEach((resolver) => resolver.reject(error));
                });
            });
    }
}

function getFallbackVote(universeId) {
    const id = String(universeId);
    return new Promise((resolve, reject) => {
        if (!fallbackVoteQueue.has(id)) fallbackVoteQueue.set(id, []);
        fallbackVoteQueue.get(id).push({ resolve, reject });
        if (!fallbackVoteTimer) {
            fallbackVoteTimer = setTimeout(flushFallbackVoteQueue, BATCH_WAIT);
        }
    });
}

function flushUniverseQueue() {
    const currentMap = new Map(universeQueue);
    universeQueue.clear();
    universeTimer = null;

    const ids = Array.from(currentMap.keys());
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += MAX_BATCH) {
        const chunk = ids.slice(i, i + MAX_BATCH);

        const idsStr = [1, ...chunk].join(',');

        fetchWithRetry('games', `/v1/games?universeIds=${idsStr}`)
            .then((gamesData) => {
                const games = gamesData?.data || [];
                const gameMap = new Map(games.map((g) => [g.id, g]));

                chunk.forEach((id) => {
                    const resolvers = currentMap.get(id);
                    const game = gameMap.get(id);

                    if (game) {
                        resolvers.forEach((r) => r.resolve({ game }));
                    } else {
                        resolvers.forEach((r) =>
                            r.reject(new Error('Game not found')),
                        );
                    }
                });
            })
            .catch((err) => {
                chunk.forEach((id) => {
                    const resolvers = currentMap.get(id);
                    if (resolvers) resolvers.forEach((r) => r.reject(err));
                });
            });
    }
}

function getGameData(universeId) {
    const id = parseInt(universeId, 10);
    return new Promise((resolve, reject) => {
        if (!universeQueue.has(id)) {
            universeQueue.set(id, []);
        }
        universeQueue.get(id).push({ resolve, reject });
        if (!universeTimer) {
            universeTimer = setTimeout(flushUniverseQueue, BATCH_WAIT);
        }
    });
}

let friendCachePromise = null;
function getOnlineFriends(userId) {
    if (!friendCachePromise) {
        friendCachePromise = callRobloxApi({
            subdomain: 'friends',
            endpoint: `/v1/users/${userId}/friends/online`,
            method: 'GET',
        })
            .then((res) => res.json())
            .catch((e) => {
                console.warn('RoValra: Friend fetch error', e);
                return { data: [] };
            });
        setTimeout(() => {
            friendCachePromise = null;
        }, 5000);
    }
    return friendCachePromise;
}

export function createGameCard(options) {
    if (typeof options === 'number' || typeof options === 'string') {
        options = { placeId: options };
    }

    let {
        game,
        gameId,
        placeId,
        stats,
        showVotes = true,
        showPlayers = true,
        thumbStyle = {},
        friendData,
        customInfoText = null,
    } = options;

    if (
        (!game || !stats) &&
        (gameId || placeId || game?.id || game?.rootPlaceId)
    ) {
        const card = document.createElement('div');
        card.className = 'rovalra-game-card';
        card.innerHTML = `
            <div class="game-card-thumb-container shimmer"></div>
            <div class="game-card-name game-name-title shimmer"></div>
            <div class="game-card-name game-name-title game-name-title-half shimmer"></div>
        `;

        (async () => {
            try {
                let targetUniverseId = gameId || game?.id || game?.universeId;
                let targetPlaceId =
                    placeId ||
                    game?.rootPlaceId ||
                    game?.universeRootPlaceId ||
                    game?.placeId;
                let placeDetails = null;

                if (targetPlaceId) {
                    placeDetails = await getPlaceDetails(targetPlaceId).catch(
                        () => null,
                    );
                    targetUniverseId ||= placeDetails?.universeId;
                }

                if (!targetUniverseId)
                    throw new Error('Could not resolve Universe ID');

                const userId = document.querySelector('meta[name="user-data"]')
                    ?.dataset?.userid;

                const promises = [
                    getGameData(targetUniverseId).catch(() => null),
                    fetchThumbnails(
                        [{ id: targetUniverseId }],
                        'GameIcon',
                        '150x150',
                    ),
                ];

                if (userId) {
                    promises.push(getOnlineFriends(userId));
                }

                const results = await Promise.all(promises);
                const gameInfo = results[0]?.game;
                const thumbMap = results[1];
                const friendsData = userId ? results[2] : null;

                const usableGame =
                    gameInfo &&
                    String(gameInfo.id) === String(targetUniverseId) &&
                    gameInfo.rootPlaceId > 0 &&
                    gameInfo.name !== '[TITLE UNAVAILABLE]';
                const needsFallback = !usableGame;

                if (needsFallback && !placeDetails && targetPlaceId) {
                    placeDetails = await getPlaceDetails(targetPlaceId).catch(
                        () => null,
                    );
                }

                const finalGame = game?.id
                    ? game
                    : needsFallback
                      ? {
                            ...(gameInfo || {}),
                            id: Number(targetUniverseId),
                            rootPlaceId: Number(
                                placeDetails?.universeRootPlaceId ||
                                    targetPlaceId ||
                                    0,
                            ),
                            name:
                                placeDetails?.name ||
                                placeDetails?.sourceName ||
                                gameInfo?.name,
                            playing: 0,
                        }
                      : gameInfo;
                if (!finalGame) throw new Error('Game not found');

                const voteInfo = needsFallback
                    ? await getFallbackVote(targetUniverseId).catch(() => ({
                          upVotes: 0,
                          downVotes: 0,
                      }))
                    : { upVotes: 0, downVotes: 0 };

                const universeId = finalGame.id;
                const fetchedStats = {
                    likes: new Map([
                        [
                            universeId,
                            {
                                ratio:
                                    Math.floor(
                                        (voteInfo.upVotes /
                                            (voteInfo.upVotes +
                                                voteInfo.downVotes)) *
                                            100,
                                    ) || 0,
                                total: voteInfo.upVotes + voteInfo.downVotes,
                            },
                        ],
                    ]),
                    players: new Map([[universeId, finalGame.playing || 0]]),
                    thumbnails: thumbMap,
                };

                let fetchedFriendData = null;
                let gameFriends = [];
                if (friendsData) {
                    try {
                        gameFriends =
                            friendsData.data?.filter(
                                (f) =>
                                    f.userPresence?.universeId === universeId,
                            ) || [];

                        if (gameFriends.length > 0) {
                            const displayFriends = gameFriends.slice(0, 3);
                            const cachedFriends = await getCachedFriendsList();
                            const friendNameMap = new Map(
                                cachedFriends.map((f) => [
                                    f.id,
                                    f.displayName ||
                                        f.username ||
                                        `User ${f.id}`,
                                ]),
                            );

                            const friendIds = displayFriends.map((f) => f.id);
                            const friendThumbMap = await fetchThumbnails(
                                friendIds.map((id) => ({ id })),
                                'AvatarHeadshot',
                                '48x48',
                            );

                            fetchedFriendData = {
                                friends: displayFriends.map((friend, idx) => ({
                                    id: friend.id,
                                    name:
                                        friendNameMap.get(friend.id) ||
                                        `User ${friend.id}`,
                                    thumbnail: friendThumbMap.get(friend.id),
                                })),
                                allFriends: gameFriends,
                            };
                        }
                    } catch (e) {
                        console.warn('RoValra: Error fetching friend info', e);
                    }
                }

                const realCard = createGameCard({
                    game: finalGame,
                    placeId: targetPlaceId,
                    stats: fetchedStats,
                    showVotes,
                    showPlayers,
                    thumbStyle,
                    friendData: fetchedFriendData,
                });
                card.replaceWith(realCard);
            } catch (e) {
                console.warn('RoValra: Error creating game card from ID', e);
                card.innerHTML =
                    '<div style="padding: 10px; color: var(--text-error);">Failed to load game</div>';
            }
        })();
        return card;
    }

    if (!game) return document.createElement('div');

    const voteData = stats?.likes?.get(game.id) || { ratio: 0, total: 0 };
    const playerCount = stats?.players?.get(game.id) || 0;
    const formattedPlayerCount = formatPlayerCount(playerCount);
    const thumbnailData = stats?.thumbnails?.get(game.id);

    const card = document.createElement('div');
    card.className = 'rovalra-game-card';

    let infoHtml;
    if (friendData) {
        const friendAvatarsHtml = friendData.friends
            .map(
                (friend, index) => `
            <div class="avatar-card" role="button" tabindex="0" style="z-index: ${3 - index}; margin-left: ${index > 0 ? '-1px' : '0'};">
                <span class="thumbnail-2d-container avatar avatar-headshot avatar-headshot-xs">
                    <img class="avatar-card-image" src="${friend.thumbnail?.imageUrl || ''}" alt="${friend.name}" title="${friend.name}">
                </span>
            </div>
        `,
            )
            .join('');

        infoHtml = `
            <div class="game-card-friend-info game-card-info" data-testid="game-tile-stats-friends">
                <div class="info-avatar" style="width: 54px; display: flex; align-items: center;">
                    ${friendAvatarsHtml}
                </div>
            </div>
        `;
    } else {
        if (customInfoText) {
            const lines = Array.isArray(customInfoText)
                ? customInfoText
                : [customInfoText];
            const lineElements = lines
                .map(
                    (line) =>
                        `<span class="info-label">${safeHtml`${line}`}</span>`,
                )
                .join('');

            infoHtml = `
                <div class="game-card-info" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                    ${lineElements}
                </div>
            `;
        } else {
            infoHtml = `
                <div class="game-card-info">
                    ${
                        showVotes
                            ? `
                        <span class="info-label icon-votes-gray"></span>
                        <span class="info-label vote-percentage-label">${voteData.total > 0 ? `${voteData.ratio}%` : '--'}</span>
                    `
                            : ''
                    }
                    ${
                        showPlayers
                            ? `
                        <span class="info-label icon-playing-counts-gray"></span>
                        <span class="info-label playing-counts-label" title="${playerCount.toLocaleString()}">${formattedPlayerCount}</span>
                    `
                            : ''
                    }
                </div>
            `;
        }
    }

    card.innerHTML = `
        <a class="game-card-link" href="https://www.roblox.com/games/${placeId || game.rootPlaceId}/unnamed">
            <div class="game-card-thumb-container"></div>
            ${safeHtml`<div class="game-card-name" title="${game.name}">${game.name}</div>`}
            ${infoHtml}
        </a>
    `; // Verified

    if (friendData?.allFriends && friendData.allFriends.length > 0) {
        const friendInfoElement = card.querySelector('.game-card-friend-info');
        if (friendInfoElement) {
            friendInfoElement.style.cursor = 'pointer';
            friendInfoElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                showFriendListOverlay(friendData.allFriends, game.name);
            });
        }
    }

    const thumbContainer = card.querySelector('.game-card-thumb-container');
    if (thumbContainer) {
        thumbContainer.appendChild(
            createThumbnailElement(
                thumbnailData,
                game.name,
                'game-card-thumb',
                thumbStyle,
            ),
        );
    }

    return card;
}
