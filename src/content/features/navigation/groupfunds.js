import { observeAttributes, observeElement } from '../../core/observer.js';
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
const NAVBAR_SELECTORS = '#nav-robux-amount, #nav-robux-balance';
const NAVBAR_BALANCE_UPDATED_EVENT = 'rovalra:navbar-balance-updated';
const STREAMER_ROBUX_VISIBILITY_EVENT = 'rovalra-streamer-robux-visibility';
const STREAMER_ROBUX_VALUE_CLASS = 'rovalra-streamer-robux-value';
const LEGACY_POPOVER_SELECTOR = '#buy-robux-popover';
const FOUNDATION_MENU_SELECTOR =
    '.foundation-web-menu.nav-foundation-menu[role="menu"]';
const FOUNDATION_ROBUX_MENU_MARKER =
    '#nav-robux, [role="menuitem"][href*="/upgrades/robux"]';
const FOUNDATION_MENU_ITEM_CLASS =
    'relative clip group/interactable focus-visible:outline-focus disabled:outline-none foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none cursor-pointer stroke-none bg-none text-align-x-left width-full text-body-large padding-x-large padding-y-medium gap-x-large radius-medium';
const FOUNDATION_STATE_LAYER_CLASS =
    'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

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
let personalRowData = null;
let personalRowDataPromise = null;

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

function shouldWarmPersonalRowData() {
    return state.groupFundsEnabled && state.navbarTotalEnabled;
}

async function warmPersonalRowData() {
    if (!shouldWarmPersonalRowData()) return null;
    if (personalRowDataPromise) return personalRowDataPromise;

    personalRowDataPromise = (async () => {
        const [userResult, balanceResult] = await Promise.allSettled([
            getCurrentUserMenuData(),
            getPersonalRobuxBalance(),
        ]);

        if (!shouldWarmPersonalRowData()) return null;

        const userData =
            userResult.status === 'fulfilled' ? userResult.value : null;
        const personalBalance =
            balanceResult.status === 'fulfilled'
                ? Number(balanceResult.value)
                : NaN;

        personalRowData = {
            userId: userData?.userId || personalRowData?.userId || null,
            username: userData?.username || personalRowData?.username || 'User',
            thumbnailData:
                userData?.thumbnailData ||
                personalRowData?.thumbnailData ||
                null,
            personalBalance: Number.isFinite(personalBalance)
                ? personalBalance
                : personalRowData?.personalBalance,
        };

        return personalRowData;
    })().finally(() => {
        personalRowDataPromise = null;
    });

    return personalRowDataPromise;
}

function isFoundationRobuxMenu(element) {
    return (
        element instanceof HTMLElement &&
        element.matches(FOUNDATION_MENU_SELECTOR) &&
        !!element.querySelector(FOUNDATION_ROBUX_MENU_MARKER)
    );
}

function getOpenRobuxPopover() {
    return (
        document.querySelector(LEGACY_POPOVER_SELECTOR) ||
        [...document.querySelectorAll(FOUNDATION_MENU_SELECTOR)].find(
            isFoundationRobuxMenu,
        ) ||
        null
    );
}

function createFoundationMenuItem(href) {
    const item = document.createElement('a');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    item.className = FOUNDATION_MENU_ITEM_CLASS;
    item.style.columnGap = '8px';
    item.style.textDecoration = 'none';
    if (href) item.href = href;

    const stateLayer = document.createElement('div');
    stateLayer.setAttribute('aria-hidden', 'true');
    stateLayer.className = FOUNDATION_STATE_LAYER_CLASS;
    item.appendChild(stateLayer);

    return item;
}

function createFoundationTextWrapper() {
    const wrapper = document.createElement('div');
    wrapper.className = 'grow-1 text-truncate-split flex flex-col gap-y-xsmall';

    const title = document.createElement('span');
    title.className =
        'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';

    wrapper.appendChild(title);
    return { wrapper, title };
}

