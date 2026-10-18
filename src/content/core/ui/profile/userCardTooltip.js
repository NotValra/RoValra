import { getBatchThumbnails } from '../../thumbnail/thumbnails.js';
import { ts } from '../../locale/i18n.js';
import { followUser, openWebChat } from '../../utils/launcher.js';

const TOOLTIP_CLASS = 'rovalra-user-card-tooltip';
const HIDE_DELAY_MS = 120;

const L = (key, options) => ts(`friendsCarouselRedesign.${key}`, options);

const FOUNDATION_BTN_BASE =
    'foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-medium height-1000 padding-x-medium grow';
const FOUNDATION_BTN_OVERLAY =
    'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

const placeThumbCache = new Map();

let activeTooltip = null;
let activeAnchor = null;
let hideTimer = null;
let scrollListenerAttached = false;

function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

function makeFoundationButton(label, emphasis) {
    const btn = el(
        'button',
        `${FOUNDATION_BTN_BASE} ${
            emphasis
                ? 'bg-action-emphasis content-action-emphasis'
                : 'bg-action-standard content-action-standard'
        }`,
    );
    btn.type = 'button';
    const span = el('span', 'flex items-center min-width-0 gap-small');
    span.textContent = label;
    btn.append(el('div', FOUNDATION_BTN_OVERLAY), span);
    return btn;
}

function getPlaceThumb(placeId) {
    const key = Number(placeId);
    if (!placeThumbCache.has(key)) {
        placeThumbCache.set(
            key,
            getBatchThumbnails([key], 'PlaceIcon', '150x150')
                .then((thumbs) => thumbs?.[0]?.imageUrl || null)
                .catch(() => {
                    placeThumbCache.delete(key);
                    return null;
                }),
        );
    }
    return placeThumbCache.get(key);
}

function onViewportChange() {
    if (!activeTooltip || !activeAnchor) return;
    if (!activeAnchor.isConnected) {
        removeUserCardTooltip();
        return;
    }
    positionTooltip(activeTooltip, activeAnchor);
}

function attachScrollListener() {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;
    window.addEventListener('scroll', onViewportChange, {
        capture: true,
        passive: true,
    });
    window.addEventListener('resize', onViewportChange, { passive: true });
}

function detachScrollListener() {
    if (!scrollListenerAttached) return;
    scrollListenerAttached = false;
    window.removeEventListener('scroll', onViewportChange, { capture: true });
    window.removeEventListener('resize', onViewportChange);
}

function positionTooltip(tooltip, anchor) {
    const margin = 8;
    const rect = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = tooltip;

    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));

    let top = rect.bottom + margin;
    if (top + h > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - h - margin);
    }

    tooltip.style.left = `${Math.round(left + window.scrollX)}px`;
    tooltip.style.top = `${Math.round(top + window.scrollY)}px`;
}

