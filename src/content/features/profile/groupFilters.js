import { observeElement, observeChildren } from '../../core/observer.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { getUserIdFromUrl, getGroupIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApiJson } from '../../core/api.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const joinDateCache = new Map();
const joinDatePromises = new Map();
const hiddenJoinDates = new Set();
const HIDDEN_JOIN_DATE = 'hidden';
const joinDateQueue = [];
const JOIN_DATE_CONCURRENCY = 4;
const JOIN_DATE_MAX_ATTEMPTS = 4;
let activeJoinDateRequests = 0;
const VIEW_PREFERENCE_KEY = 'rovalra_group_filters_view';
const DEFAULT_VIEW = 'default';

function getStoredViewPreference() {
    return chrome.storage.local
        .get({ [VIEW_PREFERENCE_KEY]: DEFAULT_VIEW })
        .then((stored) =>
            stored[VIEW_PREFERENCE_KEY] === 'grid' ? 'grid' : DEFAULT_VIEW,
        )
        .catch(() => DEFAULT_VIEW);
}

function runJoinDateRequest(task) {
    const start = async () => {
        try {
            return await task();
        } finally {
            const next = joinDateQueue.shift();
            if (next) next();
            else activeJoinDateRequests--;
        }
    };

    if (activeJoinDateRequests < JOIN_DATE_CONCURRENCY) {
        activeJoinDateRequests++;
        return start();
    }
    return new Promise((resolve) => joinDateQueue.push(resolve)).then(start);
}

function isTransientError(status, attempt) {
    if (status === 401) return attempt === 0;
    return !status || status === 429 || status >= 500;
}

function getCachedJoinDate(groupId, userId) {
    return joinDateCache.get(`${userId}_${groupId}`);
}

function isMemberListHidden(error) {
    return (
        error.status === 403 &&
        error.response?.code === 'PERMISSION_DENIED' &&
        /not visible/i.test(error.response?.message || '')
    );
}

export function isJoinDateHidden(groupId, userId) {
    return hiddenJoinDates.has(`${userId}_${groupId}`);
}

async function fetchMembership(groupId, userId) {
    const filter = encodeURIComponent(`user == 'users/${userId}'`);

    for (let attempt = 0; ; attempt++) {
        try {
            return await runJoinDateRequest(() =>
                callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: `/cloud/v2/groups/${groupId}/memberships?filter=${filter}`,
                    useApiKey: true,
                    useBackground: true,
                }),
            );
        } catch (e) {
            if (
                attempt + 1 >= JOIN_DATE_MAX_ATTEMPTS ||
                !isTransientError(e.status, attempt)
            ) {
                throw e;
            }
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
    }
}

export async function getJoinDate(groupId, userId) {
    if (!groupId || !userId) return new Date(0);
    const memoryKey = `${userId}_${groupId}`;
    if (joinDateCache.has(memoryKey)) return joinDateCache.get(memoryKey);
    if (joinDatePromises.has(memoryKey)) return joinDatePromises.get(memoryKey);

    const promise = (async () => {
        const cacheKey = `join_date_v3_${userId}_${groupId}`;
        const cached = await CacheHandler.get(
            'group_filters',
            cacheKey,
            'local',
        );

        if (cached === HIDDEN_JOIN_DATE) {
            const unknownDate = new Date(0);
            hiddenJoinDates.add(memoryKey);
            joinDateCache.set(memoryKey, unknownDate);
            return unknownDate;
        }

        if (cached) {
            const date = new Date(cached);
            joinDateCache.set(memoryKey, date);
            return date;
        }

        try {
            const res = await fetchMembership(groupId, userId);

            const createTime = res?.groupMemberships?.[0]?.createTime;
            if (createTime) {
                const date = new Date(createTime);
                CacheHandler.set(
                    'group_filters',
                    cacheKey,
                    createTime,
                    'local',
                );
                joinDateCache.set(memoryKey, date);
                return date;
            }
        } catch (e) {
            if (isMemberListHidden(e)) {
                CacheHandler.set(
                    'group_filters',
                    cacheKey,
                    HIDDEN_JOIN_DATE,
                    'local',
                );
                hiddenJoinDates.add(memoryKey);
                const unknownDate = new Date(0);
                joinDateCache.set(memoryKey, unknownDate);
                return unknownDate;
            }

            if (
                e.status === 403 ||
                e.status === 404 ||
                e.response?.code === 'PERMISSION_DENIED'
            ) {
                const unknownDate = new Date(0);
                CacheHandler.set(
                    'group_filters',
                    cacheKey,
                    unknownDate.toISOString(),
                    'local',
                );
                joinDateCache.set(memoryKey, unknownDate);
                return unknownDate;
            }

            console.warn(
                `RoValra: Failed to fetch join date for group ${groupId}`,
                e,
            );
            return new Date(0);
        }
    })();

    joinDatePromises.set(memoryKey, promise);
    try {
        return await promise;
    } finally {
        joinDatePromises.delete(memoryKey);
    }
}

