const urlParams = new URLSearchParams(window.location.search);
let GROUP_ID; 
const GAMEPASS_PENDING_DAYS = 6;
const ASSETS_PENDING_DAYS = 6;
const API_LIMIT = 100;
const MAX_PAGES_TO_FETCH_FOR_INFERENCE = 20;
const MAX_PAGES_WITHOUT_PENDING_SALES = 5; 
const API_CALL_DELAY_MS = 500;
const TARGET_ELEMENT_SELECTOR = 'td.summary-transaction-pending-text.text-disabled';
const RECHECK_INTERVAL_MS = 2000;
const EXTENDED_HOURS_WINDOW = 72;
const MIN_TRANSACTIONS_FOR_24H = 5;
let RobloxUnpendingEstimatorData = null;

function getCurrentTheme() {
    if (document.querySelector('.rbx-body.light-theme') !== null) {
        return 'light';
    }
    return 'dark';
}

function getThemeTextColor(theme) {
    return theme === 'light' ? 'rgb(32, 34, 39)' : 'rgb(247, 247, 248)';
}

async function fetchRobloxUserId() {
    try {
        const response = await fetch('https://users.roblox.com/v1/users/authenticated', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'include' 
        });

        if (!response.ok) {
            const errorText = await response.text();
            return null;
        }

        const data = await response.json();
        if (data && data.id) {
            return data.id;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}

if (window.location.pathname.includes('/transactions') || window.location.href.includes('/transactions')) {

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
    let consecutivePagesWithoutPendingSales = 0;
    const BASE_API_URL = `https://economy.roblox.com/v2/users/${GROUP_ID}/transactions?cursor=&limit=100&transactionType=Sale&itemPricingType=PaidAndLimited`;

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

                let foundPendingSale = false;
                for (const transaction of currentPageTransactions) {
                    if (transaction.hasOwnProperty('isPending') && transaction.isPending) {
                        foundPendingSale = true;
                        break;
                    }
                }

                if (!foundPendingSale) {
                    consecutivePagesWithoutPendingSales++;
                    
                    if (consecutivePagesWithoutPendingSales >= MAX_PAGES_WITHOUT_PENDING_SALES) {
                        break;
                    }
                } else {
                    consecutivePagesWithoutPendingSales = 0;
                }

                allTransactionsData.push(...currentPageTransactions);

                const nextCursor = data.nextPageCursor;
                if (!nextCursor) { 
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
    let lastFound = null;
    let checkInterval;

    let hasInjected = false;

    const observer = new MutationObserver(async (mutations) => {
        const element = document.querySelector(selector);
        
        if (element && (!lastFound || !document.body.contains(lastFound))) {
            lastFound = element;
            callback(element);
            hasInjected = true;
        }
        else if (!element && lastFound) {
            lastFound = null;
            hasInjected = false;
        }
        else if (element && !hasInjected) {
            lastFound = element;
            callback(element);
            hasInjected = true;
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
    });

    checkInterval = setInterval(async () => {
        const element = document.querySelector(selector);
        if (element && (!lastFound || !document.body.contains(lastFound))) {
            lastFound = element;
            if (!hasInjected) {
                callback(element);
                hasInjected = true;
            }
        } else if (!element && lastFound) {
            lastFound = null;
            hasInjected = false;
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

    const currentTheme = getCurrentTheme();
    const textColor = getThemeTextColor(currentTheme);

    if (!result.hasEnoughData) {
        resultElement.innerHTML = `
            <span style="font-size: 13px">(</span>
            <span class="Pending-Stuff" style="color: ${textColor}; font-weight: 400; font-size: 13px">Not enough data to estimate unpending Robux</span>
            <span style="font-size: 13px">)</span>
        `;
    } else {
        resultElement.innerHTML = `
            <span style="font-size: 13px">(</span>
            <span class="icon-robux-16x16" style="color: ${textColor}; background-color: transparent;"></span>
            <span class="text-robux" style="color: ${textColor}; font-weight: 400; font-size: 13px">${result.amount.toLocaleString()}~</span>
            <span class="Pending-Stuff" style="color: ${textColor}; font-weight: 400; font-size: 13px">Becomes available within 24 hours</span>
            <span style="font-size: 13px">)</span>
        `;
    }
    return resultElement;
}

function injectResultElement(targetElement, result) {
    if (!document.body.contains(targetElement)) {
        return;
    }
    
    const existingEstimatorRows = document.querySelectorAll('.estimator-row');
    if (existingEstimatorRows.length > 0) {
        existingEstimatorRows.forEach(row => row.remove());
    }

    let pendingRow = targetElement.closest('tr.pending');
    if (!pendingRow) {
        pendingRow = targetElement.closest('tr');
    }
    if (!pendingRow) {
        pendingRow = targetElement.parentElement;
        while (pendingRow && pendingRow.tagName !== 'TR') {
            pendingRow = pendingRow.parentElement;
        }
    }
    
    if (!pendingRow) {
        return;
    }
    
    if (!document.body.contains(pendingRow)) {
        return;
    }

    const estimatorRow = document.createElement('tr');
    estimatorRow.className = 'estimator-row'; 
    
    const tooltipTheme = getCurrentTheme();
    const tooltipBackground = tooltipTheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(39, 41, 48)';
    const tooltipTextColor = tooltipTheme === 'light' ? 'rgb(32, 34, 39)' : 'rgb(247, 247, 248)';
    const tooltipShadow = tooltipTheme === 'light' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.1)';
    
    const tooltipStyles = document.createElement('style');
    tooltipStyles.textContent = `
        .icon-moreinfo {
            position: relative;
            display: inline-block;
            opacity: 1 !important;
        }
        .tooltip-text {
            position: absolute;
            bottom: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 16px;
            background: ${tooltipBackground};
            color: ${tooltipTextColor};
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
            box-shadow: 0 2px 10px ${tooltipShadow};
            font-family: "HCo Gotham SSm", "Helvetica Neue", Helvetica, Arial, "Lucida Grande", sans-serif;
            font-weight: 400;
        }

.icon-moreinfo:hover .tooltip-text {
    visibility: visible;
    opacity: 1;
    transform: translateX(-50%) translateY(-5px);
}
    `;
    document.head.appendChild(tooltipStyles);

    const currentTheme = getCurrentTheme();
    const textColor = getThemeTextColor(currentTheme);
    
    if (result.isLoading) {
        estimatorRow.innerHTML = `
            <td class="unpending-sales" style="display: flex; align-items: center;">
                <div style="color: ${textColor};">
                    <span class="ng-binding">Unpending Robux tomorrow</span>
                </div>
            </td>
            <td class="amount icon-robux-container">
                <span style="color: ${textColor}; font-weight: 400; font-size: 13px;">Loading...</span>
            </td>
        `;
    } else if (result.errorMessage) { 
        estimatorRow.innerHTML = `
            <td class="unpending-sales" style="display: flex; align-items: center;">
                <div style="color: ${textColor};">
                    <span class="ng-binding">Robux Estimator</span>
                </div>
            </td>
            <td class="amount icon-robux-container">
                <span style="color: red; font-weight: 400; font-size: 13px;">Error: ${result.errorMessage}</span>
            </td>
        `;
    } else if (!result.hasEnoughData) {
        estimatorRow.innerHTML = `
            <td class="unpending-sales" style="display: flex; align-items: center;">
                <div style="color: ${textColor};">
                    <span class="ng-binding">Unpending Robux tomorrow</span>
                </div>
                <div class="icon-moreinfo" style="margin-left: 4px; font-size: 12px; display: inline-flex; align-items: center; color: ${textColor};">
                    <span class="tooltip-text">Not enough transaction history to make an accurate estimate. Please wait for more transactions to complete.</span>
                </div>
            </td>
            <td class="amount icon-robux-container">
                <span style="color: ${textColor}; font-weight: 400; font-size: 13px;">Insufficient data</span>
            </td>
        `;
    } else {
        estimatorRow.innerHTML = `
            <td class="unpending-sales" style="display: flex; align-items: center;">
                <div style="color: ${textColor};">
                    <span class="ng-binding">Unpending Robux tomorrow</span>
                </div>
                <div class="icon-moreinfo" style="margin-left: 4px; font-size: 12px; display: inline-flex; align-items: center; color: ${textColor};">
                    <span class="tooltip-text">This is an estimate of how many Robux from your pending balance will become available tomorrow, based on your transaction data. The actual amount may vary. And this may be inaccurate.</span>
                </div>
            </td>
            <td class="amount icon-robux-container">
                <span class="icon-robux-16x16"></span>
                <span class="text-robux" style="color: ${textColor}; font-weight: 400;">${result.amount.toLocaleString()}~</span>
            </td>
        `;
    }



    try {
        const table = pendingRow.parentNode;
        if (table && document.body.contains(table)) {
            table.insertBefore(estimatorRow, pendingRow); 
            
            targetElement.classList.add('robux-estimator-processed');
        } else {
        }
    } catch (error) {
    }
}

(async () => {
    try {

        const themeObserver = new MutationObserver((mutations) => {
            const pendingStuffElements = document.querySelectorAll('.Pending-Stuff, .text-robux, .icon-robux-16x16, .ng-binding');
            const currentTheme = getCurrentTheme();
            const textColor = getThemeTextColor(currentTheme);
            
            pendingStuffElements.forEach(element => {
                if (element.style) {
                    element.style.color = textColor;
                }
            });
        });
        
        if (document.body) {
            themeObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        }

        GROUP_ID = await fetchRobloxUserId();
        if (!GROUP_ID) {
            const targetElementForError = document.querySelector(TARGET_ELEMENT_SELECTOR) || document.body;
            if (targetElementForError.closest('tr')) {
                 injectResultElement(targetElementForError.closest('tr'), {
                    amount: "Error",
                    hasEnoughData: false, 
                    errorMessage: "Could not fetch User ID. Robux estimator cannot run."
                });
            } else {
                const errorDiv = document.createElement('div');
                errorDiv.textContent = '[Robux Estimator] Error: Could not fetch User ID. Estimator cannot run.';
                errorDiv.style.color = 'red';
                errorDiv.style.fontWeight = 'bold';
                document.body.prepend(errorDiv);
            }
            return;
        }


        if (document.readyState !== "complete") {
            await new Promise(resolve => window.addEventListener("load", resolve));
        }

        observeForElement(TARGET_ELEMENT_SELECTOR, async (targetElement) => {
            
            if (targetElement.classList.contains('robux-estimator-processed')) {
                return;
            }
            
            targetElement.classList.add('robux-estimator-processing');

            let rowToInjectInto = targetElement.closest('tr');
            if (!rowToInjectInto) {
                rowToInjectInto = targetElement; 
            }
            
            if (document.body.contains(rowToInjectInto)) {
                injectResultElement(rowToInjectInto, {
                    amount: 0,
                    hasEnoughData: false,
                    isLoading: true
                });
            } else {
            }

            const storedResults = getStoredResults(); 
            if (storedResults && storedResults.groupId === GROUP_ID) {
                let validTarget = targetElement.closest('tr');
                if (!validTarget) {
                    const anyRow = document.querySelector('table.table tr'); 
                    validTarget = anyRow || document.body; 
                }
                 injectResultElement(validTarget, {
                    amount: storedResults.estimatedRobux.amount,
                    hasEnoughData: storedResults.estimatedRobux.hasEnoughData,
                    pendingDays: storedResults.pendingDays,
                    lastCalculation: storedResults.lastCalculation
                });
                return; 
            }

            const transactions = await fetchTransactions();

            if (transactions.length === 0 && pagesFetched >= MAX_PAGES_TO_FETCH_FOR_INFERENCE) {
                 injectResultElement(rowToInjectInto, {
                    amount: 0,
                    hasEnoughData: false,
                    errorMessage: "No sales transactions found after checking multiple pages."
                });
                return;
            }


            const pendingDaysToUse = inferPendingDuration(transactions);

            const unpendingResult = calculateUnpendingRobux(transactions, pendingDaysToUse);

            const finalResults = {
                amount: unpendingResult.amount,
                hasEnoughData: unpendingResult.hasEnoughData,
                pendingDays: pendingDaysToUse,
                lastCalculation: Date.now()
            };
            
            storeResults(GROUP_ID, finalResults);
            injectResultElement(rowToInjectInto, finalResults);
        });

    } catch (error) {
        const criticalErrorDiv = document.createElement('div');
        criticalErrorDiv.textContent = '[Robux Estimator] A critical error occurred. Please check the console.';
        criticalErrorDiv.style.color = 'red';
        criticalErrorDiv.style.fontWeight = 'bold';
        criticalErrorDiv.style.position = 'fixed';
        criticalErrorDiv.style.top = '10px';
        criticalErrorDiv.style.left = '10px';
        criticalErrorDiv.style.backgroundColor = 'white';
        criticalErrorDiv.style.padding = '10px';
        criticalErrorDiv.style.zIndex = '9999';
        document.body.appendChild(criticalErrorDiv);
    }
})()};