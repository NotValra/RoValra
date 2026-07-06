import { observeElement, observeChildren } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { settings } from '../../../core/settings/getSettings.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';
import { parseGradientNameSetting } from '../../../core/donators/gradientName.js';
import { getUserDisplayName } from '../../../core/apis/users.js';
import {
    getUserCardContext,
    onUserCardElement,
    observeUserCardElements,
} from '../../../core/profile/userCardElements.js';

const STYLE_ID = 'rovalra-display-name-gradient-style';
const DISPLAY_NAME_SELECTOR = '#profile-header-title-container-name';
const USERNAME_SELECTOR = '.stylistic-alts-username';
const HOME_GREETING_LINK_SELECTOR =
    '#roseal-home-header .greeting-container a[href*="/users/"][href*="/profile"]';
const HOME_GREETING_FALLBACK_PREFIX = 'Hello, ';
const EFFECT_CLASSES = [
    'rovalra-display-name-gradient-shine',
    'rovalra-display-name-gradient-sparkles',
    'rovalra-display-name-gradient-bloom',
    'rovalra-display-name-gradient-blooming-bloom',
    'rovalra-display-name-gradient-boom',
];
const BASE_CLASSES = [
    'rovalra-display-name-gradient',
    'rovalra-display-name-effect',
];
const STATIC_EFFECT = 'none';
const PROFILE_EFFECT_HOST_SELECTOR =
    '.user-profile-header-info, .profile-header-title-container, .profile-header-title-row, .profile-header-container';
