import { observeElement } from '../observer.js';
import { settings } from '../settings/getSettings.js';

const COMMUNITY_PATH = '/communities';
const STATE_SYNC_DELAYS = [0, 50, 150, 350, 750, 1200];
const SIDEBAR_COMMUNITY_SELECTOR = [
    '#left-navigation-container a[href*="/communities"]',
    '#navigation a[href*="/communities"]',
    '.navigation a[href*="/communities"]',
].join(', ');
const LINK_CLASS =
    'content-emphasis text-title-large flex items-center gap-small padding-left-xsmall padding-right-xxsmall radius-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none';

let lastObservedPath = window.location.pathname;
let locationWatcherStarted = false;

function normalizePath(href) {
    if (!href) return '';

    try {
        return new URL(href, window.location.origin).pathname;
    } catch {
        return '';
    }
}

function stripLocalePrefix(path) {
    return path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, '');
}

function matchesRoute(pathname, route) {
    const normalizedPath = stripLocalePrefix(pathname).toLowerCase();
    const normalizedRoute = route.toLowerCase();
    return (
        normalizedPath === normalizedRoute ||
        normalizedPath.startsWith(`${normalizedRoute}/`)
    );
}

function getSidebarContainer(anchor) {
    return anchor.closest('ul, ol, nav, [role="navigation"]');
}

function getSidebarItem(sidebar, link) {
    let current = link;

    while (current?.parentElement && current.parentElement !== sidebar) {
        current = current.parentElement;
    }

    return current?.parentElement === sidebar ? current : link.parentElement;
}

function stripClonedState(item) {
    [item, ...item.querySelectorAll('*')].forEach((element) => {
        element.removeAttribute('id');
        element.removeAttribute('aria-current');
        element.removeAttribute('aria-selected');

        [...element.attributes].forEach((attribute) => {
            if (attribute.name.startsWith('data-')) {
                element.removeAttribute(attribute.name);
            }
        });

        element.classList.remove(
            'active',
            'selected',
            'active-menu-item',
            'selected-menu-item',
            'router-link-active',
            'router-link-exact-active',
        );
    });
}

function findIconHost(link) {
    const directChildren = [...link.children];
    return (
        directChildren.find((child) =>
            child.querySelector('svg, [class*="icon"], [class*="Icon"]'),
        ) ||
        directChildren.find((child) =>
            child.className?.toString().toLowerCase().includes('icon'),
        ) ||
        directChildren.find((child) => !child.textContent.trim())
    );
}

function setLinkLabel(link, label) {
    const labelTarget = [...link.querySelectorAll('*')]
        .filter(
            (element) =>
                element.children.length === 0 && element.textContent.trim(),
        )
        .at(-1);

    if (labelTarget) {
        labelTarget.textContent = label;
        return;
    }

    const span = document.createElement('span');
    span.textContent = label;
    link.appendChild(span);
}

function clearInlineActiveStyles(item) {
    [item, ...item.querySelectorAll('*')].forEach((element) => {
        element.style.removeProperty('background');
        element.style.removeProperty('background-color');
        element.style.removeProperty('border-radius');
        element.style.removeProperty('color');
    });
}

function startLocationWatcher() {
    if (locationWatcherStarted) return;
    locationWatcherStarted = true;

    setInterval(() => {
        if (window.location.pathname === lastObservedPath) return;

        lastObservedPath = window.location.pathname;
        window.dispatchEvent(new Event('rovalra:locationchange'));
    }, 1000);
}

export function initSidebarLink({
    id,
    path,
    label,
    createIcon,
    settingKeys,
    legacySelectors = [],
}) {
    const itemSelector = `[data-rovalra-sidebar-item="${id}"]`;
    const linkSelector = `a[data-rovalra-sidebar-link="${id}"]`;
    const settingValues = new Map();
    let enabled = false;

    const getLabel = () => (typeof label === 'function' ? label() : label);

    const updateActiveState = (sidebar) => {
        const item = sidebar.querySelector(itemSelector);
        const link = sidebar.querySelector(linkSelector);
        if (!item || !link) return;

        stripClonedState(item);
        item.dataset.rovalraSidebarItem = id;
        link.dataset.rovalraSidebarLink = id;
        link.className = LINK_CLASS;

        if (matchesRoute(window.location.pathname, path)) {
            link.setAttribute('aria-current', 'page');
            link.classList.add('bg-surface-300');
        } else {
            clearInlineActiveStyles(item);
        }
    };

    const attachStateSync = (sidebar) => {
        const syncKey = `rovalraSidebarSync_${id.replace(/[^a-zA-Z0-9]/g, '')}`;
        if (sidebar.dataset[syncKey] === 'true') return;
        sidebar.dataset[syncKey] = 'true';

        const syncSoon = () => {
            STATE_SYNC_DELAYS.forEach((delay) => {
                if (delay === 0) {
                    requestAnimationFrame(() => updateActiveState(sidebar));
                    return;
                }

                setTimeout(() => updateActiveState(sidebar), delay);
            });
        };

        sidebar.addEventListener('click', syncSoon, true);
        window.addEventListener('popstate', syncSoon);
        window.addEventListener('rovalra:locationchange', syncSoon);
    };

    const createItem = (sidebar, communityLink) => {
        const templateItem = getSidebarItem(sidebar, communityLink);
        if (!templateItem) return null;

        const item = templateItem.cloneNode(true);
        const link = item.querySelector('a[href]');
        if (!link) return null;

        stripClonedState(item);
        link.className = LINK_CLASS;

        const iconHost = findIconHost(link);
        if (iconHost) {
            iconHost.replaceChildren(createIcon());
        } else {
            link.prepend(createIcon());
        }

        setLinkLabel(link, getLabel());
        link.setAttribute('href', path);
        link.dataset.rovalraSidebarLink = id;
        item.dataset.rovalraSidebarItem = id;

        return item;
    };

    const insertLink = (communityLink) => {
        if (!enabled) return;
        if (!matchesRoute(normalizePath(communityLink.href), COMMUNITY_PATH)) {
            return;
        }

        const sidebar = getSidebarContainer(communityLink);
        if (!sidebar) return;

        const existing = sidebar.querySelector(
            [linkSelector, ...legacySelectors].join(', '),
        );
        if (existing) {
            updateActiveState(sidebar);
            attachStateSync(sidebar);
            return;
        }

        const communityItem = getSidebarItem(sidebar, communityLink);
        const newItem = createItem(sidebar, communityLink);
        if (!communityItem || !newItem) return;

        communityItem.insertAdjacentElement('afterend', newItem);
        updateActiveState(sidebar);
        attachStateSync(sidebar);
    };

    const refresh = () => {
        enabled = settingKeys.every((key) => settingValues.get(key) === true);

        if (enabled) {
            document
                .querySelectorAll(SIDEBAR_COMMUNITY_SELECTOR)
                .forEach(insertLink);
        } else {
            document
                .querySelectorAll(itemSelector)
                .forEach((item) => item.remove());
        }
    };

    (async () => {
        startLocationWatcher();

        for (const key of settingKeys) {
            settingValues.set(key, await settings[key]);
        }
        refresh();

        observeElement(SIDEBAR_COMMUNITY_SELECTOR, insertLink, {
            multiple: true,
        });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            const changedKeys = settingKeys.filter((key) => changes[key]);
            if (!changedKeys.length) return;

            changedKeys.forEach((key) =>
                settingValues.set(key, changes[key].newValue),
            );
            refresh();
        });
    })().catch((error) => {
        console.error(
            `RoValra: Failed to initialize sidebar link ${id}.`,
            error,
        );
    });
}
