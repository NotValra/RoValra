import { callRobloxApiJson } from '../../core/api.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
    fetchUserThumbnailWithApiKey,
    renderAvatarThumbnail,
} from '../../core/thumbnail/thumbnails.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';
import { createFriendTile } from '../../core/ui/profile/userCard.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { getAssets } from '../../core/assets.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { formatPlayerCount } from '../../core/games/playerCount.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { ts } from '../../core/locale/i18n.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import {
    loadAssetTypeIds,
    createCategorizedWearingSection,
    assetInfoCache,
    addItemToCategoryView,
    enableAllCategories,
} from './categorizeWearing.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';

export function init() {
    chrome.storage.local.get(
        {
            bannedUserDetectionEnabled: false,
            categorizeWearingEnabled: true,
        },
        async (data) => {
            if (!data.bannedUserDetectionEnabled) return;

            const bannedUrlMatch = window.location.pathname.match(
                /\/banned-users\/(\d+)\/profile/,
            );
            if (bannedUrlMatch) {
                const userId = bannedUrlMatch[1];
                const content = document.getElementById('content');
                if (content) {
                    content.innerHTML =
                        '<div class="rovalra-banned-loading"><div class="spinner spinner-default"></div></div>';
                }

                try {
                    const profileRes = await callRobloxApiJson({
                        subdomain: 'apis',
                        endpoint:
                            '/user-profile-api/v1/user/profiles/get-profiles',
                        method: 'POST',
                        body: {
                            userIds: [userId],
                            fields: [
                                'names.combinedName',
                                'isVerified',
                                'names.username',
                            ],
                        },
                    }).catch(() => null);

                    const profile = (profileRes?.profileDetails || [])[0];

                    const userRes = await callRobloxApiJson({
                        subdomain: 'users',
                        endpoint: `/v1/users/${userId}`,
                        method: 'GET',
                    }).catch(() => null);

                    if (userRes && !userRes.isBanned) {
                        window.location.replace(
                            `https://www.roblox.com/users/${userId}/profile`,
                        );
                        return;
                    }

                    if (userRes && userRes.isBanned) {
                        userRes.isVerified = profile?.isVerified || false;
                        userRes.isAccountForgotten =
                            userRes?.name === 'Account Forgotten';
                        renderBannedUserProfile(userRes, data);
                    } else if (profile) {
                        renderBannedUserProfile(
                            {
                                id: parseInt(userId),
                                displayName:
                                    profile.names?.combinedName ||
                                    'Account Forgotten',
                                name:
                                    profile.names?.username ||
                                    'Account Forgotten',
                                isVerified: profile.isVerified || false,
                                description: '',
                                created: '',
                                isBanned: true,
                                isAccountForgotten: true,
                            },
                            data,
                        );
                    }
                } catch (e) {
                    console.error('RoValra: Failed to fetch info', e);
                }
                return;
            }

            const isErrorPage =
                window.location.pathname.includes('/request-error') ||
                document.title.includes('Page not found') ||
                !!document.querySelector('.error-page-container');

            function handleBannedRedirect(userId) {
                const content = document.getElementById('content');
                if (content) {
                    content.innerHTML =
                        '<div class="rovalra-banned-loading"><div class="spinner spinner-default"></div></div>';
                }

                callRobloxApiJson({
                    subdomain: 'users',
                    endpoint: `/v1/users/${userId}`,
                    method: 'GET',
                })
                    .catch(() => null)
                    .then(async (user) => {
                        const profileRes = await callRobloxApiJson({
                            subdomain: 'apis',
                            endpoint:
                                '/user-profile-api/v1/user/profiles/get-profiles',
                            method: 'POST',
                            body: {
                                userIds: [userId],
                                fields: [
                                    'names.combinedName',
                                    'isVerified',
                                    'names.username',
                                ],
                            },
                        }).catch(() => null);

                        const profile = (profileRes?.profileDetails || [])[0];

                        if (user && !user.isBanned) {
                            window.location.replace(
                                `https://www.roblox.com/users/${userId}/profile`,
                            );
                            return;
                        }

                        if (user && user.isBanned) {
                            user.isVerified = profile?.isVerified || false;

                            const newUrl = `https://www.roblox.com/banned-users/${user.id}/profile`;
                            window.history.replaceState({}, '', newUrl);

                            renderBannedUserProfile(user, data);
                        } else if (profile) {
                            const syntheticUser = {
                                id: parseInt(userId),
                                displayName:
                                    profile.names?.combinedName ||
                                    'Account Forgotten',
                                name:
                                    profile.names?.username ||
                                    'Account Forgotten',
                                isVerified: profile.isVerified || false,
                                description: '',
                                created: '',
                                isBanned: true,
                                isAccountForgotten: true,
                            };
                            const newUrl = `https://www.roblox.com/banned-users/${syntheticUser.id}/profile`;
                            window.history.replaceState({}, '', newUrl);
                            renderBannedUserProfile(syntheticUser, data);
                        }
                    });
            }

            chrome.runtime.sendMessage(
                { action: 'getBannedUserRedirect' },
                (response) => {
                    if (response && response.userId) {
                        handleBannedRedirect(response.userId);
                        return;
                    }

                    if (!isErrorPage) return;

                    chrome.runtime.sendMessage(
                        { action: 'getBannedUserRedirect' },
                        (r2) => {
                            if (r2 && r2.userId)
                                handleBannedRedirect(r2.userId);
                        },
                    );
                },
            );
        },
    );
}

