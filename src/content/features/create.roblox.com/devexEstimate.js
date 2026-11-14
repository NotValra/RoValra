import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { createAssetIcon } from '../../core/ui/general/toast.js';
import { getCreatorHubUniverseIdFromUrl } from '../../core/idExtractor.js';
import {
    DEVEX_O18_USD_RATE,
    DEVEX_USD_RATE,
    convertCurrencyAmount,
    formatDisplayCurrency,
    getRobuxFiatSettings,
} from '../../core/transactions/fiat.js';

const OVERVIEW_PATH = /\/monetization\/overview\/?$/;
const CARD_CLASS = 'rovalra-devex-estimate';
const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_DELAY_MS = 1000;
const MAX_POLLS = 20;
const ELIGIBLE_COUNTRY = 'US';
const ELIGIBLE_AGE_GROUPS = ['Age18AndOverToUnder21', 'Age21OrOver'];

let anchorRequest = null;
let tooltipRequest = null;
let tooltipRate = null;
let hoveringRobuxChart = false;
let pageQuery = null;
let renderId = 0;

function getOverviewUniverseId() {
    return OVERVIEW_PATH.test(location.pathname)
        ? getCreatorHubUniverseIdFromUrl()
        : null;
}

async function queryRevenue(universeId, query) {
    for (let i = 0; i < MAX_POLLS; i++) {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/analytics-query-gateway/v1/metrics/resource/RESOURCE_TYPE_UNIVERSE/id/${universeId}`,
            method: 'POST',
            body: {
                resourceType: 'RESOURCE_TYPE_UNIVERSE',
                resourceId: String(universeId),
                query: {
                    metric: 'DailyRevenue',
                    granularity: 'METRIC_GRANULARITY_ONE_DAY',
                    ...query,
                },
            },
        });
        if (data?.operation?.done) {
            return data.operation.queryResult?.values || [];
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    }
    throw new Error('RoValra: Revenue query timed out');
}

function sumRevenue(values, since = null) {
    return values.reduce(
        (total, value) =>
            total +
            value.dataPoints.reduce(
                (sum, point) =>
                    !since || new Date(point.time) >= since
                        ? sum + (point.value || 0)
                        : sum,
                0,
            ),
        0,
    );
}

function getSelectedPeriodStart(query) {
    const end = new Date(query.endTime);
    const days = Math.round((end - new Date(query.startTime)) / DAY_MS) + 1;
    return new Date(end - (Math.floor(days / 2) - 1) * DAY_MS);
}

async function getEligibleRobux(universeId, query, periodStart) {
    const filters = query.filter || [];
    const countryFilter = filters.find((f) => f.dimension === 'Country');
    const ageFilter = filters.find((f) => f.dimension.startsWith('AgeGroup'));

    if (countryFilter && !countryFilter.values.includes(ELIGIBLE_COUNTRY)) {
        return 0;
    }
    const ageGroups = ageFilter
        ? ELIGIBLE_AGE_GROUPS.filter((age) => ageFilter.values.includes(age))
        : ELIGIBLE_AGE_GROUPS;
    if (!ageGroups.length) return 0;

    const values = await queryRevenue(universeId, {
        breakdown: [{ dimensions: ['AgeGroupV2'] }],
        filter: [
            ...filters.filter((f) => f !== countryFilter && f !== ageFilter),
            { dimension: 'Country', values: [ELIGIBLE_COUNTRY] },
        ],
        startTime: periodStart.toISOString(),
        endTime: query.endTime,
    });

    return sumRevenue(
        values.filter((value) =>
            ageGroups.includes(value.breakdownValue?.[0]?.value),
        ),
    );
}

async function getDevexRates(robuxAmount) {
    const amount = Math.max(1, Math.round(robuxAmount));
    try {
        const data = await callRobloxApiJson({
            subdomain: 'billing',
            endpoint: `/v1/estimated-fiat?robuxAmount=${amount}`,
        });
        return {
            standardRate: data.usdAmountMicro / 1e6 / amount || DEVEX_USD_RATE,
            premiumRate: data.effectiveO18ToUsdRate || DEVEX_O18_USD_RATE,
        };
    } catch {
        return {
            standardRate: DEVEX_USD_RATE,
            premiumRate: DEVEX_O18_USD_RATE,
        };
    }
}

async function getEstimate({ universeId, query, values }) {
    const periodStart = getSelectedPeriodStart(query);
    const totalRobux = sumRevenue(values, periodStart);
    const [eligibleRobux, { standardRate, premiumRate }] = await Promise.all([
        getEligibleRobux(universeId, query, periodStart),
        getDevexRates(totalRobux),
    ]);

    const premiumRobux = Math.min(totalRobux, eligibleRobux);
    const regularRobux = Math.max(0, totalRobux - premiumRobux);

    return {
        totalRobux,
        premiumRobux,
        regularRobux,
        standardRate,
        premiumRate,
        revenueUsd: premiumRobux * premiumRate + regularRobux * standardRate,
    };
}

function createRobuxIcon() {
    const icon = document.createElement('span');
    icon.className =
        'grow-0 shrink-0 basis-auto icon icon-filled-robux size-[var(--icon-size-medium)] content-emphasis';
    return icon;
}

function createStat(label, value, showRobuxIcon) {
    const stat = document.createElement('span');
    stat.className = 'block min-width-0 max-width-full';

    const labelElement = document.createElement('span');
    labelElement.className = 'block text-body-medium content-default';
    labelElement.textContent = label;

    const valueRow = document.createElement('span');
    valueRow.className = 'flex wrap items-center gap-y-xsmall';

    const valueElement = document.createElement('span');
    valueElement.className = `text-heading-medium [line-height:135%] content-emphasis padding-right-small ${showRobuxIcon ? 'padding-left-xsmall' : ''}`;
    valueElement.textContent = value;

    if (showRobuxIcon) valueRow.append(createRobuxIcon());
    valueRow.append(valueElement);
    stat.append(labelElement, valueRow);
    return stat;
}

function createStatusText(text) {
    const status = document.createElement('span');
    status.className = 'text-body-medium content-muted';
    status.textContent = text;
    return status;
}

async function renderEstimate(stats) {
    const id = ++renderId;
    const formatRobux = (amount) =>
        new Intl.NumberFormat().format(Math.round(amount));

    const universeId = getOverviewUniverseId();
    if (!pageQuery || String(pageQuery.universeId) !== universeId) {
        stats.replaceChildren(createStatusText(ts('devexEstimate.loading')));
        return;
    }

    try {
        const estimate = await getEstimate(pageQuery);
        const { robuxFiatDisplayCurrency: currency = 'USD' } =
            await getRobuxFiatSettings();
        const earnings = await convertCurrencyAmount(
            estimate.revenueUsd,
            'USD',
            currency,
        );
        if (id !== renderId) return;
        if (!Number.isFinite(earnings)) throw new Error('No conversion rate');

        tooltipRate = estimate.totalRobux
            ? { currency, perRobux: earnings / estimate.totalRobux }
            : null;

        stats.replaceChildren(
            createStat(
                ts('devexEstimate.earnings'),
                formatDisplayCurrency(earnings, currency),
            ),
            createStat(
                ts('devexEstimate.eligibleRobux'),
                formatRobux(estimate.premiumRobux),
                true,
            ),
            createStat(
                ts('devexEstimate.standardRobux'),
                formatRobux(estimate.regularRobux),
                true,
            ),
        );
    } catch (error) {
        if (id !== renderId) return;
        console.warn('RoValra: Failed to load DevEx estimate', error);
        stats.replaceChildren(createStatusText(ts('devexEstimate.loadFailed')));
    }
}

function addInfoTooltip(trigger, text) {
    let tooltip = null;

    const hide = () => {
        tooltip?.remove();
        tooltip = null;
    };

    const show = () => {
        if (tooltip) return;
        tooltip = document.createElement('div');
        tooltip.className = `${CARD_CLASS}-tooltip-popup foundation-web-portal-zindex bg-inverse-surface-0 padding-y-xsmall padding-x-small radius-small shadow-transient-low`;

        const arrow = document.createElement('span');
        arrow.className = `${CARD_CLASS}-tooltip-arrow`;

        const content = document.createElement('div');
        content.className = 'text-caption-medium content-inverse-default';
        content.textContent = text;

        tooltip.append(arrow, content);
        document.body.append(tooltip);

        const triggerRect = trigger.getBoundingClientRect();
        const center = triggerRect.left + triggerRect.width / 2;
        const left = Math.min(
            Math.max(16, center - tooltip.offsetWidth / 2),
            window.innerWidth - tooltip.offsetWidth - 16,
        );
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${triggerRect.bottom + 10}px`;
        arrow.style.left = `${center - left - 6.5}px`;
    };

    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('focus', show);
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, { passive: true });
}

