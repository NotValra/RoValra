import {
    observeChildren,
    observeElement,
    observeResize,
    startObserving,
} from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { loadSettings } from '../../core/settings/handlesettings.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';
import { getBorders } from '../../core/configs/borders.js';
import {
    getUserCardContext,
    onUserCardElement,
    observeUserCardElements,
} from '../../core/profile/userCardElements.js';

const BORDER_CHILD_SELECTOR =
    '.rovalra-avatar-border, .rovalra-avatar-border-clip';
const OVERLAY_CHILD_SELECTOR =
    '.rovalra-status-bubble-wrapper, .avatar-status, .avatar-card-label, .icon-label';
const BORDER_SCALE = 1.24;
const BORDER_Z_INDEX = '2';
const OVERLAY_Z_INDEX = '4';
const MAX_ALPHA_CENTER_CORRECTION = 0.04;
const borderContentBoundsCache = new Map();

function setPixelStyle(element, name, value) {
    element.style[name] = `${value}px`;
}

function isInlineContainer(container) {
    const tagName = container.tagName;
    return tagName === 'SPAN' || tagName === 'A';
}

function isBorderManagedChild(child) {
    return (
        child.nodeType === Node.ELEMENT_NODE &&
        child.matches(`${BORDER_CHILD_SELECTOR}, ${OVERLAY_CHILD_SELECTOR}`)
    );
}

function getOrCreateClip(container) {
    let clip = container.querySelector(':scope > .rovalra-avatar-border-clip');
    if (clip) return clip;

    clip = document.createElement(
        isInlineContainer(container) ? 'span' : 'div',
    );
    clip.className = 'rovalra-avatar-border-clip';
    container.prepend(clip);

    return clip;
}

function syncBorderClipChildren(container) {
    const clip = getOrCreateClip(container);

    for (const child of [...container.childNodes]) {
        if (child === clip || isBorderManagedChild(child)) continue;
        clip.appendChild(child);
    }

    syncBorderMetrics(container);

    return clip;
}

function syncBorderMetrics(container) {
    const clip = container.querySelector(
        ':scope > .rovalra-avatar-border-clip',
    );
    if (!clip) return;

    const containerBox = getLocalLayoutBox(container);
    const clipBox = getLayoutBox(clip);
    if (!containerBox.width || !containerBox.height) return;
    if (!clipBox.width || !clipBox.height) return;

    for (const border of container.querySelectorAll(
        ':scope > .rovalra-avatar-border',
    )) {
        syncBorderImageMetrics(containerBox, clipBox, border);
    }
}

function ensureStackingLayer(element, zIndex) {
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
        element.style.position = 'relative';
    }

    element.style.zIndex = zIndex;
}

function getRelatedOverlayElements(container) {
    const overlays = new Set();
    const addOverlays = (root) => {
        if (!root) return;
        if (root.matches?.(OVERLAY_CHILD_SELECTOR)) overlays.add(root);
        for (const overlay of root.querySelectorAll?.(OVERLAY_CHILD_SELECTOR) ||
            []) {
            overlays.add(overlay);
        }
    };

    addOverlays(container);
    addOverlays(container.closest('.avatar'));
    addOverlays(
        container.closest('.user-profile-header-details-avatar-container'),
    );
    addOverlays(container.parentElement);

    return overlays;
}

function syncOverlayStacking(container) {
    for (const border of container.querySelectorAll(
        ':scope > .rovalra-avatar-border',
    )) {
        border.style.zIndex = BORDER_Z_INDEX;
    }

    for (const overlay of getRelatedOverlayElements(container)) {
        ensureStackingLayer(overlay, OVERLAY_Z_INDEX);
    }
}

function getLocalLayoutBox(element) {
    return {
        left: 0,
        top: 0,
        width: element.offsetWidth || element.clientWidth || 0,
        height: element.offsetHeight || element.clientHeight || 0,
    };
}

function getLayoutBox(element) {
    return {
        left: element.offsetLeft || 0,
        top: element.offsetTop || 0,
        width: element.offsetWidth || element.clientWidth || 0,
        height: element.offsetHeight || element.clientHeight || 0,
    };
}

