import { callRobloxApiJson, callRobloxApi } from '../../core/api.js';
import {
    fetchThumbnails,
    createThumbnailElement,
    fetchPromotionalThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { createTab } from '../../core/ui/games/tab.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { getAssets } from '../../core/assets.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { init as initGameBanner } from '../../core/ui/games/banner.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import {
    getPlayabilityDisplayText,
    toStatusCode,
} from '../../core/games/playabilityStatus.js';
import { parseMarkdown } from '../../core/utils/markdown.js';
import { checkAndInjectEvents } from '../../features/games/about/events.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';

import { addTooltip } from '../../core/ui/tooltip.js';
function formatVoteCount(count) {
    count = Number(count) || 0;
    if (count >= 1000000) {
        return Math.floor(count / 1000000) + 'M+';
    } else if (count >= 1000) {
        return Math.floor(count / 1000) + 'K+';
    }
    return count.toLocaleString();
}

function slugifyGameName(name) {
    if (!name) return '-';
    return (
        name
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9\u00C0-\u024F-]/g, '')
            .toLowerCase() || '-'
    );
}

let hasLoaded = false;

export function init() {
    if (hasLoaded) return;
    hasLoaded = true;

    const scrollBtnStyle = document.createElement('style');
    scrollBtnStyle.innerHTML = `
        .rovalra-scroll-btn {
            position: absolute; z-index: 10; top: 50%; transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.6) !important; border-radius: 50%;
            width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
            border: none; cursor: pointer; color: white; opacity: 1; 
            transition: opacity 0.25s ease; pointer-events: auto;
        }
        .rovalra-scroll-btn.left { left: 5px; }
        .rovalra-scroll-btn.right { right: 5px; }
        .rovalra-scroll-btn.rovalra-btn-disabled { opacity: 0.25 !important; cursor: default; pointer-events: auto; }

        .game-details-carousel-container .carousel-item {
            opacity: 0;
            transition: opacity 0.6s ease;
            pointer-events: none;
        }
        .game-details-carousel-container .carousel-item-active {
            opacity: 1 !important;
            pointer-events: auto !important;
        }
    `;
    document.head.appendChild(scrollBtnStyle);

    chrome.storage.local.get({ privateGameDetectionEnabled: true }, (data) => {
        const privateUrlMatch = window.location.pathname.match(
            /^(?:\/[a-z]{2})?\/private-games\/(\d+)/,
        );

        if (!data.privateGameDetectionEnabled) {
            if (privateUrlMatch) {
                const content = document.getElementById('content');
                if (content) {
                    content.innerHTML = DOMPurify.sanitize(`
                        <div class="section-content default-error-page" style="max-width: 600px; margin: 60px auto; text-align: center; padding: 40px;">
                            <svg viewBox="0 0 24 24" style="width: 64px; height: 64px; margin-bottom: 24px; fill: var(--rovalra-secondary-text-color);"><path d="m5.2494 8.0688 2.83-2.8269 14.1343 14.15-2.83 2.8269zm4.2363-4.2415 2.828-2.8289 5.6577 5.656-2.828 2.8289zM.9989 12.3147l2.8284-2.8285 5.6569 5.6569-2.8285 2.8284zM1 21h12v2H1z"></path></svg>
                             <h3 style="margin-bottom: 20px;">${ts('privateGames.disabled')}</h3>
                            ${parseMarkdown(`${ts('privateGames.disabledDescription')}\n\n[${ts('privateGames.disabledLinkText')}](https://www.roblox.com/my/account?rovalra=search&q=privategamedetectionenabled#!/search)`)}
                        </div>
                    `);
                }
            }
            return;
        }

        if (privateUrlMatch) {
            const placeId = privateUrlMatch[1];
            loadPrivateGame(placeId);
            return;
        }

        const checkUrlMatch = window.location.pathname.match(
            /^(?:\/[a-z]{2})?\/games\/check\/(\d+)/,
        );
        if (checkUrlMatch) {
            const placeId = checkUrlMatch[1];
            const newUrl = `https://www.roblox.com/private-games/${placeId}`;
            window.location.replace(newUrl);
            return;
        }

        const isErrorPage =
            window.location.pathname.includes('/request-error') ||
            document.title.includes('Page not found') ||
            !!document.querySelector('.error-page-container');

        function handlePrivateRedirect(placeId) {
            if (!isErrorPage) return;
            const newUrl = `https://www.roblox.com/private-games/${placeId}`;
            window.history.replaceState({}, '', newUrl);
            loadPrivateGame(placeId);
        }

        chrome.runtime.sendMessage(
            { action: 'getPrivateGameRedirect' },
            (response) => {
                if (response && response.placeId) {
                    handlePrivateRedirect(response.placeId);
                    return;
                }

                chrome.runtime.sendMessage(
                    { action: 'getPrivateGameRedirect' },
                    (r2) => {
                        if (r2 && r2.placeId) handlePrivateRedirect(r2.placeId);
                    },
                );
            },
        );
    });
}

function loadPrivateGame(placeId) {
    if (!placeId) return;

    const content = document.getElementById('content');
    if (content && content.innerHTML.trim() === '') {
        content.innerHTML =
            '<div class="rovalra-banned-loading"><div class="spinner spinner-default"></div></div>';
    }

    chrome.storage.local.get({ privateGameDetectionEnabled: true }, (data) => {
        if (!data.privateGameDetectionEnabled) return;
        loadAndRenderPrivateGame(placeId, data);
    });
}

async function loadAndRenderPrivateGame(placeId, settings) {
    try {
        const placeDetails = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
        }).catch(() => null);

        const placeInfo = placeDetails?.[0];
        const universeId = placeInfo?.universeId;

        let gameData = createFallbackGame(placeDetails);
        gameData._placeId = placeId;

        const builderId = placeInfo?.builderId;
        const builderName = placeInfo?.builder;
        if (builderId && builderName) {
            callRobloxApiJson({
                subdomain: 'users',
                endpoint: `/v1/users/${builderId}`,
            })
                .then((userData) => {
                    const isUser = userData && userData.name === builderName;
                    gameData.creator.type = isUser ? 'User' : 'Group';
                    updateGameDataUpdated(gameData);
                    if (universeId) fetchVisitsForCreator(gameData, universeId);
                })
                .catch(() => {
                    gameData.creator.type = 'Group';
                    updateGameDataUpdated(gameData);
                    if (universeId) fetchVisitsForCreator(gameData, universeId);
                });
        }

        renderPrivateGamePage(gameData, placeId, settings);

        if (!universeId) {
            return;
        }

        callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-playability-status?universeIds=${universeId}`,
        })
            .then((playabilityData) => {
                if (playabilityData?.[0]) {
                    const statusRaw = playabilityData[0].playabilityStatus;
                    const statusCode = toStatusCode(statusRaw);

                    if (statusCode === 3 || statusCode === 9) {
                        gameData.playing = 0;
                    }

                    gameData._playabilityStatus = {
                        raw: statusRaw,
                        isPlayable: playabilityData[0].isPlayable || false,
                        displayText:
                            playabilityData[0].unplayableDisplayText || null,
                    };
                    showStatusBannerForPlayabilityStatus(
                        gameData._playabilityStatus,
                    );
                    updateGameDataUpdated(gameData);
                }
            })
            .catch((e) =>
                console.warn('RoValra: Failed to fetch playability status', e),
            );

        callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games?universeIds=1,${universeId}`,
        })
            .then((gameRes) => {
                const game = gameRes?.data?.find((g) => g.id === universeId);
                if (game) {
                    // Explicitly update only specific non-timestamp fields to ensure consistency
                    if (game.playing !== undefined && gameData.playing !== 0) {
                        gameData.playing = game.playing;
                    }

                    if (game.visits !== undefined) {
                        gameData.visits = game.visits;
                    }

                    if (game.genre_l1) {
                        gameData.genre = game.genre_l1
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase());
                    }
                    if (game.genre_l2) {
                        gameData.subgenre = game.genre_l2
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase());
                    }
                    updateGameDataUpdated(gameData);
                }
            })
            .catch(() => null);

        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/cloud/v2/universes/${universeId}`,
            useApiKey: true,
            useBackground: true,
        })
            .then((cloudData) => {
                gameData.ageRating = cloudData.ageRating || gameData.genre;
                gameData.voiceChatEnabled = cloudData.voiceChatEnabled || false;
                gameData._cloudData = cloudData;
                if (cloudData.displayName) {
                    gameData.name = cloudData.displayName;
                }
                if (cloudData.description !== undefined) {
                    gameData.description = cloudData.description;
                }
                updateGameDataUpdated(gameData);
            })
            .catch((e) =>
                console.warn(
                    'RoValra: Cloud API failed, using fallback data',
                    e,
                ),
            );

        callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/${universeId}/favorites/count`,
        })
            .then((favCountRes) => {
                if (favCountRes?.favoritesCount !== undefined) {
                    gameData.favoritedCount = favCountRes.favoritesCount;
                    updateGameDataUpdated(gameData);
                }
            })
            .catch((e) =>
                console.warn('RoValra: Failed to fetch favorites count', e),
            );

        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/cloud/v2/universes/${universeId}/places/${placeId}`,
            useApiKey: true,
            useBackground: true,
        })
            .then((placeCloudRes) => {
                if (placeCloudRes?.createTime) {
                    gameData.created = placeCloudRes.createTime;
                }
                if (placeCloudRes?.updateTime) {
                    gameData.updated = placeCloudRes.updateTime;
                }
                if (placeCloudRes?.serverSize !== undefined) {
                    gameData.maxPlayers = placeCloudRes.serverSize;
                }
                updateGameDataUpdated(gameData);
            })
            .catch((e) =>
                console.warn('RoValra: Failed to fetch place server size', e),
            );

        callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/${universeId}/favorites`,
        })
            .then((favRes) => {
                gameData.isFavoritedByUser = favRes?.isFavorited || false;
                updateFavoriteUI(gameData.isFavoritedByUser);
            })
            .catch((e) => {
                console.warn('RoValra: Failed to fetch favorites status');
                gameData.isFavoritedByUser = false;
            });

        const gameNameSlug = slugifyGameName(gameData.name);
        const desiredPath = `/private-games/${placeId}/${gameNameSlug}`;
        if (window.location.pathname !== desiredPath) {
            window.history.replaceState(
                { privateGameHandled: true },
                '',
                desiredPath,
            );
        }
    } catch (e) {
        console.error('RoValra: Failed to fetch info for private game', e);
        const fallbackGame = createFallbackGame(null);
        renderPrivateGamePage(fallbackGame, placeId, settings);
    }
}