async function renderBannedUserProfile(user, settings) {
    const content = document.getElementById('content');
    if (!content) return;

    const computedBg = getComputedStyle(content).backgroundColor;
    if (
        computedBg &&
        computedBg !== 'transparent' &&
        computedBg !== 'rgba(0, 0, 0, 0)'
    ) {
        content.style.backgroundColor = 'transparent';
        content.style.backgroundImage = 'none';
    }

    injectStylesheet('css/bannedusers.css', 'rovalra-bannedusers-css');
    document.title = `${user.displayName} (@${user.name}) - Roblox`;

    const headshotData = await fetchUserThumbnailWithApiKey(user.id);
    const assets = getAssets();

    const renderStyles = {
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        display: 'block',
        margin: '0 auto',
    };

    let fullAvatarUrl = assets.brokenAvatar;
    let isInitiallyBroken = true;

    if (headshotData && headshotData.imageUrl) {
        fullAvatarUrl = headshotData.imageUrl
            .replace(/AvatarHeadshot/g, 'Avatar')
            .replace(/150\/150/g, '420/420')
            .replace(/\/Png\/?$/, '/Png/noFilter')
            .replace(/\/isCircular$/, '/noFilter');
        isInitiallyBroken = false;
    }

    const getStatPillHtml = (id, label, url) => `
        <a href="${url}" class="relative clip group/interactable focus-visible:outline-focus cursor-pointer relative flex justify-center items-center radius-circle stroke-none padding-left-medium padding-right-medium height-800 text-label-medium bg-shift-300 content-action-utility" style="text-decoration: none;">
            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)]"></div>
            <span class="padding-y-xsmall text-no-wrap text-truncate-end"><span id="${id}" class="shimmer rovalra-stat-placeholder"></span> ${label}</span>
        </a>
    `;

    content.innerHTML = '';
    content.innerHTML = DOMPurify.sanitize(`
        <div class="profile-platform-container" data-profile-type="User" data-profile-id="${user.id}" style="width: 970px; margin: 0 auto;">
            <div class="sg-system-feedback">
                <div class="alert-system-feedback"><div class="alert"><span class="alert-content"></span></div></div>
            </div>

                <div class="relative flex flex-col items-center" style="height: 300px; width: 100%;">
                <div class="profile-avatar-gradient" style="width: 100%; height: 300px;">
                    <div style="background: var(--rovalra-profile-main-gradient); width: 100vw; margin-left: calc(50% - 50vw); height: 300px; margin-top: -24px; position: relative; background-color: var(--rovalra-profile-header-bg); padding: 0 12px;"></div>
                    <div class="cover-gradient-overlay" style="position: absolute; bottom: 0; width: 100vw; margin-left: calc(50% - 50vw); left: 0; height: 64px; z-index: 10; pointer-events: none; mask-image: linear-gradient(rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 40%, rgba(255,255,255,.8) 60%, #fff 100%); background: var(--rovalra-profile-overlay-gradient);"></div>
                </div>
                    <div class="thumbnail-holder" style="position: absolute; top: -25px; left: 0; right: 0; bottom: 0; z-index: 1; display: flex; justify-content: center; align-items: center; pointer-events: none; overflow: hidden; height: 300px;">
                        <div class="thumbnail-3d-container" style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;">
                            <div id="rovalra-banned-avatar-wrapper" class="avatar-thumbnail-container" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; max-width: 100%; max-height: 100%;">
                        </div>
                    </div>
                </div>
            </div>

            <div style="width: 100%; position: relative; margin-top: -64px; z-index: 20;">
                <div id="user-profile-header-bg" style="max-width: 1140px; margin: 0 auto;">
                    <div class="user-profile-header flex flex-col gap-large" style="padding: 0 15px;">
                        <div class="user-profile-header-info flex justify-between items-center">
                            <div class="flex gap-medium items-center min-width-0">
                                <div id="rovalra-banned-avatar-container" class="user-profile-header-details-avatar-container avatar-headshot-lg" style="width: 120px; height: 120px; min-width: 120px;">
                                    <div class="avatar avatar-card-fullbody">
                                        <div id="rovalra-banned-headshot-placeholder"></div>
                                        <div class="avatar-status">
                                            <span data-testid="presence-icon" class="offline icon-offline" title="${ts('bannedUsers.bannedStatus')}"></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex flex-col min-width-0">
                                    <span class="items-center gap-xsmall flex min-width-0">
                                        <span id="profile-header-title-container-name" class="text-heading-large min-width-0 text-truncate-end text-no-wrap">${user.displayName}${user.isVerified ? `<img src="${assets.verifiedBadgeMono}" alt="" style="width: 20px; height: 20px; flex-shrink: 0; margin-left: 6px; vertical-align: middle; color: var(--rovalra-playbutton-color);">` : ''}</span>
                                    </span>
                                    <div class="min-width-0"><span class="stylistic-alts-username text-truncate-end text-no-wrap block">@${user.name}</span></div>
                                </div>
                            </div>
                        </div>
                        <div id="rovalra-banned-stat-pills" class="flex-nowrap gap-small flex">
                            ${getStatPillHtml('rovalra-banned-friends-count', ts('bannedUsers.connections'), `/users/${user.id}/friends#!/friends`)}
                            ${getStatPillHtml('rovalra-banned-followers-count', ts('bannedUsers.followers'), `/users/${user.id}/friends#!/followers`)}
                            ${getStatPillHtml('rovalra-banned-following-count', ts('bannedUsers.following'), `/users/${user.id}/friends#!/following`)}
                        </div>
                        <div><pre class="content-default text-body-medium description-content" style="white-space: pre-wrap; word-break: break-word;">${user.description || ''}</pre></div>
                        ${
                            user.created
                                ? `<div id="rovalra-banned-join-date" class="content-default text-body-medium" style="margin-top: 4px; display: flex; gap: 4px; align-items: center;">
                            <span style="color: var(--rovalra-main-text-color);">${ts('bannedUsers.joinedDate')}:</span>
                        </div>`
                                : ''
                        }
                    </div>
                </div>
            </div>

            <div style="max-width: 1140px; margin: 0 auto; padding: 0 15px;">
                <ul class="profile-tabs flex">
                    <li class="justify-center flex fill"><a id="rovalra-banned-tab-about-link" href="#rovalra-banned-about-content" class="profile-tab active justify-center text-label-medium flex fill">${ts('bannedUsers.about')}</a></li>
                    <li class="justify-center flex fill"><a id="rovalra-banned-tab-creations-link" href="#rovalra-banned-creations-content" class="profile-tab justify-center text-label-medium flex fill">${ts('bannedUsers.creations')}</a></li>
                </ul>
                <div class="profile-tab-content-wrapper padding-top-xxlarge">
                    <div id="rovalra-banned-about-content" class="tab-pane active">
                        <div id="rovalra-banned-sections-container">
                            <div id="rovalra-banned-wearing-container"></div>
                            <div id="rovalra-banned-store-container"></div>
                            <div id="rovalra-banned-favorites-container"></div>
                            <div id="rovalra-banned-friends-container"></div>
                            <div id="rovalra-banned-groups-container"></div>
                            <div id="rovalra-banned-badges-container"></div>
                        </div>
                    </div>
                    <div id="rovalra-banned-creations-content" class="tab-pane">
                        <div class="profile-game section container-list">
                            <div class="container-header"><h3>${ts('bannedUsers.experiences')}</h3></div>
                            <div class="game-grid"><ul id="rovalra-banned-creations-list" class="hlist game-cards" style="display: flex; flex-wrap: wrap; gap: 12px; list-style: none; padding: 0;"></ul></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    const avatarWrapper = content.querySelector(
        '#rovalra-banned-avatar-wrapper',
    );

    const updateAvatarUI = (data, style) => {
        avatarWrapper.innerHTML = '';
        const el = createThumbnailElement(
            data,
            user.displayName,
            'no-background-thumbnail',
            style,
        );
        avatarWrapper.appendChild(el);
        return el;
    };

    const handleRenderFallback = () => {
        const renderThumb = renderAvatarThumbnail
            ? renderAvatarThumbnail(user.id)
            : null;
        if (!renderThumb) return;

        const originalPromise = renderThumb.finalUpdate;
        if (!originalPromise) {
            updateAvatarUI(renderThumb, renderStyles);
            return;
        }

        renderThumb.finalUpdate = originalPromise.then((result) => {
            if (result) return result;

            if (user.isAccountForgotten) return null;

            return {
                state: 'Completed',
                imageUrl: assets.brokenAvatar,
                thumbnailType: 'Avatar',
            };
        });

        updateAvatarUI(renderThumb, renderStyles);
    };

    if (isInitiallyBroken) {
        handleRenderFallback();
    } else {
        const primaryImg = updateAvatarUI(
            {
                state: 'Completed',
                imageUrl: fullAvatarUrl,
                thumbnailType: 'Avatar',
            },
            renderStyles,
        );

        primaryImg.addEventListener(
            'error',
            () => {
                handleRenderFallback();
            },
            { once: true },
        );
    }

    const currentUser = content.querySelector('.profile-platform-container')
        ?.dataset.profileId;

    const redirectBannedUrl = (e) => {
        if (!currentUser) return;
        e.preventDefault();
        const bannedUrl = `/banned-users/${currentUser}/profile`;
        window.history.pushState({}, '', bannedUrl);
    };

    const tabLinks = content.querySelectorAll('.profile-tab');
    const tabPanes = content.querySelectorAll('.tab-pane');
    tabLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetTabId = link.getAttribute('href').substring(1);
            tabLinks.forEach((tab) => tab.classList.remove('active'));
            tabPanes.forEach((pane) => {
                pane.classList.remove('active');
                pane.style.display = 'none';
            });
            link.classList.add('active');
            const activePane = document.getElementById(targetTabId);
            if (activePane) {
                activePane.classList.add('active');
                activePane.style.display = 'block';
            }
        });
    });

    content
        .querySelectorAll('#rovalra-banned-groups-list a')
        .forEach((link) => {
            link.addEventListener('click', (e) => redirectBannedUrl(e));
        });

    const seeAllLink = content.querySelector(
        '#friends-carousel-container .btn-more',
    );
    if (seeAllLink) {
        seeAllLink.addEventListener('click', (e) => redirectBannedUrl(e));
    }

    const nameHeader = document.getElementById(
        'profile-header-title-container-name',
    );
    if (nameHeader) {
        const lockIcon = document.createElement('div');
        const tooltipText = user.isAccountForgotten
            ? ts('bannedUsers.accountForgotten')
            : ts('quickSearch.permanentlyBanned');
        addTooltip(lockIcon, tooltipText, {
            position: 'bottom',
        });
        Object.assign(lockIcon.style, {
            width: '20px',
            height: '20px',
            display: 'inline-block',
            verticalAlign: 'middle',
            marginLeft: '8px',
            flexShrink: '0',
            backgroundColor: 'var(--rovalra-secondary-text-color)',
            webkitMask: `url("${assets.lock}") no-repeat center / contain`,
            mask: `url("${assets.lock}") no-repeat center / contain`,
        });
        nameHeader.appendChild(lockIcon);
    }

    const headshotPlaceholder = document.getElementById(
        'rovalra-banned-headshot-placeholder',
    );
    if (headshotPlaceholder) {
        const headshotEl = createThumbnailElement(
            headshotData,
            user.displayName,
            'avatar-card-image',
            { width: '120px', height: '120px' },
        );
        headshotPlaceholder.replaceWith(headshotEl);
    }

    const joinDatePlaceholder = document.getElementById(
        'rovalra-banned-join-date',
    );
    if (joinDatePlaceholder && user.created) {
        const timestamp = createInteractiveTimestamp(user.created);
        joinDatePlaceholder.appendChild(timestamp);
    }

    loadStats(user.id);
    loadCurrentlyWearing(user.id);
    loadStore(user.id, user.name);
    loadFavorites(user.id);
    loadFriends(user.id);
    loadGroups(user.id);
    loadBadges(user.id);
    loadExperiences(user.id);

    document.dispatchEvent(new CustomEvent('rovalra-theme-update'));
}

