import { callRobloxApiJson } from '../../api.js';
import { getUserCurrency } from '../../user/userCurrency.js';
import {
    createThumbnailElement,
    getQueuedThumbnail,
} from '../../thumbnail/thumbnails.js';
import DOMPurify from 'dompurify';

export async function showPurchaseModal(
    itemId,
    itemType = 'GamePass',
    initialData = {},
) {
    const backdrop = document.createElement('div');
    backdrop.className =
        'fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto rovalra-purchase-overlay';
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100vw';
    backdrop.style.height = '100vh';
    backdrop.style.zIndex = '10000';

    const close = () => {
        backdrop.remove();
        document.body.style.overflow = '';
    };

    const modal = document.createElement('div');
    modal.className =
        'relative radius-large bg-surface-100 stroke-muted stroke-standard foundation-web-dialog-content shadow-transient-high relative unified-purchase-dialog-content';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('data-size', 'Large');
    modal.style.maxWidth = '500px';
    modal.style.width = '100%';
    modal.style.pointerEvents = 'auto';

    modal.addEventListener('click', (e) => e.stopPropagation());
    backdrop.addEventListener('click', close);

    modal.innerHTML = DOMPurify.sanitize(`
        <div class="absolute foundation-web-dialog-close-container">
            <button type="button" class="foundation-web-close-affordance flex stroke-none bg-none cursor-pointer relative clip group/interactable focus-visible:outline-focus disabled:outline-none bg-over-media-100 padding-medium radius-circle" aria-label="Close">
                <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-x size-[var(--icon-size-large)]"></span>
            </button>
        </div>
        <div class="padding-x-xlarge padding-top-xlarge padding-bottom-xlarge gap-xlarge flex flex-col" id="purchase-modal-body">
            <div style="margin-top: 2px;">
                <div id="rbx-unified-purchase-heading" class="flex flex-row items-center justify-between" style="padding-right: 42px;">
                    <span class="text-heading-medium">Buy Item</span>
                    <div class="flex flex-row items-center">
                        <span class="icon-robux-16x16"></span>
                        <span class="text-robux ml-1 text-body-medium" id="user-balance">...</span>
                    </div>
                </div>
            </div>
            <div class="flex flex-row items-center gap-large">
                <div class="relative shrink-0 unified-modal-thumbnail-container" style="width: 110px; height: 110px; max-width: 40vw; max-height: 40vw;">
                    <div class="rounded shimmer" style="width: 100%; height: 100%; background-color: rgba(255, 255, 255, 0.06);"></div>
                    <div class="absolute unified-modal-thumbnail" style="inset: 0px; display: flex; align-items: center; justify-content: center;"></div>
                </div>
                <div class="min-w-0 flex flex-col gap-small">
                    <span class="text-body-large break-words">
                        <span class="font-bold item-name">${initialData.name || '...'}</span>
                    </span>
                    <div class="flex flex-row items-center flex-wrap gap-x-small item-price-container">
                        <span class="flex flex-row items-center">
                            <span class="icon-robux-16x16"></span>
                            <span class="text-robux item-price">${
                                initialData.price !== undefined
                                    ? initialData.price === 0
                                        ? 'Free'
                                        : initialData.price.toLocaleString()
                                    : '...'
                            }</span>
                        </span>
                    </div>
                </div>
            </div>
            <div id="discount-section"></div>
            <div class=" flex flex-col mt-[40px]">
                <div class="gap-small flex flex-col">
                    <div class="flex flex-row-reverse">
                        <button type="button" data-testid="purchase-confirm-button" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-large height-1200 padding-x-medium bg-action-emphasis content-action-emphasis fill basis-0" disabled>
                            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                            <span class="flex items-center min-width-0 gap-small"><span class="padding-y-xsmall text-truncate-end text-no-wrap">Buy</span></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    modal.querySelector('.foundation-web-close-affordance').onclick = close;

    try {
        const [productInfo, currencyData] = await Promise.all([
            itemType === 'GamePass'
                ? callRobloxApiJson({
                      subdomain: 'apis',
                      endpoint: `/game-passes/v1/game-passes/${itemId}/product-info`,
                  })
                : Promise.resolve(null),
            getUserCurrency().catch(() => null),
        ]);

        if (!productInfo) throw new Error('Info fetch failed');

        if (currencyData && typeof currencyData.robux === 'number') {
            const balEl = modal.querySelector('#user-balance');
            if (balEl) balEl.textContent = currencyData.robux.toLocaleString();
        }

        modal.querySelector('.item-name').textContent = productInfo.Name;
        const currentPrice = productInfo.PriceInRobux || 0;
        modal.setAttribute('data-rovalra-expected-price', currentPrice);
        const priceEl = modal.querySelector('.item-price');
        if (priceEl) {
            priceEl.textContent =
                currentPrice === 0 ? 'Free' : currentPrice.toLocaleString();
        }

        const thumbContainer = modal.querySelector('.unified-modal-thumbnail');
        const thumbId = productInfo.IconImageAssetId || itemId;
        const thumbType = productInfo.IconImageAssetId ? 'Asset' : 'GamePass';

        const thumbData = await getQueuedThumbnail(thumbId, thumbType);

        const thumbEl = createThumbnailElement(
            thumbData,
            productInfo.Name,
            '',
            { width: '100%', height: '100%', borderRadius: '4px' },
        );

        const span = document.createElement('span');
        span.className = 'thumbnail-2d-container';
        span.appendChild(thumbEl);
        thumbContainer.appendChild(span);

        modal
            .querySelector('.unified-modal-thumbnail-container .shimmer')
            ?.classList.remove('shimmer');

        const discount = productInfo.PriceDiscountDetails?.[0];
        if (discount && productInfo.UserBasePriceInRobux > currentPrice) {
            const originalPrice = productInfo.UserBasePriceInRobux;
            const savings =
                discount.AmountInRobux || originalPrice - currentPrice;

            const strikePrice = document.createElement('span');
            strikePrice.className = 'flex flex-row items-center';
            strikePrice.style.cssText =
                'text-decoration: line-through; opacity: 0.6;';
            strikePrice.innerHTML = DOMPurify.sanitize(
                `<span class="icon-robux-16x16"></span><span class="text-robux">${originalPrice.toLocaleString()}</span>`,
            );
            modal
                .querySelector('.item-price-container')
                .appendChild(strikePrice);

            const discountDiv = modal.querySelector('#discount-section');
            discountDiv.innerHTML = DOMPurify.sanitize(`
                <div class="foundation-web-accordion flex flex-col items-start width-full text-body-medium padding-none stroke-default stroke-thick radius-medium">
                    <div data-contained="false" data-state="closed" class="foundation-web-accordion-item width-full">
                        <button id="fui-a-1-trigger" type="button" class="relative clip group/interactable focus-visible:outline-focus disabled:outline-none relative flex items-center justify-between gap-small cursor-pointer content-default bg-none stroke-none width-full min-height-1000 padding-y-small padding-x-none !padding-medium bg-shift-100 width-full flex flex-row items-center justify-between" aria-expanded="false" aria-controls="fui-a-1-content">
                            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                            <div class="flex items-center min-width-0 grow-1">
                                <span class="text-align-x-left text-title-medium">
                                    <div class="flex flex-row items-center gap-x-small content-emphasis">
                                        <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-roblox-plus size-[var(--icon-size-medium)]"></span>
                                        <span>Saving <span class="icon-robux-16x16"></span><span class="text-robux">${savings}</span> with Plus</span>
                                    </div>
                                </span>
                            </div>
                            <span class="foundation-web-accordion-chevron shrink-0 size-500 icon icon-regular-chevron-large-down motion-safe:transition-transform duration-200"></span>
                        </button>
                        <div id="fui-a-1-content" role="region" aria-labelledby="fui-a-1-trigger" aria-hidden="true" data-state="closed" data-size="medium" class="foundation-web-accordion-content grid clip width-full motion-safe:transition-all duration-200 ease-standard-out" style="display: none;">
                            <div class="foundation-web-accordion-content-inner width-full min-height-0 clip padding-top-none padding-bottom-none motion-safe:transition-transform duration-200 pointer-events-none !padding-none">
                                <div class="padding-medium padding-bottom-small flex flex-col gap-y-small bg-shift-100 stroke-default stroke-thick" style="border-top: 0px; border-left: 0px; border-right: 0px;">
                                    <div class="flex flex-row items-center justify-between content-default">
                                        <span>Subtotal</span>
                                        <span class="flex flex-row items-center"><span class="icon-robux-16x16"></span><span class="text-robux">${originalPrice.toLocaleString()}</span></span>
                                    </div>
                                    <div class="flex flex-row items-center justify-between content-default">
                                        <span>Plus benefit (${discount.Percent}% off)</span>
                                        <span class="flex flex-row items-center"><span class="text-robux">-</span><span class="icon-robux-16x16"></span><span class="text-robux">${savings}</span></span>
                                    </div>
                                </div>
                                <div class="padding-medium flex flex-row items-center justify-between text-heading-small content-default bg-shift-100">
                                    <span>Total</span>
                                    <span class="flex flex-row items-center"><span class="icon-robux-16x16"></span><span class="text-robux">${currentPrice.toLocaleString()}</span></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `);

            const trigger = modal.querySelector('#fui-a-1-trigger');
            const content = modal.querySelector('#fui-a-1-content');
            const chevron = modal.querySelector(
                '.foundation-web-accordion-chevron',
            );
            trigger.onclick = () => {
                const isOpen = trigger.getAttribute('aria-expanded') === 'true';
                const nextState = isOpen ? 'closed' : 'open';
                trigger.setAttribute('aria-expanded', !isOpen);
                content.style.display = isOpen ? 'none' : 'block';
                content.setAttribute('data-state', nextState);
                content.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
                chevron.style.transform = isOpen
                    ? 'rotate(0deg)'
                    : 'rotate(180deg)';
            };
        }

        const buyBtn = modal.querySelector(
            '[data-testid="purchase-confirm-button"]',
        );

        const userBalance = currencyData?.robux ?? 0;
        const canAfford = userBalance >= currentPrice;

        if (!canAfford) {
            buyBtn.querySelector('.padding-y-xsmall').textContent =
                'Insufficient Robux';
            buyBtn.disabled = true;
        } else {
            buyBtn.disabled = false;
            buyBtn.onclick = async () => {
                buyBtn.disabled = true;
                const originalBtnText =
                    buyBtn.querySelector('.padding-y-xsmall').textContent;
                buyBtn.querySelector('.padding-y-xsmall').textContent =
                    'Purchasing...';

                try {
                    const purchaseBody = { expectedPrice: currentPrice };

                    const purchaseResponse = await callRobloxApiJson({
                        subdomain: 'apis',
                        endpoint: `/game-passes/v1/game-passes/${productInfo.ProductId}/purchase`,
                        method: 'POST',
                        body: purchaseBody,
                    });

                    if (purchaseResponse.purchased) {
                        const finalBalance =
                            (currencyData?.robux ?? 0) - currentPrice;

                        const gamePassPurchasedEvent = new CustomEvent(
                            'rovalraGamePassPurchased',
                            {
                                detail: {
                                    gamePassId: itemId,
                                    isOwned: true,
                                },
                            },
                        );
                        modal.innerHTML = DOMPurify.sanitize(`
                            <div class="absolute foundation-web-dialog-close-container">
                                <button type="button" class="foundation-web-close-affordance flex stroke-none bg-none cursor-pointer relative clip group/interactable focus-visible:outline-focus disabled:outline-none bg-over-media-100 padding-small radius-circle" aria-label="Close">
                                    <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                                    <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-x size-[var(--icon-size-medium)]"></span>
                                </button>
                            </div>
                            <div class="padding-x-xlarge padding-top-xlarge padding-bottom-xlarge gap-xlarge flex flex-col">
                                <div style="margin-top: -4px;">
                                    <div id="rbx-unified-purchase-heading" class="flex flex-row items-center justify-between" style="padding-right: 42px;">
                                        <span class="text-heading-medium">Purchase Complete</span>
                                        <div class="flex flex-row items-center">
                                            <span class="icon-robux-16x16"></span>
                                            <span class="text-robux ml-1 text-body-medium">${finalBalance.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex justify-center gap-bottom-large">
                                    <span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-regular-circle-check size-[var(--icon-size-xlarge)]" style="font-size: 48px; width: 48px; height: 48px; line-height: 1;"></span>
                                </div>
                                <div id="unified-purchase-completion-modal-body" class="text-center text-body-large">You have successfully bought <b>${productInfo.Name}</b></div>
                            </div>
                            <div class="padding-x-xlarge padding-bottom-xlarge gap-small flex flex-col mt-[40px]">
                                <div class="flex flex-row-reverse">
                                    <button type="button" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-large height-1200 padding-x-medium bg-action-emphasis content-action-emphasis fill basis-0 rovalra-ok-btn" style="text-decoration: none;">
                                        <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                                        <span class="flex items-center min-width-0 gap-small"><span class="padding-y-xsmall text-truncate-end text-no-wrap">OK</span></span>
                                    </button>
                                </div>
                            </div>
                        `);

                        document.dispatchEvent(gamePassPurchasedEvent);
                        modal.querySelector('.rovalra-ok-btn').onclick = close;
                        modal.querySelector(
                            '.foundation-web-close-affordance',
                        ).onclick = close;
                    } else {
                        throw new Error(
                            purchaseResponse.reason || 'Purchase failed',
                        );
                    }
                } catch (err) {
                    console.error('RoValra: Purchase failed', err);
                    const errorMsg =
                        err.response?.message ||
                        err.message ||
                        'An error occurred during purchase.';
                    alert(`Purchase Error: ${errorMsg}`);
                    buyBtn.disabled = false;
                    buyBtn.querySelector('.padding-y-xsmall').textContent =
                        originalBtnText;
                }
            };
        }
    } catch (e) {
        console.error('RoValra: Failed to load purchase modal data', e);
        const errorMessage = e.message || 'Unknown error';
        modal.querySelector('#purchase-modal-body').innerHTML = `
            <div class="section-content default-error-page" style="text-align: center; padding: 20px;">
                <h3 style="margin-bottom: 10px;">Error Loading Item</h3>
                <p>We couldn't retrieve the information for this item. Details: ${errorMessage}. Please try again later.</p>
            </div>
        `; // Verified
    }
}
