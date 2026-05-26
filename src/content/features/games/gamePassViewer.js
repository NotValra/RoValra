import { callRobloxApiJson } from '../../core/api.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { observeElement } from '../../core/observer.js';
import { getGamePassIdFromUrl } from '../../core/idExtractor.js';
import { settings } from '../../core/settings/getSettings.js';

const ERROR_SEL =
    '.request-error-page-content, .default-error-page, .error-page-container';

let renderedFor = null;
let activeObservation = null;

async function fetchPass(passId) {
    const [productInfo, details] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/game-passes/${passId}/product-info`,
        }).catch(() => null),
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/game-passes/${passId}/details`,
        }).catch(() => null),
    ]);

    if (!productInfo && !details) return null;

    return {
        name: productInfo?.Name ?? details?.name ?? '',
        description: productInfo?.Description ?? details?.description ?? '',
        price: productInfo?.PriceInRobux ?? details?.priceInformation?.defaultPriceInRobux ?? 0,
        isForSale: productInfo?.IsForSale ?? details?.isForSale ?? false,
        productId: productInfo?.ProductId,
        iconId: productInfo?.IconImageAssetId ?? details?.iconAssetId,
        placeId: details?.placeId,
        creator: {
            id: productInfo?.Creator?.CreatorTargetId ?? 0,
            name: productInfo?.Creator?.Name ?? ts('privateGames.unknown'),
            type: productInfo?.Creator?.CreatorType === 'Group' ? 'Group' : 'User',
        },
    };
}

async function fetchPlace(placeId) {
    if (!placeId) return null;
    try {
        const res = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
        });
        return Array.isArray(res) ? res[0] : null;
    } catch {
        return null;
    }
}

function loadThumbInto(container, id, type, size, alt) {
    if (!container || !id) return;
    fetchThumbnails([{ id }], type, size).then((map) => {
        const data = map.get(id) || map.get(Number(id));
        if (!data?.imageUrl) return;
        const img = document.createElement('img');
        img.src = data.imageUrl;
        img.alt = alt || '';
        container.innerHTML = '';
        container.appendChild(img);
    });
}

