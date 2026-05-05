import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';

export async function init() {
    try {
        const settings = await new Promise((resolve) =>
            chrome.storage.local.get(
                { AccurateContinueEnabled: true },
                resolve,
            ),
        );

        if (settings.AccurateContinueEnabled) {
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

            observeElement(
                '.hlist.games.game-cards.game-tile-list.home-page-carousel',
                (container) => {
                    renderGames(container, games);
                },
                { multiple: false },
            );
        }
    } catch (error) {
        console.warn('RoValra: accurateContinue failed to load', error);
    }
}

function renderGames(container, games) {
    const existingGameCardsMap = new Map();
    const existingListItems = container.querySelectorAll(
        'li.list-item.game-card.game-tile',
    );

    existingListItems.forEach((listItem) => {
        let gameId = listItem.dataset.gameId;
        const gameCardLink = listItem.querySelector('.game-card-link');

        if (!gameId) {
            gameId = gameCardLink?.dataset?.gameid || gameCardLink?.id;
        }

        if (gameId) {
            existingGameCardsMap.set(gameId, listItem);
        } else {
            listItem.remove();
        }
    });

    const fragment = document.createDocumentFragment();

    games.forEach((game) => {
        const gameId = String(game.universeId);
        let listItem = existingGameCardsMap.get(gameId);

        if (listItem) {
            fragment.appendChild(listItem);
            existingGameCardsMap.delete(gameId);
        }
    });

    existingGameCardsMap.forEach((listItem) => listItem.remove());

    Array.from(container.childNodes).forEach((node) => {
        if (
            node.nodeType === Node.TEXT_NODE ||
            !node.classList?.contains('slick-list')
        ) {
            node.remove();
        }
    });

    container.appendChild(fragment);

    forceLayoutRecalculation();
}

function forceLayoutRecalculation() {
    const mainElement = document.body;
    if (!mainElement) return;

    const trigger = () => {
        const originalWidth = mainElement.style.width;
        mainElement.style.width = mainElement.offsetWidth + 1 + 'px';
        setTimeout(() => {
            mainElement.style.width = originalWidth;
        }, 0);
    };

    if (document.visibilityState === 'visible') {
        trigger();
    } else {
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                trigger();
                document.removeEventListener(
                    'visibilitychange',
                    onVisibilityChange,
                );
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
    }
}
