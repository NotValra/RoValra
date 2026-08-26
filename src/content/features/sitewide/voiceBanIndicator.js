import { callRobloxApi } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { ts } from '../../core/locale/i18n.js';

const CARD_ID = 'rovalra-voice-ban-indicator';
const CACHE_TIME = 60000;

let initialized = false;
let enabled = false;
let cachedData = null;
let cachedAt = 0;
let countdown = null;
let expiredRechecked = false;

function clearCountdown() {
    if (!countdown) return;

    clearInterval(countdown);
    countdown = null;
}

function removeCard() {
    document.getElementById(CARD_ID)?.remove();
    clearCountdown();
    expiredRechecked = false;
}

function getBanExpiry(value) {
    if (!value) return null;

    if (typeof value === 'number') {
        return value > 1000000000000 ? value : value * 1000;
    }

    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }

    if (typeof value === 'object') {
        const seconds = value.Seconds ?? value.seconds;

        if (seconds != null) {
            const parsed = Number(seconds);

            if (Number.isFinite(parsed)) {
                return parsed * 1000;
            }
        }
    }

    return null;
}

function formatRemaining(expiry) {
    const diff = Math.max(0, expiry - Date.now());

    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / 60000) % 60);
    const hours = Math.floor((diff / 3600000) % 24);
    const days = Math.floor(diff / 86400000);

    const parts = [];

    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    if (minutes || hours || days) parts.push(`${minutes}m`);

    parts.push(`${seconds}s`);

    return parts.join(' ');
}

async function fetchVoiceSettings(force = false) {
    if (
        !force &&
        cachedData &&
        Date.now() - cachedAt < CACHE_TIME
    ) {
        return cachedData;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'voice',
            endpoint: '/v1/settings',
            method: 'GET',
            noCache: force,
        });

        if (!response.ok) return null;

        const data = await response.json();

        cachedData = data;
        cachedAt = Date.now();

        return data;
    } catch (error) {
        console.warn(
            'RoValra: Failed to fetch voice ban status',
            error,
        );

        return null;
    }
}

function createVoiceIcon() {
    const svg = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
    );

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('rovalra-voice-ban-icon-svg');

    const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
    );

    path.setAttribute(
        'd',
        'M19 11h-2c0 .91-.25 1.76-.68 2.49l1.46 1.46A6.94 6.94 0 0 0 19 11ZM4.27 3 3 4.27l6.01 6.01V11a3 3 0 0 0 4.72 2.45l1.28 1.28A4.98 4.98 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08a6.96 6.96 0 0 0 3.43-1.31L19.73 20 21 18.73 4.27 3ZM12 4a1 1 0 0 1 1 1v4.18l2 2V5a3 3 0 0 0-5.12-2.12L11 4h1Z',
    );

    svg.appendChild(path);

    return svg;
}

function createCard(navList) {
    let item = document.getElementById(CARD_ID);

    if (item) {
        if (item.parentElement !== navList) {
            navList.prepend(item);
        }

        return item;
    }

    item = document.createElement('li');
    item.id = CARD_ID;
    item.className = 'rovalra-voice-ban-indicator';

    const card = document.createElement('div');
    card.className = 'rovalra-voice-ban-card';

    const icon = document.createElement('span');
    icon.className = 'rovalra-voice-ban-icon';
    icon.appendChild(createVoiceIcon());

    const content = document.createElement('div');
    content.className = 'rovalra-voice-ban-content';

    const top = document.createElement('div');
    top.className = 'rovalra-voice-ban-top';

    const title = document.createElement('span');
    title.className = 'rovalra-voice-ban-title';
    title.textContent = ts('voiceBanIndicator.title');

    const badge = document.createElement('span');
    badge.className = 'rovalra-voice-ban-badge';
    badge.textContent = ts('voiceBanIndicator.suspended');

    const timer = document.createElement('span');
    timer.className = 'rovalra-voice-ban-timer';

    top.append(title, badge);
    content.append(top, timer);
    card.append(icon, content);
    item.appendChild(card);

    navList.prepend(item);

    return item;
}

async function refresh(force = false, navList = null) {
    if (!enabled) return;

    const list =
        navList ||
        document.querySelector('.left-nav nav > ul');

    if (!list) return;

    const data = await fetchVoiceSettings(force);

    if (!data) return;

    render(data, list);
}

function render(data, navList) {
    if (!enabled || !data?.isBanned) {
        removeCard();
        return;
    }

    const item = createCard(navList);
    const timer = item.querySelector('.rovalra-voice-ban-timer');

    if (!timer) return;

    clearCountdown();

    const expiry = getBanExpiry(data.bannedUntil);

    if (!expiry) {
        timer.textContent = ts('voiceBanIndicator.noExpiry');
        item.title = `${ts('voiceBanIndicator.title')} - ${timer.textContent}`;
        return;
    }

    if (expiry > Date.now()) {
        expiredRechecked = false;
    }

    const updateTimer = () => {
        const remaining = expiry - Date.now();

        if (remaining <= 0) {
            clearCountdown();

            if (expiredRechecked) {
                timer.textContent = ts(
                    'voiceBanIndicator.stillActive',
                );
                return;
            }

            expiredRechecked = true;
            timer.textContent = ts(
                'voiceBanIndicator.checking',
            );

            cachedData = null;
            cachedAt = 0;

            setTimeout(() => {
                refresh(true);
            }, 1000);

            return;
        }

        timer.textContent =
            `${ts('voiceBanIndicator.liftsIn')} ${formatRemaining(expiry)}`;

        timer.title = new Date(expiry).toLocaleString();
        item.title = `${ts('voiceBanIndicator.title')} - ${timer.textContent}`;
    };

    updateTimer();

    if (expiry > Date.now()) {
        countdown = setInterval(updateTimer, 1000);
    }
}

export async function init() {
    if (initialized) return;
    initialized = true;

    const settings = await chrome.storage.local.get({
        voiceBanIndicatorEnabled: true,
    });

    enabled = settings.voiceBanIndicatorEnabled;

    observeElement(
        '.left-nav nav > ul',
        (navList) => {
            if (enabled) {
                refresh(false, navList);
            }
        },
        {
            onRemove: () => {
                clearCountdown();
            },
        },
    );

    chrome.storage.onChanged.addListener(
        (changes, area) => {
            if (
                area !== 'local' ||
                !changes.voiceBanIndicatorEnabled
            ) {
                return;
            }

            enabled =
                changes.voiceBanIndicatorEnabled.newValue;

            if (!enabled) {
                removeCard();
                return;
            }

            cachedData = null;
            cachedAt = 0;

            refresh(true);
        },
    );
    
    document.addEventListener('visibilitychange', () => {
        if (
            !document.hidden &&
            enabled &&
            Date.now() - cachedAt >= CACHE_TIME
        ) {
            refresh(true);
        }
    });
}