import { observeResize } from '../observer.js';
import { ts } from '../locale/i18n.js';
import { getAssets } from '../assets.js';
import { ChangeIcon, Icon } from './buildericon.js';
import { createSquareButton } from './profile/header/squarebutton.js';
import { addTooltip } from './tooltip.js';

const SAVE_DELAY_MS = 250;
const ICON_SIZE = '20px';
const POPUP_FEATURES = 'popup=yes,width=460,height=760';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ICONS = {
    close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    expand_less: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z',
    expand_more: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
    open_in_new:
        'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    close_fullscreen:
        'M22 3.41 16.71 8.7 20 12h-8V4l3.29 3.29L20.59 2 22 3.41zM3.41 22l5.29-5.29L12 20v-8H4l3.29 3.29L2 20.59 3.41 22z',
};
const ISOLATED_EVENTS = [
    'keydown',
    'keyup',
    'keypress',
    'pointerdown',
    'mousedown',
];

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createSvgIcon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const path = document.createElementNS(SVG_NS, 'path');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', ICON_SIZE);
    svg.setAttribute('height', ICON_SIZE);
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', SVG_ICONS[name]);
    svg.append(path);

    return {
        element: svg,
        set: (icon) => path.setAttribute('d', SVG_ICONS[icon]),
    };
}

/**
 * @param {object} options
 * @param {string} options.id Used for the panel class name and pop out window name.
 * @param {string} options.stateKey chrome.storage.local key the panel state is saved under.
 * @param {string} options.titleKey Locale key for the header title.
 * @param {{ popout: string, collapse: string, hide: string }} options.labelKeys Locale keys for the header buttons.
 * @param {string} [options.keybind] KeyboardEvent.key that toggles the panel.
 * @param {boolean} [options.popout] Show the pop out button.
 * @param {boolean} [options.customButtons] Use RoValra styled header buttons with svg icons instead of Roblox ones, for pages without Roblox's css or icon fonts.
 * @param {boolean} [options.showLogo] Show the RoValra logo before the header title.
 * @param {boolean} [options.isolateInput] Keep keyboard and form field mouse events inside the panel from reaching the page. Create the panel early (at module load) so this runs before the page's own listeners.
 * @param {(context: { body: HTMLElement, track: (fn: () => void) => void, getState: () => object, saveState: (changes: object) => void }) => void} options.build
 * @param {(host: Window) => void} [options.onShow] Called whenever the panel becomes visible, with the window it lives in.
 * @param {(host: Window) => void} [options.onHide] Called whenever the panel stops being visible in a window.
 */
