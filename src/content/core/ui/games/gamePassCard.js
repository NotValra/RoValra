import {
    createThumbnailElement,
    getQueuedThumbnail,
} from '../../thumbnail/thumbnails.js';
import { ts } from '../../locale/i18n.js';
import { showPurchaseModal } from './purchaseModal.js';

const thumbnailCache = new Map();

export function createGamePassCard(
    gamePassData,
    assetThumbnailMap = new Map(),
) {
    const data =
        typeof gamePassData === 'object' ? gamePassData : { id: gamePassData };
    const nameText = data.name || 'Game Pass';
    const gamePassId = data.id || data.gamePassId;
    const isOwned = data.isOwned ?? false;
    const isForSale = data.isForSale ?? true;

    const iconId = data.displayIconImageAssetId || data.IconImageAssetId;
    const targetId = iconId || gamePassId;
    const targetType = iconId ? 'Asset' : 'GamePass';
    const cacheKey = `${targetType}:${targetId}`;
    const cachedThumb = thumbnailCache.get(cacheKey);

    const listItem = document.createElement('li');
    listItem.className = 'list-item';

    const storeCard = document.createElement('div');
    storeCard.className = 'store-card';

    const link = document.createElement('a');
    link.href = `/game-pass/${gamePassId}/${nameText.replace(/\s/g, '-')}`;
    link.className = 'gear-passes-asset store-card-link';

    link.style.position = 'relative';
    link.style.width = '100%';
    link.style.paddingBottom = '100%';
    link.style.borderRadius = '8px';
    link.style.overflow = 'hidden';

    const thumb = createThumbnailElement(
        cachedThumb || { state: 'Pending', thumbnailType: targetType },
        nameText,
        'store-card-image',
        {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            borderRadius: '0px',
        },
    );
    thumb.title = nameText;
    link.appendChild(thumb);
    storeCard.appendChild(link);

    const caption = document.createElement('div');
    caption.className = 'store-card-caption';

    const name = document.createElement('div');
    name.title = nameText;
    name.className = 'text-overflow store-card-name';
    name.textContent = nameText;
    caption.appendChild(name);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'store-card-price';

    const price = data.price ?? data.priceValue;

    if (!isOwned && !isForSale) {
        priceDiv.classList.add('offsale');
        const offSaleSpan = document.createElement('span');
        offSaleSpan.className = 'text-label';
        offSaleSpan.style.color = 'var(--rovalra-secondary-text-color)';
        const offSaleText = document.createElement('span');
        offSaleText.className = 'text-overflow font-caption-body';
        offSaleText.textContent = ts('privateGames.passes.offSale');
        offSaleSpan.appendChild(offSaleText);
        priceDiv.appendChild(offSaleSpan);
    } else {
        const robuxIcon = document.createElement('span');
        robuxIcon.className = 'icon-robux-16x16';
        const robuxText = document.createElement('span');
        robuxText.className = 'text-robux';

        robuxText.textContent =
            price !== null && price !== undefined
                ? price === 0
                    ? 'Free'
                    : price.toLocaleString()
                : '...';

        priceDiv.appendChild(robuxIcon);
        priceDiv.appendChild(robuxText);
    }

    caption.appendChild(priceDiv);

    const footer = document.createElement('div');
    footer.className = 'store-card-footer';

    if (isOwned) {
        const ownedText = document.createElement('h5');
        ownedText.textContent = ts('privateGames.passes.owned');
        footer.appendChild(ownedText);
    } else {
        const buyButton = document.createElement('button');
        buyButton.type = 'button';
        buyButton.className =
            'rbx-gear-passes-purchase PurchaseButton btn-buy-md btn-full-width';

        buyButton.textContent = isForSale
            ? ts('privateGames.passes.buy')
            : ts('privateGames.passes.offSale');
        buyButton.disabled = !isForSale;

        buyButton.dataset.itemId = gamePassId;
        buyButton.dataset.itemName = nameText;
        buyButton.dataset.productId = data.productId || '';
        buyButton.dataset.expectedPrice = price || 0;
        buyButton.dataset.assetType = 'Game Pass';
        buyButton.dataset.expectedSellerId =
            data.creator?.creatorId || data.sellerId || 0;
        buyButton.dataset.sellerName =
            data.creator?.name || data.sellerName || 'Unknown';
        buyButton.dataset.expectedCurrency = '1';

        footer.appendChild(buyButton);

        buyButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            showPurchaseModal(gamePassId, 'GamePass', data);
        });
    }

    caption.appendChild(footer);
    storeCard.appendChild(caption);
    listItem.appendChild(storeCard);

    document.addEventListener('rovalraGamePassPurchased', (event) => {
        if (event.detail.gamePassId === gamePassId && event.detail.isOwned) {
            data.isOwned = true;

            const currentFooter = listItem.querySelector('.store-card-footer');
            if (currentFooter) {
                currentFooter.innerHTML = '';
                const ownedText = document.createElement('h5');
                ownedText.textContent = ts('privateGames.passes.owned');
                currentFooter.appendChild(ownedText);
            }

            const currentPriceDiv = listItem.querySelector('.store-card-price');
            if (currentPriceDiv) {
                currentPriceDiv.innerHTML = '';
            }

            const buyButton = listItem.querySelector('.PurchaseButton');
            if (buyButton) buyButton.disabled = true;
        }
    });

    if (!cachedThumb) {
        (async () => {
            const newThumbData = await getQueuedThumbnail(targetId, targetType);
            if (newThumbData && thumb.parentNode) {
                thumbnailCache.set(cacheKey, newThumbData);
                const newThumb = createThumbnailElement(
                    newThumbData,
                    nameText,
                    'store-card-image',
                    {
                        position: 'absolute',
                        top: '0',
                        left: '0',
                        width: '100%',
                        height: '100%',
                        borderRadius: '0px',
                    },
                );
                newThumb.title = nameText;
                thumb.parentNode.replaceChild(newThumb, thumb);
            }
        })();
    }

    return listItem;
}
