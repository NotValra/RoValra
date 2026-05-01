import { observeElement, observeAttributes } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { createButton } from '../../core/ui/buttons.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { enhanceServer } from '../../core/games/servers/serverdetails.js';
import { loadDatacenterMap, serverIpMap } from '../../core/regions.js';
import { t, ts } from '../../core/locale/i18n.js';
import DOMPurify from 'dompurify';
import { addTooltip } from '../../core/ui/tooltip.js';

const privateServerContext = {
    serverLocations: {},
    serverUptimes: {},
    serverPerformanceCache: {},
    vipStatusCache: {},
    uptimeBatch: new Set(),
    serverIpMap: {},
    processUptimeBatch: async () => {},
};

const vipServerDetailsCache = new Map();

export async function getVipServerDetails(vipServerId) {
    if (vipServerDetailsCache.has(vipServerId))
        return vipServerDetailsCache.get(vipServerId);
    try {
        const res = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${vipServerId}`,
        });
        const data = res.ok ? await res.json() : null;
        vipServerDetailsCache.set(vipServerId, data);
        return data;
    } catch {
        vipServerDetailsCache.set(vipServerId, null);
        return null;
    }
}

export async function init() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    try {
        await loadDatacenterMap();
        privateServerContext.serverIpMap = serverIpMap;
    } catch (e) {}

    initRobloxPlusPrivateServerPrice();

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

            observeElement(
                '.flex.items-center.justify-between.padding-y-medium.width-full',
                (el) => {
                    const section = el.closest(
                        '[data-rovalra-section-type="private"]',
                    );
                    if (!section || el.dataset.rovalraPrivateEnhanced) return;
                    el.dataset.rovalraPrivateEnhanced = 'true';

                    const check = () => {
                        const isOwner =
                            el.getAttribute('data-rovalra-is-owner') === 'true';
                        const privateServerId = el.getAttribute(
                            'data-private-server-id',
                        );
                        if (privateServerId) {
                            if (isOwner && enableControls) {
                                const btnContainer =
                                    el.querySelector(
                                        '.flex.items-center.gap-small.grow-0.shrink-0.basis-auto',
                                    ) ||
                                    el.querySelector(
                                        '.flex.flex-col.items-center.gap-xsmall.grow-0.shrink-0.basis-auto',
                                    );
                                if (btnContainer)
                                    addModernPrivateServerControls(
                                        el,
                                        btnContainer,
                                        getPlaceIdFromUrl(),
                                    );
                            }
                            return true;
                        }
                        return false;
                    };

                    if (!check()) {
                        const observer = observeAttributes(el, () => {
                            if (check()) observer.disconnect();
                        }, ['data-rovalra-is-owner', 'data-private-server-id']);
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
        copyLinkBtn.style.opacity = copyLinkBtn.disabled ? '0.5' : '1';
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
                copyLinkBtn.style.opacity = copyLinkBtn.disabled ? '0.5' : '1';
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
                copyLinkBtn.style.opacity = '1';
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

export async function addModernPrivateServerControls(
    el,
    btnContainer,
    placeId,
) {
    const privateServerId = el.getAttribute('data-private-server-id');
    if (!privateServerId) return;

    const isOwner = el.getAttribute('data-rovalra-is-owner') === 'true';
    if (!isOwner) return;

    const details = await getVipServerDetails(privateServerId);
    if (!details || details.subscription?.expired) return;

    btnContainer.className =
        'flex flex-col items-center gap-xsmall grow-0 shrink-0 basis-auto';

    const nativeJoinBtn = btnContainer.querySelector('button');
    if (nativeJoinBtn) {
        nativeJoinBtn.setAttribute('data-rovalra-join-button', 'true');
    }

    const configureBtn = btnContainer.querySelector(
        'a.foundation-web-icon-button[aria-label="Configure"]',
    );
    const nativeJoinBtnWrapper = nativeJoinBtn
        ? nativeJoinBtn.closest('div')
        : null;

    if (configureBtn && nativeJoinBtnWrapper) {
        const configureJoinRow = document.createElement('div');
        configureJoinRow.className = 'flex flex-row items-center gap-xsmall';
        configureJoinRow.style.cssText =
            'width: 200px; min-width: 200px; max-width: 200px;';

        configureBtn.remove();
        nativeJoinBtnWrapper.remove();

        nativeJoinBtnWrapper.style.cssText =
            'width: 163px !important; min-width: 163px !important; max-width: 163px !important;';

        nativeJoinBtn.style.cssText =
            'width: 100% !important; min-width: 100% !important;';

        configureJoinRow.appendChild(configureBtn);
        configureJoinRow.appendChild(nativeJoinBtnWrapper);
        btnContainer.prepend(configureJoinRow);
    }

    const buttonsRow = document.createElement('div');
    buttonsRow.className = 'flex flex-row';
    buttonsRow.style.cssText =
        'width: 200px; min-width: 200px; max-width: 200px; gap: 5px;';
    const shareBtnWrapper = document.createElement('div');
    shareBtnWrapper.className = 'rovalra-share-btn-container';
    shareBtnWrapper.style.cssText =
        'width: 95px; min-width: 95px; max-width: 95px;';
    shareBtnWrapper.innerHTML = DOMPurify.sanitize(`
        <button type="button" ${!details.link ? 'disabled' : ''} style="opacity: ${!details.link ? '0.5' : '1'}" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-small height-800 padding-x-small bg-action-standard content-action-standard width-full rovalra-share-btn">
            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
            <span class="flex items-center min-width-0 gap-xsmall">
                <span class="padding-y-xsmall text-truncate-end text-no-wrap">${ts('quickPlay.copyLink', { defaultValue: 'Copy Link' })}</span>
            </span>
        </button>
    `);

    const shareBtn = shareBtnWrapper.querySelector('button');
    shareBtn.onclick = async (e) => {
        e.stopPropagation();
        const currentDetails = await getVipServerDetails(privateServerId);
        if (currentDetails?.link) {
            navigator.clipboard
                .writeText(currentDetails.link)
                .then(async () => {
                    const span = shareBtn.querySelector('.text-no-wrap');
                    const originalText = span.textContent;
                    span.textContent = await t('serverList.copied', {
                        defaultValue: 'Copied!',
                    });
                    setTimeout(() => {
                        span.textContent = originalText;
                    }, 1000);
                });
        }
    };

    const generateLinkWrapper = document.createElement('div');
    generateLinkWrapper.className = 'rovalra-generate-link-container';
    generateLinkWrapper.style.cssText =
        'width: 100px; min-width: 100px; max-width: 100px;';
    generateLinkWrapper.innerHTML = DOMPurify.sanitize(`
        <button type="button" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-small height-800 padding-x-small bg-action-standard content-action-standard width-full rovalra-generate-link-btn">
            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
            <span class="flex items-center min-width-0 gap-xsmall">
                <span class="padding-y-xsmall text-truncate-end text-no-wrap">${ts('privateServerPage.regenerateLink', { defaultValue: 'Regenerate Link' })}</span>
            </span>
        </button>
    `);

    const generateLinkBtn = generateLinkWrapper.querySelector('button');
    generateLinkBtn.onclick = async (e) => {
        e.stopPropagation();
        const span = generateLinkBtn.querySelector('.text-no-wrap');
        const originalText = span.textContent;
        generateLinkBtn.disabled = true;

        try {
            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${privateServerId}`,
                method: 'PATCH',
                body: { newJoinCode: true },
            });

            if (response.ok) {
                vipServerDetailsCache.delete(privateServerId);
                const newDetails = await getVipServerDetails(privateServerId);
                if (newDetails?.accessCode) {
                    el.setAttribute('data-access-code', newDetails.accessCode);
                }

                const currentShareBtn =
                    btnContainer.querySelector('.rovalra-share-btn');
                if (currentShareBtn) {
                    currentShareBtn.disabled = !newDetails?.link;
                    currentShareBtn.style.opacity = currentShareBtn.disabled
                        ? '0.5'
                        : '1';
                }

                span.textContent = await t('privateServerPage.regenerated', {
                    defaultValue: 'Regenerated!',
                });
            } else {
                span.textContent = await t('quickPlay.error');
            }
        } catch (error) {
            console.error('Error regenerating private server link:', error);
            span.textContent = await t('quickPlay.error');
        }

        setTimeout(() => {
            span.textContent = originalText;
            generateLinkBtn.disabled = false;
        }, 1000);
    };

    buttonsRow.appendChild(generateLinkWrapper);
    buttonsRow.appendChild(shareBtnWrapper);
    btnContainer.appendChild(buttonsRow);
}

