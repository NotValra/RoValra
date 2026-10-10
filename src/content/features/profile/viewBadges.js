import { observeElement } from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApi } from '../../core/api.js';
import { safeHtml } from '../../core/packages/dompurify.js';
import { createBadgeCard } from '../../core/ui/games/badgeCard.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const CONFIG = {
    PAGE_SIZE: 50,
    ACCESS_FILTER_PUBLIC: 2,
    CONCURRENCY: 6,
    RETRY: {
        MAX_ATTEMPTS: 5,
        DELAY_MS: 3000,
    },
};

const ENDPOINTS = {
    INVENTORY_CHECK: (userId) => `/v1/users/${userId}/can-view-inventory`,

    INVENTORY_GAMES: (userId, cursor = '') =>
        `/v1/users/${userId}/places/inventory?cursor=${cursor}&itemsPerPage=100&placesTab=Created`,

    GAMES_V2: (userId, cursor = '') =>
        `/v2/users/${userId}/games?accessFilter=${CONFIG.ACCESS_FILTER_PUBLIC}&limit=50&sortOrder=Asc&cursor=${cursor}`,

    UNIVERSE_BADGES: (universeId, cursor = '') =>
        `/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
};

const badgeListCache = new Map();

const Api = {
    async fetchWithRetry(options) {
        let delay = CONFIG.RETRY.DELAY_MS;

        for (let i = 0; i <= CONFIG.RETRY.MAX_ATTEMPTS; i++) {
            try {
                const response = await callRobloxApi(options);

                if (response.status === 429) {
                    if (i === CONFIG.RETRY.MAX_ATTEMPTS)
                        throw new Error('Rate limit exceeded');
                    await new Promise((r) => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response;
            } catch (err) {
                if (i >= CONFIG.RETRY.MAX_ATTEMPTS) return null;
                await new Promise((r) => setTimeout(r, delay));
                delay *= 2;
            }
        }
        return null;
    },

    async checkInventoryPublic(userId) {
        const res = await this.fetchWithRetry({
            subdomain: 'inventory',
            endpoint: ENDPOINTS.INVENTORY_CHECK(userId),
        });
        const data = res ? await res.json().catch(() => null) : null;
        return data?.canView === true;
    },

    async getAllOwnedUniverseIds(userId) {
        const universeIds = new Set();
        let nextCursor = '';

        do {
            const res = await this.fetchWithRetry({
                subdomain: 'inventory',
                endpoint: ENDPOINTS.INVENTORY_GAMES(userId, nextCursor),
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                for (const item of data.data) {
                    if (item.universeId != null) {
                        universeIds.add(item.universeId);
                    }
                }
                nextCursor = data.nextPageCursor;
            } else {
                nextCursor = null;
            }
        } while (nextCursor);

        return universeIds;
    },

    async getPublicUniverseIds(userId) {
        const universeIds = new Set();
        let nextCursor = null;

        do {
            const res = await this.fetchWithRetry({
                subdomain: 'games',
                endpoint: ENDPOINTS.GAMES_V2(userId, nextCursor || ''),
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                for (const item of data.data) {
                    if (item.id != null && item.rootPlace) {
                        universeIds.add(item.id);
                    }
                }
                nextCursor = data.nextPageCursor;
            } else {
                nextCursor = null;
            }
        } while (nextCursor);

        return universeIds;
    },

    async getUniverseBadges(universeId) {
        const badges = [];
        let nextCursor = '';

        do {
            const res = await this.fetchWithRetry({
                subdomain: 'badges',
                endpoint: ENDPOINTS.UNIVERSE_BADGES(universeId, nextCursor),
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                badges.push(...data.data);
                nextCursor = data.nextPageCursor || '';
            } else {
                nextCursor = '';
            }
        } while (nextCursor);

        return badges;
    },

    async getAllBadges(userId) {
        if (badgeListCache.has(userId)) {
            return badgeListCache.get(userId).catch((err) => {
                console.error(err);
                return [];
            });
        }

        const fetchPromise = (async () => {
            const isPublic = await this.checkInventoryPublic(userId);
            const universeIds = isPublic
                ? [...(await this.getAllOwnedUniverseIds(userId))]
                : [...(await this.getPublicUniverseIds(userId))];

            const allBadges = [];
            let cursor = 0;
            const worker = async () => {
                while (cursor < universeIds.length) {
                    const universeId = universeIds[cursor++];
                    const badges = await this.getUniverseBadges(universeId);
                    allBadges.push(...badges);
                }
            };

            await Promise.all(
                Array.from({ length: CONFIG.CONCURRENCY }, worker),
            );

            return allBadges;
        })();

        badgeListCache.set(userId, fetchPromise);
        fetchPromise.catch(() => badgeListCache.delete(userId));
        return fetchPromise.catch((err) => (console.error(err), []));
    },
};

const UI = {
    async createFilterPanel(onFilterChange) {
        const container = document.createElement('div');
        container.className = 'rovalra-filters-container';

        const createFilterSection = (label, element) => {
            const div = document.createElement('div');
            div.className = 'rovalra-filter-section';
            div.innerHTML = safeHtml`<label>${label}</label>`;
            div.appendChild(element);
            return div;
        };

        const sortDropdown = createDropdown({
            items: [
                {
                    value: 'default',
                    label: await t('viewBadgesProfile.sort.default'),
                },
                {
                    value: 'rarity',
                    label: await t('viewBadgesProfile.sort.rarity'),
                },
                {
                    value: 'awarded',
                    label: await t('viewBadgesProfile.sort.awarded'),
                },
                {
                    value: 'name',
                    label: await t('viewBadgesProfile.sort.name'),
                },
            ],
            initialValue: 'default',
            onValueChange: (v) => onFilterChange('sort', v),
        });

        const orderDropdown = createDropdown({
            items: [
                {
                    value: 'desc',
                    label: await t('viewBadgesProfile.order.descending'),
                },
                {
                    value: 'asc',
                    label: await t('viewBadgesProfile.order.ascending'),
                },
            ],
            initialValue: 'desc',
            onValueChange: (v) => onFilterChange('order', v),
        });

        container.append(
            createFilterSection(
                await t('viewBadgesProfile.labels.sort'),
                sortDropdown.element,
            ),
            createFilterSection(
                await t('viewBadgesProfile.labels.order'),
                orderDropdown.element,
            ),
        );

        return container;
    },

    async injectButton(header, onClick) {
        if (!header || header.querySelector('.rovalra-view-badges-button'))
            return;

        if (
            header.querySelector('social-link-icon-list') ||
            header.querySelector('h2')
        )
            return;

        const btn = createButton(
            await t('viewBadgesProfile.buttonText'),
            'secondary',
        );
        btn.classList.add('rovalra-view-badges-button');
        btn.style.marginLeft = '5px';
        btn.addEventListener('click', onClick);
        if (header.querySelector('.rovalra-view-badges-button')) return;
        this.placeButton(header, btn);
    },

    placeButton(header, btn) {
        const hiddenGamesButton = header.querySelector(
            '.rovalra-hidden-games-button',
        );
        if (hiddenGamesButton) {
            hiddenGamesButton.after(btn);
            return;
        }
        const buttonContainer = header.querySelector('.container-buttons');
        if (buttonContainer) {
            header.insertBefore(btn, buttonContainer);
        } else {
            header.appendChild(btn);
        }
    },
};

class ViewBadgesManager {
    constructor(userId) {
        this.userId = userId;
        this.allBadges = [];
        this.filters = { sort: 'default', order: 'desc' };
        this.processedBadges = [];
        this.visibleCount = 0;
        this.isLoading = false;
        this.elements = {};
        this.thumbnails = new Map();
        this.labels = { rarity: '', awarded: '' };
    }

    async openOverlay() {
        const body = document.createElement('div');

        const list = document.createElement('div');
        list.className = 'rovalra-hidden-games-list';
        list.appendChild(
            createShimmerGrid(12, { width: '150px', height: '150px' }),
        );

        const loader = document.createElement('div');
        loader.className =
            'rovalra-load-more-container rovalra-hidden-games-list';
        loader.style.paddingTop = '0';

        body.append(list, loader);

        this.elements = { list, loader };

        const { overlay } = createOverlay({
            title: await t('viewBadgesProfile.overlayText'),
            bodyContent: body,
            maxWidth: '1200px',
            maxHeight: '85vh',
        });

        this.labels = {
            rarity: await t('privateGames.badges.rarity'),
            awarded: await t('privateGames.badges.wonEver'),
        };

        this.allBadges = await Api.getAllBadges(this.userId);

        if (!this.allBadges || this.allBadges.length === 0) {
            this.elements.list.innerHTML = safeHtml`<p class="rovalra-no-hidden-games-message">${await t('viewBadgesProfile.noBadges')}</p>`;
            return;
        }

        const filterPanel = await UI.createFilterPanel(
            this.handleFilterChange.bind(this),
        );
        body.prepend(filterPanel);
        this.elements.filterPanel = filterPanel;

        const scrollContainer = overlay.querySelector('.rovalra-overlay-body');
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', () => {
                const { scrollTop, clientHeight, scrollHeight } =
                    scrollContainer;
                if (scrollTop + clientHeight >= scrollHeight - 150) {
                    this.loadMore();
                }
            });
        }

        this.applyFilters();
    }

    handleFilterChange(key, value) {
        this.filters[key] = value;
        this.applyFilters();
    }

    async applyFilters() {
        if (this.isLoading) return;
        this.isLoading = true;

        this.elements.list.innerHTML = '';
        this.elements.list.appendChild(
            createShimmerGrid(12, { width: '150px', height: '150px' }),
        );
        this.visibleCount = 0;

        const { sort, order } = this.filters;
        const orderMultiplier = order === 'desc' ? -1 : 1;
        let sorted = [...this.allBadges];

        if (sort === 'rarity') {
            sorted.sort(
                (a, b) =>
                    ((a.statistics?.winRatePercentage || 0) -
                        (b.statistics?.winRatePercentage || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'awarded') {
            sorted.sort(
                (a, b) =>
                    ((a.statistics?.awardedCount || 0) -
                        (b.statistics?.awardedCount || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'name') {
            sorted.sort(
                (a, b) =>
                    (a.displayName || a.name || '').localeCompare(
                        b.displayName || b.name || '',
                    ) * orderMultiplier,
            );
        } else {
            sorted.sort(
                (a, b) =>
                    (new Date(a.updated || 0).getTime() -
                        new Date(b.updated || 0).getTime()) *
                    orderMultiplier,
            );
        }

        this.processedBadges = sorted;
        this.isLoading = false;

        this.elements.list.innerHTML = '';
        if (this.processedBadges.length === 0) {
            this.elements.list.innerHTML = safeHtml`<p class="rovalra-no-hidden-games-message">${await t('viewBadgesProfile.noMatches')}</p>`;
        } else {
            this.loadMore();
        }
    }

    async loadMore() {
        if (
            this.visibleCount >= this.processedBadges.length ||
            this.elements.loader.innerHTML !== ''
        )
            return;

        this.elements.loader.appendChild(
            createShimmerGrid(12, { width: '150px', height: '150px' }),
        );

        try {
            const nextBatch = this.processedBadges.slice(
                this.visibleCount,
                this.visibleCount + CONFIG.PAGE_SIZE,
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

                nextBatch.forEach((badge) => {
                    this.elements.list.appendChild(
                        createBadgeCard({
                            badge,
                            thumbnail: this.thumbnails.get(badge.id),
                            labels: this.labels,
                        }),
                    );
                });
                this.visibleCount += nextBatch.length;
            }
        } catch (err) {
            console.warn('RoValra: Error loading more badges', err);
        } finally {
            this.elements.loader.innerHTML = '';
        }
    }
}

let isInitialized = false;
export async function init() {
    if (isInitialized) return;
    if ((await settings.viewBadgesEnabled) !== true) return;
    isInitialized = true;

    const handleButtonClick = () => {
        const userId = getUserIdFromUrl();
        if (!userId) return;
        new ViewBadgesManager(userId).openOverlay();
    };

    observeElement(
        '.profile-experiences.profile-game .container-header, .btr-profile-right .profile-game .container-header, .placeholder-games .container-header',
        (header) => {
            if (header.dataset.rovalraBadgesProcessed) return;
            header.dataset.rovalraBadgesProcessed = 'true';
            UI.injectButton(header, handleButtonClick);
        },
        { multiple: true },
    );

    observeElement(
        '.container-header .rovalra-hidden-games-button',
        (hiddenGamesButton) => {
            const header = hiddenGamesButton.closest('.container-header');
            const badgesButton = header?.querySelector(
                '.rovalra-view-badges-button',
            );
            if (
                badgesButton &&
                hiddenGamesButton.nextElementSibling !== badgesButton
            ) {
                hiddenGamesButton.after(badgesButton);
            }
        },
        { multiple: true },
    );
}
