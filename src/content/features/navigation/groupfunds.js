import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import {
    fetchThumbnails,
    createThumbnailElement,
    getBatchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import {
    getCachedUserCurrency,
    getUserCurrency,
} from '../../core/user/userCurrency.js';
import { USER_CURRENCY_CHANGED_EVENT } from '../../core/utils/trackers/currency.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getUserName } from '../../core/apis/users.js';

const CACHE_KEY = 'rovalra-group-funds-data';
const CACHE_DURATION = 5 * 60 * 1000;
const NAVBAR_SELECTORS = '#nav-robux-amount, #nav-robux-balance';
const NAVBAR_BALANCE_UPDATED_EVENT = 'rovalra:navbar-balance-updated';

const state = {
    initialized: false,
    groupFundsEnabled: false,
    navbarTotalEnabled: false,
    groupIds: [],
    hideRobux: false,
    renderVersion: 0,
};

const activeGroupRequests = new Map();
let currentUserMenuDataPromise = null;

function sanitizeGroupIds(groupIds) {
    if (!Array.isArray(groupIds)) return [];

    return groupIds.filter((id) => id && String(id).trim() !== '');
}

function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(
            {
                GroupFundsEnabled: false,
                GroupFundsNavbarTotalEnabled: false,
                GroupFundsIds: [],
                streamermode: false,
                hideRobux: false,
            },
            resolve,
        );
    });
}

function getCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get(CACHE_KEY, (data) => {
            resolve(data[CACHE_KEY] || {});
        });
    });
}

function setCache(cache) {
    chrome.storage.local.set({ [CACHE_KEY]: cache });
}

function isCacheFresh(entry) {
    return (
        entry &&
        Number.isFinite(Number(entry.timestamp)) &&
        Date.now() - entry.timestamp < CACHE_DURATION
    );
}

