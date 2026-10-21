import {
    observeChildren,
    observeElement,
    observeIntersection,
    observeResize,
} from '../../core/observer.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { fetchThumbnails as fetchThumbnailsBatch } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApi } from '../../core/api.js';
import { safeHtml } from '../../core/packages/dompurify';
import { createGameCard } from '../../core/ui/games/gameCard.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
const CONFIG = {
    ACCESS_FILTER: { PUBLIC: 2 },
    RETRY: {
        MAX_ATTEMPTS: 5,
        DELAY_MS: 3000,
    },
};

const ENDPOINTS = {
    INVENTORY_CHECK: (userId) => `/v1/users/${userId}/can-view-inventory`,

    INVENTORY_GAMES: (userId, cursor = '') =>
        `/v1/users/${userId}/places/inventory?cursor=${cursor}&itemsPerPage=100&placesTab=Created`,

    GAMES_V2: (userId, accessFilter, cursor = '') =>
        `/v2/users/${userId}/games?accessFilter=${accessFilter}&limit=50&sortOrder=Asc&cursor=${cursor}`,

    VOTES_V1: (ids) => `/v1/games/votes?universeIds=${ids}`,
    GAMES_V1: (ids) => `/v1/games?universeIds=${ids}`,
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

    async getAllOwnedUniverses(userId) {
        const itemByUniverse = new Map();
        let nextCursor = '';

        do {
            const res = await this.fetchWithRetry({
                subdomain: 'inventory',
                endpoint: ENDPOINTS.INVENTORY_GAMES(userId, nextCursor),
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                for (const item of data.data) {
                    if (
                        item.universeId != null &&
                        !itemByUniverse.has(item.universeId)
                    ) {
                        itemByUniverse.set(item.universeId, item);
                    }
                }
                nextCursor = data.nextPageCursor;
            } else {
                nextCursor = null;
            }
        } while (nextCursor);

        return itemByUniverse;
    },

    async getPublicGames(userId) {
        let games = [];
        let nextCursor = null;

        do {
            const endpoint = ENDPOINTS.GAMES_V2(
                userId,
                CONFIG.ACCESS_FILTER.PUBLIC,
                nextCursor || '',
            );

            const res = await this.fetchWithRetry({
                subdomain: 'games',
                endpoint: endpoint,
            });
            const data = res ? await res.json().catch(() => null) : null;

            if (data?.data) {
                const formattedGames = data.data.filter(
                    (item) => item.id != null,
                );
                games = games.concat(formattedGames);
                nextCursor = data.nextPageCursor;
            } else {
                nextCursor = null;
            }
        } while (nextCursor);

        return games;
    },

    async resolveGameInfo(universeIds, itemByUniverse) {
        const gameById = new Map();
        for (let i = 0; i < universeIds.length; i += 50) {
            const chunk = universeIds.slice(i, i + 50);
            const res = await this.fetchWithRetry({
                subdomain: 'games',
                endpoint: ENDPOINTS.GAMES_V1(chunk.join(',')),
            });
            const data = res ? await res.json().catch(() => null) : null;
            data?.data?.forEach((g) => gameById.set(g.id, g));
        }

        return universeIds.map((id) => {
            const info = gameById.get(id);
            const fallback = itemByUniverse.get(id);
            return {
                id,
                name: info?.name || fallback.name,
                rootPlaceId: info?.rootPlaceId || fallback.placeId,
            };
        });
    },

    async getUserGames(userId) {
        if (userListCache.has(userId)) {
            return userListCache.get(userId).catch((err) => {
                console.error(err);
                return { all: [], hidden: [] };
            });
        }

        const fetchPromise = (async () => {
            const isPublic = await this.checkInventoryPublic(userId);
            if (!isPublic) return { all: [], hidden: [] };

            const [itemByUniverse, publicGames] = await Promise.all([
                this.getAllOwnedUniverses(userId),
                this.getPublicGames(userId),
            ]);

            const publicIds = new Set(publicGames.map((g) => g.id));
            const allIds = [...itemByUniverse.keys()];
            const all = await this.resolveGameInfo(allIds, itemByUniverse);
            const hidden = all.filter((g) => !publicIds.has(g.id));

            return { all, hidden };
        })();

        userListCache.set(userId, fetchPromise);
        fetchPromise.catch(() => userListCache.delete(userId));
        return fetchPromise.catch(
            (err) => (console.error(err), { all: [], hidden: [] }),
        );
    },

    async enrichGameData(games, state, { thumbnails = true } = {}) {
        if (thumbnails) {
            const thumbBatch = games.filter(
                (g) => g && !state.thumbnails.has(g.id),
            );
            if (thumbBatch.length) {
                const newThumbnails = await fetchThumbnailsBatch(
                    thumbBatch,
                    'GameIcon',
                    '256x256',
                );
                newThumbnails.forEach((data, id) =>
                    state.thumbnails.set(id, data),
                );
            }
        }

        const batch = games.filter(
            (g) => g && (!state.likes.has(g.id) || !state.updated.has(g.id)),
        );
        if (!batch.length) return;

        const playerResList = [];
        const voteResList = [];
        for (let i = 0; i < batch.length; i += 50) {
            const chunk = batch.slice(i, i + 50);
            const chunkIds = chunk.map((g) => g.id).join(',');

            if (i > 0) await new Promise((r) => setTimeout(r, 250));

            const [gamesRes, votesRes] = await Promise.all([
                this.fetchWithRetry({
                    subdomain: 'games',
                    endpoint: ENDPOINTS.GAMES_V1(chunkIds),
                }).then((r) => r?.json()),
                this.fetchWithRetry({
                    subdomain: 'games',
                    endpoint: ENDPOINTS.VOTES_V1(chunkIds),
                }).then((r) => r?.json()),
            ]);

            playerResList.push(gamesRes);
            voteResList.push(votesRes);
        }

        voteResList.forEach((likeRes) => {
            if (likeRes?.data) {
                likeRes.data.forEach((item) => {
                    const total = item.upVotes + item.downVotes;
                    const ratio =
                        total > 0
                            ? Math.round((item.upVotes / total) * 100)
                            : 0;
                    state.likes.set(item.id, {
                        ratio,
                        total,
                        upVotes: item.upVotes,
                        downVotes: item.downVotes,
                    });
                });
            }
        });

        playerResList.forEach((playerRes) => {
            if (playerRes?.data) {
                playerRes.data.forEach((item) => {
                    state.players.set(item.id, item.playing || 0);
                    state.updated.set(item.id, item.updated || 0);
                });
            }
        });
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
                    label: await t('hiddenGamesProfile.sort.default'),
                },
                {
                    value: 'like-ratio',
                    label: await t('hiddenGamesProfile.sort.likeRatio'),
                },
                {
                    value: 'likes',
                    label: await t('hiddenGamesProfile.sort.likes'),
                },
                {
                    value: 'dislikes',
                    label: await t('hiddenGamesProfile.sort.dislikes'),
                },
                {
                    value: 'players',
                    label: await t('hiddenGamesProfile.sort.players'),
                },
                {
                    value: 'name',
                    label: await t('hiddenGamesProfile.sort.name'),
                },
            ],
            initialValue: 'default',
            onValueChange: (v) => onFilterChange('sort', v),
        });

        const orderDropdown = createDropdown({
            items: [
                {
                    value: 'desc',
                    label: await t('hiddenGamesProfile.order.descending'),
                },
                {
                    value: 'asc',
                    label: await t('hiddenGamesProfile.order.ascending'),
                },
            ],
            initialValue: 'desc',
            onValueChange: (v) => onFilterChange('order', v),
        });

        const showAllToggle = createToggle({
            checked: false,
            onChange: (v) => onFilterChange('showAll', v),
        });
        showAllToggle.style.transform = 'scale(1.3)';
        showAllToggle.style.transformOrigin = 'left center';

        const showAllToggleWrapper = document.createElement('div');
        showAllToggleWrapper.style.display = 'flex';
        showAllToggleWrapper.style.alignItems = 'center';
        showAllToggleWrapper.style.minHeight = '38px';
        showAllToggleWrapper.appendChild(showAllToggle);

        container.append(
            createFilterSection(
                await t('hiddenGamesProfile.labels.sort'),
                sortDropdown.element,
            ),
            createFilterSection(
                await t('hiddenGamesProfile.labels.order'),
                orderDropdown.element,
            ),
            createFilterSection(
                await t('hiddenGamesProfile.labels.showAll'),
                showAllToggleWrapper,
            ),
        );

        return container;
    },

    async createExperiencesToggle(anchor) {
        let toggle;
        const setShowingHidden = createInlineView(() => anchor ?? toggle);

        toggle = createPillToggle({
            options: [
                {
                    text: await t('hiddenGamesProfile.publicExperiences'),
                    value: 'experiences',
                },
                {
                    text: await t('hiddenGamesProfile.hiddenExperiences'),
                    value: 'hidden',
                },
            ],
            initialValue: 'experiences',
            onChange: (value) => setShowingHidden(value === 'hidden'),
        });
        toggle.classList.add('rovalra-hidden-games-toggle');
        return toggle;
    },

    async injectHeadingToggle(heading) {
        const parent = heading.parentElement;
        if (!parent) return;
        if (parent.querySelector(':scope > .rovalra-hidden-games-toggle'))
            return;

        const toggle = await this.createExperiencesToggle(heading);
        if (parent.querySelector(':scope > .rovalra-hidden-games-toggle'))
            return;

        heading.before(toggle);
        const align = () => {
            toggle.style.top = `${heading.offsetTop + (heading.offsetHeight - toggle.offsetHeight) / 2}px`;
        };
        align();
        observeResize(heading, align);
    },

    async injectButton(header) {
        if (!header || header.querySelector('.rovalra-hidden-games-toggle'))
            return;

        if (
            header.querySelector('social-link-icon-list') ||
            header.querySelector('h2')
        )
            return;

        const toggle = await this.createExperiencesToggle(header);
        toggle.style.marginLeft = '5px';
        const buttonContainer = header.querySelector('.container-buttons');
        if (buttonContainer) {
            header.insertBefore(toggle, buttonContainer);
        } else {
            header.appendChild(toggle);
        }
    },

    async createEmptyState() {
        const container = document.createElement('div');
        container.className = 'rovalra-empty-state section';

        const text = document.createElement('p');
        text.className = 'text-label';
        text.textContent = await t('hiddenGamesProfile.noPublicGames');

        container.append(text, await this.createExperiencesToggle());
        return container;
    },
};

