import { observeElement } from '../../core/observer.js';
import { ts } from '../../core/locale/i18n.js';
import { Icon } from '../../core/ui/buildericon.js';
import { callRobloxApi } from '../../core/api.js';

const COMMUNITY_PATH = '/communities';
const MODERATION_PATH = '/moderation';
const STATE_SYNC_DELAYS = [0, 50, 150, 350, 750, 1200];
const SIDEBAR_COMMUNITY_SELECTOR = [
    '#left-navigation-container a[href*="/communities"]',
    '#navigation a[href*="/communities"]',
    '.navigation a[href*="/communities"]',
].join(', ');

let lastObservedPath = window.location.pathname;
let sidebarLinkEnabled = false;


async function checkModeratorStatus() {
    try {
        const req = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderator/check',
            method: 'GET',
            isRovalraApi: true,
        });

        if (req.ok) {
            const res = await req.json();
            return ((res && res.moderator_tier) || 0) > 0;
        }
    } catch (err) {
        console.error('Moderator check failed', err);
    }
    return false;
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

function createModerationIcon() {
    return Icon({
        size: 'medium',
        icon: 'sword',
    });
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

function createModerationItem(sidebar, communityLink, label) {
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
        iconHost.replaceChildren(createModerationIcon());
    } else {
        link.prepend(createModerationIcon());
    }

    setLinkLabel(link, label);
    link.setAttribute('href', MODERATION_PATH);
    link.dataset.rovalraModerationLink = 'true';
    item.dataset.rovalraModerationItem = 'true';

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

function updateModerationActiveState(sidebar) {
    const item = sidebar.querySelector('[data-rovalra-moderation-item="true"]');
    const link = sidebar.querySelector('a[data-rovalra-moderation-link="true"]');
    if (!item || !link) return;

    stripClonedState(item);
    item.dataset.rovalraModerationItem = 'true';
    link.dataset.rovalraModerationLink = 'true';

    link.className =
        'content-emphasis text-title-large flex items-center gap-small padding-left-xsmall padding-right-xxsmall radius-medium relative clip group/interactable focus-visible:outline-focus disabled:outline-none';

    if (matchesRoute(window.location.pathname, MODERATION_PATH)) {
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
                requestAnimationFrame(() => updateModerationActiveState(sidebar));
                return;
            }

            setTimeout(() => updateModerationActiveState(sidebar), delay);
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

function insertModerationLink(communityLink, label) {
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
        updateModerationActiveState(sidebar);
        attachSidebarStateSync(sidebar);
        return;
    }

    const communityItem = getSidebarItem(sidebar, communityLink);
    const moderationItem = createModerationItem(sidebar, communityLink, label);
    if (!communityItem || !moderationItem) return;

    communityItem.insertAdjacentElement('afterend', moderationItem);
    updateModerationActiveState(sidebar);
    attachSidebarStateSync(sidebar);
}

function removeDocsLinks() {
    document
        .querySelectorAll('[data-rovalra-moderation-item="true"]')
        .forEach((item) => item.remove());
}

function addModerationLinks(label) {
    document
        .querySelectorAll(SIDEBAR_COMMUNITY_SELECTOR)
        .forEach((communityLink) => insertModerationLink(communityLink, label));
}

export function init() {
    if (init._run) return;
    init._run = true;

    (async () => {
        const label = ts('navigation.moderationSidebarLink');
        initLocationChangeWatcher();
        sidebarLinkEnabled = await checkModeratorStatus();

        observeElement(
            SIDEBAR_COMMUNITY_SELECTOR,
            (communityLink) => {
                insertModerationLink(communityLink, label);
            },
            { multiple: true },
        );
    })().catch((error) => {
        console.error('RoValra: Failed to initialize Moderation docs link.', error);
    });
}
