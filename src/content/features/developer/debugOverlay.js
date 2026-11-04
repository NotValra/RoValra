import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { Icon } from '../../core/ui/buildericon.js';
import { createFloatingPanel } from '../../core/ui/floatingPanel.js';
import {
    SECTIONS,
    collect,
    recordFrame,
    refreshAsync,
    resetFrames,
    startCollectors,
    stopCollectors,
} from './debugMetrics.js';

const SETTING_NAME = 'debugOverlayEnabled';
const STATE_KEY = 'rovalraDebugOverlayState';
const UPDATE_INTERVAL_MS = 500;
const ASYNC_REFRESH_EVERY = 20;

let initialized = false;
let mounted = false;
let lastFrame = 0;
let rafId = null;
let updateTimer = null;
let tickCount = 0;

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function refresh() {
    collect();
    if (tickCount++ % ASYNC_REFRESH_EVERY === 0) refreshAsync();
    panel.update();
}

function startLoops(host) {
    const frameLoop = (now) => {
        if (lastFrame) recordFrame(now - lastFrame);
        lastFrame = now;
        rafId = host.requestAnimationFrame(frameLoop);
    };

    rafId = host.requestAnimationFrame(frameLoop);
    refresh();
    updateTimer = host.setInterval(refresh, UPDATE_INTERVAL_MS);
}

function stopLoops(host) {
    host.cancelAnimationFrame(rafId);
    host.clearInterval(updateTimer);
    rafId = null;
    updateTimer = null;
    lastFrame = 0;
    resetFrames();
}

function createRow(sectionId, { id, read, level }, track) {
    const row = createElement('div', 'rovalra-debug-overlay-row');
    const label = createElement('span', 'rovalra-debug-overlay-label');
    const value = createElement('span', 'rovalra-debug-overlay-value');
    row.append(label, value);

    track(() => {
        label.textContent = ts(`debugOverlay.${sectionId}.${id}`);
        try {
            value.textContent = read();
        } catch {
            value.textContent = '-';
        }
        value.title = value.textContent;

        const currentLevel = level?.();
        if (currentLevel) value.dataset.level = currentLevel;
        else delete value.dataset.level;
    });

    return row;
}

function createSection(section, { track, getState, saveState }) {
    const details = createElement('details', 'rovalra-debug-overlay-section');
    details.open = getState().sections?.[section.id] ?? section.open;
    details.addEventListener('toggle', () => {
        saveState({
            sections: { ...getState().sections, [section.id]: details.open },
        });
    });

    const summary = createElement('summary', 'rovalra-debug-overlay-summary');
    const summaryText = createElement('span');
    summary.append(
        Icon({
            icon: 'expand_more',
            material: true,
            size: '18px',
            classes: 'rovalra-debug-overlay-chevron',
        }),
        summaryText,
    );
    track(() => {
        summaryText.textContent = ts(`debugOverlay.${section.id}.title`);
    });

    details.append(
        summary,
        ...section.rows.map((row) => createRow(section.id, row, track)),
    );

    return details;
}

const panel = createFloatingPanel({
    id: 'debug-overlay',
    stateKey: STATE_KEY,
    titleKey: 'debugOverlay.title',
    labelKeys: {
        popout: 'debugOverlay.popout',
        collapse: 'debugOverlay.collapse',
        hide: 'debugOverlay.hide',
    },
    keybind: 'F3',
    popout: true,
    build: (context) =>
        context.body.append(
            ...SECTIONS.map((section) => createSection(section, context)),
        ),
    onShow: startLoops,
    onHide: stopLoops,
});

async function mount() {
    if (mounted) return;
    mounted = true;

    startCollectors();
    await panel.mount();
}

function unmount() {
    if (!mounted) return;
    mounted = false;

    panel.unmount();
    stopCollectors();
}

function applySetting(enabled) {
    if (enabled) mount();
    else unmount();
}

export async function init() {
    if (initialized) return;
    initialized = true;

    applySetting((await settings[SETTING_NAME]) === true);

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== SETTING_NAME) return;

        applySetting(event.detail.value === true);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes[SETTING_NAME]) return;

        applySetting(changes[SETTING_NAME].newValue === true);
    });
}
