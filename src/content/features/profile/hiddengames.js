import { observeElement } from '../../core/observer.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { fetchThumbnails as fetchThumbnailsBatch, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApi } from '../../core/api.js';
import DOMPurify from 'dompurify';

const CONFIG = {
    PAGE_SIZE: 50,
    ACCESS_FILTER: 2,
    RETRY: {
        MAX_ATTEMPTS: 5,
        DELAY_MS: 3000
    }
};

const ENDPOINTS = {
    INVENTORY_CHECK: (userId) => 
        `/v1/users/${userId}/can-view-inventory`,
    
    INVENTORY_GAMES: (userId, cursor = '') => 
        `/v1/users/${userId}/places/inventory?cursor=${cursor}&itemsPerPage=100&placesTab=Created`,

    GAMES_V2: (userId, cursor = '') => 
        `/v2/users/${userId}/games?accessFilter=${CONFIG.ACCESS_FILTER}&limit=50&sortOrder=Asc&cursor=${cursor}`,
    
    VOTES_V1: (ids) => `/v1/games/votes?universeIds=${ids}`,
    GAMES_V1: (ids) => `/v1/games?universeIds=${ids}`,
    
    GAME_LINK: (placeId) => `https://www.roblox.com/games/${placeId}`
};

const Api = {
    async fetchWithRetry(options) {
        let delay = CONFIG.RETRY.DELAY_MS;
        
        for (let i = 0; i <= CONFIG.RETRY.MAX_ATTEMPTS; i++) {
            try {
                const response = await callRobloxApi(options);

                if (response.status === 429) {
                    if (i === CONFIG.RETRY.MAX_ATTEMPTS) throw new Error('Rate limit exceeded');
                    await new Promise(r => setTimeout(r, delay));
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
            endpoint: ENDPOINTS.INVENTORY_CHECK(userId)
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
                endpoint: ENDPOINTS.INVENTORY_GAMES(userId, nextCursor)
            });
            const data = res ? await res.json().catch(() => null) : null;
            
            if (data?.data) {
                const formattedGames = data.data
                    .filter(item => item.universeId != null)
                    .map(item => ({
                        id: item.universeId,
                        name: item.name,
                        rootPlace: {
                            id: item.placeId
                        }
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
                endpoint: endpoint
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
        try {
            const isPublic = await this.checkInventoryPublic(userId);
            
            if (isPublic) {
                return await this.getGamesFromInventory(userId);
            } else {
                return await this.getGamesFromV2(userId);
            }
        } catch (error) {
            return [];
        }
    },

    async enrichGameData(games, state) {
        const batch = games.filter(g => g && !state.likes.has(g.id));
        if (!batch.length) return;

        const universeIds = batch.map(g => g.id).join(',');
        
        const [likeRes, playerRes] = await Promise.all([
            this.fetchWithRetry({
                subdomain: 'games',
                endpoint: ENDPOINTS.VOTES_V1(universeIds)
            }).then(r => r?.json()),
            
            this.fetchWithRetry({
                subdomain: 'games',
                endpoint: ENDPOINTS.GAMES_V1(universeIds)
            }).then(r => r?.json())
        ]);

        if (likeRes?.data) {
            likeRes.data.forEach(item => {
                const total = item.upVotes + item.downVotes;
                const ratio = total > 0 ? Math.round((item.upVotes / total) * 100) : 0;
                state.likes.set(item.id, { ratio, total, upVotes: item.upVotes, downVotes: item.downVotes });
            });
        }

        if (playerRes?.data) {
            playerRes.data.forEach(item => state.players.set(item.id, item.playing || 0));
        }

        const newThumbnails = await fetchThumbnailsBatch(batch, 'GameIcon', '256x256');
        newThumbnails.forEach((data, id) => state.thumbnails.set(id, data));
    }
};

const UI = {
    createGameCard(game, state) {
        const voteData = state.likes.get(game.id) || { ratio: 0, total: 0 };
        const playerCount = state.players.get(game.id) || 0;
        const thumbnailData = state.thumbnails.get(game.id);

        const card = document.createElement('div');
        card.className = 'game-card-container';
        Object.assign(card.style, { justifySelf: 'center', width: '150px', height: '240px' });

        card.innerHTML = DOMPurify.sanitize(`
            <a class="game-card-link" href="${ENDPOINTS.GAME_LINK(game.rootPlace.id)}" style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
                <div>
                    <div class="game-card-thumb-container"></div>
                    <div class="game-card-name game-name-title" title="${game.name}">${game.name}</div>
                </div>
                <div class="game-card-info">
                    <span class="info-label icon-votes-gray"></span>
                    <span class="info-label vote-percentage-label ${voteData.total > 0 ? '' : 'hidden'}">${voteData.ratio}%</span>
                    <span class="info-label no-vote ${voteData.total === 0 ? '' : 'hidden'}"></span>
                    <span class="info-label icon-playing-counts-gray"></span>
                    <span class="info-label playing-counts-label" title="${playerCount.toLocaleString()}">${playerCount.toLocaleString()}</span>
                </div>
            </a>
        `);

        const thumbContainer = card.querySelector('.game-card-thumb-container');
        thumbContainer.appendChild(createThumbnailElement(thumbnailData, game.name, 'game-card-thumb'));

        return card;
    },

    createFilterPanel(onFilterChange) {
        const container = document.createElement('div');
        container.className = 'rovalra-filters-container';
        container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px 24px; padding: 16px 24px; flex-shrink: 0; background-color: var(--surface-default); border-bottom: 1px solid var(--border-default);';

        const createFilterSection = (label, element) => {
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
            div.innerHTML = DOMPurify.sanitize(`<label style="font-size: 12px; font-weight: 500; color: var(--rovalra-overlay-text-secondary);">${label}</label>`);
            div.appendChild(element);
            return div;
        };

        const sortDropdown = createDropdown({
            items: [
                { value: 'default', label: 'Recently Updated' },
                { value: "like-ratio", label: "Like Ratio" },
                { value: "likes", label: "Likes" },
                { value: "dislikes", label: "Dislikes" },
                { value: 'players', label: 'Players' },
                { value: 'name', label: 'Name (Z-A)' }
            ],
            initialValue: 'default',
            onValueChange: (v) => onFilterChange('sort', v)
        });

        const orderDropdown = createDropdown({
            items: [
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' }
            ],
            initialValue: 'desc',
            onValueChange: (v) => onFilterChange('order', v)
        });

        container.append(
            createFilterSection('Sort', sortDropdown.element),
            createFilterSection('Order', orderDropdown.element)
        );

        return container;
    },

    injectButton(header, onClick) {
        if (!header || header.querySelector('.hidden-games-button')) return;

        const btn = createButton("Hidden Experiences", "secondary");
        btn.classList.add('hidden-games-button');
        btn.style.marginLeft = '5px';
        btn.addEventListener('click', onClick);
        header.appendChild(btn);
    },

    createEmptyState(onClick) {
        const container = document.createElement('div');
        container.className = 'rovalra-empty-state section';
        container.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; width: 100%;';

        const text = document.createElement('p');
        text.className = 'text-label';
        text.style.cssText = 'font-size: 16px; color: var(--rovalra-main-text-color); margin-bottom: 12px; font-weight: 500;';
        text.textContent = 'User has no public experiences';

        const btn = createButton("Hidden Experiences", "secondary");
        btn.classList.add('hidden-games-button');
        btn.addEventListener('click', onClick);

        container.append(text, btn);
        return container;
    }
};

class HiddenGamesManager {
    constructor(allGames) {
        this.allGames = allGames;
        this.cache = { likes: new Map(), players: new Map(), thumbnails: new Map() };
        this.filters = { sort: 'default', order: 'desc' };
        this.processedGames = [];
        this.visibleCount = 0;
        this.isLoading = false;
        this.elements = {}; 
    }

    openOverlay() {
        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex-direction: column; min-height: 0;';

        const filterPanel = UI.createFilterPanel(this.handleFilterChange.bind(this));
        
        const list = document.createElement('div');
        list.className = 'hidden-games-list';
        list.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; padding: 24px; overflow-y: auto; flex-grow: 1;';
        
        const loader = document.createElement('div');
        loader.className = 'rovalra-load-more-container';
        loader.style.cssText = 'padding: 10px 0; text-align: center; flex-shrink: 0;';

        body.append(filterPanel, list, loader);

        this.elements = { list, loader, filterPanel };

        const { overlay } = createOverlay({
            title: `Hidden Experiences (${this.allGames.length} Total)`,
            bodyContent: body,
            maxWidth: '1200px',
            maxHeight: '85vh'
        });

        if (this.allGames.length === 0) {
            this.elements.list.innerHTML = DOMPurify.sanitize(`<p class="btr-no-servers-message">This user has no hidden experiences.</p>`);
            this.elements.filterPanel.style.display = 'none';
            return;
        }

        this.elements.list.addEventListener('scroll', () => {
            const { scrollTop, clientHeight, scrollHeight } = this.elements.list;
            if (scrollTop + clientHeight >= scrollHeight - 150) {
                this.loadMore();
            }
        });

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
        this.elements.list.appendChild(createShimmerGrid(12, { width: '150px', height: '240px' }));
        this.visibleCount = 0;

        if (['like-ratio', 'likes', 'dislikes', 'players'].includes(this.filters.sort)) {
            await Api.enrichGameData(this.allGames, this.cache);
        }

        const { sort, order } = this.filters;
        const orderMultiplier = order === 'desc' ? -1 : 1;
        let sorted = [...this.allGames];
        
        if (sort === 'like-ratio') {
            sorted.sort((a, b) => ((this.cache.likes.get(a.id)?.ratio || 0) - (this.cache.likes.get(b.id)?.ratio || 0)) * orderMultiplier);
        } else if (sort === "likes") {
            sorted.sort((a, b) => ((this.cache.likes.get(a.id)?.upVotes || 0) - (this.cache.likes.get(b.id)?.upVotes || 0)) * orderMultiplier);
        } else if (sort === "dislikes") {
            sorted.sort((a, b) => ((this.cache.likes.get(a.id)?.downVotes || 0) - (this.cache.likes.get(b.id)?.downVotes || 0)) * orderMultiplier);
        } else if (sort === 'players') {
            sorted.sort((a, b) => ((this.cache.players.get(a.id) || 0) - (this.cache.players.get(b.id) || 0)) * orderMultiplier);
        } else if (sort === 'name') {
            sorted.sort((a, b) => a.name.localeCompare(b.name) * (orderMultiplier));
        } else { 
            if (order === 'asc') {
                sorted.reverse();
            }
        }

        this.processedGames = sorted;
        this.isLoading = false;
        
        this.elements.list.innerHTML = '';
        if (this.processedGames.length === 0) {
            this.elements.list.innerHTML = DOMPurify.sanitize(`<p class="btr-no-servers-message">No experiences match filters.</p>`);
        } else {
            await this.loadMore();
        }
    }

    async loadMore() {
        if (this.visibleCount >= this.processedGames.length || this.elements.loader.innerHTML !== '') return;

        this.elements.loader.innerHTML = DOMPurify.sanitize(`<p class="rovalra-loading-text">Loading...</p>`);
        
        const nextBatch = this.processedGames.slice(this.visibleCount, this.visibleCount + CONFIG.PAGE_SIZE);
        
        if (nextBatch.length > 0) {
            await Api.enrichGameData(nextBatch, this.cache);
            nextBatch.forEach(game => {
                this.elements.list.appendChild(UI.createGameCard(game, this.cache));
            });
            this.visibleCount += nextBatch.length;
        }

        this.elements.loader.innerHTML = '';
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

        let cachedGames = null;
        let isFetching = false;
        let isUpdating = false;

        const handleButtonClick = async () => {
            const games = await fetchGamesOnce();
            new HiddenGamesManager(games).openOverlay();
        };

        const fetchGamesOnce = async () => {
            if (cachedGames !== null) return cachedGames;
            if (isFetching) {
                while(isFetching) await new Promise(r => setTimeout(r, 100));
                return cachedGames;
            }
            
            isFetching = true;
            try {
                cachedGames = await Api.getUserGames(userId);
            } catch (err) {
                cachedGames = [];
            } finally {
                isFetching = false;
            }
            return cachedGames;
        };

        const updateUI = async () => {
            const creationsTab = document.getElementById('tab-creations');
            
            if (!creationsTab || !creationsTab.classList.contains('active')) return;
            
            if (isUpdating) return;
            isUpdating = true;

            try {
                const placeholder = document.querySelector('.placeholder-games');
                if (placeholder) {
                    const isPlaceholderVisible = placeholder.style.display !== 'none' && !placeholder.classList.contains('ng-hide');
                    
                    if (isPlaceholderVisible) {
                        const spinnerContent = placeholder.querySelector('.section-content');
                        if (spinnerContent) spinnerContent.style.display = 'none';

                        const placeholderHeader = placeholder.querySelector('.container-header');
                        if (placeholderHeader && !placeholderHeader.querySelector('.hidden-games-button')) {
                            UI.injectButton(placeholderHeader, handleButtonClick);
                        }
                        return; 
                    }
                }

                const activeContent = Array.from(document.querySelectorAll('.profile-tab-content')).find(el => {
                    return !el.classList.contains('hidden') && 
                           !el.classList.contains('ng-hide') && 
                           el.style.display !== 'none' &&
                           (el.querySelector('.game-grid') || el.querySelector('.game-card') || el.id.includes('creations') || el.innerText.includes('Experiences') || el.innerText.trim() === "");
                });

                if (!activeContent) return;

                const strayButtons = document.querySelectorAll('.hidden-games-button');
                strayButtons.forEach(btn => {
                    if (!activeContent.contains(btn) && (!placeholder || !placeholder.contains(btn))) {
                        btn.remove();
                    }
                });

                const hasHeader = activeContent.querySelector('.container-header');
                const hasGames = activeContent.querySelector('.profile-game, .game-card, .game-grid');
                const hasText = activeContent.innerText.trim().length > 0;

                if (hasHeader) {
                    if (!hasHeader.querySelector('.hidden-games-button')) {
                        UI.injectButton(hasHeader, handleButtonClick);
                    }
                } else if (!hasGames && !hasText) {
                    if (!activeContent.querySelector('.rovalra-empty-state')) {
                        activeContent.innerHTML = ''; 
                        activeContent.appendChild(UI.createEmptyState(handleButtonClick));
                    }
                }
            } finally {
                isUpdating = false;
            }
        };

        observeElement('#tab-creations', (tabBtn) => {
            let timer;
            const observer = new MutationObserver(() => {
                clearTimeout(timer);
                timer = setTimeout(updateUI, 100);
            });
            observer.observe(tabBtn, { attributes: true, attributeFilter: ['class'] });
            setTimeout(updateUI, 100);
        });

        observeElement('.placeholder-games', (placeholder) => {
            const observer = new MutationObserver(() => updateUI());
            observer.observe(placeholder, { attributes: true, attributeFilter: ['style', 'class'] });
        });

        observeElement('.profile-tab-content', (content) => {
            const observer = new MutationObserver((mutations) => {
                const relevantChange = mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')));
                if (relevantChange) updateUI();
            });
            observer.observe(content, { 
                attributes: true, 
                attributeFilter: ['class', 'style'], 
                childList: true, 
                subtree: true 
            });
        });

        observeElement('.btr-profile-right .profile-game .container-header', (header) => {
            UI.injectButton(header, handleButtonClick);
        });
    });
}