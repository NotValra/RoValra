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

                loadAndRenderHeatmap(placeId, contentPane);
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