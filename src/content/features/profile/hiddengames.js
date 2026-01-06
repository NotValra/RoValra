import { observeElement } from '../../core/observer.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { fetchThumbnails as fetchThumbnailsBatch } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApi } from '../../core/api.js';
import { safeHtml } from '../../core/packages/dompurify';
import { createGameCard } from '../../core/ui/games/gameCard.js';

const CONFIG = {
    PAGE_SIZE: 50,
    ACCESS_FILTER: 2,
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
        `/v2/users/${userId}/games?accessFilter=${CONFIG.ACCESS_FILTER}&limit=50&sortOrder=Asc&cursor=${cursor}`,

    VOTES_V1: (ids) => `/v1/games/votes?universeIds=${ids}`,
    GAMES_V1: (ids) => `/v1/games?universeIds=${ids}`,

    GAME_LINK: (placeId) => `https://www.roblox.com/games/${placeId}/unnamed`, // adding an extra parameter after placeid adds support for btroblox's copy placeid context menu item
};

const userListCache = new Map();
const sharedStatsCache = {
    likes: new Map(),
    players: new Map(),
    updated: new Map(),
    thumbnails: new Map(),
};

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

    async getGamesFromInventory(userId) {
        let games = [];
        let nextCursor = '';

        do {
            const res = await this.fetchWithRetry({
                subdomain: 'inventory',
                endpoint: ENDPOINTS.INVENTORY_GAMES(userId, nextCursor),
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                const formattedGames = data.data
                    .filter((item) => item.universeId != null)
                    .map((item) => ({
                        id: item.universeId,
                        name: item.name,
                        rootPlace: {
                            id: item.placeId,
                        },
                    }));

                games = games.concat(formattedGames);
                nextCursor = data.nextPageCursor;
            } else {
                nextCursor = null;
            }
        } while (nextCursor);

        return games;
    },

    async getGamesFromV2(userId) {
        let games = [];
        let nextCursor = null;

        do {
            const endpoint = ENDPOINTS.GAMES_V2(userId, nextCursor || '');

            const res = await this.fetchWithRetry({
                subdomain: 'games',
                endpoint: endpoint,
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                games = games.concat(data.data);
                nextCursor = data.nextPageCursor;
            } else {
                nextCursor = null;
            }
        } while (nextCursor);

        return games;
    },

    async getUserGames(userId) {
        if (userListCache.has(userId)) {
            return userListCache.get(userId).catch((err) => {
                console.error(err);
                return [];
            });
        }

        const fetchPromise = (async () => {
            const isPublic = await this.checkInventoryPublic(userId);
            return isPublic ? await this.getGamesFromInventory(userId) : await this.getGamesFromV2(userId);
        })();

        userListCache.set(userId, fetchPromise);
        fetchPromise.catch(() => userListCache.delete(userId));
        return fetchPromise.catch((err) => (console.error(err), []));
    },

    async enrichGameData(games, state) {
        const batch = games.filter((g) => g && !state.likes.has(g.id));
        if (!batch.length) return;

        const universeIds = batch.map((g) => g.id).join(',');

        const gameInfoPromises = [];
        for (let i = 0; i < batch.length; i += 10) {
            const chunk = batch.slice(i, i + 10);
            const chunkIds = chunk.map((g) => g.id).join(',');
            gameInfoPromises.push(
                this.fetchWithRetry({
                    subdomain: 'games',
                    endpoint: ENDPOINTS.GAMES_V1(chunkIds),
                }).then((r) => r?.json()),
            );
        }

        const [likeRes, ...playerResList] = await Promise.all([
            this.fetchWithRetry({
                subdomain: 'games',
                endpoint: ENDPOINTS.VOTES_V1(universeIds),
            }).then((r) => r?.json()),
            ...gameInfoPromises,
        ]);

        if (likeRes?.data) {
            likeRes.data.forEach((item) => {
                const total = item.upVotes + item.downVotes;
                const ratio =
                    total > 0 ? Math.round((item.upVotes / total) * 100) : 0;
                state.likes.set(item.id, {
                    ratio,
                    total,
                    upVotes: item.upVotes,
                    downVotes: item.downVotes,
                });
            });
        }

        playerResList.forEach((playerRes) => {
            if (playerRes?.data) {
                playerRes.data.forEach((item) => {
                    state.players.set(item.id, item.playing || 0);
                    state.updated.set(item.id, item.updated || 0);
                });
            }
        });

        const newThumbnails = await fetchThumbnailsBatch(
            batch,
            'GameIcon',
            '256x256',
        );
        newThumbnails.forEach((data, id) => state.thumbnails.set(id, data));
    },
};

const UI = {
    createFilterPanel(onFilterChange) {
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
                { value: 'default', label: 'Default' },
                { value: 'like-ratio', label: 'Like Ratio' },
                { value: 'likes', label: 'Likes' },
                { value: 'dislikes', label: 'Dislikes' },
                { value: 'players', label: 'Players' },
                { value: 'name', label: 'Name (Z-A)' },
            ],
            initialValue: 'default',
            onValueChange: (v) => onFilterChange('sort', v),
        });

        const orderDropdown = createDropdown({
            items: [
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' },
            ],
            initialValue: 'desc',
            onValueChange: (v) => onFilterChange('order', v),
        });

        container.append(
            createFilterSection('Sort', sortDropdown.element),
            createFilterSection('Order', orderDropdown.element),
        );

        return container;
    },

    injectButton(header, onClick) {
        if (!header || header.querySelector('.hidden-games-button')) return;

        if (header.querySelector('social-link-icon-list') || header.querySelector('h2')) return;

        const btn = createButton('Hidden Experiences', 'secondary');
        btn.classList.add('hidden-games-button');
        btn.style.marginLeft = '5px';
        btn.addEventListener('click', onClick);
        header.appendChild(btn);
    },

    createEmptyState(onClick) {
        const container = document.createElement('div');
        container.className = 'rovalra-empty-state section';

        const text = document.createElement('p');
        text.className = 'text-label';
        text.textContent = 'User has no public experiences';

        const btn = createButton('Hidden Experiences', 'secondary');
        btn.classList.add('hidden-games-button');
        btn.addEventListener('click', onClick);

        container.append(text, btn);
        return container;
    },
};

