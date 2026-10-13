import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getTradeAnalysis } from '../../core/trade/tradeDetailsHandler.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createButton } from '../../core/ui/buttons.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const MAX_PAGES = 10;
const CONCURRENCY = 3;
const DECLINE_DELAY = 750;
const FILTER_DEBOUNCE = 300;

const filters = { minValue: 0, hideLosses: false };
let myUserId = null;
let filterTimer = null;
let running = false;
let initialized = false;

async function analyze(tradeId) {
    return getTradeAnalysis(tradeId, { myUserId }).catch(() => null);
}

async function runLimited(items, worker, onProgress) {
    const results = new Array(items.length);
    let next = 0;
    let done = 0;

    const lane = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index]);
            onProgress?.(++done, items.length);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, items.length) }, lane),
    );
    return results;
}

function isFiltering() {
    return filters.minValue > 0 || filters.hideLosses;
}

function matchesFilters(analysis) {
    const { valueDiff, partnerValue } = analysis.comparison;
    if (filters.hideLosses && valueDiff < 0) return false;
    if (partnerValue < filters.minValue) return false;
    return true;
}

async function applyFilters() {
    const rows = [...document.querySelectorAll('.trade-row')];

    if (!isFiltering()) {
        rows.forEach((row) => delete row.dataset.rovalraQuickHidden);
        return;
    }

    await runLimited(rows, async (row) => {
        const tradeId = row.dataset.tradeId;
        if (!tradeId) return;

        const analysis = await analyze(tradeId);
        if (!analysis || !row.isConnected) return;

        if (!isFiltering() || matchesFilters(analysis)) {
            delete row.dataset.rovalraQuickHidden;
        } else {
            row.dataset.rovalraQuickHidden = 'true';
        }
    });
}

function scheduleFilters() {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilters, FILTER_DEBOUNCE);
}

async function fetchInboundTradeIds() {
    const ids = [];
    let cursor = '';
    let pages = 0;

    do {
        const response = await callRobloxApi({
            subdomain: 'trades',
            endpoint: `/v1/trades/Inbound?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ''}`,
        });
        if (!response.ok) break;

        const json = await response.json();
        (json?.data || []).forEach((trade) => ids.push(String(trade.id)));
        cursor = json?.nextPageCursor || '';
        pages += 1;
    } while (cursor && pages < MAX_PAGES);

    return ids;
}

async function declineTrade(tradeId) {
    const response = await callRobloxApi({
        subdomain: 'trades',
        endpoint: `/v1/trades/${tradeId}/decline`,
        method: 'POST',
    }).catch(() => null);
    return Boolean(response?.ok);
}

function markDeclined(tradeIds) {
    const declined = new Set(tradeIds);
    document.querySelectorAll('.trade-row').forEach((row) => {
        if (declined.has(row.dataset.tradeId)) {
            row.dataset.rovalraDeclined = 'true';
        }
    });
}

