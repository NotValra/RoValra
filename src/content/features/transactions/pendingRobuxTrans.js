import { observeElement } from '../../core/observer.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import DOMPurify, { safeHtml } from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
const API_LIMIT = 100;
const MAX_PAGES_TO_FETCH_FOR_INFERENCE = 2000;
const MAX_PAGES_WITHOUT_PENDING_SALES = 5;
const API_CALL_DELAY_MS = 50;
const TARGET_ELEMENT_SELECTOR =
    'td.summary-transaction-pending-text.text-disabled';

const state = {
    userId: null,
    cachedResults: null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseTimestamp = (timestampStr) => {
    if (!timestampStr) return null;
    try {
        const dt = new Date(timestampStr);
        if (isNaN(dt.getTime())) return null;
        return dt;
    } catch (e) {
        console.error(e);
        return null;
    }
};

async function fetchTransactions(userId, statusCallback) {
    const allTransactionsData = [];
    
    const transactionConfigs = [
        { type: 'Sale', itemPricingType: 'PaidAndLimited' },
        { type: 'GroupPayout' }
    ];

    for (const config of transactionConfigs) {
        let currentCursor = '';
        let pagesFetched = 0;
        let consecutivePagesWithoutPendingSales = 0;

        transactionLoop: while (pagesFetched < MAX_PAGES_TO_FETCH_FOR_INFERENCE) {
            pagesFetched++;
            let endpoint = `/v2/users/${userId}/transactions?limit=${API_LIMIT}&transactionType=${config.type}`;
            if (config.itemPricingType) {
                endpoint += `&itemPricingType=${config.itemPricingType}`;
            }
            if (currentCursor) {
                endpoint += `&cursor=${currentCursor}`;
            }

        let data;
        try {
            while (true) {
                const response = await callRobloxApi({
                    subdomain: 'economy',
                    endpoint: endpoint,
                });

                if (response.ok) {
                    if (statusCallback && pagesFetched > 1) statusCallback('gathering');
                    data = await response.json();
                    
                    const remainingStr = response.headers.get('x-ratelimit-remaining');
                    if (remainingStr) {
                        const remaining = Number(remainingStr);
                        if (!isNaN(remaining) && remaining <= 1) { // Apply +1 logic to make sure
                            let delayMs = 2000;
                            const resetStr = response.headers.get('x-ratelimit-reset');
                            if (resetStr) {
                                const resetVal = Number(resetStr);
                                if (!isNaN(resetVal)) {
                                    delayMs = (resetVal > 1e9 ? Math.max(0, (resetVal * 1000) - Date.now()) : resetVal * 1000) + 1000;
                                }
                            }
                            await sleep(delayMs);
                        }
                    }
                    
                    break;
                } else if (response.status === 429) {
                    if (statusCallback) statusCallback('rate_limited');
                    let delayMs = 2000;
                    
                    const resetStr = response.headers.get('x-ratelimit-reset');
                    if (resetStr) {
                        const resetVal = Number(resetStr);
                        if (!isNaN(resetVal)) {
                            delayMs = (resetVal > 1e9 ? Math.max(0, (resetVal * 1000) - Date.now()) : resetVal * 1000) + 1000;
                        }
                    }
                    
                    await sleep(delayMs);
                    continue;
                } else {
                    break;
                }
            }

            if (data && data.data) {
                const currentPageTransactions = data.data;

                if (
                    !currentPageTransactions ||
                    currentPageTransactions.length === 0
                ) {
                    break transactionLoop;
                }

                let foundPendingSale = false;
                for (const transaction of currentPageTransactions) {
                    if (
                        Object.prototype.hasOwnProperty.call(
                            transaction,
                            'isPending',
                        ) &&
                        transaction.isPending
                    ) {
                        foundPendingSale = true;
                        break;
                    }
                }

                if (!foundPendingSale) {
                    consecutivePagesWithoutPendingSales++;

                    if (
                        consecutivePagesWithoutPendingSales >=
                        MAX_PAGES_WITHOUT_PENDING_SALES
                    ) {
                        break transactionLoop;
                    }
                } else {
                    consecutivePagesWithoutPendingSales = 0;
                }

                allTransactionsData.push(...currentPageTransactions);

                const nextCursor = data.nextPageCursor;
                if (!nextCursor) {
                    break transactionLoop;
                }

                currentCursor = nextCursor;
                await sleep(API_CALL_DELAY_MS);
            } else {
                break transactionLoop;
            }
        } catch (e) {
            console.error(e);
            break transactionLoop;
        }
    }
    }
    return allTransactionsData;
}

function inferPendingDuration(transactionsList) {
    if (!transactionsList || transactionsList.length === 0) {
        return null;
    }

    for (const transaction of transactionsList) {
        if (
            !Object.prototype.hasOwnProperty.call(transaction, 'isPending') ||
            transaction.isPending
        ) {
            if (transaction.details && transaction.details.type) {
                break;
            }
        }
    }

    let minDaysObserved = Infinity;
    let foundCompleted = false;
    let completedCount = 0;
    const now = new Date();

    for (const transaction of transactionsList) {
        if (
            Object.prototype.hasOwnProperty.call(transaction, 'isPending') &&
            !transaction.isPending
        ) {
            const createdStr = transaction.created;
            if (!createdStr) continue;

            const createdDt = parseTimestamp(createdStr);
            if (!createdDt) continue;

            const timeDifferenceMs = now.getTime() - createdDt.getTime();
            const daysDifference = timeDifferenceMs / (1000 * 60 * 60 * 24);
            const daysRoundedUp = Math.ceil(daysDifference);

            if (daysRoundedUp >= 1) {
                minDaysObserved = Math.min(minDaysObserved, daysRoundedUp);
                foundCompleted = true;
                completedCount++;
            }
        }
    }

    if (foundCompleted && minDaysObserved !== Infinity && completedCount >= 2) {
        return minDaysObserved;
    } else {
        return null;
    }
}

function calculateUnpendingRobux(transactionsList, pendingDaysToUse) {
    if (!transactionsList || transactionsList.length === 0) {
        return { amount: 0, hasEnoughData: false };
    }

    const hasPending = transactionsList.some((t) => t.isPending);
    if (!hasPending) {
        return { amount: 0, hasEnoughData: true };
    }

    if (pendingDaysToUse === null) {
        return { amount: 0, hasEnoughData: false };
    }

    let totalUnpendingTomorrow = 0;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    const tomorrowUTCDateString = tomorrow.toISOString().split('T')[0];

    for (const transaction of transactionsList) {
        if (
            !Object.prototype.hasOwnProperty.call(transaction, 'isPending') ||
            transaction.isPending
        ) {
            const createdStr = transaction.created;
            const amount = transaction.currency?.amount;

            if (!createdStr || amount === undefined || amount === 0) {
                continue;
            }

            const createdDt = parseTimestamp(createdStr);
            if (!createdDt) {
                continue;
            }

            const estimatedUnpendingDt = new Date(createdDt);
            estimatedUnpendingDt.setUTCDate(
                createdDt.getUTCDate() + pendingDaysToUse,
            );
            const estimatedUnpendingDateString = estimatedUnpendingDt
                .toISOString()
                .split('T')[0];

            if (estimatedUnpendingDateString === tomorrowUTCDateString) {
                totalUnpendingTomorrow += amount;
            }
        }
    }

    return { amount: totalUnpendingTomorrow, hasEnoughData: true };
}

function storeResults(userId, results) {
    state.cachedResults = {
        timestamp: Date.now(),
        userId: userId,
        estimatedRobux: {
            amount: results.amount,
            hasEnoughData: results.hasEnoughData,
        },
        pendingDays: results.pendingDays,
        lastCalculation: results.lastCalculation,
    };
}

function getStoredResults() {
    if (!state.cachedResults) return null;

    if (
        Date.now() - state.cachedResults.timestamp < 24 * 60 * 60 * 1000 &&
        state.cachedResults.userId === state.userId
    ) {
        return state.cachedResults;
    }
    return null;
}

function injectResultElement(targetElement, result) {
    if (!document.body.contains(targetElement)) return;

    let pendingRow =
        targetElement.closest('tr.pending') || targetElement.closest('tr');
    if (!pendingRow) {
        pendingRow = targetElement.parentElement;
        while (pendingRow && pendingRow.tagName !== 'TR')
            pendingRow = pendingRow.parentElement;
    }
    if (!pendingRow || !document.body.contains(pendingRow)) return;

    let estimatorRow = document.querySelector('.estimator-row');

    let amountHtml = '';
    let tooltipText = ts('pendingRobux.tooltip');

    if (result.isLoading) {
        const baseText = ts('pendingRobux.loading').replace(/\.+$/, '');
        amountHtml = `<span style="color: var(--rovalra-main-text-color); font-weight: 400; font-size: 13px;"><span class="rovalra-unpending-state-text">${baseText}</span><span class="rovalra-unpending-dots">...</span></span>`;
    } else if (result.errorMessage) {
        amountHtml = `<span style="color: red; font-weight: 400; font-size: 13px;">${ts('pendingRobux.error', { message: result.errorMessage })}</span>`;
    } else if (!result.hasEnoughData) {
        amountHtml = `<span style="color: var(--rovalra-main-text-color); font-weight: 400; font-size: 13px;">${ts('pendingRobux.insufficientData')}</span>`;
        tooltipText = ts('pendingRobux.insufficientDataTooltip');
    } else {
        amountHtml = `
            <span class="icon-robux-16x16"></span>
            <span class="text-robux" style="color: var(--rovalra-main-text-color); font-weight: 400;">${result.amount.toLocaleString()}~</span>
        `;
    }

    if (estimatorRow) {
        const amountCell = estimatorRow.querySelector('.amount');
        if (amountCell) amountCell.innerHTML = DOMPurify.sanitize(amountHtml);

        const infoIcon = estimatorRow.querySelector('.icon-moreinfo');
        if (infoIcon && infoIcon.dataset.tooltipText !== tooltipText) {
            const newIcon = infoIcon.cloneNode(true);
            infoIcon.parentNode.replaceChild(newIcon, infoIcon);
            addTooltip(newIcon, tooltipText);
            newIcon.dataset.tooltipText = tooltipText;
        }
    } else {
        estimatorRow = document.createElement('tr');
        estimatorRow.className = 'estimator-row';
        estimatorRow.innerHTML = `
            <td class="unpending-sales" style="display: flex; align-items: center;">
                <div style="color: var(--rovalra-main-text-color);">
                    <span class="ng-binding">${ts('pendingRobux.label')}</span>
                </div>
                <span class="icon-moreinfo" style="margin-left: 4px; font-size: 12px; display: inline-flex; align-items: center; color: var(--rovalra-main-text-color); cursor: pointer;"></span>
            </td>
            <td class="amount icon-robux-container">
                ${amountHtml}
            </td>
        `; //Verified

        const infoIcon = estimatorRow.querySelector('.icon-moreinfo');
        if (infoIcon) {
            addTooltip(infoIcon, tooltipText);
            infoIcon.dataset.tooltipText = tooltipText;
        }

        try {
            const table = pendingRow.parentNode;
            if (table) {
                table.insertBefore(estimatorRow, pendingRow);
                targetElement.classList.add('robux-estimator-processed');
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function onElementFound(targetElement) {
    if (targetElement.classList.contains('robux-estimator-processed')) {
        return;
    }
    targetElement.classList.add('robux-estimator-processing');

    let rowToInjectInto = targetElement.closest('tr');
    if (!rowToInjectInto) {
        rowToInjectInto = targetElement;
    }

    if (document.body.contains(rowToInjectInto)) {
        injectResultElement(rowToInjectInto, { isLoading: true });
    }

    const storedResults = getStoredResults();
    if (storedResults && storedResults.userId === state.userId) {
        injectResultElement(rowToInjectInto, {
            amount: storedResults.estimatedRobux.amount,
            hasEnoughData: storedResults.estimatedRobux.hasEnoughData,
            pendingDays: storedResults.pendingDays,
            lastCalculation: storedResults.lastCalculation,
        });
        return;
    }

    let loadingStatusObj = {
        state: 'normal',
        startTime: Date.now()
    };
    let loadDotCount = 0;
    
    const loadingInterval = setInterval(() => {
        const textSpan = document.querySelector('.rovalra-unpending-state-text');
        const dotsSpan = document.querySelector('.rovalra-unpending-dots');
        
        if (!textSpan || !dotsSpan) {
            if (!document.querySelector('.estimator-row')) {
                 // Element isn't in DOM at all, stop interval
                 clearInterval(loadingInterval);
            }
            return;
        }

        loadDotCount = (loadDotCount % 3) + 1; // 1, 2, 3
        dotsSpan.textContent = '.'.repeat(loadDotCount);

        let mainText = ts('pendingRobux.loading').replace(/\.+$/, '');
        
        if (loadingStatusObj.state === 'rate_limited') {
            mainText += ' (Rate Limited)';
        } else if (loadingStatusObj.state === 'gathering') {
            mainText += ' (Gathering Data)';
        } else {
            if (Date.now() - loadingStatusObj.startTime > 10000) {
                loadingStatusObj.state = 'gathering'; 
                mainText += ' (Gathering Data)';
            }
        }
        
        textSpan.textContent = mainText;
    }, 500);

    const statusCallback = (stateStr) => {
        if (stateStr === 'rate_limited') {
            loadingStatusObj.state = 'rate_limited';
        } else if (stateStr === 'gathering') {
            if (loadingStatusObj.state === 'rate_limited') {
                loadingStatusObj.state = 'gathering';
            }
        }
    };

    const transactions = await fetchTransactions(state.userId, statusCallback);
    
    clearInterval(loadingInterval);

    const pendingDaysToUse = inferPendingDuration(transactions);
    const unpendingResult = calculateUnpendingRobux(
        transactions,
        pendingDaysToUse,
    );

    const finalResults = {
        amount: unpendingResult.amount,
        hasEnoughData: unpendingResult.hasEnoughData,
        pendingDays: pendingDaysToUse,
        lastCalculation: Date.now(),
    };

    storeResults(state.userId, finalResults);
    injectResultElement(rowToInjectInto, finalResults);
}

export function init() {
    chrome.storage.local.get({ pendingrobuxtrans: true }, async (settings) => {
        if (
            !settings.pendingrobuxtrans ||
            !window.location.pathname.includes('/transactions')
        ) {
            return;
        }

        try {
            const userData = await callRobloxApiJson({
                subdomain: 'users',
                endpoint: '/v1/users/authenticated',
            });
            state.userId = userData.id;
            if (!state.userId) {
                console.error(
                    'RoValra: Could not get user ID for pending Robux feature.',
                );
                return;
            }
            observeElement(TARGET_ELEMENT_SELECTOR, onElementFound);
        } catch (e) {
            console.error(
                'RoValra: Failed to initialize pending Robux feature.',
                e,
            );
        }
    });
}
