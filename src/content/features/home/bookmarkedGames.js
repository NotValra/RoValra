import {
    getUniversesDetails,
    getUniversesVotes,
} from '../../core/apis/games.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createDropdown } from '../../core/ui/dropdown.js';
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
            existing._rovalraSetValue?.(selectedCategory);
            continue;
        }
        existing?._rovalraDestroy?.();
        const dropdown = createDropdown({
            items: [
                { value: 'all', label: bookmarkLabel('all') },
                ...getBookmarkState().categories.map((category) => ({
                    value: category.id,
                    label: filterLabel(category.id),
                })),
            ],
            initialValue: selectedCategory,
            onValueChange: (value) => {
                selectedCategory = value;
                publish();
            },
        });
        const filter = dropdown.element;
        filter.dataset.categories = signature;
        filter.classList.add('rovalra-bookmark-filter');
        filter._rovalraSetValue = dropdown.setValue;
        filter._rovalraDestroy = dropdown.destroy;
        dropdown.trigger.setAttribute('aria-label', bookmarkLabel('title'));
        header.append(filter);
    }
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
