import { callRobloxApiJson } from '../../core/api.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
    fetchUserThumbnailWithApiKey,
} from '../../core/thumbnail/thumbnails.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';
import { getAssets } from '../../core/assets.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createScrollButtons } from '../../core/ui/general/scrollButtons.js';
import { ts } from '../../core/locale/i18n.js';
import {
    loadAssetTypeIds,
    createCategorizedWearingSection,
    assetInfoCache,
    addItemToCategoryView,
    enableAllCategories,
} from './categorizeWearing.js';

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
                        '<div class="rovalra-banned-loading" style="display: flex; justify-content: center; align-items: center; height: 400px;"><div class="spinner spinner-default"></div></div>';
                }

                try {
                    const user = await callRobloxApiJson({
                        subdomain: 'users',
                        endpoint: `/v1/users/${userId}`,
                        method: 'GET',
                    });

                    if (user && user.isBanned) {
                        renderBannedUserProfile(user, data);
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

            if (!isErrorPage) return;

            chrome.runtime.sendMessage(
                { action: 'getBannedUserRedirect' },
                async (response) => {
                    if (response && response.userId) {
                        const content = document.getElementById('content');
                        if (content) {
                            content.innerHTML =
                                '<div class="rovalra-banned-loading" style="display: flex; justify-content: center; align-items: center; height: 400px;"><div class="spinner spinner-default"></div></div>';
                        }

                        try {
                            const user = await callRobloxApiJson({
                                subdomain: 'users',
                                endpoint: `/v1/users/${response.userId}`,
                                method: 'GET',
                            });

                            if (user && user.isBanned) {
                                const newUrl = `https://www.roblox.com/banned-users/${user.id}/profile`;
                                window.history.replaceState({}, '', newUrl);

                                renderBannedUserProfile(user, data);
                            }
                        } catch (e) {
                            console.error('RoValra: Failed to fetch info', e);
                        }
                    }
                },
            );
        },
    );
}