function syncBorderImageMetrics(containerBox, clipBox, border) {
    const bounds = borderContentBoundsCache.get(
        border.currentSrc || border.src,
    );
    const desiredWidth = clipBox.width * BORDER_SCALE;
    const desiredHeight = clipBox.height * BORDER_SCALE;
    const naturalWidth = border.naturalWidth || 1;
    const naturalHeight = border.naturalHeight || 1;
    const scale = Math.max(
        desiredWidth / naturalWidth,
        desiredHeight / naturalHeight,
    );

    const borderWidth = naturalWidth * scale;
    const borderHeight = naturalHeight * scale;
    const visualCenter = getCorrectedVisualCenter(bounds);
    const clipCenterX = clipBox.left - containerBox.left + clipBox.width / 2;
    const clipCenterY = clipBox.top - containerBox.top + clipBox.height / 2;
    const borderLeft = clipCenterX - visualCenter.x * borderWidth;
    const borderTop = clipCenterY - visualCenter.y * borderHeight;

    setPixelStyle(border, 'left', borderLeft);
    setPixelStyle(border, 'top', borderTop);
    setPixelStyle(border, 'width', borderWidth);
    setPixelStyle(border, 'height', borderHeight);
}

function startAnimatedBorder(border, animatedLink) {
    border.removeAttribute('src');
    border.src = animatedLink;
}

function stopAnimatedBorder(border) {
    border.removeAttribute('src');
}

function getCorrectedVisualCenter(bounds) {
    if (!bounds) return { x: 0.5, y: 0.5 };

    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    return {
        x:
            Math.abs(centerX - 0.5) <= MAX_ALPHA_CENTER_CORRECTION
                ? centerX
                : 0.5,
        y:
            Math.abs(centerY - 0.5) <= MAX_ALPHA_CENTER_CORRECTION
                ? centerY
                : 0.5,
    };
}

async function getBorderContentBounds(img) {
    const src = img.currentSrc || img.src;
    if (borderContentBoundsCache.has(src)) {
        return borderContentBoundsCache.get(src);
    }

    const bounds = await readImageAlphaBounds(img).catch(() => null);
    borderContentBoundsCache.set(src, bounds);

    return bounds;
}

async function readImageAlphaBounds(img) {
    if (!img.naturalWidth || !img.naturalHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha <= 8) continue;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (maxX < minX || maxY < minY) return null;

    return {
        left: minX / canvas.width,
        top: minY / canvas.height,
        width: (maxX - minX + 1) / canvas.width,
        height: (maxY - minY + 1) / canvas.height,
    };
}

function ensureBorderContainerLayout(container) {
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.display === 'inline') {
        container.style.display = 'inline-block';
    }

    container.style.position = 'relative';
    container.style.overflow = 'visible';
}

function removeBorderFromContainer(container) {
    if (!container) return;

    delete container.dataset.rovalraBorderLoading;
    delete container.dataset.rovalraIntendedBorder;

    for (const border of container.querySelectorAll(
        ':scope > .rovalra-avatar-border',
    )) {
        border.remove();
    }

    const clip = container.querySelector(
        ':scope > .rovalra-avatar-border-clip',
    );
    if (!clip) return;

    while (clip.firstChild) {
        container.insertBefore(clip.firstChild, clip);
    }
    clip.remove();
}

function ensureBorderStructure(container) {
    ensureBorderContainerLayout(container);
    const clip = syncBorderClipChildren(container);
    syncOverlayStacking(container);

    if (!container.dataset.rovalraBorderClipObserver) {
        container.dataset.rovalraBorderClipObserver = 'true';
        observeChildren(container, () => {
            syncBorderClipChildren(container);
            syncOverlayStacking(container);
        });
        observeResize(container, () => syncBorderMetrics(container));
        observeResize(clip, () => syncBorderMetrics(container));
    }

    return clip;
}

