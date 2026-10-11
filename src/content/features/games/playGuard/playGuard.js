import { callRobloxApi } from '../../../core/api.js';
import { t, ts } from '../../../core/locale/i18n.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { Icon } from '../../../core/ui/buildericon.ts';
import { getAuthenticatedUserId } from '../../../core/user.js';

const PLAY_BUTTONS = [
    '.play-game-button',
    '.btn-common-play-game-lg',
    '[data-testid="play-button"]',
    '.play-button-overlay button',
    '.rovalra-quick-play-btn',
    '.private-server-join-btn',
].join(', ');
const IGNORED = [
    '.group-join-button',
    '.notification-option',
    '.favorite-button',
    '[data-testid="group-button"]',
].join(', ');
const PLAY_ICON = '.icon-common-play, svg, span[class*="icon"], icon';
const GUARDED_EVENTS = [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'click',
];

const STORAGE_KEY = 'playGuardPausedUntil';
const PAUSE_HOURS = { '1h': 1, '8h': 8 };
const CACHE_MS = 2500;
const POLL_MS = 8000;
const IN_GAME = 2;

const STYLE = `
.rovalra-pg-hidden { display: none !important; }
.rovalra-pg-overlay {
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(3px);
    font-family: 'Builder Sans', 'Gotham SSm', Arial, sans-serif;
}
.rovalra-pg-popup {
    width: min(92vw, 400px); box-sizing: border-box; padding: 16px 20px 20px;
    color: #fff; background: #1f2125; border: 1px solid #393b3d;
    border-radius: 12px; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
}
.rovalra-pg-header { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; }
.rovalra-pg-header img { width: 28px; height: 28px; }
.rovalra-pg-header h2 { flex: 1; margin: 0; font-size: 20px; font-weight: 700; }
.rovalra-pg-close {
    display: flex; padding: 4px; border: 0; background: none;
    color: #bdbebe; cursor: pointer;
}
.rovalra-pg-close:hover { color: #fff; }
.rovalra-pg-popup hr { margin: 0 0 14px; border: 0; border-top: 1px solid #393b3d; }
.rovalra-pg-popup p { margin: 0 0 20px; font-size: 14px; line-height: 1.45; color: #bdbebe; }
.rovalra-pg-label {
    margin-bottom: 10px; font-size: 12px; font-weight: 700;
    letter-spacing: 0.4px; text-transform: uppercase;
}
.rovalra-pg-actions { display: flex; justify-content: flex-end; gap: 10px; }
.rovalra-pg-btn {
    height: 36px; padding: 0 16px; border-radius: 8px; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 700; color: #fff;
    background: transparent; border: 1px solid #bdbebe;
}
.rovalra-pg-btn:hover { background: rgba(255, 255, 255, 0.08); }
.rovalra-pg-btn.primary { background: #335fff; border-color: #335fff; }
.rovalra-pg-btn.primary:hover { background: #2a4fd6; }
.rovalra-pg-link {
    display: block; margin: 14px auto 0; padding: 4px 8px; border: 0;
    background: none; cursor: pointer; font: inherit; font-size: 13px; color: #8a8c8e;
}
.rovalra-pg-link:hover { color: #fff; }
`;

let inGame = false;
let checkedAt = 0;
let pausedUntil = 0;
let allowClick = false;
let deciding = false;
let overlay = null;

const isPaused = () => Date.now() < pausedUntil;
const isLocked = () => inGame && !isPaused();

function shouldSkip(button) {
    // RoValra's own private servers button (server icon) should stay as is
    return (
        button.closest(IGNORED) || button.querySelector('path[d^="M20 13H4"]')
    );
}

async function refreshPresence(force = false) {
    if (!force && Date.now() - checkedAt < CACHE_MS) return inGame;

    try {
        const userId = await getAuthenticatedUserId();
        if (!userId) return inGame;

        const res = await callRobloxApi({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [Number(userId)] },
            noCache: true,
        });
        const { userPresences } = await res.json();

        inGame = userPresences[0].userPresenceType === IN_GAME;
        checkedAt = Date.now();
        updateButtons();
    } catch (err) {
        console.warn('RoValra: Play Guard presence check failed', err);
    }
    return inGame;
}