function render(data, place, passId) {
    const content = document.getElementById('content');
    if (!content) return;
    if (document.getElementById('item-container')) return;

    injectStylesheet('css/itemPage.css', 'rovalra-roblox-itempage-css');

    const {
        name,
        description,
        price,
        isForSale,
        productId,
        iconId,
        creator,
        isOwned,
    } = data;

    document.title = `${name} - Roblox`;
    const creatorPath = creator.type === 'Group' ? 'communities' : 'users';
    const placeName = place?.name;
    const placeId = place?.placeId || data.placeId;
    const universeId = place?.universeId;

    const ownedTag = isOwned
        ? `<div class="divider">&nbsp;</div>
           <div class="label-checkmark"><span class="icon-checkmark-white-bold"></span></div>
           <span>${ts('gamePassViewer.owned')} Item</span>`
        : '';

    const isLight = document.body.classList.contains('light-theme');
    const buyBg = isLight ? '#272930' : '#ffffff';
    const buyFg = isLight ? '#ffffff' : '#272930';
    const buyStyle =
        `width:180px;height:52px;padding:15px;font-size:20px;font-weight:500;border-radius:8px;background:${buyBg};color:${buyFg};border:1px solid ${buyBg};box-sizing:border-box;line-height:100%;cursor:not-allowed;text-align:center;display:inline-block;text-decoration:none;opacity:0.5;`;
    const actionBtn = isOwned
        ? `<a id="inventory-button" href="https://www.roblox.com/my/inventory" class="btn-fixed-width-lg btn-control-md">${ts('gamePassViewer.inventory')}</a>`
        : isForSale
          ? `<button id="rovalra-gp-buy" type="button" class="PurchaseButton" style="${buyStyle}" disabled>${ts('privateGames.passes.buy')}</button>`
          : `<button type="button" class="PurchaseButton" style="${buyStyle}" disabled>${ts('privateGames.passes.offSale')}</button>`;

    const priceInfo = !isForSale && !isOwned
        ? `<span class="text-label">${ts('privateGames.passes.offSale')}</span>`
        : `<div class="icon-text-wrapper clearfix icon-robux-price-container" style="display:inline-flex;align-items:center;gap:4px;">
                <span id="rovalra-gp-robux-icon"></span>
                <span class="text-robux-lg">${price === 0 ? 'Free' : Number(price).toLocaleString()}</span>
           </div>`;

    const ownedFirstLine = isOwned
        ? `<div class="item-first-line">${ts('gamePassViewer.ownedNotice')}</div>`
        : '';

    const hasRelated = !!(placeId && placeName);
    const relatedAsset = hasRelated
        ? `<div class="related-asset-container">
                <div class="asset-info">
                    <p class="preview-text small font-caption-body">${ts('gamePassViewer.usePassIn')} <a class="text-name text-overflow font-caption-body" href="https://www.roblox.com/games/${placeId}">${placeName}</a></p>
                </div>
                <div class="asset-thumbnail">
                    <a href="https://www.roblox.com/games/${placeId}" id="rovalra-gp-place-thumb"></a>
                </div>
           </div>`
        : '';

    content.innerHTML = DOMPurify.sanitize(`
        <div id="item-container" class="section page-content library-item" data-item-id="${passId}" data-item-name="${name}" data-asset-type="Game Pass" data-product-id="${productId || ''}" data-expected-currency="1" data-expected-price="${price}" data-seller-name="${creator.name}">
            <div class="section-content top-section remove-panel">
                <div class="border-bottom item-name-container">
                    <h1>${name}</h1>
                    <div>
                        <span class="text-label">${ts('gamePassViewer.by')} ${
                            creator.id
                                ? `<a href="https://www.roblox.com/${creatorPath}/${creator.id}/profile/" class="text-name">@${creator.name}</a>`
                                : `<span class="text-name">${creator.name}</span>`
                        }</span>
                        ${ownedTag}
                    </div>
                </div>
                <div class="item-thumbnail-container">
                    <div id="AssetThumbnail" class="asset-thumb-container thumbnail-holder thumbnail-Small three-dee-static"${hasRelated ? ' has-related-info=""' : ''}>
                        <span class="thumbnail-span" id="rovalra-gp-icon"></span>
                        ${relatedAsset}
                    </div>
                </div>
                <div id="item-details" class="item-details">
                    <div class="clearfix price-container">
                        <div class="price-container-text">
                            ${ownedFirstLine}
                            <div class="text-label field-label price-label">${ts('gamePassViewer.price')}</div>
                            <div class="price-info" style="display:block;">${priceInfo}</div>
                        </div>
                        <div class="action-button">${actionBtn}</div>
                    </div>
                    <div class="clearfix item-type-field-container">
                        <div class="text-label text-overflow field-label">${ts('gamePassViewer.type')}</div>
                        <span class="field-content">${ts('gamePassViewer.typeValue')}</span>
                    </div>
                    ${description ? `
                        <div class="clearfix toggle-target item-field-container">
                            <div class="text-label text-overflow field-label">${ts('privateGames.description.title')}</div>
                            <p class="field-content description-content">${description}</p>
                        </div>` : ''}
                </div>
            </div>
        </div>
    `);

    const robuxSlot = document.getElementById('rovalra-gp-robux-icon');
    if (robuxSlot) {
        robuxSlot.replaceWith(
            createRobuxIcon({ size: '20px', verticalAlign: '-3px' }),
        );
    }

    loadThumbInto(
        document.getElementById('rovalra-gp-icon'),
        iconId || Number(passId),
        iconId ? 'Asset' : 'GamePass',
        '420x420',
    );
    if (universeId)
        loadThumbInto(
            document.getElementById('rovalra-gp-place-thumb'),
            Number(universeId),
            'GameIcon',
            '150x150',
        );

    document.addEventListener('rovalraGamePassPurchased', (e) => {
        if (String(e.detail?.gamePassId) === String(passId)) {
            renderedFor = null;
            renderFor(passId);
        }
    });
}

async function renderFor(passId) {
    if (renderedFor === passId) return;
    renderedFor = passId;

    const data = await fetchPass(passId);
    if (!data) {
        renderedFor = null;
        return;
    }

    const place = await fetchPlace(data.placeId);
    render(data, place, passId);
}

async function initGamePassViewer() {
    if (activeObservation) {
        activeObservation.disconnect();
        activeObservation = null;
    }

    const passId = getGamePassIdFromUrl();
    if (!passId) {
        renderedFor = null;
        return;
    }

    if (!(await settings.gamePassViewerEnabled)) return;

    activeObservation = observeElement(ERROR_SEL, () => {
        if (renderedFor !== passId) renderFor(passId);
    });
}

export function init() {
    initGamePassViewer();
}
