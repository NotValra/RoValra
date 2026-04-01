import { observeElement, observeAttributes } from '../../core/observer.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { createButton } from '../../core/ui/buttons.js';
import { callRobloxApi } from '../../core/api.js';
import { enhanceServer } from '../../core/games/servers/serverdetails.js';
import { loadDatacenterMap, serverIpMap } from '../../core/regions.js';
import { t } from '../../core/locale/i18n.js';

const privateServerContext = {
    serverLocations: {},
    serverUptimes: {},
    serverPerformanceCache: {},
    vipStatusCache: {},
    uptimeBatch: new Set(),
    serverIpMap: {},
    processUptimeBatch: async () => {},
};

export async function init() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    try {
        await loadDatacenterMap();
        privateServerContext.serverIpMap = serverIpMap;
    } catch (e) {}

    chrome.storage.local.get(
        { PrivateQuickLinkCopy: true, ServerlistmodificationsEnabled: true },
        (settings) => {
            const enableControls = settings.PrivateQuickLinkCopy;
            const enableDetails = settings.ServerlistmodificationsEnabled;

            observeElement(
                '.rbx-private-game-server-item',
                (serverItem) => {
                    if (serverItem.dataset.rovalraPrivateEnhanced) return;
                    serverItem.dataset.rovalraPrivateEnhanced = 'true';
                    const detailsDiv = serverItem.querySelector(
                        '.rbx-private-game-server-details',
                    );

                    const ownerLink = serverItem.querySelector(
                        '.rbx-private-owner .avatar-card-fullbody',
                    );
                    if (!ownerLink) return;

                    if (enableDetails) {
                        enhanceServer(serverItem, privateServerContext);
                    }

                    const href = ownerLink.getAttribute('href');
                    if (!href) return;

                    const match = href.match(/users\/(\d+)\/profile/);
                    if (!match) return;

                    const ownerId = parseInt(match[1], 10);

                    if (ownerId === userId && enableControls) {
                        if (serverItem.dataset.privateServerId) {
                            addOwnerControls(
                                serverItem,
                                serverItem.dataset.privateServerId,
                            );
                        } else {
                            const observer =
                                observeAttributes(serverItem, () => {
                                    if (serverItem.dataset.privateServerId) {
                                        observer.disconnect();
                                        addOwnerControls(
                                            serverItem,
                                            serverItem.dataset.privateServerId,
                                        );
                                    }
                                }, ['data-private-server-id']);
                        }
                    }
                },
                { multiple: true },
            );
        },
    );
}

async function addOwnerControls(serverItem, privateServerId) {
    const detailsDiv = serverItem.querySelector(
        '.rbx-private-game-server-details',
    );
    if (
        !detailsDiv ||
        detailsDiv.querySelector('.rovalra-private-server-controls')
    )
        return;

    if (
        serverItem.querySelector('.rbx-private-game-server-copy-link') ||
        serverItem.querySelector('.rbx-private-game-server-regenerate-link')
    )
        return;

    let initialData = null;
    try {
        const res = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${privateServerId}`,
            method: 'GET',
        });
        if (res.ok) {
            initialData = await res.json();
        }
    } catch (e) {
        console.warn(e);
    }

    if (initialData?.subscription?.expired) return;

    const container = document.createElement('div');
    container.className = 'rovalra-private-server-controls';
    container.style.marginTop = '5px';
    container.style.display = 'flex';
    container.style.gap = '5px';

    const copyLinkBtn = createButton(
        await t('quickPlay.copyLink'),
        'secondary',
    );
    copyLinkBtn.classList.add('btn-control-xs');
    copyLinkBtn.style.flex = '1';
    copyLinkBtn.style.fontSize = '11px';
    copyLinkBtn.style.minWidth = '0';

    const generateLinkBtn = createButton(
        await t('privateServerPage.regenerateLink'),
        'secondary',
    );
    generateLinkBtn.classList.add('btn-control-xs');
    generateLinkBtn.style.flex = '1';
    generateLinkBtn.style.fontSize = '11px';
    generateLinkBtn.style.minWidth = '0';

    container.appendChild(copyLinkBtn);
    container.appendChild(generateLinkBtn);

    const joinBtnSpan = detailsDiv.querySelector('span[data-placeid]');
    if (joinBtnSpan) {
        joinBtnSpan.after(container);
    } else {
        detailsDiv.appendChild(container);
    }

    if (initialData) {
        copyLinkBtn.disabled = !initialData.link;
        if (initialData.active === false) {
            generateLinkBtn.disabled = true;
        }
    }

    const checkLink = async () => {
        try {
            const res = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${privateServerId}`,
                method: 'GET',
            });
            if (res.ok) {
                const data = await res.json();
                copyLinkBtn.disabled = !data.link;
                if (data.active === false) {
                    generateLinkBtn.disabled = true;
                }
                return data.link;
            }
        } catch (e) {
            console.warn(e);
        }
        return null;
    };

    copyLinkBtn.onclick = async () => {
        if (copyLinkBtn.disabled) return;
        const originalText = copyLinkBtn.textContent;

        const link = await checkLink();
        if (link) {
            navigator.clipboard.writeText(link);
            copyLinkBtn.textContent = await t('quickPlay.copied');
        } else {
            copyLinkBtn.textContent = await t('quickPlay.error');
        }
        setTimeout(() => (copyLinkBtn.textContent = originalText), 1500);
    };

    generateLinkBtn.onclick = async () => {
        const originalText = generateLinkBtn.textContent;
        generateLinkBtn.disabled = true;

        try {
            const res = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${privateServerId}`,
                method: 'PATCH',
                body: { newJoinCode: true },
            });

            if (res.ok) {
                generateLinkBtn.textContent = await t(
                    'privateServerPage.regenerated',
                );
                copyLinkBtn.disabled = false;
            } else {
                generateLinkBtn.textContent = await t('quickPlay.error');
            }
        } catch (e) {
            generateLinkBtn.textContent = await t('quickPlay.error');
        }

        setTimeout(() => {
            generateLinkBtn.textContent = originalText;
            generateLinkBtn.disabled = false;
        }, 1500);
    };
}
