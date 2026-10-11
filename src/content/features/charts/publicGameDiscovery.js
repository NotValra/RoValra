import { callRobloxApiJson } from '../../core/api.js';
import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createButton } from '../../core/ui/buttons.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';
import { createOverlay } from '../../core/ui/overlay.js';

const SETTING_NAME = 'publicGameDiscoveryEnabled';
const BUTTON_ID = 'rovalra-public-game-discovery';
const MATURITIES = ['minimal', 'mild', 'moderate', 'restricted'];

let initialized = false;
let observer = null;
let browser = null;

function openBrowser(trigger) {
    if (browser) return;

    const body = document.createElement('div');
    body.className = 'rovalra-public-game-browser';
    const notice = document.createElement('p');
    notice.textContent = ts('publicGameDiscovery.notice');

    const form = document.createElement('form');
    form.className = 'rovalra-public-game-search';
    const search = createStyledInput({
        id: 'rovalra-public-game-query',
        label: ts('common.search'),
    });
    search.input.maxLength = 200;
    const submit = createButton(ts('common.search'), 'primary');
    submit.type = 'submit';
    form.append(search.container, submit);

    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const grid = document.createElement('div');
    grid.className = 'rovalra-public-game-grid';
    const more = createButton(ts('publicGameDiscovery.loadMore'));
    more.type = 'button';
    more.hidden = true;

    const games = new Map();
    const stats = {
        likes: new Map(),
        players: new Map(),
        thumbnails: new Map(),
    };
    const sessionId = crypto.randomUUID();
    let maturity = 'all';
    let query = '';
    let nextPageToken = '';
    let controller = null;
    let loading = false;
    let failed = false;

    function render() {
        grid.replaceChildren();
        for (const game of games.values()) {
            if (maturity !== 'all' && game.contentMaturity !== maturity)
                continue;

            const card = createGameCard({ game, stats });
            const label = document.createElement('div');
            label.className = 'rovalra-public-game-maturity';
            label.textContent = ts('publicGameDiscovery.maturityLabel', {
                maturity: ts(
                    `publicGameDiscovery.maturities.${MATURITIES.includes(game.contentMaturity) ? game.contentMaturity : 'unknown'}`,
                ),
            });
            card.querySelector('.game-card-link').appendChild(label);
            grid.appendChild(card);
        }
        let statusKey = 'empty';
        if (loading) statusKey = 'loading';
        else if (failed) statusKey = 'error';
        else if (grid.childElementCount) {
            statusKey = query ? 'searchResults' : 'popularGames';
        }
        status.textContent = ts(`publicGameDiscovery.${statusKey}`);
        grid.setAttribute('aria-busy', String(loading));
        more.hidden = !nextPageToken;
        more.disabled = loading;
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
            render();
        },
    });
    filter.trigger.setAttribute(
        'aria-label',
        ts('publicGameDiscovery.maturity'),
    );
    body.append(notice, form, filter.element, status, grid, more);

    async function load(append = false) {
        if (append && loading) return;
        controller?.abort();
        controller = new AbortController();
        const { signal } = controller;
        if (!append) {
            query = search.input.value.trim();
            games.clear();
            stats.likes.clear();
            stats.players.clear();
            stats.thumbnails.clear();
            nextPageToken = '';
        }
        loading = true;
        failed = false;
        render();

        const params = new URLSearchParams({ sessionId });
        let endpoint = '/explore-api/v1/get-sort-content';
        if (query) {
            endpoint = '/search-api/omni-search';
            params.set('searchQuery', query);
            params.set('pageType', 'all');
            params.set('pageToken', nextPageToken);
        } else {
            params.set('sortId', 'top-playing-now');
        }

        try {
            // Public discovery never uses the account's credentials or play endpoints.
            const data = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `${endpoint}?${params}`,
                credentials: 'omit',
                signal,
                noCache: true,
            });
            if (signal.aborted) return;
            const results = query
                ? data.searchResults?.flatMap((group) =>
                      group.contentGroupType === 'Game' &&
                      Array.isArray(group.contents)
                          ? group.contents
                          : [],
                  )
                : data.games;
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
                validGames.map((game) => ({ id: game.universeId })),
                'GameIcon',
                '150x150',
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
                stats.thumbnails.set(game.id, thumbnails.get(game.id));
            }
            nextPageToken =
                query && typeof data.nextPageToken === 'string'
                    ? data.nextPageToken
                    : '';
        } catch (error) {
            if (signal.aborted) return;
            failed = true;
            console.warn('RoValra: Public game discovery failed.', error);
        } finally {
            if (!signal.aborted) {
                loading = false;
                render();
            }
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        load();
    });
    more.addEventListener('click', () => load(true));
    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            browser?.close();
        } else if (event.key === 'Tab') {
            const focusable = [
                ...dialog.querySelectorAll('button, input, a[href]'),
            ]
                .flatMap((element) =>
                    element === filter.trigger
                        ? [element, ...filter.panel.querySelectorAll('button')]
                        : [element],
                )
                .filter(
                    (element) =>
                        !element.disabled && element.getClientRects().length,
                );
            if (!focusable.length) return;
            const index = focusable.indexOf(document.activeElement);
            const next = event.shiftKey
                ? index <= 0
                    ? focusable.length - 1
                    : index - 1
                : (index + 1) % focusable.length;
            event.preventDefault();
            focusable[next].focus();
        }
    };
    browser = createOverlay({
        title: ts('publicGameDiscovery.title'),
        bodyContent: body,
        maxWidth: '900px',
        onClose() {
            controller?.abort();
            filter.destroy();
            document.removeEventListener('keydown', onKeyDown);
            browser = null;
            if (trigger.isConnected) trigger.focus();
        },
    });
    const dialog = browser.overlay.querySelector('[role="dialog"]');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', ts('publicGameDiscovery.title'));
    document.addEventListener('keydown', onKeyDown);
    search.input.focus();
    load();
}

function setEnabled(enabled) {
    observer?.disconnect();
    observer = null;
    document.getElementById(BUTTON_ID)?.remove();
    browser?.close();
    if (!enabled) return;

    observer = observeElement(
        '#game-carousel-web-app',
        (root) => {
            if (
                !/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/(?:charts|discover)\/?$/i.test(
                    location.pathname,
                )
            )
                return;
            const button = createButton(
                ts('publicGameDiscovery.title'),
                'secondary',
                {
                    id: BUTTON_ID,
                },
            );
            button.type = 'button';
            button.addEventListener('click', () => openBrowser(button));
            root.before(button);
        },
        {
            onRemove() {
                document.getElementById(BUTTON_ID)?.remove();
                browser?.close();
            },
        },
    );
}

export async function init() {
    if (initialized) return;
    initialized = true;
    setEnabled((await settings[SETTING_NAME]) === true);
    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name === SETTING_NAME) {
            setEnabled(event.detail.value === true);
        }
    });
}
