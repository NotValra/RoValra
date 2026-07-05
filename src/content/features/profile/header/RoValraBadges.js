import { observeElement } from '../../../core/observer.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { createConfetti } from '../../../core/fun/confetti.js';
import { BADGE_CONFIG } from '../../../core/configs/badges.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { settings } from '../../../core/settings/getSettings.js';
const badgeCache = new Map();
const videoStarBadgeCache = new Map();
const VIDEO_STAR_GROUP_ID = 4199740;
const VIDEO_STAR_BADGE_NAME = 'video_star';
let groupRolesListenerInitialized = false;

function isVideoStarGroupRole(item) {
    return (
        item?.group?.id === VIDEO_STAR_GROUP_ID &&
        item?.role?.name === 'Video Star'
    );
}

function hasVideoStarBadge(userId) {
    return videoStarBadgeCache.get(String(userId)) === true;
}

function mergeRuntimeBadges(userId, badges, options = {}) {
    if (
        options.videoStarBadgeEnabled === false ||
        !hasVideoStarBadge(userId) ||
        badges.includes(VIDEO_STAR_BADGE_NAME)
    ) {
        return badges;
    }

    return [...badges, VIDEO_STAR_BADGE_NAME];
}

function rerenderCurrentProfileBadges() {
    const currentUserId = String(getUserIdFromUrl() || '');
    if (!currentUserId) return;

    document
        .querySelectorAll('[data-rovalra-observed="true"]')
        .forEach((container) => {
            if (container.dataset.rovalraUserId !== currentUserId) return;
            container.dataset.rovalraUserId = '';
            addHeaderBadges(container);
        });
}

function applyBadgeIconStyle(icon, badge) {
    icon.style.filter = '';
    Object.assign(icon.style, badge.style || {});
}

function ensureShineStyle() {
    if (document.getElementById('rovalra-badge-shine-style')) return;
    const style = document.createElement('style'); //Verified
    style.id = 'rovalra-badge-shine-style';
    style.textContent = `
        @keyframes rovalra-badge-shine-move {
            0% { left: -100%; }
            40% { left: 200%; }
            100% { left: 200%; }
        }

        @keyframes rovalra-badge-sparkle-float {
            0%, 100% {
                opacity: 0;
                transform: scale(0.35) rotate(45deg);
            }
            35% {
                opacity: 1;
                transform: scale(1) rotate(45deg);
            }
            65% {
                opacity: 0.85;
                transform: scale(0.8) rotate(45deg);
            }
        }
    `; //Verified
    document.head.appendChild(style);
}

function randomizeSparklePosition(sparkle) {
    sparkle.style.top = '';
    sparkle.style.right = '';
    sparkle.style.bottom = '';
    sparkle.style.left = '';

    const sideOffset = `${Math.round(Math.random() * 64 + 18)}%`;
    const horizontalOffset = `${Math.round(Math.random() * 76 + 12)}%`;
    const sideEdgeDistance = `${Math.round(Math.random() * 4) - 7}px`;
    const verticalEdgeDistance = `${Math.round(Math.random() * 4) - 3}px`;

    switch (Math.floor(Math.random() * 4)) {
        case 0:
            sparkle.style.top = verticalEdgeDistance;
            sparkle.style.left = horizontalOffset;
            break;
        case 1:
            sparkle.style.right = sideEdgeDistance;
            sparkle.style.top = sideOffset;
            break;
        case 2:
            sparkle.style.bottom = verticalEdgeDistance;
            sparkle.style.left = horizontalOffset;
            break;
        default:
            sparkle.style.left = sideEdgeDistance;
            sparkle.style.top = sideOffset;
            break;
    }
}