const STATS_SORTS = ['like-ratio', 'likes', 'dislikes', 'players'];
const CARD_SIZE = { width: '150px', height: '240px' };

function updateScrollButtonStates(container, leftBtn, rightBtn) {
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const isScrollable = scrollWidth > clientWidth + 5;
    leftBtn.style.display = isScrollable ? 'flex' : 'none';
    rightBtn.style.display = isScrollable ? 'flex' : 'none';
    leftBtn.classList.toggle('rovalra-btn-disabled', scrollLeft <= 5);
    rightBtn.classList.toggle(
        'rovalra-btn-disabled',
        scrollLeft + clientWidth >= scrollWidth - 5,
    );
}

function scrollByPage(container, list, direction) {
    const card = list.firstElementChild;
    if (!card) return;

    const style = getComputedStyle(container);
    const visibleWidth =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const step = card.offsetWidth + gap;
    const cardsPerPage = Math.max(1, Math.floor((visibleWidth + gap) / step));
    const currentIndex = Math.round(container.scrollLeft / step);

    container.scrollTo({
        left: Math.max(0, (currentIndex + direction * cardsPerPage) * step),
        behavior: 'smooth',
    });
}

class HiddenGamesManager {
    constructor(userId) {
        this.userId = userId;
        this.ownedGames = [];
        this.hiddenGames = [];
        this.showAllGames = false;
        this.cache = sharedStatsCache;
        this.filters = { sort: 'default', order: 'desc' };
        this.renderId = 0;
        this.slotObservers = [];
        this.pendingSlots = new Map();
        this.flushTimer = null;
        this.elements = {};
    }

