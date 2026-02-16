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

                if (bundleMatch) {
                    ids.push({ type: 'Bundle', id: bundleMatch[1] });
                } else if (catalogMatch) {
                    ids.push({ type: 'Asset', id: catalogMatch[1] });
                } else {
                    const placeId = getPlaceIdFromUrl(url);
                    if (placeId) ids.push({ type: 'Place', id: placeId });

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
