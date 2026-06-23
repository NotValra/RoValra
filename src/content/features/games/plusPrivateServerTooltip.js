import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
import { t } from '../../core/locale/i18n.js';
import {
    getPlaceDetails,
    getCloudUniverseDetails,
} from '../../core/apis/games.js';

export async function init() {
    chrome.storage.local.get(
        { PlusPrivateServerTooltipEnabled: true },
        async (settings) => {
            if (!settings.PlusPrivateServerTooltipEnabled) return;

            const userId = await getAuthenticatedUserId();
            if (!userId) return;

            try {
                const membershipStatus = await callRobloxApiJson({
                    subdomain: 'premiumfeatures',
                    endpoint: `/v1/users/${userId}/validate-membership`,
                });

                if (String(membershipStatus) !== 'true') return;
            } catch (e) {
                return;
            }

            const getOriginalPrice = async (placeId) => {
                try {
                    const placeDetails = await getPlaceDetails(placeId);
                    const universeId = placeDetails?.universeId;
                    if (!universeId) return null;

                    const cloudData = await getCloudUniverseDetails(universeId);
                    return cloudData?.privateServerPriceRobux;
                } catch (e) {
                    console.warn(
                        'RoValra: Failed to fetch original price for Roblox Plus tooltip',
                        e,
                    );
                    return null;
                }
            };

            const createInfoIcon = async (originalPrice) => {
                const assets = getAssets();
                const infoIcon = document.createElement('span');
                infoIcon.className = 'icon-info';
                infoIcon.style.marginLeft = '4px';
                infoIcon.style.color = 'var(--rovalra-main-text-color)';
                infoIcon.style.cursor = 'help';
                infoIcon.style.display = 'inline-block';
                infoIcon.style.verticalAlign = 'middle';
                infoIcon.style.width = '16px';
                infoIcon.style.height = '16px';
                infoIcon.innerHTML = decodeURIComponent(
                    assets.priceFloorIcon.split(',')[1],
                );

                const tooltipText = await t(
                    'plus.privateServerTooltip.tooltipText',
                    {
                        originalPrice,
                    },
                );
                addTooltip(infoIcon, tooltipText, { position: 'top' });

                return infoIcon;
            };

            // WITHOUT the roseal extension
            observeElement(
                '.create-server-banner-text',
                async (bannerTextEl) => {
                    if (bannerTextEl.dataset.rovalraPlusEnhanced) return;
                    bannerTextEl.dataset.rovalraPlusEnhanced = 'true';

                    const placeId = getPlaceIdFromUrl();
                    if (!placeId) return;

                    const originalPrice = await getOriginalPrice(placeId);
                    if (originalPrice === undefined || originalPrice === null)
                        return;

                    const priceSpan = bannerTextEl.querySelector(
                        '.private-server-price',
                    );
                    if (priceSpan) {
                        createInfoIcon(originalPrice).then((icon) =>
                            priceSpan.appendChild(icon),
                        );
                    }
                },
                { multiple: true },
            );

            // WITH the RoSeal extension server list redesign
            observeElement(
                '.icon-filled-person-play',
                async (iconEl) => {
                    const container = iconEl.closest(
                        'div.flex.items-center.gap-medium',
                    );
                    if (!container) return;

                    const textEl = await new Promise((resolve) => {
                        const check = () => {
                            const el = container.querySelector(
                                'span.text-body-medium.content-muted',
                            );
                            if (el) resolve(el);
                            else setTimeout(check, 10);
                        };
                        check();
                    });

                    if (textEl.dataset.rovalraPlusEnhanced) return;
                    textEl.dataset.rovalraPlusEnhanced = 'true';

                    const placeId = getPlaceIdFromUrl();
                    if (!placeId) return;

                    const originalPrice = await getOriginalPrice(placeId);
                    if (originalPrice === undefined || originalPrice === null)
                        return;

                    createInfoIcon(originalPrice).then((icon) =>
                        textEl.appendChild(icon),
                    );
                },
                { multiple: true, subtree: true },
            );
        },
    );
}