function updateButton(button) {
    if (shouldSkip(button)) return;

    const lock = button.querySelector('.rovalra-pg-lock');
    if (isLocked() && !lock) {
        button.querySelector(PLAY_ICON)?.classList.add('rovalra-pg-hidden');
        button.prepend(
            Icon({
                icon: 'lock',
                material: true,
                filled: true,
                size: 'large',
                classes: ['rovalra-pg-lock'],
            }),
        );
    } else if (!isLocked()) {
        lock?.remove();
        button
            .querySelectorAll('.rovalra-pg-hidden')
            .forEach((el) => el.classList.remove('rovalra-pg-hidden'));
    }
}

function updateButtons() {
    document.querySelectorAll(PLAY_BUTTONS).forEach(updateButton);
}

function launch(button) {
    allowClick = true;
    button.click();
    allowClick = false;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function closePopup() {
    overlay?.remove();
    overlay = null;
    deciding = false;
}

function openPopup(button) {
    const logo = el('img');
    logo.src = chrome.runtime.getURL('public/Assets/RoValraLogo.png');
    logo.alt = 'RoValra';
    logo.onerror = () => logo.remove();

    const close = el('button', 'rovalra-pg-close');
    close.ariaLabel = ts('playGuard.close');
    close.append(Icon({ icon: 'close', material: true, size: 'medium' }));
    close.onclick = closePopup;

    const header = el('div', 'rovalra-pg-header');
    header.append(logo, el('h2', '', ts('playGuard.title')), close);

    const cancel = el('button', 'rovalra-pg-btn', ts('playGuard.cancel'));
    const go = el('button', 'rovalra-pg-btn primary', ts('playGuard.launch'));
    const more = el('button', 'rovalra-pg-link', ts('playGuard.disable'));
    const actions = el('div', 'rovalra-pg-actions');
    actions.append(cancel, go);

    const main = el('div');
    main.append(el('p', '', ts('playGuard.body')), actions, more);

    const pause = el('div');
    pause.hidden = true;
    const back = el('button', 'rovalra-pg-link', ts('playGuard.back'));
    const choices = el('div', 'rovalra-pg-actions');
    for (const [key, hours] of Object.entries(PAUSE_HOURS)) {
        const choice = el(
            'button',
            'rovalra-pg-btn',
            ts(`playGuard.pause${key}`),
        );
        choice.onclick = async () => {
            pausedUntil = Date.now() + hours * 36e5;
            await chrome.storage.local.set({ [STORAGE_KEY]: pausedUntil });
            closePopup();
            updateButtons();
            launch(button);
        };
        choices.append(choice);
    }
    pause.append(
        el('div', 'rovalra-pg-label', ts('playGuard.pauseTitle')),
        choices,
        back,
    );

    cancel.onclick = closePopup;
    go.onclick = () => {
        closePopup();
        launch(button);
    };
    more.onclick = back.onclick = () => {
        main.hidden = !main.hidden;
        pause.hidden = !pause.hidden;
    };

    const popup = el('div', 'rovalra-pg-popup');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.append(header, el('hr'), main, pause);

    overlay = el('div', 'rovalra-pg-overlay');
    overlay.onclick = (e) => e.target === overlay && closePopup();
    overlay.append(popup);
    document.body.append(overlay);
}

async function askBeforeLaunch(button) {
    deciding = true;
    if (await refreshPresence()) return openPopup(button);

    deciding = false;
    launch(button);
}

function guard(event) {
    if (allowClick || isPaused()) return;

    const button =
        event.target instanceof Element && event.target.closest(PLAY_BUTTONS);
    if (!button || shouldSkip(button)) return;

    if (event.type !== 'click') {
        if (inGame) event.stopImmediatePropagation();
        return;
    }
    if (!inGame && Date.now() - checkedAt < CACHE_MS) return;

    // hold the click until we know if the user is in a game
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!deciding) askBeforeLaunch(button);
}

function poll() {
    if (!document.hidden && !isPaused()) refreshPresence(true);
}

export async function init() {
    if (!(await settings.PlayGuard)) return;

    const stored = await chrome.storage.local.get(STORAGE_KEY);
    pausedUntil = stored[STORAGE_KEY] || 0;
    await t('playGuard.title');

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);

    GUARDED_EVENTS.forEach((type) =>
        window.addEventListener(type, guard, true),
    );
    observeElement(PLAY_BUTTONS, updateButton, { multiple: true });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        pausedUntil = changes[STORAGE_KEY].newValue || 0;
        updateButtons();
    });

    document.addEventListener('visibilitychange', poll);
    setInterval(poll, POLL_MS);
    poll();
}
