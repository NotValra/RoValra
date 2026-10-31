import { settings } from '../../core/settings/getSettings.js';

export const ROVALRA_AD_ITEMS = [
    { type: 'Asset', id: 118786417395090 },
    { type: 'Asset', id: 80169931282102 },
];

const SETTING_NAME = 'marketplaceRovalraAdsEnabled';
const AD_CHANCE = 0.25;
const MAX_ADS = 1;

const shownAdItems =
    Math.random() < AD_CHANCE
        ? [...ROVALRA_AD_ITEMS]
              .sort(() => Math.random() - 0.5)
              .slice(0, MAX_ADS)
        : [];

export function getShownAdItems() {
    return shownAdItems;
}

function dispatchState(enabled) {
    document.dispatchEvent(
        new CustomEvent('rovalra-marketplace-ads', {
            detail: { enabled, items: enabled ? shownAdItems : [] },
        }),
    );
}

export async function init() {
    dispatchState((await settings[SETTING_NAME]) === true);

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === SETTING_NAME) {
            dispatchState(event.detail.value === true);
        }
    });
}
