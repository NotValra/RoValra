import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApiJson } from '../../core/api.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { t, ts } from '../../core/locale/i18n.js';
import { createBadgeCard } from '../../core/ui/games/badgeCard.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { settings } from '../../core/settings/getSettings.js';

const PAGE_SIZE = 50;
const ACCESS_FILTER_ALL = 1;
const CONCURRENCY = 6;

const el = (tag, className, props = {}, children = []) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.assign(element, props);
    Object.assign(element.style, props.style || {});
    children.forEach((child) => child && element.append(child));
    return element;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const groupBadgeListCache = new Map();

const api = {
    async safeGet(endpoint, subdomain = 'games') {
        let delay = 3000;
        const retries = 5;

        for (let i = 0; i <= retries; i++) {
            try {
                return await callRobloxApiJson({
                    subdomain,
                    endpoint,
                    method: 'GET',
                });
            } catch (err) {
                if (err.status === 429 && i < retries) {
                    await sleep(delay);
                    delay *= 2;
                    continue;
                }
                if (i === retries || err.status !== 429) {
                    return null;
                }
            }
        }
        return null;
    },

    async getAllGroupGames(groupId) {
        let games = [];
        let cursor = '';

        do {
            const endpoint = `/v2/groups/${groupId}/gamesV2?accessFilter=${ACCESS_FILTER_ALL}&limit=50&sortOrder=Desc&cursor=${cursor}`;
            const json = await this.safeGet(endpoint);

            if (json?.data) {
                games = games.concat(json.data);
                cursor = json.nextPageCursor || '';
            } else {
                cursor = '';
            }
        } while (cursor);

        return games;
    },

    async getUniverseBadges(universeId) {
        const badges = [];
        let cursor = '';

        do {
            const endpoint = `/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
            const json = await this.safeGet(endpoint, 'badges');

            if (json?.data) {
                badges.push(...json.data);
                cursor = json.nextPageCursor || '';
            } else {
                cursor = '';
            }
        } while (cursor);

        return badges;
    },

    async getAllBadges(groupId) {
        if (groupBadgeListCache.has(groupId)) {
            return groupBadgeListCache.get(groupId);
        }

        const fetchPromise = (async () => {
            const games = await this.getAllGroupGames(groupId);
            const universeIds = games.map((g) => g.id);

            const allBadges = [];
            let cursor = 0;
            const worker = async () => {
                while (cursor < universeIds.length) {
                    const universeId = universeIds[cursor++];
                    const badges = await this.getUniverseBadges(universeId);
                    allBadges.push(...badges);
                }
            };

            await Promise.all(Array.from({ length: CONCURRENCY }, worker));
            return allBadges;
        })();

        groupBadgeListCache.set(groupId, fetchPromise);
        fetchPromise.catch(() => groupBadgeListCache.delete(groupId));
        return fetchPromise;
    },
};

class ViewGroupBadgesManager {
    constructor(groupId) {
        this.groupId = groupId;
        this.allBadges = [];
        this.filteredBadges = [];
        this.filters = { sort: 'default', order: 'desc' };
        this.displayedCount = 0;
        this.isLoading = false;
        this.isPaginating = false;
        this.thumbnails = new Map();
        this.labels = { rarity: '', awarded: '' };
        this.elements = {};
        this.render();
    }

    async render() {
        this.labels = {
            rarity: await t('privateGames.badges.rarity'),
            awarded: await t('privateGames.badges.wonEver'),
        };

        const sortDropdown = createDropdown({
            items: [
                {
                    value: 'default',
                    label: await t('viewGroupBadges.sort.default'),
                },
                {
                    value: 'rarity',
                    label: await t('viewGroupBadges.sort.rarity'),
                },
                {
                    value: 'awarded',
                    label: await t('viewGroupBadges.sort.awarded'),
                },
                { value: 'name', label: await t('viewGroupBadges.sort.name') },
            ],
            initialValue: 'default',
            onValueChange: (v) => {
                this.filters.sort = v;
                this.applyFilters();
            },
        });

        const orderDropdown = createDropdown({
            items: [
                {
                    value: 'desc',
                    label: await t('viewGroupBadges.order.descending'),
                },
                {
                    value: 'asc',
                    label: await t('viewGroupBadges.order.ascending'),
                },
            ],
            initialValue: 'desc',
            onValueChange: (v) => {
                this.filters.order = v;
                this.applyFilters();
            },
        });

        const createFilterGroup = (label, input) =>
            el('div', 'rovalra-filter-section', {}, [
                el('label', '', { textContent: label }),
                input,
            ]);

        const body = el(
            'div',
            '',
            { style: { display: 'flex', flexDirection: 'column' } },
            [
                el('div', 'rovalra-filters-container', {}, [
                    createFilterGroup(
                        await t('viewGroupBadges.labels.sort'),
                        sortDropdown.element,
                    ),
                    createFilterGroup(
                        await t('viewGroupBadges.labels.order'),
                        orderDropdown.element,
                    ),
                ]),
                el('div', 'rovalra-hidden-games-list'),
                el(
                    'div',
                    'rovalra-load-more-container rovalra-hidden-games-list',
                    { style: { paddingTop: '0' } },
                ),
            ],
        );

        this.elements.list = body.querySelector('.rovalra-hidden-games-list');
        this.elements.filters = body.querySelector(
            '.rovalra-filters-container',
        );
        this.elements.loader = body.querySelector(
            '.rovalra-load-more-container',
        );
        this.elements.list.appendChild(
            createShimmerGrid(12, { width: '150px', height: '150px' }),
        );

        const { overlay } = createOverlay({
            title: await t('viewGroupBadges.overlayText'),
            bodyContent: body,
            maxWidth: '1200px',
            maxHeight: '85vh',
        });

        const scrollContainer = overlay.querySelector('.rovalra-overlay-body');
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', () => {
                const { scrollTop, clientHeight, scrollHeight } =
                    scrollContainer;
                if (scrollTop + clientHeight >= scrollHeight - 150)
                    this.loadMore();
            });
        }

        (async () => {
            try {
                this.allBadges = await api.getAllBadges(this.groupId);

                if (this.allBadges.length === 0) {
                    this.elements.list.innerHTML = DOMPurify.sanitize(
                        `<p class="rovalra-no-hidden-games-message">${await t('viewGroupBadges.noBadges')}</p>`,
                    );
                    this.elements.filters.style.display = 'none';
                    return;
                }

                this.applyFilters();
            } catch (err) {
                console.warn('RoValra: Failed to load group badges', err);
                this.elements.list.innerHTML = DOMPurify.sanitize(
                    `<p class="rovalra-no-hidden-games-message">${await t('viewGroupBadges.noBadges')}</p>`,
                );
                this.elements.filters.style.display = 'none';
            }
        })();
    }

    applyFilters() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.isPaginating = false;

        this.elements.list.innerHTML = '';
        this.elements.list.appendChild(
            createShimmerGrid(12, { width: '150px', height: '150px' }),
        );
        this.elements.loader.innerHTML = '';

        const { sort, order } = this.filters;
        const orderMultiplier = order === 'desc' ? -1 : 1;
        let processed = [...this.allBadges];

        if (sort === 'rarity') {
            processed.sort(
                (a, b) =>
                    ((a.statistics?.winRatePercentage || 0) -
                        (b.statistics?.winRatePercentage || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'awarded') {
            processed.sort(
                (a, b) =>
                    ((a.statistics?.awardedCount || 0) -
                        (b.statistics?.awardedCount || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'name') {
            processed.sort(
                (a, b) =>
                    (a.displayName || a.name || '').localeCompare(
                        b.displayName || b.name || '',
                    ) * orderMultiplier,
            );
        } else {
            processed.sort(
                (a, b) =>
                    (new Date(a.updated || 0).getTime() -
                        new Date(b.updated || 0).getTime()) *
                    orderMultiplier,
            );
        }

        this.filteredBadges = processed;
        this.displayedCount = 0;
        this.isLoading = false;

        this.elements.list.innerHTML = '';
        if (this.filteredBadges.length === 0) {
            this.elements.list.innerHTML = DOMPurify.sanitize(
                `<p class="rovalra-no-hidden-games-message">${ts('viewGroupBadges.noMatches')}</p>`,
            );
        } else {
            this.loadMore();
        }
    }

    async loadMore() {
        if (
            this.isLoading ||
            this.isPaginating ||
            this.displayedCount >= this.filteredBadges.length
        )
            return;
        this.isPaginating = true;
        this.elements.loader.appendChild(
            createShimmerGrid(12, { width: '150px', height: '150px' }),
        );

        try {
            const nextBatch = this.filteredBadges.slice(
                this.displayedCount,
                this.displayedCount + PAGE_SIZE,
            );
            if (nextBatch.length > 0) {
                const uncached = nextBatch.filter(
                    (badge) => !this.thumbnails.has(badge.id),
                );
                if (uncached.length > 0) {
                    const newThumbnails = await fetchThumbnails(
                        uncached,
                        'BadgeIcon',
                        '150x150',
                    );
                    newThumbnails.forEach((data, id) =>
                        this.thumbnails.set(id, data),
                    );
                }

                const fragment = document.createDocumentFragment();
                nextBatch.forEach((badge) => {
                    fragment.appendChild(
                        createBadgeCard({
                            badge,
                            thumbnail: this.thumbnails.get(badge.id),
                            labels: this.labels,
                        }),
                    );
                });
                this.elements.list.appendChild(fragment);
                this.displayedCount += nextBatch.length;
            }
        } catch (err) {
            console.warn('RoValra: Error loading more badges', err);
        } finally {
            this.elements.loader.innerHTML = '';
            this.isPaginating = false;
        }
    }
}

export async function init() {
    if (init._run) return;
    if ((await settings.viewBadgesEnabled) !== true) return;
    init._run = true;

    let isInserting = false;

    const ensureSingleButton = () => {
        const all = document.querySelectorAll('.rovalra-view-badges-container');
        if (all.length > 1) {
            for (let i = 0; i < all.length - 1; i++) all[i].remove();
        }
    };

    const createAndInsertButton = async () => {
        const header = document.querySelector('.group-profile-header');
        if (!header) return;

        const btn = createButton(
            await t('viewGroupBadges.buttonText'),
            'secondary',
        );
        btn.addEventListener('click', () => {
            const groupId = getGroupIdFromUrl();
            if (!groupId) return;
            new ViewGroupBadgesManager(groupId);
        });

        const container = el('div', 'rovalra-view-badges-container', {}, [btn]);

        ensureSingleButton();

        const hiddenGamesContainer = document.querySelector(
            '.rovalra-hidden-games-container',
        );
        const description = header.querySelector('.description-container');
        if (hiddenGamesContainer) {
            attachToHiddenGames(container, hiddenGamesContainer);
        } else if (description) {
            container.style.marginTop = '10px';
            description.after(container);
        } else {
            container.style.marginTop = '10px';
            header.appendChild(container);
        }
        ensureSingleButton();
    };

    const attachToHiddenGames = (container, hiddenGamesContainer) => {
        container.style.marginTop = '';
        container.style.marginLeft = '5px';
        container.style.display = 'inline-block';
        hiddenGamesContainer.appendChild(container);
    };

    const tryInsert = () => {
        if (isInserting) return;
        isInserting = true;

        if (document.querySelector('.rovalra-view-badges-container')) {
            isInserting = false;
            return;
        }

        ensureSingleButton();
        createAndInsertButton().finally(() => {
            isInserting = false;
        });
    };

    observeElement('.group-profile-header', () => {
        tryInsert();
    });

    observeElement(
        '.rovalra-hidden-games-container',
        (hiddenGamesContainer) => {
            const container = document.querySelector(
                '.rovalra-view-badges-container',
            );
            if (container && !hiddenGamesContainer.contains(container)) {
                attachToHiddenGames(container, hiddenGamesContainer);
            }
        },
        { multiple: true },
    );

    let lastUrl = window.location.href;
    const checkForUrlChange = () => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            if (!getGroupIdFromUrl()) return;

            document
                .querySelectorAll('.rovalra-view-badges-container')
                .forEach((container) => container.remove());
            isInserting = false;
            tryInsert();
        }
    };

    setInterval(checkForUrlChange, 500);
    window.addEventListener('popstate', checkForUrlChange);

    if (getGroupIdFromUrl()) {
        tryInsert();
    }
}