async function loadStats(userId) {
    try {
        const [friendsRes, followersRes, followingsRes] = await Promise.all([
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${userId}/friends/count`,
            }).catch(() => ({ count: 0 })),
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${userId}/followers/count`,
            }).catch(() => ({ count: 0 })),
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${userId}/followings/count`,
            }).catch(() => ({ count: 0 })),
        ]);

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const updateCount = (id, count) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = count.toLocaleString();
                el.classList.remove('shimmer', 'rovalra-stat-placeholder');
            }
        };

        updateCount('rovalra-banned-friends-count', friendsRes?.count || 0);
        updateCount('rovalra-banned-followers-count', followersRes?.count || 0);
        updateCount(
            'rovalra-banned-following-count',
            followingsRes?.count || 0,
        );
    } catch (e) {}
}

async function loadCurrentlyWearing(userId) {
    try {
        const wearingRes = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v1/users/${userId}/currently-wearing`,
        }).catch(() => null);
        const assetIds = wearingRes?.assetIds || [];
        if (assetIds.length === 0) return;

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const container = document.getElementById(
            'rovalra-banned-wearing-container',
        );
        if (!container) return;

        enableAllCategories();
        await loadAssetTypeIds();
        const wearingSection = createCategorizedWearingSection();
        container.replaceWith(wearingSection);

        const catalogResponse = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/look-api/v1/looks/purchase-details',
            method: 'POST',
            body: { assets: assetIds.map((id) => ({ id })) },
        }).catch(() => null);

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        if (catalogResponse?.look?.items) {
            const processedIds = new Set();
            catalogResponse.look.items.forEach((item) => {
                if (item.itemType === 'Bundle' && item.assetsInBundle) {
                    item.assetsInBundle.forEach((bAsset) => {
                        if (bAsset.id && bAsset.assetType) {
                            assetInfoCache.set(bAsset.id, {
                                id: bAsset.id,
                                assetType: { id: bAsset.assetType },
                            });
                            if (assetIds.includes(bAsset.id)) {
                                addItemToCategoryView(null, bAsset.id);
                                processedIds.add(bAsset.id);
                            }
                        }
                    });
                }
                let typeId = item.assetType || item.assetTypeId;
                if (typeId && typeof typeId === 'object') typeId = typeId.id;
                if (item.id && typeId) {
                    assetInfoCache.set(item.id, {
                        id: item.id,
                        assetType: { id: typeId },
                    });
                    if (assetIds.includes(item.id)) {
                        addItemToCategoryView(null, item.id);
                        processedIds.add(item.id);
                    }
                }
            });
            assetIds.forEach((id) => {
                if (!processedIds.has(id)) addItemToCategoryView(null, id);
            });
        } else {
            assetIds.forEach((id) => addItemToCategoryView(null, id));
        }
    } catch (e) {}
}