function addFloatingSparkles(iconContainer) {
    const sparkles = [
        { size: '4px', delay: '0s' },
        { size: '3px', delay: '0.55s' },
        { size: '3px', delay: '1.1s' },
        { size: '4px', delay: '1.65s' },
    ];

    sparkles.forEach((config) => {
        const sparkle = document.createElement('span');
        Object.assign(sparkle.style, {
            position: 'absolute',
            width: config.size,
            height: config.size,
            background: 'currentColor',
            border: '1px solid color-mix(in srgb, currentColor 55%, white)',
            boxShadow: '0 0 5px currentColor',
            pointerEvents: 'none',
            zIndex: '3',
            animation: `rovalra-badge-sparkle-float 2.2s ease-in-out ${config.delay} infinite`,
        });

        randomizeSparklePosition(sparkle);
        sparkle.addEventListener('animationiteration', () => {
            randomizeSparklePosition(sparkle);
        });

        iconContainer.appendChild(sparkle);
    });
}

function createHeaderBadge(parentContainer, badge) {
    const iconContainer = document.createElement('div');
    iconContainer.className = 'rovalra-header-badge';
    Object.assign(iconContainer.style, {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '0px',
        verticalAlign: 'middle',
        overflow: 'visible',
        color: badge.themeColorIcon ? 'var(--rovalra-main-text-color)' : '',
    });

    if (badge.id === 'contributor') {
        iconContainer.style.paddingLeft = '5px';
    }

    const icon = document.createElement(badge.themeColorIcon ? 'span' : 'img');
    if (badge.iconAssetName) {
        if (badge.themeColorIcon) {
            icon.dataset.rovalraAssetMask = badge.iconAssetName;
        } else {
            icon.dataset.rovalraAsset = badge.iconAssetName;
        }
    }
    if (badge.id) {
        icon.dataset.rovalraBadgeConfig = badge.id;
    }
    if (badge.themeColorIcon) {
        Object.assign(icon.style, {
            display: 'inline-block',
            backgroundColor: 'currentColor',
            webkitMask: `url("${badge.icon}") center / contain no-repeat`,
            mask: `url("${badge.icon}") center / contain no-repeat`,
        });
    } else {
        icon.src = badge.icon;
    }
    icon.dataset.badgeId = badge.tooltip || 'badge';
    Object.assign(icon.style, {
        width: badge.size || 'var(--icon-size-large)',
        height: badge.size || 'var(--icon-size-large)',
        cursor: 'pointer',
    });
    applyBadgeIconStyle(icon, badge);

    if (badge.confetti) {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            createConfetti(icon, badge.confetti);
        });
    }

    if (badge.url) {
        icon.addEventListener('click', () => {
            window.location.href = badge.url;
        });
    }

    if (badge.tooltip) {
        addTooltip(iconContainer, badge.tooltip, { position: 'bottom' });
    }

    if (badge.shiny) {
        ensureShineStyle();
        const shineContainer = document.createElement('div');
        if (badge.iconAssetName) {
            shineContainer.dataset.rovalraAssetMask = badge.iconAssetName;
        }
        Object.assign(shineContainer.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            webkitMask: `url("${badge.icon}") center / contain no-repeat`,
            mask: `url("${badge.icon}") center / contain no-repeat`,
            zIndex: '2',
        });

        const shineBar = document.createElement('div');
        Object.assign(shineBar.style, {
            position: 'absolute',
            top: '0',
            left: '-100%',
            width: badge.grayGlimmer ? '70%' : '50%',
            height: '100%',
            background:
                badge.grayGlimmer
                    ? 'linear-gradient(to right, transparent, rgba(70, 70, 70, 0.8), rgba(145, 145, 145, 0.75), transparent)'
                    : 'linear-gradient(to right, transparent, rgba(255,255,255,0.8), transparent)',
            mixBlendMode: badge.grayGlimmer ? 'multiply' : '',
            transform: 'skewX(-25deg)',
            animation: badge.grayGlimmer
                ? 'rovalra-badge-shine-move 3.2s infinite'
                : 'rovalra-badge-shine-move 5s infinite',
        });

        shineContainer.appendChild(shineBar);
        iconContainer.appendChild(shineContainer);
    }

    if (badge.sparkles) {
        ensureShineStyle();
        addFloatingSparkles(iconContainer);
    }

    iconContainer.appendChild(icon);
    parentContainer.appendChild(iconContainer);
}

