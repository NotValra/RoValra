import {
    getOwnedCopies,
    OWN_USER_CACHE_MS,
} from '../../core/catalog/ownedCopies.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createMenuButton } from '../../core/ui/menuButton.js';
import { createSpinner } from '../../core/ui/spinner.js';
import { createOwnedCopyRows } from '../../core/ui/items/ownedCopiesList.js';
import { getAuthenticatedUserId } from '../../core/user.js';

const OWNED_SELECTOR = '.item-details-creator-container .item-owned';

let isInitialized = false;
let isEnabled = true;
const menus = new WeakMap();

function createMessage(text) {
    const el = document.createElement('div');
    el.className = 'rovalra-owned-since-message';
    el.textContent = text;
    return el;
}

async function buildContent(body, assetId) {
    const title = document.createElement('div');
    title.className = 'rovalra-owned-since-title';
    title.textContent = ts('ownedSince.title');

    const content = document.createElement('div');
    content.className = 'rovalra-owned-since-content';
    content.appendChild(createSpinner({ size: '18px' }));

    body.append(title, content);

    try {
        const userId = await getAuthenticatedUserId();
        if (!userId) throw new Error('Not logged in');

        const copies = await getOwnedCopies(userId, assetId, {
            maxAgeMs: OWN_USER_CACHE_MS,
        });

        if (copies.length === 0) {
            content.replaceChildren(createMessage(ts('ownedSince.unknown')));
            return;
        }

        content.replaceChildren(...createOwnedCopyRows(copies));
    } catch (err) {
        console.warn('RoValra: Failed to load owned since date', err);
        content.replaceChildren(createMessage(ts('ownedSince.error')));
    }
}

function removeForeignMenuButtons(ownedEl) {
    ownedEl
        .querySelectorAll('.menu-open-btn:not(.rovalra-menu-btn)')
        .forEach((btn) => btn.remove());
}

function attach(ownedEl) {
    if (!isEnabled) return;
    if (/\/bundles\//i.test(window.location.pathname)) return;

    const assetId = getPlaceIdFromUrl();
    if (!assetId) return;

    const existing = menus.get(ownedEl);
    if (existing?.assetId === assetId) return;
    existing?.menu.destroy();

    removeForeignMenuButtons(ownedEl);

    const menu = createMenuButton({
        anchor: ownedEl,
        className: 'rovalra-owned-since-popover',
        ariaLabel: ts('ownedSince.title'),
        cacheContent: true,
        buildContent: (body) => buildContent(body, assetId),
    });
    ownedEl.appendChild(menu.button);

    menus.set(ownedEl, { assetId, menu });
}

function detach(ownedEl) {
    const existing = menus.get(ownedEl);
    if (!existing) return;
    existing.menu.destroy();
    menus.delete(ownedEl);
}

function refreshAll() {
    document.querySelectorAll(OWNED_SELECTOR).forEach((el) => {
        if (isEnabled) attach(el);
        else detach(el);
    });
}

export async function init() {
    if (isInitialized) return;
    isInitialized = true;
    isEnabled = (await settings.ownedSinceEnabled) !== false;

    observeElement(OWNED_SELECTOR, attach, {
        multiple: true,
        onRemove: detach,
    });

    observeElement(
        `${OWNED_SELECTOR} .menu-open-btn:not(.rovalra-menu-btn)`,
        (btn) => {
            if (isEnabled && menus.has(btn.closest('.item-owned'))) {
                btn.remove();
            }
        },
        { multiple: true },
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes.ownedSinceEnabled) return;
        isEnabled = changes.ownedSinceEnabled.newValue !== false;
        refreshAll();
    });
}
