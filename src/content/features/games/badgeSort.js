import { t, ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import {
    createBadgeRow,
    fetchUniverseBadges,
    getLocaleText,
    getUniverseId,
} from './badgeLayoutToggle.js';

const SORTED_CLASS = 'rovalra-badge-sorted';
const SORTED_LIST_CLASS = 'rovalra-badge-sorted-list';
const LOAD_MORE_CLASS = 'rovalra-badge-sort-load-more';
const STORAGE_KEY = 'rovalra_badge_sort';
const PAGE_SIZE = 15;

const time = (value) => new Date(value).getTime() || 0;
const won = (badge) => badge.statistics?.awardedCount ?? 0;
const winRate = (badge) => badge.statistics?.winRatePercentage ?? 0;
const badgeName = (badge) => badge.displayName || badge.name || '';

const SORTS = {
    default: null,
    updated: (a, b) => time(b.updated) - time(a.updated),
    newest: (a, b) => time(b.created) - time(a.created),
    oldest: (a, b) => time(a.created) - time(b.created),
    mostWon: (a, b) => won(b) - won(a),
    leastWon: (a, b) => won(a) - won(b),
    wonYesterday: (a, b) =>
        (b.statistics?.pastDayAwardedCount ?? 0) -
        (a.statistics?.pastDayAwardedCount ?? 0),
    rarest: (a, b) => winRate(a) - winRate(b),
    easiest: (a, b) => winRate(b) - winRate(a),
    name: (a, b) => badgeName(a).localeCompare(badgeName(b)),
};
const DATE_SORTS = { updated: 'updated', newest: 'created', oldest: 'created' };

let initialized = false;

function getSavedSort() {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value in SORTS ? value : 'default';
    } catch {
        return 'default';
    }
}

function saveSort(value) {
    try {
        localStorage.setItem(STORAGE_KEY, value);
    } catch {}
}

function addDateLine(row, badge, field) {
    const dataContainer = row.querySelector('.badge-data-container');
    if (!dataContainer || !badge[field]) return;

    const line = document.createElement('div');
    line.className = 'rovalra-badge-sort-date text-label';
    line.append(
        `${ts(field === 'updated' ? 'badgeSort.updated' : 'badgeSort.created')} `,
        createInteractiveTimestamp(badge[field], { initialFormat: 'relative' }),
    );
    dataContainer.querySelector('.badge-name')?.after(line);
}

async function renderSorted(container, state) {
    const { list, loadMore } = state;
    const compare = SORTS[state.sort];
    const renderId = ++state.renderId;

    if (!compare) {
        container.classList.remove(SORTED_CLASS);
        list.innerHTML = '';
        loadMore.classList.add('hidden');
        return;
    }

    container.classList.add(SORTED_CLASS);

    try {
        const universeId =
            document.querySelector('#game-detail-meta-data')?.dataset
                .universeId || (await getUniverseId());
        if (!universeId) throw new Error('Universe not found');
        state.badges ||= await fetchUniverseBadges(universeId);
        state.localeText ||= await getLocaleText();
    } catch (error) {
        console.warn('RoValra: Failed to load badges for sorting', error);
        container.classList.remove(SORTED_CLASS);
        return;
    }
    if (renderId !== state.renderId) return;

    state.sorted = state.badges.filter((badge) => badge?.id).sort(compare);
    state.shown = 0;
    list.innerHTML = '';
    await showMore(state);
}

async function showMore(state) {
    const { list, loadMore } = state;
    const renderId = state.renderId;
    const next = state.sorted.slice(state.shown, state.shown + PAGE_SIZE);
    state.shown += next.length;

    if (next.length) {
        const thumbMap = await fetchThumbnails(
            next.map((badge) => ({ id: badge.id })),
            'BadgeIcon',
            '150x150',
        );
        if (renderId !== state.renderId) return;

        const dateField = DATE_SORTS[state.sort];
        next.forEach((badge) => {
            const row = createBadgeRow(
                badge,
                thumbMap.get(badge.id),
                state.localeText,
            );
            if (dateField) addDateLine(row, badge, dateField);
            list.appendChild(row);
        });
    }

    loadMore.classList.toggle('hidden', state.shown >= state.sorted.length);
}

async function setupBadgeSort(container) {
    if (container.dataset.rovalraBadgeSortAdded) return;

    const header = container.querySelector('.container-header');
    const nativeList = container.querySelector('.stack-list');
    if (!header || !nativeList) return;
    container.dataset.rovalraBadgeSortAdded = 'true';

    const list = document.createElement('ul');
    list.className = `stack-list ${SORTED_LIST_CLASS}`;

    const loadMore = createButton(await t('badgeSort.seeMore'), 'secondary', {
        onClick: () => showMore(state),
    });
    loadMore.classList.add(LOAD_MORE_CLASS, 'btn-full-width', 'hidden');

    container.append(list, loadMore);

    const state = {
        sort: getSavedSort(),
        list,
        loadMore,
        badges: null,
        renderId: 0,
    };

    const labels = await Promise.all(
        Object.keys(SORTS).map((key) => t(`badgeSort.options.${key}`)),
    );
    const dropdown = createDropdown({
        items: Object.keys(SORTS).map((value, i) => ({
            value,
            label: labels[i],
        })),
        initialValue: state.sort,
        onValueChange: (value) => {
            state.sort = value;
            saveSort(value);
            renderSorted(container, state);
        },
    });
    dropdown.element.classList.add('rovalra-badge-sort-dropdown');
    dropdown.element.title = await t('badgeSort.label');

    const layoutToggle = header.querySelector('.rovalra-badge-layout-toggle');
    if (layoutToggle) layoutToggle.before(dropdown.element);
    else header.appendChild(dropdown.element);

    if (state.sort !== 'default') renderSorted(container, state);
}

export async function init() {
    if (initialized) return;
    if (!(await settings.badgeSortEnabled)) return;
    initialized = true;

    observeElement('.game-badges-list', setupBadgeSort, { multiple: true });
}

export default init;
