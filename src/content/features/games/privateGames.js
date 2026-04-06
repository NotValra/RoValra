import { callRobloxApiJson, callRobloxApi } from '../../core/api.js';
import {
    fetchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { createTab } from '../../core/ui/games/tab.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { ts } from '../../core/locale/i18n.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getAssets } from '../../core/assets.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { init as initGameBanner } from '../../core/ui/games/banner.js';
import {
    getReasonProhibitedDisplayText,
    getPlayabilityDisplayText,
    PLAYABILITY_STATUS_NAMES,
    toStatusCode,
} from '../../core/games/playabilityStatus.js';

function formatVoteCount(count) {
    count = Number(count) || 0;
    if (count >= 1000000) {
        return Math.floor(count / 1000000) + 'M+';
    } else if (count >= 1000) {
        return Math.floor(count / 1000) + 'K+';
    }
    return count.toString();
}

export function init() {
    chrome.storage.local.get(
        {
            privateGameDetectionEnabled: true,
        },
        async (data) => {
            if (!data.privateGameDetectionEnabled) return;

            const privateUrlMatch = window.location.pathname.match(
                /\/private-games\/(\d+)/,
            );
            if (privateUrlMatch) {
                const placeId = privateUrlMatch[1];
                const content = document.getElementById('content');
                if (content) {
                    content.innerHTML =
                        '<div class="rovalra-banned-loading"><div class="spinner spinner-default"></div></div>';
                }
                handlePrivateGame(placeId, data);
                return;
            }

            const placeId = getPlaceIdFromUrl();
            if (!placeId) return;

            const isErrorPage =
                window.location.pathname.includes('/request-error') ||
                document.title.includes('Page not found') ||
                document.title.includes('Roblox - Error') ||
                !!document.querySelector('.error-page-container');

            const isPrivateNotice = !!Array.from(
                document.querySelectorAll('h2, .content-default'),
            ).find(
                (el) =>
                    el.textContent.toLowerCase().includes('private') ||
                    el.textContent.toLowerCase().includes('permission'),
            );

            if (isErrorPage || isPrivateNotice) {
                handlePrivateGameRedirect(placeId, data);
            }
        },
    );
}

function handlePrivateGame(placeId, settings) {
    const newUrl = `https://www.roblox.com/private-games/${placeId}`;
    window.history.replaceState({}, '', newUrl);
    loadAndRenderPrivateGame(placeId, settings);
}