export async function applyBorderToContainer(
    container,
    borderUrl,
    alwaysPlay = false,
) {
    if (!borderUrl) return;

    const borders = await getBorders().catch(() => []);
    let staticLink = borderUrl;
    let animatedLink = null;
    let isConfigured = false;

    for (const cat of borders) {
        if (!cat.variants) continue;
        for (const variant of cat.variants) {
            if (variant.link === borderUrl) {
                staticLink = variant.link;
                animatedLink = null;
                isConfigured = true;
                break;
            }
            if (variant.animated) {
                const anim = variant.animated.find((a) => a.link === borderUrl);
                if (anim) {
                    staticLink = variant.link;
                    animatedLink = anim.link;
                    isConfigured = true;
                    break;
                }
            }
        }
        if (isConfigured) break;
    }

    if (container.querySelector('.rovalra-avatar-border')) {
        if (alwaysPlay && animatedLink && animatedLink !== staticLink) {
            const borders = [
                ...container.querySelectorAll(
                    ':scope > .rovalra-avatar-border',
                ),
            ];
            const [border, ...extraBorders] = borders;

            if (border) {
                border.src = animatedLink;
                border.style.display = 'block';
            }

            for (const extraBorder of extraBorders) {
                extraBorder.remove();
            }
        }

        ensureBorderStructure(container);
        return;
    }

    if (container.dataset.rovalraBorderLoading) return;
    container.dataset.rovalraBorderLoading = 'true';
    container.dataset.rovalraIntendedBorder = borderUrl;

    const img = document.createElement('img');
    img.className = 'rovalra-avatar-border';
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
        delete container.dataset.rovalraBorderLoading;
        if (
            container.querySelector('.rovalra-avatar-border') ||
            container.dataset.rovalraIntendedBorder !== borderUrl
        )
            return;

        if (img.decode) {
            await img.decode().catch(() => {});
        }
        await getBorderContentBounds(img);

        const overlays = [];
        for (const child of container.children) {
            if (child.matches(OVERLAY_CHILD_SELECTOR)) {
                overlays.push(child);
            }
        }
        ensureBorderStructure(container);

        for (const overlay of overlays) {
            container.appendChild(overlay);
        }
        syncOverlayStacking(container);

        if (alwaysPlay || !animatedLink || animatedLink === staticLink) {
            container.appendChild(img);
            syncBorderMetrics(container);
            syncOverlayStacking(container);
        } else {
            const animImg = document.createElement('img');
            animImg.className = 'rovalra-avatar-border';
            animImg.crossOrigin = 'anonymous';
            animImg.style.display = 'none';
            animImg.onload = async () => {
                if (animImg.decode) {
                    await animImg.decode().catch(() => {});
                }
                await getBorderContentBounds(animImg);
                syncBorderMetrics(container);
            };

            container.appendChild(img);
            container.appendChild(animImg);
            syncBorderMetrics(container);
            syncOverlayStacking(container);

            container.addEventListener('mouseenter', () => {
                img.style.display = 'none';
                animImg.style.display = 'block';
                startAnimatedBorder(animImg, animatedLink);
                syncOverlayStacking(container);
            });
            container.addEventListener('mouseleave', () => {
                img.style.display = 'block';
                animImg.style.display = 'none';
                stopAnimatedBorder(animImg);
                syncOverlayStacking(container);
            });
        }
    };

    img.onerror = () => {
        delete container.dataset.rovalraBorderLoading;
    };

    img.src = alwaysPlay && animatedLink ? animatedLink : staticLink;
}

export function findInBorders(borders, key, type = 'value') {
    for (const item of borders) {
        if (item[type] === key) return item;
        if (item.variants) {
            const found = findInBorders(item.variants, key, type);
            if (found) return found;
        }
        if (item.animated) {
            const found = findInBorders(item.animated, key, type);
            if (found) return found;
        }
    }
    return null;
}

async function resolveBorderUrl(userId) {
    const userSettings = await getUserSettings(userId).catch(() => null);

    if (userSettings?.border && userSettings.border !== 'none')
        return userSettings.border;

    return null;
}

function handleTile(tile, card) {
    const userId = card?.userId;
    const avatarEl = card?.avatar;
    if (!userId || !avatarEl) return;
    if (tile.dataset.rovalraBorderApplied === String(userId)) return;

    tile.dataset.rovalraBorderApplied = String(userId);
    removeBorderFromContainer(avatarEl);

    resolveBorderUrl(userId)
        .then((borderUrl) => {
            const currentUserId = getUserCardContext(tile).userId;
            if (String(currentUserId) !== String(userId)) return;

            if (!borderUrl) return;
            const alwaysPlay = tile.matches(
                'a.user-avatar-container.avatar.avatar-headshot',
            );

            applyBorderToContainer(avatarEl, borderUrl, alwaysPlay);
        })
        .catch(() => {});
}

export async function init() {
    try {
        const settings = await loadSettings();
        if (!settings.avatarBorderEnabled) return;

        startObserving();
        observeUserCardElements();

        onUserCardElement(handleTile);

        const profileUserId = getUserIdFromUrl();
        if (!profileUserId) return;

        const borderUrl = await resolveBorderUrl(profileUserId);
        if (!borderUrl) return;

        observeElement(
            [
                '.user-profile-header-details-avatar-container .avatar-card-image',
                '.profile-avatar-left .avatar-card-image',
                '.avatar-card.profile-avatar .thumbnail-2d-container',
            ].join(', '),
            (element) => {
                const target = element.parentElement || element;
                applyBorderToContainer(target, borderUrl, true);
            },
            { multiple: true },
        );
    } catch (error) {
        console.error('RoValra: Avatar border init failed', error);
    }
}
