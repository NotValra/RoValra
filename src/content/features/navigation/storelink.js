import { getFrames } from '../../core/configs/frames.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { Icon } from '../../core/ui/buildericon.js';
import { initSidebarLink } from '../../core/ui/sidebarLink.js';
import { buttonData, updateContent } from '../settings/index.js';

const PAGE_PATH = '/rovalra-store';
const SEEN_NEW_FRAMES_KEY = 'rovalraStoreSeenNewFrames';

let observerActive = false;
let sidebarLink = null;

function isStorePage() {
    return (
        window.location.pathname
            .replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, '')
            .toLowerCase() === PAGE_PATH
    );
}

function createStoreIcon() {
    return Icon({
        material: false,
        size: 'medium',
        icon: 'shopping-basket',
        filled: false,
    });
}

async function getNewFrameValues() {
    const frames = await getFrames();
    return frames.filter((frame) => frame.new).map((frame) => frame.value);
}

async function getSeenNewFrames() {
    const stored = await chrome.storage.local.get(SEEN_NEW_FRAMES_KEY);
    const seen = stored?.[SEEN_NEW_FRAMES_KEY];
    return new Set(Array.isArray(seen) ? seen : []);
}

async function getStoreBadgeText() {
    const [newFrames, seen] = await Promise.all([
        getNewFrameValues(),
        getSeenNewFrames(),
    ]);
    return newFrames.some((value) => !seen.has(value))
        ? ts('profileCustomization.new')
        : null;
}

async function markNewFramesSeen() {
    const newFrames = await getNewFrameValues();
    await chrome.storage.local.set({ [SEEN_NEW_FRAMES_KEY]: newFrames });
    sidebarLink?.refreshBadge();
}

async function renderPage(contentDiv) {
    if (!isStorePage()) return;
    if (contentDiv.dataset.rovalraStorePage === 'true') return;
    contentDiv.dataset.rovalraStorePage = 'true';

    const storeButton = buttonData.find((button) => button.id === 'store');
    if (!storeButton) return;

    document.title = `${ts('navigation.rovalraStore')} - Roblox`;

    contentDiv.replaceChildren();
    contentDiv.style.position = 'relative';
    contentDiv.style.backgroundColor =
        'var(--rovalra-container-background-color)';
    contentDiv.style.minHeight = 'calc(100vh - 60px)';

    const shell = document.createElement('div');
    shell.className = 'rovalra-store-page';

    const title = document.createElement('h1');
    title.textContent = ts('navigation.rovalraStore');
    title.className = 'rovalra-store-page-title';

    const storeContent = document.createElement('div');
    shell.append(title, storeContent);
    contentDiv.appendChild(shell);

    await updateContent(storeButton, storeContent);
}

export function init() {
    if (init._run) return;
    init._run = true;

    sidebarLink = initSidebarLink({
        id: 'rovalra-store',
        path: PAGE_PATH,
        label: () => ts('navigation.rovalraStore'),
        createIcon: createStoreIcon,
        settingKeys: ['rovalraStoreSidebarLinkEnabled'],
        pinBelowCommunities: true,
        badge: getStoreBadgeText,
    });

    document.addEventListener(
        'click',
        (event) => {
            if (
                event.target.closest?.(
                    'a[data-rovalra-sidebar-link="rovalra-store"]',
                )
            ) {
                markNewFramesSeen().catch(() => {});
            }
        },
        true,
    );

    if (!isStorePage()) return;

    markNewFramesSeen().catch(() => {});

    (async () => {
        const contentDiv = document.querySelector('.content#content');
        if (contentDiv) renderPage(contentDiv);

        if (!observerActive) {
            observerActive = true;
            observeElement('.content#content', (cDiv) => {
                renderPage(cDiv);
            });
        }
    })().catch((error) => {
        console.error('RoValra: Failed to initialize RoValra store.', error);
    });
}
