import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import { addTooltip } from '../../core/ui/tooltip.js';

export async function init() {
    chrome.storage.local.get({ PlusPrivateServerTooltipEnabled: true }, async (settings) => {
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
                const placeDetails = await callRobloxApiJson({
                    subdomain: 'games',
                    endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
                });
                const universeId = placeDetails?.[0]?.universeId;
                if (!universeId) return null;

                const cloudData = await callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: `/cloud/v2/universes/${universeId}`,
                    useApiKey: true,
                    useBackground: true,
                });
                return cloudData?.privateServerPriceRobux;
            } catch (e) {
                console.warn('RoValra: Failed to fetch original price for Roblox Plus tooltip', e);
                return null;
            }
        };

        const createInfoIcon = (originalPrice) => {
            const infoIcon = document.createElement('span');
            infoIcon.className = 'icon-moreinfo';
            infoIcon.style.marginLeft = '4px';
            infoIcon.style.cursor = 'help';
            infoIcon.style.display = 'inline-block';
            infoIcon.style.verticalAlign = 'middle';
            infoIcon.style.width = '16px';
            infoIcon.style.height = '16px';
            infoIcon.style.background = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\'/%3E%3Cline x1=\'12\' y1=\'16\' x2=\'12\' y2=\'12\'/%3E%3Cline x1=\'12\' y1=\'8\' x2=\'12.01\' y2=\'8\'/%3E%3C/svg%3E") no-repeat center';
            infoIcon.style.backgroundSize = 'contain';
            
            const theme = document.body.classList.contains('dark-theme') ? 'filter: invert(1);' : '';
            infoIcon.style.cssText += theme;

            const tooltipText = `Original Price: <b>${originalPrice} Robux</b><br>Currently shows as <b>Free</b> due to Roblox Plus.`;
            addTooltip(infoIcon, tooltipText, { position: 'top' });
            
            return infoIcon;
        };

        // WITHOUT the roseal extension
        observeElement('.create-server-banner-text', async (bannerTextEl) => {
            if (bannerTextEl.dataset.rovalraPlusEnhanced) return;
            bannerTextEl.dataset.rovalraPlusEnhanced = 'true';

            const placeId = getPlaceIdFromUrl();
            if (!placeId) return;

            const originalPrice = await getOriginalPrice(placeId);
            if (originalPrice === undefined || originalPrice === null) return;

            const priceSpan = bannerTextEl.querySelector('.private-server-price');
            if (priceSpan) {
                priceSpan.appendChild(createInfoIcon(originalPrice));
            }
        }, { multiple: true });

        // WITH the RoSeal extension server list redesign
        observeElement('span.text-body-medium.content-muted', async (textEl) => {
            if (!textEl.textContent.includes('Unlimited included with Plus')) return;
            if (textEl.dataset.rovalraPlusEnhanced) return;
            textEl.dataset.rovalraPlusEnhanced = 'true';

            const placeId = getPlaceIdFromUrl();
            if (!placeId) return;

            const originalPrice = await getOriginalPrice(placeId);
            if (originalPrice === undefined || originalPrice === null) return;

            textEl.appendChild(createInfoIcon(originalPrice));
        }, { multiple: true });
    });
}