function createMenuIconContainer(isFoundation) {
    const iconContainer = document.createElement('span');
    iconContainer.style.width = '28px';
    iconContainer.style.height = '28px';
    iconContainer.style.display = 'inline-block';
    if (isFoundation) {
        iconContainer.style.flexShrink = '0';
    } else {
        iconContainer.style.marginRight = '8px';
    }
    return iconContainer;
}

function upsertFoundationPersonalRow(container, data, personalBalance) {
    let userLink = container.querySelector('.rovalra-personal-robux-row');
    if (!(userLink instanceof HTMLElement)) {
        userLink = createFoundationMenuItem();
        userLink.classList.add('rovalra-personal-robux-row');
        container.prepend(userLink);
    }

    if (data.userId) {
        userLink.href = `https://www.roblox.com/users/${data.userId}/profile`;
    }

    const iconContainer = createMenuIconContainer(true);
    if (data.thumbnailData) {
        iconContainer.appendChild(
            createThumbnailElement(data.thumbnailData, 'User', '', {
                borderRadius: '999px',
                width: '28px',
                height: '28px',
            }),
        );
    }

    const { wrapper, title } = createFoundationTextWrapper();
    title.textContent = data.username || 'User';

    const amountSpan = document.createElement('span');
    amountSpan.className = 'shrink-0 text-no-wrap content-emphasis';
    const rbxIcon = document.createElement('span');
    rbxIcon.className = 'icon-robux-16x16';
    rbxIcon.style.verticalAlign = 'text-bottom';
    rbxIcon.style.marginRight = '3px';

    const amountValue = document.createElement('span');
    amountValue.className = STREAMER_ROBUX_VALUE_CLASS;
    amountValue.textContent = personalBalance.toLocaleString();
    amountSpan.append(rbxIcon, amountValue);

    userLink.replaceChildren(
        userLink.firstElementChild,
        iconContainer,
        wrapper,
        amountSpan,
    );
}

