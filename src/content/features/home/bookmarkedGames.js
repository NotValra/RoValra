import {
    getUniversesDetails,
    getUniversesVotes,
} from '../../core/apis/games.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    bookmarkLabel,
    getBookmarkState,
    subscribeBookmarks,
    init as initBookmarks,
} from '../games/gameBookmarks.js';
import { DEFAULT_CATEGORY_ID } from '../../../shared/gameBookmarks.js';

const TOPIC_ID = 10000013059;
const SUB_ID = 'rovalra-bookmarked-games';
let initialized = false;
let selectedCategory = 'all';
let generation = 0;
let games = [];
let lastIds = '';
let emptyFilter = false;
const renderedContainers = new WeakSet();

function publish() {
    const state = getBookmarkState();
    const filtered = games.filter(
        (game) =>
            selectedCategory === 'all' ||
            state.bookmarks[game.universeId]?.categoryIds.includes(
                selectedCategory,
            ),
    );
    emptyFilter = filtered.length === 0 && games.length > 0;
    const displayed = emptyFilter ? games : filtered;
    document.dispatchEvent(
        new CustomEvent('rovalra-home-extra-sorts', {
            detail: {
                source: SUB_ID,
                sorts: [
                    {
                        topic: bookmarkLabel('topic'),
                        topicId: TOPIC_ID,
                        subId: SUB_ID,
                        treatmentType: 'Carousel',
                        numberOfRows: 1,
                        topicLayoutData: { hideSeeAll: 'true', linkPath: '' },
                        rovalraKeepEmpty: true,
                        games: displayed,
                        recommendationList: displayed.map((game) => ({
                            contentType: 'Game',
                            contentId: game.universeId,
                            contentStringId: '',
                            contentMetadata: {},
                            analyticsData: {},
                        })),
                        nextPageTokenForTopic: null,
                        analyticsData: {},
                    },
                ],
            },
        }),
    );
    enhanceHeaders();
}

async function refresh() {
    const version = ++generation;
    const state = getBookmarkState();
    if (
        selectedCategory !== 'all' &&
        !state.categories.some((category) => category.id === selectedCategory)
    )
        selectedCategory = 'all';
    const ids = Object.keys(state.bookmarks).sort();
    if (lastIds === ids.join(',') && games.length) {
        publish();
        return;
    }
    const nextGames = [];
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50).map(Number);
        const [details, votes] = await Promise.all([
            getUniversesDetails(chunk),
            getUniversesVotes(chunk),
        ]);
        const votesById = new Map(votes.map((vote) => [vote.universeId, vote]));
        for (const game of details) {
            const vote = votesById.get(game.id);
            nextGames.push({
                ...game,
                universeId: game.id,
                playerCount: game.playing,
                totalUpVotes: vote?.upVotes || 0,
                totalDownVotes: vote?.downVotes || 0,
            });
        }
    }
    if (version !== generation) return;
    games = nextGames;
    lastIds = ids.join(',');
    publish();
}

