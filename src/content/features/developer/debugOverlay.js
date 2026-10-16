import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { ChangeIcon, Icon } from '../../core/ui/buildericon.js';
import { createSquareButton } from '../../core/ui/profile/header/squarebutton.js';
import { addTooltip } from '../../core/ui/tooltip.js';
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
const SAVE_DELAY_MS = 250;
const POPUP_NAME = 'rovalra-debug-overlay';
const POPUP_FEATURES = 'popup=yes,width=460,height=760';

const ICON_SIZE = '20px';

let initialized = false;
let overlay = null;
let popup = null;
let rowUpdaters = [];
let headerIcons = {};
let state = {
    hidden: false,
    collapsed: false,
    x: null,
    y: null,
    w: null,
    h: null,
    sections: {},
};
let lastFrame = 0;
let rafId = null;
let updateTimer = null;
let tickCount = 0;
let resizeObserver = null;
let saveTimer = null;

function getHost() {
    return popup ?? window;
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function saveState() {
    chrome.storage.local.set({ [STATE_KEY]: state });
}

function frameLoop(now) {
    if (lastFrame) recordFrame(now - lastFrame);
    lastFrame = now;
    rafId = getHost().requestAnimationFrame(frameLoop);
}

function refresh() {
    collect();
    if (tickCount++ % ASYNC_REFRESH_EVERY === 0) refreshAsync();
    rowUpdaters.forEach((update) => update());
}

function startLoops() {
    const host = getHost();
    if (rafId === null) rafId = host.requestAnimationFrame(frameLoop);
    if (updateTimer === null) {
        refresh();
        updateTimer = host.setInterval(refresh, UPDATE_INTERVAL_MS);
    }
}

function stopLoops() {
    const host = getHost();
    host.cancelAnimationFrame(rafId);
    host.clearInterval(updateTimer);
    rafId = null;
    updateTimer = null;
    lastFrame = 0;
    resetFrames();
}

function restartLoops() {
    stopLoops();
    if (!state.hidden) startLoops();
}

function applyPosition() {
    if (!overlay || state.x === null) return;

    overlay.style.setProperty('--rovalra-debug-x', `${state.x}px`);
    overlay.style.setProperty('--rovalra-debug-y', `${state.y}px`);
}

function applySize() {
    if (!overlay) return;

    if (state.w) overlay.style.setProperty('--rovalra-debug-w', `${state.w}px`);
    if (state.h) overlay.style.setProperty('--rovalra-debug-h', `${state.h}px`);
}

function setPosition(x, y) {
    const maxX = Math.max(0, window.innerWidth - overlay.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - 32);

    state = {
        ...state,
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
    };
    applyPosition();
}

function startDrag(event) {
    if (
        event.button !== 0 ||
        event.target.closest('button') ||
        overlay.dataset.popout === 'true'
    )
        return;

    const header = event.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    header.setPointerCapture(event.pointerId);

    const move = (moveEvent) =>
        setPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
    const stop = () => {
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', stop);
        header.removeEventListener('pointercancel', stop);
        saveState();
    };

    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', stop);
    header.addEventListener('pointercancel', stop);
}

function onResize() {
    if (overlay && state.x !== null) setPosition(state.x, state.y);
}

function observeSize() {
    resizeObserver = new ResizeObserver(() => {
        if (
            !overlay ||
            state.hidden ||
            state.collapsed ||
            overlay.dataset.popout === 'true'
        )
            return;

        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            state = {
                ...state,
                w: overlay.offsetWidth,
                h: overlay.offsetHeight,
            };
            saveState();
        }, SAVE_DELAY_MS);
    });
    resizeObserver.observe(overlay);
}

function closePopup() {
    if (popup && !popup.closed) popup.close();
}

function dock() {
    if (!popup) return;

    stopLoops();
    popup = null;
    delete overlay.dataset.popout;
    document.body.appendChild(overlay);
    window.removeEventListener('pagehide', closePopup);
    applyState();
}

function copyPageStyles(target) {
    const targetDocument = target.document;

    [...document.documentElement.attributes].forEach(({ name, value }) =>
        targetDocument.documentElement.setAttribute(name, value),
    );
    targetDocument.body.className = `${document.body.className} rovalra-debug-popout`;

    document.head
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) =>
            targetDocument.head.appendChild(
                targetDocument.importNode(node, true),
            ),
        );

    const stylesheet = targetDocument.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('css/rovalra.css');
    targetDocument.head.appendChild(stylesheet);
}

