import { callRobloxApi } from '../../../core/api.js';
import { t, ts } from '../../../core/locale/i18n.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { Icon } from '../../../core/ui/buildericon.ts';

const PLAY =
    '.play-game-button, .btn-common-play-game-lg, [data-testid="play-button"], .play-button-overlay button, .rovalra-quick-play-btn, .private-server-join-btn';
const IGNORE =
    '.group-join-button, .notification-option, .favorite-button, [data-testid="group-button"]';
const PLAY_ICON = '.icon-common-play, svg, span[class*="icon"], icon';
const STORAGE_KEY = 'playGuardUntil';
const FRESH = 2500;
const HOURS = { '1h': 1, '8h': 8 };

const CSS = `
    .wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.7); backdrop-filter: blur(4px); opacity: 0; pointer-events: none; transition: opacity .2s ease;
        font-family: 'Builder Sans', 'Gotham', 'Haptik', Arial, sans-serif; }
    .wrap.show { opacity: 1; pointer-events: auto; }
    .card { width: 88%; max-width: 360px; padding: 24px; box-sizing: border-box; text-align: center; color: #fff;
        background: #232527; border: 1px solid #393b3d; border-radius: 16px; box-shadow: 0 12px 36px rgba(0,0,0,.6);
        transform: translateY(8px) scale(.97); transition: transform .2s ease; }
    .wrap.show .card { transform: none; }
    h3 { margin: 0 0 8px; font-size: 20px; font-weight: 700; letter-spacing: -.3px; }
    p { margin: 0 0 24px; font-size: 14px; line-height: 1.45; color: #bdbebe; }
    .btn { display: block; width: 100%; padding: 12px; border: 0; border-radius: 10px; cursor: pointer;
        font: inherit; font-size: 14px; font-weight: 700; color: #bdbebe; background: rgba(255,255,255,.06); transition: background .15s; }
    .btn:hover { background: rgba(255,255,255,.12); }
    .btn.go { color: #fff; background: #0066ff; }
    .btn.go:hover { background: #0055dd; }
    .btn + .btn { margin-top: 10px; }
    .link { margin-top: 14px; padding: 4px 8px; border: 0; background: none; cursor: pointer;
        font: inherit; font-size: 13px; color: #8a8c8e; }
    .link:hover { color: #fff; }
`;

let userId = null;
let inGame = false;
let lastCheck = 0;
let disabledUntil = 0;
let bypass = false;
let busy = false;
let modal = null;
let queued = false;

const isOff = () => Date.now() < disabledUntil;
const isLocked = () => inGame && !isOff();
// RoValra's own private servers button (server icon) stays untouched
const skip = (btn) =>
    btn.closest(IGNORE) || btn.querySelector('path[d^="M20 13H4"]');

async function loadState() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    disabledUntil = stored[STORAGE_KEY] || 0;
}

function saveUntil(timestamp) {
    disabledUntil = timestamp;
    chrome.storage.local.set({ [STORAGE_KEY]: timestamp });
}

async function getUserId() {
    if (userId) return userId;
    try {
        userId = await getAuthenticatedUserId();
    } catch (e) {
        console.warn('RoValra: Play Guard could not get the user id', e);
    }
    return userId;
}

async function check(force) {
    if (!force && Date.now() - lastCheck < FRESH) return inGame;
    const id = await getUserId();
    if (!id) return inGame;
    try {
        const res = await callRobloxApi({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [+id] },
            noCache: true,
        });
        const data = await res.json();
        // type 2 = in game
        inGame = data.userPresences[0].userPresenceType === 2;
        lastCheck = Date.now();
        refreshUI();
    } catch (e) {
        console.warn('RoValra: Play Guard presence check failed', e);
    }
    return inGame;
}

function applyLock(btn) {
    if (skip(btn)) return;
    const lock = btn.querySelector('.rg-lock');
    if (isLocked() && !lock) {
        const icon = btn.querySelector(PLAY_ICON);
        if (icon) {
            icon.dataset.rgHidden = '1';
            icon.style.display = 'none';
        }
        btn.prepend(
            Icon({
                icon: 'lock',
                material: true,
                filled: true,
                size: 'large',
                classes: ['rg-lock'],
            }),
        );
    } else if (!isLocked()) {
        lock?.remove();
        btn.querySelectorAll('[data-rg-hidden]').forEach((icon) => {
            icon.style.display = '';
            delete icon.dataset.rgHidden;
        });
    }
}

function refreshUI() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        document.querySelectorAll(PLAY).forEach(applyLock);
    });
}

function launch(btn) {
    bypass = true;
    btn.click();
    bypass = false;
}

function closeModal() {
    busy = false;
    const current = modal;
    modal = null;
    if (!current) return;
    current.classList.remove('show');
    setTimeout(() => current.getRootNode().host.remove(), 200);
}

function make(tag, className, text, action) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    if (action) node.dataset.a = action;
    return node;
}

function showModal(btn) {
    const host = document.createElement('rg-guard');
    host.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:block;pointer-events:none';
    const root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;

    const first = make('div', 'first');
    first.append(
        make('button', 'btn go', ts('playGuard.launch'), 'go'),
        make('button', 'btn', ts('playGuard.cancel'), 'cancel'),
        make('button', 'link', ts('playGuard.disable'), 'more'),
    );

    const opts = make('div', 'opts');
    opts.hidden = true;
    opts.append(
        make('button', 'btn', ts('playGuard.disable1h'), '1h'),
        make('button', 'btn', ts('playGuard.disable8h'), '8h'),
        make('button', 'link', ts('playGuard.back'), 'back'),
    );

    const card = make('div', 'card');
    card.append(
        make('h3', '', ts('playGuard.title')),
        make('p', '', ts('playGuard.body')),
        first,
        opts,
    );
    const wrap = make('div', 'wrap');
    wrap.append(card);

    root.append(style, wrap);
    document.documentElement.appendChild(host);

    modal = wrap;
    wrap.onclick = (e) => {
        const a = e.target.dataset.a;
        if (e.target === wrap || a === 'cancel') return closeModal();
        if (a === 'more' || a === 'back') {
            first.hidden = a === 'more';
            opts.hidden = a === 'back';
        } else if (a === 'go') {
            closeModal();
            launch(btn);
        } else if (HOURS[a]) {
            saveUntil(Date.now() + HOURS[a] * 36e5);
            closeModal();
            refreshUI();
            launch(btn);
        }
    };
    void wrap.offsetWidth;
    wrap.classList.add('show');
}

async function handle(btn) {
    busy = true;
    if (await check()) return showModal(btn);
    busy = false;
    launch(btn);
}

function guard(e) {
    if (bypass || isOff()) return;
    const btn = e.target instanceof Element && e.target.closest(PLAY);
    if (!btn || skip(btn)) return;

    if (e.type !== 'click') {
        if (inGame) e.stopImmediatePropagation();
        return;
    }
    if (Date.now() - lastCheck < FRESH && !inGame) return;

    // block right away, check afterwards
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!busy) handle(btn);
}

function poll() {
    if (!document.hidden && !isOff()) check(true);
}

export async function init() {
    if (!(await settings.PlayGuard)) return;
    await loadState();
    await t('playGuard.title');

    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(
        (type) => window.addEventListener(type, guard, true),
    );

    observeElement(PLAY, applyLock, { multiple: true });
    document.addEventListener('visibilitychange', poll);
    setInterval(poll, 8000);
    poll();
}
