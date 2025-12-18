import { checkAssetsInBatch } from '../../core/utils/assetStreamer.js';
import { observeElement } from '../../core/observer.js';
import { createAvatarFilterUI } from '../../core/ui/FiltersUI.js';

chrome.storage.local.get({
    avatarFiltersEnabled: false,
    searchbarEnabled: false
}, (settings) => {
    if (!settings.avatarFiltersEnabled && !settings.searchbarEnabled) {
        return;
    } else {
        (function() {
            'use strict';

            const CATALOG_BATCH_SIZE = 100;
            const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            
            let itemDataCache = new Map(); 
            let domMetadata = new WeakMap(); 

            const selectedFilters = new Set();
            let priceFilter = { min: { active: false, value: null }, max: { active: false, value: null } };
            let availabilityFilter = 'all';
            let creatorFilter = { active: false, name: '' };
            
            let activeCategoryHash = window.location.hash; 
            let scanSessionId = 0; 
            let domUpdateAnimationFrame = null; 

            let scanQueue = new Set();
            let scanQueueTimer = null;
            let activeObservers = [];

       
            function analyzeAssetTree(roots) {
                const detectedEffects = new Set();
                if (!roots || !Array.isArray(roots)) return detectedEffects;

                function traverse(instance) {
                    if (!instance) return;

                    const className = instance.ClassName;

                    if (className === 'ParticleEmitter' || className === 'Fire' || className === 'Sparkles') {
                        detectedEffects.add('itemsWithEffects');
                    }

                    if (className === 'SurfaceAppearance' || className === 'MaterialVariant' || 
                        className === 'MetalnessMap' || className === 'RoughnessMap' || className === 'NormalMap') {
                        detectedEffects.add('surfaceAppearance');
                    }

                    if (instance.Children && instance.Children.length > 0) {
                        for (const child of instance.Children) {
                            traverse(child);
                        }
                    }
                }

                roots.forEach(root => traverse(root));
                return detectedEffects;
            }

            function isFilteringActive() {
                if (selectedFilters.size > 0) return true;
                if (priceFilter.min.active || priceFilter.max.active) return true;
                if (availabilityFilter !== 'all') return true;
                if (creatorFilter.active) return true;
                
                const searchInput = document.getElementById('rovalra-fx-search-bar');
                return searchInput && searchInput.value.length > 0;
            }

            function fullStateReset() {
                scanSessionId++; 
                
                activeObservers.forEach(obs => {
                    if (obs) {
                        if (typeof obs.disconnect === 'function') obs.disconnect();
                        else if (typeof obs.stop === 'function') obs.stop(); 
                    }
                });
                activeObservers = []; 

                if (scanQueueTimer) {
                    clearTimeout(scanQueueTimer);
                    scanQueueTimer = null;
                }
                scanQueue.clear();

                if (domUpdateAnimationFrame) {
                    cancelAnimationFrame(domUpdateAnimationFrame);
                    domUpdateAnimationFrame = null;
                }

                itemDataCache = new Map();
                domMetadata = new WeakMap(); 
                
                selectedFilters.clear();
                priceFilter = { min: { active: false, value: null }, max: { active: false, value: null } };
                availabilityFilter = 'all';
                creatorFilter = { active: false, name: '' };
                
                activeCategoryHash = window.location.hash;

                document.querySelectorAll('.rovalra-filtering-enabled').forEach(el => {
                    el.classList.remove('rovalra-filtering-enabled');
                });

                const existingUI = document.getElementById('rovalra-fx-container');
                if (existingUI) existingUI.remove();
            }

            document.addEventListener('rovalra-catalog-details-response', (event) => {
                const data = event.detail;
                if (!data || !data.data) return;
                
                if (itemDataCache.size === 0) return;

                data.data.forEach(item => {
                    const cacheEntry = itemDataCache.get(item.id);
                    if (cacheEntry) {
                        cacheEntry.isLimited = item.itemRestrictions?.includes('Limited') || item.itemRestrictions?.includes('LimitedUnique') || item.itemRestrictions?.includes('Collectible');
                        cacheEntry.name = item.name;
                        cacheEntry.searchName = (item.name || '').toLowerCase(); 
                        cacheEntry.price = item.price;
                        cacheEntry.creatorName = item.creatorName;
                        cacheEntry.creatorSearchName = (item.creatorName || '').toLowerCase(); 
                        cacheEntry.isOffsale = (item.priceStatus === 'Off Sale' || item.isOffSale === true) && !cacheEntry.isLimited;
                        cacheEntry.isValid = true; 
                    }
                });
            });

            async function processItemIds(assetIds, currentSession) {
                if (assetIds.length === 0) return;

                for (let i = 0; i < assetIds.length; i += CATALOG_BATCH_SIZE) {
                    if (currentSession !== scanSessionId) return;

                    const chunk = assetIds.slice(i, i + CATALOG_BATCH_SIZE);
                    const chunkIdsNeedingEffects = [];

                    chunk.forEach(id => {
                        if (!itemDataCache) return; 
                        let entry = itemDataCache.get(id);
                        if (!entry) {
                            entry = {
                                assetId: id, 
                                effects: new Set(), 
                                isValid: false, 
                                isLimited: false, 
                                isOffsale: false,
                                name: 'Loading...', 
                                searchName: '',
                                price: null, 
                                creatorName: 'Loading...',
                                creatorSearchName: ''
                            };
                            itemDataCache.set(id, entry);
                            chunkIdsNeedingEffects.push(id);
                        } else if (!entry.isValid) {
                            chunkIdsNeedingEffects.push(id);
                        }
                    });

                    if (chunkIdsNeedingEffects.length > 0) {
                        try {
                            const parsedResults = await checkAssetsInBatch(chunkIdsNeedingEffects);
                            if (currentSession !== scanSessionId) return;
                            
                            parsedResults.forEach(result => {
                                const cacheEntry = itemDataCache.get(result.assetId);
                                if (cacheEntry) {
                                    if (result.root) {
                                        cacheEntry.effects = analyzeAssetTree(result.root);
                                    } else {
                                        cacheEntry.effects = new Set();
                                    }
                                }
                            });
                        } catch (err) {
                            console.warn("Asset batch check failed", err);
                        }
                    }

                    if (currentSession === scanSessionId) {
                        triggerDomUpdate();
                    }
                }
            }

            function determineVisibility(meta, entry, searchTerm) {
                if (searchTerm) {
                    const nameToCheck = (entry && entry.searchName) ? entry.searchName : meta.searchName;
                    if (!nameToCheck.includes(searchTerm)) return false; 
                }

                const hasStrictFilters = selectedFilters.size > 0 || 
                                       priceFilter.min.active || 
                                       priceFilter.max.active || 
                                       creatorFilter.active || 
                                       availabilityFilter !== 'all';

                if (!hasStrictFilters) return true;

                if (!entry || !entry.isValid) return false; 

                if (selectedFilters.size > 0) {
                    for (const filterId of selectedFilters) {
                        const match = (filterId === 'limited') ? entry.isLimited : entry.effects.has(filterId);
                        if (!match) return false;
                    }
                }

                if (priceFilter.min.active || priceFilter.max.active) {
                    const val = entry.price;
                    if (typeof val !== 'number') return false; 
                    if (priceFilter.min.active && val < priceFilter.min.value) return false;
                    if (priceFilter.max.active && val > priceFilter.max.value) return false;
                }

                if (availabilityFilter !== 'all') {
                    if (availabilityFilter === 'onsale' && entry.isOffsale) return false;
                    else if (availabilityFilter === 'offsale' && !entry.isOffsale) return false;
                }

                if (creatorFilter.active) {
                    if (!entry.creatorSearchName || !entry.creatorSearchName.includes(creatorFilter.name.toLowerCase())) return false;
                }

                return true;
            }

            let filterUpdatePending = false;
            
            function triggerDomUpdate() {
                if (!filterUpdatePending) {
                    filterUpdatePending = true;
                    if (domUpdateAnimationFrame) cancelAnimationFrame(domUpdateAnimationFrame);
                    domUpdateAnimationFrame = requestAnimationFrame(applyFilterToDOM);
                }
            }

            function applyFilterToDOM() {
                filterUpdatePending = false;
                domUpdateAnimationFrame = null;

                const spinner = document.getElementById('rovalra-filter-loading');
                if (spinner) spinner.style.display = 'none';

                const activeTabPane = document.querySelector('.tab-pane.active');
                if (!activeTabPane) return;

                const searchInput = document.getElementById('rovalra-fx-search-bar');
                const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
                const active = isFilteringActive();

                const listContainer = activeTabPane.querySelector('ul.item-cards-stackable');
                if (listContainer) {
                    if (active) listContainer.classList.add('rovalra-filtering-enabled');
                    else listContainer.classList.remove('rovalra-filtering-enabled');
                }

                const itemCards = activeTabPane.getElementsByClassName('list-item');
                
                for (let i = 0, len = itemCards.length; i < len; i++) {
                    const card = itemCards[i];
                    
                    const meta = domMetadata.get(card);
                    if (!meta) continue; 

                    if (!active) {
                        if (card.classList.contains('rovalra-fx-hidden')) card.classList.remove('rovalra-fx-hidden');
                        card.classList.add('rovalra-show'); 
                        
                        const img = meta.img;
                        if (img && img.dataset.rovalraSrc) {
                            img.src = img.dataset.rovalraSrc;
                            delete img.dataset.rovalraSrc;
                        }
                        continue;
                    }

                    const itemData = itemDataCache.get(meta.id);
                    const shouldShow = determineVisibility(meta, itemData, searchTerm);
                    const img = meta.img;

                    if (shouldShow) {
                        card.classList.add('rovalra-show');
                        card.classList.remove('rovalra-fx-hidden');

                        if (img && img.dataset.rovalraSrc) {
                            img.src = img.dataset.rovalraSrc;
                            delete img.dataset.rovalraSrc;
                        }

                    } else {
                        card.classList.remove('rovalra-show');
                        

                        if (img) {
                            const currentSrc = img.src;
                            if (currentSrc && !currentSrc.startsWith('data:')) {
                                img.dataset.rovalraSrc = currentSrc;
                                img.src = TRANSPARENT_PIXEL;
                            }
                        }
                    }
                }
            }

            async function applyAllFilters() {
                const currentSession = scanSessionId;
                addLoadingSpinner();
                updateToggleButtonText();

                selectedFilters.clear();
                document.querySelectorAll('#rovalra-fx-dropdown button[role="checkbox"]').forEach(btn => {
                    const filterId = btn.id.replace('rovalra-filter-', '');
                    if (btn.getAttribute('aria-checked') === 'true') {
                        selectedFilters.add(filterId);
                    }
                });

                const creatorVal = document.getElementById('rovalra-creator-name')?.value.trim();
                creatorFilter = creatorVal ? { active: true, name: creatorVal } : { active: false, name: '' };

                const minPrice = parseInt(document.getElementById('rovalra-min-price-value')?.value, 10);
                const maxPrice = parseInt(document.getElementById('rovalra-max-price-value')?.value, 10);
                priceFilter.min = (!isNaN(minPrice) && minPrice >= 0) ? { active: true, value: minPrice } : { active: false, value: null };
                priceFilter.max = (!isNaN(maxPrice) && maxPrice >= 0) ? { active: true, value: maxPrice } : { active: false, value: null };

                availabilityFilter = document.getElementById('rovalra-availability-filter')?.value || 'all';

                triggerDomUpdate();

                const activeTabPane = document.querySelector('.tab-pane.active');
                const itemIdsToRecheck = new Set();
                
                if (activeTabPane) {
                    const cards = activeTabPane.querySelectorAll('.list-item');
                    cards.forEach(card => {
                        const meta = domMetadata.get(card);
                        if (meta && meta.id) {
                            const cacheEntry = itemDataCache.get(meta.id);
                            if (!cacheEntry || !cacheEntry.isValid) {
                                itemIdsToRecheck.add(meta.id);
                            }
                        }
                    });
                }

                try {
                    if (itemIdsToRecheck.size > 0) {
                        await processItemIds(Array.from(itemIdsToRecheck), currentSession);
                    }
                } catch(e) {
                    console.error("Filter process error", e);
                } finally {
                    if (currentSession === scanSessionId) {
                        triggerDomUpdate();
                    }
                }
            }

            function updateToggleButtonText() {
                const btn = document.getElementById('rovalra-fx-toggle-btn');
                if (!btn) return;
                const count = selectedFilters.size + (priceFilter.min.active ? 1 : 0) + (priceFilter.max.active ? 1 : 0) + (availabilityFilter !== 'all' ? 1 : 0) + (creatorFilter.active ? 1 : 0);
                btn.querySelector('span').textContent = 'Filter Items';
                btn.classList.toggle('filter-applied', count > 0);
            }

            function ensureUIInActiveTab() {
                const activeTab = document.querySelector('.tab-pane.active');
                if (!activeTab) return;

                const currentHash = window.location.hash;
                if (currentHash !== activeCategoryHash) {
                    fullStateReset();
                }

                let container = document.getElementById('rovalra-fx-container');
                if (container && (container.dataset.category !== currentHash || container.parentElement !== activeTab)) {
                    container.remove();
                    container = null;
                }

                if (activeTab.id === 'scale' || activeTab.id === 'bodyColors') {
                    if (container) container.remove();
                    return;
                }

                const isCostumesTab = activeTab.id === 'costumes';
                const showFilters = settings.avatarFiltersEnabled && !isCostumesTab;
                const showSearch = settings.searchbarEnabled;

                if (!showFilters && !showSearch) {
                    if (container) container.remove();
                    return;
                }

                if (!container) {
                    container = document.createElement('div');
                    container.id = 'rovalra-fx-container';
                    container.dataset.category = currentHash;

                    const filterConfig = [
                        { id: 'rovalra-creator-name', type: 'text', label: 'Creator Name' },
                        { id: 'rovalra-min-price-value', type: 'number', label: 'Min Price', min: 0 },
                        { id: 'rovalra-max-price-value', type: 'number', label: 'Max Price', min: 0 },
                        { id: 'rovalra-availability-filter', type: 'dropdown', label: 'Availability', initialValue: 'all', options: [{value:'all',label:'Show All'},{value:'onsale',label:'Onsale Only'},{value:'offsale',label:'Offsale Only'}] },
                        { id: 'rovalra-filter-itemsWithEffects', type: 'toggle', label: 'Effects' },
                        { id: 'rovalra-filter-limited', type: 'toggle', label: 'Limiteds' }
                    ];

                    container.appendChild(createAvatarFilterUI({
                        avatarFiltersEnabled: showFilters, 
                        searchbarEnabled: showSearch,
                        onApply: applyAllFilters,
                        onSearch: () => triggerDomUpdate(),
                        filterConfig: showFilters ? filterConfig : []
                    }));
                    
                    activeTab.prepend(container);
                }

                if (showFilters || showSearch) {
                    updateToggleButtonText();
                    const listSelector = 'ul.item-cards-stackable';
                    const existingList = activeTab.querySelector(listSelector);
                    if (existingList) {
                        attachObserverToList(existingList);
                    } else {
                        const listObs = observeElement(listSelector, (list) => attachObserverToList(list), { scope: activeTab, once: true });
                        if (listObs) activeObservers.push(listObs);
                    }
                }
            }

            function attachObserverToList(listElement) {
                if (listElement.dataset.rovalraObserved === 'true') return;
                listElement.dataset.rovalraObserved = 'true';

                const active = isFilteringActive();
                if (active) listElement.classList.add('rovalra-filtering-enabled');

                const itemObs = observeElement('li.list-item', (card) => {
                    const thumb = card.querySelector('.item-card-thumb');
                    const img = card.querySelector('.item-card-thumb img'); 
                    const id = thumb ? parseInt(thumb.getAttribute('data-thumbnail-target-id'), 10) : null;
                    
                    if (!id) return;

                    const nameContainer = card.querySelector('.item-card-thumb-container') || card.querySelector('.item-card-name');
                    const nameText = nameContainer ? (nameContainer.dataset.itemName || nameContainer.getAttribute('data-item-name') || nameContainer.textContent || '') : '';
                    
                    domMetadata.set(card, {
                        id: id,
                        searchName: nameText.toLowerCase(),
                        img: img 
                    });

                    const entry = itemDataCache.get(id);
                    
                    if (!entry) {
                        if (!scanQueue.has(id)) {
                            scanQueue.add(id);
                            if (!scanQueueTimer) {
                                scanQueueTimer = setTimeout(() => {
                                    const idsToProcess = Array.from(scanQueue);
                                    scanQueue.clear();
                                    scanQueueTimer = null;
                                    processItemIds(idsToProcess, scanSessionId);
                                }, 100);
                            }
                        }
                    }

                    if (isFilteringActive()) {
                        const searchInput = document.getElementById('rovalra-fx-search-bar');
                        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
                        const meta = domMetadata.get(card);
                        const shouldShow = determineVisibility(meta, entry, searchTerm);
                        
                        if (shouldShow) {
                            card.classList.add('rovalra-show');
                            card.classList.remove('rovalra-fx-hidden');
                        } else {
                            card.classList.remove('rovalra-show');
                            if (img) {
                                const currentSrc = img.src;
                                if (currentSrc && !currentSrc.startsWith('data:')) {
                                    img.dataset.rovalraSrc = currentSrc;
                                    img.src = TRANSPARENT_PIXEL;
                                }
                            }
                        }
                    } else {
                        card.classList.add('rovalra-show');
                    }

                }, { multiple: true, scope: listElement });

                if (itemObs) activeObservers.push(itemObs);
            }

            function addLoadingSpinner() {
                let spinner = document.getElementById('rovalra-filter-loading');
                if (!spinner) {
                    spinner = document.createElement('div');
                    spinner.id = 'rovalra-filter-loading';
                    spinner.textContent = 'Filtering...';
                    spinner.style.cssText = 'position:absolute; top: 60px; right: 20px; background: rgba(0,0,0,0.8); color: white; padding: 5px 10px; border-radius: 4px; z-index: 2000; font-size: 12px; pointer-events: none;';
                    document.querySelector('.tab-pane.active')?.prepend(spinner);
                } else {
                    spinner.style.display = 'block';
                }
            }

            function injectStyles() {
                if (document.getElementById('rovalra-fx-styles')) return;
                const style = document.createElement('style');
                style.id = 'rovalra-fx-styles';
                style.textContent = `
                    .rovalra-fx-hidden { display: none !important; }
                    .rovalra-filtering-enabled .list-item { display: none; }
                    .rovalra-filtering-enabled .list-item.rovalra-show { display: inline-block !important; vertical-align: top; }
                    #rovalra-fx-container { position: relative; margin-bottom: 33px; z-index: 1; }
                    #rovalra-fx-dropdown { position: absolute; top: 100%; left: 0; right: 0; background-color: var(--bg-content, rgb(25, 26, 31)); border: 1px solid var(--divider-color, #393b3d); border-radius: 8px; padding: 6px; z-index: 100 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: none; }
                    #rovalra-fx-dropdown[data-state="open"] { display: block; }
                    #rovalra-fx-toggle-btn.filter-button-active { background-color: ${document.documentElement.style.getPropertyValue('--filter-button-active-background')} !important; color: ${document.documentElement.style.getPropertyValue('--filter-button-active-text')} !important; }
                    .rovalra-fx-filter-row { display: flex; flex-direction: row; align-items: center; gap: 8px; margin-top: 12px; justify-content: space-between; }
                    .rovalra-fx-filter-row label { color: ${document.documentElement.style.getPropertyValue('--filter-input-label-color')}; margin-right: auto; font-size: 1rem; white-space: nowrap; }
                    .tab-horizontal-submenu { z-index: 2;}
                    `;
                document.head.appendChild(style);
            }

            function cleanupFeature() { document.getElementById('rovalra-fx-container')?.remove(); }

            function initBreadcrumbMonitor() {
                const bcObs = observeElement('.breadcrumb-container', (breadcrumb) => {
                    let previousText = breadcrumb.textContent;
                    const observer = new MutationObserver(() => {
                        const newText = breadcrumb.textContent;
                        if (newText !== previousText) {
                            previousText = newText;
                            fullStateReset();
                            setTimeout(ensureUIInActiveTab, 100);
                        }
                    });
                    observer.observe(breadcrumb, { childList: true, subtree: true, characterData: true });
                    activeObservers.push(observer);
                });
                if (bcObs) activeObservers.push(bcObs);
            }

            function initObserver() {
                injectStyles();
                window.addEventListener('hashchange', () => {
                    fullStateReset(); 
                    setTimeout(ensureUIInActiveTab, 100);
                });

                initBreadcrumbMonitor();

                const tabContent = document.querySelector('.tab-content.rbx-tab-content');
                if (tabContent) {
                    const observer = new MutationObserver((mutations) => {
                        for (const mutation of mutations) {
                            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                                const target = mutation.target;
                                if (target.classList.contains('active') && target.classList.contains('tab-pane')) {
                                    ensureUIInActiveTab();
                                }
                            }
                        }
                    });
                    observer.observe(tabContent, { attributes: true, subtree: true, attributeFilter: ['class'] });
                    ensureUIInActiveTab();
                } else {
                    setTimeout(initObserver, 500);
                }
            }

            observeElement('#horizontal-tabs', initObserver, { onRemove: cleanupFeature });

        })();
    }
});

export function init() {}