import { callRobloxApiJson } from '../../core/api.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import DOMPurify from '../../core/packages/dompurify.js';
import { createItemCard } from '../../core/ui/items/items.js';
import { createGameCard } from '../../core/ui/games/gameCard.js';
import {
    loadAssetTypeIds,
    createCategorizedWearingSection,
    assetInfoCache,
    addItemToCategoryView,
    enableAllCategories,
    pendingItems,
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

    const [headshotData] = await getBatchThumbnails(
        [user.id],
        'AvatarHeadshot',
        '150x150',
    );

    let friendsCount = 0;
    let followersCount = 0;
    let followingCount = 0;
    let currentlyWearingAssets = [];
    let favoriteGames = [];

    try {
        const wearingRes = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v1/users/${user.id}/currently-wearing`,
        });
        currentlyWearingAssets = wearingRes?.assetIds || [];

        const favoritesRes = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v2/users/${user.id}/favorite/games?limit=10&sortOrder=Desc`,
        });
        favoriteGames = favoritesRes?.data || [];

        const [friendsRes, followersRes, followingsRes] = await Promise.all([
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${user.id}/friends/count`,
            }),
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${user.id}/followers/count`,
            }),
            callRobloxApiJson({
                subdomain: 'friends',
                endpoint: `/v1/users/${user.id}/followings/count`,
            }),
        ]);
        friendsCount = friendsRes?.count || 0;
        followersCount = followersRes?.count || 0;
        followingCount = followingsRes?.count || 0;
    } catch (e) {}

    const getStatPillHtml = (count, label) => `
        <a aria-disabled="false" class="relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer relative flex justify-center items-center radius-circle stroke-none padding-left-medium padding-right-medium height-800 text-label-medium bg-shift-300 content-action-utility" style="text-decoration: none;">
            <div role="presentation" class="absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none"></div>
            <span class="padding-y-xsmall text-no-wrap text-truncate-end">${count} ${label}</span>
        </a>
    `;

    content.innerHTML = DOMPurify.sanitize(`
        <div class="profile-platform-container" data-profile-type="User" data-profile-id="${user.id}">
            <div>
            <div class="sg-system-feedback">
                <div class="alert-system-feedback"><div class="alert"><span class="alert-content"></span></div></div>
            </div>

            <div class="profile-header-overlay" style="width: 100%;">
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
                                        <span class="items-center gap-xxsmall flex shrink-0"><span role="presentation" class="grow-0 shrink-0 basis-auto icon icon-filled-premium size-[var(--icon-size-large)] content-system-contrast"></span></span>
                                    </span>
                                    <div>
                                        <span class="stylistic-alts-username">@${user.name}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="flex-nowrap gap-small flex">
                            ${getStatPillHtml(friendsCount.toLocaleString(), 'Friends')}
                            ${getStatPillHtml(followersCount.toLocaleString(), 'Followers')}
                            ${getStatPillHtml(followingCount.toLocaleString(), 'Following')}
                        </div>

                        <div>
                            <pre class="content-default text-body-medium text-overflow-2-lines description-content">${user.description || ''}</pre>
                        </div>
                    </div>
                </div>
            </div>

            <div style="max-width: 1140px; margin: 0 auto; padding: 0 15px;">
                <ul class="profile-tabs flex">
                    <li class="justify-center flex fill">
                        <a id="tab-about" href="#about" class="profile-tab active justify-center text-label-medium padding-bottom-xlarge padding-top-medium flex fill">About</a>
                    </li>
                    <li class="justify-center flex fill">
                        <a id="tab-creations" href="#creations" class="profile-tab justify-center text-label-medium padding-bottom-xlarge padding-top-medium flex fill">Creations</a>
                    </li>
                </ul>
                
                <div class="profile-tab-content padding-top-xxlarge">
                    ${
                        currentlyWearingAssets.length > 0
                            ? `
                        <div id="rovalra-banned-wearing-container" style="margin-bottom: 24px;">
                            <div class="profile-carousel">
                                <div class="css-17g81zd-collectionCarouselContainer">
                                    <div class="css-1jynqc0-carouselContainer" style="overflow: hidden; max-width: 780px; margin: 0 auto; position: relative;">
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
                        <div class="profile-favorite-experiences" style="margin-bottom: 24px;">
                            <div class="profile-carousel">
                                <div class="css-17g81zd-collectionCarouselContainer">
                                    <div style="margin-bottom: 12px;">
                                        <div class="items-center inline-flex">
                                            <h2 class="content-emphasis text-heading-small padding-none inline-block" style="margin: 0;">Favorites</h2>
                                            <span class="icon-chevron-heavy-right" style="margin-left: 4px;"></span>
                                        </div>
                                    </div>
                                    <div class="css-1jynqc0-carouselContainer" style="overflow: hidden; max-width: 780px; margin: 0;">
                                        <div id="rovalra-banned-favorites-list" class="css-1i465w8-carousel" style="display: flex; gap: 12px;">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `
                            : ''
                    }
                    <div class="section">
                        <div class="section-content remove-panel" style="text-align: center; padding: 60px 20px;">
                            <div class="icon-warning-orange" style="margin: 0 auto 20px auto; width: 64px; height: 64px; background-size: contain; background-repeat: no-repeat;"></div>
                            <h2 style="font-weight: 600; margin-bottom: 10px;">This user has been banned</h2>
                            <p class="text-description">This account was terminated for violating the Roblox Community Standards.</p>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    `);

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

                const card = createGameCard({
                    gameId: game.id,
                    placeId: game.rootPlace?.id,
                });

                itemWrapper.appendChild(card);
                favoritesList.appendChild(itemWrapper);
            });
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

    document.title = `${user.displayName} (@${user.name}) - Roblox`;
    document.dispatchEvent(new CustomEvent('rovalra-theme-update'));
}
