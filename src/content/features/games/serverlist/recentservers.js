import { observeElement } from '../../../core/observer.js';
import DOMPurify from 'dompurify';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import {
    enhanceServer,
    createUUID,
} from '../../../core/games/servers/serverdetails.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { _state as serverListState, processUptimeBatch } from './serverlist.js';
import { launchGame } from '../../../core/utils/launcher.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { fetchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { t, ts } from '../../../core/locale/i18n.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';

let isRenderingRecentServers = false;

function formatTimeAgo(timestamp) {
    const now = Date.now();
    const secondsPast = Math.floor((now - timestamp) / 1000);

    if (secondsPast < 60) {
        return ts('recentServers.secondsAgo', { count: secondsPast });
    }
    if (secondsPast < 3600) {
        return ts('recentServers.minutesAgo', {
            count: Math.floor(secondsPast / 60),
        });
    }
    if (secondsPast <= 86400) {
        return ts('recentServers.hoursAgo', {
            count: Math.floor(secondsPast / 3600),
        });
    }
    const days = Math.floor(secondsPast / 86400);
    return ts('recentServers.daysAgo', { count: days });
}

function createServerItem(serverData, userThumbnailUrl, userId) {
    const { presence, timestamp } = serverData;
    const serverItem = document.createElement('li');
    serverItem.className = 'rbx-game-server-item';
    serverItem.dataset.rovalraServerid = presence.gameId;
    serverItem.dataset.placeid = presence.rootPlaceId;

    const lastJoinedInfo = timestamp
        ? `<p class="text-info" style="font-size: 12px; margin-top: 4px;">${ts('recentServers.lastJoined', { time: formatTimeAgo(timestamp) })}</p>`
        : '';

    let avatarHtml = `<a class="avatar-card-link" style="display: none;"></a>`;
    if (userThumbnailUrl && userId) {
        avatarHtml = `
            <a class="avatar-card-link" href="https://www.roblox.com/users/${userId}/profile">
                <span class="avatar avatar-headshot-md player-avatar">
                    <span class="thumbnail-2d-container avatar-card-image" style="width: 60px; height: 60px;">
                        <img src="${userThumbnailUrl}" alt="${ts('recentServers.meAlt')}" style="width: 60px; height: 60px; border-radius: 50%;">
                    </span>
                </span>
            </a>`;
    }

    const serverContent = `
        <div class="card-content" style="display: flex; flex-direction: column;">
            <div class="player-thumbnails-container" style="align-self: center; margin-bottom: 20px;">
                ${avatarHtml}
            </div>
            <div class="rbx-game-server-details">
                ${lastJoinedInfo}
            </div>
        </div>
    `;
    serverItem.innerHTML = DOMPurify.sanitize(serverContent);

    const detailsDiv = serverItem.querySelector('.rbx-game-server-details');
    if (detailsDiv) {
        const joinBtn = document.createElement('button');
        joinBtn.className =
            'btn-full-width btn-control-xs rbx-public-game-server-join game-server-join-btn btn-primary-md btn-min-width';
        joinBtn.textContent = ts('serverList.join');
        joinBtn.onclick = () =>
            launchGame(presence.rootPlaceId, presence.gameId);
        detailsDiv.appendChild(joinBtn);
    }

    return serverItem;
}

