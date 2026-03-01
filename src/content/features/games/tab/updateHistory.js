import { observeElement } from '../../../core/observer.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { createHeatmap } from '../../../core/ui/heatmap.js';
import { createTab } from '../../../core/ui/games/tab.js';

export function init() {
    chrome.storage.local.get({ updateHistoryEnabled: false }, (settings) => {
        if (!settings.updateHistoryEnabled) return;

        observeElement('#horizontal-tabs', (tabContainer) => {
            if (tabContainer.dataset.rovalraUpdatesTabInitialized === 'true') return;
            tabContainer.dataset.rovalraUpdatesTabInitialized = 'true';

            const contentSection = document.querySelector('.tab-content.rbx-tab-content');
            if (!contentSection) return;

            const placeId = getPlaceIdFromUrl();
            if (placeId) {
                document.getElementById('tab-updates')?.remove();
                document.getElementById('updates-content-pane')?.remove();

                const { contentPane } = createTab({
                    id: 'updates',
                    label: 'Updates',
                    container: tabContainer,
                    contentContainer: contentSection,
                    hash: '#!/updates'
                });

                let isLoaded = false;

                const checkUrl = () => {
                    if (window.location.hash.includes('#!/updates')) {
                        if (!isLoaded) {
                            isLoaded = true;
                            loadAndRenderHeatmap(placeId, contentPane);
                        }
                    }
                };

                window.addEventListener('hashchange', checkUrl);
                checkUrl();
            }
        }, {
            onRemove: () => {
                const oldContainer = document.querySelector('[data-rovalra-updates-tab-initialized]');
                if (oldContainer) oldContainer.dataset.rovalraUpdatesTabInitialized = 'false';
            }
        });
    });
}

async function loadAndRenderHeatmap(placeId, parentElement) {
    const metaData = document.getElementById('game-detail-meta-data');
    const universeId = metaData?.dataset.universeId;

    if (universeId) {
        try {
            const maturityData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/discovery-api/omni-recommendation-metadata',
                method: 'POST',
                body: {
                    contents: [{ contentId: parseInt(universeId, 10), contentType: 'Game' }],
                    sessionId: self.crypto.randomUUID()
                }
            });

            const gameMeta = maturityData?.contentMetadata?.Game?.[universeId];
            if (gameMeta && gameMeta.contentMaturity === 'restricted') {
                const msg = document.createElement('div');
                msg.className = 'text-secondary';
                msg.style.padding = '20px';
                msg.style.textAlign = 'center';
                msg.style.fontSize = '20px';
                msg.textContent = "Update History doesn't work on 18+ experiences";
                parentElement.appendChild(msg);
                return;
            }
        } catch (e) {
            console.warn('RoValra: Failed to check content maturity', e);
        }
    }

    try {
        const placeDetails = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            method: 'GET'
        });

        if (placeDetails && placeDetails[0] && placeDetails[0].price > 0) {
            const msg = document.createElement('div');
            msg.className = 'text-secondary';
            msg.style.padding = '20px';
            msg.style.textAlign = 'center';
            msg.style.fontSize = '20px';
            msg.textContent = "Update History doesn't work on paid access experiences";
            parentElement.appendChild(msg);
            return;
        }
    } catch (e) {
        console.warn('RoValra: Failed to check paid access status', e);
    }

    try {
        const data = await callRobloxApiJson({
            isRovalraApi: true,
            endpoint: `/v1/games/history?place_id=${placeId}`,
            method: 'GET'
        });
        
        const historyData = (data && data.history) ? data.history : [];
        const heatmapElement = createHeatmap(historyData, 'Update History');
        parentElement.appendChild(heatmapElement);
        
    } catch (error) {
        console.error('RoValra: Failed to load heatmap data', error);
        const heatmapElement = createHeatmap([], 'Update History'); 
        parentElement.appendChild(heatmapElement);
    }
}