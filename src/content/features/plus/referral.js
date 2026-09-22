import { observeElement } from '../../core/observer.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';

const ROSEAL_REFERRAL_URL =
    'https://www.roblox.com/plus?ctx=plus_referral&referralCode=afcab169-d61e-477e-845c-7720b803d27f&referrerId=447170745';
const DEFAULT_REFERRAL_URL =
    'https://www.roblox.com/plus-referral?v=v2&code=afcab169-d61e-477e-845c-7720b803d27f';
const SUBSCRIBE_BUTTON_SELECTOR = '[data-testid="purchase-open-sheet-button"]';
const REFERRAL_CONTAINER_ATTRIBUTE = 'data-rovalra-plus-referral';

function getReferralUrl() {
    const isRoSealLoaded = document.querySelector(
        'meta[name="roseal-script-loaded"][data-script-env="main"]',
    );

    return isRoSealLoaded ? ROSEAL_REFERRAL_URL : DEFAULT_REFERRAL_URL;
}

async function addReferralOffer(subscribeButton) {
    if (subscribeButton.dataset.rovalraReferralEnhanced === 'true') return;

    const buttonRow = subscribeButton.parentElement;
    const subscriptionSection = buttonRow?.parentElement;
    if (!buttonRow || !subscriptionSection) return;

    if (subscriptionSection.hasAttribute(REFERRAL_CONTAINER_ATTRIBUTE)) return;

    const [reward, details, buttonLabel] = await Promise.all([
        t('plus.referral.reward'),
        t('plus.referral.details'),
        t('plus.referral.button'),
    ]);

    const referralContainer = document.createElement('div');
    referralContainer.setAttribute(REFERRAL_CONTAINER_ATTRIBUTE, 'true');
    referralContainer.className = 'gap-y-small flex flex-col width-full';
    referralContainer.innerHTML = safeHtml`
        <span class="text-heading-small content-emphasis">${reward}</span>
        <span class="text-caption-medium content-muted">${details}</span>
        <div class="width-full gap-x-small flex shrink-0 flex-row items-start justify-center">
            <button
                type="button"
                class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-medium height-1000 padding-x-medium bg-action-emphasis content-action-emphasis width-full large:width-[320px] shrink-0"
                data-testid="rovalra-plus-referral-button">
                <div aria-hidden="true" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                <span class="flex items-center min-width-0 gap-small">
                    <span class="padding-y-xsmall text-truncate-end text-no-wrap">${buttonLabel}</span>
                </span>
            </button>
        </div>`;

    referralContainer
        .querySelector('[data-testid="rovalra-plus-referral-button"]')
        .addEventListener('click', () => {
            window.location.assign(getReferralUrl());
        });

    buttonRow.after(referralContainer);
    subscribeButton.dataset.rovalraReferralEnhanced = 'true';
}

export async function init() {
    if ((await settings.plusReferralEnabled) === false) return;

    observeElement(SUBSCRIBE_BUTTON_SELECTOR, addReferralOffer, {
        multiple: true,
    });
}
