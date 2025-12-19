import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createShimmerGrid } from '../../core/ui/shimmer.js';
import { fetchThumbnails as fetchThumbnailsBatch, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import { callRobloxApiJson } from '../../core/api.js';

const PAGE_SIZE = 50;
const ACCESS_FILTER = { ALL: 1, PUBLIC: 2 };

const el = (tag, className, props = {}, children = []) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.assign(element, props);
    Object.assign(element.style, props.style || {});
    children.forEach(child => child && element.append(child));
    return element;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const api = {
    async safeGet(endpoint) {
        let delay = 3000;
        const retries = 5;

        for (let i = 0; i <= retries; i++) {
            try {
                return await callRobloxApiJson({
                    subdomain: 'games',
                    endpoint: endpoint,
                    method: 'GET'
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

    async getGroupGames(groupId, accessFilter) {
        let games = [];
        let cursor = '';
        
        do {
            const endpoint = `/v2/groups/${groupId}/gamesV2?accessFilter=${accessFilter}&limit=50&sortOrder=Desc&cursor=${cursor}`;
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

    async getGameDetails(games, likeMap, playerMap) {
        const batch = games.filter(g => g && !likeMap.has(g.id));
        if (!batch.length) return;

        for (let i = 0; i < batch.length; i += 50) {
            const chunk = batch.slice(i, i + 50);
            const universeIds = chunk.map(g => g.id).join(',');
            if (!universeIds) continue;

            const [votesData, playersData] = await Promise.all([
                this.safeGet(`/v1/games/votes?universeIds=${universeIds}`),
                this.safeGet(`/v1/games?universeIds=${universeIds}`)
            ]);

            if (votesData?.data) {
                votesData.data.forEach(item => {
                    const total = item.upVotes + item.downVotes;
                    const ratio = total > 0 ? Math.round((item.upVotes / total) * 100) : 0;
                    likeMap.set(item.id, { ratio, total });
                });
            }

            if (playersData?.data) {
                playersData.data.forEach(item => playerMap.set(item.id, item.playing || 0));
            }
        }
    },

    async getThumbnails(games, cache) {
        const uncached = games.filter(g => g && !cache.has(g.id));
        if (!uncached.length) return;
        const results = await fetchThumbnailsBatch(uncached, 'GameIcon', '256x256');
        results.forEach((data, id) => cache.set(id, data));
    }
};

const createGameCard = (game, likeMap, playerMap, thumbnailCache) => {
    const thumbData = thumbnailCache.get(game.id);
    const votes = likeMap.get(game.id) || { ratio: 0, total: 0 };
    const players = playerMap.get(game.id) || 0;

    const thumbnail = createThumbnailElement(thumbData, game.name, 'game-card-thumb');
    
    const infoContent = `
        <span class="info-label icon-votes-gray"></span>
        <span class="info-label vote-percentage-label ${votes.total > 0 ? '' : 'hidden'}">${votes.ratio}%</span>
        <span class="info-label no-vote ${votes.total === 0 ? '' : 'hidden'}"></span>
        <span class="info-label icon-playing-counts-gray"></span>
        <span class="info-label playing-counts-label" title="${players.toLocaleString()}">${players.toLocaleString()}</span>
    `;

    return el('div', 'game-card-container', { style: { justifySelf: 'center', width: '150px', height: '240px' } }, [
        el('a', 'game-card-link', { 
            href: `https://www.roblox.com/games/${game.rootPlace.id}`,
            style: { display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' } 
        }, [
            el('div', null, {}, [
                el('div', 'game-card-thumb-container', {}, [thumbnail]),
                el('div', 'game-card-name game-name-title', { title: game.name, textContent: game.name })
            ]),
            el('div', 'game-card-info', { innerHTML: infoContent })
        ])
    ]);
};

class HiddenGamesManager {
    constructor(allHiddenGames) {
        this.allGames = allHiddenGames;
        this.filteredGames = [];
        this.filters = { sort: 'default', order: 'desc' };
        this.displayedCount = 0;
        this.isLoading = false;
        this.isPaginating = false;
        this.cache = { likes: new Map(), players: new Map(), thumbnails: new Map() };
        this.elements = {};
        this.render();
    }

    render() {
        const sortDropdown = createDropdown({
            items: [
                { value: 'default', label: 'Recently Updated' },
                { value: 'likes', label: 'Likes' },
                { value: 'players', label: 'Players' },
                { value: 'name', label: 'Name (Z-A)' }
            ],
            initialValue: 'default',
            onValueChange: (v) => { this.filters.sort = v; this.applyFilters(); }
        });

        const orderDropdown = createDropdown({
            items: [
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' }
            ],
            initialValue: 'desc',
            onValueChange: (v) => { this.filters.order = v; this.applyFilters(); }
        });

        const createFilterGroup = (label, input) => el('div', '', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
            el('label', '', { textContent: label, style: { fontSize: '12px', fontWeight: '500', color: 'var(--rovalra-overlay-text-secondary)' } }),
            input
        ]);

        const body = el('div', '', { style: { display: 'flex', flexDirection: 'column', minHeight: '0' } }, [
            el('div', 'rovalra-filters-container', { 
                style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 24px', padding: '16px 24px', flexShrink: 0, backgroundColor: 'var(--surface-default)', borderBottom: '1px solid var(--border-default)' } 
            }, [
                createFilterGroup('Sort', sortDropdown.element),
                createFilterGroup('Order', orderDropdown.element)
            ]),
            el('div', 'hidden-games-list', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', padding: '24px', overflowY: 'auto', flexGrow: 1 } }),
            el('div', 'rovalra-load-more-container', { style: { padding: '10px 0', textAlign: 'center', flexShrink: 0 } })
        ]);

        this.elements.list = body.querySelector('.hidden-games-list');
        this.elements.filters = body.querySelector('.rovalra-filters-container');
        this.elements.loader = body.querySelector('.rovalra-load-more-container');

        this.elements.list.addEventListener('scroll', () => {
            const { scrollTop, clientHeight, scrollHeight } = this.elements.list;
            if (scrollTop + clientHeight >= scrollHeight - 150) this.loadMore();
        });

        createOverlay({
            title: `Hidden Group Experiences (${this.allGames.length} Total)`,
            bodyContent: body,
            maxWidth: '1200px',
            maxHeight: '85vh'
        });

        if (this.allGames.length === 0) {
            this.elements.list.innerHTML = `<p class="btr-no-servers-message">This group has no hidden experiences.</p>`;
            this.elements.filters.style.display = 'none';
        } else {
            this.applyFilters();
        }
    }

    async applyFilters() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.isPaginating = false;
        
        this.elements.list.innerHTML = '';
        this.elements.list.appendChild(createShimmerGrid(12, { width: '150px', height: '240px' }));
        this.elements.loader.innerHTML = '';

        const { sort, order } = this.filters;

        if (sort === 'likes' || sort === 'players') {
            await api.getGameDetails(this.allGames, this.cache.likes, this.cache.players);
        }

        let processed = [...this.allGames];
        if (sort === 'likes') {
            processed.sort((a, b) => (this.cache.likes.get(b.id)?.ratio || 0) - (this.cache.likes.get(a.id)?.ratio || 0));
        } else if (sort === 'players') {
            processed.sort((a, b) => (this.cache.players.get(b.id) || 0) - (this.cache.players.get(a.id) || 0));
        } else if (sort === 'name') {
            processed.sort((a, b) => a.name.localeCompare(b.name));
        }

        if ((order === 'asc' && sort !== 'name') || (order === 'desc' && sort === 'name')) {
            processed.reverse();
        }

        this.filteredGames = processed;
        this.displayedCount = 0;

        const firstBatch = this.filteredGames.slice(0, PAGE_SIZE);
        if (firstBatch.length > 0) {
            await Promise.all([
                api.getGameDetails(firstBatch, this.cache.likes, this.cache.players),
                api.getThumbnails(firstBatch, this.cache.thumbnails)
            ]);
            this.displayedCount = firstBatch.length;
        }

        this.isLoading = false;
        this.renderList();
    }

    renderList() {
        this.elements.list.innerHTML = '';
        const gamesToShow = this.filteredGames.slice(0, this.displayedCount);

        if (gamesToShow.length === 0) {
            this.elements.list.innerHTML = `<p class="btr-no-servers-message">No hidden experiences match the current filters.</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        gamesToShow.forEach(game => {
            fragment.appendChild(createGameCard(game, this.cache.likes, this.cache.players, this.cache.thumbnails));
        });
        this.elements.list.appendChild(fragment);
    }

    async loadMore() {
        if (this.isLoading || this.isPaginating || this.displayedCount >= this.filteredGames.length) return;
        this.isPaginating = true;
        this.elements.loader.innerHTML = `<p class="rovalra-loading-text">Loading more games...</p>`;

        const nextBatch = this.filteredGames.slice(this.displayedCount, this.displayedCount + PAGE_SIZE);
        if (nextBatch.length > 0) {
            await Promise.all([
                api.getGameDetails(nextBatch, this.cache.likes, this.cache.players),
                api.getThumbnails(nextBatch, this.cache.thumbnails)
            ]);

            const fragment = document.createDocumentFragment();
            nextBatch.forEach(game => {
                fragment.appendChild(createGameCard(game, this.cache.likes, this.cache.players, this.cache.thumbnails));
            });
            this.elements.list.appendChild(fragment);
            this.displayedCount += nextBatch.length;
        }

        this.elements.loader.innerHTML = '';
        this.isPaginating = false;
    }
}

export function init() {
    chrome.storage.local.get(['groupGamesEnabled'], (result) => {
        if (result.groupGamesEnabled !== true) return;

        const getGroupIdFromUrl = () => {
            const match = window.location.href.match(/(?:groups|communities)\/(\d+)/);
            return match ? match[1] : null;
        };

        const cleanupLegacyButtons = (header) => {
            if (!header) return;
            const selectors = ['.rovalra-hidden-games-container', '.hidden-games-button'];
            selectors.forEach(sel => {
                const els = header.querySelectorAll(sel);
                els.forEach(el => el.remove());
            });
        };

        const initHeader = async (header) => {
            if (!header || !header.isConnected) return;
            
            const currentGroupId = getGroupIdFromUrl();
            if (!currentGroupId) return;

            const attachedGroupId = header.dataset.rovalraGroupId;

            if (attachedGroupId) {
                if (attachedGroupId === currentGroupId) {
                    const existing = header.querySelectorAll('.rovalra-hidden-games-container');
                    if (existing.length > 1) {
                         cleanupLegacyButtons(header);
                         delete header.dataset.rovalraGroupId; 
                    } else if (existing.length === 1) {
                        return; 
                    }
                } else {
                    cleanupLegacyButtons(header);
                    delete header.dataset.rovalraGroupId;
                }
            }

            header.dataset.rovalraGroupId = currentGroupId;

            try {
                const [allGames, publicGames] = await Promise.all([
                    api.getGroupGames(currentGroupId, ACCESS_FILTER.ALL),
                    api.getGroupGames(currentGroupId, ACCESS_FILTER.PUBLIC)
                ]);

                const freshId = getGroupIdFromUrl();
                if (freshId !== currentGroupId || !header.isConnected) {
                    return;
                }

                const publicIds = new Set(publicGames.map(g => g.id));
                const hiddenGames = allGames.filter(g => !publicIds.has(g.id));

                cleanupLegacyButtons(header);

                const btn = createButton("Hidden Experiences", "secondary");
                btn.addEventListener('click', () => new HiddenGamesManager(hiddenGames));
                
                const container = el('div', 'rovalra-hidden-games-container', {
                    style: { marginTop: '10px' } 
                }, [btn]);

                const description = header.querySelector('.description-container');
                if (description) {
                    description.after(container);
                } else {
                    header.appendChild(container);
                }

            } catch (err) {
                delete header.dataset.rovalraGroupId; 
                cleanupLegacyButtons(header);
            }
        };

        observeElement('.group-profile-header', (header) => {
            initHeader(header);
        });

        let lastUrl = window.location.href;
        const checkForUrlChange = () => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                const header = document.querySelector('.group-profile-header');
                if (header) {
                    initHeader(header); 
                }
            }
        };

        setInterval(checkForUrlChange, 1000);
        window.addEventListener('popstate', checkForUrlChange);
    });
}