function createModernServerItem(serverData, userThumbnailUrl, userId) {
    const { presence, timestamp } = serverData;
    const serverItem = document.createElement('div');
    serverItem.className =
        'flex items-center justify-between padding-y-medium width-full';
    serverItem.dataset.rovalraServerid = presence.gameId;
    serverItem.dataset.placeid = presence.rootPlaceId;

    const timeText = timestamp ? formatTimeAgo(timestamp) : '';
    const subtitle = ts('recentServers.lastJoined', { time: timeText });

    const avatarHtml = `
        <div class="grow-0 shrink-0 basis-auto relative height-[40px] width-[40px]">
            <div class="width-[40px] height-[40px]">
                <span class="thumbnail-2d-container radius-circle clip">
                    <img class="size-full" src="${userThumbnailUrl || ''}" alt="${ts('recentServers.meAlt')}">
                </span>
            </div>
        </div>
    `;

    const innerHtml = `
        <div class="flex items-center gap-medium min-width-0">
            ${avatarHtml}
            <div class="flex flex-col min-width-0">
                <span class="text-body-large content-emphasis text-truncate-end">${ts('recentServers.meAlt')}</span>
                <span class="text-body-medium content-muted">${subtitle}</span>
            </div>
        </div>
        <div class="flex flex-col items-center gap-xsmall grow-0 shrink-0 basis-auto">
            <div class="width-[63px] large:width-[200px]">
                <button type="button" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-small height-800 padding-x-small bg-action-standard content-action-standard width-full rovalra-join-btn">
                    <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                    <span class="flex items-center min-width-0 gap-xsmall">
                        <span class="padding-y-xsmall text-truncate-end text-no-wrap">${ts('serverList.join')}</span>
                    </span>
                </button>
            </div>
            <div class="width-[63px] large:width-[200px] rovalra-share-btn-container">
                <button type="button" class="foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-small height-800 padding-x-small bg-action-standard content-action-standard width-full rovalra-share-btn">
                    <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
                    <span class="flex items-center min-width-0 gap-xsmall">
                        <span class="padding-y-xsmall text-truncate-end text-no-wrap">${ts('serverList.share', { defaultValue: 'Share' })}</span>
                    </span>
                </button>
            </div>
        </div>
    `;

    serverItem.innerHTML = DOMPurify.sanitize(innerHtml);
    const joinBtn = serverItem.querySelector('.rovalra-join-btn');
    if (joinBtn) {
        joinBtn.onclick = () =>
            launchGame(presence.rootPlaceId, presence.gameId);
    }

    const shareBtn = serverItem.querySelector('.rovalra-share-btn');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const joinLink = `https://www.roblox.com/games/start?placeId=${presence.rootPlaceId}&gameInstanceId=${presence.gameId}`;
            navigator.clipboard.writeText(joinLink).then(() => {
                const span = shareBtn.querySelector('.text-no-wrap');
                const originalText = span.textContent;
                span.textContent = ts('serverList.copied', {
                    defaultValue: 'Copied!',
                });
                setTimeout(() => {
                    span.textContent = originalText;
                }, 1000);
            });
        };
    }
    return serverItem;
}