async function fetchAndCacheGroupData(groupId) {
    if (activeGroupRequests.has(groupId)) {
        return activeGroupRequests.get(groupId);
    }

    const request = (async () => {
        const cache = await getCache();
        const cachedData = cache[groupId] || null;

        try {
            const [iconData, fundsData, pendingData] = await Promise.all([
                fetchThumbnails(
                    [{ id: groupId }],
                    'GroupIcon',
                    '150x150',
                    false,
                ).then((map) => map.get(parseInt(groupId, 10))),
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

            const freshCache = await getCache();
            freshCache[groupId] = newEntry;
            setCache(freshCache);

            return newEntry;
        } catch (error) {
            console.warn('RoValra: Failed to update group funds data', error);
            return cachedData;
        } finally {
            activeGroupRequests.delete(groupId);
        }
    })();

    activeGroupRequests.set(groupId, request);
    return request;
}

async function ensureFreshDataForConfiguredGroups() {
    if (!state.groupFundsEnabled || state.groupIds.length === 0) return;

    const cache = await getCache();

    state.groupIds.forEach((groupId) => {
        if (!isCacheFresh(cache[groupId])) {
            fetchAndCacheGroupData(groupId).catch(() => {});
        }
    });
}

function clearNavbarOverride() {
    document.querySelectorAll(NAVBAR_SELECTORS).forEach((element) => {
        delete element.dataset.rovalraNavbarRobuxAmount;
        delete element.dataset.rovalraGroupFundsOverride;
    });
}

function notifyNavbarBalanceUpdated() {
    document.dispatchEvent(new CustomEvent(NAVBAR_BALANCE_UPDATED_EVENT));
}

function setNavbarAmountText(element, amountText) {
    if (!(element instanceof HTMLElement)) return false;

    const existingTextNodes = Array.from(element.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE,
    );
    const primaryTextNode = existingTextNodes[0] || document.createTextNode('');
    const normalizedText = String(amountText);

    if (!primaryTextNode.parentNode) {
        element.insertBefore(primaryTextNode, element.firstChild);
    }

    if (primaryTextNode.textContent !== normalizedText) {
        primaryTextNode.textContent = normalizedText;
    }

    existingTextNodes.slice(1).forEach((node) => node.remove());
    return true;
}

function captureOriginalNavbarAmount(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.dataset.rovalraOriginalNavbarAmount !== undefined) return;

    const originalText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join('')
        .trim();

    if (originalText) {
        element.dataset.rovalraOriginalNavbarAmount = originalText;
    }
}

function restoreOriginalNavbarAmount(element) {
    if (!(element instanceof HTMLElement)) return false;

    const originalText = element.dataset.rovalraOriginalNavbarAmount;
    if (!originalText) return false;

    setNavbarAmountText(element, originalText);
    delete element.dataset.rovalraOriginalNavbarAmount;
    return true;
}

async function getCurrentUserMenuData() {
    if (currentUserMenuDataPromise) {
        return currentUserMenuDataPromise;
    }

    currentUserMenuDataPromise = (async () => {
        const userId = await getAuthenticatedUserId();
        if (!userId) return null;

        const [username, thumbnails] = await Promise.all([
            getUserName(userId),
            getBatchThumbnails([userId], 'AvatarHeadshot', '48x48'),
        ]);

        return {
            userId,
            username: username || 'User',
            thumbnailData: thumbnails?.[0] || null,
        };
    })().finally(() => {
        currentUserMenuDataPromise = null;
    });

    return currentUserMenuDataPromise;
}

async function getPersonalRobuxBalance() {
    const cachedBalance = Number((await getCachedUserCurrency())?.robux);
    if (Number.isFinite(cachedBalance)) {
        return cachedBalance;
    }

    const freshBalance = Number((await getUserCurrency())?.robux);
    return Number.isFinite(freshBalance) ? freshBalance : null;
}

async function restorePersonalNavbarBalance() {
    const robux = await getPersonalRobuxBalance();
    let restoredAny = false;

    document.querySelectorAll(NAVBAR_SELECTORS).forEach((element) => {
        delete element.dataset.rovalraNavbarRobuxAmount;

        if (element.dataset.rovalraGroupFundsOverride === 'true') {
            if (Number.isFinite(robux)) {
                setNavbarAmountText(element, robux.toLocaleString());
                restoredAny = true;
            } else if (restoreOriginalNavbarAmount(element)) {
                restoredAny = true;
            }
        }

        delete element.dataset.rovalraGroupFundsOverride;
    });

    if (restoredAny) {
        notifyNavbarBalanceUpdated();
    }
}

function sumConfiguredGroupFunds(cache) {
    return state.groupIds.reduce((sum, groupId) => {
        const funds = Number(cache[groupId]?.funds);
        return Number.isFinite(funds) ? sum + funds : sum;
    }, 0);
}

async function renderNavbarTotal() {
    if (!state.groupFundsEnabled || !state.navbarTotalEnabled) {
        await restorePersonalNavbarBalance();
        return;
    }

    if (state.groupIds.length === 0) {
        await restorePersonalNavbarBalance();
        return;
    }

    if (state.hideRobux) {
        clearNavbarOverride();
        return;
    }

    const personalRobux = await getPersonalRobuxBalance();

    if (!Number.isFinite(personalRobux)) {
        await restorePersonalNavbarBalance();
        return;
    }

    const cache = await getCache();
    const mergedTotal = personalRobux + sumConfiguredGroupFunds(cache);
    const formattedTotal = mergedTotal.toLocaleString();

    document.querySelectorAll(NAVBAR_SELECTORS).forEach((element) => {
        captureOriginalNavbarAmount(element);
        element.dataset.rovalraNavbarRobuxAmount = String(mergedTotal);
        if (element.dataset.rovalraGroupFundsOverride !== 'true') {
            element.dataset.rovalraGroupFundsOverride = 'true';
        }
        setNavbarAmountText(element, formattedTotal);
    });

    notifyNavbarBalanceUpdated();
}

async function syncSettingsAndRender() {
    const settings = await getSettings();

    state.groupFundsEnabled = settings.GroupFundsEnabled === true;
    state.navbarTotalEnabled = settings.GroupFundsNavbarTotalEnabled === true;
    state.groupIds = sanitizeGroupIds(settings.GroupFundsIds);
    state.hideRobux = settings.streamermode && settings.hideRobux === true;

    if (state.groupFundsEnabled && state.groupIds.length > 0) {
        await ensureFreshDataForConfiguredGroups();
    }

    await renderNavbarTotal();
}

export function init() {
    if (state.initialized) return;
    state.initialized = true;

    const renderSection = async (popover) => {
        const menu = popover.querySelector('.dropdown-menu');
        if (!menu) return;

        state.renderVersion++;
        const myVersion = state.renderVersion;

        menu.querySelectorAll('.rovalra-group-funds-section').forEach((el) =>
            el.remove(),
        );

        if (!state.groupFundsEnabled || state.groupIds.length === 0) return;

        const allCachedData = await getCache();

        const section = document.createElement('div');
        section.className = 'rovalra-group-funds-section';

        const divider = document.createElement('li');
        divider.className = 'rbx-divider';
        section.appendChild(divider);

        if (state.navbarTotalEnabled && !state.hideRobux) {
            const userData = await getCurrentUserMenuData().catch(() => null);
            const personalBalance = await getPersonalRobuxBalance();

            if (
                state.renderVersion === myVersion &&
                userData &&
                Number.isFinite(personalBalance)
            ) {
                const userLi = document.createElement('li');
                const userLink = document.createElement('a');
                userLink.className = 'rbx-menu-item';
                userLink.href = `https://www.roblox.com/users/${userData.userId}/profile`;
                userLink.style.display = 'flex';
                userLink.style.alignItems = 'center';
                userLink.style.justifyContent = 'space-between';

                const leftContainer = document.createElement('div');
                leftContainer.style.display = 'flex';
                leftContainer.style.alignItems = 'center';

                const iconContainer = document.createElement('span');
                iconContainer.style.width = '28px';
                iconContainer.style.height = '28px';
                iconContainer.style.marginRight = '8px';
                iconContainer.style.display = 'inline-block';

                if (userData.thumbnailData) {
                    const img = createThumbnailElement(
                        userData.thumbnailData,
                        'User',
                        '',
                        {
                            borderRadius: '999px',
                            width: '28px',
                            height: '28px',
                        },
                    );
                    iconContainer.appendChild(img);
                }

                const nameSpan = document.createElement('span');
                nameSpan.textContent = userData.username;

                const amountSpan = document.createElement('span');
                const rbxIcon = document.createElement('span');
                rbxIcon.className = 'icon-robux-16x16';
                rbxIcon.style.verticalAlign = 'text-bottom';
                rbxIcon.style.marginRight = '3px';
                amountSpan.append(rbxIcon, personalBalance.toLocaleString());

                leftContainer.append(iconContainer, nameSpan);
                userLink.append(leftContainer, amountSpan);
                userLi.appendChild(userLink);
                section.appendChild(userLi);
            }
        }

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
                    const img = createThumbnailElement(data, 'Group', '', {
                        borderRadius: '8px',
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

            const updateFromData = (data) => {
                if (data.icon) renderIcon(data.icon);
                if (data.funds !== undefined) renderFunds(data.funds);
                if (data.pending !== undefined) renderPending(data.pending);
            };

            const cachedData = allCachedData[groupId];

            if (cachedData) {
                updateFromData(cachedData);
            } else {
                amountSpan.textContent = ts('groupFunds.loading');
            }

            if (cachedData && isCacheFresh(cachedData)) {
                return;
            }

            const freshData = await fetchAndCacheGroupData(groupId);

            if (state.renderVersion !== myVersion) return;

            if (freshData) {
                updateFromData(freshData);
                return;
            }

            if (!cachedData) {
                amountSpan.textContent = ts('groupFunds.noPermissions');
                pendingLink.textContent = '';
            }
        };

        state.groupIds.forEach((groupId) => {
            renderGroup(groupId);
        });

        if (state.renderVersion !== myVersion) return;
        menu.appendChild(section);
    };

    syncSettingsAndRender().catch((error) => {
        console.error('RoValra: Failed to initialize group funds', error);
    });

    observeElement(
        '#buy-robux-popover',
        (popover) => {
            const menu = popover.querySelector('.dropdown-menu');
            if (menu && menu.querySelector('.rovalra-group-funds-section')) {
                return;
            }
            renderSection(popover);
        },
        {
            onRemove: () => {
                state.renderVersion++;
                document
                    .querySelectorAll('.rovalra-group-funds-section')
                    .forEach((el) => el.remove());
            },
        },
    );

    observeElement(
        NAVBAR_SELECTORS,
        () => {
            renderNavbarTotal().catch(() => {});
        },
        { multiple: true },
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        const openPopover = document.querySelector('#buy-robux-popover');

        if (changes[CACHE_KEY]) {
            renderNavbarTotal().catch(() => {});
            return;
        }

        if (
            changes.GroupFundsEnabled ||
            changes.GroupFundsNavbarTotalEnabled ||
            changes.GroupFundsIds ||
            changes.streamermode ||
            changes.hideRobux
        ) {
            syncSettingsAndRender().catch(() => {});
            if (openPopover) {
                renderSection(openPopover).catch(() => {});
            }
        }
    });

    document.addEventListener(USER_CURRENCY_CHANGED_EVENT, () => {
        renderNavbarTotal().catch(() => {});
    });

    document.addEventListener('rovalra-streamer-mode', (event) => {
        const detail = event.detail || {};
        state.hideRobux = detail.enabled && detail.hideRobux === true;
        renderNavbarTotal().catch(() => {});
    });
}