async function loadStore(userId, creatorName) {
    try {
        const container = document.getElementById(
            'rovalra-banned-store-container',
        );
        if (!container) return;

        container.innerHTML = DOMPurify.sanitize(`
            <div class="profile-favorite-experiences" style="margin-top: 24px;">
                <div class="profile-carousel">
                    <div class="css-17g81zd-collectionCarouselContainer">
                        <div style="margin-bottom: 12px;">
                            <a href="https://www.roblox.com/catalog?taxonomy=${encodeURIComponent('tZsUsd2BqGViQrJ9Vs3Wah')}&CreatorName=${encodeURIComponent(creatorName)}&salesTypeFilter=1" class="items-center inline-flex" target="_blank" style="text-decoration: none; cursor: pointer; text-align: center;">
                                <h2 class="content-emphasis text-heading-small padding-none inline-block" style="margin: 0;">${ts('bannedUsers.store')}</h2>
                                <span class="icon-chevron-heavy-right" style="margin-left: 4px;"></span>
                            </a>
                        </div>
                        <div id="rovalra-banned-store-list" style="display: flex; flex-wrap: wrap; gap: 12px;"></div>
                    </div>
                </div>
            </div>
        `);

        const storeList = document.getElementById('rovalra-banned-store-list');

        const res = await callRobloxApiJson({
            subdomain: 'catalog',
            endpoint: `/v2/search/items/details?taxonomy=${encodeURIComponent('tZsUsd2BqGViQrJ9Vs3Wah')}&creatorName=${encodeURIComponent(creatorName)}&salesTypeFilter=1&limit=10`,
        }).catch(() => null);

        if (!res?.data?.length) {
            container.remove();
            return;
        }

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const allItems = res.data.slice(0, 6);
        const assetIds = allItems.map((i) => i.id);
        const thumbs = await getBatchThumbnails(assetIds, 'Asset', '150x150');
        const thumbMap = new Map(thumbs.map((t) => [t.targetId, t]));

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        allItems.forEach((item) => {
            const card = createItemCard(
                {
                    assetId: item.id,
                    name: item.name,
                    price:
                        item.price != null && item.price > 0 ? item.price : 0,
                    recentAveragePrice:
                        item.price != null && item.price > 0 ? item.price : 0,
                    itemRestrictions: item.itemRestrictions || [],
                    itemType: item.itemType || 'Asset',
                    isOnHold: false,
                    bundleId: null,
                },
                thumbMap,
                { showSerial: false },
            );
            const wrapper = document.createElement('div');
            wrapper.style.width = '150px';
            wrapper.style.flexShrink = '0';
            wrapper.appendChild(card);
            storeList.appendChild(wrapper);
        });
    } catch (e) {}
}

