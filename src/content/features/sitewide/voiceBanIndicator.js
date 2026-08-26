import { callRobloxApi } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';
import { Icon } from '../../core/ui/buildericon.js';
import { createNavbarButton } from '../../core/ui/navbarButton.js';
import { ts } from '../../core/locale/i18n.js';

const BUTTON_ID = 'rovalra-voice-ban-indicator';
const CACHE_TIME = 60000;
const MAX_TIMEOUT = 2147483647;

let initialized = false;
let enabled = false;

let cachedData = null;
let cachedAt = 0;
let currentBanData = null;

let expiryTimeout = null;

function clearExpiryTimeout() {
    if (!expiryTimeout) return;

    clearTimeout(expiryTimeout);
    expiryTimeout = null;
}

function getBanExpiry(value) {
    if (!value) return null;

    if (typeof value === 'number') {
        return value > 1000000000000
            ? value
            : value * 1000;
    }

    if (typeof value === 'string') {
        const parsed = Date.parse(value);

        return Number.isNaN(parsed)
            ? null
            : parsed;
    }

    if (typeof value === 'object') {
        const seconds =
            value.Seconds ??
            value.seconds;

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
    const diff = Math.max(
        0,
        expiry - Date.now(),
    );

    const seconds = Math.floor(
        (diff / 1000) % 60,
    );

    const minutes = Math.floor(
        (diff / 60000) % 60,
    );

    const hours = Math.floor(
        (diff / 3600000) % 24,
    );

    const days = Math.floor(
        diff / 86400000,
    );

    const parts = [];

    if (days) {
        parts.push(`${days}d`);
    }

    if (hours || days) {
        parts.push(`${hours}h`);
    }

    if (minutes || hours || days) {
        parts.push(`${minutes}m`);
    }

    parts.push(`${seconds}s`);

    return parts.join(' ');
}

function getTooltipText() {
    if (!currentBanData?.isBanned) {
        return '';
    }

    const expiry = getBanExpiry(
        currentBanData.bannedUntil,
    );

    const title = ts(
        'voiceBanIndicator.title',
    );

    if (!expiry) {
        return `${title} — ${ts(
            'voiceBanIndicator.noExpiry',
        )}`;
    }

    if (expiry <= Date.now()) {
        return title;
    }

    return `${title} — ${ts(
        'voiceBanIndicator.liftsIn',
    )} ${formatRemaining(expiry)}`;
}

function removeButton() {
    document
        .getElementById(BUTTON_ID)
        ?.remove();

    clearExpiryTimeout();

    currentBanData = null;
}

async function fetchVoiceSettings(
    force = false,
) {
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

        if (!response.ok) {
            return null;
        }

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

async function ensureButton() {
    const button = await createNavbarButton({
        id: BUTTON_ID,
        tooltipText: () =>
            getTooltipText(),
    });

    if (
        !button ||
        !enabled ||
        !currentBanData?.isBanned
    ) {
        removeButton();
        return null;
    }

    const holder =
        button.querySelector(
            '.rbx-menu-item',
        );

    if (
        holder &&
        !holder.querySelector('icon')
    ) {
        const icon = Icon({
            icon: 'mic_off',
            material: true,
            size: 'x-large',
        });

        icon.setAttribute(
            'aria-hidden',
            'true',
        );

        holder.appendChild(icon);
    }

    button.setAttribute(
        'aria-label',
        getTooltipText(),
    );

    return button;
}

function scheduleExpiryRefresh() {
    clearExpiryTimeout();

    if (!currentBanData?.isBanned) {
        return;
    }

    const expiry = getBanExpiry(
        currentBanData.bannedUntil,
    );

    if (!expiry) {
        return;
    }

    const remaining =
        expiry - Date.now();

    if (remaining <= 0) {
        refresh(true);
        return;
    }

    const delay = Math.min(
        remaining + 1000,
        MAX_TIMEOUT,
    );

    expiryTimeout = setTimeout(
        () => {
            refresh(true);
        },
        delay,
    );
}

async function refresh(force = false) {
    if (!enabled) {
        removeButton();
        return;
    }

    const data =
        await fetchVoiceSettings(force);

    if (!data) {
        return;
    }

    currentBanData = data;

    if (!data.isBanned) {
        removeButton();
        return;
    }

    await ensureButton();

    scheduleExpiryRefresh();
}

async function syncSetting() {
    enabled = Boolean(
        await settings.voiceBanIndicatorEnabled,
    );

    if (!enabled) {
        removeButton();
        return;
    }

    cachedData = null;
    cachedAt = 0;

    await refresh(true);
}

export async function init() {
    if (initialized) return;

    initialized = true;

    enabled = Boolean(
        await settings.voiceBanIndicatorEnabled,
    );

    if (enabled) {
        refresh();
    }

    document.addEventListener(
        'rovalra:settingSaved',
        (event) => {
            if (
                event.detail?.name !==
                'voiceBanIndicatorEnabled'
            ) {
                return;
            }

            syncSetting().catch((error) => {
                console.warn(
                    'RoValra: Failed to update voice ban indicator setting',
                    error,
                );
            });
        },
    );

    document.addEventListener(
        'visibilitychange',
        () => {
            if (
                document.hidden ||
                !enabled ||
                Date.now() - cachedAt <
                    CACHE_TIME
            ) {
                return;
            }

            refresh(true);
        },
    );
}