function updateGameDataUpdated(gameData) {
    const updateText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    updateText(
        'rovalra-active-playing',
        gameData.playing !== null
            ? formatVoteCount(gameData.playing)
            : ts('privateGames.unknown'),
    );

    updateText(
        'rovalra-favorited-count',
        gameData.favoritedCount !== null
            ? formatVoteCount(gameData.favoritedCount)
            : ts('privateGames.unknown'),
    );

    updateText(
        'rovalra-visits-count',
        gameData.visits !== null
            ? formatVoteCount(gameData.visits)
            : ts('privateGames.unknown'),
    );

    updateText(
        'rovalra-max-players',
        gameData.maxPlayers !== null
            ? gameData.maxPlayers.toLocaleString()
            : ts('privateGames.unknown'),
    );

    updateText(
        'rovalra-genre-text',
        gameData.genre !== null ? gameData.genre : ts('privateGames.unknown'),
    );

    updateText(
        'rovalra-subgenre-text',
        gameData.subgenre !== null
            ? gameData.subgenre
            : ts('privateGames.unknown'),
    );

    const voiceChatEl = document.getElementById('rovalra-voice-chat-status');
    if (voiceChatEl) {
        voiceChatEl.textContent =
            gameData.voiceChatEnabled === true
                ? ts('privateGames.stats.supported')
                : gameData.voiceChatEnabled === false
                  ? ts('privateGames.stats.unsupported')
                  : ts('privateGames.unknown');
    }

    const createdEl = document.getElementById('rovalra-created-date');
    if (createdEl && gameData.created) {
        createdEl.innerHTML = '';
        createdEl.appendChild(createInteractiveTimestamp(gameData.created));
    }
    const updatedEl = document.getElementById('rovalra-updated-date');
    if (updatedEl && gameData.updated) {
        updatedEl.innerHTML = '';
        updatedEl.appendChild(createInteractiveTimestamp(gameData.updated));
    }

    const titleEl = document.querySelector('.game-name');
    if (titleEl && gameData.name) {
        titleEl.textContent = gameData.name;
        document.title = `${gameData.name} - Roblox`;
    }

    const descEl = document.querySelector('.game-description');
    if (descEl && gameData.description) {
        descEl.textContent = gameData.description;
    }

    const creatorLink = document.querySelector('.game-creator a.text-name');
    if (creatorLink && gameData.creator) {
        const typePath =
            gameData.creator.type === 'Group' ? 'communities' : 'users';
        creatorLink.href = `https://www.roblox.com/${typePath}/${gameData.creator.id}`;
    }
}

async function fetchVisitsForCreator(gameData, universeId) {
    if (!gameData.creator?.id || gameData.creator.id <= 0) return;

    const isGroup = gameData.creator.type === 'Group';
    const endpoint = isGroup
        ? `/v2/groups/${gameData.creator.id}/gamesV2?accessFilter=2&limit=50&sortOrder=Desc`
        : `/v2/users/${gameData.creator.id}/games?accessFilter=2&limit=50&sortOrder=Asc`;

    try {
        const res = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: endpoint,
        });

        if (res?.data && Array.isArray(res.data)) {
            const matchingGame = res.data.find((g) => g.id === universeId);
            if (matchingGame?.placeVisits !== undefined) {
                gameData.visits = matchingGame.placeVisits;
                updateGameDataUpdated(gameData);
            }
        }
    } catch (e) {
        console.warn('RoValra: Failed to fetch visit count from creator', e);
    }
}