function createTextHeaderBadge(parentContainer, badgeName) {
    const badgeElement = document.createElement('span');
    badgeElement.textContent = badgeName.replace(/_/g, ' ');
    badgeElement.className = 'rovalra-text-badge';

    Object.assign(badgeElement.style, {
        backgroundColor: 'var(--surface-neutral-tertiary)',
        color: 'var(--text-default)',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        marginLeft: '8px',
        verticalAlign: 'middle',
        cursor: 'default',
        textTransform: 'capitalize',
        opacity: '1',
        border: 'none',
    });

    parentContainer.appendChild(badgeElement);
}

function createRain(imageUrl) {
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        pointer-events: none; z-index: 100000; overflow: hidden;
    `; // Verified
    document.body.appendChild(container);

    const interval = setInterval(() => {
        const drop = document.createElement('img');
        drop.src = imageUrl;
        const size = Math.random() * 500 + 50;
        const startLeft = Math.random() * 100;
        const duration = Math.random() * 2 + 2;

        drop.style.cssText = `
            position: absolute; top: -100px; left: ${startLeft}vw;
            width: ${size}px; height: auto;
            transition: top ${duration}s linear, transform ${duration}s linear;
        `; //verified
        container.appendChild(drop);
        void drop.offsetWidth;
        drop.style.top = '110vh';
        drop.style.transform = `rotate(${Math.random() * 360}deg)`;

        setTimeout(() => drop.remove(), duration * 1000);
    }, 50);

    setTimeout(() => {
        clearInterval(interval);
        setTimeout(() => container.remove(), 5000);
    }, 10000);
}

async function addHeaderBadges(container) {
    const currentUserId = getUserIdFromUrl();
    if (!currentUserId) return;

    if (container.dataset.rovalraUserId === currentUserId) return;

    if (container.dataset.rovalraBusy === 'true') {
        container.dataset.rovalraPendingRender = 'true';
        return;
    }
    container.dataset.rovalraBusy = 'true';

    try {
        const authenticatedUserId = await getAuthenticatedUserId();
        const isOwnProfile =
            authenticatedUserId &&
            String(authenticatedUserId) === String(currentUserId);

        let data = isOwnProfile ? null : badgeCache.get(currentUserId);
        if (!data) {
            let apiBadges = [];
            try {
                const res = await callRobloxApiJson({
                    isRovalraApi: true,
                    subdomain: 'apis',
                    endpoint: `/v1/users/${currentUserId}/badges`,
                    method: 'GET',
                    noCache: isOwnProfile,
                });
                if (res?.status === 'success') apiBadges = res.badges;
            } catch {}

            data = { apiBadges };
            if (!isOwnProfile) badgeCache.set(currentUserId, data);
        }

        const videoStarBadgeEnabled =
            (await settings.videoStarBadgeEnabled) !== false;
        const mergedApiBadges = mergeRuntimeBadges(currentUserId, data.apiBadges, {
            videoStarBadgeEnabled,
        });

        container
            .querySelectorAll('.rovalra-header-badge, .rovalra-text-badge')
            .forEach((b) => b.remove());

        const badgesToRender = [];
        for (const key in BADGE_CONFIG) {
            const b = BADGE_CONFIG[key];
            if (b.type === 'header' && b.userIds.includes(currentUserId)) {
                badgesToRender.push({ isIcon: true, config: b });
            }
        }

        mergedApiBadges.forEach((name) => {
            if (BADGE_CONFIG[name]) {
                badgesToRender.push({
                    isIcon: true,
                    config: BADGE_CONFIG[name],
                });
            } else {
                badgesToRender.push({ isIcon: false, name });
            }
        });

        const nameEl = container.querySelector(
            '#profile-header-title-container-name',
        );

        [...badgesToRender].reverse().forEach((item) => {
            const badgeEl = document.createElement('div');
            if (item.isIcon) {
                createHeaderBadge(badgeEl, item.config);
            } else {
                createTextHeaderBadge(badgeEl, item.name);
            }

            const finalBadge = badgeEl.firstChild;
            if (nameEl) {
                nameEl.after(finalBadge);
            } else {
                container.prepend(finalBadge);
            }
        });

        container.dataset.rovalraUserId = currentUserId;
    } finally {
        container.dataset.rovalraBusy = 'false';
        if (container.dataset.rovalraPendingRender === 'true') {
            container.dataset.rovalraPendingRender = 'false';
            container.dataset.rovalraUserId = '';
            addHeaderBadges(container);
        }
    }
}

async function addProfileBadgeButtons(buttonContainer) {
    if (buttonContainer.dataset.rovalraProfileBadgesProcessed) return;
    buttonContainer.dataset.rovalraProfileBadgesProcessed = 'true';

    const currentUserId = getUserIdFromUrl();
    if (!currentUserId) return;

    const settings = await new Promise((resolve) =>
        chrome.storage.local.get({ ShowBadgesEverywhere: false }, resolve),
    );

    for (const key in BADGE_CONFIG) {
        const badge = BADGE_CONFIG[key];
        const isUserBadge = badge.userIds.includes(currentUserId);

        if (
            badge.type === 'badge' &&
            (badge.alwaysShow || settings.ShowBadgesEverywhere || isUserBadge)
        ) {
            if (isUserBadge) {
                const badgeButton = createSquareButton({
                    content: '🥚',
                    fontSize: '14px',
                    width: 'auto',
                    height: 'height-1000',
                    paddingX: 'padding-x-small',
                    disableTextTruncation: true,
                    onClick: (event) => {
                        if (badge.confetti) {
                            createConfetti(event.currentTarget, badge.confetti);
                            createRain(badge.icon);
                        }
                    },
                });

                if (badge.tooltip) addTooltip(badgeButton, badge.tooltip);
                badgeButton.style.marginRight = '5px';
                buttonContainer.prepend(badgeButton);
            }
        }
    }
}

export function init() {
    if (!groupRolesListenerInitialized) {
        groupRolesListenerInitialized = true;
        document.addEventListener('rovalra-group-roles-response', (event) => {
            const userId = String(event.detail?.userId || '');
            if (!userId) return;

            const groups = event.detail?.data?.data;
            const isVideoStar =
                Array.isArray(groups) && groups.some(isVideoStarGroupRole);
            videoStarBadgeCache.set(userId, isVideoStar);

            if (userId !== String(getUserIdFromUrl() || '')) return;

            rerenderCurrentProfileBadges();
        });

        document.addEventListener('rovalra:settingSaved', (event) => {
            if (event.detail?.name !== 'videoStarBadgeEnabled') return;
            rerenderCurrentProfileBadges();
        });
    }

    document.addEventListener('rovalra:assetsUpdated', () => {
        document
            .querySelectorAll('[data-rovalra-badge-config]')
            .forEach((icon) => {
                const badge = BADGE_CONFIG[icon.dataset.rovalraBadgeConfig];
                if (!badge) return;
                applyBadgeIconStyle(icon, badge);
            });
    });

    chrome.storage.local.get({ RoValraBadgesEnable: true }, (settings) => {
        if (!settings.RoValraBadgesEnable) return;

        // Keep the same selector to find the naming container
        const targetSelector = '#profile-header-title-container-name';

        observeElement(
            targetSelector,
            (element) => {
                const parentContainer = element.parentElement;
                if (!parentContainer) return;

                if (!parentContainer.dataset.rovalraObserved) {
                    addHeaderBadges(parentContainer);
                    parentContainer.dataset.rovalraObserved = 'true';

                    const currentId = getUserIdFromUrl();
                    parentContainer.dataset.rovalraUserId = currentId;
                } else {
                    const currentId = getUserIdFromUrl();
                    if (currentId !== parentContainer.dataset.rovalraUserId) {
                        addHeaderBadges(parentContainer);
                        parentContainer.dataset.rovalraUserId = currentId;
                    }
                }
            },
            { multiple: true },
        );

        observeElement(
            'div.button-container.flex.gap-small',
            addProfileBadgeButtons,
            { multiple: true },
        );
    });
}
