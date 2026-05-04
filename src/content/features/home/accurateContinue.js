import { createGameCard } from '../../core/ui/games/gameCard.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';

export async function init() {
    try {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/search-landing-page-api/v1?sessionId=RoValra',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
            },
        });

        if (!data.sorts || !data.sorts.length) {
            return;
        }

        const recentlyVisitedSort = data.sorts.find(
            (sort) => sort.sortId === 'RecentlyVisited',
        );

        if (
            !recentlyVisitedSort ||
            !recentlyVisitedSort.games ||
            !recentlyVisitedSort.games.length
        ) {
            return;
        }

        const games = recentlyVisitedSort.games;

        const thumbnailIds = games.map((game) => ({ id: game.universeId }));
        const thumbnails = await fetchThumbnails(
            thumbnailIds,
            'GameIcon',
            '150x150',
        );

        const stats = {
            likes: new Map(),
            players: new Map(),
            thumbnails: thumbnails,
        };

        games.forEach((game) => {
            stats.likes.set(game.universeId, {
                ratio:
                    game.totalUpVotes + game.totalDownVotes > 0
                        ? Math.floor(
                              (game.totalUpVotes /
                                  (game.totalUpVotes + game.totalDownVotes)) *
                                  100,
                          )
                        : 0,
                total: game.totalUpVotes + game.totalDownVotes,
            });
            stats.players.set(game.universeId, game.playerCount);
        });

        observeElement(
            '.hlist.games.game-cards.game-tile-list.home-page-carousel',
            (container) => {
                renderGames(container, games, stats);
            },
            { multiple: false },
        );
    } catch (error) {
        console.warn('RoValra: accurateContinue failed to load', error);
    }
}

function renderGames(container, games, stats) {
    const existingGameCards = container.querySelectorAll(
        'li.list-item.game-card.game-tile',
    );

    existingGameCards.forEach((card) => {
        card.remove();
    });

    Array.from(container.childNodes).forEach((node) => {
        if (
            node.nodeType === Node.TEXT_NODE ||
            !node.classList?.contains('slick-list')
        ) {
            node.remove();
        }
    });

    games.forEach((game) => {
        try {
            const gameCard = createGameCard({
                game: {
                    ...game,
                    id: game.universeId,
                    playing: game.playerCount,
                },
                stats: stats,
                showVotes: true,
                showPlayers: true,
            });

            const listItem = document.createElement('li');
            listItem.className = 'list-item game-card game-tile';

            listItem.appendChild(gameCard);

            container.appendChild(listItem);
        } catch (e) {
            console.warn('RoValra: Failed to create game card', game, e);
        }
    });
}