    async render(host) {
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'rovalra-hidden-games-scroll-wrapper';

        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'rovalra-hidden-games-scroll-container';

        const list = document.createElement('div');
        list.className = 'rovalra-hidden-games-carousel';
        list.appendChild(createShimmerGrid(8, CARD_SIZE));
        scrollContainer.appendChild(list);

        const { leftButton, rightButton } = createScrollButtons({
            onLeftClick: () => scrollByPage(scrollContainer, list, -1),
            onRightClick: () => scrollByPage(scrollContainer, list, 1),
        });
        leftButton.classList.add('rovalra-scroll-btn', 'left');
        rightButton.classList.add('rovalra-scroll-btn', 'right');

        const updateButtons = () =>
            updateScrollButtonStates(scrollContainer, leftButton, rightButton);
        scrollContainer.addEventListener('scroll', updateButtons);

        scrollWrapper.append(leftButton, scrollContainer, rightButton);
        host.append(scrollWrapper);

        this.elements = { list, scrollContainer, updateButtons };
        updateButtons();

        const { all, hidden } = await Api.getUserGames(this.userId);
        this.ownedGames = all;
        this.hiddenGames = hidden;

        if (!this.ownedGames || this.ownedGames.length === 0) {
            await this.showMessage('hiddenGamesProfile.noHiddenGames');
            return;
        }

        const filterPanel = await UI.createFilterPanel(
            this.handleFilterChange.bind(this),
        );
        host.prepend(filterPanel);
        this.elements.filterPanel = filterPanel;

        this.applyFilters();
    }

