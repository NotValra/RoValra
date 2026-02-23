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
            document.dispatchEvent(new CustomEvent('rovalra-time-format-change', { detail: { format: newFormat } }));
        }
    }
});

function formatRelativeTime(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;

    const months = Math.floor(days / 30.44);
    if (months < 12) return `${months}mo ago`;

    const years = Math.floor(days / 365.25);
    return `${years}y ago`;
}

function formatTime(date, format) {
    switch (format) {
        case '24h':
            return date.toLocaleTimeString([], { hour12: false });
        case 'relative':
            return formatRelativeTime(date);
        case 'local':
        default:
            return date.toLocaleTimeString([]);
    }
}

export function createInteractiveTimestamp(dateString) {
    const date = new Date(dateString);
    let currentFormat = preferredFormat;

    const container = document.createElement('div');
    container.className = 'rovalra-interactive-timestamp';
    container.style.position = 'relative';
    container.style.cursor = 'pointer';

    const timeSpan = document.createElement('span');
    timeSpan.style.borderBottom = '1px dashed color-mix(in srgb, var(--rovalra-secondary-text-color) 50%, transparent)';

    let updateInterval = null;

    const updateDisplay = (format) => {
        if (updateInterval) clearInterval(updateInterval);
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
    document.addEventListener('rovalra-time-format-change', handleFormatChange);

    container.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextIndex = (FORMATS.indexOf(currentFormat) + 1) % FORMATS.length;
        const newFormat = FORMATS[nextIndex];

        preferredFormat = newFormat;
        chrome.storage.local.set({ [TIME_FORMAT_KEY]: newFormat });

        document.dispatchEvent(new CustomEvent('rovalra-time-format-change', {
            detail: { format: newFormat }
        }));
    });

    const observer = new MutationObserver(() => {
        if (!document.body.contains(container)) {
            if (updateInterval) clearInterval(updateInterval);
            document.removeEventListener('rovalra-time-format-change', handleFormatChange);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    container.appendChild(timeSpan);
    return container;
}