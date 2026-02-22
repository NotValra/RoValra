import { getPlaceIdFromUrl, getAssetIdFromUrl, getUserIdFromUrl } from '../../core/idExtractor.js';

export function init() {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'copyToClipboard' && request.text) {
            navigator.clipboard.writeText(request.text).catch((err) => {
                console.error('RoValra: Failed to copy ID', err);
            });
        }
    });

    document.addEventListener(
        'mousedown',
        (e) => {
            if (e.button !== 2) return;

            const link = e.target.closest('a');
            const ids = [];

            if (link) {
                const url = link.href;

                const bundleMatch = url.match(/\/bundles\/(\d+)/);
                const catalogMatch = url.match(/\/catalog\/(\d+)/);
                const gamePassMatch = url.match(/\/game-pass\/(\d+)/);
                const badgeMatch = url.match(/\/badges\/(\d+)/);
                const groupMatch = url.match(/\/(?:groups|communities)\/(\d+)/);
                const eventMatch = url.match(/\/events\/(\d+)/);
                const devProductMatch = url.match(/\/developer-product\/\d+\/product\/(\d+)/);

                if (bundleMatch) {
                    ids.push({ type: 'Bundle', id: bundleMatch[1] });
                } else if (catalogMatch) {
                    ids.push({ type: 'Asset', id: catalogMatch[1] });
                } else if (gamePassMatch) {
                    ids.push({ type: 'GamePass', id: gamePassMatch[1] });
                } else if (badgeMatch) {
                    ids.push({ type: 'Badge', id: badgeMatch[1] });
                } else if (groupMatch) {
                    ids.push({ type: 'Community', id: groupMatch[1] });
                } else if (eventMatch) {
                    ids.push({ type: 'Event', id: eventMatch[1] });
                } else if (devProductMatch) {
                    ids.push({ type: 'Developer Product', id: devProductMatch[1] });
                } else {
                    const placeId = getPlaceIdFromUrl(url);
                    if (placeId) {
                        ids.push({ type: 'Place', id: placeId });
                        ids.push({ type: 'Universe', id: placeId });
                    }

                    const assetId = getAssetIdFromUrl(url);
                    if (assetId) ids.push({ type: 'Asset', id: assetId });
                }

                const userId = getUserIdFromUrl(url);
                if (userId) ids.push({ type: 'User', id: userId });
            }

            chrome.runtime.sendMessage({
                action: 'updateContextMenu',
                ids: ids,
            });
        },
        { capture: true },
    );
}
