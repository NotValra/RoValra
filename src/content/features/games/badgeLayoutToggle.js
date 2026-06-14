import { callRobloxApiJson } from '../../core/api.js';
import { getPlaceDetails } from '../../core/apis/games.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { t } from '../../core/locale/i18n.js';
import {
    observeAttributes,
    observeChildren,
    observeElement,
} from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createButton } from '../../core/ui/buttons.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';

const BADGE_LIST_CLASS = 'rovalra-badge-layout-list';
const NATIVE_LIST_CLASS = 'rovalra-badge-native-list';
const HIDDEN_BADGE_LIST_CLASS = 'rovalra-hidden-badges-list';
const GRID_VIEW_CLASS = 'rovalra-badge-grid-view';
const PREFETCH_COMPLETE_CLASS = 'rovalra-badge-prefetch-complete';
const LOAD_MORE_CONTROL_CLASS = 'rovalra-badge-load-more-control';
const CUSTOM_LOAD_MORE_CLASS = 'rovalra-badge-grid-load-more';
const GRID_HIDDEN_BADGE_CLASS = 'rovalra-badge-grid-hidden';
const GRID_STATS_CLASS = 'rovalra-badge-grid-stats';
const GRID_SHIMMER_CLASS = 'rovalra-badge-grid-shimmer';
const STORAGE_KEY = 'rovalra_badge_layout_view';
const GRID_INITIAL_VISIBLE_COUNT = 15;
const GRID_VISIBLE_INCREMENT = 15;

let initialized = false;
const universeBadgeCache = new Map();
const observedBadgeLists = new WeakSet();

async function getLocaleText() {
    const [rarity, wonYesterday, wonEver] = await Promise.all([
        t('privateGames.badges.rarity'),
        t('privateGames.badges.wonYesterday'),
        t('privateGames.badges.wonEver'),
    ]);

    return { rarity, wonYesterday, wonEver };
}

