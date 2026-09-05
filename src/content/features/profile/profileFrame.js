import {
    observeElement,
    observeResize,
    startObserving,
} from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';
import { loadSettings } from '../../core/settings/handlesettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';

// Wraps both the fullbody and portrait thumbnails, so framing it frames the lot.
const HOLDER_SELECTOR = '.thumbnail-holder.thumbnail-holder-position';
const FRAME_CLASS = 'rovalra-profile-frame';
const FRAME_SELECTOR = `.${FRAME_CLASS}`;
const SYNC_EVENT = 'rovalra:syncProfileFrame';
const SETTING_NAME = 'profileFrameEnabled';

// How far the frame extends past the banner, so artwork can sit outside it.
// Keep it a ratio, not a flat px value: the same frame is drawn on the 300px
// banner and on much smaller store previews, where a flat 24px is enormous.
const FRAME_BLEED_REFERENCE_HEIGHT = 300;
const FRAME_BLEED_AT_REFERENCE = 24;

function getFrameBleed(holderRect) {
    return (
        (holderRect.height * FRAME_BLEED_AT_REFERENCE) /
        FRAME_BLEED_REFERENCE_HEIGHT
    );
}

const MOUNT_MAX_DEPTH = 6;

let activeFrameLink = null;
let holderObserver = null;

// A frame can live outside its holder, so the link is tracked here.
const frameStates = new WeakMap();

function isFramedHolder(holder) {
    return (
        holder instanceof HTMLElement &&
        holder.dataset.rovalraFrameRenderMode !== 'true' &&
        !holder.closest(FRAME_SELECTOR)
    );
}

function clipsContent(computedStyle) {
    return (
        computedStyle.overflow !== 'visible' ||
        computedStyle.overflowX !== 'visible' ||
        computedStyle.overflowY !== 'visible'
    );
}

// Check the overflow value, never scrollWidth/scrollHeight: an overflow:hidden
// element whose content already spills looks scrollable by those.
function isScrollContainer(computedStyle) {
    const scrollable = new Set(['auto', 'scroll']);

    return (
        scrollable.has(computedStyle.overflowX) ||
        scrollable.has(computedStyle.overflowY)
    );
}

// The bleed is cut off by the first clipping ancestor, currently
// `.profile-avatar-left`. Mount above it and position over the holder instead of
// changing Roblox's overflow, which other things may rely on.
function findFrameMount(holder) {
    let element = holder;
    let mount = holder;

    for (let depth = 0; depth < MOUNT_MAX_DEPTH; depth += 1) {
        if (
            !element ||
            element === document.body ||
            element === document.documentElement
        ) {
            break;
        }

        const computedStyle = window.getComputedStyle(element);

        // Going above a scroller would leave the frame behind when it scrolls.
        if (element !== holder && isScrollContainer(computedStyle)) break;

        if (clipsContent(computedStyle)) {
            mount = element.parentElement || mount;
        }

        element = element.parentElement;
    }

    return mount;
}

function ensurePositioned(element) {
    if (window.getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }
}

function syncFrameGeometry(holder) {
    const state = frameStates.get(holder);
    if (!state || !state.frame.isConnected) return;

    const { frame, mount } = state;
    const holderRect = holder.getBoundingClientRect();
    if (!holderRect.width || !holderRect.height) return;

    const bleed = getFrameBleed(holderRect);

    if (mount === holder) {
        frame.style.left = `${-bleed}px`;
        frame.style.top = `${-bleed}px`;
    } else {
        const mountRect = mount.getBoundingClientRect();
        frame.style.left = `${holderRect.left - mountRect.left - bleed}px`;
        frame.style.top = `${holderRect.top - mountRect.top - bleed}px`;
    }

    frame.style.width = `${holderRect.width + bleed * 2}px`;
    frame.style.height = `${holderRect.height + bleed * 2}px`;
}

function removeFrame(holder) {
    if (!holder) return;

    delete holder.dataset.rovalraFrameLoading;
    delete holder.dataset.rovalraIntendedFrame;

    const state = frameStates.get(holder);
    if (state) {
        for (const handle of state.resizeHandles) handle.unobserve();
        state.frame.remove();
        frameStates.delete(holder);
    }

    for (const frame of holder.querySelectorAll(`:scope > ${FRAME_SELECTOR}`)) {
        frame.remove();
    }
}

