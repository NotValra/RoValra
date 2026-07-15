import { observeElement } from '../../core/observer.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    getCachedRobuxTransferData,
    initRobuxTransferTracking,
    ROBUX_TRANSFER_CHANGED_EVENT,
    updateRobuxTransferData,
} from '../../core/utils/trackers/robuxTransfers.js';

const legacyParentElementQuerySelector =
    '#roblox-subscription-container > .clip-x > .flex > .width-full.flex.flex-col.self-stretch';
const containerClasses =
    'gap-y-small flex flex-col rovalra-plus-transfer-limits';

let containerObserver = null;
let changeListenerAttached = false;
let renderPromise = null;
let initialized = false;
let hasRenderedRealData = false;

function removeTransferLimits() {
    document.querySelector('.rovalra-plus-transfer-limits')?.remove();
}

async function isFeatureEnabled() {
    return (await settings.plusTransferLimitsEnabled) !== false;
}

function formatRobux(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '...';
    return number.toLocaleString();
}

function createStatCard(label, value) {
    return safeHtml`
        <div
            class="
                radius-medium
                bg-shift-200
                padding-large
                gap-y-small
                min-width-0
                grow-1
                flex
                basis-0
                flex-col">
            <span class="text-title-medium content-default">${label}</span>
            <span class="text-heading-large content-emphasis">
                <span class="gap-x-xsmall flex items-center">
                    <span
                        role="presentation"
                        class="
                            grow-0
                            shrink-0
                            basis-auto
                            icon
                            icon-regular-robux
                            size-[var(--icon-size-medium)]">
                    </span>
                    ${formatRobux(value)}
                </span>
            </span>
        </div>`;
}

function findNativeStatsSection() {
    const statGrids = Array.from(
        document.querySelectorAll('.gap-y-small.flex.flex-col'),
    );
    const nativeStatsGrid = statGrids.find((element) => {
        const text = element.textContent || '';
        return (
            text.includes('Robux sent to friends') &&
            text.includes('All data shown here is delayed')
        );
    });

    return nativeStatsGrid?.closest('.gap-y-large.flex.flex-col') || null;
}

function findInsertionPoint() {
    const nativeStatsSection = findNativeStatsSection();
    if (nativeStatsSection?.parentElement) {
        return {
            parent: nativeStatsSection.parentElement,
            after: nativeStatsSection,
        };
    }

    const legacyParent = document.querySelector(
        legacyParentElementQuerySelector,
    );
    if (legacyParent) {
        return {
            parent: legacyParent,
            after: legacyParent.lastElementChild,
        };
    }

    return null;
}

function upsertTransferLimits(data = null) {
    const insertionPoint = findInsertionPoint();
    if (!insertionPoint?.parent) return false;
    if (!data && hasRenderedRealData) return true;

    insertionPoint.parent
        .querySelector('.rovalra-plus-transfer-limits')
        ?.remove();

    const container = document.createElement('div');
    container.className = containerClasses;
    const dailyLimit = data?.dailyLimit;
    const monthlyLimit = data?.monthlyLimit;
    const caption = safeHtml`
        <span class="text-caption-medium content-muted">
            Daily limit is ${formatRobux(dailyLimit)}. Monthly limit is ${formatRobux(monthlyLimit)}. Updates every 5 minutes.
        </span>`;

    container.innerHTML = `
        <div class="gap-x-small flex">
            ${createStatCard('Daily limit left', data?.remainingToday)}
            ${createStatCard('Monthly limit left', data?.remainingThisMonth)}
        </div>
        <div class="gap-x-small flex">
            ${createStatCard('Sent today', data?.sentToday)}
            ${createStatCard('Sent this month', data?.sentThisMonth)}
        </div>
        ${caption}`;

    if (data) {
        hasRenderedRealData = true;
    }

    if (insertionPoint.after?.parentElement === insertionPoint.parent) {
        insertionPoint.after.insertAdjacentElement('afterend', container);
    } else {
        insertionPoint.parent.appendChild(container);
    }

    return true;
}

async function renderTransferLimits() {
    if (renderPromise) return renderPromise;

    renderPromise = (async () => {
        try {
            if (!(await isFeatureEnabled())) {
                removeTransferLimits();
                return false;
            }

            const cachedData = await getCachedRobuxTransferData();
            if (cachedData) {
                upsertTransferLimits(cachedData);
            } else {
                upsertTransferLimits();
            }

            const data = await updateRobuxTransferData();
            return upsertTransferLimits(data);
        } catch (error) {
            console.warn(
                'RoValra: Failed to render Plus Robux transfer limits.',
                error,
            );
            return false;
        } finally {
            renderPromise = null;
        }
    })();

    return renderPromise;
}

function attachTransferLimitListener() {
    if (changeListenerAttached) return;
    changeListenerAttached = true;

    document.addEventListener(ROBUX_TRANSFER_CHANGED_EVENT, async (event) => {
        if (!(await isFeatureEnabled())) {
            removeTransferLimits();
            return;
        }

        upsertTransferLimits(event.detail?.transferData);
    });
}

export async function init() {
    if (!(await isFeatureEnabled())) {
        removeTransferLimits();
        return;
    }

    if (initialized) {
        renderTransferLimits();
        return;
    }

    initialized = true;
    initRobuxTransferTracking();
    attachTransferLimitListener();
    renderTransferLimits();
    containerObserver = observeElement('body', renderTransferLimits);
    observeElement('.gap-y-large.flex.flex-col', renderTransferLimits, {
        multiple: true,
    });
}
