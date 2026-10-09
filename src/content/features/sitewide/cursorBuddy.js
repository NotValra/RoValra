import { loadSettings } from '../../core/settings/handlesettings.js';
import { REMOTE_SETTING_LOCKS_KEY } from '../../core/settings/remoteSettingLocks.js';
import oneko from './oneko.js';

const HOST_ID = 'rovalra-cursor-buddy';
const DESTROY_EVENT = 'rovalra:cursorBuddyDestroy';
const STATE_KEY = 'rovalra_cursorBuddyState';
const SETTING_KEYS = [
    'cursorBuddyEnabled',
    'cursorBuddyCompanion',
    'cursorBuddySize',
    'cursorBuddyFollowSpeed',
];

let initialized = false;
let suspended = false;
let restoring = false;
let revision = 0;
let host;
let destroyBuddy;
let activeBuddy;
let pendingState;

function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function handleNavigation() {
    if (suspended || restoring || !host) return;
    if (!host.isConnected) {
        document.documentElement.appendChild(host);
    }
    destroyBuddy?.resume();
}

function readState() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STATE_KEY));
        return saved?.version === 1 ? saved.state : undefined;
    } catch {
        return undefined;
    }
}

function saveState() {
    if (!destroyBuddy) return;
    try {
        sessionStorage.setItem(
            STATE_KEY,
            JSON.stringify({ version: 1, state: destroyBuddy.getState() }),
        );
    } catch {}
}

function clearState() {
    pendingState = undefined;
    try {
        sessionStorage.removeItem(STATE_KEY);
    } catch {}
}

function removeBuddy() {
    destroyBuddy?.();
    destroyBuddy = undefined;
    activeBuddy = undefined;
    host?.remove();
    host = null;
}

async function refresh() {
    if (!initialized || suspended) return;
    const token = ++revision;
    try {
        const settings = await loadSettings();
        if (token !== revision || !initialized || suspended) return;
        restoring = false;
        if (settings.cursorBuddyEnabled !== true) {
            clearState();
            removeBuddy();
            return;
        }
        const options = {
            size: boundedNumber(settings.cursorBuddySize, 32, 24, 128),
            speed: boundedNumber(settings.cursorBuddyFollowSpeed, 240, 40, 600) / 24,
        };
        const buddy = settings.cursorBuddyCompanion === 'kitten' ? 'kitten' : 'cat';
        if (destroyBuddy && activeBuddy !== buddy) {
            pendingState = destroyBuddy.getState();
            removeBuddy();
        }
        if (!destroyBuddy) {
            host = document.createElement('div');
            host.id = HOST_ID;
            host.setAttribute('aria-hidden', 'true');
            host.style.all = 'initial';
            host.style.display = 'contents';
            host.style.setProperty('pointer-events', 'none', 'important');
            document.documentElement.appendChild(host);
            destroyBuddy = oneko({
                ...options,
                initialState: pendingState,
                image: chrome.runtime.getURL(
                    `public/Assets/cursorBuddy/${buddy === 'kitten' ? 'kitten.png' : 'oneko.gif'}`,
                ),
                parent: host.attachShadow({ mode: 'closed' }),
            });
            activeBuddy = buddy;
            pendingState = undefined;
        } else {
            destroyBuddy.updateOptions(options);
        }
        handleNavigation();
    } catch (error) {
        if (token !== revision) return;
        restoring = false;
        removeBuddy();
        console.warn('RoValra: Cursor Buddy settings could not be loaded.', error);
    }
}

function handleStorage(changes, areaName) {
    if (
        areaName === 'local' &&
        (SETTING_KEYS.some((key) => key in changes) ||
            changes.rovalra_settings ||
            changes[REMOTE_SETTING_LOCKS_KEY])
    ) {
        void refresh();
    }
}

function handleSettingSaved(event) {
    if (SETTING_KEYS.includes(event.detail?.name)) void refresh();
}

function handlePageHide(event) {
    ++revision;
    suspended = true;
    restoring = false;
    if (event.persisted) {
        saveState();
        destroyBuddy?.pause();
        host?.remove();
    } else {
        destroy();
    }
}

function handlePageShow(event) {
    if (!event.persisted || !initialized) return;
    suspended = false;
    restoring = true;
    const state = readState();
    if (destroyBuddy) {
        destroyBuddy.restoreState(state);
    } else {
        pendingState = state ?? pendingState;
    }
    void refresh();
}

function destroy() {
    saveState();
    ++revision;
    initialized = false;
    suspended = true;
    restoring = false;
    removeBuddy();
    chrome.storage.onChanged.removeListener(handleStorage);
    document.removeEventListener('rovalra:settingSaved', handleSettingSaved);
    window.removeEventListener('rovalra:urlChanged', handleNavigation);
    document.removeEventListener(DESTROY_EVENT, destroy);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('pageshow', handlePageShow);
}

export function init() {
    if (initialized) return;
    document.dispatchEvent(new Event(DESTROY_EVENT));
    document.getElementById(HOST_ID)?.remove();
    initialized = true;
    suspended = false;
    restoring = false;
    pendingState = readState();
    chrome.storage.onChanged.addListener(handleStorage);
    document.addEventListener('rovalra:settingSaved', handleSettingSaved);
    window.addEventListener('rovalra:urlChanged', handleNavigation);
    document.addEventListener(DESTROY_EVENT, destroy);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    void refresh();
}