export function applyFrameToHolder(holder, frameLink, options = {}) {
    if (!holder) return;

    if (!frameLink) {
        removeFrame(holder);
        return;
    }

    if (frameStates.has(holder)) {
        if (holder.dataset.rovalraIntendedFrame === frameLink) return;
        removeFrame(holder);
    }

    holder.dataset.rovalraIntendedFrame = frameLink;

    const frame = document.createElement('img');
    frame.className = FRAME_CLASS;
    frame.alt = '';
    frame.decoding = 'async';
    frame.style.display = 'none';
    frame.onload = () => {
        if (frameStates.get(holder)?.frame === frame) {
            frame.style.display = 'block';
        }
    };
    frame.onerror = () => {
        if (frameStates.get(holder)?.frame === frame) {
            removeFrame(holder);
        } else {
            frame.remove();
        }
    };
    frame.src = frameLink;

    const mount = options.mountDirectly ? holder : findFrameMount(holder);
    ensurePositioned(mount);
    mount.appendChild(frame);

    const state = { frame, mount, resizeHandles: [] };
    frameStates.set(holder, state);

    syncFrameGeometry(holder);

    state.resizeHandles.push(
        observeResize(holder, () => syncFrameGeometry(holder)),
    );
    if (mount !== holder) {
        state.resizeHandles.push(
            observeResize(mount, () => syncFrameGeometry(holder)),
        );
    }
}

export function setFrameRenderMode(holder, enabled) {
    if (!holder) return;

    if (enabled) {
        holder.dataset.rovalraFrameRenderMode = 'true';
        removeFrame(holder);
        return;
    }

    delete holder.dataset.rovalraFrameRenderMode;
    if (activeFrameLink) applyFrameToHolder(holder, activeFrameLink);
}

export async function getEnabledFrameLink(userId) {
    const settings = await loadSettings().catch(() => null);
    if (!settings?.profileFrameEnabled) return null;

    return resolveFrameLink(userId);
}

export async function resolveFrameLink(userId) {
    if (!userId) return null;

    const userSettings = await getUserSettings(userId).catch(() => null);
    if (userSettings?.berts && userSettings.berts !== 'none') {
        return userSettings.berts;
    }

    const authedId = await getAuthenticatedUserId().catch(() => null);
    const isOwnProfile = authedId && String(authedId) === String(userId);
    if (!isOwnProfile) return null;

    const settings = await loadSettings().catch(() => null);
    const localChoice = settings?.profileFrameChoice;
    return localChoice && localChoice !== 'none' ? localChoice : null;
}

function watchHolders(frameLink) {
    activeFrameLink = frameLink;

    if (!frameLink && !holderObserver) return;

    if (holderObserver) {
        for (const holder of document.querySelectorAll(HOLDER_SELECTOR)) {
            if (!isFramedHolder(holder)) continue;

            if (activeFrameLink) {
                applyFrameToHolder(holder, activeFrameLink);
            } else {
                removeFrame(holder);
            }
        }
        return;
    }

    holderObserver = observeElement(
        HOLDER_SELECTOR,
        (holder) => {
            if (holder.dataset.rovalraFrameRenderMode === 'true') {
                removeFrame(holder);
                return;
            }
            if (!activeFrameLink || !isFramedHolder(holder)) return;
            applyFrameToHolder(holder, activeFrameLink);
        },
        { multiple: true },
    );
}

export async function init() {
    try {
        const profileUserId = getUserIdFromUrl();
        if (!profileUserId) return;

        startObserving();

        const applyCurrentFrame = async () => {
            // Re-read the setting every time rather than trusting the value from
            // init, so turning the feature off takes effect without a reload.
            watchHolders(await getEnabledFrameLink(profileUserId));
        };

        document.addEventListener('rovalra:settingSaved', (event) => {
            if (event.detail?.name !== SETTING_NAME) return;
            applyCurrentFrame();
        });

        // Own profile only: the event carries your frame, and other features can
        // fire it while you are viewing someone else.
        const authedId = await getAuthenticatedUserId().catch(() => null);
        if (authedId && String(authedId) === String(profileUserId)) {
            document.addEventListener(SYNC_EVENT, async (event) => {
                const settings = await loadSettings().catch(() => null);
                if (!settings?.profileFrameEnabled) return;

                const nextLink = event.detail?.frameUrl || null;
                watchHolders(nextLink && nextLink !== 'none' ? nextLink : null);
            });
        }

        await applyCurrentFrame();
    } catch (error) {
        console.error('RoValra: Profile frame init failed', error);
    }
}