class HiddenGamesManager {
    constructor(allGames) {
        this.allGames = allGames;
        this.cache = sharedStatsCache;
        this.filters = { sort: 'default', order: 'desc' };
        this.processedGames = [];
        this.visibleCount = 0;
        this.isLoading = false;
        this.elements = {};
    }

    openOverlay() {
        const body = document.createElement('div');

        const filterPanel = UI.createFilterPanel(
            this.handleFilterChange.bind(this),
        );

        const list = document.createElement('div');
        list.className = 'hidden-games-list';
        list.classList.add('rovalra-hidden-games-list');

        const loader = document.createElement('div');
        loader.className = 'rovalra-load-more-container';

        body.append(filterPanel, list, loader);

        this.elements = { list, loader, filterPanel };

        const { overlay } = createOverlay({
            title: 'Hidden Experiences (Might show not hidden experiences)',
            bodyContent: body,
            maxWidth: '1200px',
            maxHeight: '85vh',
        });

        if (this.allGames.length === 0) {
            this.elements.list.innerHTML = `<p class="no-hidden-games-message">This user has no hidden experiences.</p>`;
            this.elements.filterPanel.style.display = 'none';
            return;
        }

        const scrollContainer = overlay.querySelector('.rovalra-overlay-body');
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', () => {
                const { scrollTop, clientHeight, scrollHeight } = scrollContainer;
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
            createShimmerGrid(12, { width: '150px', height: '240px' }),
        );
        this.visibleCount = 0;

        if (
            ['default', 'like-ratio', 'likes', 'dislikes', 'players'].includes(
                this.filters.sort,
            )
        ) {
            await Api.enrichGameData(this.allGames, this.cache);
        }

