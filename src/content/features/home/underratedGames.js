import { callRobloxApiJson } from '../../core/api.js';
import { getExperienceGuidelinesAgeRecommendationSummary } from '../../core/apis/games.js';
import { t } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';

const UNDERRATED_GAMES_TOPIC_ID = 10000013058;
const UNDERRATED_GAMES_SUB_ID = 'rovalra-underrated-games';
const DEFAULT_LOCALE = {
    topic: 'Underrated Games',
    subtitle: 'Underrated games hand picked by the RoValra community.',
    rotates: 'Rotates',
};
const ROTATION_MARKER = '__ROVALRA_UNDERRATED_GAMES_ROTATION__';

let initialized = false;
let rotationExpiresAt = null;
let underratedGamesByUniverseId = new Map();
const maturitySummaryPromises = new Map();

async function getUnderratedGamesLocale() {
    try {
        return {
            topic: await t('underratedGames.topic'),
            subtitle: await t('underratedGames.subtitle'),
            rotates: await t('underratedGames.rotates'),
        };
    } catch {
        return DEFAULT_LOCALE;
    }
}

function createUnderratedGamesSubtitle(locale) {
    if (!rotationExpiresAt) return locale.subtitle;

    return `${locale.subtitle} ${locale.rotates} ${ROTATION_MARKER}`;
}

function createUnderratedGamesSort(games, locale) {
    return {
        topic: locale.topic,
        subtitle: createUnderratedGamesSubtitle(locale),
        topicId: UNDERRATED_GAMES_TOPIC_ID,
        treatmentType: 'Carousel',
        recommendationList: games.map((game) => ({
            contentType: 'Game',
            contentId: game.universe_id,
            contentStringId: '',
            contentMetadata: {
                Score: '1',
                ...(game.category ? { Category: game.category } : {}),
            },
            analyticsData: {},
        })),
        nextPageTokenForTopic: null,
        numberOfRows: 1,
        topicLayoutData: {
            componentType: 'EventTile',
            hideSeeAll: 'true',
            linkPath: '',
            CampaignKey: 'Experiment_SortPosition_Worldwide',
        },
        analyticsData: {},
        subId: UNDERRATED_GAMES_SUB_ID,
    };
}

function getVisibleCategories(category) {
    if (typeof category !== 'string') return [];

    return category
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value && value.toLowerCase() !== 'other')
        .slice(0, 3);
}

function normalizeUnderratedGames(games) {
    if (!Array.isArray(games)) return [];

    const seenUniverseIds = new Set();
    return games
        .map((game) => ({
            category:
                typeof game?.category === 'string' ? game.category.trim() : '',
            universe_id: Number(game?.universe_id),
        }))
        .filter((game) => {
            if (!Number.isSafeInteger(game.universe_id)) return false;
            if (seenUniverseIds.has(game.universe_id)) return false;

            seenUniverseIds.add(game.universe_id);
            return true;
        });
}

function getUnderratedGameFromLink(link) {
    if (!link?.href) return null;

    try {
        const url = new URL(link.href, window.location.origin);
        if (url.searchParams.get('sortSubId') !== UNDERRATED_GAMES_SUB_ID) {
            return null;
        }

        const universeId =
            Number(url.searchParams.get('universeId')) ||
            Number(link.closest('[id]')?.id);
        if (!Number.isSafeInteger(universeId)) return null;

        return underratedGamesByUniverseId.get(universeId) || null;
    } catch {
        return null;
    }
}

function getMaturitySummary(universeId) {
    const cacheKey = String(universeId);
    if (!maturitySummaryPromises.has(cacheKey)) {
        maturitySummaryPromises.set(
            cacheKey,
            getExperienceGuidelinesAgeRecommendationSummary(universeId).catch(
                (error) => {
                    console.warn(
                        'RoValra: failed to load underrated game maturity',
                        error,
                    );
                    return null;
                },
            ),
        );
    }

    return maturitySummaryPromises.get(cacheKey);
}

function formatMaturityLabel(summary) {
    if (summary?.contentMaturity) {
        return (
            summary.contentMaturity.charAt(0).toUpperCase() +
            summary.contentMaturity.slice(1)
        );
    }

    return summary?.displayName || '';
}

