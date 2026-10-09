import { callRobloxApiJson } from '../../core/api.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { t, ts } from '../../core/locale/i18n.js';
import { observeChildren, observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createButton } from '../../core/ui/buttons.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';

const SETTING = 'SearchProfileExperiencesEnabled';
const HEADER_SELECTOR = [
    '.profile-experiences.profile-game .container-header',
    '.btr-profile-right .profile-game .container-header',
    '.placeholder-games .container-header',
].join(',');

const CACHE_TTL_MS = 5 * 60 * 1000;
const API_PAGE_SIZE = 50;
const RESULT_PAGE_SIZE = 24;
const MAX_API_PAGES = 200;
const GROUP_CONCURRENCY = 3;

const cache = new Map();
const inFlight = new Map();
const observedHeaders = new WeakSet();
const TRIGGER_CLASS = 'rovalra-profile-experience-search-trigger';
let enabled = false;
let initialized = false;
let activeOverlay = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(subdomain, endpoint) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await callRobloxApiJson({
                subdomain,
                endpoint,
                method: 'GET',
            });
        } catch (error) {
            if (error?.status !== 429 || attempt === 2) throw error;
            await sleep(750 * 2 ** attempt);
        }
    }
    throw new Error('Unable to retrieve experiences');
}

function normalizeGame(game, creatorType, creatorId) {
    const id = Number(game?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;

    return {
        id,
        name: String(game?.name || ''),
        creatorType,
        creatorId,
    };
}

async function getCreatorGames(type, creatorId) {
    const entries = [];
    const seenCursors = new Set();
    let cursor = '';

    try {
        for (let page = 0; page < MAX_API_PAGES; page++) {
            const params = new URLSearchParams({
                accessFilter: '2',
                limit: String(API_PAGE_SIZE),
                sortOrder: 'Asc',
            });
            if (cursor) params.set('cursor', cursor);

            const path = type === 'User'
                ? `/v2/users/${creatorId}/games`
                : `/v2/groups/${creatorId}/gamesV2`;

            const result = await getJson('games', `${path}?${params}`);
            if (!Array.isArray(result?.data)) {
                throw new Error('Unexpected experience list response');
            }

            for (const game of result.data) {
                const item = normalizeGame(game, type, creatorId);
                if (item) entries.push(item);
            }

            const next = result.nextPageCursor;
            if (!next) return { entries, failed: false };
            if (seenCursors.has(next)) {
                throw new Error('Repeated experience pagination cursor');
            }

            seenCursors.add(next);
            cursor = next;
        }
        throw new Error('Experience pagination limit reached');
    } catch (error) {
        console.warn('RoValra: Experience search source failed', error);
        return { entries, failed: true };
    }
}

async function getOwnedGroupIds(userId) {
    const result = await getJson(
        'groups',
        `/v1/users/${userId}/groups/roles?includeLocked=true`,
    );

    if (!Array.isArray(result?.data)) {
        throw new Error('Unexpected group membership response');
    }

    return [...new Set(result.data
        .filter((entry) =>
            Number(entry?.role?.rank) === 255 ||
            Number(entry?.group?.owner?.id ?? entry?.group?.owner?.userId) ===
                Number(userId),
        )
        .map((entry) => Number(entry?.group?.id))
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

async function collectExperiences(userId) {
    const gamesById = new Map();
    let incomplete = false;
    const addResults = ({ entries, failed }) => {
        if (failed) incomplete = true;
        for (const item of entries) {
            if (!gamesById.has(item.id)) gamesById.set(item.id, item);
        }
    };

    const userGamesPromise = getCreatorGames('User', userId);
    const ownedGroupsPromise = getOwnedGroupIds(userId).catch((error) => {
        incomplete = true;
        console.warn('RoValra: Unable to load owned groups', error);
        return [];
    });

    addResults(await userGamesPromise);
    const groupIds = await ownedGroupsPromise;

    for (let index = 0; index < groupIds.length; index += GROUP_CONCURRENCY) {
        const batch = groupIds.slice(index, index + GROUP_CONCURRENCY);
        const results = await Promise.all(
            batch.map((id) => getCreatorGames('Group', id)),
        );
        results.forEach(addResults);
    }

    return { games: [...gamesById.values()], incomplete };
}

function loadExperiences(userId) {
    const saved = cache.get(userId);
    if (saved && Date.now() < saved.expiresAt) {
        return Promise.resolve(saved.value);
    }
    if (inFlight.has(userId)) return inFlight.get(userId);

    const request = collectExperiences(userId)
        .then((result) => {
            if (!result.incomplete) {
                cache.set(userId, {
                    value: result,
                    expiresAt: Date.now() + CACHE_TTL_MS,
                });
            }
            return result;
        })
        .finally(() => inFlight.delete(userId));

    inFlight.set(userId, request);
    return request;
}

async function openExperienceSearch() {
    const userId = getUserIdFromUrl();
    if (!userId) return;

    if (activeOverlay?.userId === userId) {
        activeOverlay.input.focus();
        return;
    }
    activeOverlay?.close();

    const [title, placeholder, loadMoreText, emptyText, loadingText, errorText] =
        await Promise.all([
            t('profileExperienceSearch.title'),
            t('profileExperienceSearch.placeholder'),
            t('profileExperienceSearch.loadMore'),
            t('profileExperienceSearch.noResults'),
            t('profileExperienceSearch.loading'),
            t('profileExperienceSearch.incomplete'),
        ]);

    if (getUserIdFromUrl() !== userId) return;

    const body = document.createElement('div');
    body.className = 'rovalra-profile-experience-search';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'rovalra-profile-experience-search-input';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    input.autocomplete = 'off';

    const status = document.createElement('p');
    status.className = 'rovalra-profile-experience-search-status';
    status.setAttribute('role', 'status');
    status.textContent = loadingText;

    const grid = document.createElement('div');
    grid.className = 'rovalra-profile-experience-search-grid';

    const more = createButton(loadMoreText, 'secondary');
    more.classList.add('rovalra-profile-experience-search-more');
    more.hidden = true;

    body.append(input, status, grid, more);

    let closed = false;
    let debounceId = null;
    let allGames = [];
    let visibleCount = RESULT_PAGE_SIZE;
    let incomplete = false;

    createOverlay({
        title,
        bodyContent: body,
        maxWidth: '1000px',
        maxHeight: '85vh',
        onClose: () => {
            closed = true;
            clearTimeout(debounceId);
            if (activeOverlay?.userId === userId) activeOverlay = null;
        },
    });

    const draw = () => {
        if (closed || getUserIdFromUrl() !== userId) return;
        const term = input.value.trim().toLocaleLowerCase();
        const filtered = allGames.filter((game) =>
            game.name.toLocaleLowerCase().includes(term),
        );

        grid.replaceChildren();
        for (const game of filtered.slice(0, visibleCount)) {
            grid.appendChild(createGameCard({
                gameId: game.id,
                showVotes: false,
                showPlayers: false,
            }));
        }

        more.hidden = filtered.length <= visibleCount;
        status.textContent = incomplete
            ? errorText
            : filtered.length === 0 ? emptyText : '';
    };

    input.addEventListener('input', () => {
        clearTimeout(debounceId);
        debounceId = setTimeout(() => {
            visibleCount = RESULT_PAGE_SIZE;
            if (allGames.length || !status.textContent.includes(loadingText)) {
                draw();
            }
        }, 120);
    });

    more.addEventListener('click', () => {
        visibleCount += RESULT_PAGE_SIZE;
        draw();
    });

    activeOverlay = { userId, input, close };
    input.focus();

    try {
        const result = await loadExperiences(userId);
        if (closed || getUserIdFromUrl() !== userId) return;
        allGames = result.games;
        incomplete = result.incomplete;
        draw();
    } catch (error) {
        console.warn('RoValra: Experience search failed', error);
        if (!closed) status.textContent = errorText;
    }
}

function isSearchButton(element) {
    const label = [
        element.getAttribute('aria-label'),
        element.textContent,
    ].filter(Boolean).join(' ').trim();

    return /\bsearch experiences\b/i.test(label);
}


function syncSearchButton(header) {
    if (!header.isConnected) return;

    const existing = header.querySelector(`.${TRIGGER_CLASS}`);

    if (!enabled) {
        existing?.remove();
        return;
    }

    const nativeButton = [...header.querySelectorAll(
        'button, a, [role="button"]',
    )].find(
        (button) =>
            !button.classList.contains(TRIGGER_CLASS) &&
            isSearchButton(button),
    );

    if (nativeButton) {
        existing?.remove();
        return;
    }

    if (existing) return;

    const button = createButton(
        ts('profileExperienceSearch.title'),
        'secondary',
    );

    button.classList.add(TRIGGER_CLASS);

    const controls = header.querySelector('.container-buttons');

    if (controls?.parentElement === header) {
        header.insertBefore(button, controls);
    } else {
        header.appendChild(button);
    }
}

function attachToHeader(header) {
    if (observedHeaders.has(header)) return;
    observedHeaders.add(header);

    header.addEventListener('click', (event) => {
        if (!enabled || !(event.target instanceof Element)) return;

        const button = event.target.closest(
            'button, a, [role="button"]',
        );

        if (!button || !header.contains(button)) return;

        if (
            !button.classList.contains(TRIGGER_CLASS) &&
            !isSearchButton(button)
        ) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        openExperienceSearch().catch((error) => {
            console.warn(
                'RoValra: Unable to open experience search',
                error,
            );
        });
    }, true);

    observeChildren(header, () => syncSearchButton(header));

    syncSearchButton(header);
}

export async function init() {
    if (initialized) return;
    initialized = true;

    enabled = (await settings[SETTING]) === true;

    observeElement(HEADER_SELECTOR, attachToHeader, { multiple: true });

    document.addEventListener('rovalra:settingSaved', (event) => {
        if (event.detail?.name !== SETTING) return;
        enabled = event.detail.value === true;

        document.querySelectorAll(HEADER_SELECTOR)
            .forEach(syncSearchButton);

        if (!enabled) activeOverlay?.close();
    });
}