        const { sort, order } = this.filters;
        const orderMultiplier = order === 'desc' ? -1 : 1;
        let sorted = [...this.allGames];

        if (sort === 'default') {
            sorted.sort(
                (a, b) =>
                    (new Date(this.cache.updated.get(a.id) || 0) -
                        new Date(this.cache.updated.get(b.id) || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'like-ratio') {
            sorted.sort(
                (a, b) =>
                    ((this.cache.likes.get(a.id)?.ratio || 0) -
                        (this.cache.likes.get(b.id)?.ratio || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'likes') {
            sorted.sort(
                (a, b) =>
                    ((this.cache.likes.get(a.id)?.upVotes || 0) -
                        (this.cache.likes.get(b.id)?.upVotes || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'dislikes') {
            sorted.sort(
                (a, b) =>
                    ((this.cache.likes.get(a.id)?.downVotes || 0) -
                        (this.cache.likes.get(b.id)?.downVotes || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'players') {
            sorted.sort(
                (a, b) =>
                    ((this.cache.players.get(a.id) || 0) -
                        (this.cache.players.get(b.id) || 0)) *
                    orderMultiplier,
            );
        } else if (sort === 'name') {
            sorted.sort(
                (a, b) => a.name.localeCompare(b.name) * orderMultiplier,
            );
        } else {
            if (order === 'asc') {
                sorted.reverse();
            }
        }

        this.processedGames = sorted;
        this.isLoading = false;

        this.elements.list.innerHTML = '';
        if (this.processedGames.length === 0) {
            this.elements.list.innerHTML = `<p class="no-hidden-games-message">No experiences match filters.</p>`;
        } else {
            await this.loadMore();
        }
    }

    async loadMore() {
        if (
            this.visibleCount >= this.processedGames.length ||
            this.elements.loader.innerHTML !== ''
        )
            return;

        this.elements.loader.innerHTML = `<p class="rovalra-loading-text">Loading...</p>`;

        try {
            const nextBatch = this.processedGames.slice(
                this.visibleCount,
                this.visibleCount + CONFIG.PAGE_SIZE,
            );

            if (nextBatch.length > 0) {
                await Api.enrichGameData(nextBatch, this.cache);
                nextBatch.forEach((game) => {
                    this.elements.list.appendChild(
                        createGameCard({ game, stats: this.cache }),
                    );
                });
                this.visibleCount += nextBatch.length;
            }
        } catch (err) {
            console.warn('RoValra: Error loading more games', err);
        } finally {
            this.elements.loader.innerHTML = '';
        }
    }
}

function getUserId() {
    const match = window.location.href.match(/users\/(\d+)\/profile/);
    return match ? match[1] : null;
}

export function init() {
    chrome.storage.local.get(['userGamesEnabled'], (result) => {
        if (result.userGamesEnabled !== true) return;

        const userId = getUserId();
        if (!userId) return;

        const handleButtonClick = async () => {
            const games = await Api.getUserGames(userId);
            new HiddenGamesManager(games).openOverlay();
        };

        observeElement(
            '.btr-profile-right .profile-game .container-header, .profile-tab-content .container-header, .placeholder-games .container-header',
            (header) => {
                UI.injectButton(header, handleButtonClick);
            },
        );

        const checkEmptyState = () => {
            if (!window.location.hash.includes('#creations')) return;

            const contents = document.querySelectorAll('.profile-tab-content');
            contents.forEach((content) => {
                if (content.classList.contains('ng-hide')) return;

                if (content.children.length === 1) {
                    const inner = content.children[0];
                    if (inner.tagName === 'DIV' && inner.children.length === 0 && inner.textContent.trim() === '') {
                        if (content.querySelector('.rovalra-empty-state')) return;
                        content.innerHTML = '';
                        content.appendChild(UI.createEmptyState(handleButtonClick));
                    }
                }
            });
        };

        window.addEventListener('hashchange', checkEmptyState);
        observeElement('.profile-tab-content', checkEmptyState);
    });
}
