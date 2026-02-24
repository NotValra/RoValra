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
import { createThumbnailElement, fetchThumbnails } from '../../thumbnail/thumbnails.js';
import { safeHtml } from '../../packages/dompurify.js';
import { formatPlayerCount } from '../../games/playerCount.js';
import { callRobloxApi } from '../../api.js';

const BATCH_WAIT = 50;
const MAX_BATCH = 50;

const universeQueue = new Map();
let universeTimer = null;

async function fetchWithRetry(subdomain, endpoint, retries = 3) {
    try {
        const res = await callRobloxApi({ subdomain, endpoint, method: 'GET' });
        if (res.status === 429 && retries > 0) {
            await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
            return fetchWithRetry(subdomain, endpoint, retries - 1);
        }
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    } catch (e) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 1000));
            return fetchWithRetry(subdomain, endpoint, retries - 1);
        }
        throw e;
    }
}

async function getUniverseIdFromPlaceId(placeId) {
    const res = await callRobloxApi({
        subdomain: 'games',
        endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
        method: 'GET'
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0] && data[0].universeId) {
        return data[0].universeId;
    }
    throw new Error('Place not found');
}

function flushUniverseQueue() {
    const currentMap = new Map(universeQueue);
    universeQueue.clear();
    universeTimer = null;

    const ids = Array.from(currentMap.keys());
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += MAX_BATCH) {
        const chunk = ids.slice(i, i + MAX_BATCH);
        const idsStr = chunk.length > 2 ? chunk.join(',') : `1,${chunk.join(',')}`;
        
        Promise.all([
            fetchWithRetry('games', `/v1/games?universeIds=${idsStr}`),
            fetchWithRetry('games', `/v1/games/votes?universeIds=${idsStr}`)
        ]).then(([gamesData, votesData]) => {
            const games = gamesData.data || [];
            const votes = votesData.data || [];
            const gameMap = new Map(games.map(g => [g.id, g]));
            const voteMap = new Map(votes.map(v => [v.id, v]));

            chunk.forEach(id => {
                const resolvers = currentMap.get(id);
                const game = gameMap.get(id);
                const vote = voteMap.get(id) || { upVotes: 0, downVotes: 0 };
                
                if (game) {
                    resolvers.forEach(r => r.resolve({ game, vote }));
                } else {
                    resolvers.forEach(r => r.reject(new Error('Game not found')));
                }
            });
        }).catch(err => {
            chunk.forEach(id => {
                const resolvers = currentMap.get(id);
                if (resolvers) resolvers.forEach(r => r.reject(err));
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
            method: 'GET'
        }).then(res => res.json()).catch(e => {
            console.warn('RoValra: Friend fetch error', e);
            return { data: [] };
        });
        setTimeout(() => { friendCachePromise = null; }, 5000);
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
    } = options;

    if (!game && (gameId || placeId)) {
        const card = document.createElement('div');
        card.className = 'rovalra-game-card';
        card.innerHTML = `
            <div class="game-card-thumb-container shimmer"></div>
            <div class="game-card-name game-name-title shimmer"></div>
            <div class="game-card-name game-name-title game-name-title-half shimmer"></div>
        `;

        (async () => {
            try {
                let targetUniverseId = gameId;

                if (!targetUniverseId && placeId) {
                    targetUniverseId = await getUniverseIdFromPlaceId(placeId);
                }

                if (!targetUniverseId) throw new Error('Could not resolve Universe ID');

                const userId = document.querySelector('meta[name="user-data"]')?.dataset?.userid;

                const promises = [
                    getGameData(targetUniverseId),
                    fetchThumbnails([{ id: targetUniverseId }], 'GameIcon', '150x150')
                ];

                if (userId) {
                    promises.push(getOnlineFriends(userId));
                }

                const results = await Promise.all(promises);
                const { game: gameInfo, vote: voteInfo } = results[0];
                const thumbMap = results[1];
                const friendsData = userId ? results[2] : null;

                if (!gameInfo) throw new Error('Game not found');

                const universeId = gameInfo.id;
                const fetchedStats = {
                    likes: new Map([[universeId, { ratio: Math.floor((voteInfo.upVotes / (voteInfo.upVotes + voteInfo.downVotes)) * 100) || 0, total: voteInfo.upVotes + voteInfo.downVotes }]]),
                    players: new Map([[universeId, gameInfo.playing]]),
                    thumbnails: thumbMap
                };

                let fetchedFriendData = null;
                if (friendsData) {
                    try {
                        const friend = friendsData.data?.find(f => f.userPresence?.universeId === universeId);

                        if (friend) {
                            const [userRes, friendThumbMap] = await Promise.all([
                                callRobloxApi({ subdomain: 'users', endpoint: `/v1/users/${friend.id}`, method: 'GET' }),
                                fetchThumbnails([{ id: friend.id }], 'AvatarHeadshot', '48x48')
                            ]);

                            if (userRes.ok) {
                                const userData = await userRes.json();
                                fetchedFriendData = {
                                    id: friend.id,
                                    name: userData.displayName,
                                    thumbnail: friendThumbMap.get(friend.id)
                                };
                            }
                        }
                    } catch (e) {
                        console.warn('RoValra: Error fetching friend info', e);
                    }
                }

                const realCard = createGameCard({ game: gameInfo, stats: fetchedStats, showVotes, showPlayers, thumbStyle, friendData: fetchedFriendData });
                card.replaceWith(realCard);
            } catch (e) {
                console.warn('RoValra: Error creating game card from ID', e);
                card.innerHTML = '<div style="padding: 10px; color: var(--text-error);">Failed to load game</div>';
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
        infoHtml = `
            <div class="game-card-friend-info game-card-info" data-testid="game-tile-stats-friends">
                <div class="info-avatar" style="width: 32px;">
                    <div class="avatar-card" role="button" tabindex="0">
                        <span class="thumbnail-2d-container avatar avatar-headshot avatar-headshot-xs">
                            <img class="avatar-card-image" src="${friendData.thumbnail?.imageUrl || ''}" alt="${friendData.name}" title="${friendData.name}">
                        </span>
                    </div>
                </div>
            </div>
        `;
    } else {
        infoHtml = `
            <div class="game-card-info">
                ${
                    showVotes
                        ? `
                    <span class="info-label icon-votes-gray"></span>
                    <span class="info-label vote-percentage-label ${voteData.total > 0 ? '' : 'hidden'}">${voteData.ratio}%</span>
                    <span class="info-label no-vote ${voteData.total === 0 ? '' : 'hidden'}"></span>
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

    card.innerHTML = `
        <a class="game-card-link" href="https://www.roblox.com/games/${placeId || game.rootPlaceId}/unnamed">
            <div class="game-card-thumb-container"></div>
            ${safeHtml`<div class="game-card-name" title="${game.name}">${game.name}</div>`}
            ${infoHtml}
        </a>
    `; // Verified

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
