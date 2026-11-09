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
    '[data-radix-popper-content-wrapper] .foundation-web-button.bg-action-emphasis',
].join(', ');
const IGNORED =
    '.group-join-button, .notification-option, .favorite-button, [data-testid="group-button"]';
const PLAY_ICON = '.icon-common-play, svg, span[class*="icon"], icon';
const EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];

const KEY = 'playGuardPausedUntil';
const PAUSES = { '1h': 1, '8h': 8 };
const CACHE_MS = 2500;
const POLL_MS = 8000;
const IN_GAME = 2;

let inGame = false;
let checkedAt = 0;
let pausedUntil = 0;
let allowClick = false;
let deciding = false;
let overlay = null;

const paused = () => Date.now() < pausedUntil;
const locked = () => inGame && !paused();

// the private servers button (server icon) stays untouched
const skip = (btn) =>
    btn.closest(IGNORED) || btn.querySelector('path[d^="M20 13H4"]');

async function refreshPresence(force) {
    if (!force && Date.now() - checkedAt < CACHE_MS) return inGame;

    try {
        const id = await getAuthenticatedUserId();
        if (!id) return inGame;

        const res = await callRobloxApi({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [Number(id)] },
            noCache: true,
        });
        const { userPresences } = await res.json();

        inGame = userPresences[0].userPresenceType === IN_GAME;
        checkedAt = Date.now();
        updateButtons();
    } catch (e) {
        console.warn('RoValra: Play Guard presence check failed', e);
    }
    return inGame;
}

function updateButton(btn) {
    if (skip(btn)) return;

    const lock = btn.querySelector('.rovalra-pg-lock');
    if (locked() && !lock) {
        btn.querySelector(PLAY_ICON)?.classList.add('rovalra-pg-hidden');
        btn.prepend(
            Icon({
                icon: 'lock',
                material: true,
                filled: true,
                size: 'large',
                classes: ['rovalra-pg-lock'],
            }),
        );
    } else if (!locked()) {
        lock?.remove();
        btn.querySelectorAll('.rovalra-pg-hidden').forEach((e) =>
            e.classList.remove('rovalra-pg-hidden'),
        );
    }
}

const updateButtons = () =>
    document.querySelectorAll(PLAY_BUTTONS).forEach(updateButton);

function launch(btn) {
    allowClick = true;
    btn.click();
    allowClick = false;
}

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
}

function closePopup() {
    overlay?.remove();
    overlay = null;
    deciding = false;
}

function openPopup(btn) {
    const logo = el('img');
    logo.src = chrome.runtime.getURL('public/Assets/RoValraLogo.png');
    logo.alt = 'RoValra';
    logo.onerror = () => logo.remove();

    const x = el('button', 'rovalra-pg-close');
    x.ariaLabel = ts('playGuard.close');
    x.append(Icon({ icon: 'close', material: true, size: 'medium' }));
    x.onclick = closePopup;

    const header = el('div', 'rovalra-pg-header');
    header.append(logo, el('h2', '', ts('playGuard.title')), x);

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
    for (const [key, hours] of Object.entries(PAUSES)) {
        const b = el('button', 'rovalra-pg-btn', ts(`playGuard.pause${key}`));
        b.onclick = async () => {
            pausedUntil = Date.now() + hours * 36e5;
            await chrome.storage.local.set({ [KEY]: pausedUntil });
            closePopup();
            updateButtons();
            launch(btn);
        };
        choices.append(b);
    }
    pause.append(
        el('div', 'rovalra-pg-label', ts('playGuard.pauseTitle')),
        choices,
        back,
    );

    cancel.onclick = closePopup;
    go.onclick = () => {
        closePopup();
        launch(btn);
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
    ['pointerdown', 'focusin'].forEach((type) =>
        overlay.addEventListener(type, (e) => e.stopPropagation()),
    );
    overlay.append(popup);
    document.body.append(overlay);
}

async function askBeforeLaunch(btn) {
    deciding = true;
    if (await refreshPresence()) return openPopup(btn);

    deciding = false;
    launch(btn);
}

function guard(e) {
    if (allowClick || paused()) return;

    const btn = e.target instanceof Element && e.target.closest(PLAY_BUTTONS);
    if (!btn || skip(btn)) return;

    if (e.type !== 'click') {
        if (inGame) e.stopImmediatePropagation();
        return;
    }
    if (!inGame && Date.now() - checkedAt < CACHE_MS) return;

    // hold the click until we know if the user is in a game
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!deciding) askBeforeLaunch(btn);
}

function poll() {
    if (!document.hidden && !paused()) refreshPresence(true);
}

export async function init() {
    if (!(await settings.playGuardEnabled)) return;

    const stored = await chrome.storage.local.get(KEY);
    pausedUntil = stored[KEY] || 0;
    await t('playGuard.title');

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('css/play-guard.css');
    document.head.append(stylesheet);

    EVENTS.forEach((type) => window.addEventListener(type, guard, true));
    observeElement(PLAY_BUTTONS, updateButton, { multiple: true });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[KEY]) return;
        pausedUntil = changes[KEY].newValue || 0;
        updateButtons();
    });

    document.addEventListener('visibilitychange', poll);
    setInterval(poll, POLL_MS);
    poll();
}
