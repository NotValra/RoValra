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
    'rovalra-display-name-gradient-shine-bloom',
    'rovalra-display-name-gradient-roll',
    'rovalra-display-name-gradient-roll-bloom',
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
const CONTRAST_SHADOW_PROPERTY = '--rovalra-display-name-contrast-filter';
const PROFILE_EFFECT_HOST_SELECTOR =
    '.user-profile-header-info, .profile-header-title-container, .profile-header-title-row, .profile-header-container';
let cardNameUnsubscribe = null;
const gradientNameSettingsPromises = new Map();
const contrastShadowElements = new Map();
let contrastShadowObserver = null;
let contrastShadowRefreshFrame = null;

function parseCssColor(value) {
    const match = String(value || '').match(
        /^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+%?))?\s*\)$/i,
    );
    if (!match) return null;
    const alpha = match[4]
        ? match[4].endsWith('%')
            ? Number(match[4].slice(0, -1)) / 100
            : Number(match[4])
        : 1;
    return {
        red: Number(match[1]),
        green: Number(match[2]),
        blue: Number(match[3]),
        alpha: Math.max(0, Math.min(1, alpha)),
    };
}

function getRelativeLuminance(color) {
    const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return (
        channel(color.red) * 0.2126 +
        channel(color.green) * 0.7152 +
        channel(color.blue) * 0.0722
    );
}

function getBackgroundColor(nameEl) {
    let current = nameEl?.parentElement;
    while (current && current !== document.documentElement) {
        const style = getComputedStyle(current);
        const backgroundColor = parseCssColor(style.backgroundColor);
        if (backgroundColor?.alpha > 0) return backgroundColor;
        if (style.backgroundImage && style.backgroundImage !== 'none') {
            const colors = style.backgroundImage
                .match(/rgba?\([^)]*\)/gi)
                ?.map(parseCssColor)
                .filter(Boolean);
            if (colors?.length) {
                return colors.reduce(
                    (average, color) => ({
                        red: average.red + color.red / colors.length,
                        green: average.green + color.green / colors.length,
                        blue: average.blue + color.blue / colors.length,
                        alpha: 1,
                    }),
                    { red: 0, green: 0, blue: 0, alpha: 1 },
                );
            }
        }
        current = current.parentElement;
    }
    return null;
}

function getGradientColors(gradient) {
    return [gradient?.color1, gradient?.color2, gradient?.color3]
        .map((value) => {
            const hex = String(value || '').replace(/^#/, '');
            if (!/^[\da-f]{6}$/i.test(hex)) return null;
            return {
                red: parseInt(hex.slice(0, 2), 16),
                green: parseInt(hex.slice(2, 4), 16),
                blue: parseInt(hex.slice(4, 6), 16),
            };
        })
        .filter(Boolean);
}

function getContrastRatio(left, right) {
    const leftLuminance = getRelativeLuminance(left);
    const rightLuminance = getRelativeLuminance(right);
    const lighter = Math.max(leftLuminance, rightLuminance);
    const darker = Math.min(leftLuminance, rightLuminance);
    return (lighter + 0.05) / (darker + 0.05);
}

function getLighterColor(color, amount = 0.42) {
    return {
        red: color.red + (255 - color.red) * amount,
        green: color.green + (255 - color.green) * amount,
        blue: color.blue + (255 - color.blue) * amount,
    };
}

function updateContrastShadow(nameEl, gradient) {
    const background = getBackgroundColor(nameEl);
    const gradientColors = getGradientColors(gradient);
    const averageGradientColor = gradientColors.reduce(
        (average, color) => ({
            red: average.red + color.red / gradientColors.length,
            green: average.green + color.green / gradientColors.length,
            blue: average.blue + color.blue / gradientColors.length,
        }),
        { red: 0, green: 0, blue: 0 },
    );
    const shouldAddShadow =
        background &&
        gradientColors.length > 0 &&
        getContrastRatio(averageGradientColor, background) < 2.1;
    if (!shouldAddShadow) {
        nameEl.style.removeProperty(CONTRAST_SHADOW_PROPERTY);
        return;
    }
    const lighterGradientColor = getLighterColor(averageGradientColor);
    const shadowColor = `rgba(${Math.round(lighterGradientColor.red)}, ${Math.round(lighterGradientColor.green)}, ${Math.round(lighterGradientColor.blue)}, 0.42)`;
    nameEl.style.setProperty(
        CONTRAST_SHADOW_PROPERTY,
        `drop-shadow(0 0.5px 1px ${shadowColor}) drop-shadow(0 0 1px ${shadowColor})`,
    );
}

function scheduleContrastShadowRefresh() {
    if (contrastShadowRefreshFrame) return;
    contrastShadowRefreshFrame = requestAnimationFrame(() => {
        contrastShadowRefreshFrame = null;
        contrastShadowElements.forEach((gradient, element) => {
            if (element.isConnected) updateContrastShadow(element, gradient);
        });
    });
}

function ensureContrastShadowObserver() {
    if (contrastShadowObserver || !document.body) return;
    contrastShadowObserver = new MutationObserver(
        scheduleContrastShadowRefresh,
    );
    contrastShadowObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        subtree: true,
    });
}

