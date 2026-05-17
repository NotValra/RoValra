import { observeElement, startObserving } from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import {
    loadSettings,
    handleSaveSettings,
} from '../../core/settings/handlesettings.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getBorders } from '../../core/configs/borders.js';
import {
    onUserCardElement,
    observeUserCardElements,
} from '../../core/profile/userCardElements.js';

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

    if (
        container.querySelector('.rovalra-avatar-border') ||
        container.dataset.rovalraBorderLoading
    )
        return;
    container.dataset.rovalraBorderLoading = 'true';
    container.dataset.rovalraIntendedBorder = borderUrl;

    const img = document.createElement('img');
    img.className = 'rovalra-avatar-border';

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

        const overlays = [];
        for (const child of container.children) {
            if (
                child.matches(
                    '.rovalra-status-bubble-wrapper, .avatar-status, .avatar-card-label, .icon-label',
                )
            ) {
                overlays.push(child);
            }
        }
        const status =
            container.querySelector('.avatar-status') ||
            container.closest('.avatar')?.querySelector('.avatar-status') ||
            container.parentElement?.querySelector('.avatar-status');

        container.style.position = 'relative';
        container.style.overflow = 'visible';

        const innerClip = document.createElement('div');
        innerClip.className = 'rovalra-avatar-border-clip';
        while (container.firstChild) {
            innerClip.appendChild(container.firstChild);
        }
        container.appendChild(innerClip);

        for (const overlay of overlays) {
            container.appendChild(overlay);
        }

        if (alwaysPlay || !animatedLink || animatedLink === staticLink) {
            container.appendChild(img);
        } else {
            const animImg = document.createElement('img');
            animImg.className = 'rovalra-avatar-border';
            animImg.src = animatedLink;
            animImg.style.display = 'none';
            if (animImg.decode) animImg.decode().catch(() => {});

            container.appendChild(img);
            container.appendChild(animImg);

            container.addEventListener('mouseenter', () => {
                img.style.display = 'none';
                animImg.style.display = 'block';
            });
            container.addEventListener('mouseleave', () => {
                img.style.display = 'block';
                animImg.style.display = 'none';
            });
        }

        if (status) status.style.zIndex = '3';
    };

    img.onerror = () => {
        delete container.dataset.rovalraBorderLoading;
    };

    img.src = alwaysPlay && animatedLink ? animatedLink : staticLink;
}

function findInBorders(borders, key, type = 'value') {
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

async function resolveBorderUrl(userId, authedUserId, localBorderValue) {
    const userSettings = await getUserSettings(userId).catch(() => null);

    if (userSettings?.border && userSettings.border !== 'none')
        return userSettings.border;

    if (
        userId &&
        String(userId) === String(authedUserId) &&
        localBorderValue &&
        localBorderValue !== 'none'
    ) {
        const borders = await getBorders();
        const border = findInBorders(borders, localBorderValue, 'value');
        if (border) return border.link;
    }

    return null;
}

function handleTile(tile, authedUserId, localBorderValue) {
    if (tile.dataset.rovalraBorderApplied) return;
    tile.dataset.rovalraBorderApplied = 'true';

    const link = tile.querySelector('a.avatar-card-link');
    if (!link) return;

    const userId = getUserIdFromUrl(link.href);
    const avatarEl = tile.querySelector(
        '.avatar.avatar-card-fullbody, .avatar-card-image',
    );
    if (!avatarEl) return;

    resolveBorderUrl(userId, authedUserId, localBorderValue)
        .then((borderUrl) => {
            if (!borderUrl) return;
            applyBorderToContainer(avatarEl, borderUrl);
        })
        .catch(() => {});
}

export async function init() {
    try {
        document.addEventListener('rovalra:syncAvatarBorder', async (event) => {
            const { borderUrl } = event.detail;
            const settings = await loadSettings();
            const currentChoice = settings.avatarBorderChoice || 'none';

            const borders = await getBorders();
            const apiEntry = findInBorders(borders, borderUrl, 'link');
            const apiValue = apiEntry ? apiEntry.value : 'none';

            if (apiValue !== currentChoice) {
                handleSaveSettings('avatarBorderChoice', apiValue);
            }
        });

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

        const borderUrl = await resolveBorderUrl(
            profileUserId,
            authedUserId,
            localBorderValue,
        );
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
