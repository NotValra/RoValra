import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import {
    fetchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';

export function init() {
    chrome.storage.local.get(
        { GroupFundsEnabled: false, GroupFundsIds: [] },
        (settings) => {
            let groupIds = settings.GroupFundsIds;

            if (Array.isArray(groupIds)) {
                groupIds = groupIds.filter((id) => id && id.trim() !== '');
            }

            if (
                !settings.GroupFundsEnabled ||
                !groupIds ||
                groupIds.length === 0
            )
                return;

            const cacheKey = 'rovalra-group-funds-data';

            observeElement('#buy-robux-popover', async (popover) => {
                const menu = popover.querySelector('.dropdown-menu');
                if (!menu || menu.querySelector('.rovalra-group-funds-section'))
                    return;

                const storageData = await new Promise((resolve) =>
                    chrome.storage.local.get(cacheKey, resolve),
                );
                const allCachedData = storageData[cacheKey] || {};

                const section = document.createElement('div');
                section.className = 'rovalra-group-funds-section';

                const divider = document.createElement('li');
                divider.className = 'rbx-divider';
                section.appendChild(divider);

                const renderGroup = async (groupId) => {
                    const fundsLi = document.createElement('li');
                    const fundsLink = document.createElement('a');
                    fundsLink.className = 'rbx-menu-item';
                    fundsLink.href = `https://www.roblox.com/groups/configure?id=${groupId}#!/revenue/summary`;
                    fundsLink.style.display = 'flex';
                    fundsLink.style.alignItems = 'center';

                    const leftContainer = document.createElement('div');
                    leftContainer.style.display = 'flex';
                    leftContainer.style.alignItems = 'center';

                    const iconContainer = document.createElement('span');
                    iconContainer.style.width = '28px';
                    iconContainer.style.height = '28px';
                    iconContainer.style.marginRight = '8px';
                    iconContainer.style.display = 'inline-block';

                    leftContainer.appendChild(iconContainer);

                    fundsLink.appendChild(leftContainer);

                    const amountSpan = document.createElement('span');
                    fundsLink.appendChild(amountSpan);

                    fundsLi.appendChild(fundsLink);
                    section.appendChild(fundsLi);

                    const pendingLi = document.createElement('li');
                    const pendingLink = document.createElement('a');
                    pendingLink.className = 'rbx-menu-item';
                    pendingLink.style.paddingTop = '0';
                    pendingLink.style.paddingBottom = '5px';
                    pendingLink.style.fontSize = '12px';
                    pendingLink.style.color = 'gray';
                    pendingLink.style.textAlign = 'right';
                    pendingLink.style.pointerEvents = 'none';
                    pendingLink.textContent = '';
                    pendingLi.appendChild(pendingLink);
                    section.appendChild(pendingLi);

                    const renderIcon = (data) => {
                        if (data) {
                            const img = createThumbnailElement(
                                data,
                                'Group',
                                '',
                                {
                                    borderRadius: '8px',
                                    width: '28px',
                                    height: '28px',
                                },
                            );
                            iconContainer.innerHTML = '';
                            iconContainer.appendChild(img);
                        }
                    };

                    const renderFunds = (amount) => {
                        amountSpan.innerHTML = '';
                        const rbxIcon = document.createElement('span');
                        rbxIcon.className = 'icon-robux-16x16';
                        rbxIcon.style.verticalAlign = 'text-bottom';
                        rbxIcon.style.marginRight = '3px';

                        const text = document.createTextNode(
                            amount.toLocaleString(),
                        );

                        amountSpan.appendChild(rbxIcon);
                        amountSpan.appendChild(text);
                    };

                    const renderPending = (amount) => {
                        pendingLink.innerHTML = '';
                        const label = document.createTextNode(
                            ts('groupFunds.pending') + ' ',
                        );
                        const icon = document.createElement('span');
                        icon.className = 'icon-robux-16x16';
                        icon.style.verticalAlign = 'text-bottom';
                        icon.style.marginLeft = '3px';
                        icon.style.marginRight = '2px';
                        icon.style.filter = 'grayscale(100%) opacity(0.6)';
                        const value = document.createTextNode(
                            amount.toLocaleString(),
                        );

                        pendingLink.append(label, icon, value);
                    };

                    const updateFromData = (data) => {
                        if (data.icon) renderIcon(data.icon);
                        if (data.funds !== undefined) renderFunds(data.funds);
                        if (data.pending !== undefined)
                            renderPending(data.pending);
                    };

                    const cachedData = allCachedData[groupId];

                    if (cachedData) {
                        updateFromData(cachedData);
                    } else {
                        amountSpan.textContent = ts('groupFunds.loading');
                    }

                    const CACHE_DURATION = 5 * 60 * 1000;

                    if (
                        cachedData &&
                        Date.now() - cachedData.timestamp < CACHE_DURATION
                    ) {
                        return;
                    }

                    try {
                        const [iconData, fundsData, pendingData] =
                            await Promise.all([
                                fetchThumbnails(
                                    [{ id: groupId }],
                                    'GroupIcon',
                                    '150x150',
                                    false,
                                ).then((map) => map.get(parseInt(groupId))),
                                callRobloxApiJson({
                                    subdomain: 'economy',
                                    endpoint: `/v1/groups/${groupId}/currency`,
                                }).then((data) => {
                                    if (data.robux === undefined) {
                                        throw new Error('Unauthorized');
                                    }
                                    return data.robux;
                                }),
                                callRobloxApiJson({
                                    subdomain: 'apis',
                                    endpoint: `/transaction-records/v1/groups/${groupId}/revenue/summary/day`,
                                }).then((data) => data.pendingRobux || 0),
                            ]);

                        const newEntry = {
                            icon: iconData,
                            funds: fundsData,
                            pending: pendingData,
                            timestamp: Date.now(),
                        };

                        updateFromData(newEntry);

                        const freshStorage = await new Promise((resolve) =>
                            chrome.storage.local.get(cacheKey, resolve),
                        );
                        const freshCache = freshStorage[cacheKey] || {};
                        freshCache[groupId] = newEntry;
                        chrome.storage.local.set({ [cacheKey]: freshCache });
                    } catch (e) {
                        console.warn(
                            'RoValra: Failed to update group funds data',
                            e,
                        );
                        if (!cachedData) {
                            amountSpan.textContent = ts(
                                'groupFunds.noPermissions',
                            );
                            pendingLink.textContent = '';
                        }
                    }
                };

                groupIds.forEach((id) => renderGroup(id));

                menu.appendChild(section);
            });
        },
    );
}