async function loadAndRenderPrivateGame(placeId, settings) {
    try {
        const placeDetails = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
        }).catch(() => null);

        const placeInfo = placeDetails?.[0];
        const universeId = placeInfo?.universeId;

        if (!universeId) {
            const fallbackGame = createFallbackGame(placeDetails);
            fallbackGame._playabilityStatus = null;
            renderPrivateGamePage(fallbackGame, placeId, settings);
            return;
        }

        let playabilityStatus = null;
        try {
            const playabilityData = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v1/games/multiget-playability-status?universeIds=${universeId}`,
            });
            if (playabilityData?.[0]) {
                const statusRaw = playabilityData[0].playabilityStatus;
                playabilityStatus = {
                    raw: statusRaw,
                    isPlayable: playabilityData[0].isPlayable || false,
                    displayText:
                        playabilityData[0].unplayableDisplayText || null,
                };
            }
        } catch (e) {
            console.warn('RoValra: Failed to fetch playability status', e);
        }

        const gameRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games?universeIds=1,${universeId}`,
        }).catch(() => null);

        const game = gameRes?.data?.find((g) => g.id === universeId);

        let cloudData = null;
        try {
            cloudData = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/cloud/v2/universes/${universeId}`,
                useApiKey: true,
                useBackground: true,
            });
        } catch (e) {
            console.warn('RoValra: Cloud API failed, using fallback data');
        }

        const gameData = game || createFallbackGame(placeDetails, cloudData);

        if (cloudData) {
            gameData.created = cloudData.createTime || gameData.created;
            gameData.updated = cloudData.updateTime || gameData.updated;
            gameData.ageRating = cloudData.ageRating || gameData.genre;
            gameData.voiceChatEnabled = cloudData.voiceChatEnabled || false;
            gameData._cloudData = cloudData;
            if (cloudData.displayName) {
                gameData.name = cloudData.displayName;
            }
            if (cloudData.description !== undefined) {
                gameData.description = cloudData.description;
            }
        }

        if (playabilityStatus) {
            gameData._playabilityStatus = playabilityStatus;
        }
        gameData._reasonProhibited = placeInfo?.reasonProhibited || null;
        gameData._placeId = placeId;

        if (!game || gameData.isFavoritedByUser === undefined) {
            try {
                const favRes = await callRobloxApiJson({
                    subdomain: 'games',
                    endpoint: `/v1/games/${universeId}/favorites`,
                });
                gameData.isFavoritedByUser = favRes?.isFavorited || false;
            } catch (e) {
                console.warn('RoValra: Failed to fetch favorites status');
                gameData.isFavoritedByUser = false;
            }
        }

        renderPrivateGamePage(gameData, placeId, settings);
    } catch (e) {
        console.error('RoValra: Failed to fetch info for private game', e);
        const fallbackGame = createFallbackGame(null, null);
        renderPrivateGamePage(fallbackGame, placeId, settings);
    }
}

function createFallbackGame(placeDetails, cloudData) {
    const placeInfo = Array.isArray(placeDetails)
        ? placeDetails[0]
        : placeDetails;

    return {
        id: placeInfo?.universeId || 0,
        universeId: placeInfo?.universeId || 0,
        name: placeInfo?.name || 'Private Experience',
        description: placeInfo?.description || 'This experience is private.',
        creator: {
            id: placeInfo?.builderId || 0,
            name: placeInfo?.builder || 'Unknown',
            type: 'User',
            hasVerifiedBadge: placeInfo?.hasVerifiedBadge || false,
        },
        playing: null,
        favoritedCount: null,
        visits: null,
        maxPlayers: placeInfo?.maxPlayers || null,
        genre: placeInfo?.genre || null,
        created: cloudData?.createTime || null,
        updated: cloudData?.updateTime || null,
        isFavoritedByUser: false,
        voiceChatEnabled: cloudData?.voiceChatEnabled ?? null,
        ageRating: cloudData?.ageRating || null,
    };
}

function handlePrivateGameRedirect(placeId, settings) {
    const content = document.getElementById('content');
    if (content) {
        content.innerHTML =
            '<div class="rovalra-banned-loading"><div class="spinner spinner-default"></div></div>';
    }

    const newUrl = `https://www.roblox.com/private-games/${placeId}`;
    window.history.replaceState({}, '', newUrl);

    loadAndRenderPrivateGame(placeId, settings);
}

function showStatusBannerForPlayabilityStatus(status) {
    const statusCode = toStatusCode(status.raw);

    const statusName = PLAYABILITY_STATUS_NAMES[statusCode] || 'Unknown';

    const bannerText =
        status.displayText || getPlayabilityDisplayText(statusCode);

    const showBanner = (retries = 0) => {
        const banner = document.getElementById('rovalra-game-notice-banner');
        if (banner && window.GameBannerManager) {
            const assets = getAssets();
            const icon =
                statusName === 'UnderReview' ? assets.BlockIcon : assets.lock;
            window.GameBannerManager.addNotice(bannerText, icon);
        } else if (retries < 30) {
            setTimeout(() => showBanner(retries + 1), 100);
        }
    };
    showBanner();
}