export async function init() {
    const userId = getUserIdFromUrl();
    if (!userId) return;

    if ((await settings.groupFiltersEnabled) === false) return;

    observeElement(
        '.profile-communities',
        (container) => {
            const getCarousel = () => {
                const item = container.querySelector(
                    '#collection-carousel-item, [id="collection-carousel-item"], [class*="-carouselItem"]',
                );
                return (
                    item?.parentElement ||
                    container.querySelector(
                        '.css-1i465w8-carousel, [class*="-carousel"]',
                    )
                );
            };

            const setup = async () => {
                const carousel = getCarousel();
                if (!carousel || container.dataset.rovalraFiltersAdded) return;

                const items = Array.from(
                    carousel.querySelectorAll(
                        '#collection-carousel-item, [id="collection-carousel-item"], [class*="-carouselItem"]',
                    ),
                );

                if (items.length === 0) return;

                container.dataset.rovalraFiltersAdded = 'true';

                items.forEach((item) => {
                    const link = item.querySelector('a');
                    const groupId = getGroupIdFromUrl(
                        link?.getAttribute('href'),
                    );
                    if (groupId) {
                        getJoinDate(groupId, userId);
                    }
                });

                const header = container.querySelector('h2');
                if (!header) return;

                const storedView = await getStoredViewPreference();

                const headerWrapper = document.createElement('div');
                headerWrapper.style.display = 'flex';
                headerWrapper.style.alignItems = 'center';
                headerWrapper.style.justifyContent = 'space-between';
                headerWrapper.style.width = '100%';
                headerWrapper.style.marginBottom = '12px';
                headerWrapper.style.gap = '12px';

                header.parentNode.insertBefore(headerWrapper, header);
                headerWrapper.appendChild(header);

                const originalOrder = [...items];

                let currentView = storedView;
                const viewOptions = [
                    { text: ts('groupFilters.view.row'), value: DEFAULT_VIEW },
                    { text: ts('groupFilters.view.grid'), value: 'grid' },
                ];

                const applyView = (value, activeCarousel = getCarousel()) => {
                    if (!activeCarousel) return;

                    currentView = value === 'grid' ? 'grid' : DEFAULT_VIEW;
                    const rowButtons =
                        activeCarousel.parentElement?.querySelector(
                            '.scroll-arrow.next',
                        );

                    if (currentView === DEFAULT_VIEW) {
                        activeCarousel.style.display = 'flex';
                        activeCarousel.style.flexWrap = 'nowrap';
                        activeCarousel.style.gridTemplateColumns = '';

                        if (rowButtons) rowButtons.style.display = '';
                    } else {
                        activeCarousel.style.display = 'grid';
                        activeCarousel.style.gridTemplateColumns =
                            'repeat(6, 1fr)';
                        activeCarousel.style.flexWrap = '';

                        if (rowButtons) rowButtons.style.display = 'none';
                    }
                };

                const viewToggle = createPillToggle({
                    options: viewOptions,
                    initialValue: storedView,
                    onChange: (value) => {
                        applyView(value);
                        chrome.storage.local
                            .set({ [VIEW_PREFERENCE_KEY]: value })
                            .catch(() => {});
                    },
                });

                const sortOptions = [
                    {
                        text: ts('groupFilters.sort.default'),
                        value: 'default',
                    },
                    { text: ts('groupFilters.sort.az'), value: 'az' },
                    { text: ts('groupFilters.sort.za'), value: 'za' },
                    {
                        text: ts('groupFilters.sort.newest'),
                        value: 'newest',
                        tooltip: ts('groupFilters.tooltip'),
                    },
                    {
                        text: ts('groupFilters.sort.oldest'),
                        value: 'oldest',
                        tooltip: ts('groupFilters.tooltip'),
                    },
                ];

                const toggle = createPillToggle({
                    options: sortOptions,
                    initialValue: 'default',
                    onChange: async (value) => {
                        const activeCarousel = getCarousel();
                        const rowButtons =
                            document.querySelector('.scroll-arrow.next');
                        if (!activeCarousel) return;

                        const currentItems = Array.from(
                            activeCarousel.querySelectorAll(
                                '#collection-carousel-item, [id="collection-carousel-item"], [class*="-carouselItem"]',
                            ),
                        );

                        if (value === 'newest' || value === 'oldest') {
                            await Promise.all(
                                currentItems.map((item) => {
                                    const link = item.querySelector('a');
                                    const groupId = getGroupIdFromUrl(
                                        link?.getAttribute('href'),
                                    );
                                    return getJoinDate(groupId, userId);
                                }),
                            );
                        }

                        currentItems.sort((a, b) => {
                            if (value === 'default') {
                                return (
                                    originalOrder.indexOf(a) -
                                    originalOrder.indexOf(b)
                                );
                            }

                            const nameA =
                                a
                                    .querySelector('.base-tile-title')
                                    ?.textContent?.trim() || '';
                            const nameB =
                                b
                                    .querySelector('.base-tile-title')
                                    ?.textContent?.trim() || '';

                            switch (value) {
                                case 'az':
                                    return nameA.localeCompare(nameB);
                                case 'za':
                                    return nameB.localeCompare(nameA);
                                case 'newest': {
                                    const idA = getGroupIdFromUrl(
                                        a
                                            .querySelector('a')
                                            ?.getAttribute('href'),
                                    );
                                    const idB = getGroupIdFromUrl(
                                        b
                                            .querySelector('a')
                                            ?.getAttribute('href'),
                                    );
                                    const dateA =
                                        getCachedJoinDate(idA, userId) ||
                                        new Date(0);
                                    const dateB =
                                        getCachedJoinDate(idB, userId) ||
                                        new Date(0);
                                    return dateB - dateA;
                                }
                                case 'oldest': {
                                    const idA = getGroupIdFromUrl(
                                        a
                                            .querySelector('a')
                                            ?.getAttribute('href'),
                                    );
                                    const idB = getGroupIdFromUrl(
                                        b
                                            .querySelector('a')
                                            ?.getAttribute('href'),
                                    );
                                    const dateA =
                                        getCachedJoinDate(idA, userId) ||
                                        new Date(0);
                                    const dateB =
                                        getCachedJoinDate(idB, userId) ||
                                        new Date(0);
                                    return dateA - dateB;
                                }
                                default:
                                    return 0;
                            }
                        });

                        if (currentView === 'default') {
                            activeCarousel.style.display = 'flex';
                            activeCarousel.style.flexWrap = 'nowrap';
                            activeCarousel.style.gridTemplateColumns = '';

                            if (rowButtons) rowButtons.style.display = 'block';
                        } else {
                            activeCarousel.style.display = 'grid';
                            activeCarousel.style.gridTemplateColumns =
                                'repeat(6, 1fr)';
                            activeCarousel.style.flexWrap = '';

                            if (rowButtons) rowButtons.style.display = 'none';
                        }

                        currentItems.forEach((item) =>
                            activeCarousel.appendChild(item),
                        );
                    },
                });

                const filterToggles = document.createElement('div');
                filterToggles.style.display = 'flex';
                filterToggles.style.alignItems = 'center';
                filterToggles.style.flexDirection = 'row';
                filterToggles.style.gap = '12px';

                headerWrapper.appendChild(viewToggle);
                filterToggles.style.marginLeft = 'auto';
                headerWrapper.appendChild(filterToggles);

                filterToggles.appendChild(toggle);

                applyView(storedView);
            };

            setup();
            observeChildren(container, setup);
        },
        { multiple: true },
    );
}
