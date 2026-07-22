import { t } from '../../core/locale/i18n.js';
import { observeElement, observeResize } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createButton } from '../../core/ui/buttons.js';
import {
    createLayoutEditorBody,
    createLayoutIcon,
} from '../../core/ui/layoutEditor.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { addTooltip } from '../../core/ui/tooltip.js';

const ORDER_STORAGE_KEY = 'rovalra_topbar_layout_order';
const HIDDEN_STORAGE_KEY = 'rovalra_topbar_layout_hidden';
const BUTTON_ID = 'rovalra-topbar-layout-button';
const BUTTON_ITEM_ID = 'rovalra-topbar-layout-button-item';
const TOPBAR_ROOT_SELECTOR = '#header > .container-fluid';
const DESKTOP_PRIMARY_NAV_SELECTOR = 'ul.nav.rbx-navbar.hidden-xs.hidden-sm';
const RIGHT_NAV_GROUP_SELECTOR =
    '#right-navigation-header .navbar-right.rbx-navbar-right > ul.nav.navbar-right.rbx-navbar-icon-group';
const SEARCH_MOVED_CLASS = 'rovalra-topbar-layout-search-moved';
const DROPDOWN_ITEM_KEYS = new Set([
    'search',
    'qol',
    'notifications',
    'robuxBalance',
    'settings',
]);
const DROPDOWN_EDGE_MARGIN = 12;
const DROPDOWN_WIDTH_BY_KEY = {
    search: 720,
    qol: 320,
    notifications: 360,
    robuxBalance: 300,
    settings: 240,
};
const MAX_COMPACT_GAP = 16;
const LEFT_FLOW_ITEM_KEYS = new Set([
    'logo',
    'charts',
    'marketplace',
    'create',
    'robux',
    'search',
]);
const RIGHT_FLOW_ITEM_KEYS = new Set([
    'profile',
    'qol',
    'topbarLayout',
    'notifications',
    'robuxBalance',
    'settings',
]);
const REQUIRED_ITEM_IDS = new Set(['topbarLayout']);
const TOPBAR_ITEM_RENDER_SELECTOR = [
    `${TOPBAR_ROOT_SELECTOR} > .rbx-navbar-header`,
    '#nav-logo-link',
    `${DESKTOP_PRIMARY_NAV_SELECTOR} > li`,
    `${DESKTOP_PRIMARY_NAV_SELECTOR} a[href]`,
    '[data-testid="navigation-search-input"].navbar-search',
    '#navbar-search-input',
    `${RIGHT_NAV_GROUP_SELECTOR} > .age-bracket-label.text-header`,
    `${RIGHT_NAV_GROUP_SELECTOR} > li#rovalra-qol-toggle`,
    `${RIGHT_NAV_GROUP_SELECTOR} > li#${BUTTON_ITEM_ID}`,
    `${RIGHT_NAV_GROUP_SELECTOR} > li#navbar-stream`,
    `${RIGHT_NAV_GROUP_SELECTOR} > li#navbar-robux`,
    `${RIGHT_NAV_GROUP_SELECTOR} > li#navbar-settings`,
].join(', ');
const DEFAULT_ORDER = [
    'logo',
    'charts',
    'marketplace',
    'create',
    'robux',
    'search',
    'profile',
    'qol',
    'topbarLayout',
    'notifications',
    'robuxBalance',
    'settings',
];
const SUPPORTED_ITEM_IDS = new Set(DEFAULT_ORDER);
const DEFAULT_LOCALE = {
    empty: 'RoValra was unable to find any supported topbar items.',
    reset: 'Reset',
    save: 'Save',
    overlayTitle: 'Topbar Layout',
    button: 'Topbar Layout',
    disabled: 'Required',
    show: 'Show',
    hide: 'Hide',
    labels: {
        logo: 'Roblox Logo',
        charts: 'Charts',
        marketplace: 'Marketplace',
        create: 'Create',
        robux: 'Robux',
        search: 'Search',
        profile: 'Profile',
        qol: 'Status',
        topbarLayout: 'Topbar Layout',
        notifications: 'Notifications',
        robuxBalance: 'Robux Balance',
        settings: 'Settings',
    },
};

let savedOrder = [];
let hiddenTopbarKeys = [];
let originalOrder = [];
let hasSavedLayout = false;
let currentTopbarRoot = null;
let initialized = false;
let observersInitialized = false;
let topbarLayoutEnabled = false;
let topbarUpdateFrame = 0;
let topbarItemObserver = null;
let topbarResizeObservers = new Map();
let locale = { ...DEFAULT_LOCALE };

