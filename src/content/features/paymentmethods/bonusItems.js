import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { settings } from '../../core/settings/getSettings.js';

const BONUS_ITEMS = [
    'd8ed6443-4c80-46b0-924c-2ce353b6c336',
    'c7968d42-475e-4b88-8109-33f4604bb4c9',
    '860a7100-f82a-4071-9e76-90bca21d0584',
    '64dec592-12b9-43f5-8910-325c34a6a140',
];
const SLOW_REQUEST_INTERVAL_MS = 1000;
const FAST_REQUEST_INTERVAL_MS = 250;

let paymentMethodsObserver;
let activeDropdown;
let activeCard;
let activePurchaseSummary;
let eligibilityPromise;
let renderGeneration = 0;
let bonusLoadingStarted = false;
let bonusLoadingAccelerated = false;
let wakeBonusLoader;
const bonusItems = BONUS_ITEMS.map((paymentSessionId) => ({
    label: '',
    value: paymentSessionId,
    description: '',
    loading: true,
}));

function getCurrentUserId() {
    const userData = document.querySelector('meta[name="user-data"]');
    const userId = Number(userData?.getAttribute('data-userid'));
    return Number.isFinite(userId) && userId > 0
        ? userId
        : getAuthenticatedUserId();
}

function findEligibilityFlag(value) {
    if (!value || typeof value !== 'object') return undefined;
    if (typeof value.isUserEligibleForPersonalizedBonus === 'boolean') {
        return value.isUserEligibleForPersonalizedBonus;
    }

    for (const nestedValue of Object.values(value)) {
        const result = findEligibilityFlag(nestedValue);
        if (result !== undefined) return result;
    }

    return undefined;
}

async function fetchGamePass(gamePassId) {
    const [productInfo, details] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/game-passes/${gamePassId}/product-info`,
        }).catch(() => null),
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/game-passes/${gamePassId}/details`,
        }).catch(() => null),
    ]);

    if (!productInfo && !details) return null;

    return {
        name: productInfo?.Name ?? details?.name ?? 'Bonus item',
        iconId: productInfo?.IconImageAssetId ?? details?.iconAssetId,
    };
}

