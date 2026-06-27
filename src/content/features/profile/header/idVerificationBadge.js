import { callRobloxApiJson } from '../../../core/api.js';
import { getAssets } from '../../../core/assets.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { t } from '../../../core/locale/i18n.js';

let watcherSet = false;
let lastUrl = window.location.href;
let profileDialogObserver = null;
let lastMoreButtonClickTime = 0;

const verificationCache = new Map();

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

async function getVerification(userId) {
    const authenticatedUserId = await getAuthenticatedUserId();
    const isOwnProfile =
        authenticatedUserId && String(authenticatedUserId) === String(userId);

    if (!isOwnProfile && verificationCache.has(userId)) {
        return verificationCache.get(userId);
    }

    let verification = null;
    try {
        const response = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/talent/v1/users/verification?userIds=${userId}`,
            method: 'GET',
            noCache: isOwnProfile,
        });
        verification = response?.data?.[0] || null;
    } catch (error) {}

    if (!isOwnProfile) verificationCache.set(userId, verification);
    return verification;
}

function findAboutStatsContainer(dialog) {
    const containers = Array.from(
        dialog.querySelectorAll('div.gap-small.flex.flex-col'),
    );

    return containers[containers.length - 1] || null;
}

async function injectVerificationRow(dialog, verification) {
    const parent = findAboutStatsContainer(dialog);
    if (!parent || parent.querySelector('.rovalra-id-verification-row')) return;

    const assets = getAssets();
    const isVerified = Boolean(verification?.isVerified);
    const text = await t(
        isVerified
            ? 'rovalraBadges.userVerified'
            : 'rovalraBadges.userNotVerified',
    );

    if (parent.querySelector('.rovalra-id-verification-row')) return;

    const row = document.createElement('div');
    row.className = 'items-center gap-xsmall flex rovalra-id-verification-row';

    const sibling = parent.querySelector('.items-center.gap-xsmall.flex');
    if (sibling) {
        const textBody = sibling.querySelector('.text-body-medium');
        row.style.fontSize = window.getComputedStyle(
            textBody || sibling,
        ).fontSize;
    } else {
        row.style.fontSize = '14px';
    }

    const iconSlot = document.createElement('span');
    Object.assign(iconSlot.style, {
        width: 'var(--icon-size-xsmall)',
        height: 'var(--icon-size-xsmall)',
        flex: '0 0 var(--icon-size-xsmall)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    });

    const icon = document.createElement('img');
    icon.src = isVerified ? assets.verifiedShield : assets.UnverifiedShield;
    icon.alt = '';
    Object.assign(icon.style, {
        width: '15px',
        height: '15px',
        maxWidth: 'none',
        flex: '0 0 auto',
    });

    const label = document.createElement('span');
    label.textContent = text;

    iconSlot.appendChild(icon);
    row.appendChild(iconSlot);
    row.appendChild(label);
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
                const verification = await getVerification(userId);
                if (verification) injectVerificationRow(dialog, verification);
            }
        },
        { multiple: true },
    );
}

async function run() {
    const settings = await new Promise((resolve) =>
        chrome.storage.local.get({ idVerificationBadgeEnabled: true }, resolve),
    );

    cleanup();

    if (!settings.idVerificationBadgeEnabled) return;

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
