import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';

const UNDERRATED_GAMES_TOPIC = 'Underrated Games';
const UNDERRATED_GAMES_TOPIC_ID = 10000013058;
const UNDERRATED_GAMES_SUB_ID = 'rovalra-underrated-games';
const UNDERRATED_GAMES_SUBTITLE =
    'Underrated games hand picked by the RoValra community.';
const ROTATION_MARKER = '__ROVALRA_UNDERRATED_GAMES_ROTATION__';

let initialized = false;
let rotationExpiresAt = null;

function createUnderratedGamesSubtitle() {
    if (!rotationExpiresAt) return UNDERRATED_GAMES_SUBTITLE;

    return `${UNDERRATED_GAMES_SUBTITLE} Rotates ${ROTATION_MARKER}`;
}

function createUnderratedGamesSort(games) {
    return {
        topic: UNDERRATED_GAMES_TOPIC,
        subtitle: createUnderratedGamesSubtitle(),
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

    const rotationDate = new Date(data.rotation_expires_at);
    rotationExpiresAt = Number.isNaN(rotationDate.getTime())
        ? null
        : rotationDate.toISOString();

    return createUnderratedGamesSort(games);
}

export function init() {
    if (initialized) return;
    initialized = true;

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
        })
        .catch((error) => {
            console.warn('RoValra: underrated games failed to load', error);
        });
}