function popOut() {
    if (popup) {
        closePopup();
        return;
    }

    const opened = window.open('', POPUP_NAME, POPUP_FEATURES);
    if (!opened) return;

    stopLoops();
    popup = opened;
    popup.document.title = ts('debugOverlay.title');
    copyPageStyles(popup);

    overlay.dataset.popout = 'true';
    popup.document.body.appendChild(overlay);
    popup.addEventListener('pagehide', dock);
    window.addEventListener('pagehide', closePopup);
    applyState();
}

function applyState() {
    if (!overlay) return;

    applyPosition();
    applySize();
    overlay.hidden = state.hidden;
    overlay.dataset.collapsed = String(state.collapsed);
    ChangeIcon(headerIcons.collapse, {
        icon: state.collapsed ? 'expand_more' : 'expand_less',
    });
    ChangeIcon(headerIcons.popout, {
        icon: popup ? 'close_fullscreen' : 'open_in_new',
    });

    if (state.hidden) {
        closePopup();
        stopLoops();
    } else {
        restartLoops();
    }
}

function setState(changes) {
    state = { ...state, ...changes };
    saveState();
    applyState();
}

function createRow(sectionId, { id, read, level }) {
    const row = createElement('div', 'rovalra-debug-overlay-row');
    const label = createElement('span', 'rovalra-debug-overlay-label');
    const value = createElement('span', 'rovalra-debug-overlay-value');
    row.append(label, value);

    rowUpdaters.push(() => {
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

function createSection(section) {
    const details = createElement('details', 'rovalra-debug-overlay-section');
    details.open = state.sections[section.id] ?? section.open;
    details.addEventListener('toggle', () => {
        state = {
            ...state,
            sections: { ...state.sections, [section.id]: details.open },
        };
        saveState();
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
    rowUpdaters.push(() => {
        summaryText.textContent = ts(`debugOverlay.${section.id}.title`);
    });

    details.append(
        summary,
        ...section.rows.map((row) => createRow(section.id, row)),
    );

    return details;
}

function createHeaderButton(iconName, labelKey, onClick) {
    const icon = Icon({ icon: iconName, material: true, size: ICON_SIZE });
    const button = createSquareButton({
        content: icon,
        width: '32px',
        height: 'height-800',
        paddingX: 'padding-x-none',
        radius: 'radius-medium',
        disableTextTruncation: true,
        onClick,
    });

    button.classList.remove('bg-action-standard', 'content-action-standard');
    button.classList.add('bg-none', 'content-emphasis');
    addTooltip(button, () => ts(labelKey), {
        position: 'bottom',
        showArrow: false,
        shouldShow: () => !popup,
    });
    rowUpdaters.push(() => button.setAttribute('aria-label', ts(labelKey)));

    return { button, icon };
}

function createOverlay() {
    rowUpdaters = [];

    const root = createElement('div', 'rovalra-debug-overlay');
    const header = createElement('div', 'rovalra-debug-overlay-header');
    const title = createElement('span', 'rovalra-debug-overlay-title');
    const popout = createHeaderButton(
        'open_in_new',
        'debugOverlay.popout',
        popOut,
    );
    const collapse = createHeaderButton(
        'expand_less',
        'debugOverlay.collapse',
        () => setState({ collapsed: !state.collapsed }),
    );
    const hide = createHeaderButton('close', 'debugOverlay.hide', () =>
        setState({ hidden: true }),
    );
    const body = createElement('div', 'rovalra-debug-overlay-body');

    headerIcons = { popout: popout.icon, collapse: collapse.icon };
    rowUpdaters.push(() => {
        title.textContent = ts('debugOverlay.title');
    });

    header.addEventListener('pointerdown', startDrag);
    header.append(title, popout.button, collapse.button, hide.button);
    body.append(...SECTIONS.map(createSection));
    root.append(header, body);

    return root;
}

function onKeydown(event) {
    if (event.key !== 'F3' || event.repeat) return;

    event.preventDefault();
    setState({ hidden: !state.hidden });
}

async function mount() {
    if (overlay) return;

    if (!document.body) {
        await new Promise((resolve) =>
            document.addEventListener('DOMContentLoaded', resolve, {
                once: true,
            }),
        );
    }

    const stored = await chrome.storage.local.get(STATE_KEY);
    state = { ...state, ...stored[STATE_KEY] };

    startCollectors();
    overlay = createOverlay();
    document.body.appendChild(overlay);
    observeSize();
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);
    applyState();
}

function unmount() {
    closePopup();
    stopLoops();
    stopCollectors();
    resizeObserver?.disconnect();
    clearTimeout(saveTimer);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);
    overlay?.remove();
    overlay = null;
    popup = null;
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