async function loadFavorites(userId) {
    try {
        const favoritesRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v2/users/${userId}/favorite/games?limit=10&sortOrder=Desc`,
        }).catch(() => null);
        const favoriteGames = favoritesRes?.data || [];
        if (favoriteGames.length === 0) return;
        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const container = document.getElementById(
            'rovalra-banned-favorites-container',
        );
        if (!container) return;

        container.innerHTML = `
            <div class="profile-favorite-experiences" style="margin-top: 24px;">
                <div class="profile-carousel">
                    <div class="css-17g81zd-collectionCarouselContainer">
                        <div style="margin-bottom: 12px;">
                            <div class="items-center inline-flex">
                                <h2 class="content-emphasis text-heading-small padding-none inline-block" style="margin: 0;">${ts('bannedUsers.favorites')}</h2>
                            </div>
                        </div>
                        <div class="css-1jynqc0-carouselContainer" style="overflow: show; max-width: 100%; margin: 0;">
                            <div id="rovalra-banned-favorites-list" class="css-1i465w8-carousel" style="display: flex; gap: 12px; width: max-content;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `; // Verified

        const favoritesList = document.getElementById(
            'rovalra-banned-favorites-list',
        );
        favoritesList.innerHTML = '';
        favoriteGames.slice(0, 6).forEach((game) => {
            const itemWrapper = document.createElement('div');
            itemWrapper.id = 'collection-carousel-item';
            itemWrapper.className = 'css-1anzfxy-carouselItem';
            itemWrapper.style.flexShrink = '0';
            itemWrapper.style.width = '150px';
            const card = createGameCard({
                gameId: game.id,
                placeId: game.rootPlace?.id,
            });
            itemWrapper.appendChild(card);
            favoritesList.appendChild(itemWrapper);
        });
    } catch (e) {}
}

