import { observeElement, observeChildren } from '../../core/observer.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { getUserIdFromUrl, getGroupIdFromUrl } from '../../core/idExtractor.js';
import { callRobloxApiJson } from '../../core/api.js';
import * as CacheHandler from '../../core/storage/cacheHandler.js';
import { ts } from '../../core/locale/i18n.js';

const joinDateCache = new Map();
const joinDatePromises = new Map();

export async function getJoinDate(groupId, userId) {
    if (!groupId || !userId) return new Date(0);
    if (joinDateCache.has(groupId)) return joinDateCache.get(groupId);
    if (joinDatePromises.has(groupId)) return joinDatePromises.get(groupId);

    const promise = (async () => {
        const cacheKey = `join_date_${userId}_${groupId}`;
        const cached = await CacheHandler.get(
            'group_filters',
            cacheKey,
            'local',
        );

        if (cached) {
            const date = new Date(cached);
            joinDateCache.set(groupId, date);
            return date;
        }

        try {
            const filter = encodeURIComponent(`user == 'users/${userId}'`);
            const res = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/cloud/v2/groups/${groupId}/memberships?filter=${filter}`,
                useApiKey: true,
                useBackground: true,
            });

            const createTime = res?.groupMemberships?.[0]?.createTime;
            if (createTime) {
                const date = new Date(createTime);
                CacheHandler.set(
                    'group_filters',
                    cacheKey,
                    createTime,
                    'local',
                );
                joinDateCache.set(groupId, date);
                return date;
            }
        } catch (e) {
            if (e.status === 403 || e.response?.code === 'PERMISSION_DENIED') {
                const unknownDate = new Date(0);
                CacheHandler.set(
                    'group_filters',
                    cacheKey,
                    unknownDate.toISOString(),
                    'local',
                );
                joinDateCache.set(groupId, unknownDate);
                return unknownDate;
            }

            console.warn(
                `RoValra: Failed to fetch join date for group ${groupId}`,
                e,
            );

            const fallbackDate = new Date(0);
            CacheHandler.set(
                'group_filters',
                cacheKey,
                fallbackDate.toISOString(),
                'local',
            );
            joinDateCache.set(groupId, fallbackDate);
            return fallbackDate;
        }
    })();

    joinDatePromises.set(groupId, promise);
    const result = await promise;
    joinDatePromises.delete(groupId);

    return result;
}

export function init() {
    const userId = getUserIdFromUrl();
    if (!userId) return;

    chrome.storage.local.get({ groupFiltersEnabled: true }, (settings) => {
        if (!settings.groupFiltersEnabled) return;

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

                const setup = () => {
                    const carousel = getCarousel();
                    if (!carousel || container.dataset.rovalraFiltersAdded)
                        return;

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

                    const headerWrapper = document.createElement('div');
                    headerWrapper.style.display = 'flex';
                    headerWrapper.style.alignItems = 'center';
                    headerWrapper.style.justifyContent = 'space-between';
                    headerWrapper.style.width = '100%';
                    headerWrapper.style.marginBottom = '12px';

                    header.parentNode.insertBefore(headerWrapper, header);
                    headerWrapper.appendChild(header);

                    const originalOrder = [...items];

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
                                            joinDateCache.get(idA) ||
                                            new Date(0);
                                        const dateB =
                                            joinDateCache.get(idB) ||
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
                                            joinDateCache.get(idA) ||
                                            new Date(0);
                                        const dateB =
                                            joinDateCache.get(idB) ||
                                            new Date(0);
                                        return dateA - dateB;
                                    }
                                    default:
                                        return 0;
                                }
                            });

                            activeCarousel.style.display = 'flex';
                            activeCarousel.style.flexWrap = 'nowrap';

                            currentItems.forEach((item) =>
                                activeCarousel.appendChild(item),
                            );
                        },
                    });

                    headerWrapper.appendChild(toggle);
                };

                setup();
                observeChildren(container, setup);
            },
            { multiple: true },
        );
    });
}
