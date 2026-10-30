import { callRobloxApiJson } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { observeElement } from '../../core/observer.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { t } from '../../core/locale/i18n.js';

const SETTING = 'friendRequestBellNotificationsEnabled';
const POPOVER = '#notification-stream-container';
const MOUNT_SELECTOR = [
    `${POPOVER} .notification-stream-list`,
    `${POPOVER} .notification-stream-scrollbar`,
    `${POPOVER} .notification-stream-body`,
    `${POPOVER} .notification-content-view`,
].join(', ');
const FEED_CLASS = 'rovalra-friend-request-notifications';
const REFRESH_MS = 60_000;
const MAX_CARDS = 5;

let initialized = false;
let enabled = false;
let pending = [];
let accountId = null;
let lastFetch = 0;
let fetchInFlight = null;
let timer = null;
let version = 0;
let strings = {
    request: 'sent you a friend request.',
    view: 'View Request',
};

function getMountTarget(popover) {
    const view = popover.querySelector('.notification-content-view');
    if (!view) return null;

    return (
        view.querySelector('.notification-stream-list') ||
        view.querySelector('.notification-stream-scrollbar') ||
        view.querySelector('.notification-stream-body') ||
        null
    );
}

function isSafeThumbnail(src) {
    if (!src) return false;
    try {
        const url = new URL(src);
        return (
            url.protocol === 'https:' &&
            (url.hostname === 'rbxcdn.com' ||
                url.hostname.endsWith('.rbxcdn.com'))
        );
    } catch {
        return false;
    }
}

function createRequestCard(request) {
    const card = document.createElement('div');
    card.className = 'rovalra-friend-request-notification';

    const avatar = document.createElement('div');
    avatar.className = 'rovalra-friend-request-avatar';
    if (isSafeThumbnail(request.imageUrl)) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = request.imageUrl;
        avatar.appendChild(image);
    }

    const details = document.createElement('div');
    details.className = 'rovalra-friend-request-details';

    const message = document.createElement('p');
    message.className = 'rovalra-friend-request-message';
    const name = document.createElement('strong');
    name.textContent = request.displayName || request.name || `User ${request.id}`;
    message.append(name, document.createTextNode(` ${strings.request}`));

    const action = document.createElement('a');
    action.className = 'rovalra-friend-request-action';
    action.href = '/users/friends#!/friend-requests';
    action.textContent = strings.view;
    details.append(message, action);
    card.append(avatar, details);
    return card;
}

function render() {
    if (!enabled || pending.length === 0) {
        document.querySelectorAll(`.${FEED_CLASS}`).forEach((feed) => feed.remove());
        return;
    }

    document.querySelectorAll(POPOVER).forEach((popover) => {
        const target = getMountTarget(popover);
        if (!target) return;

        const existing = popover.querySelector(`.${FEED_CLASS}`);
        const tagName = target.tagName === 'UL' ? 'li' : 'section';
        let feed = existing;

        if (feed && feed.tagName.toLowerCase() !== tagName) {
            feed.remove();
            feed = null;
        }

        if (!feed) {
            feed = document.createElement(tagName);
            feed.className = FEED_CLASS;
            feed.setAttribute('aria-label', 'Friend requests');
        }

        if (feed.parentElement !== target) target.prepend(feed);
        feed.replaceChildren(...pending.slice(0, MAX_CARDS).map(createRequestCard));
    });
}

async function hydrateRequests(rows) {
    const userIds = rows.map(({ id }) => id);
    let names = new Map();

    try {
        const response = await callRobloxApiJson({
            subdomain: 'users',
            endpoint: '/v1/users',
            method: 'POST',
            body: { userIds, excludeBannedUsers: false },
        });
        names = new Map((response?.data || []).map((user) => [Number(user.id), user]));
    } catch (error) {
        console.warn('RoValra: Could not fetch friend request names', error);
    }

    return rows.map((row) => ({
        ...row,
        name: names.get(row.id)?.name || row.name || '',
        displayName: names.get(row.id)?.displayName || row.displayName || '',
    }));
}

async function hydrateThumbnails(rows, currentVersion) {
    try {
        const thumbnails = await fetchThumbnails(
            rows.map(({ id }) => ({ id })),
            'AvatarHeadshot',
            '48x48',
            true,
        );
        if (currentVersion !== version || !enabled) return;
        pending = rows.map((row) => ({
            ...row,
            imageUrl: thumbnails.get(row.id)?.imageUrl || '',
        }));
        render();
    } catch (error) {
        console.warn('RoValra: Could not fetch friend request avatars', error);
    }
}

async function refresh(force = false) {
    if (!enabled || document.hidden) return;
    if (!force && Date.now() - lastFetch < REFRESH_MS) return;
    if (fetchInFlight) return fetchInFlight;

    const currentVersion = version;
    fetchInFlight = (async () => {
        const userId = Number(await getAuthenticatedUserId(true));
        if (!Number.isSafeInteger(userId) || userId <= 0) return;
        if (currentVersion !== version || !enabled) return;

        if (accountId !== userId) {
            accountId = userId;
            pending = [];
            render();
        }

        const result = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: '/v1/my/friends/requests?sortOrder=Desc&limit=10',
            noCache: true,
        });
        if (!Array.isArray(result?.data)) {
            throw new Error('Unexpected friend requests API response');
        }
        if (currentVersion !== version || !enabled) return;

        const seen = new Set();
        const rows = result.data
            .map((user) => ({
                id: Number(user.id),
                name: typeof user.name === 'string' ? user.name : '',
                displayName: typeof user.displayName === 'string' ? user.displayName : '',
            }))
            .filter(({ id }) => {
                if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .slice(0, MAX_CARDS);

        lastFetch = Date.now();
        pending = rows;
        render();
        if (!rows.length) return;

        const hydrated = await hydrateRequests(rows);
        if (currentVersion !== version || !enabled) return;
        pending = hydrated;
        render();
        void hydrateThumbnails(hydrated, currentVersion);
    })()
        .catch((error) => {
            console.warn('RoValra: Friend requests could not be loaded', error);
        })
        .finally(() => {
            fetchInFlight = null;
        });

    return fetchInFlight;
}

function setEnabled(nextEnabled) {
    if (enabled === nextEnabled) return;
    enabled = nextEnabled;
    version++;

    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }

    if (!enabled) {
        pending = [];
        render();
        return;
    }

    lastFetch = 0;
    void refresh();
    timer = window.setInterval(() => void refresh(), REFRESH_MS);
}

export async function init() {
    if (initialized) return;
    initialized = true;

    try {
        const [request, view] = await Promise.all([
            t('friendRequestBell.request'),
            t('friendRequestBell.view'),
        ]);
        strings = { request, view };
    } catch {
    }

    observeElement(
        MOUNT_SELECTOR,
        () => {
            render();
            if (enabled && pending.length === 0) void refresh();
        },
        { multiple: true },
    );

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== SETTING) return;
        setEnabled(event.detail?.value === true);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[SETTING]) return;
        setEnabled(changes[SETTING].newValue === true);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void refresh();
    });

    setEnabled((await settings[SETTING]) === true);
}