function createCard() {
    const card = document.createElement('div');
    card.className = `${CARD_CLASS} relative clip radius-[var(--size-300)] stroke-standard stroke-default`;

    const header = document.createElement('div');
    header.className =
        'flex items-center padding-x-xxlarge padding-top-xxlarge';

    const title = document.createElement('h6');
    title.className =
        'flex items-center min-width-0 min-height-[34px] margin-none text-heading-small content-emphasis';

    const titleText = document.createElement('span');
    titleText.className =
        'text-no-wrap text-truncate-end min-width-0 max-width-full block';
    titleText.textContent = ts('devexEstimate.title');

    const info = document.createElement('span');
    info.className =
        'inline-flex shrink-0 items-center justify-center min-width-500 min-height-500 cursor-pointer';
    info.tabIndex = 0;
    info.setAttribute('role', 'button');
    info.setAttribute('aria-label', ts('devexEstimate.tooltip'));
    addInfoTooltip(info, ts('devexEstimate.tooltip'));

    const infoIcon = document.createElement('span');
    infoIcon.className =
        'grow-0 shrink-0 basis-auto icon icon-regular-circle-i size-[var(--icon-size-medium)]';
    infoIcon.setAttribute('aria-hidden', 'true');

    info.append(infoIcon);
    const logo = createAssetIcon({
        altText: 'RoValra',
        width: '24px',
        height: '24px',
    });
    logo?.classList.add(`${CARD_CLASS}-logo`);

    title.append(...[logo, titleText, info].filter(Boolean));
    header.append(title);

    const body = document.createElement('div');
    body.className =
        'flex wrap justify-between items-end gap-small padding-top-medium padding-bottom-xxlarge padding-x-xxlarge';

    const stats = document.createElement('div');
    stats.className = `${CARD_CLASS}-stats flex min-width-0 max-width-full justify-start wrap gap-x-large gap-y-small`;

    body.append(stats);
    card.append(header, body);
    renderEstimate(stats);
    return card;
}

