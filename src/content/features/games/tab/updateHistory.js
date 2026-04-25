import { observeElement } from '../../../core/observer.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { createHeatmap } from '../../../core/ui/heatmap.js';
import { createTab } from '../../../core/ui/games/tab.js';
import { t, ts } from '../../../core/locale/i18n.js';
import { getCloudPlatformSupport } from '../../../core/apis/games.js';

export function init() {
    chrome.storage.local.get({ updateHistoryEnabled: false }, (settings) => {
        if (!settings.updateHistoryEnabled) return;

        observeElement(
            '#horizontal-tabs',
            (tabContainer) => {
                if (
                    tabContainer.dataset.rovalraUpdatesTabInitialized === 'true'
                )
                    return;
                tabContainer.dataset.rovalraUpdatesTabInitialized = 'true';

                const contentSection = document.querySelector(
                    '.tab-content.rbx-tab-content',
                );
                if (!contentSection) return;

                const placeId = getPlaceIdFromUrl();
                if (placeId) {
                    document.getElementById('tab-updates')?.remove();
                    document.getElementById('updates-content-pane')?.remove();

                    const { contentPane } = createTab({
                        id: 'updates',
                        label: ts('updateHistory.tabTitle'),
                        container: tabContainer,
                        contentContainer: contentSection,
                        hash: '#!/updates',
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
            },
            {
                onRemove: () => {
                    const oldContainer = document.querySelector(
                        '[data-rovalra-updates-tab-initialized]',
                    );
                    if (oldContainer)
                        oldContainer.dataset.rovalraUpdatesTabInitialized =
                            'false';
                },
            },
        );
    });
}

async function loadAndRenderHeatmap(placeId, parentElement) {
    const container = document.createElement('div');
    container.style.position = 'relative';
    parentElement.appendChild(container);

    const titleText = await t('updateHistory.title');
    const heatmapElement = createHeatmap([], titleText);
    container.appendChild(heatmapElement);

    const metaData = document.getElementById('game-detail-meta-data');
    const universeId = metaData?.dataset.universeId;

    const checkBlocking = async (hasHistoryData) => {
        let blockingMessage = null;

        if (universeId) {
            try {
                const maturityData = await callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: '/discovery-api/omni-recommendation-metadata',
                    method: 'POST',
                    body: {
                        contents: [
                            {
                                contentId: parseInt(universeId, 10),
                                contentType: 'Game',
                            },
                        ],
                        sessionId: self.crypto.randomUUID(),
                    },
                });

                const gameMeta =
                    maturityData?.contentMetadata?.Game?.[universeId];
                if (gameMeta && gameMeta.contentMaturity === 'restricted') {
                    blockingMessage = await t(
                        'updateHistory.blocked.eighteenPlus',
                    );
                }
            } catch (e) {
                console.warn('RoValra: Failed to check content maturity', e);
            }
        }

        if (!blockingMessage) {
            try {
                const placeDetails = await callRobloxApiJson({
                    subdomain: 'games',
                    endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
                    method: 'GET',
                });

                if (
                    placeDetails &&
                    placeDetails[0] &&
                    (placeDetails[0].price > 0 ||
                        placeDetails[0].reasonProhibited == 'PurchaseRequired')
                ) {
                    blockingMessage = await t(
                        'updateHistory.blocked.paidAccess',
                    );
                }
            } catch (e) {
                console.warn('RoValra: Failed to check paid access status', e);
            }
        }

        if (!blockingMessage) {
            try {
                const joinData = await callRobloxApiJson({
                    subdomain: 'gamejoin',
                    endpoint: '/v1/join-game',
                    method: 'POST',
                    body: {
                        placeId: parseInt(placeId, 10),
                        gameJoinAttemptId: self.crypto.randomUUID(),
                    },
                });

                if (joinData && joinData.status === 12) {
                    blockingMessage = await t('updateHistory.blocked.subplace');
                }
            } catch (e) {
                console.warn(
                    'RoValra: Failed to check subplace joinability',
                    e,
                );
            }
        }

        if (!blockingMessage && universeId) {
            try {
                const platformSupport =
                    await getCloudPlatformSupport(universeId);
                if (platformSupport && !platformSupport.desktop) {
                    blockingMessage = await t(
                        'updateHistory.blocked.noDesktopSupport',
                    );
                }
            } catch (e) {
                console.warn(
                    'RoValra: Failed to check desktop platform support',
                    e,
                );
            }
        }

        if (blockingMessage) {
            heatmapElement.style.filter = 'blur(5px)';
            heatmapElement.style.opacity = '0.5';
            heatmapElement.style.pointerEvents = 'none';

            const msgContainer = document.createElement('div');
            msgContainer.style.position = 'absolute';
            msgContainer.style.top = '0';
            msgContainer.style.left = '0';
            msgContainer.style.width = '100%';
            msgContainer.style.height = '100%';
            msgContainer.style.display = 'flex';
            msgContainer.style.alignItems = 'center';
            msgContainer.style.justifyContent = 'center';
            msgContainer.style.zIndex = '10';

            const msg = document.createElement('div');
            msg.className = 'text-secondary';
            msg.style.fontSize = '20px';
            msg.style.fontWeight = '500';
            msg.style.textAlign = 'center';
            msg.textContent = blockingMessage;

            msgContainer.appendChild(msg);
            container.appendChild(msgContainer);
            return true;
        }
        return false;
    };

    try {
        const data = await callRobloxApiJson({
            isRovalraApi: true,
            endpoint: `/v1/games/history?place_id=${placeId}`,
            method: 'GET',
        });
        const historyData = data?.history || [];

        if (historyData.length > 0) {
            if (heatmapElement._updateData) {
                heatmapElement._updateData(historyData);
            }
        } else {
            const isBlocked = await checkBlocking(false);
            if (!isBlocked && heatmapElement._updateData) {
                heatmapElement._updateData(historyData);
            }
        }
    } catch (error) {
        console.error('RoValra: Failed to load heatmap data', error);
    }
}