function addCategoryPill(link, game) {
    const categories = getVisibleCategories(game.category);
    if (!categories.length) return;

    const thumbnailContainer = link.querySelector(
        '.featured-game-icon-container',
    );
    if (!thumbnailContainer) return;

    const existingPill = thumbnailContainer.querySelector(
        '.rovalra-underrated-games-tags-pill',
    );
    const categoryText = categories.join(', ');

    if (existingPill) {
        existingPill.textContent = categoryText;
        existingPill.title = categoryText;
        return;
    }

    const pill = document.createElement('span');
    pill.className = 'rovalra-underrated-games-tags-pill';
    pill.textContent = categoryText;
    pill.title = categoryText;
    thumbnailContainer.appendChild(pill);
}

function addMaturityRating(link, game) {
    const ratingLabel = link.querySelector(
        '[data-testid="game-tile-stats-rating"] .info-label',
    );
    if (!ratingLabel || ratingLabel.dataset.rovalraMaturityLoading === 'true') {
        return;
    }

    const existingMaturity = ratingLabel.querySelector(
        '.rovalra-underrated-games-maturity-rating',
    );
    if (existingMaturity) return;

    ratingLabel.dataset.rovalraMaturityLoading = 'true';

    getMaturitySummary(game.universe_id).then((summary) => {
        ratingLabel.dataset.rovalraMaturityLoading = 'false';
        if (!document.body.contains(ratingLabel)) return;
        if (
            ratingLabel.querySelector(
                '.rovalra-underrated-games-maturity-rating',
            )
        ) {
            return;
        }

        const maturityLabel = formatMaturityLabel(summary);
        if (!maturityLabel) return;

        const maturity = document.createElement('span');
        maturity.className = 'rovalra-underrated-games-maturity-rating';

        const separator = document.createElement('span');
        separator.className = 'rovalra-underrated-games-maturity-separator';
        separator.textContent = ' ・ ';

        maturity.append(separator, maturityLabel);
        ratingLabel.appendChild(maturity);
    });
}

function enhanceUnderratedGameTile(link) {
    const game = getUnderratedGameFromLink(link);
    if (!game) return;

    addCategoryPill(link, game);
    addMaturityRating(link, game);
}

function publishUnderratedGamesSort(sort) {
    document.dispatchEvent(
        new CustomEvent('rovalra-home-extra-sorts', {
            detail: { sorts: [sort] },
        }),
    );
}

function replaceRotationMarker(root) {
    if (!rotationExpiresAt || !root.textContent?.includes(ROTATION_MARKER)) {
        return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.nodeValue.includes(ROTATION_MARKER)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
    const markerNodes = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
        markerNodes.push(currentNode);
        currentNode = walker.nextNode();
    }

    markerNodes.forEach((node) => {
        const fragment = document.createDocumentFragment();
        const parts = node.nodeValue.split(ROTATION_MARKER);

        parts.forEach((part, index) => {
            if (part) fragment.append(part);
            if (index === parts.length - 1) return;

            const timestamp = createInteractiveTimestamp(rotationExpiresAt);
            timestamp.classList.add('rovalra-underrated-games-rotation');
            fragment.appendChild(timestamp);
        });

        node.parentNode?.replaceChild(fragment, node);
    });
}

async function loadUnderratedGames() {
    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: '/v1/games/underrated',
        isRovalraApi: true,
    });

    if (data?.status !== 'success') return null;

    const games = normalizeUnderratedGames(data.games);
    if (!games.length) return null;
    underratedGamesByUniverseId = new Map(
        games.map((game) => [game.universe_id, game]),
    );

    const rotationDate = new Date(data.rotation_expires_at);
    rotationExpiresAt = Number.isNaN(rotationDate.getTime())
        ? null
        : rotationDate.toISOString();

    return createUnderratedGamesSort(games, await getUnderratedGamesLocale());
}

export async function init() {
    if (initialized) return;
    initialized = true;

    if ((await settings.underratedGamesEnabled) === false) return;

    loadUnderratedGames()
        .then((sort) => {
            if (!sort) return;

            publishUnderratedGamesSort(sort);
            if (document.body) replaceRotationMarker(document.body);
            observeElement(
                'a[data-testid="section-header-title-subtitle-container"], .game-sort-carousel-wrapper, .container-header, .game-sort-header-container',
                replaceRotationMarker,
                { multiple: true },
            );
            observeElement(
                `a.game-card-link[href*="sortSubId=${UNDERRATED_GAMES_SUB_ID}"]`,
                enhanceUnderratedGameTile,
                { multiple: true },
            );
        })
        .catch((error) => {
            console.warn('RoValra: underrated games failed to load', error);
        });
}
