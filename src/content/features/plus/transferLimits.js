import { observeElement } from '../../core/observer.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
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
let upsertPromise = Promise.resolve();
let initialized = false;
let hasRenderedRealData = false;
let refillsExpanded = false;

function removeTransferLimits() {
    document
        .querySelectorAll('.rovalra-plus-transfer-limits')
        .forEach((element) => element.remove());
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

function getUpcomingRefills(data, now = Date.now()) {
    const monthlyLimit = Number(data?.monthlyLimit);
    const releases = Array.isArray(data?.monthly?.releases)
        ? data.monthly.releases
              .filter((release) => release.timestampMs > now)
              .sort((a, b) => a.timestampMs - b.timestampMs)
        : [];
    if (!Number.isFinite(monthlyLimit) || releases.length === 0) return [];

    let pending = releases.reduce(
        (total, release) => total + release.amount,
        0,
    );
    return releases.map((release) => {
        pending -= release.amount;
        return {
            ...release,
            remainingAfter: Math.max(0, monthlyLimit - pending),
        };
    });
}

async function createRefillSection(refills) {
    if (refills.length === 0) return '';

    const [nextRefillLabel, noteText, ...leftLabels] = await Promise.all([
        t('plus.transferLimits.nextRefill'),
        t('plus.transferLimits.refillNote'),
        ...refills.map((refill) =>
            t('plus.transferLimits.leftAfter', {
                amount: formatRobux(refill.remainingAfter),
            }),
        ),
    ]);
    const next = refills[0];
    const rows = refills
        .map(
            (refill, index) => safeHtml`
                <div class="gap-x-small flex items-center justify-between">
                    <span
                        class="rovalra-transfer-refill-time text-body-medium content-default"
                        data-timestamp="${refill.timestampMs}">
                    </span>
                    <span class="gap-x-medium flex items-center">
                        <span class="text-body-medium content-emphasis">+${formatRobux(refill.amount)}</span>
                        <span class="text-body-medium content-muted">${leftLabels[index]}</span>
                    </span>
                </div>`,
        )
        .join('');

    return `
        <div class="radius-medium bg-shift-200 clip flex flex-col">
            ${safeHtml`
                <button
                    type="button"
                    class="rovalra-transfer-refills-trigger relative clip group/interactable focus-visible:outline-focus gap-small cursor-pointer content-default bg-none stroke-none width-full padding-large flex items-center justify-between"
                    aria-expanded="false">
                    <div
                        role="presentation"
                        class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)]">
                    </div>
                    <span class="gap-y-small min-width-0 grow-1 flex flex-col items-start">
                        <span class="text-title-medium content-default">${nextRefillLabel}</span>
                        <span class="gap-x-small flex items-center">
                            <span class="text-heading-small content-emphasis gap-x-xsmall flex items-center">
                                <span
                                    role="presentation"
                                    class="grow-0 shrink-0 basis-auto icon icon-regular-robux size-[var(--icon-size-small)]">
                                </span>
                                +${formatRobux(next.amount)}
                            </span>
                            <span
                                class="rovalra-transfer-refill-time text-body-medium content-muted"
                                data-timestamp="${next.timestampMs}">
                            </span>
                        </span>
                    </span>
                    <span class="rovalra-transfer-refills-chevron shrink-0 size-500 icon icon-regular-chevron-large-down motion-safe:transition-transform duration-200"></span>
                </button>`}
            <div
                class="rovalra-transfer-refills-list padding-x-large padding-bottom-large gap-y-small flex flex-col">
                ${rows}
                ${safeHtml`<span class="text-caption-medium content-muted">${noteText}</span>`}
            </div>
        </div>`;
}

function applyRefillsExpanded(container) {
    const trigger = container.querySelector(
        '.rovalra-transfer-refills-trigger',
    );
    const list = container.querySelector('.rovalra-transfer-refills-list');
    const chevron = container.querySelector(
        '.rovalra-transfer-refills-chevron',
    );
    if (!trigger || !list) return;

    trigger.setAttribute('aria-expanded', String(refillsExpanded));
    list.style.display = refillsExpanded ? 'flex' : 'none';
    if (chevron) {
        chevron.style.transform = refillsExpanded
            ? 'rotate(180deg)'
            : 'rotate(0deg)';
    }
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

async function upsertTransferLimitsNow(data = null) {
    const insertionPoint = findInsertionPoint();
    if (!insertionPoint?.parent) return false;
    if (!data && hasRenderedRealData) return true;

    removeTransferLimits();

    const container = document.createElement('div');
    container.className = containerClasses;
    const dailyLimit = data?.dailyLimit;
    const monthlyLimit = data?.monthlyLimit;
    const [
        dailyLimitLabel,
        monthlyLimitLabel,
        sentTodayLabel,
        sentThisMonthLabel,
        captionText,
        refillSection,
    ] = await Promise.all([
        t('plus.transferLimits.dailyLimitLeft'),
        t('plus.transferLimits.monthlyLimitLeft'),
        t('plus.transferLimits.sentToday'),
        t('plus.transferLimits.sentThisMonth'),
        t('plus.transferLimits.caption', {
            dailyLimit: formatRobux(dailyLimit),
            monthlyLimit: formatRobux(monthlyLimit),
        }),
        createRefillSection(getUpcomingRefills(data)),
    ]);
    const caption = safeHtml`
        <span class="text-caption-medium content-muted">
            ${captionText}
        </span>`;

    container.innerHTML = `
        <div class="gap-x-small flex">
            ${createStatCard(dailyLimitLabel, data?.remainingToday)}
            ${createStatCard(monthlyLimitLabel, data?.remainingThisMonth)}
        </div>
        <div class="gap-x-small flex">
            ${createStatCard(sentTodayLabel, data?.sentToday)}
            ${createStatCard(sentThisMonthLabel, data?.sentThisMonth)}
        </div>
        ${refillSection}
        ${caption}`;

    container
        .querySelectorAll('.rovalra-transfer-refill-time')
        .forEach((element) => {
            element.appendChild(
                createInteractiveTimestamp(Number(element.dataset.timestamp)),
            );
        });
    container
        .querySelector('.rovalra-transfer-refills-trigger')
        ?.addEventListener('click', () => {
            refillsExpanded = !refillsExpanded;
            applyRefillsExpanded(container);
        });
    applyRefillsExpanded(container);

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

function upsertTransferLimits(data = null) {
    const update = upsertPromise.then(
        () => upsertTransferLimitsNow(data),
        () => upsertTransferLimitsNow(data),
    );
    upsertPromise = update.then(() => undefined, () => undefined);
    return update;
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
                await upsertTransferLimits(cachedData);
            } else {
                await upsertTransferLimits();
            }

            const data = await updateRobuxTransferData();
            return await upsertTransferLimits(data);
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

        await upsertTransferLimits(event.detail?.transferData);
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