async function isEligibleForPersonalizedBonus() {
    if (eligibilityPromise) return eligibilityPromise;

    eligibilityPromise = (async () => {
        const userId = await getCurrentUserId();
        if (!userId) return false;

        const metadata = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/payments-gateway/v1/feature/metadata?userId=${userId}`,
        });

        return findEligibilityFlag(metadata) === true;
    })().catch((error) => {
        console.warn(
            'RoValra: Failed to check personalized bonus eligibility.',
            error,
        );
        eligibilityPromise = null;
        return false;
    });

    return eligibilityPromise;
}

function refreshBonusDropdown() {
    activeDropdown?.refresh();
}

function waitForBonusRequestSlot() {
    const delay = bonusLoadingAccelerated
        ? FAST_REQUEST_INTERVAL_MS
        : SLOW_REQUEST_INTERVAL_MS;

    return new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        wakeBonusLoader = () => {
            clearTimeout(timer);
            wakeBonusLoader = null;
            resolve();
        };
    });
}

function accelerateBonusLoading() {
    bonusLoadingAccelerated = true;
    wakeBonusLoader?.();
}

async function loadBonusItem(item) {
    try {
        const session = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/payments-bonus-service/v1/bonus-sessions',
            method: 'POST',
            body: { paymentSessionId: item.value },
        });
        const displayableBonus =
            session?.selectedDisplayableBonuses?.[0] ||
            session?.productDisplayableBonuses?.[0];
        const productTargetId =
            displayableBonus?.bonus?.virtualPurchasingProductTargetId;
        const gamePassPayload = displayableBonus?.gamePassPayload;
        const avatarItemPayload = displayableBonus?.avatarItemPayload;
        const gamePass = productTargetId
            ? await fetchGamePass(productTargetId)
            : null;

        item.label =
            gamePass?.name ||
            avatarItemPayload?.displayName ||
            avatarItemPayload?.itemDisplayName ||
            'Bonus item';
        item.description =
            gamePassPayload?.experienceDisplayName ||
            avatarItemPayload?.experienceDisplayName ||
            '';
        refreshBonusDropdown();

        if (!productTargetId) {
            item.loading = false;
            refreshBonusDropdown();
            return;
        }

        const thumbnailId = gamePass?.iconId || productTargetId;
        const thumbnailType = gamePass?.iconId
            ? 'Asset'
            : gamePassPayload
              ? 'GamePass'
              : 'Asset';
        const [thumbnail] = await getBatchThumbnails(
            [thumbnailId],
            thumbnailType,
            '150x150',
        );
        if (thumbnail?.state === 'Completed') {
            item.imageUrl = thumbnail.imageUrl;
        }
        item.loading = false;
        refreshBonusDropdown();
    } catch (error) {
        item.label = 'Bonus item unavailable';
        item.description = 'Could not load details';
        item.loading = false;
        refreshBonusDropdown();
        console.warn(
            `RoValra: Failed to load bonus session ${item.value}.`,
            error,
        );
    }
}

async function startBonusItemLoading() {
    if (bonusLoadingStarted) return;
    bonusLoadingStarted = true;

    for (let index = 0; index < bonusItems.length; index++) {
        if (index > 0) await waitForBonusRequestSlot();
        await loadBonusItem(bonusItems[index]);
    }
}

function getPaymentPageData(container) {
    try {
        return JSON.parse(container.dataset.paymentMethodsPage || '{}');
    } catch (error) {
        console.warn(
            'RoValra: Failed to read payment methods page data.',
            error,
        );
        return null;
    }
}

function navigateToBonusSession(paymentSessionId) {
    const url = new URL(window.location.href);
    if (url.searchParams.get('paymentSessionId') === paymentSessionId) return;

    url.searchParams.set('paymentSessionId', paymentSessionId);

    const link = document.createElement('a');
    link.href = url.href;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function addBonusItemDropdown(purchaseSummary) {
    const generation = ++renderGeneration;

    const container = purchaseSummary.closest('#payment-methods-container');
    if (!container) return;

    const pageData = getPaymentPageData(container);
    const robuxAmount = Number(pageData?.selectedPaymentsProduct?.robuxAmount);
    if (!Number.isFinite(robuxAmount) || robuxAmount < 2000) return;

    const summaryColumn = purchaseSummary?.closest(
        '.flex-1.flex.flex-col.gap-xxlarge',
    );
    if (!summaryColumn) return;

    activeDropdown?.destroy();
    activeDropdown = null;
    activeCard?.remove();
    activeCard = null;
    activePurchaseSummary = purchaseSummary;

    const currentSessionId = new URL(window.location.href).searchParams.get(
        'paymentSessionId',
    );
    const initialValue = bonusItems.some(
        (item) => item.value === currentSessionId,
    )
        ? currentSessionId
        : undefined;

    const card = document.createElement('div');
    card.id = 'rovalra-bonus-item-card';
    card.className =
        'flex flex-col gap-medium radius-medium stroke-standard stroke-default width-full padding-medium';
    activeCard = card;

    const heading = document.createElement('div');
    heading.className = 'flex flex-col gap-xsmall';

    const title = document.createElement('h3');
    title.className = 'text-heading-small content-emphasis';
    title.textContent = 'Choose a bonus item';

    const description = document.createElement('p');
    description.className = 'text-body-small content-secondary';
    description.textContent =
        'Select the bonus included with this Robux purchase.';

    heading.append(title, description);

    activeDropdown = createDropdown({
        items: bonusItems,
        initialValue,
        placeholder: 'Choose a bonus item',
        onValueChange: navigateToBonusSession,
        onOpen: accelerateBonusLoading,
    });
    activeDropdown.element.classList.add('width-full');
    activeDropdown.trigger.id = 'rovalra-bonus-item-select';
    activeDropdown.trigger.style.width = '100%';

    card.append(heading, activeDropdown.element);
    summaryColumn.insertBefore(card, summaryColumn.firstElementChild);

    const isEligible = await isEligibleForPersonalizedBonus();
    if (generation !== renderGeneration || !purchaseSummary.isConnected) return;
    if (!isEligible) {
        activeDropdown?.destroy();
        activeDropdown = null;
        activeCard?.remove();
        activeCard = null;
        activePurchaseSummary = null;
        return;
    }

    startBonusItemLoading();
}

export async function init() {
    if (
        !window.location.pathname
            .toLowerCase()
            .includes('/upgrades/paymentmethods')
    ) {
        return;
    }
    if (!(await settings.bonusItemEnabled)) {
        paymentMethodsObserver?.disconnect();
        paymentMethodsObserver = null;
        activeDropdown?.destroy();
        activeDropdown = null;
        activeCard?.remove();
        activeCard = null;
        activePurchaseSummary = null;
        return;
    }

    if (paymentMethodsObserver?.active) {
        const purchaseSummary = document.querySelector(
            '#payment-methods-container .purchase-summary-expand',
        );
        if (
            purchaseSummary &&
            !document.getElementById('rovalra-bonus-item-card')
        ) {
            addBonusItemDropdown(purchaseSummary);
        }
        return;
    }

    paymentMethodsObserver = observeElement(
        '#payment-methods-container .purchase-summary-expand',
        addBonusItemDropdown,
        {
            multiple: true,
            onRemove: (removedSummary) => {
                if (removedSummary !== activePurchaseSummary) return;

                renderGeneration++;
                activeDropdown?.destroy();
                activeDropdown = null;
                activeCard?.remove();
                activeCard = null;
                activePurchaseSummary = null;

                setTimeout(() => {
                    const currentSummary = document.querySelector(
                        '#payment-methods-container .purchase-summary-expand',
                    );
                    if (currentSummary) addBonusItemDropdown(currentSummary);
                }, 0);
            },
        },
    );
}