function createFallbackGame(placeDetails) {
    const placeInfo = Array.isArray(placeDetails)
        ? placeDetails[0]
        : placeDetails;

    return {
        id: placeInfo?.universeId || 0,
        universeId: placeInfo?.universeId || 0,
        name: placeInfo?.name || ts('privateGames.privateExperience'),
        description:
            placeInfo?.description || ts('privateGames.experienceIsPrivate'),
        creator: {
            id: placeInfo?.builderId || 0,
            name: placeInfo?.builder || ts('privateGames.unknown'),
            type: 'User',
            hasVerifiedBadge: placeInfo?.hasVerifiedBadge || false,
        },
        playing: null,
        favoritedCount: null,
        visits: null,
        maxPlayers: placeInfo?.maxPlayers || null,
        genre: placeInfo?.genre || null,
        subgenre: null,

        created: null,
        updated: null,
        isFavoritedByUser: false,
        voiceChatEnabled: null,
        ageRating: null,
    };
}

function showStatusBannerForPlayabilityStatus(status) {
    const statusCode = toStatusCode(status.raw);

    const isModerated = statusCode === 3 || statusCode === 9;
    const icon = isModerated
        ? '<svg viewBox="0 0 24 24"><path d="m5.2494 8.0688 2.83-2.8269 14.1343 14.15-2.83 2.8269zm4.2363-4.2415 2.828-2.8289 5.6577 5.656-2.828 2.8289zM.9989 12.3147l2.8284-2.8285 5.6569 5.6569-2.8285 2.8284zM1 21h12v2H1z"></path></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z"></path></svg>';

    const bannerText =
        status.displayText || getPlayabilityDisplayText(statusCode);

    const showBanner = (retries = 0) => {
        const banner = document.getElementById('rovalra-game-notice-banner');
        if (banner && window.GameBannerManager) {
            if (window.GameBannerManager.clearNotices) {
                window.GameBannerManager.clearNotices();
            }
            window.GameBannerManager.addNotice(
                bannerText,
                icon,
                ts('privateGames.rovalraNotice'),
                '16px',
                '14px',
            );
        } else if (retries < 30) {
            setTimeout(() => showBanner(retries + 1), 100);
        }
    };
    showBanner();
}

