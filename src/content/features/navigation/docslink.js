import { observeElement } from '../../core/observer.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const COMMUNITY_PATH = '/communities';
const DOCS_PATH = '/docs';
const OLD_API_DOCS_STORAGE_KEY = 'EnableRobloxApiDocs';
const STATE_SYNC_DELAYS = [0, 50, 150, 350, 750, 1200];
const SIDEBAR_COMMUNITY_SELECTOR = [
    '#left-navigation-container a[href*="/communities"]',
    '#navigation a[href*="/communities"]',
    '.navigation a[href*="/communities"]',
].join(', ');

let lastObservedPath = window.location.pathname;
let sidebarLinkEnabled = false;

function cleanupOldApiDocsStorage() {
    chrome.storage.local.get(
        [OLD_API_DOCS_STORAGE_KEY, 'rovalra_settings'],
        (result) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    result,
                    OLD_API_DOCS_STORAGE_KEY,
                )
            ) {
                chrome.storage.local.remove(OLD_API_DOCS_STORAGE_KEY);
            }

            const settingsData = result.rovalra_settings;
            if (
                !settingsData ||
                !Object.prototype.hasOwnProperty.call(
                    settingsData,
                    OLD_API_DOCS_STORAGE_KEY,
                )
            ) {
                return;
            }

            const nextSettingsData = { ...settingsData };
            delete nextSettingsData[OLD_API_DOCS_STORAGE_KEY];
            chrome.storage.local.set({ rovalra_settings: nextSettingsData });
        },
    );
}

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
    const normalizedPath = stripLocalePrefix(pathname);
    return normalizedPath === route || normalizedPath.startsWith(`${route}/`);
}

function createDocsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('MuiSvgIcon-root', 'MuiSvgIcon-fontSizeMedium');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.style.width = '20px';
    svg.style.height = '20px';
    svg.style.display = 'block';
    svg.style.fill = 'currentColor';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
        'd',
        'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z',
    );
    path.setAttribute('fill', 'currentColor');

    svg.appendChild(path);
    return svg;
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

function createDocsItem(sidebar, communityLink, label) {
    const templateItem = getSidebarItem(sidebar, communityLink);
    if (!templateItem) return null;

    const item = templateItem.cloneNode(true);
    const link = item.querySelector('a[href]');
    if (!link) return null;

    stripClonedState(item);

    link.className =
        'content-emphasis text-title-large flex items-center gap-small padding-left-xsmall padding-right-xxsmall radius-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none';

    const iconHost = findIconHost(link);
    if (iconHost) {
        iconHost.replaceChildren(createDocsIcon());
    } else {
        link.prepend(createDocsIcon());
    }

    setLinkLabel(link, label);
    link.setAttribute('href', DOCS_PATH);
    link.dataset.rovalraDocsLink = 'true';
    item.dataset.rovalraDocsItem = 'true';

    return item;
}

function clearInlineActiveStyles(item) {
    [item, ...item.querySelectorAll('*')].forEach((element) => {
        element.style.removeProperty('background');
        element.style.removeProperty('background-color');
        element.style.removeProperty('border-radius');
        element.style.removeProperty('color');
    });
}

function updateDocsActiveState(sidebar) {
    const item = sidebar.querySelector('[data-rovalra-docs-item="true"]');
    const link = sidebar.querySelector('a[data-rovalra-docs-link="true"]');
    if (!item || !link) return;

    stripClonedState(item);
    item.dataset.rovalraDocsItem = 'true';
    link.dataset.rovalraDocsLink = 'true';

    link.className =
        'content-emphasis text-title-large flex items-center gap-small padding-left-xsmall padding-right-xxsmall radius-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none';

    if (matchesRoute(window.location.pathname, DOCS_PATH)) {
        link.setAttribute('aria-current', 'page');
        link.classList.add('bg-surface-300');
    } else {
        clearInlineActiveStyles(item);
    }
}

function attachSidebarStateSync(sidebar) {
    if (sidebar.dataset.rovalraDocsStateSync === 'true') return;
    sidebar.dataset.rovalraDocsStateSync = 'true';

    const syncSoon = () => {
        STATE_SYNC_DELAYS.forEach((delay) => {
            if (delay === 0) {
                requestAnimationFrame(() => updateDocsActiveState(sidebar));
                return;
            }

            setTimeout(() => updateDocsActiveState(sidebar), delay);
        });
    };

    sidebar.addEventListener('click', syncSoon, true);
    window.addEventListener('popstate', syncSoon);
    window.addEventListener('rovalra:locationchange', syncSoon);
}

function initLocationChangeWatcher() {
    if (initLocationChangeWatcher._run) return;
    initLocationChangeWatcher._run = true;

    setInterval(() => {
        if (window.location.pathname === lastObservedPath) return;

        lastObservedPath = window.location.pathname;
        window.dispatchEvent(new Event('rovalra:locationchange'));
    }, 1000);
}

function insertDocsLink(communityLink, label) {
    if (!sidebarLinkEnabled) return;

    if (!matchesRoute(normalizePath(communityLink.href), COMMUNITY_PATH)) {
        return;
    }

    const sidebar = getSidebarContainer(communityLink);
    if (!sidebar) return;

    const existing = sidebar.querySelector(
        'a[data-rovalra-docs-link="true"], a[href="/docs"]',
    );
    if (existing) {
        updateDocsActiveState(sidebar);
        attachSidebarStateSync(sidebar);
        return;
    }

    const communityItem = getSidebarItem(sidebar, communityLink);
    const docsItem = createDocsItem(sidebar, communityLink, label);
    if (!communityItem || !docsItem) return;

    communityItem.insertAdjacentElement('afterend', docsItem);
    updateDocsActiveState(sidebar);
    attachSidebarStateSync(sidebar);
}

function removeDocsLinks() {
    document
        .querySelectorAll('[data-rovalra-docs-item="true"]')
        .forEach((item) => item.remove());
}

function addDocsLinks(label) {
    document
        .querySelectorAll(SIDEBAR_COMMUNITY_SELECTOR)
        .forEach((communityLink) => insertDocsLink(communityLink, label));
}

export function init() {
    if (init._run) return;
    init._run = true;

    cleanupOldApiDocsStorage();

    (async () => {
        const label = ts('navigation.apiDocs');
        initLocationChangeWatcher();
        sidebarLinkEnabled = await settings.apiDocsSidebarLinkEnabled;

        observeElement(
            SIDEBAR_COMMUNITY_SELECTOR,
            (communityLink) => {
                insertDocsLink(communityLink, label);
            },
            { multiple: true },
        );

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (
                areaName !== 'local' ||
                !changes.apiDocsSidebarLinkEnabled
            ) {
                return;
            }

            sidebarLinkEnabled =
                changes.apiDocsSidebarLinkEnabled.newValue;

            if (sidebarLinkEnabled) {
                addDocsLinks(label);
            } else {
                removeDocsLinks();
            }
        });
    })().catch((error) => {
        console.error('RoValra: Failed to initialize API docs link.', error);
    });
}
