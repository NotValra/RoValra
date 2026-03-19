import { observeElement } from '../../../core/observer.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { createConfetti } from '../../../core/fun/confetti.js';
import { BADGE_CONFIG } from '../../../core/configs/badges.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';
import { getAssets } from '../../../core/assets.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { t } from '../../../core/locale/i18n.js';
const badgeCache = new Map();

function ensureShineStyle() {
    if (document.getElementById('rovalra-badge-shine-style')) return;
    const style = document.createElement('style');
    style.id = 'rovalra-badge-shine-style';
    style.textContent = `
        @keyframes rovalra-badge-shine-move {
            0% { left: -100%; }
            40% { left: 200%; }
            100% { left: 200%; }
        }
    `;
    document.head.appendChild(style);
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
    });

    const icon = document.createElement('img');
    icon.src = badge.icon;
    icon.dataset.badgeId = badge.tooltip || 'badge';
    Object.assign(icon.style, {
        width: badge.size || 'var(--icon-size-large)',
        height: badge.size || 'var(--icon-size-large)',
        cursor: 'pointer',
        ...badge.style,
    });

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
            width: '50%',
            height: '100%',
            background:
                'linear-gradient(to right, transparent, rgba(255,255,255,0.8), transparent)',
            transform: 'skewX(-25deg)',
            animation: 'rovalra-badge-shine-move 5s infinite',
        });

        shineContainer.appendChild(shineBar);
        iconContainer.appendChild(shineContainer);
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
    `;
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
        `;
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

    if (container.dataset.rovalraBusy === 'true') return;
    container.dataset.rovalraBusy = 'true';

    try {
        let data = badgeCache.get(currentUserId);
        if (!data) {
            const settings = await new Promise((r) =>
                chrome.storage.local.get(
                    { idVerificationBadgeEnabled: true },
                    r,
                ),
            );

            let verification = null;
            if (settings.idVerificationBadgeEnabled) {
                try {
                    const res = await callRobloxApiJson({
                        subdomain: 'apis',
                        endpoint: `/talent/v1/users/verification?userIds=${currentUserId}`,
                        method: 'GET',
                    });
                    verification = res?.data?.[0];
                } catch (e) {}
            }

            let apiBadges = [];
            try {
                const res = await callRobloxApiJson({
                    isRovalraApi: true,
                    subdomain: 'apis',
                    endpoint: `/v1/users/${currentUserId}/badges`,
                    method: 'GET',
                });
                if (res?.status === 'success') apiBadges = res.badges;
            } catch (e) {}

            data = { verification, apiBadges };
            badgeCache.set(currentUserId, data);
        }

        container
            .querySelectorAll('.rovalra-header-badge, .rovalra-text-badge')
            .forEach((b) => b.remove());

        const badgesToRender = [];
        if (data.verification) {
            const assets = getAssets();
            badgesToRender.push({
                isIcon: true,
                config: data.verification.isVerified
                    ? {
                          icon: assets.verifiedShield,
                          tooltip: await t('rovalraBadges.userVerified'),
                      }
                    : {
                          icon: assets.UnverifiedShield,
                          tooltip: await t('rovalraBadges.userNotVerified'),
                      },
            });
        }

        for (const key in BADGE_CONFIG) {
            const b = BADGE_CONFIG[key];
            if (b.type === 'header' && b.userIds.includes(currentUserId)) {
                badgesToRender.push({ isIcon: true, config: b });
            }
        }

        data.apiBadges.forEach((name) => {
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
            '.flex.gap-small.buttons-show-on-desktop',
            addProfileBadgeButtons,
            { multiple: true },
        );
    });
}