async function renderPrivateGamePage(game, placeId, settings) {
    const content = document.getElementById('content');
    if (!content) return;

    injectStylesheet('css/privategames.css', 'rovalra-privategames-css');
    document.title = `${game.name} - Roblox`;

    initGameBanner();

    const playabilityStatus = game._playabilityStatus;
    const hasStatusData =
        playabilityStatus && typeof playabilityStatus.raw !== 'undefined';

    if (hasStatusData) {
        showStatusBannerForPlayabilityStatus(playabilityStatus);
    }

    let upVotes = 0;
    let downVotes = 0;
    try {
        const voteRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/votes?universeIds=${game.id}`,
        });
        if (voteRes?.data?.[0]) {
            upVotes = voteRes.data[0].upVotes || 0;
            downVotes = voteRes.data[0].downVotes || 0;
        }
    } catch (e) {
        console.warn('RoValra: Failed to fetch vote data', e);
    }

    const universeDetails = game._cloudData || null;

    let maturityLabel = 'Minimal';
    let maturityLinkText = 'Maturity: Minimal';
    try {
        const guidelinesRes = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint:
                '/experience-guidelines-service/v1beta1/detailed-guidelines',
            method: 'POST',
            body: JSON.stringify({ universeId: game.id }),
            headers: { 'Content-Type': 'application/json' },
        });
        const summary =
            guidelinesRes?.ageRecommendationDetails?.ageRecommendationSummary
                ?.ageRecommendation;
        if (summary?.displayNameWithHeaderShort) {
            maturityLinkText = DOMPurify.sanitize(
                summary.displayNameWithHeaderShort,
            );
        } else if (summary?.displayName) {
            maturityLabel = summary.displayName;
            maturityLinkText = `Maturity: ${maturityLabel}`;
        }
    } catch (e) {
        console.warn(
            'RoValra: Failed to fetch experience guidelines, using fallback maturity',
            e,
        );
    }

    const isFavoritedByUser = game.isFavoritedByUser || false;

    const voiceChatEnabled = game.voiceChatEnabled;

    const totalVotes = upVotes + downVotes;
    const likeRatio =
        totalVotes > 0 ? Math.floor((upVotes / totalVotes) * 100) : 0;

    const assets = getAssets();

    content.innerHTML = DOMPurify.sanitize(`
        <div id="game-detail-page" class="row page-content inline-social" data-place-id="${placeId}" style="max-width: 970px; margin: 0 auto;">
            <div class="col-xs-12 section-content game-main-content remove-panel">
                <div class="rovalra-game-hero">
                    <div class="game-details-carousel-container">
                        <div class="thumbnail-2d-container shimmer carousel-item carousel-item-active"></div>
                    </div>
                    <div class="game-calls-to-action">
                        <div class="game-title-container">
                            <h1 class="game-name" title="${game.name}">${game.name}</h1>
                             <div class="game-creator with-verified-badge">
                                 <span class="text-label">By</span>
                                 <a class="text-name text-overflow" href="https://www.roblox.com/${game.creator.type === 'Group' ? 'communities' : 'users'}/${game.creator.id}">${game.creator.name}</a>${game.creator.hasVerifiedBadge ? `<span style="display:inline-flex;vertical-align:middle;"><span role="button" tabindex="0" data-rblx-verified-badge-icon="" data-rblx-badge-icon="true" class="css-1myerb2-imgWrapper"><img class="verified-badge-icon-experience-creator" src="${assets.verifiedBadgeMono}" title="Verified Badge Icon" alt="Verified Badge Icon"></span></span>` : ''}
                             </div>
                        </div>
                        <div class="game-buttons-container">
                            <div class="game-details-play-button-container">
                                <button type="button" class="btn-common-play-game-unplayable-lg btn-primary-md btn-full-width" disabled="" data-testid="play-unplayable-button">
                                    <span class="icon-status-unavailable-secondary"></span>
                                     <span class="btn-text">${ts('privateGames.unavailable')}</span>
                                </button>
                            </div>
                        <ul class="favorite-follow-vote-share rovalra-private-actions">
                            <li class="game-favorite-button-container">
                                 <div class="tooltip-container" data-toggle="tooltip" title="${ts('privateGames.favorite.add')}">
                                    <div class="favorite-button" id="rovalra-favorite-btn" data-universe-id="${game.id}">
                                        <div id="game-favorite-icon" class="icon-favorite rovalra-action-icon${isFavoritedByUser ? ' favorited' : ''}"></div>
                                         <div id="game-favorite-icon-label" class="icon-label rovalra-action-label">${isFavoritedByUser ? ts('privateGames.favorite.favorited') : ts('privateGames.favorite.favorite')}</div>
                                    </div>
                                </div>
                            </li>
                             <li class="game-follow-button-container">
                                  <div class="tooltip-container" data-toggle="tooltip" title="${ts('privateGames.notify.tooltip')}">
                                     <div class="follow-button disabled">
                                         <div id="game-follow-icon" class="icon-notifications-bell rovalra-action-icon"></div>
                                          <div id="game-follow-icon-label" class="icon-label rovalra-action-label">${ts('privateGames.notify.label')}</div>
                                     </div>
                                 </div>
                             </li>
                            <li class="rovalra-voting-section">
                                <div class="rovalra-voting-controls">
                                    <div class="vote-btn-row">
                                        <div class="rovalra-vote-btn upvote">
                                            <span class="icon-like"></span>
                                        </div>
                                        <div class="rovalra-vote-btn downvote">
                                            <span class="icon-dislike"></span>
                                        </div>
                                    </div>
                                    <div class="vote-container">
                                        <div class="vote-background has-votes"></div>
                                        <div class="vote-percentage" style="width: ${likeRatio}%;"></div>
                                        <div class="vote-mask">
                                            <div class="segment seg-1"></div>
                                            <div class="segment seg-2"></div>
                                            <div class="segment seg-3"></div>
                                            <div class="segment seg-4"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="rovalra-vote-counts">
                                    <span class="rovalra-vote-count">${formatVoteCount(upVotes)}</span>
                                    <span class="rovalra-vote-count">${formatVoteCount(downVotes)}</span>
                                </div>
                            </li>
                        </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-xs-12 rbx-tabs-horizontal" data-place-id="${placeId}">
                <ul id="horizontal-tabs" class="nav nav-tabs" role="tablist"></ul>
                <div class="tab-content rbx-tab-content"></div>
            </div>
        </div>
    `);

    const thumbnailContainer = document.querySelector(
        '.game-details-carousel-container',
    );
    const universeIdForThumbs = game.universeId || game.id;

    if (universeIdForThumbs && thumbnailContainer) {
        fetchPromotionalThumbnails(universeIdForThumbs).then((thumbnails) => {
            if (!thumbnails || thumbnails.length === 0) {
                fetchThumbnails(
                    [{ id: placeId }],
                    'GameThumbnail',
                    '768x432',
                ).then((map) => {
                    const thumbData = map.get(Number(placeId));
                    if (thumbData && thumbnailContainer) {
                        const thumbEl = createThumbnailElement(
                            thumbData,
                            game.name,
                            'carousel-item carousel-item-active',
                            {
                                width: '100%',
                                height: '100%',
                                borderRadius: '0px',
                            },
                        );
                        thumbnailContainer.innerHTML = '';
                        thumbnailContainer.appendChild(thumbEl);
                    }
                });
                return;
            }

            const carousel = document.createElement('div');
            carousel.dataset.testid = 'carousel';
            carousel.style.cssText =
                'height: 100%; width: 100%; position: relative; overflow: hidden;';

            const items = thumbnails.map((thumb, idx) => {
                const span = document.createElement('span');
                span.className = `thumbnail-2d-container carousel-item ${idx === 0 ? 'carousel-item-active' : ''}`;
                Object.assign(span.style, {
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                });

                const thumbEl = createThumbnailElement(
                    thumb,
                    `Promotional image #${idx + 1} for ${game.name}`,
                    '',
                    {
                        width: '100%',
                        height: '100%',
                        borderRadius: '0px',
                        objectFit: 'cover',
                    },
                );
                thumbEl.title = `Promotional image #${idx + 1} for ${game.name}`;

                span.appendChild(thumbEl);
                carousel.appendChild(span);
                return { el: span };
            });

            const controls = document.createElement('div');
            controls.className = 'carousel-controls-container';
            controls.dataset.testid = 'carousel-controls-container';
            Object.assign(controls.style, {
                opacity: '0',
                transition: 'opacity 0.2s',
                pointerEvents: 'none',
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                zIndex: '10',
            });

            carousel.addEventListener('mouseenter', () => {
                controls.style.opacity = '1';
                controls.classList.add('carousel-controls-container-visible');
            });
            carousel.addEventListener('mouseleave', () => {
                controls.style.opacity = '0';
                controls.classList.remove(
                    'carousel-controls-container-visible',
                );
            });

            let currentIdx = 0;
            const updateUI = () => {
                items.forEach((item, idx) => {
                    const isActive = idx === currentIdx;
                    item.el.classList.toggle('carousel-item-active', isActive);
                });
            };

            const { leftButton, rightButton } = createScrollButtons({
                onLeftClick: (e) => {
                    e.preventDefault();
                    currentIdx = (currentIdx - 1 + items.length) % items.length;
                    updateUI();
                },
                onRightClick: (e) => {
                    e.preventDefault();
                    currentIdx = (currentIdx + 1) % items.length;
                    updateUI();
                },
            });

            leftButton.classList.add('rovalra-scroll-btn', 'left');
            rightButton.classList.add('rovalra-scroll-btn', 'right');

            if (thumbnails.length > 1) {
                controls.appendChild(leftButton);
                controls.appendChild(rightButton);
            }
            carousel.appendChild(controls);

            thumbnailContainer.innerHTML = '';
            thumbnailContainer.appendChild(carousel);
            updateUI();
        });
    }

    const tabsContainer = document.getElementById('horizontal-tabs');
    const tabContentContainer = document.querySelector('.tab-content');

    const aboutTab = createTab({
        id: 'about',
        label: ts('privateGames.tabs.about') || 'About',
        container: tabsContainer,
        contentContainer: tabContentContainer,
    });
    aboutTab.tab.classList.add('active');
    aboutTab.contentPane.classList.add('active');

    const storeTab = createTab({
        id: 'store',
        label: ts('privateGames.tabs.store') || 'Store',
        container: tabsContainer,
        contentContainer: tabContentContainer,
        classes: ['store'],
    });

    const descriptionText =
        universeDetails?.description ||
        game.description ||
        ts('privateGames.description.noDescription');

    aboutTab.contentPane.innerHTML = DOMPurify.sanitize(`
        <div class="game-details-about-tab-container">
            <div class="game-about-tab-container">
                <div class="game-description-container">
                    <div class="container-header"><h2>${ts('privateGames.description.title')}</h2></div>
                    <pre class="text game-description">${descriptionText}</pre>
                    <div id="game-age-recommendation-details-container" class="game-age-recommendation-details-container">
                        <div data-testid="content-maturity-label-container">
                            <div class="age-rating-details col-xs-12 section-content">
                                <a class="age-rating-age-bracket text-lead text-link" href="https://www.roblox.com/info/age-recommendations-policy" target="_blank">${maturityLinkText}</a>
                            </div>
                        </div>
                    </div>
                    <ul class="border-top border-bottom game-stat-container rovalra-horizontal-stats">
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.active')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-active-playing">${game.playing !== null ? formatVoteCount(game.playing) : ts('privateGames.unknown')}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.favorites')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-favorited-count">${game.favoritedCount !== null ? formatVoteCount(game.favoritedCount) : ts('privateGames.unknown')}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.visits')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-visits-count">${game.visits !== null ? formatVoteCount(game.visits) : ts('privateGames.unknown')}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.maxPlayers')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-max-players">${game.maxPlayers !== null ? game.maxPlayers.toLocaleString() : ts('privateGames.unknown')}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.genre')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-genre-text">${game.genre !== null ? game.genre : ts('privateGames.unknown')}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.subgenre') || 'Subgenre'}</p>
                            <p class="text-lead font-caption-body" id="rovalra-subgenre-text">${game.subgenre !== null ? game.subgenre : ts('privateGames.unknown')}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.created')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-created-date"></p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.updated')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-updated-date"></p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">${ts('privateGames.stats.voiceChat')}</p>
                            <p class="text-lead font-caption-body" id="rovalra-voice-chat-status">${voiceChatEnabled === true ? ts('privateGames.stats.supported') : voiceChatEnabled === false ? ts('privateGames.stats.unsupported') : ts('privateGames.unknown')}</p>
                        </li>
                    </ul>
                    <div class="game-description-footer">
                        <a class="text-report" href="/report-abuse/?targetId=${placeId}&abuseVector=place">${ts('privateGames.reportAbuse')}</a>
                    </div>
                </div>
                <div class="stack badge-container game-badges-list" id="rovalra-badges-section">
                    <div class="container-header"><h3>${ts('privateGames.badges.title')}</h3></div>
                    <ul class="stack-list" id="rovalra-game-badges"></ul>
                </div>
            </div>
        </div>
    `);

    const aboutTabContainer = aboutTab.contentPane.querySelector(
        '.game-details-about-tab-container',
    );
    if (aboutTabContainer) {
        checkAndInjectEvents(aboutTabContainer, placeId);
    }
    const subscriptionsContainer = document.createElement('div');
    subscriptionsContainer.id = 'rbx-subscriptions-container';
    subscriptionsContainer.style.display = 'none';

    const subscriptionsContent = document.createElement('div');
    subscriptionsContent.id = 'rbx-subscriptions-container-content';

    const subscriptionsHeader = document.createElement('div');
    subscriptionsHeader.className = 'container-header';
    const headerTitle = document.createElement('h2');
    headerTitle.textContent = ts('privateGames.subscriptions.title');
    subscriptionsHeader.appendChild(headerTitle);

    const subscriptionsList = document.createElement('div');
    subscriptionsList.id = 'subscriptions-list';
    subscriptionsList.className = 'subscriptions-scroll-container';
    subscriptionsList.setAttribute('role', 'list');

    subscriptionsContent.appendChild(subscriptionsHeader);
    subscriptionsContent.appendChild(subscriptionsList);
    subscriptionsContainer.appendChild(subscriptionsContent);
    storeTab.contentPane.appendChild(subscriptionsContainer);

    const passesContainer = document.createElement('div');
    passesContainer.id = 'rbx-game-passes';
    passesContainer.className = 'container-list game-dev-store game-passes';

    const passesHeader = document.createElement('div');
    passesHeader.className = 'container-header';

    const passesTitle = document.createElement('h3');
    passesTitle.textContent = ts('privateGames.passes.title');
    passesTitle.style.margin = '0';
    passesHeader.appendChild(passesTitle);

    const passesList = document.createElement('ul');
    passesList.id = 'rovalra-passes-list';
    passesList.className = 'hlist store-cards gear-passes-container';

    const toggleLi = document.createElement('li');
    toggleLi.className = 'rovalra-offsale-toggle-item';

    const showNotForSaleLabel = document.createElement('label');
    showNotForSaleLabel.style.fontSize = '14px';
    showNotForSaleLabel.style.fontWeight = '600';
    showNotForSaleLabel.style.color = 'var(--rovalra-secondary-text-color)';
    showNotForSaleLabel.style.cursor = 'pointer';
    showNotForSaleLabel.style.display = 'inline-flex';
    showNotForSaleLabel.style.alignItems = 'center';
    showNotForSaleLabel.style.gap = '6px';
    showNotForSaleLabel.style.userSelect = 'none';
    showNotForSaleLabel.style.padding = '8px';
    showNotForSaleLabel.textContent = ts('privateGames.passes.showOffSale');

    const notForSaleToggle = createRadioButton({
        id: 'rovalra-show-not-for-sale-toggle',
        checked: false,
        onChange: (checked) => {
            showNotForSale = checked;
            if (lastLoadedPasses.length > 0 && lastList && lastNoPassesMsg) {
                renderPasses(
                    lastList,
                    lastNoPassesMsg,
                    lastLoadedPasses,
                    showNotForSale,
                );
            }
        },
    });

    showNotForSaleLabel.prepend(notForSaleToggle);
    toggleLi.appendChild(showNotForSaleLabel);
    passesList.appendChild(toggleLi);

    const noPassesMsg = document.createElement('div');
    noPassesMsg.className = 'section-content-off';
    noPassesMsg.style.display = 'none';
    noPassesMsg.textContent = ts('privateGames.passes.noPasses');

    passesContainer.appendChild(passesHeader);
    passesContainer.appendChild(passesList);
    passesContainer.appendChild(noPassesMsg);
    storeTab.contentPane.appendChild(passesContainer);

    lastList = passesList;
    lastNoPassesMsg = noPassesMsg;

    let badgesLoaded = false;
    let passesLoaded = false;

    const switchToStoreTab = () => {
        aboutTab.tab.classList.remove('active');
        aboutTab.contentPane.classList.remove('active');
        storeTab.tab.classList.add('active');
        storeTab.contentPane.classList.add('active');
        if (!passesLoaded) {
            passesLoaded = true;
            const universeId = game.universeId || game.id;
            loadPasses(universeId);
            if (universeId) {
                loadSubscriptions(universeId);
            }
        }
    };

    const switchToAboutTab = () => {
        storeTab.tab.classList.remove('active');
        storeTab.contentPane.classList.remove('active');
        aboutTab.tab.classList.add('active');
        aboutTab.contentPane.classList.add('active');
    };

    storeTab.tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchToStoreTab();
        if (window.location.hash !== '#!/store') {
            window.location.hash = '#!/store';
        }
    });

    aboutTab.tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        switchToAboutTab();
        if (window.location.hash !== '#!/about') {
            window.location.hash = '#!/about';
        }
    });

    const handleHashChange = () => {
        const hash = window.location.hash;
        if (hash.includes('#!/store')) {
            switchToStoreTab();
        } else if (hash.includes('#!/about')) {
            switchToAboutTab();
        }
    };

    if (!window.location.hash || !window.location.hash.includes('#!')) {
        window.location.hash = '#!/about';
    } else {
        handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);

    if (game.created) {
        const createdEl = document.getElementById('rovalra-created-date');
        if (createdEl)
            createdEl.appendChild(createInteractiveTimestamp(game.created));
    }
    if (game.updated) {
        const updatedEl = document.getElementById('rovalra-updated-date');
        if (updatedEl)
            updatedEl.appendChild(createInteractiveTimestamp(game.updated));
    }

    // Add tooltips for exact numbers
    const addTooltipToStat = (elementId, value) => {
        const element = document.getElementById(elementId);
        if (element && value !== null && typeof value !== 'undefined') {
            addTooltip(element, value.toLocaleString(), { position: 'bottom' });
        }
    };

    if (game.playing !== null) {
        addTooltipToStat('rovalra-active-playing', game.playing);
    }

    if (game.favoritedCount !== null) {
        addTooltipToStat('rovalra-favorited-count', game.favoritedCount);
    }

    if (game.visits !== null) {
        addTooltipToStat('rovalra-visits-count', game.visits);
    }

    if (game.maxPlayers !== null) {
        addTooltipToStat('rovalra-max-players', game.maxPlayers);
    }

    setupFavoriteButton(game.id, isFavoritedByUser);

    loadBadges(game.universeId || game.id);
    badgesLoaded = true;
}