async function loadLocale() {
    try {
        locale = {
            empty: await t('topbarLayout.empty'),
            reset: await t('topbarLayout.reset'),
            save: await t('topbarLayout.save'),
            overlayTitle: await t('topbarLayout.overlayTitle'),
            button: await t('topbarLayout.button'),
            disabled: await t('topbarLayout.disabled'),
            show: await t('topbarLayout.show'),
            hide: await t('topbarLayout.hide'),
            labels: {
                logo: await t('topbarLayout.labels.logo'),
                charts: await t('topbarLayout.labels.charts'),
                marketplace: await t('topbarLayout.labels.marketplace'),
                create: await t('topbarLayout.labels.create'),
                robux: await t('topbarLayout.labels.robux'),
                search: await t('topbarLayout.labels.search'),
                profile: await t('topbarLayout.labels.profile'),
                qol: await t('topbarLayout.labels.qol'),
                topbarLayout: await t('topbarLayout.labels.topbarLayout'),
                notifications: await t('topbarLayout.labels.notifications'),
                robuxBalance: await t('topbarLayout.labels.robuxBalance'),
                settings: await t('topbarLayout.labels.settings'),
            },
        };
    } catch {
        locale = { ...DEFAULT_LOCALE };
    }
}

function normalizeTopbarPath(pathname) {
    const normalized = pathname
        .toLowerCase()
        .replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');

    return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function normalizeOrder(value) {
    const order = [];
    const seen = new Set();

    if (Array.isArray(value)) {
        value.forEach((id) => {
            const key = String(id);
            if (!SUPPORTED_ITEM_IDS.has(key) || seen.has(key)) return;
            seen.add(key);
            order.push(key);
        });
    }

    DEFAULT_ORDER.forEach((id) => {
        if (!seen.has(id)) order.push(id);
    });

    return order;
}

function normalizeHiddenKeys(value) {
    const hidden = [];
    const seen = new Set();

    if (!Array.isArray(value)) return hidden;

    value.forEach((id) => {
        const key = String(id);
        if (
            !SUPPORTED_ITEM_IDS.has(key) ||
            REQUIRED_ITEM_IDS.has(key) ||
            seen.has(key)
        ) {
            return;
        }
        seen.add(key);
        hidden.push(key);
    });

    return hidden;
}

function getPrimaryNavItem(primaryNav, link) {
    let item = link;

    while (item?.parentElement && item.parentElement !== primaryNav) {
        item = item.parentElement;
    }

    return item?.parentElement === primaryNav ? item : null;
}

function getSupportedLinkId(link) {
    const href = link.getAttribute('href');
    if (!href) return null;

    let url;
    try {
        url = new URL(href, window.location.origin);
    } catch {
        return null;
    }

    const path = normalizeTopbarPath(url.pathname);
    const isRobloxHost = url.hostname === window.location.hostname;

    if (isRobloxHost && (path === '/charts' || path === '/discover')) {
        return 'charts';
    }
    if (isRobloxHost && (path === '/catalog' || path === '/marketplace')) {
        return 'marketplace';
    }
    if (isRobloxHost && (path === '/upgrades/robux' || path === '/robux')) {
        return 'robux';
    }
    if (
        url.hostname === 'create.roblox.com' ||
        (isRobloxHost && (path === '/develop' || path === '/create'))
    ) {
        return 'create';
    }

    return null;
}

function addTopbarItem(items, usedIds, id, element, options = {}) {
    if (!SUPPORTED_ITEM_IDS.has(id) || usedIds.has(id)) return;
    if (!(element instanceof HTMLElement) || !element.isConnected) return;

    usedIds.add(id);
    items.push({
        key: id,
        label: locale.labels[id] || id,
        element,
        disabled: options.disabled === true,
    });
}

function getSearchElement(topbarRoot) {
    const input =
        topbarRoot.querySelector('#navbar-search-input') ||
        topbarRoot.querySelector(
            '[data-testid="navigation-search-input-field"][type="search"]',
        );
    if (!input) return null;

    return (
        input.closest('[data-testid="navigation-search-input"].navbar-search') ||
        input.closest('.navbar-search') ||
        input.closest('form[name="search-form"]')
    );
}

function getLogoElement(topbarRoot) {
    const logoContainer = topbarRoot.querySelector(':scope > .rbx-navbar-header');
    if (!logoContainer?.querySelector('#nav-logo-link[href]')) return null;
    return logoContainer;
}

function getRightNavGroup(topbarRoot) {
    return topbarRoot.querySelector(RIGHT_NAV_GROUP_SELECTOR);
}

function getProfileElement(rightNavGroup) {
    const profileElement = rightNavGroup?.querySelector(
        ':scope > .age-bracket-label.text-header',
    );
    if (
        !profileElement?.querySelector(
            'a[href*="/users/"][href*="/profile"] .avatar',
        )
    ) {
        return null;
    }

    return profileElement;
}

function getNotificationsElement(rightNavGroup) {
    const notificationsElement = rightNavGroup?.querySelector(
        ':scope > li#navbar-stream.navbar-stream',
    );
    if (
        !notificationsElement?.querySelector(
            '#common-notification-bell, #nav-ns-icon',
        )
    ) {
        return null;
    }

    return notificationsElement;
}

function getRobuxBalanceElement(rightNavGroup) {
    return rightNavGroup?.querySelector(':scope > li#navbar-robux');
}

function getSettingsElement(rightNavGroup) {
    const settingsElement = rightNavGroup?.querySelector(
        ':scope > li#navbar-settings',
    );
    if (
        !settingsElement?.querySelector(
            '#nav-settings, .btn-navigation-nav-settings-md',
        )
    ) {
        return null;
    }

    return settingsElement;
}

function getQolElement(rightNavGroup) {
    return rightNavGroup?.querySelector(':scope > li#rovalra-qol-toggle');
}

function compareDocumentOrder(left, right) {
    if (left.element === right.element) return 0;

    const position = left.element.compareDocumentPosition(right.element);
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    return 0;
}

function compareRenderedTopbarOrder(left, right) {
    const leftRect = left.element.getBoundingClientRect();
    const rightRect = right.element.getBoundingClientRect();
    const leftVisible = leftRect.width > 0 && leftRect.height > 0;
    const rightVisible = rightRect.width > 0 && rightRect.height > 0;

    if (leftVisible && rightVisible) {
        const leftDelta = leftRect.left - rightRect.left;
        if (Math.abs(leftDelta) > 0.5) return leftDelta;

        const topDelta = leftRect.top - rightRect.top;
        if (Math.abs(topDelta) > 0.5) return topDelta;
    }

    return compareDocumentOrder(left, right);
}

function getTopbarItems(topbarRoot = currentTopbarRoot) {
    if (!topbarRoot?.isConnected) return [];

    const items = [];
    const usedIds = new Set();
    const primaryNav = topbarRoot.querySelector(DESKTOP_PRIMARY_NAV_SELECTOR);
    const logoElement = getLogoElement(topbarRoot);
    if (logoElement) addTopbarItem(items, usedIds, 'logo', logoElement);

    if (primaryNav) {
        primaryNav.querySelectorAll('a[href]').forEach((link) => {
            const id = getSupportedLinkId(link);
            if (!id) return;

            const item = getPrimaryNavItem(primaryNav, link);
            if (!item) return;

            addTopbarItem(items, usedIds, id, item);
        });
    }

    const searchElement = getSearchElement(topbarRoot);
    if (searchElement) addTopbarItem(items, usedIds, 'search', searchElement);

    const rightNavGroup = getRightNavGroup(topbarRoot);
    addTopbarItem(items, usedIds, 'profile', getProfileElement(rightNavGroup));
    addTopbarItem(items, usedIds, 'qol', getQolElement(rightNavGroup));
    addTopbarItem(
        items,
        usedIds,
        'topbarLayout',
        getTopbarLayoutButtonItem(),
        { disabled: true },
    );
    addTopbarItem(
        items,
        usedIds,
        'notifications',
        getNotificationsElement(rightNavGroup),
    );
    addTopbarItem(
        items,
        usedIds,
        'robuxBalance',
        getRobuxBalanceElement(rightNavGroup),
    );
    addTopbarItem(items, usedIds, 'settings', getSettingsElement(rightNavGroup));

    return items.sort(compareRenderedTopbarOrder);
}

function saveOriginalOrder(topbarItems) {
    const currentOrder = topbarItems.map((item) => item.key);

    if (hasSavedLayout) {
        currentOrder.forEach((key) => {
            if (!originalOrder.includes(key)) originalOrder.push(key);
        });
        return;
    }

    const currentKeys = new Set(currentOrder);
    originalOrder = [
        ...currentOrder,
        ...originalOrder.filter((key) => !currentKeys.has(key)),
    ];
}

function getOrderedTopbarItems(topbarItems) {
    const order = savedOrder.length ? savedOrder : originalOrder;
    const orderIndex = new Map(order.map((key, index) => [key, index]));
    const originalIndex = new Map(
        topbarItems.map((item, index) => [item.key, index]),
    );

    return [...topbarItems].sort((left, right) => {
        const leftIndex = orderIndex.get(left.key);
        const rightIndex = orderIndex.get(right.key);

        if (leftIndex !== undefined && rightIndex !== undefined) {
            return leftIndex - rightIndex;
        }
        if (leftIndex !== undefined) return -1;
        if (rightIndex !== undefined) return 1;
        return originalIndex.get(left.key) - originalIndex.get(right.key);
    });
}

function cleanupTopbarLayout(root = document) {
    root.querySelectorAll(`#right-navigation-header.${SEARCH_MOVED_CLASS}`).forEach(
        (element) => {
            element.classList.remove(SEARCH_MOVED_CLASS);
            element.removeAttribute('data-rovalra-topbar-layout-search-edge');
            element.style.removeProperty(
                '--rovalra-topbar-layout-search-left',
            );
            element.style.removeProperty(
                '--rovalra-topbar-layout-search-right',
            );
        },
    );

    root.querySelectorAll(
        [
            '[data-rovalra-topbar-layout-key]',
            '[data-rovalra-topbar-layout-managed-sibling]',
            '[data-rovalra-topbar-layout-managed-transform]',
            '.rovalra-topbar-layout-hidden',
        ].join(', '),
    ).forEach((element) => {
        const originalTransform =
            element.dataset.rovalraTopbarLayoutOriginalTransform;

        element.classList.remove('rovalra-topbar-layout-hidden');
        element.style.removeProperty('order');
        if (originalTransform !== undefined) {
            if (originalTransform) {
                element.style.transform = originalTransform;
            } else {
                element.style.removeProperty('transform');
            }
        }
        delete element.dataset.rovalraTopbarLayoutKey;
        delete element.dataset.rovalraTopbarLayoutEdge;
        delete element.dataset.rovalraTopbarLayoutManagedSibling;
        delete element.dataset.rovalraTopbarLayoutManagedTransform;
        delete element.dataset.rovalraTopbarLayoutOriginalTransform;
    });
}

function disconnectTopbarResizeObservers() {
    topbarResizeObservers.forEach((observer) => observer.unobserve());
    topbarResizeObservers = new Map();
}

function refreshTopbarResizeObservers(topbarRoot, topbarItems) {
    if (!topbarRoot?.isConnected) {
        disconnectTopbarResizeObservers();
        return;
    }

    const observedElements = new Set([
        topbarRoot,
        topbarRoot.querySelector(DESKTOP_PRIMARY_NAV_SELECTOR),
        getRightNavGroup(topbarRoot),
        getTopbarLayoutButtonItem(),
        getTopbarLayoutButton(),
        ...topbarItems.map((item) => item.element),
    ]);
    observedElements.delete(null);

    topbarResizeObservers.forEach((observer, element) => {
        if (observedElements.has(element) && element.isConnected) return;

        observer.unobserve();
        topbarResizeObservers.delete(element);
    });

    observedElements.forEach((element) => {
        if (topbarResizeObservers.has(element)) return;

        topbarResizeObservers.set(
            element,
            observeResize(element, () => scheduleTopbarLayoutUpdate(topbarRoot)),
        );
    });
}

function isVisibleTopbarElement(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function hasUnexpectedRightNavSiblings(searchElement) {
    const parent = searchElement?.parentElement;
    if (!(parent instanceof HTMLElement)) return false;

    return Array.from(parent.children).some((child) => {
        if (child === searchElement) return false;
        if (child.id === BUTTON_ID) return false;
        if (!isVisibleTopbarElement(child)) return false;
        if (child.matches('.search-overlay')) return false;
        if (child.matches('.navbar-right.rbx-navbar-right')) return false;
        return true;
    });
}

function getTopbarLayoutButton() {
    return document.getElementById(BUTTON_ID);
}

function getTopbarLayoutButtonItem() {
    return document.getElementById(BUTTON_ITEM_ID);
}

function createTopbarFlowEntry(element, itemByElement) {
    if (element?.id === BUTTON_ID) {
        return null;
    }
    if (!isVisibleTopbarElement(element)) return null;

    const item = itemByElement.get(element);
    const rect = element.getBoundingClientRect();

    return {
        type: item ? 'supported' : 'unknown',
        item,
        element,
        rect,
        layoutRight: rect.right,
    };
}

function getTopbarFlowEntries(topbarRoot, itemByElement, topbarItems) {
    const entries = [];
    const logoElement = getLogoElement(topbarRoot);
    const logoEntry = createTopbarFlowEntry(logoElement, itemByElement);
    if (logoEntry) entries.push(logoEntry);

    const primaryNav = topbarRoot.querySelector(DESKTOP_PRIMARY_NAV_SELECTOR);
    if (primaryNav) {
        Array.from(primaryNav.children).forEach((element) => {
            const entry = createTopbarFlowEntry(element, itemByElement);
            if (entry) entries.push(entry);
        });
    }

    const searchItem = topbarItems.find((item) => item.key === 'search');
    if (
        searchItem &&
        isVisibleTopbarElement(searchItem.element) &&
        !hasUnexpectedRightNavSiblings(searchItem.element)
    ) {
        const entry = createTopbarFlowEntry(searchItem.element, itemByElement);
        if (entry) entries.push(entry);
    }

    const rightNavGroup = getRightNavGroup(topbarRoot);
    if (rightNavGroup) {
        Array.from(rightNavGroup.children).forEach((element) => {
            const entry = createTopbarFlowEntry(element, itemByElement);
            if (entry) entries.push(entry);
        });
    }

    return entries.sort((left, right) => left.rect.left - right.rect.left);
}

function getDropdownEdge(key, targetX, width) {
    if (!DROPDOWN_ITEM_KEYS.has(key)) return null;

    const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth;
    const dropdownWidth = Math.min(
        DROPDOWN_WIDTH_BY_KEY[key] || 280,
        viewportWidth - DROPDOWN_EDGE_MARGIN * 2,
    );
    const centeredLeft = targetX + width / 2 - dropdownWidth / 2;
    const centeredRight = centeredLeft + dropdownWidth;

    if (centeredLeft < DROPDOWN_EDGE_MARGIN) return 'left';
    if (centeredRight > viewportWidth - DROPDOWN_EDGE_MARGIN) return 'right';
    return 'center';
}

function setSearchMovedState(searchElement, isMoved, edge, targetX, width) {
    const searchRoot = searchElement?.closest('#right-navigation-header');
    if (!searchRoot) return;

    searchRoot.classList.toggle(SEARCH_MOVED_CLASS, isMoved);

    if (!isMoved) {
        searchRoot.removeAttribute('data-rovalra-topbar-layout-search-edge');
        searchRoot.style.removeProperty('--rovalra-topbar-layout-search-left');
        searchRoot.style.removeProperty('--rovalra-topbar-layout-search-right');
        return;
    }

    const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth;
    searchRoot.dataset.rovalraTopbarLayoutSearchEdge = edge;
    searchRoot.style.setProperty(
        '--rovalra-topbar-layout-search-left',
        `${Math.max(DROPDOWN_EDGE_MARGIN, targetX)}px`,
    );
    searchRoot.style.setProperty(
        '--rovalra-topbar-layout-search-right',
        `${Math.max(DROPDOWN_EDGE_MARGIN, viewportWidth - targetX - width)}px`,
    );
}

function writeTopbarTransform(element, originalTransform, deltaX) {
    if (Math.abs(deltaX) <= 0.5) {
        if (originalTransform) {
            element.style.transform = originalTransform;
        } else {
            element.style.removeProperty('transform');
        }
        return;
    }

    const topbarTransform = `translateX(${deltaX}px)`;
    element.style.transform = originalTransform
        ? `${originalTransform} ${topbarTransform}`
        : topbarTransform;
}

function setTopbarDropdownState(item, targetX) {
    if (!DROPDOWN_ITEM_KEYS.has(item.key)) {
        delete item.element.dataset.rovalraTopbarLayoutEdge;
        return;
    }

    const width = item.element.getBoundingClientRect().width;
    const edge = getDropdownEdge(item.key, targetX, width);
    if (edge) {
        item.element.dataset.rovalraTopbarLayoutEdge = edge;
    } else {
        delete item.element.dataset.rovalraTopbarLayoutEdge;
    }
}

function applyTopbarTransform(element, targetX) {
    const rect = element.getBoundingClientRect();
    const deltaX = targetX - rect.left;

    if (!element.dataset.rovalraTopbarLayoutManagedTransform) {
        element.dataset.rovalraTopbarLayoutOriginalTransform =
            element.style.transform || '';
    }

    element.dataset.rovalraTopbarLayoutManagedTransform = 'true';
    const originalTransform =
        element.dataset.rovalraTopbarLayoutOriginalTransform || '';
    let appliedDeltaX = deltaX;

    writeTopbarTransform(element, originalTransform, appliedDeltaX);

    const adjustedRect = element.getBoundingClientRect();
    const correction = targetX - adjustedRect.left;
    if (Math.abs(correction) > 0.5) {
        appliedDeltaX += correction;
        writeTopbarTransform(element, originalTransform, appliedDeltaX);
    }

    return Math.abs(appliedDeltaX) > 0.5;
}

function applyTopbarFlowSegment(segment) {
    if (segment.length < 2) return;

    const orderedItems = getOrderedTopbarItems(
        segment.map((entry) => entry.item),
    );
    const spacerGapIndex = getTopbarSpacerGapIndex(orderedItems);
    const rawGaps = segment.map((entry, index) => {
        const nextEntry = segment[index + 1];
        if (!nextEntry) return 0;

        return Math.max(0, nextEntry.rect.left - entry.layoutRight);
    });
    const compactGaps = rawGaps.map((gap) => Math.min(gap, MAX_COMPACT_GAP));
    const gaps =
        spacerGapIndex === null ? rawGaps : distributeTopbarFlexibleGap(
            rawGaps,
            compactGaps,
            spacerGapIndex,
        );
    let targetX = segment[0].rect.left;

    orderedItems.forEach((item, index) => {
        const appliedTargetX = Math.max(0, targetX);
        const isMoved = applyTopbarTransform(item.element, appliedTargetX);
        if (item.key === 'search') {
            const width = item.element.getBoundingClientRect().width;
            const edge = getDropdownEdge(item.key, appliedTargetX, width);
            item.element.dataset.rovalraTopbarLayoutEdge = edge;
            setSearchMovedState(
                item.element,
                isMoved,
                edge,
                appliedTargetX,
                width,
            );
        } else {
            setTopbarDropdownState(item, appliedTargetX);
        }
        targetX =
            appliedTargetX +
            item.element.getBoundingClientRect().width +
            gaps[index];
    });
}

function distributeTopbarFlexibleGap(rawGaps, compactGaps, spacerGapIndex) {
    const rawTotal = rawGaps.reduce((total, gap) => total + gap, 0);
    const compactTotal = compactGaps.reduce((total, gap) => total + gap, 0);
    const flexibleGap = Math.max(0, rawTotal - compactTotal);
    const gaps = [...compactGaps];
    gaps[spacerGapIndex] += flexibleGap;

    return gaps;
}

function getTopbarSpacerGapIndex(orderedItems) {
    if (RIGHT_FLOW_ITEM_KEYS.has(orderedItems[orderedItems.length - 1]?.key)) {
        for (let index = orderedItems.length - 2; index >= 0; index -= 1) {
            if (!RIGHT_FLOW_ITEM_KEYS.has(orderedItems[index].key)) {
                return index;
            }
        }
    }

    let seenLeftItem = false;

    for (let index = 0; index < orderedItems.length; index += 1) {
        const item = orderedItems[index];
        if (LEFT_FLOW_ITEM_KEYS.has(item.key)) {
            seenLeftItem = true;
            continue;
        }

        if (seenLeftItem && RIGHT_FLOW_ITEM_KEYS.has(item.key)) {
            return Math.max(0, index - 1);
        }
    }

    let seenRightItem = false;

    for (let index = 0; index < orderedItems.length; index += 1) {
        const item = orderedItems[index];
        if (RIGHT_FLOW_ITEM_KEYS.has(item.key)) {
            seenRightItem = true;
            continue;
        }

        if (seenRightItem && LEFT_FLOW_ITEM_KEYS.has(item.key)) {
            return Math.max(0, index - 1);
        }
    }

    return null;
}

function applyTopbarFlowEntries(entries) {
    let segment = [];

    entries.forEach((entry) => {
        if (entry.type === 'supported') {
            segment.push(entry);
            return;
        }

        applyTopbarFlowSegment(segment);
        segment = [];
    });

    applyTopbarFlowSegment(segment);
}

function applyTopbarVisualOrder(topbarRoot, topbarItems) {
    const itemByElement = new Map(
        topbarItems.map((item) => [item.element, item]),
    );
    const entries = getTopbarFlowEntries(
        topbarRoot,
        itemByElement,
        topbarItems,
    );
    applyTopbarFlowEntries(entries);
}

function applyTopbarLayout(topbarRoot = currentTopbarRoot) {
    if (!topbarRoot?.isConnected) return;

    addTopbarLayoutButton(topbarRoot);
    cleanupTopbarLayout(topbarRoot);
    const topbarItems = getTopbarItems(topbarRoot);
    refreshTopbarResizeObservers(topbarRoot, topbarItems);
    saveOriginalOrder(topbarItems);

    if (!topbarLayoutEnabled || !hasSavedLayout) {
        return;
    }

    const hiddenItems = new Set(hiddenTopbarKeys);

    topbarItems.forEach((item) => {
        item.element.dataset.rovalraTopbarLayoutKey = item.key;
        item.element.classList.toggle(
            'rovalra-topbar-layout-hidden',
            hiddenItems.has(item.key),
        );
    });
    applyTopbarVisualOrder(topbarRoot, topbarItems);
}

function scheduleTopbarLayoutUpdate(topbarRoot = currentTopbarRoot) {
    if (topbarRoot) currentTopbarRoot = topbarRoot;
    if (topbarUpdateFrame) return;

    topbarUpdateFrame = requestAnimationFrame(() => {
        topbarUpdateFrame = 0;
        if (!currentTopbarRoot?.isConnected) return;
        applyTopbarLayout(currentTopbarRoot);
    });
}

function mergeSavedOrder(editedOrder) {
    const editedIds = editedOrder.filter((id) => SUPPORTED_ITEM_IDS.has(id));
    const editedSet = new Set(editedIds);
    const previousOrder = savedOrder.length
        ? savedOrder
        : normalizeOrder(originalOrder);

    return [
        ...editedIds,
        ...previousOrder.filter((id) => !editedSet.has(id)),
    ];
}

function createTopbarIcon(assetName) {
    return createLayoutIcon(assetName, 'rovalra-topbar-layout');
}

function createTopbarLayoutBody(topbarItems, nextHiddenKeys) {
    return createLayoutEditorBody({
        items: hasSavedLayout ? getOrderedTopbarItems(topbarItems) : topbarItems,
        nextHiddenKeys,
        locale,
        classNamePrefix: 'rovalra-topbar-layout',
        datasetKey: 'topbarKey',
    });
}

function openTopbarLayoutOverlay() {
    const topbarRoot =
        currentTopbarRoot?.isConnected
            ? currentTopbarRoot
            : document.querySelector(TOPBAR_ROOT_SELECTOR);
    const topbarItems = getTopbarItems(topbarRoot);
    saveOriginalOrder(topbarItems);
    const nextHiddenKeys = new Set(hiddenTopbarKeys);
    const { container, list, cleanup } = createTopbarLayoutBody(
        topbarItems,
        nextHiddenKeys,
    );
    let overlayHandle = null;

    const resetButton = createButton(locale.reset, 'secondary', {
        disabled: !hasSavedLayout,
        onClick: () => {
            chrome.storage.local.remove(
                [ORDER_STORAGE_KEY, HIDDEN_STORAGE_KEY],
                () => {
                    hasSavedLayout = false;
                    savedOrder = [];
                    hiddenTopbarKeys = [];
                    cleanupTopbarLayout();
                    applyTopbarLayout();
                    overlayHandle?.close();
                },
            );
        },
    });

    const saveButton = createButton(locale.save, 'primary', {
        disabled: !list,
        onClick: () => {
            if (!list) return;

            const editedOrder = Array.from(
                list.querySelectorAll('.rovalra-topbar-layout-item'),
            ).map((item) => item.dataset.topbarKey);
            savedOrder = mergeSavedOrder(editedOrder);
            hiddenTopbarKeys = normalizeHiddenKeys(Array.from(nextHiddenKeys));
            hasSavedLayout = true;
            chrome.storage.local.set(
                {
                    [ORDER_STORAGE_KEY]: savedOrder,
                    [HIDDEN_STORAGE_KEY]: hiddenTopbarKeys,
                },
                () => {
                    applyTopbarLayout();
                    overlayHandle?.close();
                },
            );
        },
    });

    overlayHandle = createOverlay({
        title: locale.overlayTitle,
        bodyContent: container,
        actions: [resetButton, saveButton],
        maxWidth: '620px',
        onClose: cleanup,
    });
}

function getOrCreateTopbarLayoutButton() {
    const existingButton = getTopbarLayoutButton();
    if (existingButton) return existingButton;

    const button = createSquareButton({
        content: createTopbarIcon('edit'),
        id: BUTTON_ID,
        width: '32px',
        height: 'height-1000',
        paddingX: 'padding-x-none',
        radius: 'radius-medium',
        disableTextTruncation: true,
        onClick: openTopbarLayoutOverlay,
    });
    button.classList.add('rovalra-topbar-layout-button');
    button.classList.remove('bg-action-standard', 'content-action-standard');
    button.classList.add('bg-none', 'content-emphasis');
    button.setAttribute('aria-label', locale.button);
    addTooltip(button, () => locale.button, {
        position: 'bottom',
        showArrow: false,
    });

    return button;
}

function getOrCreateTopbarLayoutButtonItem() {
    const existingItem = getTopbarLayoutButtonItem();
    if (existingItem) {
        ensureSingleTopbarLayoutButton(existingItem);
        return existingItem;
    }

    const buttonItem = document.createElement('li');
    buttonItem.id = BUTTON_ITEM_ID;
    buttonItem.className =
        'navbar-icon-item rovalra-topbar-layout-button-item';
    ensureSingleTopbarLayoutButton(buttonItem);

    return buttonItem;
}

function ensureSingleTopbarLayoutButton(buttonItem) {
    const buttons = Array.from(buttonItem.querySelectorAll(`#${BUTTON_ID}`));
    const button = buttons[0] || getOrCreateTopbarLayoutButton();

    buttons.slice(1).forEach((duplicateButton) => duplicateButton.remove());
    if (button.parentElement !== buttonItem) {
        buttonItem.appendChild(button);
    }

    return button;
}

function addTopbarLayoutButton(topbarRoot = currentTopbarRoot) {
    if (!topbarLayoutEnabled) return;

    const rightNavGroup = getRightNavGroup(topbarRoot);
    const qolElement = getQolElement(rightNavGroup);
    if (!(rightNavGroup instanceof HTMLElement)) return;

    const buttonItem = getOrCreateTopbarLayoutButtonItem();
    ensureSingleTopbarLayoutButton(buttonItem);
    const fallbackElement =
        getNotificationsElement(rightNavGroup) ||
        getRobuxBalanceElement(rightNavGroup) ||
        getSettingsElement(rightNavGroup) ||
        null;
    const nextElement = qolElement?.nextSibling || fallbackElement;

    if (buttonItem.parentElement !== rightNavGroup) {
        rightNavGroup.insertBefore(buttonItem, nextElement);
    } else if (qolElement && buttonItem.previousElementSibling !== qolElement) {
        rightNavGroup.insertBefore(buttonItem, nextElement);
    } else if (
        !qolElement &&
        fallbackElement !== buttonItem.nextElementSibling
    ) {
        rightNavGroup.insertBefore(buttonItem, fallbackElement);
    }
}

function removeTopbarLayoutButton() {
    getTopbarLayoutButtonItem()?.remove();
    document
        .querySelectorAll(`#${BUTTON_ID}`)
        .forEach((button) => button.remove());
}

function attachTopbarLayout(topbarRoot) {
    currentTopbarRoot = topbarRoot;
    topbarItemObserver?.disconnect();
    disconnectTopbarResizeObservers();
    topbarItemObserver = observeElement(
        TOPBAR_ITEM_RENDER_SELECTOR,
        () => scheduleTopbarLayoutUpdate(topbarRoot),
        { multiple: true, root: topbarRoot },
    );
    addTopbarLayoutButton(topbarRoot);
    scheduleTopbarLayoutUpdate(topbarRoot);
}

async function loadSavedLayout() {
    const data = await chrome.storage.local.get([
        ORDER_STORAGE_KEY,
        HIDDEN_STORAGE_KEY,
    ]);

    hasSavedLayout =
        Object.prototype.hasOwnProperty.call(data, ORDER_STORAGE_KEY) ||
        Object.prototype.hasOwnProperty.call(data, HIDDEN_STORAGE_KEY);
    savedOrder = hasSavedLayout ? normalizeOrder(data[ORDER_STORAGE_KEY]) : [];
    hiddenTopbarKeys = normalizeHiddenKeys(data[HIDDEN_STORAGE_KEY]);
}

function initializeStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        if (changes.topbarLayoutEnabled) {
            topbarLayoutEnabled =
                changes.topbarLayoutEnabled.newValue !== false;

            if (topbarLayoutEnabled) {
                addTopbarLayoutButton();
            } else {
                removeTopbarLayoutButton();
                cleanupTopbarLayout();
            }
            scheduleTopbarLayoutUpdate();
        }

        if (changes[ORDER_STORAGE_KEY] || changes[HIDDEN_STORAGE_KEY]) {
            loadSavedLayout().then(() => scheduleTopbarLayoutUpdate());
        }
    });
}

export async function init() {
    if (!initialized) {
        initialized = true;
        topbarLayoutEnabled = (await settings.topbarLayoutEnabled) !== false;

        await loadLocale();
        await loadSavedLayout();
        initializeStorageListener();
        window.addEventListener('resize', () => scheduleTopbarLayoutUpdate(), {
            passive: true,
        });
    }

    if (observersInitialized) return;
    observersInitialized = true;
    observeElement(TOPBAR_ROOT_SELECTOR, attachTopbarLayout);
}