async function renderBannedUserProfile(user, settings) {
    const content = document.getElementById('content');
    if (!content) return;

    document.title = `${user.displayName} (@${user.name}) - Roblox`;
    content.innerHTML = '';
    const headshotData = await fetchUserThumbnailWithApiKey(user.id);
    let fullAvatarUrl = '';
    if (headshotData && headshotData.imageUrl) {
        fullAvatarUrl = headshotData.imageUrl
            .replace(/AvatarHeadshot/g, 'Avatar')
            .replace(/150\/150/g, '420/420')
            .replace(/\/Png\/?$/, '/Png/noFilter');
    }

    let friendsCount = 0;
    let followersCount = 0;
    let followingCount = 0;
    let currentlyWearingAssets = [];
    let favoriteGames = [];
    let userGames = [];
    let friendProfiles = [];
    let friendThumbMap = new Map();
    let friendItems = [];
    let userGroups = [];
    let groupThumbMap = new Map();
    let userBadges = [];
    let badgeThumbMap = new Map();

    content.innerHTML = DOMPurify.sanitize(`
        <div class="profile-platform-container" data-profile-type="User" data-profile-id="${user.id}" style="width: 970px; margin: 0 auto;">
            <div class="sg-system-feedback">
                <div class="alert-system-feedback"><div class="alert"><span class="alert-content"></span></div></div>
            </div>

            <div class="relative flex flex-col items-center" style="height: 300px;">
                <div class="profile-avatar-gradient" style="width: 100%;">
                    <div style="background: var(--rovalra-profile-main-gradient); width: 100vw; margin-left: calc(50% - 50vw); height: 300px; margin-top: -24px; position: relative; background-color: var(--rovalra-profile-header-bg); padding: 0 12px;"></div>
                    <div class="cover-gradient-overlay" style="position: absolute; bottom: 0; width: 100vw; margin-left: calc(50% - 50vw); left: 0; height: 64px; z-index: 10; pointer-events: none; mask-image: linear-gradient(rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 40%, rgba(255,255,255,.8) 60%, #fff 100%); background: var(--rovalra-profile-overlay-gradient);"></div>
                </div>
                <div class="thumbnail-holder" style="position: relative; margin-top: -350px; z-index: 1;">
                    <div class="thumbnail-3d-container">
                        <div class="avatar-thumbnail-container">
                            <span class="thumbnail-2d-container no-background-thumbnail thumbnail-span" style="background-color: transparent;">
                                <img id="rovalra-banned-avatar-img" src="${fullAvatarUrl}" style="opacity: ${fullAvatarUrl ? '1' : '0'};">
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div style="width: 100%; position: relative; margin-top: -64px; z-index: 20;">
                <div id="user-profile-header-bg" style="max-width: 1140px; margin: 0 auto;">
                    <div class="user-profile-header flex flex-col gap-large" style="padding: 0 15px;">
                        <div class="user-profile-header-info flex justify-between items-center">
                            <div class="flex gap-medium items-center min-width-0">
                                <div class="user-profile-header-details-avatar-container avatar-headshot-lg" style="width: 120px; height: 120px; min-width: 120px;">
                                    <div class="avatar avatar-card-fullbody">
                                        <div id="rovalra-banned-headshot-placeholder"></div>
                                        <div class="avatar-status">
                                            <span data-testid="presence-icon" class="offline icon-offline" title="Banned"></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex flex-col min-width-0">
                                    <span class="items-center gap-xsmall flex min-width-0">
                                        <span id="profile-header-title-container-name" class="text-heading-large min-width-0 text-truncate-end text-no-wrap">${user.displayName}</span>
                                    </span>
                                    <div><span class="stylistic-alts-username">@${user.name}</span></div>
                                </div>
                            </div>
                        </div>
                        <div id="rovalra-banned-stat-pills" class="flex-nowrap gap-small flex">
                        </div>
                        <div><pre class="content-default text-body-medium description-content" style="white-space: pre-wrap; word-break: break-word;">${user.description || ''}</pre></div>
                    </div>
                </div>
            </div>

            <div style="max-width: 1140px; margin: 0 auto; padding: 0 15px;">
                <ul class="profile-tabs flex">
                    <li class="justify-center flex fill"><a id="tab-about-link" href="#about" class="profile-tab active justify-center text-label-medium flex fill">About</a></li>
                    <li class="justify-center flex fill"><a id="tab-creations-link" href="#creations" class="profile-tab justify-center text-label-medium flex fill">Creations</a></li>
                </ul>
                <div class="profile-tab-content-wrapper padding-top-xxlarge">
                    <div id="about-content" class="tab-pane active">
                        <div id="rovalra-banned-sections-container">
                        </div>
                    </div>
                    <div id="creations-content" class="tab-pane">
                        <div class="profile-game section container-list">
                            <div class="container-header"><h3>Experiences</h3></div>
                            <div class="game-grid"><ul id="rovalra-banned-creations-list" class="hlist game-cards" style="display: flex; flex-wrap: wrap; gap: 12px; list-style: none; padding: 0;"></ul></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    try {
        const wearingRes = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v1/users/${user.id}/currently-wearing`,
        }).catch(() => null);
        currentlyWearingAssets = wearingRes?.assetIds || [];
    } catch (e) {}

    try {
        const favoritesRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v2/users/${user.id}/favorite/games?limit=10&sortOrder=Desc`,
        }).catch(() => null);
        favoriteGames = favoritesRes?.data || [];
    } catch (e) {}

    try {
        const gamesRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v2/users/${user.id}/games?accessFilter=2&limit=50&sortOrder=Asc`,
        }).catch(() => null);
        userGames = gamesRes?.data || [];
    } catch (e) {}

    try {
        const [friendsRes, followersRes, followingsRes] = await Promise.all([
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${user.id}/friends/count`,
            }).catch(() => ({ count: 0 })),
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${user.id}/followers/count`,
            }).catch(() => ({ count: 0 })),
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${user.id}/followings/count`,
            }).catch(() => ({ count: 0 })),
        ]);

        friendsCount = friendsRes?.count || 0;
        followersCount = followersRes?.count || 0;
        followingCount = followingsRes?.count || 0;
    } catch (e) {}

    try {
        const friendsListRes = await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/users/${user.id}/friends/find?userSort=2&limit=7`,
        }).catch(() => null);

        friendItems = friendsListRes?.PageItems || [];
        const friendIds = friendItems
            .map((item) => item.id)
            .filter((id) => id > 0);

        if (friendIds.length > 0) {
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

            friendProfiles = profilesRes?.profileDetails || [];
            friendThumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
        }
    } catch (e) {}

    try {
        const groupsRes = await callRobloxApiJson({
            subdomain: 'groups',
            endpoint: `/v1/users/${user.id}/groups/roles?includeLocked=true`,
        }).catch(() => null);

        userGroups = groupsRes?.data || [];
        userGroups.sort(
            (a, b) => (b.isPrimaryGroup ? 1 : 0) - (a.isPrimaryGroup ? 1 : 0),
        );

        if (userGroups.length > 0) {
            const groupIds = userGroups.map((g) => g.group.id);
            const thumbs = await getBatchThumbnails(
                groupIds,
                'GroupIcon',
                '150x150',
            );
            groupThumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
        }
    } catch (e) {}

    try {
        const badgesRes = await callRobloxApiJson({
            subdomain: 'badges',
            endpoint: `/v1/users/${user.id}/badges?limit=10&sortOrder=Desc`,
        }).catch(() => null);

        userBadges = badgesRes?.data || [];

        if (userBadges.length > 0) {
            const badgeIds = userBadges.map((b) => b.id);
            const thumbs = await getBatchThumbnails(
                badgeIds,
                'BadgeIcon',
                '150x150',
            );
            badgeThumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
        }
    } catch (e) {}

    const updateScrollButtonStates = (container, leftBtn, rightBtn) => {
        if (!container || !leftBtn || !rightBtn) return;
        const { scrollLeft, scrollWidth, clientWidth } = container;
        const isScrollable = scrollWidth > clientWidth + 5;
        leftBtn.style.display = isScrollable ? 'flex' : 'none';
        rightBtn.style.display = isScrollable ? 'flex' : 'none';
        leftBtn.classList.toggle('rovalra-btn-disabled', scrollLeft <= 5);
        rightBtn.classList.toggle(
            'rovalra-btn-disabled',
            scrollLeft + clientWidth >= scrollWidth - 5,
        );
    };

    const getStatPillHtml = (count, label, url) => `
        <a href="${url}" aria-disabled="false" class="relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex justify-center items-center radius-circle stroke-none padding-left-medium padding-right-medium height-800 text-label-medium bg-shift-300 content-action-utility" style="text-decoration: none;">
            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
            <span class="padding-y-xsmall text-no-wrap text-truncate-end">${count} ${label}</span>
        </a>
    `;

    content.innerHTML = DOMPurify.sanitize(`
        <div class="profile-platform-container" data-profile-type="User" data-profile-id="${user.id}" style="width: 970px; margin: 0 auto;">
            <div class="sg-system-feedback">
                <div class="alert-system-feedback"><div class="alert"><span class="alert-content"></span></div></div>
            </div>

            <div class="relative flex flex-col items-center" style="height: 300px;">
                <div class="profile-avatar-gradient" style="width: 100%;">
                    <div style="
                        background-blend-mode: soft-light,normal,normal;
                        background: var(--rovalra-profile-main-gradient);
                        width: 100vw;
                        margin-left: calc(50% - 50vw);
                        height: 300px;
                                                margin-top: -24px;

                        position: relative;
                        background-color: var(--rovalra-profile-header-bg);
                        padding: 0 12px;
                    "></div>
                    
                    <div class="cover-gradient-overlay" style="
                        position: absolute;
                        bottom: 0;
                        width: 100vw;
                        margin-left: calc(50% - 50vw);
                        left: 0;
                        height: 64px;
                        z-index: 10;
                        pointer-events: none;
                        mask-image: linear-gradient(rgba(255,255,255,0) 0%, rgba(255,255,255,.5) 40%, rgba(255,255,255,.8) 60%, #fff 100%);
                        background: var(--rovalra-profile-overlay-gradient);
                    "></div>
                    <div class="cover-blur-overlay" style="
                        pointer-events: none;
                        height: 64px;
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        z-index: 9;
                        mask-image: linear-gradient(transparent, #000);
                    "></div>
                </div>
                <div class="thumbnail-holder" style="position: relative; margin-top: -350px; z-index: 1;">
                    <div class="thumbnail-3d-container">
                        <div class="avatar-thumbnail-container">
                            <span class="thumbnail-2d-container no-background-thumbnail thumbnail-span" style="background-color: transparent;">
                                <img class="" src="${fullAvatarUrl}" alt="" title="">
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="" style="width: 100%; position: relative; margin-top: -64px; z-index: 20;">
                <div id="user-profile-header-bg" style="max-width: 1140px; margin: 0 auto;">
                    <div class="user-profile-header flex flex-col gap-large" style="padding: 0 15px;">
                        <div class="user-profile-header-info flex justify-between items-center">
                            
                            <div class="flex gap-medium items-center min-width-0">
                                <div class="user-profile-header-details-avatar-container avatar-headshot-lg" style="width: 120px; height: 120px; min-width: 120px;">
                                    <div class="avatar avatar-card-fullbody">
                                        <div id="rovalra-banned-headshot-placeholder"></div>
                                        <div class="avatar-status">
                                            <span data-testid="presence-icon" class="offline icon-offline" title="Banned"></span>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex flex-col min-width-0">
                                    <span class="items-center gap-xsmall flex min-width-0">
                                        <span id="profile-header-title-container-name" class="text-heading-large min-width-0 text-truncate-end text-no-wrap">${user.displayName}</span>
                                    </span>
                                    <div>
                                        <span class="stylistic-alts-username">@${user.name}</span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div class="flex-nowrap gap-small flex">
                            ${getStatPillHtml(friendsCount.toLocaleString(), 'Connections', `/users/${user.id}/friends#!/friends`)}
                            ${getStatPillHtml(followersCount.toLocaleString(), 'Followers', `/users/${user.id}/friends#!/followers`)}
                            ${getStatPillHtml(followingCount.toLocaleString(), 'Following', `/users/${user.id}/friends#!/following`)}
                        </div>

                        <div>
                            <pre class="content-default text-body-medium description-content" style="white-space: pre-wrap; word-break: break-word;">${user.description || ''}</pre>
                        </div>
                    </div>
                </div>
            </div>

            <div style="max-width: 1140px; margin: 0 auto; padding: 0 15px;">
                <ul class="profile-tabs flex">
                    <li class="justify-center flex fill">
                        <a id="tab-about-link" href="#about" class="profile-tab active justify-center text-label-medium flex fill">About</a>
                    </li>
                    <li class="justify-center flex fill">
                        <a id="tab-creations-link" href="#creations" class="profile-tab justify-center text-label-medium flex fill">Creations</a>
                    </li>
                </ul>
                
                <div class="profile-tab-content-wrapper padding-top-xxlarge">
                    <div id="about-content" class="tab-pane active">
                        ${
                            currentlyWearingAssets.length > 0
                                ? `
                            <div id="rovalra-banned-wearing-container" style="margin-top: 24px;">
                                <div class="profile-carousel">
                                    <div class="css-17g81zd-collectionCarouselContainer">
                                        <div class="css-1jynqc0-carouselContainer" style="overflow: hidden; max-width: 100%; margin: 0 auto; position: relative;">
                                            <div id="rovalra-banned-wearing-list" class="css-1i465w8-carousel" style="display: flex; gap: 12px; transition: transform 0.3s ease;">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `
                                : ''
                        }

                        ${
                            favoriteGames.length > 0
                                ? `
                            <div class="profile-favorite-experiences" style="margin-top: 24px;">
                                <div class="profile-carousel">
                                    <div class="css-17g81zd-collectionCarouselContainer">
                                        <div style="margin-bottom: 12px;">
                                            <div class="items-center inline-flex">
                                                <h2 class="content-emphasis text-heading-small padding-none inline-block" style="margin: 0;">Favorites</h2>
                                                <span class="icon-chevron-heavy-right" style="margin-left: 4px;"></span>
                                            </div>
                                        </div>
                                        <div class="css-1jynqc0-carouselContainer" style="overflow: show; max-width: 100%; margin: 0;">
                                            <div id="rovalra-banned-favorites-list" class="css-1i465w8-carousel" style="display: flex; gap: 12px; width: max-content;">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `
                                : ''
                        }

                        ${
                            friendProfiles.length > 0
                                ? `
                            <div id="friends-carousel-container" class="section no-self-bootstrap" style="margin-top: 24px;">
                                <div class="react-friends-carousel-container">
                                    <div class="container-header people-list-header">
                                        <h2>Connections<span class="friends-count">(${friendsCount.toLocaleString()})</span></h2>
                                        <a href="https://www.roblox.com/users/${user.id}/friends#!/friends" class="btn-secondary-xs btn-more see-all-link-icon">See All</a>
                                    </div>
                                    <div class="friends-carousel-container">
                                        <div class="friends-carousel-list-container">
                                            <div id="rovalra-banned-friends-list" style="display: flex; gap: 27px; overflow-x: auto; padding-bottom: 10px;">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `
                                : ''
                        }

                        ${
                            userGroups.length > 0
                                ? `
                            <div class="profile-communities" style="margin-top: 24px;">
                                <div class="profile-carousel">
                                    <div class="css-17g81zd-collectionCarouselContainer">
                                        <div style="margin-bottom: 12px;">
                                            <div class="items-center inline-flex">
                                                <h2 class="content-emphasis text-heading-small padding-none inline-block" style="margin: 0;">Communities</h2>
                                            </div>
                                        </div>
                                        <div class="rovalra-groups-carousel-wrapper" style="position: relative;">
                                            <div id="rovalra-banned-groups-container" class="css-1jynqc0-carouselContainer" style="overflow-x: auto; max-width: 100%; margin: 0; padding-bottom: 10px; scrollbar-width: none; -ms-overflow-style: none;">
                                                <div id="rovalra-banned-groups-list" class="css-1i465w8-carousel" style="display: flex; gap: 12px; width: max-content;">
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `
                                : ''
                        }

                        ${
                            userBadges.length > 0
                                ? `
                            <div id="player-badges-container" class="section" style="margin-top: 24px;">
                                <div class="container-header">
                                    <h2>Badges</h2>
                                </div>
                                <div class="section-content remove-panel">
                                    <ul id="rovalra-banned-badges-list" class="hlist badge-list" style="overflow: hidden; display: flex; gap: 0px; list-style: none; padding: 0; margin: 0; justify-content: flex-start;">
                                    </ul>
                                </div>
                            </div>
                        `
                                : ''
                        }
                    </div>
                    <div id="creations-content" class="tab-pane">
                        <div class="profile-game section container-list">
                            <div class="container-header">
                                <h3>Experiences</h3>
                            </div>
                            <div class="game-grid">
                                <ul id="rovalra-banned-creations-list" class="hlist game-cards" style="display: flex; flex-wrap: wrap; gap: 12px; list-style: none; padding: 0;">
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    const nameHeader = document.getElementById(
        'profile-header-title-container-name',
    );
    if (nameHeader) {
        const assets = getAssets();
        const lockIcon = document.createElement('div');
        addTooltip(lockIcon, ts('quickSearch.permanentlyBanned'), {
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

    const style = document.createElement('style');
    style.innerHTML = `
        .profile-tabs {
            border-bottom: 1px solid var(--rovalra-border-color);
            margin-bottom: 24px;
        }

        .profile-tab {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 12px 0;
            color: var(--rovalra-gray-text-color);
            transition: color 0.2s ease, border-bottom-color 0.2s ease, border-bottom-width 0.2s ease;
            border-bottom: 1px solid var(--rovalra-gray-text-color); 
            text-decoration: none; 
        }

        .profile-tab:hover {
            color: var(--rovalra-main-text-color);
            border-bottom-color: var(--rovalra-main-text-color); 
            border-bottom-width: 1px; 
        }

        .profile-tab.active {
            color: var(--rovalra-main-text-color);
            border-bottom: 3px solid var(--rovalra-main-text-color); 
        }
        .tab-pane {
            display: none; 
        }
        .tab-pane.active {
            display: block; 
        }
    `;
    document.head.appendChild(style);

    if (currentlyWearingAssets.length > 0) {
        const container = document.getElementById(
            'rovalra-banned-wearing-container',
        );
        if (container) {
            enableAllCategories();
            await loadAssetTypeIds();
            const wearingSection = createCategorizedWearingSection();
            container.replaceWith(wearingSection);

            try {
                const catalogResponse = await callRobloxApiJson({
                    subdomain: 'apis',
                    endpoint: '/look-api/v1/looks/purchase-details',
                    method: 'POST',
                    body: {
                        assets: currentlyWearingAssets.map((id) => ({ id })),
                    },
                });

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
                                    if (
                                        currentlyWearingAssets.includes(
                                            bAsset.id,
                                        )
                                    ) {
                                        addItemToCategoryView(null, bAsset.id);
                                        processedIds.add(bAsset.id);
                                    }
                                }
                            });
                        }

                        let typeId = item.assetType || item.assetTypeId;
                        if (typeId && typeof typeId === 'object')
                            typeId = typeId.id;

                        if (item.id && typeId) {
                            assetInfoCache.set(item.id, {
                                id: item.id,
                                assetType: { id: typeId },
                            });
                            if (currentlyWearingAssets.includes(item.id)) {
                                addItemToCategoryView(null, item.id);
                                processedIds.add(item.id);
                            }
                        }
                    });

                    currentlyWearingAssets.forEach((id) => {
                        if (!processedIds.has(id))
                            addItemToCategoryView(null, id);
                    });
                }
            } catch (error) {
                console.error(
                    'RoValra: Failed to fetch item categories',
                    error,
                );
                currentlyWearingAssets.forEach((id) =>
                    addItemToCategoryView(null, id),
                );
            }
        }
    }

    if (favoriteGames.length > 0) {
        const favoritesList = document.getElementById(
            'rovalra-banned-favorites-list',
        );
        if (favoritesList) {
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
        }
    }

    const friendsList = document.getElementById('rovalra-banned-friends-list');

    if (friendsList && friendItems.length > 0) {
        const friendProfilesMap = new Map(
            friendProfiles.map((p) => [p.userId, p]),
        );

        friendItems.forEach((item) => {
            const isHidden = item.id === -1;
            const profile = isHidden ? null : friendProfilesMap.get(item.id);

            if (!isHidden && !profile) return;

            const thumbData = isHidden
                ? { state: 'Error' }
                : friendThumbMap.get(item.id);
            const displayName = isHidden
                ? 'Hidden User'
                : profile.names.combinedName;
            const username = isHidden ? '' : `@${profile.names.username}`;
            const tileContainer = document.createElement('div');

            const thumbEl = createThumbnailElement(thumbData, displayName, '', {
                width: '100%',
                height: '100%',
            });

            const innerHtml = `
                <div class="friend-tile-content" style="width: 100px;">
                    <div class="avatar avatar-card-fullbody" style="width: 100px; height: 100px; position: relative;">
                        ${!isHidden ? `<a href="https://www.roblox.com/users/${item.id}/profile" class="avatar-card-link">` : ''}
                            <span class="thumbnail-2d-container avatar-card-image" style="width: 100%; height: 100%; display: block; overflow: hidden; border-radius: 50%; background: var(--rovalra-button-background-color);"></span>
                        ${!isHidden ? `</a>` : ''}
                        <div class="avatar-status">
                            <span data-testid="presence-icon" class="offline icon-offline"></span>
                        </div>
                    </div>
                    ${!isHidden ? `<a href="https://www.roblox.com/users/${item.id}/profile" class="friends-carousel-tile-labels" style="text-decoration: none; display: block; margin-top: 8px;">` : `<div class="friends-carousel-tile-labels" style="display: block; margin-top: 8px;">`}
                        <div class="friends-carousel-tile-label" style="overflow: hidden; line-height: 1.2;">
                            <div class="friends-carousel-tile-name">
                                <span class="friends-carousel-display-name" style="font-weight: 600; font-size: 14px; color: var(--rovalra-main-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;">${displayName}</span>
                            </div>
                        </div>
                        <div class="friends-carousel-tile-sublabel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <div class="friends-carousel-tile-experience" style="font-size: 12px; color: var(--rovalra-secondary-text-color);">${username}</div>
                        </div>
                    ${!isHidden ? `</a>` : `</div>`}
                </div>
            `;

            tileContainer.innerHTML = `
                <div class="friends-carousel-tile">
                    ${isHidden ? innerHtml : `<button type="button" class="options-dropdown" style="border: none; background: none; padding: 0; cursor: pointer; text-align: left; width: 100px;">${innerHtml}</button>`}
                </div>
            `;

            const thumbSpan = tileContainer.querySelector('.avatar-card-image');
            if (thumbSpan) thumbSpan.appendChild(thumbEl);

            friendsList.appendChild(tileContainer.firstElementChild);
        });
    }

    const groupsList = document.getElementById('rovalra-banned-groups-list');
    const groupsContainer = document.getElementById(
        'rovalra-banned-groups-container',
    );
    if (groupsList && groupsContainer && userGroups.length > 0) {
        const formatCount = (count) => {
            if (count >= 1000000)
                return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M+';
            if (count >= 1000)
                return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K+';
            return count.toString();
        };

        userGroups.forEach((item) => {
            const group = item.group;
            const role = item.role;
            const thumbData = groupThumbMap.get(group.id);

            const itemWrapper = document.createElement('div');
            itemWrapper.id = 'collection-carousel-item';
            itemWrapper.className = 'css-nhhfrx-carouselItem';
            itemWrapper.style.flexShrink = '0';
            itemWrapper.style.width = '150px';

            const innerHtml = `
                <div class="base-tile">
                    <a class="flex flex-col" href="https://www.roblox.com/groups/${group.id}/-" title="${group.name}" style="text-decoration: none;">
                        <span class="thumbnail-2d-container base-tile-thumbnail radius-medium" style="width: 150px; height: 150px; display: block; background: var(--rovalra-button-background-color); border-radius: 8px; overflow: hidden;"></span>
                        <div class="base-tile-title content-emphasis text-title-medium padding-top-medium" style="font-weight: 600; margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rovalra-main-text-color);">
                            ${group.name}
                            ${group.hasVerifiedBadge ? '<span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-filled-verified-mono size-[var(--icon-size-small)] content-system-emphasis text-align-y-center padding-left-xsmall" style="display: inline-block; vertical-align: middle; margin-left: 4px;"></span>' : ''}
                        </div>
                        <div class="base-tile-metadata content-default text-body-medium padding-top-xsmall" style="font-size: 12px; color: var(--rovalra-secondary-text-color); margin-top: 2px;">
                            <div>
                                <div>${formatCount(group.memberCount)} Members</div>
                            </div>
                        </div>
                        <div class="text-overflow game-card-name-secondary user-community-role text align-left" style="font-size: 12px; color: var(--rovalra-secondary-text-color); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${role.name}
                        </div>
                    </a>
                </div>
            `;

            itemWrapper.innerHTML = innerHtml;

            const thumbSpan = itemWrapper.querySelector('.base-tile-thumbnail');
            if (thumbSpan) {
                const thumbEl = createThumbnailElement(
                    thumbData,
                    group.name,
                    '',
                    {
                        width: '100%',
                        height: '100%',
                    },
                );
                thumbSpan.appendChild(thumbEl);
            }
            groupsList.appendChild(itemWrapper);
        });

        const { leftButton, rightButton } = createScrollButtons({
            onLeftClick: () =>
                groupsContainer.scrollBy({ left: -400, behavior: 'smooth' }),
            onRightClick: () =>
                groupsContainer.scrollBy({ left: 400, behavior: 'smooth' }),
        });

        leftButton.classList.add('rovalra-scroll-btn', 'left');
        rightButton.classList.add('rovalra-scroll-btn', 'right');

        const wrapper = groupsContainer.parentElement;
        wrapper.appendChild(leftButton);
        wrapper.appendChild(rightButton);

        groupsContainer.addEventListener('scroll', () =>
            updateScrollButtonStates(groupsContainer, leftButton, rightButton),
        );
        setTimeout(
            () =>
                updateScrollButtonStates(
                    groupsContainer,
                    leftButton,
                    rightButton,
                ),
            100,
        );
    }

    const badgesList = document.getElementById('rovalra-banned-badges-list');
    if (badgesList && userBadges.length > 0) {
        userBadges.slice(0, 6).forEach((badge) => {
            const thumbData = badgeThumbMap.get(badge.id);
            const li = document.createElement('li');
            li.className = 'list-item asset-item';
            li.style.flexShrink = '0';
            li.style.marginRight = '20px';

            const badgeUrl = `https://www.roblox.com/badges/${badge.id}/${badge.name.replace(/\s+/g, '-')}`;

            li.innerHTML = `
                <a href="${badgeUrl}" title="${badge.name}" style="text-decoration: none; display: flex; flex-direction: column; align-items: flex-start; width: 140px;">
                    <span class="thumbnail-2d-container" style="width: 140px; height: 140px; display: block; background: var(--rovalra-button-background-color); border-radius: 8px; overflow: hidden;"></span>
                    <span class="font-header-2 text-overflow item-name" style="font-size: 14px; font-weight: 600; color: var(--rovalra-main-text-color); display: block; text-align: left; margin-top: 8px; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${badge.name}</span>
                </a>
            `;

            const thumbSpan = li.querySelector('.thumbnail-2d-container');
            if (thumbSpan) {
                const thumbEl = createThumbnailElement(
                    thumbData,
                    badge.name,
                    'badge-thumb',
                    {
                        width: '100%',
                        height: '100%',
                    },
                );
                thumbSpan.appendChild(thumbEl);
            }
            badgesList.appendChild(li);
        });
    }

    const creationsList = document.getElementById(
        'rovalra-banned-creations-list',
    );
    if (creationsList) {
        if (userGames.length > 0) {
            userGames.forEach((game) => {
                const li = document.createElement('li');
                li.className = 'list-item game-card game-tile';
                const card = createGameCard({
                    gameId: game.id,
                    placeId: game.rootPlace?.id,
                });
                li.appendChild(card);
                creationsList.appendChild(li);
            });
        } else {
            creationsList.innerHTML =
                '<p class="no-results-message">This user has no public experiences.</p>';
        }
    }

    const placeholder = document.getElementById(
        'rovalra-banned-headshot-placeholder',
    );
    if (placeholder) {
        const headshotEl = createThumbnailElement(
            headshotData,
            user.displayName,
            'avatar-card-image',
            { width: '120px', height: '120px' },
        );
        placeholder.replaceWith(headshotEl);
    }

    const tabLinks = content.querySelectorAll('.profile-tab');
    const tabPanes = content.querySelectorAll('.tab-pane');

    tabLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetTabId = link.getAttribute('href').substring(1);

            tabLinks.forEach((tab) => tab.classList.remove('active'));
            tabPanes.forEach((pane) => pane.classList.remove('active'));
            tabPanes.forEach((pane) => (pane.style.display = 'none'));

            link.classList.add('active');
            const activePane = document.getElementById(
                `${targetTabId}-content`,
            );
            if (activePane) {
                activePane.classList.add('active');
                activePane.style.display = 'block';
            }
        });
    });

    document.title = `${user.displayName} (@${user.name}) - Roblox`;
    document.dispatchEvent(new CustomEvent('rovalra-theme-update'));
}