function setupFavoriteButton(universeId, initialFavorited) {
    const favBtn = document.getElementById('rovalra-favorite-btn');
    if (!favBtn) return;

    let isFavoriting = false;
    let isFavorited = initialFavorited || false;

    favBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (isFavoriting) return;

        isFavoriting = true;
        const action = isFavorited ? 'unfavorite' : 'favorite';

        try {
            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/games/${universeId}/favorites`,
                method: 'POST',
                body: `isFavorited=${!isFavorited}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            if (response.status === 200) {
                isFavorited = !isFavorited;
                updateFavoriteUI(isFavorited);
            }
        } catch (err) {
            console.error(`RoValra: Failed to ${action} game`, err);
        } finally {
            isFavoriting = false;
        }
    });

    window.updateFavoriteUI = function (favorited) {
        const icon = document.getElementById('game-favorite-icon');
        const label = document.getElementById('game-favorite-icon-label');
        const tooltip = document
            .querySelector('#rovalra-favorite-btn')
            ?.closest('.tooltip-container');

        if (icon) {
            if (favorited) {
                icon.classList.add('favorited');
            } else {
                icon.classList.remove('favorited');
            }
        }
        if (label) {
            label.textContent = favorited
                ? ts('privateGames.favorite.favorited')
                : ts('privateGames.favorite.favorite');
        }
        if (tooltip) {
            tooltip.setAttribute(
                'title',
                favorited
                    ? ts('privateGames.favorite.remove')
                    : ts('privateGames.favorite.add'),
            );
            tooltip.setAttribute(
                'data-original-title',
                favorited
                    ? ts('privateGames.favorite.remove')
                    : ts('privateGames.favorite.add'),
            );
        }
    };
}