function getSavedView() {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

function saveView(value) {
    try {
        localStorage.setItem(STORAGE_KEY, value);
    } catch {}
}

function applyView(container, value) {
    container.classList.toggle(GRID_VIEW_CLASS, value === 'grid');
    updateGridVisibleBadges(container);

    if (value === 'grid' && !isShowingHiddenBadges(container)) {
        prefetchBadgeRows(container);
    }
}

function getRarityText(badge) {
    const winRate = (badge.statistics?.winRatePercentage ?? 0) * 100;
    return `${winRate.toFixed(1)}%`;
}

function formatCompactCount(value) {
    const numericValue =
        typeof value === 'number'
            ? value
            : Number(String(value).replace(/,/g, ''));

    if (!Number.isFinite(numericValue)) return String(value || '0');

    const absValue = Math.abs(numericValue);
    const formatWithSuffix = (divisor, suffix) => {
        const compactValue = numericValue / divisor;
        const digits =
            Math.abs(compactValue) < 10 && compactValue % 1 !== 0 ? 1 : 0;
        return `${compactValue.toFixed(digits).replace(/\.0$/, '')}${suffix}`;
    };

    if (absValue >= 1_000_000_000) return formatWithSuffix(1_000_000_000, 'b');
    if (absValue >= 1_000_000) return formatWithSuffix(1_000_000, 'm');
    if (absValue >= 1_000) return formatWithSuffix(1_000, 'k');

    return numericValue.toLocaleString();
}

function parseCount(value) {
    const text = String(value || '0')
        .trim()
        .toLowerCase()
        .replace(/,/g, '');
    const match = text.match(/^([\d.]+)\s*([kmb])?/);
    if (!match) return 0;

    const number = Number(match[1]);
    if (!Number.isFinite(number)) return 0;

    const multiplier = {
        k: 1_000,
        m: 1_000_000,
        b: 1_000_000_000,
    }[match[2]];

    return number * (multiplier || 1);
}

function createGridStatsElement(wonYesterday, wonEver) {
    const stats = document.createElement('div');
    stats.className = GRID_STATS_CLASS;

    const total = document.createElement('span');
    total.className = 'rovalra-badge-grid-stat';
    total.textContent = `${formatCompactCount(wonEver)} total`;

    const separator = document.createElement('span');
    separator.className = 'rovalra-badge-grid-stat-separator';
    separator.textContent = '•';

    separator.textContent = '/';
    void separator;

    const yesterday = document.createElement('span');
    yesterday.className = 'rovalra-badge-grid-stat';
    yesterday.textContent = `${formatCompactCount(wonYesterday)} yesterday`;

    stats.append(yesterday, total);

    return stats;
}

function getBadgeName(badge) {
    return badge.displayName || badge.name || `Badge ${badge.id}`;
}

async function getUniverseId() {
    const placeId = getPlaceIdFromUrl();
    if (!placeId) return null;

    const placeDetails = await getPlaceDetails(placeId);
    return placeDetails?.universeId || null;
}

async function fetchUniverseBadges(universeId) {
    const cacheKey = String(universeId);
    if (universeBadgeCache.has(cacheKey)) {
        return universeBadgeCache.get(cacheKey);
    }

    const badges = [];
    let cursor = '';

    do {
        let endpoint = `/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc`;
        if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

        const data = await callRobloxApiJson({
            subdomain: 'badges',
            endpoint,
        });

        badges.push(...(data?.data || []));
        cursor = data?.nextPageCursor || '';
    } while (cursor);

    universeBadgeCache.set(cacheKey, badges);
    return badges;
}

function createBadgeRow(badge, thumb, localeText) {
    const row = document.createElement('li');
    hydrateBadgeRow(row, badge, thumb, localeText);
    return row;
}

function hydrateBadgeRow(row, badge, thumb, localeText) {
    const name = getBadgeName(badge);
    const stats = badge.statistics || {};

    row.className = 'stack-row badge-row rovalra-prefetched-badge-row';
    row.innerHTML = '';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'badge-image';

    const link = document.createElement('a');
    link.href = `https://www.roblox.com/badges/${badge.id}/${encodeURIComponent(name)}`;

    const thumbnail = document.createElement('span');
    thumbnail.className = 'thumbnail-2d-container badge-image-container';

    const image = document.createElement('img');
    image.src = thumb?.imageUrl || '';
    image.alt = name;
    image.title = name;

    thumbnail.appendChild(image);
    link.appendChild(thumbnail);
    imageWrap.appendChild(link);

    const content = document.createElement('div');
    content.className = 'badge-content';

    const dataContainer = document.createElement('div');
    dataContainer.className = 'badge-data-container';

    const title = document.createElement('div');
    title.className = 'font-header-2 badge-name';
    title.textContent = name;

    const description = document.createElement('p');
    description.className = 'para-overflow';
    description.textContent =
        badge.displayDescription || badge.description || '';

    const gridStats = createGridStatsElement(
        stats.pastDayAwardedCount ?? 0,
        stats.awardedCount ?? 0,
    );

    dataContainer.append(title, description, gridStats);

    const statsList = document.createElement('ul');
    statsList.className = 'badge-stats-container';

    [
        [localeText.rarity, getRarityText(badge)],
        [
            localeText.wonYesterday,
            (stats.pastDayAwardedCount ?? 0).toLocaleString(),
        ],
        [localeText.wonEver, (stats.awardedCount ?? 0).toLocaleString()],
    ].forEach(([label, value]) => {
        const item = document.createElement('li');
        const labelEl = document.createElement('div');
        labelEl.className = 'text-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('div');
        valueEl.className = 'font-header-2 badge-stats-info';
        valueEl.textContent = value;
        item.append(labelEl, valueEl);
        statsList.appendChild(item);
    });

    content.append(dataContainer, statsList);
    row.append(imageWrap, content);
    return row;
}

function renderGridShimmer(list, count = GRID_INITIAL_VISIBLE_COUNT) {
    list.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const row = document.createElement('li');
        row.className = `stack-row badge-row ${GRID_SHIMMER_CLASS}`;

        const imageWrap = document.createElement('div');
        imageWrap.className = 'badge-image';

        const image = document.createElement('div');
        image.className =
            'thumbnail-2d-container badge-image-container shimmer';
        imageWrap.appendChild(image);

        const content = document.createElement('div');
        content.className = 'badge-content';

        const dataContainer = document.createElement('div');
        dataContainer.className = 'badge-data-container';

        const title = document.createElement('div');
        title.className = 'shimmer rovalra-badge-grid-shimmer-title';

        const stats = document.createElement('div');
        stats.className = 'rovalra-badge-grid-stats';

        const wonYesterday = document.createElement('span');
        wonYesterday.className = 'shimmer rovalra-badge-grid-shimmer-stat';

        const wonEver = document.createElement('span');
        wonEver.className = 'shimmer rovalra-badge-grid-shimmer-stat';

        stats.append(wonYesterday, wonEver);
        dataContainer.append(title, stats);
        content.appendChild(dataContainer);
        row.append(imageWrap, content);
        list.appendChild(row);
    }
}

function markLoadMoreControls(container) {
    container.querySelectorAll('.btn-full-width').forEach((control) => {
        if (control.classList.contains(CUSTOM_LOAD_MORE_CLASS)) return;
        if (control.classList.contains('rovalra-ui-btn')) return;
        if (container.querySelector('.container-header')?.contains(control))
            return;

        if (
            control.matches('button, a, [role="button"]') &&
            !control.closest(`.${BADGE_LIST_CLASS}`)
        ) {
            control.classList.add(LOAD_MORE_CONTROL_CLASS);
        }
    });
}