function buildTooltip({ userId, displayName, presence }) {
    const name = displayName || L('friendFallback');

    const wrapper = el(
        'div',
        `${TOOLTIP_CLASS} friend-tile-dropdown friend-tile-dropdown--iarc`,
    );
    const card = el(
        'div',
        'in-game-friend-card--iarc flex flex-col items-start justify-center padding-y-large padding-x-large gap-medium radius-medium stroke-standard stroke-default bg-over-media-300 width-full',
    );

    const type = presence?.userPresenceType ?? 0;
    const rootPlaceId = presence?.rootPlaceId || presence?.placeId || null;
    const inGame = type === 2 && rootPlaceId;

    if (inGame) {
        const link = el(
            'a',
            'flex items-center gap-small width-full min-width-0',
        );
        link.href = `https://www.roblox.com/games/${rootPlaceId}`;

        const thumb = el('span', 'rovalra-uct-thumb loading');
        const img = el('img');
        img.alt = '';
        const stopShimmer = () => thumb.classList.remove('loading');
        img.addEventListener('load', stopShimmer);
        img.addEventListener('error', stopShimmer);
        thumb.appendChild(img);
        getPlaceThumb(rootPlaceId).then((url) => {
            if (url) img.src = url;
            else stopShimmer();
        });

        const info = el(
            'span',
            'friend-presence-info flex flex-col justify-center min-width-0 fill',
        );
        const line1 = el(
            'span',
            'friend-tile-is-playing text-body-medium content-default text-truncate-end text-no-wrap',
        );
        line1.textContent = L('isPlaying', { name });
        const line2 = el(
            'span',
            'friend-tile-game-name text-title-medium content-emphasis text-truncate-end text-no-wrap',
        );
        line2.textContent = presence?.lastLocation || '';
        info.append(line1, line2);
        link.append(thumb, info);
        card.appendChild(link);
    } else {
        const info = el(
            'span',
            'friend-presence-info flex flex-col justify-center min-width-0 fill width-full',
        );
        const line1 = el(
            'span',
            'friend-tile-game-name text-title-medium content-emphasis text-truncate-end text-no-wrap',
        );
        line1.textContent = name;
        const line2 = el(
            'span',
            'friend-tile-is-playing text-body-medium content-default text-truncate-end text-no-wrap',
        );
        line2.textContent =
            type === 2
                ? ts('common.playing')
                : type === 1
                  ? L('online')
                  : type === 3
                    ? L('inStudio')
                    : L('offline');
        info.append(line1, line2);
        card.appendChild(info);
    }

    const actions = el(
        'div',
        'in-game-friend-card-actions flex flex-col self-stretch gap-small',
    );

    if (inGame) {
        const joinBtn = makeFoundationButton(L('join'), true);
        joinBtn.addEventListener('click', () => {
            followUser(userId);
            removeUserCardTooltip();
        });
        actions.appendChild(joinBtn);
    }

    const chatBtn = makeFoundationButton(L('chat'), false);
    chatBtn.addEventListener('click', () => {
        openWebChat(userId);
        removeUserCardTooltip();
    });
    actions.appendChild(chatBtn);

    const profileLink = el(
        'a',
        'foundation-web-link inline-flex items-center gap-xsmall content-emphasis no-underline motion-safe:transition-opacity hover:cursor-pointer hover:[opacity:0.8] radius-medium flex items-center justify-center self-stretch height-1000 padding-x-medium text-label-medium content-action-standard',
    );
    profileLink.href = `https://www.roblox.com/users/${userId}/profile`;
    profileLink.textContent = L('viewProfile');
    actions.appendChild(profileLink);

    card.appendChild(actions);
    wrapper.appendChild(card);

    wrapper.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    wrapper.addEventListener('mouseleave', scheduleHide);

    return wrapper;
}

function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(removeUserCardTooltip, HIDE_DELAY_MS);
}

function showTooltip(anchor) {
    const data = anchor.rovalraTooltipData;
    if (!data) return;

    removeUserCardTooltip();

    const tooltip = buildTooltip({
        ...data,
        presence: anchor.rovalraPresence || null,
    });
    tooltip.style.visibility = 'hidden';
    document.body.appendChild(tooltip);
    positionTooltip(tooltip, anchor);
    tooltip.style.visibility = '';

    activeTooltip = tooltip;
    activeAnchor = anchor;
    attachScrollListener();
}

export function removeUserCardTooltip() {
    clearTimeout(hideTimer);
    activeTooltip?.remove();
    activeTooltip = null;
    activeAnchor = null;
    detachScrollListener();
}

export function refreshUserCardTooltip(anchor) {
    if (activeAnchor === anchor && activeTooltip) showTooltip(anchor);
}

export function attachUserCardTooltip(anchor, { userId, displayName }) {
    anchor.rovalraTooltipData = { userId, displayName };

    anchor.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
        if (activeAnchor !== anchor) showTooltip(anchor);
    });
    anchor.addEventListener('mouseleave', scheduleHide);
}
