import { callRobloxApi } from '../api.js';
import { fetchThumbnails as fetchThumbnailsBatch } from '../thumbnail/thumbnails.js';

let searchAbortController = new AbortController();


export async function searchGames(query, sessionId) {
    searchAbortController.abort();
    searchAbortController = new AbortController();
    const signal = searchAbortController.signal;

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&pageType=Game&sessionId=${sessionId}`,
            signal
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const results = await response.json();
        if (signal.aborted) return []; 

        const gameContents = results.searchResults?.flatMap(group => group.contentGroupType === 'Game' ? group.contents : []) || [];
        const topGames = gameContents.slice(0, 3);

        if (topGames.length > 0) {
            const thumbnailItems = topGames.map(game => ({ id: game.universeId }));
            const thumbnails = await fetchThumbnailsBatch(thumbnailItems, 'GameIcon', '50x50', false, signal);
            topGames.forEach(game => {
                game.thumbnail = thumbnails.get(game.universeId);
            });
        }

        return topGames;
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("RoValra Game Search: Search failed.", error);
        }
        return []; 
    }
}