async function loadFriends(userId) {
    try {
        const friendsListRes = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/users/${userId}/friends/find?userSort=2&limit=7`,
        }).catch(() => null);
        const friendItems = friendsListRes?.PageItems || [];
        if (friendItems.length === 0) return;
        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const container = document.getElementById(
            'rovalra-banned-friends-container',
        );
        if (!container) return;

        container.innerHTML = `
            <div id="friends-carousel-container" class="section no-self-bootstrap" style="margin-top: 24px;">
                <div class="react-friends-carousel-container">
                    <div class="container-header people-list-header">
                        <h2>${ts('bannedUsers.connections')}</h2>
                        <a href="https://www.roblox.com/users/${userId}/friends#!/friends" class="btn-secondary-xs btn-more see-all-link-icon">${ts('bannedUsers.seeAll')}</a>
                    </div>
                    <div class="friends-carousel-container">
                        <div class="friends-carousel-list-container">
                            <div id="rovalra-banned-friends-list" style="display: flex; gap: 35px; overflow-x: auto; padding-bottom: 10px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `; // Verified

        const friendIds = friendItems
            .map((item) => item.id)
            .filter((id) => id > 0);
        const [profilesRes, thumbs] = await Promise.all([
            callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/user-profile-api/v1/user/profiles/get-profiles',
                method: 'POST',
                body: {
                    userIds: friendIds,
                    fields: [
                        'names.combinedName',
                        'isVerified',
                        'names.username',
                    ],
                },
            }),
            getBatchThumbnails(friendIds, 'AvatarHeadshot', '150x150'),
        ]);

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const friendProfilesMap = new Map(
            (profilesRes?.profileDetails || []).map((p) => [p.userId, p]),
        );
        const friendThumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
        const friendsList = document.getElementById(
            'rovalra-banned-friends-list',
        );
        friendsList.innerHTML = '';

        friendItems.forEach((item) => {
            const isHidden = item.id === -1;
            const profile = isHidden ? null : friendProfilesMap.get(item.id);
            if (!isHidden && !profile) return;

            const thumbData = isHidden
                ? { state: 'Error' }
                : friendThumbMap.get(item.id);
            const displayName = isHidden
                ? ts('bannedUsers.hiddenUser')
                : profile.names.combinedName;

            const username = isHidden ? '' : `@${profile.names.username}`;

            const tile = createFriendTile(item, thumbData, {
                displayName,
                username,
                isHidden,
            });
            friendsList.appendChild(tile);
        });
    } catch (e) {}
}