function isShowingHiddenBadges(container) {
    return container.classList.contains('rovalra-show-hidden-badges');
}

function getActiveBadgeList(container) {
    if (isShowingHiddenBadges(container)) {
        return container.querySelector(`:scope > .${HIDDEN_BADGE_LIST_CLASS}`);
    }

    return container.querySelector(`:scope > .${BADGE_LIST_CLASS}`);
}

function observeBadgeList(list, container) {
    if (!list || observedBadgeLists.has(list)) return;

    observedBadgeLists.add(list);
    observeChildren(list, () => {
        updateGridVisibleBadges(container);
    });
}

function observeManagedBadgeLists(container) {
    observeBadgeList(
        container.querySelector(`:scope > .${BADGE_LIST_CLASS}`),
        container,
    );
    observeBadgeList(
        container.querySelector(`:scope > .${HIDDEN_BADGE_LIST_CLASS}`),
        container,
    );
}

function isRowShimmer(row) {
    return (
        row.classList.contains(GRID_SHIMMER_CLASS) ||
        row.classList.contains('rovalra-hidden-badge-shimmer')
    );
}

function getBadgeRows(container) {
    const list = getActiveBadgeList(container);
    if (!list) return [];
    return [...list.querySelectorAll(':scope > .stack-row.badge-row')].filter(
        (row) => !isRowShimmer(row),
    );
}

function isActiveBadgeListLoading(container) {
    const list = getActiveBadgeList(container);
    if (!list) return false;

    if (isShowingHiddenBadges(container)) {
        return list.dataset.rovalraHiddenBadgesLoading === 'true';
    }

    return container.dataset.rovalraBadgePrefetchLoading === 'true';
}

function getRowTotalAwarded(row) {
    const statItems = row.querySelectorAll('.badge-stats-container > li');
    const wonEver =
        statItems[2]?.querySelector('.badge-stats-info')?.textContent;
    return parseCount(wonEver);
}

function sortBadgeRowsByTotal(container) {
    const list = getActiveBadgeList(container);
    if (!list) return;

    const rows = getBadgeRows(container);
    const sortedRows = [...rows].sort(
        (a, b) => getRowTotalAwarded(b) - getRowTotalAwarded(a),
    );

    if (sortedRows.every((row, index) => row === rows[index])) return;

    const fragment = document.createDocumentFragment();
    sortedRows.forEach((row) => fragment.appendChild(row));
    list.appendChild(fragment);
}

function ensureGridStats(container) {
    getBadgeRows(container).forEach((row) => {
        if (row.querySelector(`.${GRID_STATS_CLASS}`)) return;

        const statItems = row.querySelectorAll('.badge-stats-container > li');
        const wonYesterday =
            statItems[1]?.querySelector('.badge-stats-info')?.textContent ||
            '0';
        const wonEver =
            statItems[2]?.querySelector('.badge-stats-info')?.textContent ||
            '0';

        const dataContainer = row.querySelector('.badge-data-container');
        dataContainer?.appendChild(
            createGridStatsElement(wonYesterday, wonEver),
        );
    });
}

function getVisibleLimit(container) {
    const limit = Number(container.dataset.rovalraBadgeGridVisibleCount);
    if (Number.isFinite(limit) && limit > 0) return limit;
    return GRID_INITIAL_VISIBLE_COUNT;
}

function getOrCreateCustomLoadMore(container) {
    let button = container.querySelector(`.${CUSTOM_LOAD_MORE_CLASS}`);

    if (!button) {
        button = createButton('See More', 'secondary', {
            onClick: () => {
                const nextLimit =
                    getVisibleLimit(container) + GRID_VISIBLE_INCREMENT;
                container.dataset.rovalraBadgeGridVisibleCount =
                    String(nextLimit);
                updateGridVisibleBadges(container);
            },
        });
        button.classList.add(CUSTOM_LOAD_MORE_CLASS, 'btn-full-width');
    }

    const list = getActiveBadgeList(container);
    if (list && button.previousElementSibling !== list) {
        list.after(button);
    }
    return button;
}

function updateGridVisibleBadges(container) {
    const rows = getBadgeRows(container);
    const isGridView = container.classList.contains(GRID_VIEW_CLASS);
    const limit = getVisibleLimit(container);

    if (!isGridView) {
        rows.forEach((row) => row.classList.remove(GRID_HIDDEN_BADGE_CLASS));
        container
            .querySelector(`.${CUSTOM_LOAD_MORE_CLASS}`)
            ?.classList.add('hidden');
        return;
    }

    if (isActiveBadgeListLoading(container)) {
        container
            .querySelector(`.${CUSTOM_LOAD_MORE_CLASS}`)
            ?.classList.add('hidden');
        return;
    }

    ensureGridStats(container);
    sortBadgeRowsByTotal(container);

    const sortedRows = getBadgeRows(container);
    sortedRows.forEach((row, index) => {
        row.classList.toggle(GRID_HIDDEN_BADGE_CLASS, index >= limit);
    });

    const button = getOrCreateCustomLoadMore(container);
    button.classList.toggle('hidden', sortedRows.length <= limit);
}

