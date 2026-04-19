import { observeElement } from '../../core/observer.js';
import { ts } from '../../core/locale/i18n.js';

const COMMUNITY_PATH = '/communities';
const TRANSACTIONS_PATH = '/transactions';
const ACTIVE_BACKGROUND_COLOR = 'rgba(255, 255, 255, 0.1)';
const STATE_SYNC_DELAYS = [0, 50, 150, 350, 750, 1200];
const SIDEBAR_COMMUNITY_SELECTOR = [
    '#left-navigation-container a[href*="/communities"]',
    '#navigation a[href*="/communities"]',
    '.navigation a[href*="/communities"]',
].join(', ');

let lastObservedPath = window.location.pathname;
let sidebarLinkEnabled = false;

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

function createTransactionsIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.width = '20px';
    svg.style.height = '20px';
    svg.style.display = 'block';

    const receipt = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    receipt.setAttribute(
        'd',
        'M6 3h12v18l-2-1.25L14 21l-2-1.25L10 21l-2-1.25L6 21z',
    );

    const lineOne = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    lineOne.setAttribute('d', 'M9 8h6');

    const lineTwo = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    lineTwo.setAttribute('d', 'M9 12h6');

    const lineThree = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );
    lineThree.setAttribute('d', 'M9 16h4');

    svg.append(receipt, lineOne, lineTwo, lineThree);
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

function createTransactionsItem(sidebar, communityLink, label) {
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
        iconHost.replaceChildren(createTransactionsIcon());
    } else {
        link.prepend(createTransactionsIcon());
    }

    setLinkLabel(link, label);
    link.setAttribute('href', TRANSACTIONS_PATH);
    link.dataset.rovalraTransactionsLink = 'true';
    item.dataset.rovalraTransactionsItem = 'true';

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

function updateTransactionsActiveState(sidebar) {
    const item = sidebar.querySelector(
        '[data-rovalra-transactions-item="true"]',
    );
    const link = sidebar.querySelector(
        'a[data-rovalra-transactions-link="true"]',
    );
    if (!item || !link) return;

    stripClonedState(item);
    item.dataset.rovalraTransactionsItem = 'true';
    link.dataset.rovalraTransactionsLink = 'true';

    link.className =
        'content-emphasis text-title-large flex items-center gap-small padding-left-xsmall padding-right-xxsmall radius-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none';

    if (matchesRoute(window.location.pathname, TRANSACTIONS_PATH)) {
        link.setAttribute('aria-current', 'page');
        link.classList.add('bg-surface-300');
    } else {
        clearInlineActiveStyles(item);
    }
}

function attachSidebarStateSync(sidebar) {
    if (sidebar.dataset.rovalraTransactionsStateSync === 'true') return;
    sidebar.dataset.rovalraTransactionsStateSync = 'true';

    const syncSoon = () => {
        STATE_SYNC_DELAYS.forEach((delay) => {
            if (delay === 0) {
                requestAnimationFrame(() =>
                    updateTransactionsActiveState(sidebar),
                );
                return;
            }

            setTimeout(() => updateTransactionsActiveState(sidebar), delay);
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

function insertTransactionsLink(communityLink, label) {
    if (!sidebarLinkEnabled) return;

    if (!matchesRoute(normalizePath(communityLink.href), COMMUNITY_PATH)) {
        return;
    }

    const sidebar = getSidebarContainer(communityLink);
    if (!sidebar) return;

    const existing = sidebar.querySelector(
        'a[data-rovalra-transactions-link="true"], a[href="/transactions"]',
    );
    if (existing) {
        updateTransactionsActiveState(sidebar);
        attachSidebarStateSync(sidebar);
        return;
    }

    const communityItem = getSidebarItem(sidebar, communityLink);
    const transactionsItem = createTransactionsItem(
        sidebar,
        communityLink,
        label,
    );
    if (!communityItem || !transactionsItem) return;

    communityItem.insertAdjacentElement('afterend', transactionsItem);
    updateTransactionsActiveState(sidebar);
    attachSidebarStateSync(sidebar);
}

function removeTransactionsLinks() {
    document
        .querySelectorAll('[data-rovalra-transactions-item="true"]')
        .forEach((item) => item.remove());
}

function addTransactionsLinks(label) {
    document
        .querySelectorAll(SIDEBAR_COMMUNITY_SELECTOR)

        .forEach((communityLink) =>
            insertTransactionsLink(communityLink, label),
        );
}

export function init() {
    if (init._run) return;
    init._run = true;

    chrome.storage.local.get(
        { transactionsSidebarLinkEnabled: false },
        (settings) => {
            const label = ts('navigation.transactions');
            initLocationChangeWatcher();
            sidebarLinkEnabled = settings.transactionsSidebarLinkEnabled;

            observeElement(
                SIDEBAR_COMMUNITY_SELECTOR,
                (communityLink) => {
                    insertTransactionsLink(communityLink, label);
                },
                { multiple: true },
            );

            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (
                    areaName !== 'local' ||
                    !changes.transactionsSidebarLinkEnabled
                ) {
                    return;
                }

                sidebarLinkEnabled =
                    changes.transactionsSidebarLinkEnabled.newValue;

                if (sidebarLinkEnabled) {
                    addTransactionsLinks(label);
                } else {
                    removeTransactionsLinks();
                }
            });
        },
    );
}