async function loadGroups(userId) {
    try {
        const assets = getAssets();
        const groupsRes = await callRobloxApiJson({
            subdomain: 'groups',
            endpoint: `/v1/users/${userId}/groups/roles?includeLocked=true`,
        }).catch(() => null);
        const userGroups = groupsRes?.data || [];
        if (userGroups.length === 0) return;
        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const container = document.getElementById(
            'rovalra-banned-groups-container',
        );
        if (!container) return;

        container.innerHTML = `
            <div class="profile-communities" style="margin-top: 24px;">
                <div class="profile-carousel">
                    <div class="css-17g81zd-collectionCarouselContainer">
                        <div style="margin-bottom: 12px;"><h2 class="content-emphasis text-heading-small" style="margin: 0;">${ts('bannedUsers.communities')}</h2></div>
                        <div class="rovalra-groups-carousel-wrapper" style="position: relative; display: flex; align-items: center;">
                            <div id="rovalra-banned-groups-scroll" style="overflow-x: auto; max-width: 100%; padding-bottom: 10px; scrollbar-width: none; scroll-behavior: smooth; flex-grow: 1;">
                                <div id="rovalra-banned-groups-list" class="css-1i465w8-carousel" style="display: flex; gap: 12px; width: max-content;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `; // Verified

        const scrollWrapper = container.querySelector(
            '.rovalra-groups-carousel-wrapper',
        );
        const scrollContainer = document.getElementById(
            'rovalra-banned-groups-scroll',
        );

        const updateButtonStates = (left, right) => {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
            const isScrollable = scrollWidth > clientWidth + 5;
            left.style.display = isScrollable ? 'flex' : 'none';
            right.style.display = isScrollable ? 'flex' : 'none';
            left.classList.toggle('rovalra-btn-disabled', scrollLeft <= 5);
            const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 5;
            right.classList.toggle('rovalra-btn-disabled', isAtEnd);
        };

        const { leftButton, rightButton } = createScrollButtons({
            onLeftClick: () => {
                scrollContainer.scrollLeft -= 600;
            },
            onRightClick: () => {
                scrollContainer.scrollLeft += 600;
            },
        });

        leftButton.classList.add('rovalra-scroll-btn', 'left');
        rightButton.classList.add('rovalra-scroll-btn', 'right');

        scrollContainer.addEventListener('scroll', () =>
            updateButtonStates(leftButton, rightButton),
        );

        scrollWrapper.prepend(leftButton);
        scrollWrapper.appendChild(rightButton);

        const groupIds = userGroups.map((g) => g.group.id);
        const thumbs = await getBatchThumbnails(
            groupIds,
            'GroupIcon',
            '150x150',
        );

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const groupInfoMap = new Map();
        groupIds.forEach((gid) => assetInfoCache.set(gid, { id: gid }));

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const groupThumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
        const groupsList = document.getElementById(
            'rovalra-banned-groups-list',
        );
        groupsList.innerHTML = '';

        userGroups.forEach((item) => {
            const group = item.group;
            const thumbData = groupThumbMap.get(group.id);
            const isVerified = group.hasVerifiedBadge || false;
            const groupDetails = groupInfoMap.get(group.id);
            const memberCount =
                groupDetails?.memberCount || group.memberCount || 0;
            const verifiedBadge = isVerified
                ? `<img src="${assets.verifiedBadgeMono}" alt="" style="width: 16px; height: 16px; flex-shrink: 0; margin-left: 4px; vertical-align: middle; color: var(--rovalra-playbutton-color);">`
                : '';
            const memberCountStr =
                memberCount >= 1000
                    ? `${formatPlayerCount(memberCount)}+`
                    : formatPlayerCount(memberCount);
            const itemWrapper = document.createElement('div');
            itemWrapper.className = 'css-nhhfrx-carouselItem';
            itemWrapper.style.width = '150px';
            itemWrapper.innerHTML = DOMPurify.sanitize(`
                <div class="base-tile">
                    <a class="flex flex-col" href="https://www.roblox.com/groups/${group.id}/-" style="text-decoration: none;">
                        <span class="thumbnail-2d-container radius-medium" style="width: 150px; height: 150px; display: block; background: var(--rovalra-button-background-color); border-radius: 8px; overflow: hidden;"></span>
                        <div style="font-weight: 600; margin-top: 8px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--rovalra-main-text-color); display: flex; align-items: center;">${group.name}${verifiedBadge}</div>
                        <div style="font-size: 14px; color: var(--rovalra-secondary-text-color);">${memberCountStr} ${ts('bannedUsers.members')}</div>
                        <div style="font-size: 14px; color: var(--rovalra-secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.role.name}</div>
                    </a>
                </div>
            `);
            const thumbEl = createThumbnailElement(thumbData, group.name, '', {
                width: '100%',
                height: '100%',
            });
            itemWrapper
                .querySelector('.thumbnail-2d-container')
                .appendChild(thumbEl);
            groupsList.appendChild(itemWrapper);
        });

        setTimeout(() => updateButtonStates(leftButton, rightButton), 100);
    } catch (e) {}
}

