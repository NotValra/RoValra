import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import DOMPurify from 'dompurify';

function onElementFound(container) {
    
    const buttonIdentifier = 'rovalra-total-earned-btn';
    if (container.querySelector(`.${buttonIdentifier}`)) return;

    const CALCULATION_STATE = {
        IDLE: 'IDLE',
        RUNNING: 'RUNNING',
        PAUSED: 'PAUSED',
        DONE: 'DONE',
        ERROR: 'ERROR',
    };

    let state = {
        status: CALCULATION_STATE.IDLE,
        totalEarned: 0, 
        transactionsProcessed: 0,
        sourceBreakdown: {}, 
        lastSaleCursor: "",
        lastPayoutCursor: "",
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

            if (transaction.currency && transaction.currency.amount > 0) {
                const amount = transaction.currency.amount;
                state.totalEarned += amount;

                let type = 'Other';
                
                if (transaction.category === 'GroupPayout') {
                    type = 'Group Payout';
                } else if (transaction.details && transaction.details.type) {
                    type = transaction.details.type;
                } else if (transaction.transactionType) {
                    type = transaction.transactionType;
                }
                
                if (!state.sourceBreakdown[type]) {
                    state.sourceBreakdown[type] = { count: 0, robux: 0 };
                }
                state.sourceBreakdown[type].count++;
                state.sourceBreakdown[type].robux += amount;
            }
            this.updateDOM();
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
            const breakdownEl = document.getElementById('rovalra-earnings-breakdown-container'); 

            const robuxIcon = `<span class="icon-robux-16x16" style="vertical-align: -3px;"></span>`;
            const formatRobux = (amount) => `${amount.toLocaleString()} ${robuxIcon}`;

            if (transEl) transEl.textContent = state.transactionsProcessed.toLocaleString();
            if (robuxEl) robuxEl.innerHTML = DOMPurify.sanitize(formatRobux(state.totalEarned));
            
            if (breakdownEl) {
                const sortedTypes = Object.keys(state.sourceBreakdown).sort((a, b) => 
                    state.sourceBreakdown[b].robux - state.sourceBreakdown[a].robux
                );
                
                const itemsHTML = sortedTypes.map(type => {
                    const data = state.sourceBreakdown[type];
                    const displayName = type.replace(/([A-Z])/g, ' $1').trim(); 
                    
                    return `<li>
                                <span class="rovalra-breakdown-amount">${displayName}</span>
                                <span class="rovalra-breakdown-count">x${data.count}</span>
                                <span class="rovalra-breakdown-price">${formatRobux(data.robux)}</span>
                            </li>`;
                }).join('');
                
                if (itemsHTML) {
                    breakdownEl.innerHTML = DOMPurify.sanitize(`<ul class="rovalra-breakdown-list">${itemsHTML}</ul>`);
                } else {
                    breakdownEl.innerHTML = DOMPurify.sanitize(`<div class="text-secondary text-caption-body" style="padding:8px;">No earnings found yet.</div>`);
                }
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
                color: var(--rovalra-secondary-text-color);
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
            .rovalra-stat-item { padding: 12px; border-radius: 6px; background: var(--rovalra-container-background-color); }
            

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
            .rovalra-stat-label { font-size: 14px; color: var(--rovalra-secondary-text-color); display: block; margin-bottom: 4px; }
            .rovalra-stat-value { font-size: 18px; font-weight: 600; color: var(--rovalra-main-text-color); display: flex; align-items: center; }
            
            .rovalra-divider { height: 1px; width: 100%; background-color: var(--rovalra-container-background-color); margin: 16px 0; }
            
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
                color: var(--rovalra-secondary-text-color); 
            }
            .rovalra-rate-limit-text { 
                color: var(--rovalra-main-text-color); 
            }

            .rovalra-breakdown-section { margin-top: 16px; text-align: left; }
            
            .rovalra-breakdown-list { 
                border: 1px solid var(--rovalra-container-background-color); 
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
            .rovalra-breakdown-list::-webkit-scrollbar-thumb { background-color: var(--rovalra-container-background-color); border-radius: 3px; }
            .rovalra-breakdown-list li { display: flex; align-items: center; padding: 8px 4px; font-size: 14px; color: var(--rovalra-main-text-color); border-bottom: 1px solid var(--rovalra-container-background-color); }
            .rovalra-breakdown-list li:last-child { border-bottom: none; }
            .rovalra-breakdown-amount { flex: 1 1 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }
            .rovalra-breakdown-count { flex-shrink: 0; width: 50px; text-align: center; color: var(--rovalra-secondary-text-color); }
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

        const robuxEarnedValue = state.totalEarned.toLocaleString();
        const transactionsValue = state.transactionsProcessed.toLocaleString();

        let header = "", mainContent = "", actions = [];
        const bodyContainer = document.createElement('div');
        bodyContainer.className = 'rovalra-overlay-body';

        if (state.status === CALCULATION_STATE.IDLE || state.status === CALCULATION_STATE.PAUSED) {
            header = 'Calculate Earnings';
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
                desc.textContent = "Calculate your total Robux earned from Sales and Group Payouts.";
                const robuxButton = createButton('Start Calculation', 'primary', { onClick: startCalculation });
                btnStack.append(robuxButton);
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
            
            const statsGridHTML = `
                <div class="rovalra-stats-grid">
                    <div class="rovalra-stat-item centered-content">
                        <span class="rovalra-stat-label">Transactions Scanned</span>
                        <span class="rovalra-stat-value" id="rovalra-stat-transactions">${transactionsValue}</span>
                    </div>
                    <div class="rovalra-stat-item centered-content">
                        <span class="rovalra-stat-label">Total Robux Earned</span>
                        <span class="rovalra-stat-value" id="rovalra-stat-robux">${robuxEarnedValue} <span class="icon-robux-16x16" style="vertical-align: -3px;"></span></span>
                    </div>
                </div>`;
            
            const breakdownsHTML = `
                <div class="rovalra-breakdown-section">
                    <span class="rovalra-stat-label">Earnings Source Breakdown</span>
                    <div id="rovalra-earnings-breakdown-container"></div>
                </div>
            `;

            let statusContent = "";

            switch (state.status) {
                case CALCULATION_STATE.RUNNING:
                    header = 'Calculating Earnings';
                    let statusText = "Scanning transaction history...";
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
                    const doneText = `<p class="text-body">All earning records have been scanned.</p>`;
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
                        createButton('Retry', 'primary', { onClick: runCalculation }),
                    ];
                    break;
            }

            bodyContainer.innerHTML = DOMPurify.sanitize(`
                ${statsGridHTML}
                ${breakdownsHTML}
                <div class="rovalra-divider"></div>
                <div class="rovalra-status-content">${statusContent}</div>`);
            
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
        setTimeout(() => { isUIUpdate = false; }, 50);
    };

    const pauseCalculation = (silent = false) => {
        if (state.status === CALCULATION_STATE.RUNNING) {
            state.status = CALCULATION_STATE.PAUSED;
            stopOverlayMonitor(); 
            if (!silent) updateOverlay();
        }
    };

    const runCalculation = async () => {
        if (!overlayInstance) updateOverlay();
        state.status = CALCULATION_STATE.RUNNING;
        updateOverlay();
        startOverlayMonitor();
        
        totalEarnedButton.style.pointerEvents = 'none';

        class PausedException extends Error {
            constructor(message) { super(message); this.name = "PausedException"; }
        }

        try {
            if (!state.userId) {
                const userData = await callRobloxApiJson({
                    subdomain: 'users',
                    endpoint: '/v1/users/authenticated'
                });
                if (!userData.id) throw new Error("Could not retrieve user ID.");
                state.userId = userData.id;
            }

            const transactionTasks = [
                { type: 'Sale', cursorKey: 'lastSaleCursor', category: 'Sale' },
                { type: 'GroupPayout', cursorKey: 'lastPayoutCursor', category: 'GroupPayout' }
            ];
            
            for (const task of transactionTasks) {
                let hasNextPage = true;
                while (hasNextPage && state.status === CALCULATION_STATE.RUNNING) {
                    
                    if (!document.getElementById('rovalra-stat-transactions')) throw new PausedException("Overlay closed.");

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
                                if (state.status !== CALCULATION_STATE.RUNNING) throw new PausedException("Paused.");
                                await new Promise(resolve => setTimeout(resolve, 250));
                            }
                            continue;
                        } else { 
                            state.retryCount++;
                            if (state.retryCount > 5) throw new Error(`Failed after retries: ${error.message}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
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
                await animationController.waitUntilIdle();
            } else {
                console.error('RoValra Earned: Error:', error);
                state.status = CALCULATION_STATE.ERROR;
                state.errorMessage = error.message;
                updateOverlay();
            }
        } finally {
            totalEarnedButton.style.pointerEvents = 'auto';
            state.isRateLimited = false;
            stopOverlayMonitor();
            if (overlayInstance && state.status !== CALCULATION_STATE.PAUSED) updateOverlay();
        }
    };
    
    const startCalculation = () => {
        state = {
            ...state,
            status: CALCULATION_STATE.IDLE,
            totalEarned: 0,
            transactionsProcessed: 0,
            sourceBreakdown: {},
            lastSaleCursor: "",
            lastPayoutCursor: "",
            errorMessage: "",
            retryCount: 0,
        };
        runCalculation();
    };

    const totalEarnedButton = createButton('Calculate Earned', 'secondary', {
        id: buttonIdentifier,
        onClick: () => updateOverlay()
    });
    totalEarnedButton.classList.add('btn-growth-md');
    totalEarnedButton.style.marginLeft = '10px';
    totalEarnedButton.style.marginTop = 'auto';
    totalEarnedButton.style.maxHeight = '36px';

    injectFeatureCss(); 
    
    container.appendChild(totalEarnedButton);
}

export function init() {
    chrome.storage.local.get('totalearnedEnabled', (result) => {
    if (result.totalearnedEnabled) {
            observeElement('.dropdown-container.container-header', onElementFound);
      }
    });
}