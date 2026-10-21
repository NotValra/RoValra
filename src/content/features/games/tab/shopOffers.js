import { callRobloxApiJson } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { createPill } from '../../../core/ui/general/pill.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { ts } from '../../../core/locale/i18n.js';
import { settings as rovalraSettings } from '../../../core/settings/getSettings.js';

let offersPromise = null;

async function fetchShopOffers() {
    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: '/checkout/v1/offers?featureKeys=ROBLOX_SHOP',
        method: 'GET',
    });

    const now = Date.now();

    return (Array.isArray(data?.offers) ? data.offers : []).filter(
        (offer) =>
            offer?.offerStatus === 'AVAILABLE' &&
            (!offer.expirationTimeInUTC ||
                new Date(offer.expirationTimeInUTC).getTime() > now),
    );
}

function getShopOffers() {
    if (!offersPromise) {
        offersPromise = fetchShopOffers().catch((error) => {
            offersPromise = null;
            throw error;
        });
    }
    return offersPromise;
}

function getOfferPresentation(offer, type) {
    return (offer.presentationData || []).find((data) => data?.type === type);
}

function createOfferRow(offer) {
    const banner = getOfferPresentation(offer, 'BANNER')?.banner;
    const title =
        banner?.title ||
        getOfferPresentation(offer, 'MENU_BADGE')?.menuBadge?.title;
    if (!title) return null;

    const row = document.createElement('div');
    row.className = 'rovalra-shop-offer';

    const pills = document.createElement('div');
    pills.className = 'rovalra-shop-offer-pills';

    const titlePill = createPill(title, banner?.modal?.body || null, {
        size: 'small',
    });
    titlePill.classList.add('rovalra-shop-offer-pill');
    pills.appendChild(titlePill);

    if (offer.expirationTimeInUTC) {
        const expiresContent = document.createDocumentFragment();
        expiresContent.append(
            `${ts('shop.offers.expires')} `,
            createInteractiveTimestamp(offer.expirationTimeInUTC),
        );
        pills.appendChild(createPill(expiresContent, null, { size: 'small' }));
    }

    const note = document.createElement('span');
    note.className = 'text-body-medium rovalra-shop-offer-note';
    note.textContent = ts('shop.offers.inGameOnly');

    row.append(pills, note);
    return row;
}

async function renderOffers(anchor) {
    if (anchor.dataset.rovalraShopOffersLoaded === 'true') return;
    anchor.dataset.rovalraShopOffersLoaded = 'true';

    let offers;
    try {
        offers = await getShopOffers();
    } catch (error) {
        console.warn('RoValra: Failed to load shop offers', error);
        delete anchor.dataset.rovalraShopOffersLoaded;
        return;
    }

    const rows = offers.map(createOfferRow).filter(Boolean);
    if (rows.length === 0 || !anchor.isConnected) return;

    anchor.parentElement
        ?.querySelector(':scope > .rovalra-shop-offers')
        ?.remove();

    const container = document.createElement('div');
    container.className = 'rovalra-shop-offers';
    container.append(...rows);
    anchor.after(container);
}

const STORE_HEADER_SELECTOR =
    '#rbx-game-passes > .container-header, #roseal-game-passes > .container-header';

export async function init() {
    if (!(await rovalraSettings.shopOffersEnabled)) return;

    injectStylesheet('css/shop-offers.css', 'rovalra-shop-offers-css');

    const [devProductsEnabled, shopWidgetsEnabled] = await Promise.all([
        rovalraSettings.EnableDevProducts,
        rovalraSettings.shopWidgetsEnabled,
    ]);

    if (devProductsEnabled === false && shopWidgetsEnabled === false) {
        observeElement(STORE_HEADER_SELECTOR, renderOffers, { multiple: true });
        return;
    }

    observeElement(
        STORE_HEADER_SELECTOR.split(', ')
            .map((header) => `${header} > div > .rovalra-pill-toggle`)
            .join(', '),
        (toggle) => renderOffers(toggle.parentElement),
        { multiple: true },
    );
}