async function loadBadges(universeId) {
    const container = document.getElementById('rovalra-game-badges');
    if (!container) return;

    try {
        const res = await callRobloxApiJson({
            subdomain: 'badges',
            endpoint: `/v1/universes/${universeId}/badges?limit=100&sortOrder=Desc`,
        });
        const badges = res?.data || [];

        badges.sort((a, b) => {
            const rateA = (a.statistics?.winRatePercentage ?? 0) * 100;
            const rateB = (b.statistics?.winRatePercentage ?? 0) * 100;
            return rateB - rateA;
        });

        const thumbMap = await fetchThumbnails(
            badges.map((b) => ({ id: b.id })),
            'BadgeIcon',
            '150x150',
        );

        if (badges.length === 0) {
            const noBadgesMsg = document.createElement('p');
            noBadgesMsg.style.padding = '10px';
            noBadgesMsg.style.color = 'var(--rovalra-secondary-text-color)';
            noBadgesMsg.textContent = ts('privateGames.badges.noBadges');
            container.parentElement.parentElement?.after?.(noBadgesMsg);
            return;
        }

        badges.forEach((badge) => {
            const thumb = thumbMap.get(badge.id);
            const stats = badge.statistics || {};
            const winRate = (stats.winRatePercentage ?? 0) * 100;
            const pastDayAwarded = stats.pastDayAwardedCount ?? 0;
            const awardedCount = stats.awardedCount ?? 0;
            const rarityText = winRate.toFixed(1) + '%';

            const li = document.createElement('li');
            li.className = 'stack-row badge-row';
            li.innerHTML = DOMPurify.sanitize(`
                <div class="badge-image">
                    <a href="https://www.roblox.com/badges/${badge.id}/${encodeURIComponent(badge.displayName || badge.name)}">
                        <span class="thumbnail-2d-container badge-image-container">
                            <img class="" src="${thumb?.imageUrl || ''}" alt="${badge.name}" title="${badge.name}">
                        </span>
                    </a>
                </div>
                <div class="badge-content">
                    <div class="badge-data-container">
                        <div class="font-header-2 badge-name">${badge.displayName || badge.name}</div>
                        <p class="para-overflow">${badge.displayDescription || badge.description || ''}</p>
                    </div>
                    <ul class="badge-stats-container">
                        <li>
                            <div class="text-label">${ts('privateGames.badges.rarity')}</div>
                            <div class="font-header-2 badge-stats-info">${rarityText}</div>
                        </li>
                        <li>
                            <div class="text-label">${ts('privateGames.badges.wonYesterday')}</div>
                            <div class="font-header-2 badge-stats-info">${pastDayAwarded.toLocaleString()}</div>
                        </li>
                        <li>
                            <div class="text-label">${ts('privateGames.badges.wonEver')}</div>
                            <div class="font-header-2 badge-stats-info">${awardedCount.toLocaleString()}</div>
                        </li>
                    </ul>
                </div>
            `);
            container.appendChild(li);
        });
    } catch (e) {
        console.warn('RoValra: Failed to load badges', e);
    }
}

let lastLoadedPasses = [];
let lastList = null;
let lastNoPassesMsg = null;
let showNotForSale = false;

let lastLoadedDevProducts = [];
let lastDevProductsContainer = null;
let lastDevProductsNoMsg = null;