async function prefetchBadgeRows(container) {
    if (
        container.dataset.rovalraBadgePrefetchLoading ||
        container.dataset.rovalraBadgePrefetchLoaded
    ) {
        return;
    }

    const list = container.querySelector(`.${BADGE_LIST_CLASS}`);
    if (!list) return;

    container.dataset.rovalraBadgePrefetchLoading = 'true';
    renderGridShimmer(list);
    updateGridVisibleBadges(container);

    try {
        const universeId = await getUniverseId();
        if (!universeId) return;

        const badges = await fetchUniverseBadges(universeId);
        const sortedBadges = badges
            .filter((badge) => badge?.id)
            .sort(
                (a, b) =>
                    (b.statistics?.awardedCount ?? 0) -
                    (a.statistics?.awardedCount ?? 0),
            );

        if (sortedBadges.length > 0) {
            const [thumbMap, localeText] = await Promise.all([
                fetchThumbnails(
                    sortedBadges.map((badge) => ({ id: badge.id })),
                    'BadgeIcon',
                    '150x150',
                ),
                getLocaleText(),
            ]);

            const shimmerRows = [
                ...list.querySelectorAll(`:scope > .${GRID_SHIMMER_CLASS}`),
            ];

            sortedBadges.forEach((badge, index) => {
                const row = shimmerRows[index];
                if (row) {
                    hydrateBadgeRow(
                        row,
                        badge,
                        thumbMap.get(badge.id),
                        localeText,
                    );
                    return;
                }

                list.appendChild(
                    createBadgeRow(badge, thumbMap.get(badge.id), localeText),
                );
            });

            shimmerRows
                .slice(sortedBadges.length)
                .forEach((row) => row.remove());
        } else {
            list.innerHTML = '';
        }

        container.dataset.rovalraBadgePrefetchLoaded = 'true';
        container.classList.add(PREFETCH_COMPLETE_CLASS);
        markLoadMoreControls(container);
    } catch (error) {
        list.innerHTML = '';
        console.warn('RoValra: Failed to prefetch game badges', error);
    } finally {
        delete container.dataset.rovalraBadgePrefetchLoading;
        updateGridVisibleBadges(container);
    }
}

function createGridList(nativeList) {
    const existingList = nativeList.parentElement?.querySelector(
        `:scope > .${BADGE_LIST_CLASS}`,
    );
    if (existingList) return existingList;

    const gridList = document.createElement('ul');
    gridList.className = `stack-list ${BADGE_LIST_CLASS}`;
    nativeList.after(gridList);
    return gridList;
}

function setupBadgeLayoutToggle(container) {
    if (container.dataset.rovalraBadgeLayoutToggleAdded) return;

    const header = container.querySelector('.container-header');
    const nativeList = container.querySelector('.stack-list');
    if (!header || !nativeList) return;

    container.dataset.rovalraBadgeLayoutToggleAdded = 'true';
    nativeList.classList.add(NATIVE_LIST_CLASS);
    createGridList(nativeList);
    markLoadMoreControls(container);
    observeManagedBadgeLists(container);
    observeChildren(container, () => {
        markLoadMoreControls(container);
        observeManagedBadgeLists(container);
        updateGridVisibleBadges(container);
    });
    observeAttributes(container, () => {
        updateGridVisibleBadges(container);
        if (
            container.classList.contains(GRID_VIEW_CLASS) &&
            !isShowingHiddenBadges(container)
        ) {
            prefetchBadgeRows(container);
        }
    }, ['class']);

    const initialValue = getSavedView();
    container.dataset.rovalraBadgeGridVisibleCount = String(
        GRID_INITIAL_VISIBLE_COUNT,
    );
    applyView(container, initialValue);

    const toggle = createPillToggle({
        options: [
            { text: 'List', value: 'list' },
            { text: 'Grid', value: 'grid' },
        ],
        initialValue,
        onChange: (value) => {
            applyView(container, value);
            saveView(value);
        },
    });

    toggle.classList.add('rovalra-badge-layout-toggle');
    header.appendChild(toggle);
}

export async function init() {
    if (initialized) return;
    if (!(await settings.badgeLayoutToggleEnabled)) return;
    initialized = true;

    observeElement('.game-badges-list', setupBadgeLayoutToggle, {
        multiple: true,
    });
}

export default init;
