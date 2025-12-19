import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';

function onElementFound(container) {
    const buttonIdentifier = 'rovalra-total-spent-btn';
    if (container.querySelector(`.${buttonIdentifier}`)) return;

    const ROBUX_TO_USD_RATE = 0.0125;
    const CALCULATION_STATE = {
        IDLE: 'IDLE',
        RUNNING: 'RUNNING',
        PAUSED: 'PAUSED',
        DONE: 'DONE',
        ERROR: 'ERROR',
    };
    const CALCULATION_TYPE = {
        ROBUX_SPENT: 'ROBUX_SPENT',
        MONEY_SPENT: 'MONEY_SPENT',
    };

    let state = {
        status: CALCULATION_STATE.IDLE,
        calculationType: null,
        totalSpent: 0,
        totalMoneySpent: 0,
        currencyCode: 'USD',
        transactionsProcessed: 0,
        purchaseCounts: {}, 
        stipendCounts: {},
        itemTypeBreakdown: {}, 
        lastPurchaseCursor: "",
        lastStipendCursor: "",
        userId: 0,
        errorMessage: "",
        isRateLimited: false,
        retryCount: 0,
    };

    let overlayInstance = null;
    let isUIUpdate = false; 
    let uiObserver = null; 

    const startOverlayMonitor = () => {
        if (uiObserver) return; 
        uiObserver = new MutationObserver((mutations) => {
            if (isUIUpdate) return; 
            const statsElement = document.getElementById('rovalra-stat-transactions');
            const overlayElement = document.querySelector('.rovalra-global-overlay');
            if (state.status === CALCULATION_STATE.RUNNING && (!statsElement || !overlayElement)) {
                pauseCalculation(true); 
            }
        });
        uiObserver.observe(document.body, { childList: true, subtree: true });
    };

    const stopOverlayMonitor = () => {
        if (uiObserver) {
            uiObserver.disconnect();
            uiObserver = null;
        }
    };

    const animationController = {
        queue: [],
        isAnimating: false,
        animationInterval: null,
        robuxToPriceMap: new Map(),
        premiumRobuxToProductMap: new Map(),

        addBatch(transactions) {
            this.queue.push(...transactions);
            if (!this.isAnimating) this.start();
        },
        start() {
            this.isAnimating = true;
            this.animationInterval = setInterval(() => this.tick(), 20);
        },
        tick() {
            if (this.queue.length === 0) { this.stop(); return; }

            const transaction = this.queue.shift();
            state.transactionsProcessed++;

            if (state.calculationType === CALCULATION_TYPE.ROBUX_SPENT) {
                if (transaction.currency && transaction.currency.amount < 0) {
                    const amount = Math.abs(transaction.currency.amount);
                    state.totalSpent += amount;

                    const type = transaction.details && transaction.details.type ? transaction.details.type : 'Other';
                    
                    if (!state.itemTypeBreakdown[type]) {
                        state.itemTypeBreakdown[type] = { count: 0, robux: 0 };
                    }
                    state.itemTypeBreakdown[type].count++;
                    state.itemTypeBreakdown[type].robux += amount;
                }
            } else if (transaction.category === 'Premium') {
                const amount = transaction.currency.amount;
                const product = this.premiumRobuxToProductMap.get(amount);
                if (product) {
                    state.totalMoneySpent += product.price;
                    const amountKey = amount.toString();
                    state.stipendCounts[amountKey] = (state.stipendCounts[amountKey] || 0) + 1;
                }
            } else if (transaction.category === 'Currency') {
                const amount = transaction.currency.amount;
                const amountKey = amount.toString();
                state.purchaseCounts[amountKey] = (state.purchaseCounts[amountKey] || 0) + 1;

                const price = this.getPriceForRobuxAmount(amount);
                if (price) {
                    state.totalMoneySpent += price;
                }
            }
            this.updateDOM();
        },
        getPriceForRobuxAmount(amount) {
            let closestAmount = 0;
            let smallestDiff = Infinity;
            for (const robuxAmount of this.robuxToPriceMap.keys()) {
                const diff = Math.abs(robuxAmount - amount);
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    closestAmount = robuxAmount;
                }
            }
            if (closestAmount > 0 && (smallestDiff / closestAmount) < 0.25) {
                return this.robuxToPriceMap.get(closestAmount);
            }
            return null;
        },
        stop() {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
            this.isAnimating = false;
        },
        waitUntilIdle() {
            return new Promise(resolve => {
                const check = () => this.isAnimating ? setTimeout(check, 100) : resolve();
                check();
            });
        },
        updateDOM() {
            const transEl = document.getElementById('rovalra-stat-transactions');
            const robuxEl = document.getElementById('rovalra-stat-robux');
            const moneySpentEl = document.getElementById('rovalra-stat-money-spent');
            const purchaseBreakdownEl = document.getElementById('rovalra-purchase-breakdown-container');
            const premiumBreakdownEl = document.getElementById('rovalra-premium-breakdown-container');
            const itemTypeBreakdownEl = document.getElementById('rovalra-itemtype-breakdown-container'); 

            const robuxIcon = `<span class="icon-robux-16x16" style="vertical-align: -3px;"></span>`;
            const formatRobux = (amount) => `${amount.toLocaleString()} ${robuxIcon}`;
            const formatCurrency = (amount) => amount.toLocaleString(undefined, { style: 'currency', currency: state.currencyCode });

            if (transEl) transEl.textContent = state.transactionsProcessed.toLocaleString();
            if (robuxEl) robuxEl.innerHTML = formatRobux(state.totalSpent);
            if (moneySpentEl) moneySpentEl.textContent = state.totalMoneySpent.toLocaleString(undefined, { style: 'currency', currency: state.currencyCode });
            
            if (itemTypeBreakdownEl) {
                const sortedTypes = Object.keys(state.itemTypeBreakdown).sort((a, b) => 
                    state.itemTypeBreakdown[b].robux - state.itemTypeBreakdown[a].robux
                );
                
                const itemsHTML = sortedTypes.map(type => {
                    const data = state.itemTypeBreakdown[type];
                    const displayName = type.replace(/([A-Z])/g, ' $1').trim(); 
                    
                    return `<li>
                                <span class="rovalra-breakdown-amount">${displayName}</span>
                                <span class="rovalra-breakdown-count">x${data.count}</span>
                                <span class="rovalra-breakdown-price">${formatRobux(data.robux)}</span>
                            </li>`;
                }).join('');
                
                if (itemsHTML) {
                    itemTypeBreakdownEl.innerHTML = `<ul class="rovalra-breakdown-list">${itemsHTML}</ul>`;
                } else {
                    itemTypeBreakdownEl.innerHTML = `<div class="text-secondary text-caption-body" style="padding:8px;">No items found yet.</div>`;
                }
            }

            if (purchaseBreakdownEl) {
                const sorted = Object.keys(state.purchaseCounts).sort((a, b) => Number(b) - Number(a));
                const itemsHTML = sorted.map(amountStr => {
                    const amount = Number(amountStr), count = state.purchaseCounts[amountStr], price = this.getPriceForRobuxAmount(amount);
                    const total = price ? formatCurrency(price * count) : 'N/A';
                    return `<li>
                                <span class="rovalra-breakdown-amount">${formatRobux(amount)} Pack</span>
                                <span class="rovalra-breakdown-count">x${count}</span>
                                <span class="rovalra-breakdown-price">${total}</span>
                            </li>`;
                }).join('');
                purchaseBreakdownEl.innerHTML = `<ul class="rovalra-breakdown-list">${itemsHTML}</ul>`;
            }
            
            if (premiumBreakdownEl) {
                const sorted = Object.keys(state.stipendCounts).sort((a, b) => Number(b) - Number(a));
                const itemsHTML = sorted.map(amountStr => {
                    const amount = Number(amountStr), count = state.stipendCounts[amountStr], product = this.premiumRobuxToProductMap.get(amount);
                    const total = product ? formatCurrency(product.price * count) : 'N/A';
                    const name = product ? product.name : `${formatRobux(amount)} Stipend`;
                    return `<li>
                                <span class="rovalra-breakdown-amount">${name}</span>
                                <span class="rovalra-breakdown-count">x${count}</span>
                                <span class="rovalra-breakdown-price">${total}</span>
                            </li>`;
                }).join('');
                premiumBreakdownEl.innerHTML = `<ul class="rovalra-breakdown-list">${itemsHTML}</ul>`;
            }
        }
    };

    const injectFeatureCss = () => {
        const styleId = 'rovalra-totalspent-style';
        if (document.getElementById(styleId)) return;
        const css = `
            .rovalra-overlay-body {
                display: flex;
                flex-direction: column;
                min-height: 250px;
                justify-content: center;
                width: 100%;
            }
            .rovalra-overlay-body.content-top {
                justify-content: flex-start;
            }
            
            .rovalra-action-stack {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 100%;
                max-width: 340px;
                margin: 0 auto;
                align-items: center;
            }
            .rovalra-action-stack button {
                width: 100%;
                justify-content: center;
            }

            .rovalra-description {
                text-align: center;
                color: var(--text-secondary);
                margin-bottom: 24px;
                font-size: 16px;
            }

            .rovalra-stats-grid { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 12px; 
                margin-top: 12px; 
                margin-bottom: 16px; 
                text-align: left; 
            }
            .rovalra-stat-item { padding: 12px; border-radius: 6px; background: var(--bg-secondary); }
            

            .rovalra-stat-item.centered-content { 
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                padding: 16px;
            }
            
            .rovalra-stat-item.centered-content .rovalra-stat-value {
                font-size: 22px; 
                margin-top: 4px;
                justify-content: center;
            }

            .rovalra-stat-item.full-width { grid-column: 1 / -1; }
            .rovalra-stat-label { font-size: 14px; color: var(--text-secondary); display: block; margin-bottom: 4px; }
            .rovalra-stat-value { font-size: 18px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; }
            
            .rovalra-divider { height: 1px; width: 100%; background-color: var(--color-stroke-muted); margin: 16px 0; }
            
            .rovalra-status-content { 
                min-height: 60px; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
            }
            
            .rovalra-status-wrapper {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                text-align: center;
            }
            
            .rovalra-status-text { 
                font-size: 14px; 
                color: var(--text-secondary); 
            }
            .rovalra-rate-limit-text { 
                color: var(--text-warning); 
            }

            .rovalra-breakdown-section { margin-top: 16px; text-align: left; }
            
            .rovalra-breakdown-list { 
                border: 1px solid var(--color-stroke-muted); 
                border-radius: 6px; 
                padding: 8px 12px; 
                margin: 8px 0 0 0; 
                max-height: 220px; 
                overflow-y: auto; 
                list-style: none;
                pointer-events: auto; 
            }
            
            .rovalra-breakdown-list::-webkit-scrollbar { width: 6px; }
            .rovalra-breakdown-list::-webkit-scrollbar-track { background: transparent; }
            .rovalra-breakdown-list::-webkit-scrollbar-thumb { background-color: var(--bg-secondary); border-radius: 3px; }
            .rovalra-breakdown-list li { display: flex; align-items: center; padding: 8px 4px; font-size: 14px; color: var(--text-primary); border-bottom: 1px solid var(--border-default); }
            .rovalra-breakdown-list li:last-child { border-bottom: none; }
            .rovalra-breakdown-amount { flex: 1 1 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }
            .rovalra-breakdown-count { flex-shrink: 0; width: 50px; text-align: center; color: var(--text-secondary); }
            .rovalra-breakdown-price { flex: 1 1 0; text-align: right; font-weight: 600; }
        `;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    };

    const handleOverlayClose = () => {
        if (isUIUpdate) return;
        if (state.status === CALCULATION_STATE.RUNNING) {
            pauseCalculation(true); 
        }
        overlayInstance = null;
    };

    const updateOverlay = () => {
        isUIUpdate = true;
        if (overlayInstance) overlayInstance.close();

        const moneySpentValue = state.totalMoneySpent.toLocaleString(undefined, { style: 'currency', currency: state.currencyCode });
        const robuxSpentValue = state.totalSpent.toLocaleString();
        const transactionsValue = state.transactionsProcessed.toLocaleString();

        let header = "", mainContent = "", actions = [];

        const bodyContainer = document.createElement('div');
        bodyContainer.className = 'rovalra-overlay-body';

        if (state.status === CALCULATION_STATE.IDLE || state.status === CALCULATION_STATE.PAUSED) {
            header = 'Calculate Spend';
            const desc = document.createElement('div');
            desc.className = 'rovalra-description';
            
            const btnStack = document.createElement('div');
            btnStack.className = 'rovalra-action-stack';

            if (state.status === CALCULATION_STATE.PAUSED) {
                desc.textContent = "Calculation paused. Resume to continue counting.";
                const resumeButton = createButton('Resume Calculation', 'primary', { onClick: runCalculation });
                const newCalcButton = createButton('Start New Calculation', 'secondary', { onClick: () => { state.status = CALCULATION_STATE.IDLE; updateOverlay(); } });
                btnStack.append(resumeButton, newCalcButton);
            } else { 
                desc.textContent = "Select a mode to calculate your transaction history.";
                const robuxButton = createButton('Calculate Robux Spent', 'primary', { onClick: () => startCalculation(CALCULATION_TYPE.ROBUX_SPENT) });
                const moneyButton = createButton('Calculate Money Spent', 'primary', { onClick: () => startCalculation(CALCULATION_TYPE.MONEY_SPENT) });
                btnStack.append(robuxButton, moneyButton);
            }

            bodyContainer.append(desc, btnStack);
            mainContent = bodyContainer;

            overlayInstance = createOverlay({
                title: header,
                bodyContent: mainContent,
                actions: [],
                showLogo: 'rovalraIcon',
                onClose: handleOverlayClose
            });
        } else {
            bodyContainer.classList.add('content-top'); 
            
            let statsGridHTML = "", breakdownsHTML = "", statusContent = "";

            if (state.calculationType === CALCULATION_TYPE.ROBUX_SPENT) {

                statsGridHTML = `
                    <div class="rovalra-stats-grid">
                        <div class="rovalra-stat-item centered-content">
                            <span class="rovalra-stat-label">Transactions Scanned</span>
                            <span class="rovalra-stat-value" id="rovalra-stat-transactions">${transactionsValue}</span>
                        </div>
                        <div class="rovalra-stat-item centered-content">
                            <span class="rovalra-stat-label">Total Robux Spent</span>
                            <span class="rovalra-stat-value" id="rovalra-stat-robux">${robuxSpentValue} <span class="icon-robux-16x16" style="vertical-align: -3px;"></span></span>
                        </div>
                    </div>`;
                
                breakdownsHTML = `
                    <div class="rovalra-breakdown-section">
                        <span class="rovalra-stat-label">Item Type Breakdown</span>
                        <div id="rovalra-itemtype-breakdown-container"></div>
                    </div>
                `;

            } else { 
                statsGridHTML = `
                    <div class="rovalra-stats-grid">
                        <div class="rovalra-stat-item">
                            <span class="rovalra-stat-label">Transactions Scanned</span>
                            <span class="rovalra-stat-value" id="rovalra-stat-transactions">${transactionsValue}</span>
                        </div>
                        <div class="rovalra-stat-item">
                            <span class="rovalra-stat-label">Total Spent (Approx.)</span>
                            <span class="rovalra-stat-value" id="rovalra-stat-money-spent">${moneySpentValue}</span>
                        </div>
                    </div>`;
                breakdownsHTML = `
                    <div class="rovalra-breakdown-section">
                        <span class="rovalra-stat-label">Premium Subscription Breakdown</span>
                        <div id="rovalra-premium-breakdown-container"></div>
                    </div>
                    <div class="rovalra-breakdown-section">
                        <span class="rovalra-stat-label">Robux Purchase Breakdown</span>
                        <div id="rovalra-purchase-breakdown-container"></div>
                    </div>
                `;
            }

            switch (state.status) {
                case CALCULATION_STATE.RUNNING:
                    header = 'Calculating';
                    
                    let statusText = "Calculating...";
                    let statusClass = "rovalra-status-text";
                    
                    if (state.isRateLimited) {
                        statusText = "API rate limited. Still counting...";
                        statusClass = "rovalra-status-text rovalra-rate-limit-text";
                    }

                    statusContent = `
                        <div class="rovalra-status-wrapper">
                            <span class="${statusClass}">${statusText}</span>
                            <span class="spinner spinner-default"></span>
                        </div>`;
                    
                    actions = [];
                    break;

                case CALCULATION_STATE.DONE:
                    header = 'Calculation Complete';
                    const doneText = `<p class="text-body">All relevant transactions have been scanned.</p><p class="text-caption-body text-secondary" style="margin-bottom: 16px;"></p>`;
                    const newCalcBtn = createButton('New Calculation', 'primary', { onClick: () => { state.status = CALCULATION_STATE.IDLE; updateOverlay(); } });
                    
                    const btnWrapper = document.createElement('div');
                    btnWrapper.className = 'rovalra-action-stack';
                    btnWrapper.appendChild(newCalcBtn);

                    statusContent = doneText + btnWrapper.outerHTML; 
                    
                    actions = [];
                    break;

                case CALCULATION_STATE.ERROR:
                    header = 'An Error Occurred';
                    statusContent = `<p class="text-error">${state.errorMessage}</p>`;
                    actions = [
                        createButton('Retry', 'primary', { onClick: resetAndRunCalculation }),
                    ];
                    break;
            }


            
            bodyContainer.innerHTML = `
                ${statsGridHTML}
                ${breakdownsHTML}
                <div class="rovalra-divider"></div>
                <div class="rovalra-status-content">${statusContent}</div>`;
            
            mainContent = bodyContainer;

            overlayInstance = createOverlay({
                title: header,
                bodyContent: mainContent,
                actions: actions, 
                showLogo: 'rovalraIcon',
                onClose: handleOverlayClose
            });

            if (state.status === CALCULATION_STATE.DONE) {
                const btn = bodyContainer.querySelector('.rovalra-action-stack button');
                if (btn) {
                    btn.addEventListener('click', () => { 
                        state.status = CALCULATION_STATE.IDLE; 
                        updateOverlay(); 
                    });
                }
            }
        }
        
        animationController.updateDOM();
        
        setTimeout(() => {
            isUIUpdate = false;
        }, 50);
    };

    const pauseCalculation = (silent = false) => {
        if (state.status === CALCULATION_STATE.RUNNING) {
            state.status = CALCULATION_STATE.PAUSED;
            stopOverlayMonitor(); 
            if (!silent) {
                updateOverlay();
            }
        }
    };

    const runCalculation = async () => {
        if (!overlayInstance) {
            updateOverlay();
        }
        state.status = CALCULATION_STATE.RUNNING;
        updateOverlay();
        startOverlayMonitor();
        
        totalSpentButton.style.pointerEvents = 'none';

        class PausedException extends Error {
            constructor(message) { super(message); this.name = "PausedException"; }
        }
        const MAX_RETRIES = 3;

        try {
            if (!state.userId) {
                const userData = await callRobloxApiJson({
                    subdomain: 'users',
                    endpoint: '/v1/users/authenticated'
                });
                if (!userData.id) throw new Error("Could not retrieve user ID.");
                state.userId = userData.id;
            }
            
            if (state.calculationType === CALCULATION_TYPE.MONEY_SPENT && animationController.robuxToPriceMap.size === 0) {
                const productsData = await callRobloxApiJson({
                    subdomain: 'premiumfeatures',
                    endpoint: '/v1/products?skipPremiumUserCheck=true'
                });
                productsData.products.forEach(p => {
                     if (p.premiumFeatureTypeName === 'Subscription') {
                        animationController.premiumRobuxToProductMap.set(p.robuxAmount, { price: p.price.amount, name: p.defaultDisplayName });
                    } else { 
                        animationController.robuxToPriceMap.set(p.robuxAmount, p.price.amount);
                    }
                });
                state.currencyCode = productsData.products[0]?.price.currency.currencyCode || 'USD';
                if (!animationController.robuxToPriceMap.has(80)) animationController.robuxToPriceMap.set(80, 0.99);
            }

            const transactionTasks = state.calculationType === CALCULATION_TYPE.ROBUX_SPENT ?
                [{ type: 'Purchase', cursorKey: 'lastPurchaseCursor', category: 'Currency' }] :
                [
                    { type: 'PremiumStipend', cursorKey: 'lastStipendCursor', category: 'Premium' },
                    { type: 'CurrencyPurchase', cursorKey: 'lastPurchaseCursor', category: 'Currency' }
                ];
            
            for (const task of transactionTasks) {
                let hasNextPage = true;
                while (hasNextPage && state.status === CALCULATION_STATE.RUNNING) {
                    
                    if (!document.getElementById('rovalra-stat-transactions')) {
                         throw new PausedException("Overlay closed by user.");
                    }

                    await animationController.waitUntilIdle();
                    const cursor = state[task.cursorKey];
                    
                    try {
                        const data = await callRobloxApiJson({
                            subdomain: 'apis',
                            endpoint: `/transaction-records/v1/users/${state.userId}/transactions?cursor=${cursor}&limit=100&transactionType=${task.type}&itemPricingType=PaidAndLimited`
                        });

                        state.retryCount = 0; 

                        if (state.isRateLimited) { state.isRateLimited = false; updateOverlay(); }
                        
                        if (data.data && data.data.length > 0) {
                            const processedData = data.data.map(t => ({...t, category: task.category }));
                            animationController.addBatch(processedData);
                        }

                        if (data.nextPageCursor) {
                            state[task.cursorKey] = data.nextPageCursor;
                        } else {
                            hasNextPage = false;
                        }
                    } catch (error) {
                        if (error.status === 429 || error.message?.includes('429')) { 
                            if (!state.isRateLimited) { state.isRateLimited = true; updateOverlay(); }
                            const waitUntil = Date.now() + (5 * 1000); 
                            while (Date.now() < waitUntil) {
                                if (state.status !== CALCULATION_STATE.RUNNING) throw new PausedException("Paused during rate-limit wait.");
                                await new Promise(resolve => setTimeout(resolve, 250));
                            }
                            if (state.isRateLimited) { 
                                state.isRateLimited = false; updateOverlay(); 
                            }
                            continue;
                        } else { 
                            state.retryCount++;
                            if (state.retryCount > 5) {
                                throw new Error(`Failed after multiple retries. Last error: ${error.message || 'Unknown'}`);
                            }
                            const waitUntil = Date.now() + 1000;
                            while (Date.now() < waitUntil) {
                                if (state.status !== CALCULATION_STATE.RUNNING) throw new PausedException("Paused during retry wait.");
                                await new Promise(resolve => setTimeout(resolve, 250));
                            }
                            continue; 
                        }
                    }
                }
            }
            await animationController.waitUntilIdle();
            if (state.status === CALCULATION_STATE.RUNNING) state.status = CALCULATION_STATE.DONE;

        } catch (error) {
            stopOverlayMonitor(); 
            if (error instanceof PausedException) {
                console.log(`RoValra: ${error.message}`);
                await animationController.waitUntilIdle();
            } else {
                console.error('RoValra: An error occurred during calculation:', error);
                state.status = CALCULATION_STATE.ERROR;
                state.errorMessage = error.message;
                updateOverlay();
            }
        } finally {
            totalSpentButton.style.pointerEvents = 'auto';
            state.isRateLimited = false;
            stopOverlayMonitor();
            if (overlayInstance && state.status !== CALCULATION_STATE.PAUSED) updateOverlay();
        }
    };
    
    const startCalculation = (type) => {
        state = {
            ...state,
            status: CALCULATION_STATE.IDLE,
            calculationType: type,
            totalSpent: 0,
            totalMoneySpent: 0,
            transactionsProcessed: 0,
            purchaseCounts: {},
            stipendCounts: {},
            itemTypeBreakdown: {}, 
            lastPurchaseCursor: "",
            lastStipendCursor: "",
            errorMessage: "",
            retryCount: 0,
        };
        runCalculation();
    };
    
    const resetAndRunCalculation = () => {
        startCalculation(state.calculationType);
    };

    const totalSpentButton = createButton('Calculate Spend', 'secondary', {
        id: buttonIdentifier,
        onClick: () => updateOverlay()
    });
    totalSpentButton.classList.add('btn-growth-md');
    totalSpentButton.style.marginLeft = '10px';
    totalSpentButton.style.marginTop = 'auto';
    totalSpentButton.style.maxHeight = '36px';

    injectFeatureCss();
    container.appendChild(totalSpentButton);
}

export function init() {
    chrome.storage.local.get('totalspentEnabled', (result) => {
        if (result.totalspentEnabled) {
            observeElement('.dropdown-container.container-header', onElementFound);
        }
    });
}