function renderPasses(list, noPassesMsg, passes, showNotForSale) {
    const toggleItem = list.querySelector('.rovalra-offsale-toggle-item');
    list.innerHTML = '';
    if (toggleItem) {
        list.appendChild(toggleItem);
    }

    const filteredPasses = passes.filter((pass) => {
        const isOwned = pass.isOwned ?? false;
        const isForSale = pass.isForSale ?? false;
        if (isOwned || isForSale) return true;
        if (showNotForSale && !isOwned && !isForSale) return true;
        return false;
    });

    if (filteredPasses.length === 0) {
        if (noPassesMsg) noPassesMsg.style.display = '';
        return;
    }

    if (noPassesMsg) noPassesMsg.style.display = 'none';

    const iconIds = [];
    for (const pass of filteredPasses) {
        const iconId = pass.displayIconImageAssetId || pass.IconImageAssetId;
        if (iconId) iconIds.push({ id: iconId });
    }

    const thumbnailPromises = [];
    if (iconIds.length > 0) {
        thumbnailPromises.push(
            fetchThumbnails(iconIds, 'Asset', '150x150').then((map) => map),
        );
    }

    const thumbnailMapPromise =
        thumbnailPromises.length > 0
            ? Promise.all(thumbnailPromises).then((results) => results[0])
            : Promise.resolve(new Map());

    for (const pass of filteredPasses) {
        const id = pass.id || pass.gamePassId;
        const productId = pass.productId || pass.ProductId;
        const name =
            pass.displayName || pass.name || ts('privateGames.passes.title');
        const price = pass.price ?? pass.PriceInRobux ?? 0;
        const isOwned = pass.isOwned ?? false;
        const isForSale = pass.isForSale ?? false;
        const iconId = pass.displayIconImageAssetId || pass.IconImageAssetId;

        const li = document.createElement('li');
        li.className = 'list-item';

        const storeCard = document.createElement('div');
        storeCard.className = 'store-card';

        const thumbLink = document.createElement('a');
        thumbLink.href = `https://www.roblox.com/game-pass/${id}/-`;
        thumbLink.className = 'gear-passes-asset store-card-link';

        if (iconId) {
            const thumbContainer = document.createElement('span');
            thumbContainer.className =
                'thumbnail-2d-container store-card-image';
            thumbContainer.style.borderRadius = '8px';
            thumbContainer.style.overflow = 'hidden';
            thumbLink.appendChild(thumbContainer);

            thumbnailMapPromise.then((thumbnailMap) => {
                const thumbData = thumbnailMap.get(iconId);
                if (thumbData) {
                    const thumbEl = createThumbnailElement(
                        thumbData,
                        name,
                        '',
                        { width: '100%', height: '100%', borderRadius: '0px' },
                    );
                    thumbContainer.innerHTML = '';
                    thumbContainer.appendChild(thumbEl);
                }
            });
        }

        const captionSection = document.createElement('div');
        captionSection.className = 'store-card-caption';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'text-overflow store-card-name';
        nameDiv.title = name;
        nameDiv.textContent = name;

        const priceDiv = document.createElement('div');
        priceDiv.className = 'store-card-price';

        if (!isOwned && !isForSale) {
            priceDiv.classList.add('offsale');
            const offSaleSpan = document.createElement('span');
            offSaleSpan.className = 'text-label';
            offSaleSpan.style.color = 'var(--rovalra-secondary-text-color)';
            const offSaleText = document.createElement('span');
            offSaleText.className = 'text-overflow font-caption-body';
            offSaleText.textContent = ts('privateGames.passes.offSale');
            offSaleSpan.appendChild(offSaleText);
            priceDiv.appendChild(offSaleSpan);
        } else {
            const robuxIcon = document.createElement('span');
            robuxIcon.className = 'icon-robux-16x16';
            const robuxText = document.createElement('span');
            robuxText.className = 'text-robux';
            robuxText.textContent = price.toString();
            priceDiv.appendChild(robuxIcon);
            priceDiv.appendChild(robuxText);
        }

        const footerDiv = document.createElement('div');
        footerDiv.className = 'store-card-footer';

        if (isOwned) {
            const ownedText = document.createElement('h5');
            ownedText.textContent = ts('privateGames.passes.owned');
            footerDiv.appendChild(ownedText);
        } else {
            const buyBtn = document.createElement('button');
            buyBtn.type = 'button';
            buyBtn.className =
                'rbx-gear-passes-purchase btn-buy-md btn-full-width disabled';
            buyBtn.disabled = true;
            buyBtn.textContent = ts('privateGames.passes.buy');
            footerDiv.appendChild(buyBtn);
        }

        captionSection.appendChild(nameDiv);
        captionSection.appendChild(priceDiv);
        captionSection.appendChild(footerDiv);

        storeCard.appendChild(thumbLink);
        storeCard.appendChild(captionSection);
        li.appendChild(storeCard);
        list.appendChild(li);
    }
}

async function loadSubscriptions(subscriptionProviderId) {
    const subscriptionsContainer =
        document.getElementById('subscriptions-list');
    const sectionContainer = document.getElementById(
        'rbx-subscriptions-container',
    );
    if (!subscriptionsContainer) return;

    const assets = getAssets();

    try {
        const res = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/v1/subscriptions/active-subscription-products?subscriptionProductType=1&subscriptionProviderId=${subscriptionProviderId}`,
        });
        const subscriptions = res?.subscriptionProductsInfo || [];

        if (subscriptions.length === 0) {
            return;
        }

        if (sectionContainer) sectionContainer.style.display = '';

        const iconIds = [];
        for (const sub of subscriptions) {
            const iconId = sub.iconImageAssetId;
            if (iconId) iconIds.push({ id: iconId });
        }

        const thumbnailMapPromise =
            iconIds.length > 0
                ? fetchThumbnails(iconIds, 'Asset', '150x150').then(
                      (map) => map,
                  )
                : Promise.resolve(new Map());

        thumbnailMapPromise.then((thumbnailMap) => {
            for (const sub of subscriptions) {
                const name = sub.name || ts('privateGames.subscriptions.title');
                const description = sub.description || '';
                const price = sub.priceInRobux ?? sub.displayPrice ?? 0;
                const period = sub.subscriptionPeriod || 'Month';
                const isForSale = sub.isForSale ?? true;
                const iconId = sub.iconImageAssetId;

                const subscriptionCard = document.createElement('div');
                subscriptionCard.className =
                    'subscription-card-item bg-shift-200';

                const cardInfo = document.createElement('div');
                cardInfo.className = 'subscription-card-info';

                const thumbSection = document.createElement('div');
                thumbSection.className = 'subscription-card-thumbnail';

                if (iconId) {
                    const thumbContainer = document.createElement('span');
                    thumbContainer.className =
                        'thumbnail-2d-container subscription-thumbnail-container-class';
                    thumbSection.appendChild(thumbContainer);

                    const thumbData = thumbnailMap.get(iconId);
                    if (thumbData) {
                        const img = document.createElement('img');
                        img.className = 'subscription-thumbnail';
                        img.src = thumbData.imageUrl || '';
                        img.alt = name;
                        img.title = name;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        thumbContainer.innerHTML = '';
                        thumbContainer.appendChild(img);
                    }
                }

                const textSection = document.createElement('div');
                textSection.className = 'subscription-card-text';

                const nameSpan = document.createElement('span');
                nameSpan.className =
                    'text-title-medium content-emphasis subscription-card-title';
                nameSpan.textContent = name;
                nameSpan.title = name;

                const descSpan = document.createElement('span');
                descSpan.className =
                    'text-body-medium content-default subscription-card-description';
                descSpan.textContent = description;

                const priceDiv = document.createElement('div');
                priceDiv.className = 'subscription-card-price';
                const robuxIcon = createRobuxIcon({
                    size: '16px',
                    color: 'var(--rovalra-secondary-text-color)',
                    verticalAlign: '-2px',
                    className: 'subscription-robux-icon',
                });
                const priceSpan = document.createElement('span');
                priceSpan.className = 'text-body-medium content-default';
                priceSpan.textContent = `${price}/${period.toLowerCase()}`;
                priceDiv.appendChild(robuxIcon);
                priceDiv.appendChild(priceSpan);

                textSection.appendChild(nameSpan);
                textSection.appendChild(descSpan);
                textSection.appendChild(priceDiv);

                cardInfo.appendChild(thumbSection);
                cardInfo.appendChild(textSection);

                const subscribeBtn = document.createElement('button');
                subscribeBtn.type = 'button';

                if (!isForSale) {
                    subscribeBtn.className =
                        'rbx-gear-passes-purchase btn-buy-md btn-full-width disabled';
                    subscribeBtn.disabled = true;
                    subscribeBtn.textContent = ts(
                        'privateGames.subscriptions.subscribe',
                    );
                } else {
                    subscribeBtn.className =
                        'foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-medium height-1000 padding-x-medium bg-action-standard content-action-standard';
                    subscribeBtn.disabled = false;

                    const btnPresentation = document.createElement('div');
                    btnPresentation.setAttribute('role', 'presentation');
                    btnPresentation.className =
                        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

                    const btnContent = document.createElement('span');
                    btnContent.className =
                        'flex items-center min-width-0 gap-small';

                    const btnText = document.createElement('span');
                    btnText.className =
                        'padding-y-xsmall text-truncate-end text-no-wrap';
                    btnText.textContent = ts(
                        'privateGames.subscriptions.subscribe',
                    );

                    btnContent.appendChild(btnText);
                    subscribeBtn.appendChild(btnPresentation);
                    subscribeBtn.appendChild(btnContent);
                }

                const overlays = document.createElement('div');
                overlays.className = 'subscription-card-overlays';

                const twoSvPopup = document.createElement('div');
                twoSvPopup.id = 'two-sv-popup-entry';

                const systemFeedback = document.createElement('div');
                systemFeedback.className = 'sg-system-feedback';

                const alertSystem = document.createElement('div');
                alertSystem.className = 'alert-system-feedback';

                const alert = document.createElement('div');
                alert.className = 'alert';

                const alertContent = document.createElement('span');
                alertContent.className = 'alert-content';

                alert.appendChild(alertContent);
                alertSystem.appendChild(alert);
                systemFeedback.appendChild(alertSystem);
                overlays.appendChild(twoSvPopup);
                overlays.appendChild(systemFeedback);

                subscriptionCard.appendChild(cardInfo);
                subscriptionCard.appendChild(subscribeBtn);
                subscriptionCard.appendChild(overlays);
                subscriptionsContainer.appendChild(subscriptionCard);
            }
        });
    } catch (e) {
        console.warn('RoValra: Failed to load subscriptions', e);
    }
}

async function loadPasses(universeId) {
    const list = document.getElementById('rovalra-passes-list');
    const container = document.getElementById('rbx-game-passes');
    const noPassesMsg = container?.querySelector('.section-content-off');
    if (!list) return;

    try {
        const res = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/universes/${universeId}/game-passes?pageSize=50&passView=Full`,
        });
        const passes = res?.data || res?.gamePasses || [];

        if (passes.length === 0) {
            if (noPassesMsg) noPassesMsg.style.display = '';
            return;
        }

        lastLoadedPasses = passes;
        renderPasses(list, noPassesMsg, passes, showNotForSale);

        loadDeveloperProducts(universeId);
    } catch (e) {
        console.warn('RoValra: Failed to load passes', e);
    }
}