let cardNameUnsubscribe = null;
const gradientNameSettingsPromises = new Map();

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .rovalra-display-name-gradient {
            display: inline-block;
            color: transparent !important;
            background-clip: text !important;
            -webkit-background-clip: text !important;
            background-size: 100% 100% !important;
            background-repeat: no-repeat !important;
            position: relative;
        }

        .rovalra-display-name-effect {
            display: inline-block;
            position: relative;
        }

        .rovalra-display-name-gradient-effect-host {
            overflow: visible !important;
            overflow-clip-margin: 24px;
        }

        .rovalra-display-name-gradient-shine {
            background-image:
                linear-gradient(
                    110deg,
                    transparent 0%,
                    transparent 34%,
                    rgba(255, 255, 255, 0.75) 44%,
                    transparent 54%,
                    transparent 100%
                ),
                var(--rovalra-display-name-gradient) !important;
            background-size: 240% 100%, 100% 100% !important;
            text-shadow:
                0 0 5px rgba(255, 255, 255, 0.55),
                0 0 14px rgba(255, 255, 255, 0.34),
                0 0 22px rgba(255, 255, 255, 0.2);
            filter: saturate(1.12);
            animation: rovalra-display-name-gradient-shine 3s ease-in-out infinite;
        }

        .rovalra-display-name-gradient-sparkles {
            text-shadow:
                0 0 2px rgba(255, 255, 255, 0.38),
                0 0 6px rgba(255, 110, 190, 0.2),
                0 0 10px rgba(255, 78, 205, 0.14);
            filter: saturate(1.05);
        }

        .rovalra-display-name-gradient-blooming-bloom,
        .rovalra-display-name-gradient-bloom {
            text-shadow:
                0 0 2px rgba(255, 255, 255, 0.36),
                0 0 7px rgba(255, 255, 255, 0.2);
            filter: saturate(1.06);
            animation: rovalra-display-name-gradient-blooming-bloom 2.2s ease-in-out infinite;
        }

        @keyframes rovalra-display-name-gradient-shine {
            0%, 100% { background-position: -180% 50%, 0 0; }
            50% { background-position: 180% 50%, 0 0; }
        }

        @keyframes rovalra-display-name-gradient-blooming-bloom {
            0%, 100% {
                text-shadow:
                    0 0 2px rgba(255, 255, 255, 0.3),
                    0 0 6px rgba(255, 255, 255, 0.18);
                filter: saturate(1);
            }
            50% {
                text-shadow:
                    0 0 4px rgba(255, 255, 255, 0.62),
                    0 0 10px rgba(255, 255, 255, 0.34),
                    0 0 16px rgba(255, 255, 255, 0.2);
                filter: saturate(1.12);
            }
        }
    `;
    document.head.appendChild(style);
}

function getEffectHosts(nameEl) {
    return [
        nameEl.parentElement,
        nameEl.closest(PROFILE_EFFECT_HOST_SELECTOR),
    ].filter(Boolean);
}

function setEffectHosts(nameEl, enabled) {
    getEffectHosts(nameEl).forEach((host) => {
        host.classList.toggle(
            'rovalra-display-name-gradient-effect-host',
            enabled,
        );
    });
}

function clearDisplayNameGradient(nameEl) {
    nameEl.classList.remove(...BASE_CLASSES, ...EFFECT_CLASSES);
    setEffectHosts(nameEl, false);
    nameEl.style.removeProperty('background');
    nameEl.style.removeProperty('background-image');
    nameEl.style.removeProperty('--rovalra-display-name-gradient');
    nameEl.style.removeProperty('background-clip');
    nameEl.style.removeProperty('-webkit-background-clip');
    nameEl.style.removeProperty('background-size');
    nameEl.style.removeProperty('background-repeat');
    nameEl.style.removeProperty('color');
    nameEl.style.removeProperty('overflow');
    nameEl.style.removeProperty('overflow-clip-margin');
}

function buildGradient(gradient) {
    if (!gradient?.enabled) return null;

    const fade = Math.max(0, Math.min(100, Number(gradient.fade ?? 100)));
    const start = (100 - fade) / 2;
    const end = 100 - start;
    const angle = Math.max(0, Math.min(360, Number(gradient.angle ?? 90)));
    const color1 = gradient.color1 || '#ff4ecd';
    const color2 = gradient.color2 || '#ffe66d';
    const color3 = gradient.color3 || '#4dd4ff';

    return `linear-gradient(${angle}deg, ${color1} ${start}%, ${color2} 50%, ${color3} ${end}%)`;
}

function applyGradientNameToElement(nameEl, gradientName, options = {}) {
    if (!nameEl || !gradientName) {
        if (nameEl) clearDisplayNameGradient(nameEl);
        return false;
    }

    const background = buildGradient(gradientName.gradient);
    const hasEffect = gradientName.effect && gradientName.effect !== STATIC_EFFECT;
    const effect = options.animate ? gradientName.effect : STATIC_EFFECT;
    if (!background && effect === STATIC_EFFECT) {
        clearDisplayNameGradient(nameEl);
        return hasEffect;
    }

    ensureStyle();

    nameEl.classList.remove(...BASE_CLASSES, ...EFFECT_CLASSES);
    nameEl.classList.add(
        background
            ? 'rovalra-display-name-gradient'
            : 'rovalra-display-name-effect',
    );
    if (effect !== STATIC_EFFECT) {
        nameEl.classList.add(`rovalra-display-name-gradient-${effect}`);
    }
    setEffectHosts(nameEl, effect !== STATIC_EFFECT);

    if (background) {
        const backgroundSize =
            effect === 'shine' ? '240% 100%, 100% 100%' : '100% 100%';

        nameEl.style.backgroundImage = background;
        nameEl.style.setProperty('--rovalra-display-name-gradient', background);
        nameEl.style.setProperty('background-clip', 'text', 'important');
        nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
        nameEl.style.setProperty('background-size', backgroundSize, 'important');
        nameEl.style.setProperty('background-repeat', 'no-repeat', 'important');
        nameEl.style.setProperty('color', 'transparent', 'important');
    } else {
        nameEl.style.removeProperty('background');
        nameEl.style.removeProperty('background-image');
        nameEl.style.removeProperty('--rovalra-display-name-gradient');
        nameEl.style.removeProperty('background-clip');
        nameEl.style.removeProperty('-webkit-background-clip');
        nameEl.style.removeProperty('background-size');
        nameEl.style.removeProperty('background-repeat');
        nameEl.style.removeProperty('color');
    }

    if (effect !== STATIC_EFFECT) {
        nameEl.style.setProperty('overflow', 'visible', 'important');
        nameEl.style.setProperty('overflow-clip-margin', '16px');
    } else {
        nameEl.style.removeProperty('overflow');
        nameEl.style.removeProperty('overflow-clip-margin');
    }

    return true;
}

function normalizeGradientNameFromSettings(userSettings) {
    return parseGradientNameSetting(userSettings?.GradientName);
}

function hasDisplayNameCosmetic(nameEl) {
    return BASE_CLASSES.some((className) => nameEl.classList.contains(className));
}

function isHomeGreetingElement(nameEl) {
    return nameEl?.matches?.(HOME_GREETING_LINK_SELECTOR);
}

function getHomeDisplayNameTarget(linkEl, displayName) {
    if (!isHomeGreetingElement(linkEl) || !displayName) return linkEl;

    const currentText = linkEl.textContent || '';
    if (
        !linkEl.dataset.rovalraHomeDisplayNameGradientOriginal &&
        currentText.includes(displayName)
    ) {
        linkEl.dataset.rovalraHomeDisplayNameGradientOriginal = currentText;
    }

    const sourceText =
        linkEl.dataset.rovalraHomeDisplayNameGradientOriginal || currentText;
    const lowerText = currentText.toLowerCase();
    const lowerSourceText = sourceText.toLowerCase();
    const lowerDisplayName = displayName.toLowerCase();
    const displayNameIndex = lowerSourceText.lastIndexOf(lowerDisplayName);
    if (displayNameIndex < 0) return linkEl;

    const existing = linkEl.querySelector(
        ':scope > .rovalra-home-display-name-gradient-target',
    );
    const hasGreetingPrefix =
        existing?.previousSibling?.textContent?.trim().length > 0;
    if (
        existing &&
        linkEl.dataset.rovalraHomeDisplayNameGradient === displayName &&
        hasGreetingPrefix
    ) {
        clearDisplayNameGradient(linkEl);
        return existing;
    }

    const sourcePrefix = sourceText.slice(0, displayNameIndex);
    const prefix =
        sourcePrefix ||
        (lowerText === lowerDisplayName ? HOME_GREETING_FALLBACK_PREFIX : '');
    const matchedName = sourceText.slice(
        displayNameIndex,
        displayNameIndex + displayName.length,
    );
    const suffix = sourceText.slice(displayNameIndex + displayName.length);
    const target = document.createElement('span');
    target.className = 'rovalra-home-display-name-gradient-target';
    target.textContent = matchedName;

    clearDisplayNameGradient(linkEl);
    linkEl.textContent = '';
    if (prefix) linkEl.appendChild(document.createTextNode(prefix));
    linkEl.appendChild(target);
    if (suffix) linkEl.appendChild(document.createTextNode(suffix));
    linkEl.dataset.rovalraHomeDisplayNameGradient = displayName;

    return target;
}

async function getDisplayNameTarget(nameEl, userId) {
    if (!isHomeGreetingElement(nameEl)) {
        return { element: nameEl, animate: false };
    }

    const displayName = await getUserDisplayName(userId);
    const element = getHomeDisplayNameTarget(nameEl, displayName);

    return {
        element,
        animate: element !== nameEl,
    };
}

async function getGradientNameSettingsCached(userId) {
    const cacheKey = String(userId);
    if (!gradientNameSettingsPromises.has(cacheKey)) {
        gradientNameSettingsPromises.set(
            cacheKey,
            getUserSettings(userId, { useDescription: false }).catch(
                (error) => {
                    gradientNameSettingsPromises.delete(cacheKey);
                    throw error;
                },
            ),
        );
    }

    return gradientNameSettingsPromises.get(cacheKey);
}

function bindHoverEffect(host, nameEl, gradientName) {
    if (!host || !nameEl || !gradientName) return;

    host.rovalraDisplayNameGradientEnter = () => {
        applyGradientNameToElement(nameEl, gradientName, { animate: true });
    };
    host.rovalraDisplayNameGradientLeave = () => {
        applyGradientNameToElement(nameEl, gradientName, { animate: false });
    };

    if (host.dataset.rovalraDisplayNameGradientHoverBound === 'true') return;
    host.dataset.rovalraDisplayNameGradientHoverBound = 'true';
    host.addEventListener('mouseenter', () => {
        host.rovalraDisplayNameGradientEnter?.();
    });
    host.addEventListener('mouseleave', () => {
        host.rovalraDisplayNameGradientLeave?.();
    });
}

export function applyDisplayNameGradientToElement(
    nameEl,
    userSettings,
    options = {},
) {
    const gradientName = normalizeGradientNameFromSettings(userSettings);
    const applied = applyGradientNameToElement(nameEl, gradientName, {
        animate: options.animate === true,
    });

    if (applied && options.hoverHost) {
        bindHoverEffect(options.hoverHost, nameEl, gradientName);
    }

    return applied;
}

async function applyDisplayNameGradient() {
    const enabled = await settings.displayNameGradientEnabled;
    const nameEl = document.querySelector(DISPLAY_NAME_SELECTOR);
    if (!nameEl) return;

    const profileUserId = getUserIdFromUrl();
    if (!enabled || !profileUserId) {
        clearDisplayNameGradient(nameEl);
        return;
    }

    const userSettings = await getGradientNameSettingsCached(profileUserId);
    const gradientName = normalizeGradientNameFromSettings(userSettings);

    if (!gradientName) {
        clearDisplayNameGradient(nameEl);
        return;
    }

    applyGradientNameToElement(nameEl, gradientName, { animate: true });
}

async function applyDisplayNameGradientToCard(tile, card) {
    const userId = card?.userId;
    const nameEl = card?.displayName;
    if (!userId || !nameEl) return;

    try {
        const { element: targetNameEl, animate } = await getDisplayNameTarget(
            nameEl,
            userId,
        );
        const applyKey = `${userId}|${targetNameEl.textContent || ''}|${animate}`;
        if (
            tile.dataset.rovalraDisplayNameGradientApplied === applyKey &&
            hasDisplayNameCosmetic(targetNameEl)
        ) {
            return;
        }

        tile.dataset.rovalraDisplayNameGradientApplied = applyKey;
        clearDisplayNameGradient(targetNameEl);

        const userSettings = await getGradientNameSettingsCached(userId);
        const currentUserId = getUserCardContext(tile).userId;
        if (String(currentUserId) !== String(userId)) return;

        applyDisplayNameGradientToElement(targetNameEl, userSettings, {
            animate,
            hoverHost: animate ? null : tile,
        });
    } catch (error) {
        console.warn(
            'RoValra: Failed to apply display name gradient for user card',
            userId,
            error,
        );
    }
}

function setupCardDisplayNameGradients() {
    if (cardNameUnsubscribe) return;

    observeUserCardElements();
    cardNameUnsubscribe = onUserCardElement(applyDisplayNameGradientToCard);
}

export async function init() {
    if (!(await settings.displayNameGradientEnabled)) return;

    setupCardDisplayNameGradients();

    observeElement(
        USERNAME_SELECTOR,
        (el) => {
            const runUpdate = () => {
                if (el.innerText.trim() === '') return false;
                applyDisplayNameGradient();
                return true;
            };

            if (!runUpdate()) {
                const { disconnect } = observeChildren(el, () => {
                    if (runUpdate()) disconnect();
                });
            }
        },
        { multiple: true },
    );
}