async function loadBadges(userId) {
    try {
        const badgesRes = await callRobloxApiJson({
            subdomain: 'badges',
            endpoint: `/v1/users/${userId}/badges?limit=10&sortOrder=Desc`,
        }).catch(() => null);
        const userBadges = badgesRes?.data || [];
        if (userBadges.length === 0) return;

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const container = document.getElementById(
            'rovalra-banned-badges-container',
        );
        if (!container) return;

        const badgeSection = document.createElement('div');
        badgeSection.id = 'player-badges-container';
        badgeSection.className = 'section';
        badgeSection.style.marginTop = '24px';
        badgeSection.innerHTML = `
            <div class="container-header"><h2>${ts('bannedUsers.badges')}</h2></div>
            <div class="section-content remove-panel"><ul id="rovalra-banned-badges-list" class="hlist badge-list" style="display: flex; gap: 0px; list-style: none; padding: 0; margin: 0; overflow: hidden;"></ul></div>
        `; //Verified
        container.replaceWith(badgeSection);

        const badgeIds = userBadges.map((b) => b.id);
        const thumbs = await getBatchThumbnails(
            badgeIds,
            'BadgeIcon',
            '150x150',
        );

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const badgeThumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
        const badgesList = document.getElementById(
            'rovalra-banned-badges-list',
        );
        badgesList.innerHTML = '';

        userBadges.slice(0, 6).forEach((badge) => {
            const thumbData = badgeThumbMap.get(badge.id);
            const li = document.createElement('li');
            li.style.marginRight = '20px';
            li.innerHTML = DOMPurify.sanitize(`
                <a href="https://www.roblox.com/badges/${badge.id}/-" style="text-decoration: none; display: flex; flex-direction: column; width: 140px;">
                    <span class="thumbnail-2d-container" style="width: 140px; height: 140px; display: block; background: var(--rovalra-button-background-color); border-radius: 8px; overflow: hidden;"></span>
                    <span style="font-size: 14px; font-weight: 600; color: var(--rovalra-main-text-color); margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${badge.name}</span>
                </a>
            `);
            const thumbEl = createThumbnailElement(
                thumbData,
                badge.name,
                'badge-thumb',
                { width: '100%', height: '100%' },
            );
            li.querySelector('.thumbnail-2d-container').appendChild(thumbEl);
            badgesList.appendChild(li);
        });
    } catch (e) {}
}

async function loadExperiences(userId) {
    try {
        const gamesRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v2/users/${userId}/games?accessFilter=2&limit=50&sortOrder=Asc`,
        }).catch(() => null);
        const userGames = gamesRes?.data || [];

        if (
            document.querySelector('.profile-platform-container')?.dataset
                .profileId !== String(userId)
        )
            return;

        const creationsList = document.getElementById(
            'rovalra-banned-creations-list',
        );
        if (!creationsList) return;

        creationsList.innerHTML = '';
        if (userGames.length > 0) {
            userGames.forEach((game) => {
                const li = document.createElement('li');
                li.className = 'list-item game-card game-tile';
                li.appendChild(
                    createGameCard({
                        gameId: game.id,
                        placeId: game.rootPlace?.id,
                    }),
                );
                creationsList.appendChild(li);
            });
        } else {
            creationsList.innerHTML = `<p class="no-results-message">${ts('bannedUsers.noExperiences')}</p>`; //Verified
        }
    } catch (e) {}
}
