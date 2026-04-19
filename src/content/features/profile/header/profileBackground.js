import {
    observeElement,
    observeChildren,
    startObserving,
} from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { loadSettings } from '../../../core/settings/handlesettings.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';

function applyGradientToElement(element, gradient, isSmallScale = false) {
    element.style.background = gradient;
    element.style.backgroundSize = isSmallScale ? '250% 250%' : 'cover';
    element.style.backgroundPosition = 'center';
}

function applyToAvatarContainer(container, gradient, isSmallScale = false) {
    const checkAndApply = () => {
        if (container.querySelector('img')) {
            applyGradientToElement(container, gradient, isSmallScale);
            return true;
        }
        return false;
    };

    if (!checkAndApply()) {
        const { disconnect } = observeChildren(container, () => {
            if (checkAndApply()) disconnect();
        });
    }
}

function parseGradientString(gradientStr) {
    const parts = gradientStr.split(',').map((s) => s.trim());
    if (parts.length < 3) return null;

    const color1 = parts[0] || '#667eea';
    const color2 = parts[1] || '#764ba2';
    const fade = parseInt(parts[2], 10) ?? 100;
    const angle = parseInt(parts[3], 10) ?? 135;

    const s1 = (100 - fade) / 2;
    const s2 = 100 - s1;
    return `linear-gradient(${angle}deg, ${color1} ${s1}%, ${color2} ${s2}%)`;
}

async function getGradientSettingsCached(userId) {
    return getUserSettings(userId, { useDescription: false });
}

async function applyGradientForUserId(userId, element, isSmallScale = false) {
    try {
        const userSettings = await getGradientSettingsCached(userId);
        const gradient = userSettings?.gradient
            ? parseGradientString(userSettings.gradient)
            : null;

        if (!gradient) return;

        applyToAvatarContainer(element, gradient, isSmallScale);
    } catch (e) {
        console.warn('RoValra: Failed to apply gradient for user', userId, e);
    }
}

function applyGradientToAvatarTile(tile) {
    if (tile.dataset.rovalraGradientApplied) return;
    tile.dataset.rovalraGradientApplied = 'true';

    const link = tile.querySelector('a.avatar-card-link');
    const avatarContainer = tile.querySelector('.avatar-card-image');
    if (!link || !avatarContainer) return;

    const match = link.href.match(/\/users\/(\d+)\//);
    if (!match) return;
    const userId = match[1];

    applyGradientForUserId(userId, avatarContainer, true);
}

export async function init() {
    try {
        const settings = await loadSettings();
        if (!settings.profileBackgroundGradientEnabled) return;

        startObserving();

        const profileUserId = getUserIdFromUrl();
        if (profileUserId) {
            const userSettings = await getGradientSettingsCached(profileUserId);
            const gradient = userSettings?.gradient
                ? parseGradientString(userSettings.gradient)
                : null;

            if (gradient) {
                observeElement(
                    '.profile-header, .profile-avatar-left.profile-avatar-gradient, .user-profile-header-details-avatar-container .avatar-card-image, .avatar-toggle-button',
                    (element) => {
                        if (element.classList.contains('profile-header')) {
                            const profileContainer = element.querySelector(
                                '.section-content.profile-header-content, .user-profile-header',
                            );
                            if (profileContainer) {
                                applyGradientToElement(
                                    profileContainer,
                                    gradient,
                                    false,
                                );
                            }

                            const thumbnailHolder = element.querySelector(
                                '.thumbnail-holder.thumbnail-holder-position',
                            );
                            if (thumbnailHolder) {
                                thumbnailHolder.style.background =
                                    'transparent';
                            }
                        } else if (
                            element.classList.contains('avatar-card-image')
                        ) {
                            applyToAvatarContainer(element, gradient, false);
                        } else if (
                            element.classList.contains('avatar-toggle-button')
                        ) {
                            const updateButtons = () => {
                                element
                                    .querySelectorAll('button')
                                    .forEach((btn) => {
                                        btn.style.backgroundColor =
                                            'var(--rovalra-container-background-color)';
                                    });
                            };
                            updateButtons();
                            observeChildren(element, updateButtons);
                        } else {
                            applyGradientToElement(element, gradient, false);
                        }
                    },
                    { multiple: true },
                );
            }
        }

        if (settings.applyGradientToAvatarTile) {
            observeElement(
                '.friends-carousel-tile',
                applyGradientToAvatarTile,
                {
                    multiple: true,
                },
            );
        }
    } catch (error) {
        console.error(
            'RoValra: Profile background gradient init failed',
            error,
        );
    }
}
