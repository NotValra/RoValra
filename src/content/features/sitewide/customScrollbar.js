const STYLE_ID = 'rovalra-custom-scrollbar';
let initialized = false;

const defaults = {
    customScrollbarHide: false,
    customScrollbarWidth: 8,
    customScrollbarThumbColor: '#4f545c',
    customScrollbarTrackColor: '#202124',
    customScrollbarRadius: 8,
};

function removeStyles() {
    const root = document.documentElement;
    root.classList.remove(STYLE_ID, `${STYLE_ID}-hidden`);
    ['width', 'thumb', 'track', 'radius'].forEach((name) =>
        root.style.removeProperty(`--rovalra-scrollbar-${name}`),
    );
}

function applyStyles(values) {
    removeStyles();
    if (!values.customScrollbarEnabled) return;
    void document.documentElement.offsetWidth;

    const width = Math.max(1, Math.min(24, Number(values.customScrollbarWidth) || defaults.customScrollbarWidth));
    const radius = Math.max(0, Math.min(24, Number(values.customScrollbarRadius) || 0));
    const hidden = values.customScrollbarHide;
    const root = document.documentElement;
    root.classList.add(STYLE_ID);
    root.classList.toggle(`${STYLE_ID}-hidden`, hidden);
    root.style.setProperty('--rovalra-scrollbar-width', `${width}px`);
    root.style.setProperty('--rovalra-scrollbar-thumb', values.customScrollbarThumbColor);
    root.style.setProperty('--rovalra-scrollbar-track', values.customScrollbarTrackColor);
    root.style.setProperty('--rovalra-scrollbar-radius', `${radius}px`);
}

async function refresh() {
    const values = await chrome.storage.local.get([
        'customScrollbarEnabled',
        ...Object.keys(defaults),
    ]);
    applyStyles({ ...defaults, ...values });
}

export function init() {
    if (initialized) return;
    initialized = true;
    refresh();
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (
            event.detail?.name === 'customScrollbarEnabled' ||
            Object.prototype.hasOwnProperty.call(defaults, event.detail?.name)
        ) {
            refresh();
        }
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (Object.keys(changes).some((key) => key in defaults || key === 'customScrollbarEnabled')) {
            refresh();
        }
    });
}