function upsertPersonalRow(section, divider, data, isFoundation = false) {
    if (!data) return;

    const personalBalance = Number(data.personalBalance);
    if (!Number.isFinite(personalBalance)) return;

    if (isFoundation) {
        upsertFoundationPersonalRow(section, data, personalBalance);
        return;
    }

    let userLi = section.querySelector('.rovalra-personal-robux-row');
    if (!(userLi instanceof HTMLElement)) {
        userLi = document.createElement('li');
        userLi.className = 'rovalra-personal-robux-row';
        section.insertBefore(userLi, divider.nextSibling);
    }

    userLi.textContent = '';

    const userLink = document.createElement('a');
    userLink.className = 'rbx-menu-item';
    if (data.userId) {
        userLink.href = `https://www.roblox.com/users/${data.userId}/profile`;
    }
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

    if (data.thumbnailData) {
        const img = createThumbnailElement(data.thumbnailData, 'User', '', {
            borderRadius: '999px',
            width: '28px',
            height: '28px',
        });
        iconContainer.appendChild(img);
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = data.username || 'User';

    const amountSpan = document.createElement('span');
    const rbxIcon = document.createElement('span');
    rbxIcon.className = 'icon-robux-16x16';
    rbxIcon.style.verticalAlign = 'text-bottom';
    rbxIcon.style.marginRight = '3px';

    const amountValue = document.createElement('span');
    amountValue.className = STREAMER_ROBUX_VALUE_CLASS;
    amountValue.textContent = personalBalance.toLocaleString();

    amountSpan.append(rbxIcon, amountValue);

    leftContainer.append(iconContainer, nameSpan);
    userLink.append(leftContainer, amountSpan);
    userLi.appendChild(userLink);
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

    await Promise.allSettled(
        state.groupIds.map((groupId) => fetchAndCacheGroupData(groupId)),
    );

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

    if (shouldWarmPersonalRowData()) {
        warmPersonalRowData().catch(() => {});
    }

    await renderNavbarTotal();
}

const PENDING_ROW_STYLE_ID = 'rovalra-group-funds-pending-row-style';

function injectPendingRowStyle() {
    if (document.getElementById(PENDING_ROW_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PENDING_ROW_STYLE_ID;
    style.textContent = `
        .rovalra-funds-pending-row,
        .rovalra-funds-pending-row:hover {
            cursor: default !important;
            background: transparent !important;
        }
        .rovalra-funds-pending-row * {
            cursor: default !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

export function init() {
    if (state.initialized) return;
    state.initialized = true;

    injectPendingRowStyle();

    const renderSection = (popover) => {
        const isFoundation = popover.matches(FOUNDATION_MENU_SELECTOR);
        const menu = isFoundation
            ? popover
            : popover.querySelector('.dropdown-menu');
        if (!menu) return;

        state.renderVersion++;
        const myVersion = state.renderVersion;

        menu.querySelectorAll('.rovalra-group-funds-section').forEach((el) =>
            el.remove(),
        );

        if (!state.groupFundsEnabled || state.groupIds.length === 0) return;

        const allCachedDataPromise = getCache();

        const section = document.createElement('div');
        section.className = 'rovalra-group-funds-section';

        let divider;
        let rowContainer = section;
        if (isFoundation) {
            divider = document.createElement('div');
            divider.setAttribute('role', 'separator');
            divider.className = 'foundation-web-menu-separator';

            rowContainer = document.createElement('div');
            rowContainer.setAttribute('role', 'group');
            rowContainer.className = 'padding-small';
            section.append(divider, rowContainer);
        } else {
            divider = document.createElement('li');
            divider.className = 'rbx-divider';
            section.appendChild(divider);
        }

        if (state.navbarTotalEnabled) {
            upsertPersonalRow(
                rowContainer,
                divider,
                personalRowData,
                isFoundation,
            );

            warmPersonalRowData().then((data) => {
                if (state.renderVersion !== myVersion) return;
                upsertPersonalRow(rowContainer, divider, data, isFoundation);
            });
        }

        const createFoundationGroupRow = (groupId) => {
            const revenueUrl = `https://www.roblox.com/groups/configure?id=${groupId}#!/revenue/summary`;

            const createRow = (iconContainer) => {
                const link = createFoundationMenuItem(revenueUrl);
                const { wrapper, title } = createFoundationTextWrapper();
                if (iconContainer) link.appendChild(iconContainer);
                link.appendChild(wrapper);
                rowContainer.appendChild(link);
                return title;
            };

            const iconContainer = createMenuIconContainer(true);
            const amountSpan = createRow(iconContainer);
            const pendingLink = createRow();
            pendingLink.classList.replace(
                'content-emphasis',
                'content-default',
            );

            return { iconContainer, amountSpan, pendingLink };
        };

        const createLegacyGroupRow = (groupId) => {
            const fundsLi = document.createElement('li');
            const fundsLink = document.createElement('a');
            fundsLink.className = 'rbx-menu-item';
            fundsLink.href = `https://www.roblox.com/groups/configure?id=${groupId}#!/revenue/summary`;
            fundsLink.style.display = 'flex';
            fundsLink.style.alignItems = 'center';

            const leftContainer = document.createElement('div');
            leftContainer.style.display = 'flex';
            leftContainer.style.alignItems = 'center';

            const iconContainer = createMenuIconContainer(false);

            leftContainer.appendChild(iconContainer);

            fundsLink.appendChild(leftContainer);

            const amountSpan = document.createElement('span');
            fundsLink.appendChild(amountSpan);

            fundsLi.appendChild(fundsLink);
            section.appendChild(fundsLi);

            const pendingLi = document.createElement('li');
            pendingLi.className = 'rovalra-funds-pending-row';
            const pendingLink = document.createElement('a');
            pendingLink.className = 'rbx-menu-item';
            pendingLink.style.paddingTop = '0';
            pendingLink.style.paddingBottom = '5px';
            pendingLink.style.fontSize = '12px';
            pendingLink.style.color = 'gray';
            pendingLink.style.textAlign = 'right';
            pendingLink.style.cursor = 'default';
            pendingLink.textContent = '';
            pendingLi.appendChild(pendingLink);
            section.appendChild(pendingLi);

            return { iconContainer, amountSpan, pendingLink };
        };

        const renderGroup = (groupId) => {
            const { iconContainer, amountSpan, pendingLink } = isFoundation
                ? createFoundationGroupRow(groupId)
                : createLegacyGroupRow(groupId);

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

                const value = document.createElement('span');
                value.className = STREAMER_ROBUX_VALUE_CLASS;
                value.textContent = amount.toLocaleString();

                amountSpan.appendChild(rbxIcon);
                amountSpan.appendChild(value);
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
                const value = document.createElement('span');
                value.className = STREAMER_ROBUX_VALUE_CLASS;
                value.textContent = amount.toLocaleString();

                pendingLink.append(label, icon, value);
            };

            const updateFromData = (data) => {
                if (data.icon) renderIcon(data.icon);
                if (data.funds !== undefined) renderFunds(data.funds);
                if (data.pending !== undefined) renderPending(data.pending);
            };

            amountSpan.textContent = ts('groupFunds.loading');

            allCachedDataPromise.then(async (allCachedData) => {
                if (state.renderVersion !== myVersion) return;

                const cachedData = allCachedData[groupId];

                if (cachedData) {
                    updateFromData(cachedData);
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
            });
        };

        state.groupIds.forEach((groupId) => {
            renderGroup(groupId);
        });

        menu.appendChild(section);
    };

    syncSettingsAndRender().catch((error) => {
        console.error('RoValra: Failed to initialize group funds', error);
    });

    const popoverOpenState = new WeakMap();
    const isPopoverOpen = (popover) =>
        popover instanceof HTMLElement &&
        getComputedStyle(popover).display !== 'none';
    const handlePopoverState = (popover) => {
        const isOpen = isPopoverOpen(popover);
        const wasOpen = popoverOpenState.get(popover) === true;
        popoverOpenState.set(popover, isOpen);

        if (isOpen && !wasOpen) renderSection(popover);
    };

    observeElement(
        FOUNDATION_MENU_SELECTOR,
        (menu) => {
            if (!isFoundationRobuxMenu(menu)) return;
            menu.dataset.rovalraGroupFundsMenu = 'true';
            renderSection(menu);
        },
        {
            multiple: true,
            onRemove: (menu) => {
                if (menu?.dataset.rovalraGroupFundsMenu === 'true') {
                    state.renderVersion++;
                }
            },
        },
    );

    observeElement(
        LEGACY_POPOVER_SELECTOR,
        (popover) => {
            handlePopoverState(popover);
            observeAttributes(popover, () => handlePopoverState(popover), [
                'class',
                'style',
            ]);
        },
        {
            onRemove: () => {
                state.renderVersion++;
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

        const openPopover = getOpenRobuxPopover();

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
                renderSection(openPopover);
            }
        }
    });

    document.addEventListener(USER_CURRENCY_CHANGED_EVENT, () => {
        if (shouldWarmPersonalRowData()) {
            warmPersonalRowData().catch(() => {});
        }
        renderNavbarTotal().catch(() => {});
    });

    document.addEventListener('rovalra-streamer-mode', (event) => {
        const detail = event.detail || {};
        state.hideRobux = detail.enabled && detail.hideRobux === true;
        renderNavbarTotal().catch(() => {});
    });

    document.addEventListener(STREAMER_ROBUX_VISIBILITY_EVENT, (event) => {
        const detail = event.detail || {};
        state.hideRobux = detail.hidden === true;
        renderNavbarTotal().catch(() => {});
    });
}