async function loadDeveloperProducts(universeId) {
    try {
        const res = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/experience-store/v1/universes/${universeId}/store?cursor=&limit=200`,
        });
        const devProducts = res?.developerProducts || [];

        if (devProducts.length === 0) {
            return;
        }

        const sortedProducts = [...devProducts].sort((a, b) => {
            const priceA = a.PriceInRobux ?? 0;
            const priceB = b.PriceInRobux ?? 0;
            return priceA - priceB;
        });

        lastLoadedDevProducts = sortedProducts;
        renderDeveloperProducts(sortedProducts, universeId);
    } catch (e) {
        console.warn('RoValra: Failed to load developer products', e);
    }
}

function renderDeveloperProducts(devProducts, universeId) {
    const devProductsContainer = document.createElement('div');
    devProductsContainer.id = 'rbx-developer-products';
    devProductsContainer.className =
        'container-list game-dev-store game-passes';

    const devProductsHeader = document.createElement('div');
    devProductsHeader.className = 'container-header';

    const devProductsTitle = document.createElement('h2');
    devProductsTitle.textContent = ts('privateGames.products.title');
    devProductsTitle.style.margin = '0';
    devProductsHeader.appendChild(devProductsTitle);

    const devProductsList = document.createElement('ul');
    devProductsList.className =
        'hlist store-cards store-developer-products-row';

    const iconIds = [];
    for (const product of devProducts) {
        const iconId = product.displayIcon || product.IconImageAssetId;
        if (iconId) iconIds.push({ id: iconId });
    }

    const thumbnailPromises = [];
    if (iconIds.length > 0) {
        thumbnailPromises.push(
            fetchThumbnails(iconIds, 'Asset', '150x150').then((map) => map),
        );
    }

    const thumbnailMapPromise =
        thumbnailPromises.length > 0
            ? Promise.all(thumbnailPromises).then((results) => results[0])
            : Promise.resolve(new Map());

    devProductsContainer.appendChild(devProductsHeader);
    devProductsContainer.appendChild(devProductsList);

    const passesContainer = document.getElementById('rbx-game-passes');
    if (passesContainer) {
        passesContainer.appendChild(devProductsContainer);
    }

    thumbnailMapPromise.then((thumbnailMap) => {
        for (const product of devProducts) {
            const productId = product.ProductId;
            const name =
                product.displayName ||
                product.Name ||
                ts('privateGames.products.title');
            const price = product.PriceInRobux ?? 0;
            const iconId = product.displayIcon || product.IconImageAssetId;
            const description =
                product.displayDescription || product.Description || '';

            const li = document.createElement('li');
            li.className = 'list-item developer-product-tile';

            const storeCard = document.createElement('div');
            storeCard.className = 'store-card';

            const thumbSection = document.createElement('div');
            thumbSection.className = 'store-product-card-thumbnail';

            const thumbLink = document.createElement('a');
            thumbLink.href = `https://www.roblox.com/developer-product/${universeId}/product/${productId}`;

            if (iconId) {
                const thumbContainer = document.createElement('span');
                thumbContainer.className =
                    'thumbnail-2d-container gear-passes-asset';
                thumbContainer.style.borderRadius = '8px';
                thumbContainer.style.overflow = 'hidden';
                thumbLink.appendChild(thumbContainer);

                const thumbData = thumbnailMap.get(iconId);
                if (thumbData) {
                    const thumbEl = createThumbnailElement(
                        thumbData,
                        name,
                        '',
                        { width: '100%', height: '100%', borderRadius: '0px' },
                    );
                    thumbContainer.innerHTML = '';
                    thumbContainer.appendChild(thumbEl);
                }
            }

            thumbSection.appendChild(thumbLink);

            const captionSection = document.createElement('div');
            captionSection.className = 'store-product-card-caption';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'store-product-card-name';
            nameDiv.title = name;
            nameDiv.textContent = name;

            const priceDiv = document.createElement('div');
            priceDiv.className = 'store-card-price';
            const robuxIcon = document.createElement('span');
            robuxIcon.className = 'icon-robux-16x16';
            const robuxText = document.createElement('span');
            robuxText.className = 'text-robux';
            robuxText.textContent = price.toString();
            priceDiv.appendChild(robuxIcon);
            priceDiv.appendChild(robuxText);

            const footerDiv = document.createElement('div');
            footerDiv.className = 'store-card-footer';

            const buyBtn = document.createElement('button');
            buyBtn.type = 'button';
            buyBtn.className =
                'PurchaseButton btn-buy-md btn-full-width rbx-gear-passes-purchase btn-primary-md btn-min-width';
            buyBtn.dataset.productId = productId;
            buyBtn.textContent = ts('privateGames.products.buy');
            buyBtn.disabled = true;

            footerDiv.appendChild(buyBtn);

            captionSection.appendChild(nameDiv);
            captionSection.appendChild(priceDiv);
            captionSection.appendChild(footerDiv);

            storeCard.appendChild(thumbSection);
            storeCard.appendChild(captionSection);
            li.appendChild(storeCard);
            devProductsList.appendChild(li);
        }
    });

    lastDevProductsContainer = devProductsContainer;
    lastDevProductsNoMsg = null;
}
