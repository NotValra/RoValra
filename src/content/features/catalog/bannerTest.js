import { init as initBanner } from '../../core/ui/catalog/catalogBanner.js';
import { observeElement } from '../../core/observer.js';

let isInitialized = false;

export function init() {
    if (!window.location.href.includes('/catalog')) return;

    chrome.storage.local.get({ EnablebannerTest: false }, (settings) => {
        if (!settings.EnablebannerTest) return;

        initBanner();

        if (isInitialized) return;
        isInitialized = true;

        observeElement('#rovalra-catalog-notice-banner', () => {
            if (!window.location.href.includes('/catalog')) return;

            if (window.CatalogBannerManager) {
                window.CatalogBannerManager.addNotice(
                    "Catalog Test Banner",
                    `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
                    "This is a test banner loaded on the catalog page to verify functionality."
                );
            }
        });
    });
}