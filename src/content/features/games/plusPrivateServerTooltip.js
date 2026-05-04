import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAssets } from '../../core/assets.js';
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

            const createInfoIcon = (originalPrice) => {
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

                const tooltipText = `Original Price: <b>${originalPrice} Robux</b><br>Currently shows as <b>Free</b> due to Roblox Plus.`;
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
                        priceSpan.appendChild(createInfoIcon(originalPrice));
                    }
                },
                { multiple: true },
            );

            // WITH the RoSeal extension server list redesign
            observeElement(
                'span.text-body-medium.content-muted',
                async (textEl) => {
                    if (
                        !textEl.textContent.includes(
                            'Unlimited included with Plus',
                        )
                    )
                        return;
                    if (textEl.dataset.rovalraPlusEnhanced) return;
                    textEl.dataset.rovalraPlusEnhanced = 'true';

                    const placeId = getPlaceIdFromUrl();
                    if (!placeId) return;

                    const originalPrice = await getOriginalPrice(placeId);
                    if (originalPrice === undefined || originalPrice === null)
                        return;

                    textEl.appendChild(createInfoIcon(originalPrice));
                },
                { multiple: true },
            );
        },
    );
}
