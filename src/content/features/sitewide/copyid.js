import {
    getPlaceIdFromUrl,
    getAssetIdFromUrl,
    getUserIdFromUrl,
} from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';

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
        async (e) => {
            if (e.button !== 2) return;

            const link = e.target.closest('a');
            const ids = [];
            const typeTranslations = {
                Bundle: await t('copyId.copyId', {
                    type: await t('copyId.types.bundle'),
                }),
                Asset: await t('copyId.copyId', {
                    type: await t('copyId.types.asset'),
                }),
                GamePass: await t('copyId.copyId', {
                    type: await t('copyId.types.gamePass'),
                }),
                Badge: await t('copyId.copyId', {
                    type: await t('copyId.types.badge'),
                }),
                Community: await t('copyId.copyId', {
                    type: await t('copyId.types.community'),
                }),
                Event: await t('copyId.copyId', {
                    type: await t('copyId.types.event'),
                }),
                'Developer Product': await t('copyId.copyId', {
                    type: await t('copyId.types.developerProduct'),
                }),
                Place: await t('copyId.copyId', {
                    type: await t('copyId.types.place'),
                }),
                Universe: await t('copyId.copyUniverseId'),
                User: await t('copyId.copyId', {
                    type: await t('copyId.types.user'),
                }),
            };

            if (link) {
                const url = link.href;

                const bundleMatch = url.match(/\/bundles\/(\d+)/);
                const catalogMatch = url.match(/\/catalog\/(\d+)/);
                const gamePassMatch = url.match(/\/game-pass\/(\d+)/);
                const badgeMatch = url.match(/\/badges\/(\d+)/);
                const groupMatch = url.match(/\/(?:groups|communities)\/(\d+)/);
                const eventMatch = url.match(/\/events\/(\d+)/);
                const devProductMatch = url.match(
                    /\/developer-product\/\d+\/product\/(\d+)/,
                );

                if (bundleMatch) {
                    ids.push({
                        type: 'Bundle',
                        id: bundleMatch[1],
                        title: typeTranslations['Bundle'],
                    });
                } else if (catalogMatch) {
                    ids.push({
                        type: 'Asset',
                        id: catalogMatch[1],
                        title: typeTranslations['Asset'],
                    });
                } else if (gamePassMatch) {
                    ids.push({
                        type: 'GamePass',
                        id: gamePassMatch[1],
                        title: typeTranslations['GamePass'],
                    });
                } else if (badgeMatch) {
                    ids.push({
                        type: 'Badge',
                        id: badgeMatch[1],
                        title: typeTranslations['Badge'],
                    });
                } else if (groupMatch) {
                    ids.push({
                        type: 'Community',
                        id: groupMatch[1],
                        title: typeTranslations['Community'],
                    });
                } else if (eventMatch) {
                    ids.push({
                        type: 'Event',
                        id: eventMatch[1],
                        title: typeTranslations['Event'],
                    });
                } else if (devProductMatch) {
                    ids.push({
                        type: 'Developer Product',
                        id: devProductMatch[1],
                        title: typeTranslations['Developer Product'],
                    });
                } else {
                    const placeId = getPlaceIdFromUrl(url);
                    if (placeId) {
                        ids.push({
                            type: 'Place',
                            id: placeId,
                            title: typeTranslations['Place'],
                        });
                        ids.push({
                            type: 'Universe',
                            id: placeId,
                            title: typeTranslations['Universe'],
                        });
                    }

                    const assetId = getAssetIdFromUrl(url);
                    if (assetId)
                        ids.push({
                            type: 'Asset',
                            id: assetId,
                            title: typeTranslations['Asset'],
                        });
                }

                const userId = getUserIdFromUrl(url);
                if (userId)
                    ids.push({
                        type: 'User',
                        id: userId,
                        title: typeTranslations['User'],
                    });
            }

            chrome.runtime.sendMessage({
                action: 'updateContextMenu',
                ids: ids,
            });
        },
        { capture: true },
    );
}
