import { callRobloxApiJson } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createButton } from '../../core/ui/buttons.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';
import { createToggle } from '../../core/ui/general/toggle.js';

const SETTING_NAME = 'publicGameDiscoveryEnabled';
const SECTION_ID = 'rovalra-public-game-discovery';
const HIDDEN_CLASS = 'rovalra-public-search-hidden';
const MATURITIES = ['minimal', 'mild', 'moderate', 'restricted'];

let initialized = false;
let enabled = false;
let observer = null;
let view = null;
let publicMode = false;

function searchQuery() {
    if (
        !/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/discover\/?$/i.test(location.pathname)
    )
        return '';
    return new URLSearchParams(location.search).get('keyword')?.trim() || '';
}

function createSearchView(root, initialQuery) {
    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.setAttribute('aria-label', ts('publicGameDiscovery.searchResults'));
    const controls = document.createElement('div');
    controls.className = 'rovalra-public-game-controls';
    const modeControl = document.createElement('div');
    modeControl.className = 'rovalra-public-game-mode';
    const modeLabel = document.createElement('span');
    modeLabel.textContent = ts('publicGameDiscovery.title');
    const toggle = createToggle({
        checked: publicMode,
        onChange: setMode,
    });
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', modeLabel.textContent);
    toggle.setAttribute('aria-controls', 'rovalra-public-game-results');
    modeControl.append(modeLabel, toggle);
    const body = document.createElement('div');
    body.id = 'rovalra-public-game-results';
    const notice = document.createElement('p');
    notice.textContent = ts('publicGameDiscovery.notice');

    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    const grid = document.createElement('div');
    grid.className = 'rovalra-public-game-grid';
    const more = createButton(ts('publicGameDiscovery.loadMore'));
    more.type = 'button';
    more.hidden = true;
    const retry = createButton(ts('publicGameDiscovery.retry'));
    retry.type = 'button';
    retry.hidden = true;

    const games = new Map();
    const stats = {
        likes: new Map(),
        players: new Map(),
        thumbnails: new Map(),
    };
    const sessionId = crypto.randomUUID();
    let maturity = 'all';
    let query = initialQuery;
    let nextPageToken = '';
    let controller = null;
    let loading = false;
    let failed = false;

    function renderResults() {
        const focused = document.activeElement;
        const focusedHref = grid.contains(focused)
            ? focused.closest('.game-card-link')?.href
            : null;
        grid.replaceChildren();
        for (const game of games.values()) {
            if (maturity !== 'all' && game.contentMaturity !== maturity)
                continue;

            const card = createGameCard({ game, stats });
            const label = document.createElement('div');
            label.className = 'rovalra-public-game-maturity';
            const maturityKey = MATURITIES.includes(game.contentMaturity)
                ? game.contentMaturity
                : 'unknown';
            label.textContent = ts('publicGameDiscovery.maturityLabel', {
                maturity: ts(`publicGameDiscovery.maturities.${maturityKey}`),
            });
            card.querySelector('.game-card-link').appendChild(label);
            grid.appendChild(card);
        }

        updateStatus();
        if (focusedHref) {
            const link = [...grid.querySelectorAll('.game-card-link')].find(
                (link) => link.href === focusedHref,
            );
            (link || status).focus({ preventScroll: true });
        }
    }

    function updateStatus() {
        const focused = document.activeElement;
        let statusKey = 'empty';
        if (loading) statusKey = 'loading';
        else if (failed) statusKey = 'error';
        else if (grid.childElementCount) statusKey = 'searchResults';
        status.textContent = ts(`publicGameDiscovery.${statusKey}`);
        grid.setAttribute('aria-busy', String(loading));
        more.hidden = !nextPageToken;
        more.setAttribute('aria-disabled', String(loading));
        retry.hidden = !failed && !(loading && focused === retry);
        retry.setAttribute('aria-disabled', String(loading));
        if (
            (focused === more && more.hidden) ||
            (focused === retry && retry.hidden)
        ) {
            (grid.querySelector('.game-card-link') || status).focus();
        }
    }

    const filter = createDropdown({
        items: ['all', ...MATURITIES].map((value) => ({
            value,
            label: ts(`publicGameDiscovery.maturities.${value}`),
        })),
        initialValue: 'all',
        placeholder: ts('publicGameDiscovery.maturities.all'),
        onValueChange(value) {
            maturity = value;
            renderResults();
            filter.trigger.focus();
        },
    });
    filter.trigger.setAttribute(
        'aria-label',
        ts('publicGameDiscovery.maturity'),
    );
    controls.append(modeControl, filter.element);
    body.append(notice, status, grid, more, retry);
    section.append(controls, body);
    root.before(section);

    function resetResults() {
        games.clear();
        stats.likes.clear();
        stats.players.clear();
        stats.thumbnails.clear();
        nextPageToken = '';
        failed = false;
        loading = false;
    }

    async function load(append = false) {
        if (!publicMode || (append && loading)) return;
        controller?.abort();
        controller = new AbortController();
        const { signal } = controller;
        if (!append) resetResults();
        loading = true;
        failed = false;
        if (append) updateStatus();
        else renderResults();

        const params = new URLSearchParams({
            sessionId,
            searchQuery: query,
            pageType: 'Game',
            pageToken: nextPageToken,
        });

        try {
            // Omit account credentials so search results are not personalized.
            const data = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/search-api/omni-search?${params}`,
                credentials: 'omit',
                signal,
                noCache: true,
            });
            if (signal.aborted) return;
            const results = data.searchResults?.flatMap((group) =>
                group.contentGroupType === 'Game' &&
                Array.isArray(group.contents)
                    ? group.contents
                    : [],
            );
            if (!Array.isArray(results))
                throw new Error('Invalid discovery response');

            const validGames = results.filter(
                (game) =>
                    Number.isSafeInteger(game?.universeId) &&
                    game.universeId > 0 &&
                    Number.isSafeInteger(game.rootPlaceId) &&
                    game.rootPlaceId > 0 &&
                    typeof game.name === 'string',
            );
            const thumbnails = await fetchThumbnails(
                validGames.map((game) => ({ id: game.rootPlaceId })),
                'GameThumbnail',
                '480x270',
                false,
                signal,
            ).catch(() => new Map());
            if (signal.aborted) return;
            for (const result of validGames) {
                const game = { ...result, id: result.universeId };
                games.set(game.id, game);
                const total = game.totalUpVotes + game.totalDownVotes;
                stats.likes.set(game.id, {
                    total,
                    ratio:
                        total > 0
                            ? Math.round((game.totalUpVotes / total) * 100)
                            : 0,
                });
                stats.players.set(game.id, game.playerCount || 0);
                stats.thumbnails.set(game.id, thumbnails.get(game.rootPlaceId));
            }
            nextPageToken =
                typeof data.nextPageToken === 'string'
                    ? data.nextPageToken
                    : '';
        } catch (error) {
            if (signal.aborted) return;
            failed = true;
            console.warn('RoValra: Public game discovery failed.', error);
        } finally {
            if (!signal.aborted) {
                loading = false;
                if (failed) updateStatus();
                else renderResults();
            }
        }
    }

    more.addEventListener('click', () => load(true));
    retry.addEventListener('click', () => {
        if (!loading) load(Boolean(nextPageToken));
    });

    function setMode(usePublic) {
        publicMode = usePublic;
        root.classList.toggle(HIDDEN_CLASS, usePublic);
        body.hidden = !usePublic;
        filter.element.hidden = !usePublic;
        if (usePublic) {
            load();
        } else {
            controller?.abort();
            if (filter.trigger.getAttribute('aria-expanded') === 'true')
                filter.trigger.click();
        }
    }

    setMode(publicMode);
    return {
        update(nextQuery) {
            if (query === nextQuery) return;
            query = nextQuery;
            controller?.abort();
            resetResults();
            if (publicMode) load();
            else renderResults();
        },
        destroy() {
            controller?.abort();
            root.classList.remove(HIDDEN_CLASS);
            filter.destroy();
            section.remove();
        },
    };
}

function syncSearch() {
    const query = searchQuery();
    if (!enabled || !query) {
        observer?.disconnect();
        observer = null;
        view?.destroy();
        view = null;
        publicMode = false;
        return;
    }
    if (observer) {
        view?.update(query);
        return;
    }

    observer = observeElement(
        '#game-search-web-app',
        (root) => {
            const currentQuery = searchQuery();
            if (!enabled || !currentQuery) return;
            view = createSearchView(root, currentQuery);
        },
        {
            onRemove() {
                view?.destroy();
                view = null;
            },
        },
    );
}

export async function init() {
    if (initialized) return;
    initialized = true;
    enabled = (await settings[SETTING_NAME]) === true;
    syncSearch();
    window.addEventListener('rovalra:urlChanged', syncSearch);
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === SETTING_NAME) {
            enabled = event.detail.value === true;
            syncSearch();
        }
    });
}