async function declineLosses(button, status) {
    if (running) return;
    running = true;
    button.disabled = true;

    try {
        status.textContent = ts('tradeQuickActions.loadingTrades');
        const tradeIds = await fetchInboundTradeIds();

        const analyses = await runLimited(tradeIds, analyze, (done, total) => {
            status.textContent = ts('tradeQuickActions.checking', {
                done,
                total,
            });
        });

        const losses = analyses.filter(
            (analysis) => analysis && analysis.comparison.valueDiff < 0,
        );

        if (!losses.length) {
            status.textContent = ts('tradeQuickActions.noLosses');
            return;
        }

        const totalLoss = losses.reduce(
            (sum, analysis) => sum + Math.abs(analysis.comparison.valueDiff),
            0,
        );
        status.textContent = '';

        const confirmed = await new Promise((resolve) => {
            showConfirmationPrompt({
                title: ts('tradeQuickActions.confirmTitle'),
                message: ts('tradeQuickActions.confirmMessage', {
                    count: losses.length,
                    total: tradeIds.length,
                    value: totalLoss.toLocaleString(),
                }),
                confirmText: ts('tradeQuickActions.declineConfirm'),
                confirmType: 'alert',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
        if (!confirmed) {
            status.textContent = ts('tradeQuickActions.bulkHint');
            return;
        }

        const declined = [];
        for (const [index, analysis] of losses.entries()) {
            status.textContent = ts('tradeQuickActions.declining', {
                done: index + 1,
                total: losses.length,
            });
            if (await declineTrade(analysis.tradeId)) {
                declined.push(analysis.tradeId);
                markDeclined([analysis.tradeId]);
            }
            if (index < losses.length - 1) {
                await new Promise((r) => setTimeout(r, DECLINE_DELAY));
            }
        }

        const failed = losses.length - declined.length;
        status.textContent = failed
            ? ts('tradeQuickActions.declinedWithFailures', {
                  count: declined.length,
                  failed,
              })
            : ts('tradeQuickActions.declined', { count: declined.length });
    } finally {
        running = false;
        button.disabled = false;
    }
}

function createPanel() {
    const panel = document.createElement('div');
    panel.className = 'rovalra-trade-quick-actions';

    const controls = document.createElement('div');
    controls.className = 'rovalra-trade-quick-controls';

    const { container: minValueContainer, input: minValueInput } =
        createStyledInput({
            id: 'rovalra-trade-min-value',
            label: ts('tradeQuickActions.minValue'),
        });
    minValueInput.inputMode = 'numeric';
    minValueInput.addEventListener('input', () => {
        const digits = minValueInput.value.replace(/[^\d]/g, '');
        if (digits !== minValueInput.value) minValueInput.value = digits;
        filters.minValue = Number(digits) || 0;
        scheduleFilters();
    });
    controls.appendChild(minValueContainer);

    const hideLossesLabel = document.createElement('label');
    hideLossesLabel.className =
        'text-label-medium rovalra-trade-quick-switch';
    hideLossesLabel.htmlFor = 'rovalra-trade-hide-losses';
    hideLossesLabel.textContent = ts('tradeQuickActions.hideLosses');
    const hideLosses = createToggle({
        id: 'rovalra-trade-hide-losses',
        checked: filters.hideLosses,
        onChange: (checked) => {
            filters.hideLosses = checked;
            scheduleFilters();
        },
    });
    hideLosses.setAttribute('role', 'switch');
    hideLossesLabel.appendChild(hideLosses);
    controls.appendChild(hideLossesLabel);

    panel.appendChild(controls);

    const bulk = document.createElement('div');
    bulk.className = 'rovalra-trade-quick-bulk';

    const bulkText = document.createElement('div');
    bulkText.className = 'rovalra-trade-quick-bulk-text';
    const bulkTitle = document.createElement('span');
    bulkTitle.className = 'text-label-medium';
    bulkTitle.textContent = ts('tradeQuickActions.bulkTitle');
    const status = document.createElement('span');
    status.className = 'text-caption-medium rovalra-trade-quick-status';
    status.textContent = ts('tradeQuickActions.bulkHint');
    bulkText.append(bulkTitle, status);

    const declineButton = createButton(
        ts('tradeQuickActions.declineLosses'),
        'alert',
    );
    declineButton.classList.add('rovalra-trade-quick-decline');
    declineButton.addEventListener('click', () =>
        declineLosses(declineButton, status),
    );

    bulk.append(bulkText, declineButton);
    panel.appendChild(bulk);
    return panel;
}

export async function init() {
    if (initialized || !(await settings.tradeQuickActionsEnabled)) return;
    if (!window.location.pathname.startsWith('/trades')) return;
    initialized = true;

    myUserId = await getAuthenticatedUserId();
    if (!myUserId) return;

    observeElement('.trade-row-list', (list) => {
        if (list.querySelector('.rovalra-trade-quick-actions')) return;

        const scrollContainer = list.querySelector(
            '#trade-row-scroll-container',
        );
        if (!scrollContainer) return;

        list.insertBefore(createPanel(), scrollContainer);
    });

    observeElement('.trade-row', scheduleFilters, { multiple: true });
    document.addEventListener('rovalra-trades-list-response', scheduleFilters);
}
