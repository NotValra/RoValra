import { observeElement, observeAttributes } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
import { settings } from '../../core/settings/getSettings.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';
import { getShownAdItems } from './rovalraAds.js';

const PILL_CLASS = 'rovalra-ad-pill';
const AD_ITEM_IDS = new Set(getShownAdItems().map((item) => String(item.id)));

let initialized = false;
let adText = '';
let tooltipText = '';

function getCardItemId(card) {
    const href = card.querySelector('a.item-card-link')?.href;
    return href ? getPlaceIdFromUrl(href) : null;
}

function createAdPill() {
    const pill = document.createElement('div');
    pill.className = `${PILL_CLASS} text-caption-medium`;
    const logo = document.createElement('span');
    logo.className = 'rovalra-ad-pill-logo';
    const mask = `url("${getAssets().contributorIcon}") no-repeat center / contain`;
    logo.style.webkitMask = mask;
    logo.style.mask = mask;

    pill.append(logo, document.createTextNode(adText));

    addTooltip(pill, tooltipText, { position: 'top' });
    return pill;
}

function updateCard(card) {
    const thumb = card.querySelector('.item-card-thumb-container-inner');
    if (!thumb) return;

    const existing = thumb.querySelector(`:scope > .${PILL_CLASS}`);
    const isAd = AD_ITEM_IDS.has(getCardItemId(card));

    if (isAd && !existing) {
        thumb.appendChild(createAdPill());
    } else if (!isAd && existing) {
        existing.remove();
    }
}

export async function init() {
    if (initialized || !AD_ITEM_IDS.size) return;
    if (!(await settings.marketplaceRovalraAdsEnabled)) return;
    initialized = true;

    [adText, tooltipText] = await Promise.all([
        t('rovalraAds.ad'),
        t('rovalraAds.tooltip'),
    ]);

    observeElement(
        '.item-card-container',
        (card) => {
            updateCard(card);
            const link = card.querySelector('a.item-card-link');
            if (link) {
                observeAttributes(link, () => updateCard(card), ['href']);
            }
        },
        { multiple: true },
    );
}
