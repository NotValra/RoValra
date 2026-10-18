import { getBadgeAwardedDate } from '../../core/apis/badges.js';
import { getBadgeIdFromUrl } from '../../core/idExtractor.js';
import { observeChildren, observeElement } from '../../core/observer.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';

const MARKER = 'data-rovalra-badge-earned-date';
const observed = new WeakSet();

async function getAwardedDate(userId, badgeId) {
    const result = await getBadgeAwardedDate(userId, badgeId);
    return result?.awardedDate || null;
}

function getTargetDataContainer(target) {
    if (target.matches('.item-details')) return target;
    const isGrid = target.closest('.game-badges-list')?.classList.contains(
        'rovalra-badge-grid-view',
    );
    return target.querySelector(
        isGrid
            ? '.rovalra-badge-grid-stats'
            : '.badge-stats-container',
    );
}

function getTargetBadgeId(target) {
    if (target.matches('.item-details')) return getBadgeIdFromUrl();
    return target.querySelector('a[href*="/badges/"]')?.href.match(
        /\/badges\/(\d+)/i,
    )?.[1] || null;
}

async function update(target) {
    const isGrid = target.closest('.game-badges-list')?.classList.contains(
        'rovalra-badge-grid-view',
    );
    if (isGrid) {
        target.querySelector(`[${MARKER}]`)?.remove();
        return;
    }
    const dataContainer = getTargetDataContainer(target);
    if (!dataContainer) return;
    const badgeId = getTargetBadgeId(target);
    const userId = await getAuthenticatedUserId();
    if (!badgeId || !userId) return;
    const navigationKey = `${userId}:${badgeId}`;
    const existing = dataContainer.querySelector(`[${MARKER}]`);
    if (existing?.dataset.rovalraBadgeEarnedDateKey === navigationKey) return;
    existing?.remove();
    dataContainer.dataset.rovalraBadgeEarnedDateNavigation = navigationKey;
    const awardedDate = await getAwardedDate(userId, badgeId);
    if (
        dataContainer.dataset.rovalraBadgeEarnedDateNavigation !== navigationKey ||
        !awardedDate
    ) return;

    const row = document.createElement(
        target.matches('.item-details') || isGrid ? 'div' : 'li',
    );
    row.setAttribute(MARKER, 'true');
    row.dataset.rovalraBadgeEarnedDateKey = navigationKey;
    if (target.matches('.item-details')) {
        row.className = 'clearfix item-field-container rovalra-badge-earned-date';
        const label = document.createElement('div');
        label.className =
            'font-header-1 text-subheader text-label text-overflow field-label';
        label.textContent = ts('badgeEarnedDate.unlocked');
        const value = document.createElement('div');
        value.className = 'field-content';
        value.appendChild(createInteractiveTimestamp(awardedDate));
        row.append(label, value);
    } else {
        row.className = 'rovalra-badge-earned-date';
        const label = document.createElement('div');
        label.className = 'text-label';
        label.textContent = ts('badgeEarnedDate.unlocked');
        const value = document.createElement('div');
        value.className = 'font-header-2 badge-stats-info';
        value.appendChild(createInteractiveTimestamp(awardedDate));
        row.append(label, value);
    }
    if (target.matches('.item-details')) {
        const descriptionRow = dataContainer.querySelector(
            '.toggle-target.item-field-container',
        );
        if (descriptionRow) {
            dataContainer.insertBefore(row, descriptionRow);
            return;
        }
    }
    dataContainer.append(row);
}

function setup(target) {
    if (observed.has(target)) return;
    observed.add(target);
    let timer;
    const refresh = () => {
        clearTimeout(timer);
        timer = setTimeout(() => update(target), 100);
    };
    observeChildren(target, refresh);
    refresh();
}

export async function init() {
    if ((await settings.badgeEarnedDateEnabled) === false) return;
    observeElement('.item-details, .stack-row.badge-row', setup, {
        multiple: true,
    });
}

export default init;