function showStatusBannerForReason(reason) {
    const displayText = getReasonProhibitedDisplayText(reason);

    const showBanner = (retries = 0) => {
        const banner = document.getElementById('rovalra-game-notice-banner');
        if (banner && window.GameBannerManager) {
            const assets = getAssets();
            const icon =
                reason === 'UnderReview' ? assets.BlockIcon : assets.lock;
            window.GameBannerManager.addNotice(displayText, icon);
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
    } else if (game._reasonProhibited) {
        showStatusBannerForReason(game._reasonProhibited);
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

    const voiceChatEnabled = universeDetails?.voiceChatEnabled || false;

    const totalVotes = upVotes + downVotes;
    const likeRatio =
        totalVotes > 0 ? Math.floor((upVotes / totalVotes) * 100) : 0;

    const assets = getAssets();

    content.innerHTML = DOMPurify.sanitize(`
        <div id="game-detail-page" class="row page-content inline-social" data-place-id="${placeId}" style="max-width: 970px;">
            <div class="col-xs-12 section-content game-main-content remove-panel">
                <div class="rovalra-game-hero">
                    <div class="game-details-carousel-container">
                        <div class="thumbnail-2d-container shimmer carousel-item carousel-item-active" style="border-radius: 8px;"></div>
                    </div>
                    <div class="game-calls-to-action">
                        <div class="game-title-container">
                            <h1 class="game-name" title="${game.name}">${game.name}</h1>
                            <div class="game-creator with-verified-badge">
                                <span class="text-label">By</span>
                                <a class="text-name text-overflow" href="https://www.roblox.com/${game.creator.type === 'Group' ? 'communities' : 'users'}/${game.creator.id}">${game.creator.name}</a>
                                ${game.creator.hasVerifiedBadge ? `<span><span role="button" tabindex="0" data-rblx-verified-badge-icon="" data-rblx-badge-icon="true" class="css-1myerb2-imgWrapper"><img class="verified-badge-icon-experience-creator" src="${assets.verifiedBadgeMono}" title="Verified Badge Icon" alt="Verified Badge Icon"></span></span>` : ''}
                            </div>
                        </div>
                        <div class="game-buttons-container">
                            <div class="game-details-play-button-container">
                                <button type="button" class="btn-common-play-game-lg btn-primary-md btn-full-width" disabled>
                                    <span class="icon-common-play"></span>
                                </button>
                            </div>
                        <ul class="favorite-follow-vote-share rovalra-private-actions">
                            <li class="game-favorite-button-container">
                                <div class="tooltip-container" data-toggle="tooltip" title="Add to Favorites">
                                    <div class="favorite-button" id="rovalra-favorite-btn" data-universe-id="${game.id}">
                                        <div id="game-favorite-icon" class="icon-favorite rovalra-action-icon${isFavoritedByUser ? ' favorited' : ''}"></div>
                                        <div id="game-favorite-icon-label" class="icon-label rovalra-action-label">${isFavoritedByUser ? 'Favorited' : 'Favorite'}</div>
                                    </div>
                                </div>
                            </li>
                            <li class="game-follow-button-container">
                                <div class="tooltip-container" data-toggle="tooltip" title="Turn on Notifications">
                                    <div class="follow-button">
                                        <div id="game-follow-icon" class="icon-notifications-bell rovalra-action-icon"></div>
                                        <div id="game-follow-icon-label" class="icon-label rovalra-action-label">Notify</div>
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
    fetchThumbnails([{ id: placeId }], 'GameThumbnail', '768x432').then(
        (map) => {
            const thumbData = map.get(Number(placeId));
            if (thumbData && thumbnailContainer) {
                const thumbEl = createThumbnailElement(
                    thumbData,
                    game.name,
                    'carousel-item carousel-item-active',
                    { width: '100%', height: '100%' },
                );
                if (thumbEl) {
                    thumbnailContainer.innerHTML = '';
                    thumbnailContainer.appendChild(thumbEl);
                } else if (thumbData.state === 'Blocked') {
                    thumbnailContainer.className =
                        'thumbnail-2d-container icon-blocked carousel-item carousel-item-active';
                    thumbnailContainer.style.borderRadius = '8px';
                }
            }
        },
    );

    const tabsContainer = document.getElementById('horizontal-tabs');
    const tabContentContainer = document.querySelector('.tab-content');

    const aboutTab = createTab({
        id: 'about',
        label: ts('tabs.about') || 'About',
        container: tabsContainer,
        contentContainer: tabContentContainer,
        hash: '#!/about',
    });
    aboutTab.tab.classList.add('active');
    aboutTab.contentPane.classList.add('active');

    const descriptionText =
        universeDetails?.description ||
        game.description ||
        'No description available.';

    aboutTab.contentPane.innerHTML = DOMPurify.sanitize(`
        <div class="game-details-about-tab-container">
            <div class="game-about-tab-container">
                <div class="game-description-container">
                    <div class="container-header"><h2>Description</h2></div>
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
                            <p class="text-label text-overflow font-caption-header">Active</p>
                            <p class="text-lead font-caption-body">${game.playing !== null ? game.playing.toLocaleString() : 'Unknown'}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Favorites</p>
                            <p class="text-lead font-caption-body">${game.favoritedCount !== null ? game.favoritedCount.toLocaleString() : 'Unknown'}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Visits</p>
                            <p class="text-label text-lead font-caption-body">${game.visits !== null ? game.visits.toLocaleString() : 'Unknown'}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Max Players</p>
                            <p class="text-lead font-caption-body">${game.maxPlayers !== null ? game.maxPlayers.toLocaleString() : 'Unknown'}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Genre</p>
                            <p class="text-label text-lead font-caption-body">${game.genre !== null ? game.genre : 'Unknown'}</p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Created</p>
                            <p class="text-lead font-caption-body" id="rovalra-created-date"></p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Updated</p>
                            <p class="text-lead font-caption-body" id="rovalra-updated-date"></p>
                        </li>
                        <li class="game-stat">
                            <p class="text-label text-overflow font-caption-header">Voice Chat</p>
                            <p class="text-lead font-caption-body">${voiceChatEnabled === true ? 'Supported' : voiceChatEnabled === false ? 'Unsupported' : 'Unknown'}</p>
                        </li>
                    </ul>
                    <div class="game-description-footer">
                        <a class="text-report" href="/report-abuse/?targetId=${placeId}&abuseVector=place">Report Abuse</a>
                    </div>
                </div>
                <div class="stack badge-container game-badges-list" id="rovalra-badges-section">
                    <div class="container-header"><h3>Badges</h3></div>
                    <ul class="stack-list" id="rovalra-game-badges"></ul>
                </div>
            </div>
        </div>
    `);

    const storeTab = createTab({
        id: 'store',
        label: ts('tabs.store') || 'Store',
        container: tabsContainer,
        contentContainer: tabContentContainer,
        hash: '#!/store',
    });

    storeTab.contentPane.innerHTML = DOMPurify.sanitize(`
        <div id="rbx-game-passes" class="container-list game-dev-store game-passes">
            <div class="container-header"><h3>Passes</h3></div>
            <ul id="rovalra-passes-list" class="hlist store-cards gear-passes-container"></ul>
        </div>
    `);

    let badgesLoaded = false;
    let passesLoaded = false;

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

    setupFavoriteButton(game.id, isFavoritedByUser);

    loadBadges(game.universeId || game.id);
    badgesLoaded = true;

    const checkHashAndShowTab = () => {
        const hash = window.location.hash;
        if (hash.includes('#!/store')) {
            aboutTab.tab.classList.remove('active');
            aboutTab.contentPane.classList.remove('active');
            storeTab.tab.classList.add('active');
            storeTab.contentPane.classList.add('active');
            if (!passesLoaded) {
                passesLoaded = true;
                loadPasses(game.universeId || game.id);
            }
        } else {
            storeTab.tab.classList.remove('active');
            storeTab.contentPane.classList.remove('active');
            aboutTab.tab.classList.add('active');
            aboutTab.contentPane.classList.add('active');
        }
    };

    if (!window.location.hash || !window.location.hash.includes('#!')) {
        window.location.hash = '#!/about';
    }

    window.addEventListener('hashchange', checkHashAndShowTab);
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

    function updateFavoriteUI(favorited) {
        const icon = document.getElementById('game-favorite-icon');
        const label = document.getElementById('game-favorite-icon-label');
        const tooltip = favBtn.closest('.tooltip-container');

        if (icon) {
            if (favorited) {
                icon.classList.add('favorited');
            } else {
                icon.classList.remove('favorited');
            }
        }
        if (label) {
            label.textContent = favorited ? 'Favorited' : 'Favorite';
        }
        if (tooltip) {
            tooltip.setAttribute(
                'title',
                favorited ? 'Remove from Favorites' : 'Add to Favorites',
            );
            tooltip.setAttribute(
                'data-original-title',
                favorited ? 'Remove from Favorites' : 'Add to Favorites',
            );
        }
    }
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

        const thumbMap = await fetchThumbnails(
            badges.map((b) => ({ id: b.id })),
            'BadgeIcon',
            '150x150',
        );

        if (badges.length === 0) {
            const noBadgesMsg = document.createElement('p');
            noBadgesMsg.style.padding = '10px';
            noBadgesMsg.style.color = 'var(--rovalra-secondary-text-color)';
            noBadgesMsg.textContent = 'No badges yet';
            container.parentElement.parentElement?.after?.(noBadgesMsg);
            return;
        }

        badges.forEach((badge) => {
            const thumb = thumbMap.get(badge.id);
            const li = document.createElement('li');
            li.className = 'stack-row badge-row';
            li.innerHTML = DOMPurify.sanitize(`
                <div class="badge-image">
                    <a href="https://www.roblox.com/badges/${badge.id}/${encodeURIComponent(badge.name)}">
                        <span class="thumbnail-2d-container badge-image-container">
                            <img class="" src="${thumb?.imageUrl || ''}" alt="${badge.name}" title="${badge.name}">
                        </span>
                    </a>
                </div>
                <div class="badge-content">
                    <div class="badge-data-container">
                        <div class="font-header-2 badge-name">${badge.name}</div>
                        <p class="para-overflow">${badge.description || ''}</p>
                    </div>
                </div>
            `);
            container.appendChild(li);
        });
    } catch (e) {
        console.warn('RoValra: Failed to load badges', e);
    }
}

async function loadPasses(universeId) {
    const list = document.getElementById('rovalra-passes-list');
    if (!list) return;

    try {
        const res = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/universes/${universeId}/game-passes?pageSize=50&passView=Full`,
        });
        const passes = res?.data || [];
        if (passes.length === 0) {
            const container = document.getElementById('rbx-game-passes');
            if (container) container.remove();
            return;
        }

        passes.forEach((pass) => {
            const passData = pass.pass || pass;
            const price = pass.priceInRobux || pass.price || 0;
            const iconId = passData.iconImageAssetId || passData.icon?.id;

            const li = document.createElement('li');
            li.className = 'list-item rbx-passes-item-container';

            if (iconId) {
                fetchThumbnails([{ id: iconId }], 'Asset', '150x150').then(
                    (map) => {
                        const thumbData = map.get(iconId);
                        const img = li.querySelector('.thumbnail');
                        if (img && thumbData?.imageUrl) {
                            img.src = thumbData.imageUrl;
                        }
                    },
                );
            }

            li.innerHTML = DOMPurify.sanitize(`
                <div class="store-card">
                    <div class="store-product-card-thumbnail">
                        <a href="https://www.roblox.com/game-pass/${passData.id}/-">
                            <span class="thumbnail-2d-container gear-passes-asset">
                                <img class="thumbnail" src="" alt="${passData.name}" title="${passData.name}">
                            </span>
                        </a>
                    </div>
                    <div class="store-product-card-caption">
                        <div class="store-product-card-name" title="${passData.name}">${passData.name}</div>
                        <div class="store-card-price">
                            <span class="icon-robux-16x16"></span>
                            <span class="text-robux">${price}</span>
                        </div>
                    </div>
                </div>
            `);
            list.appendChild(li);
        });
    } catch (e) {}
}