async function checkServerIsActive(placeId, gameId) {
    try {
        const info = await callRobloxApiJson({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: {
                placeId: parseInt(placeId, 10),
                gameId,
                isTeleport: false,
                gameJoinAttemptId: createUUID(),
            },
            noCache: true,
        });

        if (info.jobId) {
            return true;
        }
        if (
            info.joinScript ||
            info.status === 2 ||
            (info.queuePosition && info.queuePosition > 0)
        ) {
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

export function initRecentServers() {
    chrome.storage.local.get({ recentServersEnabled: true }, (settings) => {
        if (!settings.recentServersEnabled) return;

        const inject = () => {
            const container =
                document.querySelector(
                    '#roseal-running-game-instances-container',
                ) ||
                document.querySelector('#running-game-instances-container') ||
                document.querySelector(
                    '.flex.flex-col.padding-x-large.width-full',
                );
            if (!container) return;

            const isModern = !!container.querySelector(
                '.flex.flex-col.gap-large.width-full',
            );

            let section = container.querySelector(
                '#rbx-recent-running-games-rovalra',
            );
            if (section) {
                const isSectionModern =
                    section.classList.contains('rovalra-modern-ui');
                if (isModern !== isSectionModern) {
                    section.remove();
                    section = null;
                    const separator = container.querySelector(
                        '.rovalra-modern-separator',
                    );
                    if (separator) separator.remove();
                }
            }

            if (!section) {
                section = document.createElement('div');
                section.id = 'rbx-recent-running-games-rovalra';

                if (isModern) {
                    section.className =
                        'flex flex-col gap-large width-full rovalra-modern-ui';

                    const headerWrapper = document.createElement('div');
                    headerWrapper.className = 'flex flex-col gap-xsmall';

                    const titleRow = document.createElement('div');
                    titleRow.className = 'flex justify-between items-center';

                    const descriptionSpan = document.createElement('span');
                    descriptionSpan.className =
                        'text-body-medium content-muted';
                    descriptionSpan.textContent = ts(
                        'recentServers.description',
                    );

                    const h3 = document.createElement('h3');
                    h3.className =
                        'text-heading-small content-emphasis padding-none';
                    h3.textContent = ts('recentServers.title');

                    const refreshBtn = createSquareButton({
                        content: ts('recentServers.refresh'),
                        width: 'auto',
                        height: 'height-800',
                        paddingX: 'padding-x-small',
                        paddingY: 'padding-y-none',
                        fontSize: 'text-label-small',
                        onClick: () => renderRecentServers(section),
                    });

                    titleRow.append(h3, refreshBtn);
                    headerWrapper.append(titleRow, descriptionSpan);

                    const grid = document.createElement('div');
                    grid.className = 'flex flex-col rbx-recent-servers-grid';

                    section.append(headerWrapper, grid);

                    const separator = document.createElement('div');
                    separator.className =
                        'margin-y-large rovalra-modern-separator';
                    separator.innerHTML =
                        '<div role="separator" data-orientation="horizontal" aria-orientation="horizontal" class="stroke-default self-stretch" style="border-right-width: 0px; border-bottom-width: 0px; box-sizing: border-box; border-style: solid; height: 0px; border-top-width: var(--stroke-standard); border-left-width: 0px;"></div>';

                    const modernSections = container.querySelectorAll(
                        '.flex.flex-col.gap-large.width-full',
                    );
                    if (modernSections.length >= 2) {
                        modernSections[1].before(section);
                        section.after(separator);
                    } else {
                        container.appendChild(section);
                        container.appendChild(separator);
                    }
                } else {
                    section.className = 'server-list-section';
                    const content = `
                        <div class="container-header">
                            <div class="server-list-container-header">
                                <h2 class="server-list-header">${ts('recentServers.title')}</h2>
                                <button type="button" class="btn-more rbx-refresh refresh-link-icon btn-control-xs btn-min-width">${ts('recentServers.refresh')}</button>
                            </div>
                        </div>
                        <div class="rbx-recent-servers-grid">
                            <div class="section-content-off empty-game-instances-container">
                                <p class="no-servers-message">${ts('recentServers.noneFound')}</p>
                            </div>
                        </div>
                    `;
                    section.innerHTML = DOMPurify.sanitize(content);

                    const friendsSection = container.querySelector(
                        '#rbx-friends-running-games',
                    );
                    const publicSection = container.querySelector(
                        '#rbx-public-running-games',
                    );
                    if (friendsSection) {
                        friendsSection.before(section);
                    } else if (publicSection) {
                        publicSection.before(section);
                    } else {
                        container.appendChild(section);
                    }
                }

                if (!isModern) {
                    const refreshButton = section.querySelector('.rbx-refresh');
                    if (refreshButton) {
                        refreshButton.addEventListener('click', () =>
                            renderRecentServers(section),
                        );
                    }
                }
            }

            renderRecentServers(section);
        };

        observeElement(
            '#running-game-instances-container, #roseal-running-game-instances-container, .flex.flex-col.padding-x-large.width-full',
            () => {
                inject();
            },
        );

        observeElement(
            '#rbx-friends-running-games, .flex.flex-col.gap-large.width-full',
            () => {
                inject();
            },
        );

        observeElement('#rbx-recent-running-games-rovalra', () => {}, {
            onRemove: () => {
                setTimeout(() => {
                    const container =
                        document.querySelector(
                            '#roseal-running-game-instances-container',
                        ) ||
                        document.querySelector(
                            '#running-game-instances-container',
                        );
                    if (
                        container &&
                        !container.querySelector(
                            '#rbx-recent-running-games-rovalra',
                        )
                    ) {
                        inject();
                    }
                }, 500);
            },
        });

        chrome.runtime.onMessage.addListener((request) => {
            if (request.action === 'presenceUpdate') {
                const section = document.querySelector(
                    '#rbx-recent-running-games-rovalra',
                );
                if (section && document.body.contains(section)) {
                    renderRecentServers(section);
                }
            }
        });
    });
}

async function renderRecentServers(section) {
    if (isRenderingRecentServers) {
        return;
    }
    isRenderingRecentServers = true;

    try {
        const placeId = getPlaceIdFromUrl();
        if (!placeId) {
            return;
        }

        let gridContainer = section.querySelector('.rbx-recent-servers-grid');
        if (!gridContainer) {
            gridContainer = document.createElement('div');
            gridContainer.className = 'rbx-recent-servers-grid';
            section.appendChild(gridContainer);
        }

        gridContainer.innerHTML = '';
        section
            .querySelectorAll(
                ':scope > .section-content, :scope > .section-content-off',
            )
            .forEach((el) => el.remove());

        const spinnerSection = document.createElement('div');
        spinnerSection.className = 'section-content';
        spinnerSection.innerHTML =
            '<div class="spinner spinner-default"></div>';
        gridContainer.appendChild(spinnerSection);

        const [settings, userId] = await Promise.all([
            new Promise((resolve) =>
                chrome.storage.local.get(
                    ['ServerlistmodificationsEnabled'],
                    resolve,
                ),
            ),
            getAuthenticatedUserId(),
        ]);

        let userThumbnailUrl = null;
        if (userId) {
            try {
                const thumbMap = await fetchThumbnails(
                    [{ id: userId }],
                    'AvatarHeadshot',
                    '150x150',
                    true,
                );
                const thumb = thumbMap.get(userId);
                if (thumb && thumb.state === 'Completed') {
                    userThumbnailUrl = thumb.imageUrl;
                }
            } catch (e) {
                console.warn(
                    'Recent Servers: Failed to fetch user thumbnail',
                    e,
                );
            }
        }

        const serverListModificationsEnabled =
            settings.ServerlistmodificationsEnabled !== false;

        const result = await new Promise((resolve) =>
            chrome.storage.local.get({ rovalra_server_history: {} }, resolve),
        );
        const history = result.rovalra_server_history || {};
        const gameHistory = history[placeId] || [];

        spinnerSection.remove();

        if (gameHistory.length === 0) {
            const noServers = document.createElement('div');
            noServers.className =
                'section-content-off empty-game-instances-container';
            noServers.innerHTML = `<p class="no-servers-message">${await t('recentServers.noneFound')}</p>`;
            gridContainer.appendChild(noServers);
            return;
        }

        const activeServers = [];
        for (const serverData of gameHistory) {
            if (
                await checkServerIsActive(placeId, serverData.presence.gameId)
            ) {
                activeServers.push(serverData);
            }
        }

        if (activeServers.length === 0) {
            const noActive = document.createElement('div');
            noActive.className =
                'section-content-off empty-game-instances-container';
            noActive.innerHTML = `<p class="no-servers-message">${await t('recentServers.noActiveFound')}</p>`;
            gridContainer.appendChild(noActive);
            return;
        }

        activeServers.sort((a, b) => b.timestamp - a.timestamp);

        const isModern = section.classList.contains('gap-large');
        if (isModern) {
            gridContainer.className = 'flex flex-col rbx-recent-servers-grid';
            gridContainer.style = '';
        } else {
            gridContainer.style.display = 'flex';
            gridContainer.style.flexWrap = 'wrap';
            gridContainer.style.width = '100%';
            gridContainer.style.gap = '16px';
        }

        const context = {
            ...serverListState,
            processUptimeBatch: processUptimeBatch,
        };

        activeServers.forEach((serverData) => {
            if (serverData.presence && serverData.presence.gameId) {
                let contentSection;
                let serverItem;

                if (isModern) {
                    contentSection = createModernServerItem(
                        serverData,
                        userThumbnailUrl,
                        userId,
                    );
                    serverItem = contentSection;
                } else {
                    contentSection = document.createElement('div');
                    contentSection.className = 'section-content';
                    contentSection.style.width = '23%';
                    contentSection.style.padding = '12px';
                    contentSection.style.boxSizing = 'border-box';
                    const serverList = document.createElement('ul');
                    serverList.className = 'rbx-game-server-item-container';
                    contentSection.appendChild(serverList);

                    serverItem = createServerItem(
                        serverData,
                        userThumbnailUrl,
                        userId,
                    );
                    serverList.appendChild(serverItem);
                }

                gridContainer.appendChild(contentSection);

                const obsReq = observeElement(
                    `li[data-rovalra-serverid="${serverData.presence.gameId}"], div[data-rovalra-serverid="${serverData.presence.gameId}"]`,
                    () => {},
                    {
                        onRemove: () => {
                            contentSection.remove();
                            if (gridContainer.children.length === 0) {
                                const noActive = document.createElement('div');
                                noActive.className =
                                    'section-content-off empty-game-instances-container';
                                noActive.innerHTML = `<p class="no-servers-message">${ts('recentServers.noActiveFound')}</p>`;
                                gridContainer.appendChild(noActive);
                            }
                            if (obsReq) obsReq.active = false;
                        },
                    },
                );

                if (serverListModificationsEnabled) {
                    enhanceServer(serverItem, context).catch((e) =>
                        console.error('Error enhancing recent server:', e),
                    );
                }
            }
        });

        if (processUptimeBatch) {
            setTimeout(() => processUptimeBatch(), 150);
        }
    } finally {
        isRenderingRecentServers = false;
    }
}
