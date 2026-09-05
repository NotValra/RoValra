import { callRobloxApiJson } from '../../../core/api.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { Icon } from '../../../core/ui/buildericon.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { t } from '../../../core/locale/i18n.js';

let watcherSet = false;
let lastUrl = window.location.href;
let profileDialogObserver = null;
let lastMoreButtonClickTime = 0;

const ageVerificationCache = new Map();
const AGE_VERIFICATION_ITEM_IDS = [
    '119934643965525',
    '121199209890990',
];

document.addEventListener(
    'click',
    (event) => {
        const button = event.target.closest('button.more-btn');
        if (button && button.getAttribute('aria-label') === 'more') {
            lastMoreButtonClickTime = Date.now();
        }
    },
    true,
);

function cleanup() {
    if (profileDialogObserver) {
        profileDialogObserver.disconnect();
        profileDialogObserver = null;
    }
}

async function checkAgeVerificationItem(userId, itemId) {
    try {
        const isAgeVerified = await callRobloxApiJson({
            subdomain: 'inventory',
            endpoint: `/v1/users/${userId}/items/0/${itemId}/is-owned`,
            method: 'GET',
        });

        return typeof isAgeVerified === 'boolean' ? isAgeVerified : null;
    } catch (error) {
        console.warn('RoValra: Failed to check age verification status', error);
        return null;
    }
}

async function getAgeVerification(userId) {
    if (ageVerificationCache.has(userId)) {
        return ageVerificationCache.get(userId);
    }

    const results = await Promise.all(
        AGE_VERIFICATION_ITEM_IDS.map((itemId) =>
            checkAgeVerificationItem(userId, itemId),
        ),
    );

    const isAgeVerified = results.some((result) => result === true)
        ? true
        : results.some((result) => result === null)
          ? null
          : false;

    if (isAgeVerified !== null) {
        ageVerificationCache.set(userId, isAgeVerified);
    }

    return isAgeVerified;
}

function findAboutStatsContainer(dialog) {
    const containers = Array.from(
        dialog.querySelectorAll('div.gap-small.flex.flex-col'),
    );

    return containers[containers.length - 1] || null;
}

async function injectAgeVerificationRow(dialog, isAgeVerified) {
    const parent = findAboutStatsContainer(dialog);
    if (!parent || parent.querySelector('.rovalra-age-verification-row'))
        return;

    const row = document.createElement('div');
    row.className = 'items-center gap-xsmall flex rovalra-age-verification-row';

    const sibling = parent.querySelector('.items-center.gap-xsmall.flex');
    row.style.fontSize = window.getComputedStyle(
        sibling?.querySelector('.text-body-medium') || sibling || parent,
    ).fontSize;

    const iconSlot = document.createElement('span');
    Object.assign(iconSlot.style, {
        width: 'var(--icon-size-xsmall)',
        height: 'var(--icon-size-xsmall)',
        flex: '0 0 var(--icon-size-xsmall)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    });

    const icon = Icon({
        icon: isAgeVerified
            ? 'photo-camera-face-lightning-bolt'
            : 'photo-camera-slash',
        size: '15px',
        classes: 'rovalra-age-verification-icon',
    });
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = await t(
        isAgeVerified
            ? 'rovalraBadges.userAgeVerified'
            : 'rovalraBadges.userNotAgeVerified',
    );

    iconSlot.appendChild(icon);
    row.appendChild(iconSlot);
    row.appendChild(label);

    if (!isAgeVerified) {
        addTooltip(
            row,
            await t('rovalraBadges.userAgeVerificationMayBeInaccurate'),
        );
    }

    parent.appendChild(row);
}

function initProfileAboutDialogObserver(userId) {
    cleanup();

    profileDialogObserver = observeElement(
        'div[role="dialog"]',
        async (dialog) => {
            const heading = dialog.querySelector('h2');
            if (
                heading &&
                heading.textContent === 'About' &&
                Date.now() - lastMoreButtonClickTime < 1500
            ) {
                const isAgeVerified = await getAgeVerification(userId);
                if (isAgeVerified !== null) {
                    injectAgeVerificationRow(dialog, isAgeVerified);
                }
            }
        },
        { multiple: true },
    );
}

async function run() {
    cleanup();

    if (!(await settings.ageVerificationBadgeEnabled)) return;

    const userId = getUserIdFromUrl(window.location.href);
    if (!userId) return;

    initProfileAboutDialogObserver(userId);
}

export function init() {
    if (watcherSet) return;
    watcherSet = true;

    const handlePageChange = () => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            run();
        }
    };

    window.addEventListener('popstate', handlePageChange);
    observeElement('body', handlePageChange, { multiple: false });

    run();
}
