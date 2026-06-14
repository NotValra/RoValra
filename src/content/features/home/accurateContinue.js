import { callRobloxApiJson } from '../../core/api.js';

export async function init() {
    try {
        const settings = await new Promise((resolve) =>
            chrome.storage.local.get(
                { AccurateContinueEnabled: true },
                resolve,
            ),
        );

        try {
            sessionStorage.setItem(
                'rovalra_accurateContinue',
                settings.AccurateContinueEnabled ? 'true' : 'false',
            );
        } catch (e) {}

        if (settings.AccurateContinueEnabled) {
            const data = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/search-landing-page-api/v1?sessionId=RoValra',
                credentials: 'include',
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

            document.dispatchEvent(
                new CustomEvent('rovalra-accurate-continue', {
                    detail: {
                        enabled: true,
                        games: games,
                    },
                }),
            );
        }
    } catch (error) {
        console.warn('RoValra: accurateContinue failed to load', error);
    }
}
