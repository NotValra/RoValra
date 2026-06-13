import { observeElement } from '../../observer.js';
import { addTooltip } from '../tooltip.js';
import { ts } from '../../locale/i18n.js';
const TIME_FORMAT_KEY = 'rovalra_time_format_preference';
let preferredFormat = 'local';
const FORMATS = ['local', '24h', 'relative'];

chrome.storage.local.get([TIME_FORMAT_KEY], (result) => {
    if (result[TIME_FORMAT_KEY] && FORMATS.includes(result[TIME_FORMAT_KEY])) {
        preferredFormat = result[TIME_FORMAT_KEY];
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[TIME_FORMAT_KEY]) {
        const newFormat = changes[TIME_FORMAT_KEY].newValue;
        if (FORMATS.includes(newFormat) && newFormat !== preferredFormat) {
            preferredFormat = newFormat;
            document.dispatchEvent(
                new CustomEvent('rovalra-time-format-change', {
                    detail: { format: newFormat },
                }),
            );
        }
    }
});

function formatRelativeTime(date) {
    const now = new Date();
    const seconds = Math.floor(Math.abs(now - date) / 1000);
    const isFuture = date > now;
    const suffix = isFuture ? 'FromNow' : 'Ago';
    const round = isFuture ? Math.ceil : Math.floor;

    if (seconds < 5) return ts('time.justNow');
    if (seconds < 60) return ts(`time.seconds${suffix}`, { count: seconds });

    const minutes = round(seconds / 60);
    if (minutes < 60) return ts(`time.minutes${suffix}`, { count: minutes });

    const hours = round(seconds / 3600);
    if (hours < 24) return ts(`time.hours${suffix}`, { count: hours });
    const days = round(seconds / 86400);
    if (days < 7) return ts(`time.days${suffix}`, { count: days });

    const weeks = round(seconds / 604800);
    if (weeks < 5) return ts(`time.weeks${suffix}`, { count: weeks });

    const months = round(seconds / (86400 * 30.44));
    if (months < 12) return ts(`time.months${suffix}`, { count: months });

    const years = round(seconds / (86400 * 365.25));
    return ts(`time.years${suffix}`, { count: years });
}

function formatTime(date, format) {
    switch (format) {
        case '24h':
            return date.toLocaleString('en-GB', { hour12: false });
        case 'relative':
            return formatRelativeTime(date);
        case 'local':
        default:
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
            });
    }
}

function getTooltipText(date) {
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

observeElement(
    '.rovalra-interactive-timestamp',
    (container) => {
        const date =
            container._rovalraDate ||
            (container.dataset.date ? new Date(container.dataset.date) : null);
        if (!date) return;

        container._rovalraDate = date;

        const timeSpan = container.querySelector('span');
        if (!timeSpan) return;

        let updateInterval = null;
        let currentFormat = preferredFormat;

        const updateDisplay = (format) => {
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = null;
            timeSpan.textContent = formatTime(date, format);
            if (format === 'relative') {
                updateInterval = setInterval(() => {
                    timeSpan.textContent = formatTime(date, 'relative');
                }, 60000);
            }
        };

        updateDisplay(currentFormat);

        const handleFormatChange = (e) => {
            const newFormat = e.detail.format;
            if (newFormat !== currentFormat) {
                currentFormat = newFormat;
                updateDisplay(newFormat);
            }
        };
        document.addEventListener(
            'rovalra-time-format-change',
            handleFormatChange,
        );

        const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nextIndex =
                (FORMATS.indexOf(preferredFormat) + 1) % FORMATS.length;
            const newFormat = FORMATS[nextIndex];

            preferredFormat = newFormat;
            chrome.storage.local.set({ [TIME_FORMAT_KEY]: newFormat });

            document.dispatchEvent(
                new CustomEvent('rovalra-time-format-change', {
                    detail: { format: newFormat },
                }),
            );
        };

        if (!container._listenersAttached) {
            container._listenersAttached = true;
            container.addEventListener('click', handleClick);
            addTooltip(container, getTooltipText(date));
        }

        container._cleanup = () => {
            if (updateInterval) clearInterval(updateInterval);
            container.removeEventListener('click', handleClick);
            document.removeEventListener(
                'rovalra-time-format-change',
                handleFormatChange,
            );
        };
    },
    { multiple: true, onRemove: (c) => c._cleanup && c._cleanup() },
);

export function createInteractiveTimestamp(dateString) {
    const date = new Date(dateString);

    const container = document.createElement('span');
    container.className = 'rovalra-interactive-timestamp';
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.style.cursor = 'pointer';
    container._rovalraDate = date;
    container.dataset.date = date.toISOString();

    const timeSpan = document.createElement('span');
    timeSpan.style.borderBottom =
        '1px dashed color-mix(in srgb, var(--rovalra-secondary-text-color) 50%, transparent)';
    timeSpan.textContent = formatTime(date, preferredFormat);

    container.appendChild(timeSpan);
    return container;
}