function addTooltipEstimate(element) {
    if (!tooltipRate || element.children.length) return;
    if (element.classList.contains(`${CARD_CLASS}-tooltip`)) return;

    const text = element.textContent.trim();
    if (!/^[\d,.]+$/.test(text)) return;

    if (!hoveringRobuxChart) return;
    if (
        element.nextElementSibling?.classList.contains(`${CARD_CLASS}-tooltip`)
    ) {
        return;
    }

    const robux = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(robux)) return;

    const estimate = document.createElement('span');
    estimate.className = `${CARD_CLASS}-tooltip padding-left-xsmall`;
    estimate.textContent = `(${formatDisplayCurrency(robux * tooltipRate.perRobux, tooltipRate.currency)})`;
    element.after(estimate);
}

if (location.hostname === 'create.roblox.com') {
    document.addEventListener('pointerover', (event) => {
        const chart = event.target.closest?.('.highcharts-container');
        if (!chart) return;
        hoveringRobuxChart = !!chart
            .closest('.stroke-standard')
            ?.querySelector('.icon-filled-robux');
    });
    document.addEventListener('rovalra-daily-revenue-query', (event) => {
        const universeId = getOverviewUniverseId();
        if (!universeId || String(event.detail?.universeId) !== universeId) {
            return;
        }
        pageQuery = event.detail;

        const stats = document.querySelector(`.${CARD_CLASS}-stats`);
        if (stats) renderEstimate(stats);
    });
}

async function isEnabled() {
    return (
        (await settings.robuxFiatEstimatesEnabled) === true &&
        (await settings.devexEstimateEnabled) === true
    );
}

export async function init() {
    anchorRequest?.disconnect();
    tooltipRequest?.disconnect();
    anchorRequest = null;
    tooltipRequest = null;
    tooltipRate = null;

    if (location.hostname !== 'create.roblox.com') return;
    if (!getOverviewUniverseId()) return;
    if (!(await isEnabled())) return;

    anchorRequest = observeElement(
        '[data-testid="chart-explore-button"]',
        (button) => {
            if (document.querySelector(`.${CARD_CLASS}`)) return;
            button.closest('.stroke-standard')?.before(createCard());
        },
    );

    tooltipRequest = observeElement(
        '.highcharts-tooltip-box span',
        addTooltipEstimate,
        { multiple: true },
    );
}
