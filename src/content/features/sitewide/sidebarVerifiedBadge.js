import { settings } from '../../core/settings/getSettings';
import { getAuthenticatedUserVerified } from '../../core/user.js';
import { getAssets } from '../../core/assets.js';
import { observeElement } from '../../core/observer.js';
import { ts } from '../../core/locale/i18n.js';

const SIDEBAR_PROFILE_LINK_SELECTOR =
    'a[href="/users/profile"].text-title-large';
const TOPNAV_PROFILE_LINK_SELECTOR = '.age-bracket-label a';
const BADGE_CLASS = 'rovalra-sidebar-verified-badge';

function addBadge(link, nameSelector, size) {
    if (link.querySelector(`.${BADGE_CLASS}`)) return;

    const nameSpan = link.querySelector(nameSelector);
    if (!nameSpan) return;

    const badge = document.createElement('img');
    badge.className = BADGE_CLASS;
    badge.src = getAssets().verifiedBadgeMono;
    badge.alt = ts('quickSearch.verifiedBadge');
    badge.title = ts('quickSearch.verified');
    Object.assign(badge.style, {
        width: size,
        height: size,
        flexShrink: '0',
    });

    nameSpan.after(badge);
}

export async function init() {
    if (!(await settings.sidebarVerifiedBadgeEnabled)) return;
    if (!(await getAuthenticatedUserVerified())) return;

    observeElement(
        SIDEBAR_PROFILE_LINK_SELECTOR,
        (link) => addBadge(link, '.text-truncate-end', '20px'),
        { multiple: true },
    );
    observeElement(
        TOPNAV_PROFILE_LINK_SELECTOR,
        (link) => addBadge(link, '.age-bracket-label-username', '18px'),
        { multiple: true },
    );
}
