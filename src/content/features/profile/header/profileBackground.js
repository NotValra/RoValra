import {
    observeElement,
    observeChildren,
    observeIntersection,
    startObserving,
} from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { loadSettings } from '../../../core/settings/handlesettings.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';
import {
    getUserCardContext,
    onUserCardElement,
    observeUserCardElements,
} from '../../../core/profile/userCardElements.js';

let profileGradientObserver = null;
let activeProfileUserId = null;
let avatarTileUnsubscribe = null;
const gradientSettingsPromises = new Map();
const avatarTileIntersections = new Map();

function applyGradientToElement(element, gradient, isSmallScale = false) {
    element.style.background = gradient;
    element.style.backgroundSize = isSmallScale ? '250% 250%' : 'cover';
    element.style.backgroundPosition = 'center';
    element.dataset.rovalraAppliedGradient = gradient;
}

function clearGradientFromElement(element) {
    if (!element) return;
    if (!element.dataset.rovalraAppliedGradient) return;

    element.style.background = '';
    element.style.backgroundSize = '';
    element.style.backgroundPosition = '';
    delete element.dataset.rovalraAppliedGradient;
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
    const parsedFade = parseInt(parts[2], 10);
    const parsedAngle = parseInt(parts[3], 10);
    const fade = Number.isFinite(parsedFade) ? parsedFade : 100;
    const angle = Number.isFinite(parsedAngle) ? parsedAngle : 135;

    const s1 = (100 - fade) / 2;
    const s2 = 100 - s1;
    return `linear-gradient(${angle}deg, ${color1} ${s1}%, ${color2} ${s2}%)`;
}

async function getGradientSettingsCached(userId) {
    const cacheKey = String(userId);
    if (!gradientSettingsPromises.has(cacheKey)) {
        gradientSettingsPromises.set(
            cacheKey,
            getUserSettings(userId, { useDescription: false }).catch(
                (error) => {
                    gradientSettingsPromises.delete(cacheKey);
                    throw error;
                },
            ),
        );
    }

    return gradientSettingsPromises.get(cacheKey);
}

export async function applyGradientForUserId(
    userId,
    element,
    isSmallScale = false,
    shouldApply = null,
) {
    try {
        const userSettings = await getGradientSettingsCached(userId);
        if (shouldApply && !shouldApply()) return;

        const gradient = userSettings?.gradient
            ? parseGradientString(userSettings.gradient)
            : null;

        if (!gradient) return;

        applyToAvatarContainer(element, gradient, isSmallScale);
    } catch (e) {
        console.warn('RoValra: Failed to apply gradient for user', userId, e);
    }
}

function applyGradientToAvatarTile(tile, card) {
    const userId = card?.userId;
    const avatarContainer = card?.gradientAvatar;
    if (!userId || !avatarContainer) return;
    if (tile.dataset.rovalraGradientQueued === String(userId)) return;

    avatarTileIntersections.get(tile)?.unobserve();
    avatarTileIntersections.delete(tile);

    tile.dataset.rovalraGradientQueued = String(userId);
    delete tile.dataset.rovalraGradientApplied;
    clearGradientFromElement(avatarContainer);

    const applyWhenVisible = (entry) => {
        if (!entry.isIntersecting) return;

        avatarTileIntersections.get(tile)?.unobserve();
        avatarTileIntersections.delete(tile);

        if (tile.dataset.rovalraGradientApplied === String(userId)) return;
        tile.dataset.rovalraGradientApplied = String(userId);

        const currentUserId = getUserCardContext(tile).userId;
        if (String(currentUserId) !== String(userId)) return;

        applyGradientForUserId(userId, avatarContainer, true, () => {
            const currentUserId = getUserCardContext(tile).userId;
            return String(currentUserId) === String(userId);
        });
    };

    const intersection = observeIntersection(tile, applyWhenVisible, {
        rootMargin: '200px',
    });

    avatarTileIntersections.set(tile, intersection);
}

function setupAvatarTileGradients() {
    if (avatarTileUnsubscribe) return;

    observeUserCardElements();
    avatarTileUnsubscribe = onUserCardElement(applyGradientToAvatarTile);
}

function teardownAvatarTileGradients() {
    if (!avatarTileUnsubscribe) return;

    avatarTileUnsubscribe();
    avatarTileUnsubscribe = null;

    for (const intersection of avatarTileIntersections.values()) {
        intersection.unobserve();
    }
    avatarTileIntersections.clear();
}

function teardownProfileGradientObserver() {
    if (profileGradientObserver) {
        profileGradientObserver.disconnect();
        profileGradientObserver = null;
    }
    activeProfileUserId = null;
}

function observeProfileGradient(gradient) {
    profileGradientObserver = observeElement(
        '.profile-header, .profile-avatar-left.profile-avatar-gradient, .profile-avatar-left.profile-avatar-background-empty-state, .user-profile-header-details-avatar-container .avatar-card-image, .avatar-toggle-button',
        (element) => {
            if (element.classList.contains('profile-header')) {
                const profileContainer = element.querySelector(
                    '.section-content.profile-header-content, .user-profile-header',
                );
                if (profileContainer) {
                    applyGradientToElement(profileContainer, gradient, false);
                }

                const thumbnailHolder = element.querySelector(
                    '.thumbnail-holder.thumbnail-holder-position',
                );
                if (thumbnailHolder) {
                    thumbnailHolder.style.background = 'transparent';
                }
            } else if (element.classList.contains('avatar-card-image')) {
                applyToAvatarContainer(element, gradient, false);
            } else if (element.classList.contains('avatar-toggle-button')) {
                const updateButtons = () => {
                    element.querySelectorAll('button').forEach((btn) => {
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

export async function init() {
    try {
        const settings = await loadSettings();
        if (!settings.profileBackgroundGradientEnabled) {
            teardownAvatarTileGradients();
            teardownProfileGradientObserver();
            return;
        }

        if (settings.applyGradientToAvatarTile) {
            setupAvatarTileGradients();
        } else {
            teardownAvatarTileGradients();
        }

        const profileUserId = getUserIdFromUrl();
        if (!profileUserId) {
            teardownProfileGradientObserver();
            return;
        }

        if (
            profileGradientObserver &&
            activeProfileUserId === String(profileUserId)
        ) {
            return;
        }

        teardownProfileGradientObserver();
        activeProfileUserId = String(profileUserId);

        const userSettings = await getGradientSettingsCached(profileUserId);
        if (activeProfileUserId !== String(profileUserId)) return;

        const gradient = userSettings?.gradient
            ? parseGradientString(userSettings.gradient)
            : null;

        if (gradient) {
            startObserving();
            observeProfileGradient(gradient);
        }
    } catch (error) {
        console.error(
            'RoValra: Profile background gradient init failed',
            error,
        );
    }
}