function isShineEffect(effect) {
    return effect === 'shine' || effect === 'shine-bloom';
}

function isRollEffect(effect) {
    return effect === 'roll' || effect === 'roll-bloom';
}

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
            filter: var(--rovalra-display-name-contrast-filter, none);
        }

        .rovalra-display-name-effect {
            display: inline-block;
            position: relative;
        }

        .rovalra-display-name-gradient-effect-host {
            overflow: visible !important;
            overflow-clip-margin: 24px;
        }

        .rovalra-display-name-gradient-shine,
        .rovalra-display-name-gradient-shine-bloom {
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
            animation: rovalra-display-name-gradient-shine 3s ease-in-out infinite;
        }

        .rovalra-display-name-gradient-shine-bloom {
            text-shadow:
                0 0 3px rgba(255, 255, 255, 0.38),
                0 0 9px rgba(255, 255, 255, 0.22),
                0 0 14px rgba(255, 255, 255, 0.14);
            filter: var(--rovalra-display-name-contrast-filter, none) saturate(1.08);
        }

        .rovalra-display-name-gradient-roll,
        .rovalra-display-name-gradient-roll-bloom {
            background-size: 200% 100% !important;
            animation: rovalra-display-name-gradient-roll 3.6s linear infinite;
        }

        .rovalra-display-name-gradient-roll-bloom {
            text-shadow:
                0 0 2px rgba(255, 255, 255, 0.34),
                0 0 7px rgba(255, 255, 255, 0.18),
                0 0 12px rgba(255, 255, 255, 0.12);
            filter: var(--rovalra-display-name-contrast-filter, none) saturate(1.08);
        }

        .rovalra-display-name-gradient-sparkles {
            text-shadow:
                0 0 2px rgba(255, 255, 255, 0.38),
                0 0 6px rgba(255, 110, 190, 0.2),
                0 0 10px rgba(255, 78, 205, 0.14);
            filter: var(--rovalra-display-name-contrast-filter, none) saturate(1.05);
        }

        .rovalra-display-name-gradient-blooming-bloom,
        .rovalra-display-name-gradient-bloom {
            text-shadow:
                0 0 2px rgba(255, 255, 255, 0.36),
                0 0 7px rgba(255, 255, 255, 0.2);
            filter: var(--rovalra-display-name-contrast-filter, none) saturate(1.06);
            animation: rovalra-display-name-gradient-blooming-bloom 2.2s ease-in-out infinite;
        }

        @keyframes rovalra-display-name-gradient-shine {
            0%, 100% { background-position: -180% 50%, 0 0; }
            50% { background-position: 180% 50%, 0 0; }
        }

        @keyframes rovalra-display-name-gradient-roll {
            0% { background-position: 0% 50%; }
            100% { background-position: -200% 50%; }
        }

        @keyframes rovalra-display-name-gradient-blooming-bloom {
            0%, 100% {
                text-shadow:
                    0 0 2px rgba(255, 255, 255, 0.3),
                    0 0 6px rgba(255, 255, 255, 0.18);
                filter: var(--rovalra-display-name-contrast-filter, none) saturate(1);
            }
            50% {
                text-shadow:
                    0 0 4px rgba(255, 255, 255, 0.62),
                    0 0 10px rgba(255, 255, 255, 0.34),
                    0 0 16px rgba(255, 255, 255, 0.2);
                filter: var(--rovalra-display-name-contrast-filter, none) saturate(1.12);
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
    contrastShadowElements.delete(nameEl);
    nameEl.classList.remove(...BASE_CLASSES, ...EFFECT_CLASSES);
    setEffectHosts(nameEl, false);
    nameEl.style.removeProperty('background');
    nameEl.style.removeProperty('background-image');
    nameEl.style.removeProperty('--rovalra-display-name-gradient');
    nameEl.style.removeProperty('background-clip');
    nameEl.style.removeProperty('-webkit-background-clip');
    nameEl.style.removeProperty('background-size');
    nameEl.style.removeProperty('background-position');
    nameEl.style.removeProperty('background-repeat');
    nameEl.style.removeProperty('color');
    nameEl.style.removeProperty('overflow');
    nameEl.style.removeProperty('overflow-clip-margin');
    nameEl.style.removeProperty(CONTRAST_SHADOW_PROPERTY);
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

function buildRollingGradient(gradient) {
    if (!gradient?.enabled) return null;

    const angle = Math.max(0, Math.min(360, Number(gradient.angle ?? 90)));
    const color1 = gradient.color1 || '#ff4ecd';
    const color2 = gradient.color2 || '#ffe66d';
    const color3 = gradient.color3 || '#4dd4ff';

    return `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 25%, ${color3} 50%, ${color2} 75%, ${color1} 100%)`;
}

function applyGradientNameToElement(nameEl, gradientName, options = {}) {
    if (!nameEl || !gradientName) {
        if (nameEl) clearDisplayNameGradient(nameEl);
        return false;
    }

    const hasEffect =
        gradientName.effect && gradientName.effect !== STATIC_EFFECT;
    const effect = options.animate ? gradientName.effect : STATIC_EFFECT;
    const background = isRollEffect(effect)
        ? buildRollingGradient(gradientName.gradient)
        : buildGradient(gradientName.gradient);
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
        let backgroundSize = '100% 100%';
        if (isShineEffect(effect)) {
            backgroundSize = '240% 100%, 100% 100%';
        } else if (isRollEffect(effect)) {
            backgroundSize = '200% 100%';
        }
        const backgroundRepeat = isRollEffect(effect)
            ? 'repeat-x'
            : 'no-repeat';

        nameEl.style.backgroundImage = background;
        nameEl.style.setProperty('--rovalra-display-name-gradient', background);
        nameEl.style.setProperty('background-clip', 'text', 'important');
        nameEl.style.setProperty(
            '-webkit-background-clip',
            'text',
            'important',
        );
        nameEl.style.setProperty(
            'background-size',
            backgroundSize,
            'important',
        );
        nameEl.style.setProperty(
            'background-repeat',
            backgroundRepeat,
            'important',
        );
        nameEl.style.setProperty('color', 'transparent', 'important');
        contrastShadowElements.set(nameEl, gradientName.gradient);
        ensureContrastShadowObserver();
        updateContrastShadow(nameEl, gradientName.gradient);
    } else {
        nameEl.style.removeProperty('background');
        nameEl.style.removeProperty('background-image');
        nameEl.style.removeProperty('--rovalra-display-name-gradient');
        nameEl.style.removeProperty('background-clip');
        nameEl.style.removeProperty('-webkit-background-clip');
        nameEl.style.removeProperty('background-size');
        nameEl.style.removeProperty('background-position');
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
    return BASE_CLASSES.some((className) =>
        nameEl.classList.contains(className),
    );
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