    async showMessage(key) {
        this.elements.list.innerHTML = safeHtml`<p class="rovalra-no-hidden-games-message">${await t(key)}</p>`;
        this.elements.updateButtons();
    }

    handleFilterChange(key, value) {
        if (key === 'showAll') {
            this.showAllGames = value;
        } else {
            this.filters[key] = value;
        }
        this.applyFilters();
    }

    async applyFilters() {
        const renderId = ++this.renderId;
        this.clearSlots();

        this.elements.list.innerHTML = '';
        this.elements.list.appendChild(createShimmerGrid(8, CARD_SIZE));
        this.elements.scrollContainer.scrollLeft = 0;

        const source = this.showAllGames ? this.ownedGames : this.hiddenGames;
        const { sort, order } = this.filters;

        if (STATS_SORTS.includes(sort)) {
            await Api.enrichGameData(source, this.cache, {
                thumbnails: false,
            });
            if (renderId !== this.renderId) return;
        }

        const orderMultiplier = order === 'desc' ? -1 : 1;
        let sorted = [...source];

        if (sort === 'like-ratio') {
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
        } else if (order === 'asc') {
            sorted.reverse();
        }

        this.elements.list.innerHTML = '';
        if (sorted.length === 0) {
            const emptyKey =
                !this.showAllGames && source.length === 0
                    ? 'hiddenGamesProfile.noHiddenGames'
                    : 'hiddenGamesProfile.noMatches';
            await this.showMessage(emptyKey);
            return;
        }

        sorted.forEach((game) => this.createSlot(game));
        this.elements.updateButtons();
    }

    createSlot(game) {
        const slot = document.createElement('div');
        slot.className = 'rovalra-hidden-game-slot';
        slot.appendChild(createShimmerGrid(1, CARD_SIZE));
        this.elements.list.appendChild(slot);

        const observer = observeIntersection(
            slot,
            (entry) => {
                if (!entry.isIntersecting) return;
                observer.unobserve();
                this.queueSlot(slot, game);
            },
            { root: this.elements.scrollContainer, rootMargin: '0px 300px' },
        );
        this.slotObservers.push(observer);
    }