function enhanceHeaders() {
    for (const header of document.querySelectorAll(
        '#HomeContainer .home-sort-header-container, #HomeContainer .game-sort-header-container, #HomeContainer .container-header',
    )) {
        if (!header.textContent.includes(bookmarkLabel('topic'))) continue;
        const wrapper = header.closest('.game-sort-carousel-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('rovalra-bookmarks-empty', emptyFilter);
            let empty = wrapper.querySelector(
                '.rovalra-bookmarks-empty-message',
            );
            if (!empty) {
                empty = document.createElement('p');
                empty.className = 'rovalra-bookmarks-empty-message';
                empty.textContent = bookmarkLabel('empty');
                empty.setAttribute('role', 'status');
                wrapper.append(empty);
            }
            empty.hidden = !emptyFilter;
        }
        header.classList.add('rovalra-bookmarked-games-header');
        const signature = JSON.stringify(getBookmarkState().categories);
        const existing = header.querySelector('.rovalra-bookmark-filter');
        if (existing?.dataset.categories === signature) {
            updateFilterTrigger(
                existing.querySelector('.rovalra-bookmark-filter-trigger'),
                selectedCategory,
            );
            continue;
        }
        existing?._rovalraClose?.();
        existing?.remove();
        const filter = document.createElement('div');
        filter.dataset.categories = signature;
        filter.className = 'rovalra-bookmark-filter';
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className =
            'btn-control-sm rovalra-ui-btn rovalra-bookmark-filter-trigger';
        updateFilterTrigger(trigger, selectedCategory);
        trigger.setAttribute('aria-label', bookmarkLabel('title'));
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const menu = document.createElement('div');
        menu.className = 'rovalra-bookmark-filter-menu';
        menu.setAttribute('role', 'listbox');
        menu.hidden = true;
        let outsideClick = null;
        const close = () => {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            outsideClick &&
                document.removeEventListener('pointerdown', outsideClick);
            outsideClick = null;
            if (menu.parentElement !== filter) filter.append(menu);
            menu.classList.remove('rovalra-bookmark-filter-menu-portal');
            menu.removeAttribute('style');
        };
        const open = () => {
            const rect = trigger.getBoundingClientRect();
            menu.hidden = false;
            menu.classList.add('rovalra-bookmark-filter-menu-portal');
            document.body.append(menu);
            const menuHeight = menu.getBoundingClientRect().height;
            const below = rect.bottom + 4;
            const top =
                below + menuHeight <= window.innerHeight - 8
                    ? below
                    : Math.max(8, rect.top - menuHeight - 4);
            menu.style.top = `${top}px`;
            menu.style.left = `${Math.max(8, rect.left)}px`;
            menu.style.minWidth = `${rect.width}px`;
            trigger.setAttribute('aria-expanded', 'true');
            outsideClick = (event) => {
                if (
                    !filter.contains(event.target) &&
                    !menu.contains(event.target)
                )
                    close();
            };
            document.addEventListener('pointerdown', outsideClick);
        };
        for (const category of [
            { id: 'all', name: bookmarkLabel('all') },
            ...getBookmarkState().categories,
        ]) {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'rovalra-bookmark-filter-option';
            option.setAttribute('role', 'option');
            option.setAttribute(
                'aria-selected',
                String(category.id === selectedCategory),
            );
            option.textContent = filterLabel(category.id);
            option.addEventListener('click', () => {
                selectedCategory = category.id;
                updateFilterTrigger(trigger, selectedCategory);
                for (const item of menu.querySelectorAll(
                    '.rovalra-bookmark-filter-option',
                )) {
                    item.setAttribute('aria-selected', String(item === option));
                }
                close();
                publish();
            });
            menu.append(option);
        }
        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            if (menu.hidden) open();
            else close();
        });
        filter.addEventListener('focusout', () => {
            requestAnimationFrame(() => {
                if (
                    !filter.contains(document.activeElement) &&
                    !menu.contains(document.activeElement)
                )
                    close();
            });
        });
        filter.append(trigger, menu);
        filter._rovalraClose = close;
        header.append(filter);
    }
}

function updateFilterTrigger(trigger, categoryId) {
    trigger.textContent = filterLabel(categoryId);
    trigger.dataset.selected = categoryId === 'all' ? 'false' : 'true';
}

function filterLabel(categoryId) {
    if (categoryId === 'all') return bookmarkLabel('all');
    const category = getBookmarkState().categories.find(
        (item) => item.id === categoryId,
    );
    if (category?.id === DEFAULT_CATEGORY_ID)
        return bookmarkLabel('uncategorized');
    return category?.name || bookmarkLabel('all');
}

export async function init() {
    if (initialized) return;
    initialized = true;
    if ((await settings.gameBookmarksEnabled) === false) return;
    await initBookmarks();
    subscribeBookmarks(() => {
        refresh().catch(console.warn);
    });
    observeElement(
        '#HomeContainer .home-sort-header-container, #HomeContainer .game-sort-header-container, #HomeContainer .container-header',
        enhanceHeaders,
        { multiple: true },
    );
    observeElement(
        '#HomeContainer [data-testid="text-icon-row-text"]',
        enhanceHeaders,
        { multiple: true },
    );
    observeElement(
        '#HomeContainer a.game-card-link',
        (card) => {
            const container = card.closest('#HomeContainer');
            if (renderedContainers.has(container)) return;
            renderedContainers.add(container);
            requestAnimationFrame(() =>
                document.dispatchEvent(
                    new CustomEvent('rovalra-home-rendered'),
                ),
            );
        },
        { multiple: true },
    );
    await refresh();
}
