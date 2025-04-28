const urlParams = new URLSearchParams(window.location.search);
const GROUP_ID = urlParams.get('id');

const GAMEPASS_PENDING_DAYS = 6;
const ASSETS_PENDING_DAYS = 6;
const API_LIMIT = 100;
const MAX_PAGES_TO_FETCH_FOR_INFERENCE = 20;
const API_CALL_DELAY_MS = 500;
const TARGET_ELEMENT_SELECTOR = 'span[ng-bind="$ctrl.revenueSummary.pendingRobux | number"]';
const RECHECK_INTERVAL_MS = 2000;
const EXTENDED_HOURS_WINDOW = 72;
const MIN_TRANSACTIONS_FOR_24H = 5;
let RobloxUnpendingEstimatorData = null;

if (window.location.pathname.includes('communities/configure')) {

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseTimestamp(timestampStr) {
    if (!timestampStr) {
        return null;
    }
    try {
        const dt = new Date(timestampStr);
        if (isNaN(dt.getTime())) {
            return null;
        }
        return dt;
    } catch (e) {
        return null;
    }
}

async function fetchTransactions() {
    const allTransactionsData = [];
    let currentCursor = "";
    let pagesFetched = 0;
    let foundCompletedTransaction = false;
    const BASE_API_URL = `https://economy.roblox.com/v2/groups/${GROUP_ID}/transactions`;


    while (pagesFetched < MAX_PAGES_TO_FETCH_FOR_INFERENCE) {
        pagesFetched++;
        const params = new URLSearchParams({
            limit: API_LIMIT,
            transactionType: "Sale"
        });
        if (currentCursor) {
            params.set("cursor", currentCursor);
        }

        const url = `${BASE_API_URL}?${params.toString()}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });


            if (!response.ok) {
                if (response.status === 401) {
                } else if (response.status === 403) {
                } else if (response.status === 429) {
                } else {
                }
                 const errorText = await response.text();
                break;
            }

            let data;
            try {
                data = await response.json();
            } catch (e) {
                const responseText = await response.text();
                break;
            }

            if (data && data.data) {
                const currentPageTransactions = data.data;
                if (!currentPageTransactions || currentPageTransactions.length === 0) {
                    break;
                }

                allTransactionsData.push(...currentPageTransactions);

                for (const transaction of currentPageTransactions) {
                    if (transaction.hasOwnProperty('isPending') && !transaction.isPending) {
                        foundCompletedTransaction = true;
                        break;
                    }
                }

                const nextCursor = data.nextPageCursor;
                if (foundCompletedTransaction || !nextCursor) {
                    if (!nextCursor && !foundCompletedTransaction) {
                    }
                    break;
                }

                currentCursor = nextCursor;
                await sleep(API_CALL_DELAY_MS);

            } else {
                break;
            }

        } catch (error) {
            break;
        }
    }

    if (!foundCompletedTransaction && pagesFetched >= MAX_PAGES_TO_FETCH_FOR_INFERENCE) {
    }
     if (allTransactionsData.length === 0 && pagesFetched > 0) {
    } else if (allTransactionsData.length === 0 && pagesFetched === 0) {
    }

    return allTransactionsData;
}

function inferPendingDuration(transactionsList) {
    if (!transactionsList || transactionsList.length === 0) {
        return null;
    }

    let itemType = null;
    for (const transaction of transactionsList) {
        if (!transaction.hasOwnProperty('isPending') || transaction.isPending) {
            if (transaction.details && transaction.details.type) {
                itemType = transaction.details.type;
                break;
            }
        }
    }

    let minDaysObserved = Infinity;
    let foundCompleted = false;
    let completedCount = 0;
    const now = new Date();

    for (const transaction of transactionsList) {
        if (transaction.hasOwnProperty('isPending') && !transaction.isPending) {
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

    if (pendingDaysToUse === null) {
        return { amount: 0, hasEnoughData: false };
    }

    let totalUnpendingTomorrow = 0;
    let processedCount = 0;
    let pendingCount = 0;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    const tomorrowUTCDateString = tomorrow.toISOString().split('T')[0];


    for (const transaction of transactionsList) {
        processedCount++;
        if (!transaction.hasOwnProperty('isPending') || transaction.isPending) {
            pendingCount++;
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
            estimatedUnpendingDt.setUTCDate(createdDt.getUTCDate() + pendingDaysToUse);
            const estimatedUnpendingDateString = estimatedUnpendingDt.toISOString().split('T')[0];

            if (estimatedUnpendingDateString === tomorrowUTCDateString) {
                totalUnpendingTomorrow += amount;
            }
        }
    }


    return { amount: totalUnpendingTomorrow, hasEnoughData: true };
}

function calculateUnpendingRobuxNext24Hours(transactionsList, pendingDaysToUse) {
    if (!transactionsList || transactionsList.length === 0) {
        return 0;
    }

    let totalUnpending = 0;
    let processedCount = 0;
    let pendingCount = 0;
    let pendingTransactions = [];

    const now = new Date();

    for (const transaction of transactionsList) {
        if (!transaction.hasOwnProperty('isPending') || transaction.isPending) {
            const createdStr = transaction.created;
            if (!createdStr) continue;
            
            const createdDt = parseTimestamp(createdStr);
            if (!createdDt) continue;

            const hoursSinceCreated = (now - createdDt) / (1000 * 60 * 60);
            if (hoursSinceCreated <= 24) {
                pendingTransactions.push(transaction);
            }
        }
    }

    const timeWindowHours = pendingTransactions.length < MIN_TRANSACTIONS_FOR_24H ? EXTENDED_HOURS_WINDOW : 24;

    const endTime = new Date(now.getTime() + timeWindowHours * 60 * 60 * 1000);


    for (const transaction of transactionsList) {
        processedCount++;
        if (!transaction.hasOwnProperty('isPending') || transaction.isPending) {
            pendingCount++;
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
            estimatedUnpendingDt.setUTCDate(createdDt.getUTCDate() + pendingDaysToUse);

            if (estimatedUnpendingDt > now && estimatedUnpendingDt <= endTime) {
                totalUnpending += amount;
            }
        }
    }

    
    return {
        amount: totalUnpending,
        hasEnoughData: true,
        timeWindow: timeWindowHours
    };
}

async function waitForElement(selector, timeout = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
        await sleep(200);
    }
    return null;
}

function observeForElement(selector, callback) {
    let retryCount = 0;
    const maxRetries = 10;
    let checkInterval;

    const observer = new MutationObserver(async () => {
        const element = document.querySelector(selector);
        if (element) {
            observer.disconnect();
            if (checkInterval) clearInterval(checkInterval);
            callback(element);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
    });

    checkInterval = setInterval(async () => {
        const element = await waitForElement(selector);
        if (element) {
            observer.disconnect();
            clearInterval(checkInterval);
            callback(element);
        } else {
            retryCount++;
            if (retryCount >= maxRetries) {
                observer.disconnect();
                clearInterval(checkInterval);
            }
        }
    }, 3000);

    setTimeout(() => {
        observer.disconnect();
        if (checkInterval) clearInterval(checkInterval);
    }, 300000);
}

function storeResults(groupId, results) {
    RobloxUnpendingEstimatorData = {
        timestamp: Date.now(),
        groupId: groupId,
        estimatedRobux: {
            amount: results.amount,
            hasEnoughData: results.hasEnoughData
        },
        pendingDays: results.pendingDays,
        lastCalculation: results.lastCalculation
    };
}

function getStoredResults() {
    if (!RobloxUnpendingEstimatorData) return null;
    
    if (Date.now() - RobloxUnpendingEstimatorData.timestamp < 24 * 60 * 60 * 1000 && 
        RobloxUnpendingEstimatorData.groupId === GROUP_ID) {
        return RobloxUnpendingEstimatorData;
    }
    return null;
}

function createResultElement(result) {
    const resultElement = document.createElement('div');
    resultElement.className = 'unpending-estimator-result';
    resultElement.style.position = 'absolute';
    resultElement.style.display = 'inline-block';
    resultElement.style.marginLeft = '5px';
    resultElement.style.transform = 'translateY(-1px)';

    if (!result.hasEnoughData) {
        resultElement.innerHTML = `
            <span style="font-size: 13px">(</span>
            <span class="Pending-Stuff" style="color: rgb(247, 247, 248); font-weight: 400; font-size: 13px">Not enough data to estimate unpending Robux</span>
            <span style="font-size: 13px">)</span>
        `;
    } else {
        resultElement.innerHTML = `
            <span style="font-size: 13px">(</span>
            <span class="icon-robux-16x16" style="color: rgb(247, 247, 248); background-color: transparent;"></span>
            <span class="text-robux" style="color: rgb(247, 247, 248); font-weight: 400; font-size: 13px">${result.amount.toLocaleString()}~</span>
            <span class="Pending-Stuff" style="color: rgb(247, 247, 248); font-weight: 400; font-size: 13px">Becomes available within 24 hours</span>
            <span style="font-size: 13px">)</span>
        `;
    }
    return resultElement;
}

function injectResultElement(targetElement, result) {
    const existingEstimatorRow = document.querySelector('.estimator-row');
    if (existingEstimatorRow) {
        return;
    }

    const pendingRow = targetElement.closest('tr.pending');
    if (!pendingRow) return;

    const estimatorRow = document.createElement('tr');
    estimatorRow.className = 'estimator-row';
    
    const tooltipStyles = document.createElement('style');
    tooltipStyles.textContent = `
        .icon-moreinfo {
            position: relative;
            display: inline-block;
        }
        .tooltip-text {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 16px;
    background: rgb(39, 41, 48);
    color: white;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    width: max-content;
    max-width: 350px;
    min-width: 200px;
    border-radius: 6px;
    visibility: hidden;
    opacity: 0;
    transition: all 0.2s ease;
    pointer-events: none;
    z-index: 1000;
    text-align: center;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.icon-moreinfo:hover .tooltip-text {
    visibility: visible;
    opacity: 1;
    transform: translateX(-50%) translateY(-5px);
}
    `;
    document.head.appendChild(tooltipStyles);

    if (!result.hasEnoughData) {
        estimatorRow.innerHTML = `
            <td class="unpending-sales">
                <span class="ng-binding">Unpending Robux tomorrow</span>
                <span class="icon-moreinfo"; margin-left: 4px; opacity: 1; font-size: 12px;">
                    <span class="tooltip-text">Not enough transaction history to make an accurate estimate. Please wait for more transactions to complete.</span>
                </span>
            </td>
            <td class="icon-robux-container">
                <span style="color: #B8B8B8; font-weight: 400; font-size: 13px;">Insufficient data</span>
            </td>
        `;
    } else {
        const timeWindow = result.timeWindow || 24;
        estimatorRow.innerHTML = `
            <td class="unpending-sales">
                <span class="ng-binding">Unpending Robux tomorrow</span>
                <span class="icon-moreinfo"; margin-left: 4px; opacity: 1; font-size: 12px;">
                    <span class="tooltip-text">This is an estimate of how many Robux from your pending balance will become available tomorrow, based on your transaction data. The actual amount may vary.</span>
                </span>
            </td>
            <td class="icon-robux-container">
                <span class="icon-robux-16x16"></span>
                <span class="text-robux" style="font-weight: 400;">${result.amount.toLocaleString()}~</span>
                <span style="color: #B8B8B8; font-weight: 400; font-size: 13px;"></span>
            </td>
        `;
    }

    pendingRow.parentNode.insertBefore(estimatorRow, pendingRow);
}

(async () => {
    try {

        if (document.readyState !== "complete") {
            await new Promise(resolve => window.addEventListener("load", resolve));
        }


        observeForElement(TARGET_ELEMENT_SELECTOR, async (targetElement) => {

            const originalText = targetElement.textContent;
            const loadingSpan = document.createElement('span');
            loadingSpan.textContent = "";
            loadingSpan.style.fontSize = "0.9em";
            loadingSpan.style.color = "gray";
            targetElement.parentNode.insertBefore(loadingSpan, targetElement.nextSibling);

            const storedResults = getStoredResults();
            if (storedResults) {
                injectResultElement(targetElement, storedResults.estimatedRobux);
                return;
            }

            const allFetchedTransactions = await fetchTransactions();
            if (allFetchedTransactions && allFetchedTransactions.length > 0) {
                const inferredDays = inferPendingDuration(allFetchedTransactions);
                const estimatedResult = calculateUnpendingRobux(allFetchedTransactions, inferredDays);

                storeResults(GROUP_ID, {
                    amount: estimatedResult.amount,
                    hasEnoughData: estimatedResult.hasEnoughData,
                    pendingDays: inferredDays,
                    lastCalculation: new Date().toISOString()
                });

                injectResultElement(targetElement, estimatedResult);
            } else {
                injectResultElement(targetElement, { amount: 0, hasEnoughData: false });
            }
        });

        setInterval(() => {
            const targetElement = document.querySelector(TARGET_ELEMENT_SELECTOR);
            if (targetElement && !document.querySelector('.estimator-row')) {
                const storedResults = getStoredResults();
                if (storedResults) {
                    injectResultElement(targetElement, storedResults.estimatedRobux);
                }
            }
        }, RECHECK_INTERVAL_MS);
    } catch (error) {
    }
})();
}