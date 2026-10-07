import { getCatalogItemAssetType } from '../../core/apis/catalog.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';
import { observeAttributes, observeElement } from '../../core/observer.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { settings } from '../../core/settings/getSettings.js';
import { Icon } from '../../core/ui/buildericon.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { loadAssetTree } from '../../core/utils/assetStreamer.js';

const AVATAR_BACKGROUND_ASSET_TYPE = 92;
const PREVIEW_PARAM = 'rovalraPreviewBackground';
const BUTTON_CLASS = 'rovalra-background-preview-button';
const NOTICE_CLASS = 'rovalra-background-preview-notice';
const EMPTY_STATE_CLASS = 'profile-avatar-background-empty-state';
const WITH_IMAGE_CLASS = 'profile-avatar-background-with-image';
const OVERLAY_SELECTOR =
    '.rovalra-profile-frame, .rovalra-status-bubble-wrapper';

let initialized = false;
let overlaysHidden = true;

function getPreviewBackgroundId() {
    const id = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);
    return /^\d+$/.test(id || '') ? Number(id) : null;
}

async function addPreviewButton(container) {
    if (!window.location.pathname.includes('/catalog/')) return;
    if (container.querySelector(`.${BUTTON_CLASS}`)) return;

    const assetId = getPlaceIdFromUrl();
    if (!assetId) return;

    const assetType = await getCatalogItemAssetType(assetId, 'Asset');
    if (Number(assetType) !== AVATAR_BACKGROUND_ASSET_TYPE) return;
    if (container.querySelector(`.${BUTTON_CLASS}`)) return;

    const label = await t('backgroundPreview.previewOnProfile');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${BUTTON_CLASS} enable-three-dee btn-control button-placement btn-control-md btn--width`;
    button.style.zIndex = '2';
    button.style.color = 'var(--rovalra-main-text-color)';
    button.setAttribute('aria-label', label);

    const icon = Icon({ icon: 'person', size: '20px' });
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    addTooltip(button, label);

    button.addEventListener('click', async (event) => {
        event.preventDefault();
        const userId = await getAuthenticatedUserId();
        if (!userId) return;
        window.location.href = `/users/${userId}/profile?${PREVIEW_PARAM}=${assetId}`;
    });

    container.appendChild(button);
}

async function getBackgroundImageId(backgroundId) {
    const tree = await loadAssetTree(backgroundId);
    const imageIdValue = tree.root?.[0]?.Children?.find(
        (child) => child.Properties?.Name === 'ImageId',
    );
    return String(imageIdValue?.Properties?.Value ?? '').match(/\d+/)?.[0];
}

function applyPreviewImage(element, imageUrl) {
    const backgroundImage = `url("${imageUrl}")`;
    if (element.style.backgroundImage !== backgroundImage) {
        element.style.backgroundImage = backgroundImage;
    }
    if (element.classList.contains(EMPTY_STATE_CLASS)) {
        element.classList.remove(EMPTY_STATE_CLASS);
    }
    if (!element.classList.contains(WITH_IMAGE_CLASS)) {
        element.classList.add(WITH_IMAGE_CLASS);
    }
}

function applyOverlayVisibility(element) {
    element.style.visibility = overlaysHidden ? 'hidden' : '';
}

async function addPreviewNotice(container, backgroundId) {
    if (container.querySelector(`.${NOTICE_CLASS}`)) return;

    const [previewingText, backText, hideText, showText] = await Promise.all([
        t('backgroundPreview.previewing'),
        t('backgroundPreview.backToItem'),
        t('backgroundPreview.hideOverlays'),
        t('backgroundPreview.showOverlays'),
    ]);
    if (container.querySelector(`.${NOTICE_CLASS}`)) return;

    const notice = document.createElement('div');
    notice.className = `${NOTICE_CLASS} flex items-center gap-medium radius-medium padding-x-medium padding-y-small bg-action-standard content-action-standard text-label-medium`;
    notice.style.position = 'absolute';
    notice.style.top = '12px';
    notice.style.left = '12px';
    notice.style.zIndex = '21';
    notice.innerHTML = safeHtml`
        <span>${previewingText}</span>
        <a class="text-link" href="/catalog/${backgroundId}">${backText}</a>`;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'text-link bg-none stroke-none padding-none';
    toggle.style.cursor = 'pointer';
    toggle.textContent = overlaysHidden ? showText : hideText;
    toggle.addEventListener('click', () => {
        overlaysHidden = !overlaysHidden;
        toggle.textContent = overlaysHidden ? showText : hideText;
        document
            .querySelectorAll(OVERLAY_SELECTOR)
            .forEach(applyOverlayVisibility);
    });
    notice.appendChild(toggle);

    container.appendChild(notice);
}

async function initProfilePreview() {
    const backgroundId = getPreviewBackgroundId();
    if (!backgroundId) return;

    observeElement('.currently-wearing-avatar-with-background', (container) =>
        addPreviewNotice(container, backgroundId),
    );
    observeElement(OVERLAY_SELECTOR, applyOverlayVisibility, {
        multiple: true,
    });

    const imageId = await getBackgroundImageId(backgroundId);
    if (!imageId) {
        console.error('RoValra: Failed to load background preview');
        return;
    }
    const imageUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${imageId}`;

    observeElement('.profile-avatar-left', (element) => {
        applyPreviewImage(element, imageUrl);
        observeAttributes(element, () => applyPreviewImage(element, imageUrl), [
            'style',
            'class',
        ]);
    });
}

export async function init() {
    if (initialized) return;
    initialized = true;

    if (!(await settings.backgroundProfilePreviewEnabled)) return;

    if (window.location.pathname.includes('/users/')) {
        initProfilePreview();
        return;
    }

    observeElement('.thumbnail-button-container', addPreviewButton);
}
