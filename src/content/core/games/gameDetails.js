import { callRobloxApi } from '../api.js';
import { fetchThumbnails as fetchThumbnailsBatch } from '../thumbnail/thumbnails.js';


export async function getGameDetailsFromPlaceId(placeId) {
    try {
        const assetDetailsResponse = await callRobloxApi({
            subdomain: 'economy',
            endpoint: `/v2/assets/${placeId}/details`
        });
        if (!assetDetailsResponse.ok) return null;

        const assetDetails = await assetDetailsResponse.json();
        if (assetDetails.AssetTypeId !== 9) {
            return null;
        }

        const universeResponse = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/universes/v1/places/${placeId}/universe`
        });
        if (!universeResponse.ok) return null;

        const { universeId } = await universeResponse.json();
        if (!universeId) return null;

        const gameDetailsResponse = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games?universeIds=${universeId}`
        });
        if (!gameDetailsResponse.ok) return null;

        const gameData = (await gameDetailsResponse.json()).data[0];

        const thumbnails = await fetchThumbnailsBatch([{ id: universeId }], 'GameIcon', '50x50');

        return {
            id: universeId,
            name: assetDetails.Name,
            playerCount: gameData?.playing || 0,
            thumbnail: thumbnails.get(universeId)
        };
    } catch (error) {
        console.error(`RoValra Game Details: Failed to fetch details for Place ID ${placeId}.`, error);
        return null;
    }
}