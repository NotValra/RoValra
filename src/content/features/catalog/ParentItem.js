import * as storage from "../../core/chrome/localStorage.js";
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApi } from '../../core/api.js';
import { init as initBanner } from '../../core/ui/catalog/catalogBanner.js';
import { observeElement } from '../../core/observer.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { ts } from '../../core/locale/i18n.js';
import { getAssets } from '../../core/assets.js';

let currentItemId = null;

export function init() {
    storage.get({ ParentItemsEnabled: false }).then(async (settings) => {
        if (!settings.ParentItemsEnabled) return;

        const itemId = getPlaceIdFromUrl();

        const banner = document.getElementById(
            'rovalra-catalog-notice-banner',
        );
        if (banner) {
            banner.innerHTML = '';
            banner.removeAttribute('style');
            banner.classList.remove('rovalra-banner-compact');
        }

        if (!itemId) {
            currentItemId = null;
            return;
        }

        if (!window.location.pathname.includes('/catalog/')) {
            currentItemId = null;
            return;
        }

        currentItemId = itemId;

        initBanner();

        try {
            const response = await callRobloxApi({
                subdomain: 'catalog',
                endpoint: `/v1/assets/${itemId}/bundles?limit=10`,
            });

            if (!response.ok) return;
            if (currentItemId !== itemId) return;

            const data = await response.json();

            observeElement('.content #item-bundles', () => {
                if (currentItemId !== itemId) return;
                const banner = document.getElementById(
                    'rovalra-catalog-notice-banner',
                );
                if (banner) {
                    banner.innerHTML = '';
                    banner.removeAttribute('style');
                    banner.classList.remove('rovalra-banner-compact');
                }
            });

            if (document.querySelector('.content #item-bundles')) return;

            if (data && data.data && data.data.length > 0) {
                if (data.data.length > 1) {
                    const assets = getAssets();
                    let iconHtml = decodeURIComponent(
                        assets.ListAlt.split(',')[1],
                    );

                    observeElement(
                        '#rovalra-catalog-notice-banner',
                        (banner) => {
                            if (currentItemId !== itemId) return;

                            if (window.CatalogBannerManager) {
                                if (
                                    banner.innerHTML.includes(
                                        ts('parentItem.multipleBundles'),
                                    )
                                )
                                    return;

                                window.CatalogBannerManager.addNotice(
                                    ts('parentItem.multipleBundles'),
                                    iconHtml,
                                    ts(
                                        'parentItem.multipleBundlesDescription',
                                    ),
                                );
                            }
                        },
                    );
                    return;
                }

                const bundle = data.data[0];

                let iconHtml = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 6h-3V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM9 4h6v2H9V4zm11 15H4V8h16v11z"/></svg>`;

                try {
                    const thumbMap = await fetchThumbnails(
                        [{ id: bundle.id }],
                        'BundleThumbnail',
                        '150x150',
                    );
                    if (currentItemId !== itemId) return;

                    const thumbData = thumbMap.get(bundle.id);
                    if (thumbData && thumbData.state === 'Completed') {
                        iconHtml = `<img src="${thumbData.imageUrl}" style="width: 100px; height: 100px; object-fit: contain; border-radius: 4px;">`;
                    }
                } catch (e) {
                    console.warn(
                        'RoValra: Failed to fetch bundle thumbnail',
                        e,
                    );
                }

                if (currentItemId !== itemId) return;

                observeElement(
                    '#rovalra-catalog-notice-banner',
                    (banner) => {
                        if (currentItemId !== itemId) return;

                        if (window.CatalogBannerManager) {
                            const bundleUrl = `https://www.roblox.com/bundles/${bundle.id}/${encodeURIComponent(bundle.name)}`;

                            if (banner.innerHTML.includes(bundleUrl))
                                return;

                            window.CatalogBannerManager.addNotice(
                                ts('parentItem.partOfBundle', {
                                    bundleName: bundle.name,
                                    bundleUrl: bundleUrl,
                                }),
                                iconHtml,
                                ts('parentItem.viewingFromBundle'),
                            );

                            const links = banner.querySelectorAll(
                                `a[href="${bundleUrl}"]`,
                            );
                            links.forEach((link) => {
                                link.addEventListener('click', (e) =>
                                    e.stopPropagation(),
                                );
                            });
                        }
                    },
                );
            }
        } catch (e) {
            console.warn('RoValra: Failed to fetch parent bundle info', e);
        }
    });
}
