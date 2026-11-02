import { getAssetIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAssetTypeLabel } from '../../core/utils/assetTypes.js';

const SETTING_NAME = 'offSaleCreatePageEnabled';

const detailsRequests = new Map();
let typeFieldObserver = null;

function fetchAssetDetails(assetId) {
    if (!detailsRequests.has(assetId)) {
        detailsRequests.set(
            assetId,
            callRobloxApiJson({
                subdomain: 'economy',
                endpoint: `/v2/assets/${assetId}/details`,
            }).catch(() => null),
        );
    }
    return detailsRequests.get(assetId);
}

async function sendAssetDetails(assetId) {
    const enabled = (await settings[SETTING_NAME]) === true;
    const details = enabled ? await fetchAssetDetails(assetId) : null;
    document.dispatchEvent(
        new CustomEvent('rovalra-store-asset-details', {
            detail: { assetId, enabled, details },
        }),
    );
    return details;
}

function fillTypeField(typeLabel) {
    typeFieldObserver?.disconnect();
    typeFieldObserver = observeElement(
        '[class*="detailContainer"][class*="direction-xs-column"]',
        (container) => {
            const body = container.querySelector('[class*="bodyText"]');
            if (body && !body.textContent.trim()) {
                body.textContent = typeLabel;
            }
        },
        { multiple: true },
    );
}

if (location.hostname === 'create.roblox.com') {
    document.addEventListener('rovalra-store-asset-details-request', (e) => {
        const assetId = String(e.detail?.assetId ?? '');
        if (/^\d+$/.test(assetId)) sendAssetDetails(assetId);
    });
}

export async function init() {
    if (location.hostname !== 'create.roblox.com') return;
    const assetId = getAssetIdFromUrl();
    if (!assetId) return;

    const details = await sendAssetDetails(assetId);
    const typeLabel = getAssetTypeLabel(details?.AssetTypeId);
    if (typeLabel) fillTypeField(typeLabel);
}