    clearSlots() {
        this.slotObservers.splice(0).forEach((o) => o.unobserve());
        this.pendingSlots.clear();
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
    }

    queueSlot(slot, game) {
        this.pendingSlots.set(slot, game);
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flushSlots(), 100);
        }
    }

    async flushSlots() {
        const renderId = this.renderId;
        const batch = [...this.pendingSlots];
        this.pendingSlots.clear();
        this.flushTimer = null;

        try {
            await Api.enrichGameData(
                batch.map(([, game]) => game),
                this.cache,
            );
        } catch (err) {
            console.warn('RoValra: Error loading hidden games', err);
        }
        if (renderId !== this.renderId) return;

        batch.forEach(([slot, game]) => {
            if (!slot.isConnected) return;
            slot.replaceChildren(createGameCard({ game, stats: this.cache }));
        });
    }
}

function createInlineView(getAnchor) {
    let panel = null;
    const hiddenSiblings = [];

    return (showingHidden) => {
        const anchor = getAnchor();
        const parent = anchor?.parentElement;
        if (!parent) return;

        if (showingHidden) {
            for (const child of parent.children) {
                if (
                    child === anchor ||
                    child === panel ||
                    child.classList.contains('rovalra-hidden-games-toggle')
                )
                    continue;
                hiddenSiblings.push([child, child.style.display]);
                child.style.display = 'none';
            }
            if (!panel) {
                panel = document.createElement('div');
                panel.className = 'rovalra-hidden-games-inline';
                anchor.after(panel);
                const userId = getUserIdFromUrl();
                if (userId) new HiddenGamesManager(userId).render(panel);
            }
            panel.style.display = '';
        } else {
            if (panel) panel.style.display = 'none';
            hiddenSiblings
                .splice(0)
                .forEach(([el, display]) => (el.style.display = display));
        }
    };
}

let isInitialized = false;
export async function init() {
    if (isInitialized) return;
    if ((await settings.userGamesEnabled) !== true) return;
    isInitialized = true;

    observeElement(
        '.profile-experiences.profile-game .container-header, .btr-profile-right .profile-game .container-header, .placeholder-games .container-header',
        (header) => {
            if (header.dataset.rovalraProcessed) return;
            header.dataset.rovalraProcessed = 'true';
            UI.injectButton(header);
        },
        { multiple: true },
    );

    observeElement(
        '.profile-experiences .profile-carousel h2',
        (heading) => {
            if (
                heading.dataset.rovalraHiddenToggle ||
                heading.closest('.rovalra-hidden-games-inline')
            )
                return;
            heading.dataset.rovalraHiddenToggle = 'true';
            UI.injectHeadingToggle(heading);
        },
        { multiple: true },
    );

    const isBlank = (content) =>
        [...content.children].every(
            (child) =>
                child.tagName === 'DIV' &&
                child.children.length === 0 &&
                child.textContent.trim() === '',
        );

    let isCheckingEmptyState = false;
    const checkEmptyState = async () => {
        if (isCheckingEmptyState) return;
        if (!window.location.hash.includes('creations')) return;
        isCheckingEmptyState = true;

        try {
            const contents = document.querySelectorAll('.profile-tab-content');
            for (const content of contents) {
                if (
                    content.classList.contains('ng-hide') ||
                    content.classList.contains('hidden')
                )
                    continue;
                if (content.querySelector('.rovalra-empty-state')) continue;
                if (!isBlank(content)) continue;

                await new Promise((resolve) => setTimeout(resolve, 1500));
                if (
                    content.querySelector('.rovalra-empty-state') ||
                    !isBlank(content)
                )
                    continue;

                content.innerHTML = '';
                content.appendChild(await UI.createEmptyState());
            }
        } finally {
            isCheckingEmptyState = false;
        }
    };

    window.addEventListener('hashchange', checkEmptyState);
    observeElement(
        '.profile-tab-content',
        (content) => {
            checkEmptyState();
            observeChildren(content, checkEmptyState);
        },
        { multiple: true },
    );
}