export function createFloatingPanel({
    id,
    stateKey,
    titleKey,
    labelKeys,
    keybind,
    popout: allowPopout = false,
    customButtons = false,
    showLogo = true,
    isolateInput = false,
    build,
    onShow,
    onHide,
}) {
    let panel = null;
    let popup = null;
    let updaters = [];
    let headerIcons = {};
    let state = {
        hidden: false,
        collapsed: false,
        x: null,
        y: null,
        w: null,
        h: null,
    };
    let visible = false;
    let resizeHandle = null;
    let saveTimer = null;
    let tooltip = null;

    const getHost = () => popup ?? window;

    if (isolateInput) {
        const isolate = (event) => {
            if (!panel?.contains(event.target)) return;
            if (
                event.type.startsWith('key') ||
                event.target.matches?.('input, textarea, select')
            ) {
                event.stopImmediatePropagation();
            }
        };
        ISOLATED_EVENTS.forEach((type) =>
            window.addEventListener(type, isolate, true),
        );
    }

    function persist() {
        chrome.storage.local.set({ [stateKey]: state });
    }

    function update() {
        updaters.forEach((fn) => fn());
    }

    function show() {
        if (visible) return;
        visible = true;
        update();
        onShow?.(getHost());
    }

    function hide() {
        if (!visible) return;
        visible = false;
        onHide?.(getHost());
    }

    function applyPosition() {
        if (!panel || state.x === null) return;

        panel.style.setProperty('--rovalra-overlay-x', `${state.x}px`);
        panel.style.setProperty('--rovalra-overlay-y', `${state.y}px`);
    }

    function applySize() {
        if (!panel) return;

        if (state.w)
            panel.style.setProperty('--rovalra-overlay-w', `${state.w}px`);
        if (state.h)
            panel.style.setProperty('--rovalra-overlay-h', `${state.h}px`);
    }

    function setPosition(x, y) {
        const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
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
            panel.dataset.popout === 'true'
        )
            return;

        const header = event.currentTarget;
        const rect = panel.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        header.setPointerCapture(event.pointerId);

        const move = (moveEvent) =>
            setPosition(
                moveEvent.clientX - offsetX,
                moveEvent.clientY - offsetY,
            );
        const stop = () => {
            header.removeEventListener('pointermove', move);
            header.removeEventListener('pointerup', stop);
            header.removeEventListener('pointercancel', stop);
            persist();
        };

        header.addEventListener('pointermove', move);
        header.addEventListener('pointerup', stop);
        header.addEventListener('pointercancel', stop);
    }

    function onResize() {
        if (panel && state.x !== null) setPosition(state.x, state.y);
    }

    function observeSize() {
        resizeHandle = observeResize(panel, () => {
            if (
                !panel ||
                state.hidden ||
                state.collapsed ||
                panel.dataset.popout === 'true'
            )
                return;

            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                state = {
                    ...state,
                    w: panel.offsetWidth,
                    h: panel.offsetHeight,
                };
                persist();
            }, SAVE_DELAY_MS);
        });
    }

    function closePopup() {
        if (popup && !popup.closed) popup.close();
    }

    function dock() {
        if (!popup) return;

        hide();
        popup = null;
        delete panel.dataset.popout;
        document.body.appendChild(panel);
        window.removeEventListener('pagehide', closePopup);
        applyState();
    }

    function copyPageStyles(target) {
        const targetDocument = target.document;

        [...document.documentElement.attributes].forEach(({ name, value }) =>
            targetDocument.documentElement.setAttribute(name, value),
        );
        targetDocument.body.className = `${document.body.className} rovalra-overlay-popout`;

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

        const opened = window.open('', `rovalra-${id}`, POPUP_FEATURES);
        if (!opened) return;

        hide();
        popup = opened;
        popup.document.title = ts(titleKey);
        copyPageStyles(popup);

        panel.dataset.popout = 'true';
        popup.document.body.appendChild(panel);
        popup.addEventListener('pagehide', dock);
        window.addEventListener('pagehide', closePopup);
        applyState();
    }

    function applyState() {
        if (!panel) return;

        applyPosition();
        applySize();
        panel.hidden = state.hidden;
        panel.dataset.collapsed = String(state.collapsed);
        headerIcons.collapse(state.collapsed ? 'expand_more' : 'expand_less');
        headerIcons.popout?.(popup ? 'close_fullscreen' : 'open_in_new');

        if (state.hidden) {
            closePopup();
            hide();
        } else {
            show();
        }
    }

    function setState(changes) {
        state = { ...state, ...changes };
        persist();
        applyState();
    }

    function showTooltip(button, labelKey) {
        hideTooltip();

        tooltip = createElement('div', 'rovalra-overlay-tooltip', ts(labelKey));
        document.body.appendChild(tooltip);

        const rect = button.getBoundingClientRect();
        const left = Math.min(
            Math.max(8, rect.right - tooltip.offsetWidth),
            window.innerWidth - tooltip.offsetWidth - 8,
        );
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${rect.bottom + 6}px`;
    }

    function hideTooltip() {
        tooltip?.remove();
        tooltip = null;
    }

    function createHeaderButton(iconName, labelKey, onClick) {
        if (customButtons) {
            const icon = createSvgIcon(iconName);
            const button = createElement('button', 'rovalra-overlay-button');
            button.type = 'button';
            button.append(icon.element);
            button.addEventListener('click', (event) => {
                hideTooltip();
                onClick(event);
            });
            button.addEventListener('mouseenter', () =>
                showTooltip(button, labelKey),
            );
            button.addEventListener('focus', () =>
                showTooltip(button, labelKey),
            );
            button.addEventListener('mouseleave', hideTooltip);
            button.addEventListener('blur', hideTooltip);
            updaters.push(() =>
                button.setAttribute('aria-label', ts(labelKey)),
            );

            return { button, setIcon: icon.set };
        }

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

        button.classList.remove(
            'bg-action-standard',
            'content-action-standard',
        );
        button.classList.add('bg-none', 'content-emphasis');
        addTooltip(button, () => ts(labelKey), {
            position: 'bottom',
            showArrow: false,
            shouldShow: () => !popup,
        });
        updaters.push(() => button.setAttribute('aria-label', ts(labelKey)));

        return { button, setIcon: (name) => ChangeIcon(icon, { icon: name }) };
    }

    function createPanel() {
        updaters = [];

        const root = createElement('div', `rovalra-overlay rovalra-${id}`);
        const header = createElement('div', 'rovalra-overlay-header');
        const title = createElement('span', 'rovalra-overlay-title');
        const collapse = createHeaderButton(
            'expand_less',
            labelKeys.collapse,
            () => setState({ collapsed: !state.collapsed }),
        );
        const close = createHeaderButton('close', labelKeys.hide, () =>
            setState({ hidden: true }),
        );
        const body = createElement('div', 'rovalra-overlay-body');

        updaters.push(() => {
            title.textContent = ts(titleKey);
        });
        if (showLogo) {
            const logo = createElement('img', 'rovalra-overlay-logo');
            logo.src = getAssets().rovalraIcon;
            logo.alt = '';
            logo.draggable = false;
            logo.dataset.rovalraAsset = 'rovalraIcon';
            header.append(logo);
        }
        header.append(title);
        headerIcons = { collapse: collapse.setIcon };

        if (allowPopout) {
            const popoutButton = createHeaderButton(
                'open_in_new',
                labelKeys.popout,
                popOut,
            );
            headerIcons.popout = popoutButton.setIcon;
            header.append(popoutButton.button);
        }

        header.addEventListener('pointerdown', startDrag);
        header.append(collapse.button, close.button);
        root.append(header, body);

        build({
            body,
            track: (fn) => updaters.push(fn),
            getState: () => state,
            saveState: (changes) => {
                state = { ...state, ...changes };
                persist();
            },
        });

        return root;
    }

    function onKeydown(event) {
        if (
            event.key !== keybind ||
            event.repeat ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
        )
            return;

        event.preventDefault();
        setState({ hidden: !state.hidden });
    }

    async function mount(overrides = {}) {
        if (panel) return;

        if (!document.body) {
            await new Promise((resolve) =>
                document.addEventListener('DOMContentLoaded', resolve, {
                    once: true,
                }),
            );
        }

        const stored = await chrome.storage.local.get(stateKey);
        if (panel) return;
        state = { ...state, ...stored[stateKey], ...overrides };

        panel = createPanel();
        document.body.appendChild(panel);
        observeSize();
        if (keybind) window.addEventListener('keydown', onKeydown, true);
        window.addEventListener('resize', onResize);
        applyState();
    }

    function unmount() {
        hideTooltip();
        closePopup();
        hide();
        resizeHandle?.unobserve();
        resizeHandle = null;
        clearTimeout(saveTimer);
        window.removeEventListener('keydown', onKeydown, true);
        window.removeEventListener('resize', onResize);
        panel?.remove();
        panel = null;
        popup = null;
    }

    return { mount, unmount, update, setState, getHost };
}