async function initRobloxPlusPrivateServerPrice() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    try {
        const membershipStatus = await callRobloxApiJson({
            subdomain: 'premiumfeatures',
            endpoint: `/v1/users/${userId}/validate-membership`,
        });

        if (String(membershipStatus) !== 'true') return;
    } catch (e) {
        return;
    }

    observeElement('.create-server-banner-text', async (bannerTextEl) => {
        if (bannerTextEl.dataset.rovalraPlusEnhanced) return;
        bannerTextEl.dataset.rovalraPlusEnhanced = 'true';

        const placeId = getPlaceIdFromUrl();
        if (!placeId) return;

        try {
            const placeDetails = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            });
            const universeId = placeDetails?.[0]?.universeId;
            if (!universeId) return;

            const cloudData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/cloud/v2/universes/${universeId}`,
                useApiKey: true,
                useBackground: true,
            });
            const originalPrice = cloudData?.privateServerPriceRobux;
            if (originalPrice === undefined) return;

            const priceSpan = bannerTextEl.querySelector('.private-server-price');
            if (priceSpan) {
                const infoIcon = document.createElement('span');
                infoIcon.className = 'icon-moreinfo';
                infoIcon.style.marginLeft = '4px';
                infoIcon.style.cursor = 'help';
                infoIcon.style.display = 'inline-block';
                infoIcon.style.verticalAlign = 'middle';
                infoIcon.style.width = '16px';
                infoIcon.style.height = '16px';
                infoIcon.style.background = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\'/%3E%3Cline x1=\'12\' y1=\'16\' x2=\'12\' y2=\'12\'/%3E%3Cline x1=\'12\' y1=\'8\' x2=\'12.01\' y2=\'8\'/%3E%3C/svg%3E") no-repeat center';
                infoIcon.style.backgroundSize = 'contain';
                
                const theme = document.body.classList.contains('dark-theme') ? 'filter: invert(1);' : '';
                infoIcon.style.cssText += theme;

                const tooltipText = `Original Price: <b>${originalPrice} Robux</b><br>Currently shows as <b>Free</b> due to Roblox Plus.`;
                addTooltip(infoIcon, tooltipText, { position: 'top' });

                priceSpan.appendChild(infoIcon);
            }
        } catch (e) {
            console.warn('RoValra: Failed to fetch original price for Roblox Plus tooltip', e);
        }
    });
}
