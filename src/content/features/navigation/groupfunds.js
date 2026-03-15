import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import {
    fetchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';

export function init() {
    chrome.storage.local.get(
        { GroupFundsEnabled: false, GroupFundsId: '' },
        (settings) => {
            if (!settings.GroupFundsEnabled || !settings.GroupFundsId) return;

            const groupId = settings.GroupFundsId;
            const cacheKey = 'rovalra-group-funds-data';

            observeElement('#buy-robux-popover', async (popover) => {
                const menu = popover.querySelector('.dropdown-menu');
                if (!menu || menu.querySelector('.rovalra-group-funds-section'))
                    return;

                const section = document.createElement('div');
                section.className = 'rovalra-group-funds-section';

                const divider = document.createElement('li');
                divider.className = 'rbx-divider';
                section.appendChild(divider);

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

                const label = document.createElement('span');

                leftContainer.appendChild(label);

                fundsLink.appendChild(leftContainer);

                const amountSpan = document.createElement('span');
                amountSpan.textContent = ts('groupFunds.loading');
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

                menu.appendChild(section);

                const renderIcon = (data) => {
                    if (data) {
                        const img = createThumbnailElement(data, 'Group', '', {
                            width: '28px',
                            height: '28px',
                        });
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

                chrome.storage.local.get(cacheKey, (data) => {
                    const cachedData = data[cacheKey];
                    if (cachedData && cachedData.groupId === groupId) {
                        if (cachedData.icon) renderIcon(cachedData.icon);
                        if (cachedData.funds !== undefined)
                            renderFunds(cachedData.funds);
                        if (cachedData.pending !== undefined)
                            renderPending(cachedData.pending);
                    }
                });

                try {
                    const [iconData, fundsData, pendingData] =
                        await Promise.all([
                            fetchThumbnails(
                                [{ id: groupId }],
                                'GroupIcon',
                                '150x150',
                                true,
                            ).then((map) => map.get(parseInt(groupId))),
                            callRobloxApiJson({
                                subdomain: 'economy',
                                endpoint: `/v1/groups/${groupId}/currency`,
                            }).then((data) => data.robux || 0),
                            callRobloxApiJson({
                                subdomain: 'apis',
                                endpoint: `/transaction-records/v1/groups/${groupId}/revenue/summary/day`,
                            }).then((data) => data.pendingRobux || 0),
                        ]);

                    const newCache = {
                        groupId,
                        icon: iconData,
                        funds: fundsData,
                        pending: pendingData,
                        timestamp: Date.now(),
                    };

                    chrome.storage.local.set({ [cacheKey]: newCache });

                    renderIcon(iconData);
                    renderFunds(fundsData);
                    renderPending(pendingData);
                } catch (e) {
                    console.warn(
                        'RoValra: Failed to update group funds data',
                        e,
                    );
                }
            });
        },
    );
}
