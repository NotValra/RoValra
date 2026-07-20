import { getUniversesDetails } from '../../core/apis/games.js';
import { formatPlayerCount } from '../../core/games/playerCount.js';
import { getUniverseIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';

const STATS_FOOTER_SELECTORS = [
    '[data-testid="wide-game-tile"] [data-testid="game-tile-stats-rating"]',
    '[data-testid="wide-game-tile"] [data-testid="wide-game-tile-sponsored-footer"]',
];
const STATS_FOOTER_SELECTOR = STATS_FOOTER_SELECTORS.join(', ');
const RATING_LABEL_SELECTOR = [
    `${STATS_FOOTER_SELECTORS[0]} > .vote-percentage-label`,
    `${STATS_FOOTER_SELECTORS[1]} > span.secondary-content:not(.bullet) .vote-percentage-label`,
].join(', ');
const STATS_READY_CLASS = 'rovalra-wide-game-tile-stats-ready';
const API_BATCH_SIZE = 50;
const statsCache = new Map();
const pendingStats = new Map();
let batchQueued = false;
let initialized = false;

function createIcon(className) {
    const icon = document.createElement('span');
    icon.className = `info-label ${className}`;
    return icon;
}

function createLabel(className, text, title) {
    const label = document.createElement('span');
    label.className = `info-label ${className}`;
    label.textContent = text;
    if (title) label.title = title;
    return label;
}

function createStats(ratingText, playerCount) {
    return [
        createIcon('icon-votes-gray'),
        createLabel('vote-percentage-label', ratingText),
        createIcon('icon-playing-counts-gray'),
        createLabel(
            'playing-counts-label',
            formatPlayerCount(playerCount),
            playerCount.toLocaleString(),
        ),
    ];
}

function createSponsoredStats(
    adText,
    separatorText,
    ratingText,
    playerCount,
) {
    const sponsoredStats = document.createElement('span');
    sponsoredStats.className = 'rovalra-wide-game-tile-sponsored-stats';
    sponsoredStats.append(
        createLabel('rovalra-wide-game-tile-sponsored-label', adText),
        createLabel(
            'rovalra-wide-game-tile-sponsored-separator',
            separatorText,
        ),
        ...createStats(ratingText, playerCount),
    );
    return sponsoredStats;
}

function getRatingText(stats) {
    const rating = stats
        .querySelector('.vote-percentage-label')
        ?.textContent?.match(/\d+(?:[.,]\d+)?%/);

    return rating?.[0] || null;
}

function addStats(stats, playerCount) {
    if (!stats.isConnected) return;

    const ratingText = getRatingText(stats);
    if (!ratingText) return;

    if (stats.dataset.testid === 'wide-game-tile-sponsored-footer') {
        const adLabel = stats.querySelector(':scope > .sponsored-ad-label');
        const separator = stats.querySelector(
            ':scope > .bullet.secondary-content',
        );
        const secondaryStats = stats.querySelector(
            ':scope > span.secondary-content:not(.bullet)',
        );
        if (!adLabel || !separator || !secondaryStats) return;

        const sponsoredStats = createSponsoredStats(
            adLabel.textContent,
            separator.textContent,
            ratingText,
            playerCount,
        );
        adLabel.replaceWith(sponsoredStats);
        separator.remove();
        secondaryStats.remove();
    } else {
        stats.replaceChildren(...createStats(ratingText, playerCount));
    }

    stats.classList.add(STATS_READY_CLASS);
}

async function loadPendingStats() {
    batchQueued = false;

    const entries = [...pendingStats.entries()];
    pendingStats.clear();

    for (let index = 0; index < entries.length; index += API_BATCH_SIZE) {
        const batch = entries.slice(index, index + API_BATCH_SIZE);
        const universeIds = batch.map(([universeId]) => universeId);
        const details = await getUniversesDetails(universeIds);
        const detailsById = new Map(
            details.map((game) => [String(game.id), game]),
        );

        for (const [universeId, statsElements] of batch) {
            const game = detailsById.get(universeId);
            if (!game) continue;

            const playerCount = Number(game.playing);
            if (!Number.isFinite(playerCount)) continue;

            statsCache.set(universeId, playerCount);
            statsElements.forEach((stats) => {
                if (getStatsUniverseId(stats) === universeId) {
                    addStats(stats, playerCount);
                }
            });
        }
    }
}

function getStatsUniverseId(stats) {
    const gameLink = stats.closest('a.game-card-link');
    return gameLink ? getUniverseIdFromUrl(gameLink.href) : null;
}

function queueStats(ratingLabel) {
    const stats = ratingLabel.closest(STATS_FOOTER_SELECTOR);
    if (!stats) return;

    if (
        stats.classList.contains(STATS_READY_CLASS) &&
        stats.querySelector('.playing-counts-label')
    ) {
        return;
    }

    const universeId = getStatsUniverseId(stats);
    if (!universeId) return;

    if (statsCache.has(universeId)) {
        addStats(stats, statsCache.get(universeId));
        return;
    }

    if (!pendingStats.has(universeId)) {
        pendingStats.set(universeId, new Set());
    }
    pendingStats.get(universeId).add(stats);

    if (batchQueued) return;
    batchQueued = true;
    queueMicrotask(loadPendingStats);
}

export async function init() {
    if (initialized) return;
    initialized = true;

    if (!(await settings.wideGameTileStatsEnabled)) return;

    observeElement(RATING_LABEL_SELECTOR, queueStats, {
        multiple: true,
    });
}
