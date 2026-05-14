import {
    observeElement,
    startObserving,
} from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { loadSettings } from '../../core/settings/handlesettings.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import {
    onUserCardElement,
    observeUserCardElements,
} from '../../core/profile/userCardElements.js';
import { getBorders, getCachedBorders } from '../../core/configs/borders.js';

// VALRA EDIT HERE: update this URL to wherever the frame images end up being hosted.
const BORDER_BASE_URL = 'https://aliceenight.space/frames/';

const imageCache = new Map();

function getBorderById(id) {
    return getCachedBorders().find((b) => String(b.id) === String(id));
}

// VALRA REMOVE this function and the block marked below in resolveBorderId.
function getBorderByValue(value) {
    return getCachedBorders().find((b) => b.value === value);
}
// END VALRA REMOVE

async function getBorderDataUrl(filename) {
    if (imageCache.has(filename)) return imageCache.get(filename);

    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: 'fetchBorderImage', url: `${BORDER_BASE_URL}${filename}` },
            (response) => {
                if (chrome.runtime.lastError || !response?.dataUrl) {
                    console.warn(
                        'RoValra: Failed to load border image',
                        filename,
                        chrome.runtime.lastError?.message || response?.error,
                    );
                    resolve(null);
                    return;
                }
                imageCache.set(filename, response.dataUrl);
                resolve(response.dataUrl);
            },
        );
    });
}

async function applyBorderToContainer(container, borderId) {
    if (!borderId || borderId === '0' || borderId === 0) return;

    const borderEntry = getBorderById(borderId);
    if (!borderEntry || !borderEntry.file) return;

    if (container.querySelector('.rovalra-avatar-border')) return;

    const dataUrl = await getBorderDataUrl(borderEntry.file);
    if (!dataUrl) return;

    container.style.position = 'relative';
    container.style.overflow = 'visible';

    const div = document.createElement('div');
    div.className = 'rovalra-avatar-border';
    div.style.cssText = `
        position: absolute;
        top: -12%; left: -12%;
        width: 124%; height: 124%;
        background-image: url('${dataUrl}');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        pointer-events: none;
        z-index: 2;
    `;
    container.appendChild(div);

    const status =
        container.querySelector('.avatar-status') ||
        container.closest('.avatar')?.querySelector('.avatar-status') ||
        container.parentElement?.querySelector('.avatar-status');
    if (status) status.style.zIndex = '3';
}

async function resolveBorderId(userId, authedUserId, localBorderValue) {
    await getBorders();
    const userSettings = await getUserSettings(userId).catch(() => null);

    if (userSettings?.border) return userSettings.border;

    // VALRA REMOVE THIS BLOCK once the API returns the border field.
    if (String(userId) === String(authedUserId) && localBorderValue && localBorderValue !== 'none') {
        const borderEntry = getBorderByValue(localBorderValue);
        return borderEntry ? borderEntry.id : null;
    }
    // END VALRA REMOVE

    return null;
}

function handleTile(tile, authedUserId, localBorderValue) {
    if (tile.dataset.rovalraBorderApplied) return;
    tile.dataset.rovalraBorderApplied = 'true';

    const link = tile.querySelector('a.avatar-card-link');
    if (!link) return;

    const match = link.href.match(/\/users\/(\d+)\//);
    if (!match) return;
    const userId = match[1];

    const avatarEl = tile.querySelector('.avatar.avatar-card-fullbody');
    if (!avatarEl) return;

    resolveBorderId(userId, authedUserId, localBorderValue)
        .then((borderId) => {
            if (!borderId) return;
            applyBorderToContainer(avatarEl, borderId);
        })
        .catch(() => {});
}

export async function init() {
    try {
        const settings = await loadSettings();
        if (!settings.avatarBorderEnabled) return;

        const authedUserId = await getAuthenticatedUserId();
        const localBorderValue = settings.avatarBorderChoice || 'none';

        startObserving();
        observeUserCardElements();

        onUserCardElement((tile) =>
            handleTile(tile, authedUserId, localBorderValue),
        );

        const profileUserId = getUserIdFromUrl();
        if (!profileUserId) return;

        const borderId = await resolveBorderId(
            profileUserId,
            authedUserId,
            localBorderValue,
        );
        if (!borderId) return;

        observeElement(
            [
                '.user-profile-header-details-avatar-container .avatar-card-image',
                '.profile-avatar-left .avatar-card-image',
                '.avatar-card.profile-avatar .thumbnail-2d-container',
            ].join(', '),
            (element) => {
                applyBorderToContainer(element, borderId);
            },
            { multiple: true },
        );
    } catch (error) {
        console.error('RoValra: Avatar border init failed', error);
    }
}
