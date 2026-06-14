import { callRobloxApiJson } from '../../core/api.js';
import {
    getExperienceGuidelinesAgeRecommendationSummary,
    getUniversesDetails,
    getUniversesVotes,
} from '../../core/apis/games.js';
import { t } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import {
    isAuthenticatedUser13PlusAndAgeChecked,
    isAuthenticatedUserUnder16OrNotAgeChecked,
} from '../../core/utils/trackers/birthday.js';

const UNDERRATED_GAMES_TOPIC_ID = 10000013058;
const UNDERRATED_GAMES_SUB_ID = 'rovalra-underrated-games';
const DISCORD_MARKER = '__ROVALRA_UNDERRATED_GAMES_DISCORD__';
const DISCORD_LINK = 'https://discord.gg/YwpJFKr6Ww';
const DEFAULT_LOCALE = {
    topic: 'Underrated Games',
    subtitle: 'Underrated games hand picked by the RoValra community.',
    rotates: 'Rotates',
    suggestOnDiscord: `Suggest underrated games on ${DISCORD_MARKER}`,
    ageRestrictionWarning:
        "Some of these games may be locked to 16+ because of Roblox's 500 HEP requirement.",
};
const ROTATION_MARKER = '__ROVALRA_UNDERRATED_GAMES_ROTATION__';

let initialized = false;
let rotationExpiresAt = null;
let underratedGamesByUniverseId = new Map();
const maturitySummaryPromises = new Map();

async function getUnderratedGamesLocale() {
    const [is13Plus, showAgeRestrictionWarning] = await Promise.all([
        isAuthenticatedUser13PlusAndAgeChecked(),
        isAuthenticatedUserUnder16OrNotAgeChecked(),
    ]);
    try {
        return {
            topic: await t('underratedGames.topic'),
            subtitle: await t('underratedGames.subtitle'),
            rotates: await t('underratedGames.rotates'),
            suggestOnDiscord: await t('underratedGames.suggestOnDiscord', {
                discord: DISCORD_MARKER,
            }),
            ageRestrictionWarning: await t(
                'underratedGames.ageRestrictionWarning',
            ),
            is13Plus,
            showAgeRestrictionWarning,
        };
    } catch {
        return { ...DEFAULT_LOCALE, is13Plus, showAgeRestrictionWarning };
    }
}

function createUnderratedGamesSubtitle(locale) {
    let subtitle = locale.subtitle;
    if (rotationExpiresAt) {
        subtitle += ` ${locale.rotates} ${ROTATION_MARKER}`;
    }

    if (locale.showAgeRestrictionWarning) {
        subtitle += `\n${locale.ageRestrictionWarning}`;
    }

    if (locale.is13Plus) {
        subtitle += `\n${locale.suggestOnDiscord}`;
    }

    return subtitle;
}

function createUnderratedGamesSort(games, locale) {
    return {
        topic: locale.topic,
        subtitle: createUnderratedGamesSubtitle(locale),
        topicId: UNDERRATED_GAMES_TOPIC_ID,
        treatmentType: 'Carousel',
        games: games,
        recommendationList: games.map((game) => ({
            contentType: 'Game',
            contentId: game.universeId,
            contentStringId: '',
            contentMetadata: {
                Score: '1',
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
        .map((game) => {
            const universeId = Number(
                game?.universe_id || game?.universeId || game?.id,
            );
            const category =
                typeof game?.category === 'string' ? game.category.trim() : '';

            return {
                ...game,
                universeId,
                universe_id: universeId,
                name: game.name || '',
                rootPlaceId: Number(
                    game.root_place_id || game.rootPlaceId || 0,
                ),
                playerCount: Number(
                    game.player_count || game.playerCount || game.playing || 0,
                ),
                totalUpVotes: Number(
                    game.total_up_votes ||
                        game.totalUpVotes ||
                        game.upVotes ||
                        0,
                ),
                totalDownVotes: Number(
                    game.total_down_votes ||
                        game.totalDownVotes ||
                        game.downVotes ||
                        0,
                ),
                contentMaturity: game.contentMaturity || 'minimal',
                ageRecommendationDisplayName:
                    game.ageRecommendationDisplayName || 'Maturity: Minimal',
                primaryMediaAsset: game.primaryMediaAsset || {},
                category,

                layoutDataBySort: {
                    [UNDERRATED_GAMES_TOPIC_ID]: {
                        title: game.name || '',
                        primaryMediaAsset: {
                            wideImageAssetId:
                                game.wide_image_asset_id ||
                                game.wideImageAssetId ||
                                '0',
                            wideImageListId: '0',
                        },
                    },
                },
            };
        })
        .filter((game) => {
            if (!Number.isSafeInteger(game.universeId)) return false;
            if (seenUniverseIds.has(game.universeId)) return false;

            seenUniverseIds.add(game.universeId);
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
    if (
        !root.textContent?.includes(ROTATION_MARKER) &&
        !root.textContent?.includes(DISCORD_MARKER)
    ) {
        return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const val = node.nodeValue;
            return val.includes(ROTATION_MARKER) || val.includes(DISCORD_MARKER)
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
        const parent = node.parentNode;
        if (parent && node.nodeValue.includes('\n')) {
            parent.style.whiteSpace = 'pre-wrap';
            parent.style.display = 'block';
        }

        const fragment = document.createDocumentFragment();
        const regex = new RegExp(
            `(${ROTATION_MARKER}|${DISCORD_MARKER}|\\n)`,
            'g',
        );
        const parts = node.nodeValue.split(regex);

        parts.forEach((part) => {
            if (part === ROTATION_MARKER) {
                if (rotationExpiresAt) {
                    const timestamp =
                        createInteractiveTimestamp(rotationExpiresAt);
                    timestamp.classList.add(
                        'rovalra-underrated-games-rotation',
                    );
                    fragment.appendChild(timestamp);
                }
            } else if (part === DISCORD_MARKER) {
                const link = document.createElement('a');
                link.href = DISCORD_LINK;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Discord';
                link.style.color = 'var(--rovalra-playbutton-color)';
                link.style.textDecoration = 'underline';
                link.style.fontWeight = '600';
                link.addEventListener('click', (e) => e.stopPropagation());
                fragment.appendChild(link);
            } else if (part === '\n') {
                fragment.appendChild(document.createElement('br'));
            } else if (part) {
                fragment.append(part);
            }
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

    let games = normalizeUnderratedGames(data.games);
    if (!games.length) return null;

    const sample = games[0];
    if (!sample.name || !sample.rootPlaceId) {
        try {
            const universeIds = games.map((g) => g.universeId);
            const [details, votes] = await Promise.all([
                getUniversesDetails(universeIds),
                getUniversesVotes(universeIds),
            ]);

            if (Array.isArray(details)) {
                const detailsMap = new Map(details.map((d) => [d.id, d]));
                const votesMap = new Map(
                    Array.isArray(votes)
                        ? votes.map((v) => [v.universeId, v])
                        : [],
                );

                games = games.map((game) => {
                    const detail = detailsMap.get(game.universeId);
                    const vote = votesMap.get(game.universeId);

                    return {
                        ...game,
                        ...(detail || {}),
                        ...(vote || {}),
                    };
                });

                games = normalizeUnderratedGames(games);
            }
        } catch (error) {
            console.warn(
                'RoValra: failed to fetch underrated game details',
                error,
            );
        }
    }

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
