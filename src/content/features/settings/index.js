import { getAssets } from '../../core/assets.js';
import {
    getRegionData,
    loadDatacenterMap,
} from '../../core/regions.js';
import { observeElement } from '../../core/observer.js';
import { generateSingleSettingHTML } from '../../core/settings/generateSettings.js';
import { SETTINGS_CONFIG } from '../../core/settings/settingConfig.js';
import {
    exportSettings,
    importSettings,
    createExportImportButtons,
} from '../../core/settings/portSettings.js';
import {
    initSettings,
    initializeSettingsEventListeners,
    loadSettings,
    handleSaveSettings,
    updateConditionalSettingsVisibility,
    buildSettingsKey,
    getCurrentUserTier,
    syncDonatorTier,
} from '../../core/settings/handlesettings.js';
import {
    addCustomButton,
    addPopoverButton,
} from '../../core/settings/ui/settingsbutton.js';
import { checkRoValraPage } from '../../core/settings/ui/page.js';
import { callRobloxApi } from '../../core/api.js';
import { safeHtml } from '../../core/packages/dompurify';
import DOMPurify from 'dompurify';
import { BADGE_CONFIG } from '../../core/configs/badges.js';
import { ts } from '../../core/locale/i18n.js';
import { CONTRIBUTOR_USER_IDS } from '../../core/configs/userIds.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { parseMarkdown } from '../../core/utils/markdown.js';
import { getCurrentTheme, THEME_CONFIG } from '../../core/theme.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import {
    getUserSettings,
    updateUserSettingViaApi,
} from '../../core/donators/settingHandler.js';
import { getBorders, getCachedBorders } from '../../core/configs/borders.js';
import { createUserCard } from '../../core/ui/profile/userCard.js';
import { applyBorderToContainer } from '../profile/avatarBorder.js';
import { getUserDisplayName } from '../../core/apis/users.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';

const assets = getAssets();
let REGIONS = {};

const RESTRICTION_LEVELS = [
    'None / No restrictions',
    'Limited',
    'Very Limited',
    'At Risk',
    'Suspended',
];
const APPEAL_STATUSES = [
    'Not appealed',
    'Appeal Pending',
    'Appeal Denied',
    'Appeal Accepted',
];

let standingCache = null;
let topDonatorsCache = null;
let ownedBordersCache = null;
const priceCache = new Map();
const artistCache = new Map();

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function getLevenshteinDistance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: b.length + 1 }, (_, j) =>
        Array.from({ length: a.length + 1 }, (_, i) =>
            j === 0 ? i : i === 0 ? j : 0,
        ),
    );

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator,
            );
        }
    }
    return matrix[b.length][a.length];
}

async function getOwnedBorders() {
    if (ownedBordersCache) return ownedBordersCache;
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/borders',
            method: 'GET',
            isRovalraApi: true,
        });

        if (response.ok) {
            const data = await response.json();
            ownedBordersCache = {
                borders: new Set(data.owned_borders || []),
                gamepasses: new Set(
                    (data.owned_gamepasses || []).map((id) => String(id)),
                ),
            };
            return ownedBordersCache;
        }
    } catch (e) {
        console.warn('RoValra: Failed to fetch owned borders', e);
    }
    return { borders: new Set(), gamepasses: new Set() };
}

async function getGamePassPrice(id) {
    if (priceCache.has(id)) return priceCache.get(id);
    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/game-passes/v1/game-passes/${id}/product-info`,
            method: 'GET',
        });
        if (response.ok) {
            const data = await response.json();
            const price = data.PriceInRobux ?? data.priceInRobux;
            priceCache.set(id, price);
            return price;
        }
    } catch (e) {
        console.warn('RoValra: Failed to fetch gamepass price', e);
    }
    return null;
}

function createArtistCreditSection(artistId) {
    const artistWrapper = document.createElement('div');
    artistWrapper.style.cssText =
        'margin: 6px 0 10px 0; display: flex; flex-direction: column; align-items: center; gap: 4px;';
    const artistLabel = document.createElement('div');
    artistLabel.style.cssText =
        'font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--rovalra-secondary-text-color); opacity: 0.8;';
    artistLabel.textContent = 'Artist';

    const contributorsWrapper = document.createElement('div');
    contributorsWrapper.className = 'setting-contributors';
    contributorsWrapper.style.cssText =
        'display: flex; flex-wrap: wrap; gap: 6px; margin-top: -2px; justify-content: center;';

    const artistPill = document.createElement('div');
    artistPill.className = 'rovalra-donator-card';
    artistPill.style.cssText =
        'display: flex; align-items: center; background: none; padding: 4px 10px 4px 4px; border-radius: 20px; border: none; transition: background-color 0.2s;';

    const link = document.createElement('a');
    link.className = 'avatar-card-link';
    link.href = `https://www.roblox.com/users/${artistId}/profile`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.cssText =
        'display: flex; align-items: center; gap: 6px; text-decoration: none; cursor: pointer; color: inherit; width: 100%;';

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'avatar-card-image';
    thumbContainer.style.cssText =
        'width: 20px; height: 20px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #393b3d; flex-shrink: 0;';

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText =
        'font-size: 11px; font-weight: 600; color: var(--rovalra-main-text-color); white-space: nowrap;';

    const applyData = (data) => {
        if (!data) return;
        addTooltip(
            link,
            `${data.name || artistId} created this avatar border.`,
            {
                position: 'top',
            },
        );
        const thumbEl = createThumbnailElement(data.thumb, 'Artist', '', {
            width: '100%',
            height: '100%',
        });
        const target =
            thumbContainer.querySelector('.rovalra-avatar-border-clip') ||
            thumbContainer;

        target.innerHTML = '';
        target.appendChild(thumbEl);
        nameSpan.textContent = data.name || 'Unknown';
    };

    const cached = artistCache.get(String(artistId));
    nameSpan.textContent = cached ? cached.name || 'Unknown' : '...';

    link.append(thumbContainer, nameSpan);
    artistPill.appendChild(link);

    if (cached) {
        applyData(cached);
    } else {
        (async () => {
            try {
                const [name, thumbnails] = await Promise.all([
                    getUserDisplayName
                        ? await getUserDisplayName(artistId)
                        : artistId,
                    getBatchThumbnails([artistId], 'AvatarHeadshot', '48x48'),
                ]);
                const data = { name, thumb: thumbnails[0] };
                artistCache.set(String(artistId), data);
                applyData(data);
            } catch (e) {}
        })();
    }

    contributorsWrapper.appendChild(artistPill);
    artistWrapper.append(artistLabel, contributorsWrapper);
    return artistWrapper;
}

async function openBorderOverlay(
    variant,
    otherVariant,
    authedUserData,
    container,
    previewHolder,
    artistId,
    gamepassId,
) {
    const tier = getCurrentUserTier();
    const ownedData = await getOwnedBorders();
    const isOwned =
        tier >= 3 ||
        ownedData.borders.has(variant.value) ||
        (gamepassId && ownedData.gamepasses.has(String(gamepassId)));
    const body = document.createElement('div');
    body.style.cssText =
        'display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 10px;';

    const previewContainer = document.createElement('div');
    previewContainer.style.cssText =
        'position: relative; width: 100%; height: 180px; display: grid; place-items: center; margin: 40px 0;';

    const createPreviewCard = (v, isOther = false) => {
        const card = createUserCard({
            displayName: authedUserData.displayName,
            username: '',
            thumbData: authedUserData.thumbData,
            href: '',
            presenceInfo: 1,
            isOpaque: !isOther,
            hidePresence: true,
        });
        card.querySelector(
            '.user-card-labels, .user-card-labels-no-username',
        )?.remove();

        const avatarEl = card.querySelector('.avatar.avatar-card-fullbody');
        if (avatarEl) applyBorderToContainer(avatarEl, v.link);

        card.style.overflow = 'visible';
        card.style.width = '90px';
        card.style.height = '90px';
        card.style.gridArea = '1 / 1';
        card.style.display = 'block';

        if (isOther) {
            card.style.transform = 'scale(1.1) translateX(65px)';
            card.style.zIndex = '1';
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.35';
        } else {
            card.style.transform = 'scale(1.4)';
            card.style.zIndex = '2';
        }
        return card;
    };

    if (otherVariant) {
        previewContainer.appendChild(createPreviewCard(otherVariant, true));
    }
    previewContainer.appendChild(createPreviewCard(variant, false));

    const infoWrapper = document.createElement('div');
    infoWrapper.style.cssText =
        'display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;';

    const nameLabel = document.createElement('div');
    nameLabel.style.cssText =
        'font-size: 18px; font-weight: 800; color: var(--rovalra-main-text-color); text-align: center;';
    nameLabel.textContent = variant.label;

    infoWrapper.appendChild(nameLabel);

    if (otherVariant && tier < 3) {
        const bundleNotice = document.createElement('div');
        bundleNotice.style.cssText =
            'font-size: 12px; color: var(--rovalra-secondary-text-color); text-align: center; margin-top: 2px; font-weight: 600;';
        bundleNotice.textContent =
            '(Includes both Static and Animated variants)';
        infoWrapper.appendChild(bundleNotice);
    }

    if (gamepassId) {
        const priceLabel = document.createElement('div');
        priceLabel.style.cssText =
            'font-size: 14px; font-weight: 600; color: var(--rovalra-secondary-text-color); display: flex; align-items: center; gap: 4px;';

        getGamePassPrice(gamepassId).then((price) => {
            if (price !== null) {
                const priceValue = price.toLocaleString();
                if (isOwned) {
                    priceLabel.innerHTML = `
                        <span style="text-decoration: line-through; opacity: 0.6; display: flex; align-items: center; gap: 2px;">
                            <span class="icon-robux-16x16"></span>${priceValue}
                        </span>
                        <span class="rovalra-free-label" style="color: var(--rovalra-main-text-color); margin-left: 4px; cursor: help; font-size: 16px;">${tier >= 3 ? 'Free' : 'Owned'}</span>
                    `; //Verified
                    const freeLabel = priceLabel.querySelector(
                        '.rovalra-free-label',
                    );
                    addTooltip(
                        freeLabel,
                        tier >= 3
                            ? 'Free because you have Donator Tier 3!'
                            : 'You own this border!',
                        {
                            position: 'top',
                        },
                    );
                } else {
                    priceLabel.innerHTML = `<span class="icon-robux-16x16"></span>${priceValue}`; //Verified
                }
            }
        });
        infoWrapper.appendChild(priceLabel);
    }

    if (artistId) {
        infoWrapper.appendChild(createArtistCreditSection(artistId));
    }
    body.append(previewContainer, infoWrapper);

    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn-cta-md btn-min-width';
    actionBtn.style.width = '100%';

    if (isOwned) {
        actionBtn.textContent = `Equip ${variant.label}`;
        addTooltip(
            actionBtn,
            tier >= 3
                ? 'Free because you have Donator Tier 3!'
                : 'You own this border!',
            { position: 'top' },
        );
        actionBtn.onclick = async () => {
            await handleSaveSettings('avatarBorderChoice', variant.value);
            updateUserSettingViaApi('border', variant.link).catch(() => {});
            updatePreviewAndUI(
                variant.value,
                variant.link,
                container,
                previewHolder,
            );
            close();
        };
    } else if (gamepassId) {
        actionBtn.textContent = 'Loading...';
        (async () => {
            const price = await getGamePassPrice(gamepassId);
            if (price !== null) {
                actionBtn.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 6px; vertical-align: middle; position: relative; top: -1px; filter: brightness(0) invert(1);"></span>Buy for ${price.toLocaleString()}`;
            } else {
                actionBtn.textContent = 'View Gamepass';
            }
        })();
        actionBtn.onclick = () =>
            window.open(
                `https://www.roblox.com/game-pass/${gamepassId}`,
                '_blank',
            );
    } else {
        actionBtn.textContent = 'Unavailable';
        actionBtn.disabled = true;
    }

    const { close } = createOverlay({
        title: otherVariant ? `${variant.label} & ${otherVariant.label}` : '',
        bodyContent: body,
        actions: [actionBtn],
        maxWidth: '400px',
    });
}

export async function applyTheme() {
    if (document.body.classList.contains('rovalra-settings-loading')) {
        document.body.classList.remove('rovalra-settings-loading');
    }
}

const debouncedApplyTheme = debounce(applyTheme, 50);
const debouncedAddPopoverButton = debounce(addPopoverButton, 100);
const debouncedAddCustomButton = debounce(
    () => addCustomButton(debouncedAddPopoverButton),
    100,
);

function getBadgeStyle(key) {
    const badge = BADGE_CONFIG[key];
    if (!badge || !badge.style) return '';
    return Object.entries(badge.style)
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
        .join(';');
}

const donatorBadgeKeys = ['donator_1', 'donator_2', 'donator_3'];

function getDonatorBadgesHtml() {
    return donatorBadgeKeys
        .map((key) => {
            const badge = BADGE_CONFIG[key];
            if (!badge) return '';
            const styleString = getBadgeStyle(key);
            const shortTooltip = badge.tooltip.split('.')[0];

            return `
            <div title="${badge.tooltip}" style="display: flex; align-items: center; gap: 10px; padding: 10px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; flex: 1; min-width: 240px;">
                <img src="${badge.icon}" style="width: 32px; height: 32px; ${styleString}" />
                <span style="color: var(--rovalra-main-text-color); font-size: 14px;">${shortTooltip}</span>
            </div>
        `;
        })
        .join('');
}

function getFeaturesByTier(tier) {
    const features = [];
    for (const [categoryKey, category] of Object.entries(SETTINGS_CONFIG)) {
        const tabId = categoryKey.toLowerCase();
        if (tabId === 'info' || tabId === 'credits' || tabId === 'donatorperks')
            continue;

        for (const [settingName, setting] of Object.entries(
            category.settings,
        )) {
            if (setting.donatorTier === tier) {
                features.push(
                    `<li><a href="#!/search?q=${settingName}" class="rovalra-perk-link" data-setting="${settingName}" style="color: var(--rovalra-main-text-color); text-decoration: underline; cursor: pointer;">${setting.label}</a></li>`,
                );
            }
            if (setting.childSettings) {
                for (const [childName, childSetting] of Object.entries(
                    setting.childSettings,
                )) {
                    if (childSetting.donatorTier === tier) {
                        features.push(
                            `<li><a href="#!/search?q=${childName}" class="rovalra-perk-link" data-setting="${childName}" style="color: var(--rovalra-main-text-color); text-decoration: underline; cursor: pointer;">${childSetting.label}</a></li>`,
                        );
                    }
                }
            }
        }
    }
    return features.length > 0
        ? features.join('')
        : `<li>${ts('settings.donatorPerks.moreComingSoon')}</li>`;
}

let contributorsCache = null;

function renderContributors(container, users, thumbMap) {
    container.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.style.cssText =
        'display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;';

    CONTRIBUTOR_USER_IDS.forEach((id) => {
        const user = users.find((u) => String(u.id) === String(id));
        if (user) {
            const thumbData = thumbMap.get(String(id));

            const item = document.createElement('div');
            item.className = 'rovalra-donator-card';
            item.style.cssText = `display: flex; align-items: center; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 8px 12px; border-radius: 8px; transition: background-color 0.2s;`;

            const link = document.createElement('a');
            link.className = 'avatar-card-link';
            link.href = `https://www.roblox.com/users/${id}/profile`;
            link.target = '_blank';
            link.style.cssText = `display: flex; align-items: center; text-decoration: none; color: var(--rovalra-main-text-color); width: 100%;`;

            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-card-image';
            Object.assign(avatarContainer.style, {
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                marginRight: '10px',
                overflow: 'hidden',
                flexShrink: '0',
            });

            const thumbElement = createThumbnailElement(
                thumbData,
                user.displayName,
                '',
                {
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                },
            );

            const span = document.createElement('span');
            span.textContent = user.displayName;
            span.style.fontWeight = '500';

            avatarContainer.appendChild(thumbElement);
            link.appendChild(avatarContainer);
            link.appendChild(span);
            item.appendChild(link);
            listContainer.appendChild(item);
        }
    });

    container.appendChild(listContainer);
}

function renderContributorsShimmer(container) {
    container.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.style.cssText =
        'display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;';

    CONTRIBUTOR_USER_IDS.forEach(() => {
        const item = document.createElement('div');
        item.className = 'rovalra-donator-card';
        item.style.cssText = `display: flex; align-items: center; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 8px 12px; border-radius: 8px; opacity: 0.7;`;

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-card-image';
        Object.assign(avatarContainer.style, {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            marginRight: '10px',
            overflow: 'hidden',
            flexShrink: '0',
        });

        const thumbShimmer = createThumbnailElement(
            { state: 'Pending' },
            'Loading...',
            '',
            {
                width: '100%',
                height: '100%',
            },
        );

        const nameShimmer = document.createElement('div');
        nameShimmer.className = 'thumbnail-2d-container shimmer';
        nameShimmer.style.cssText =
            'width: 80px; height: 14px; border-radius: 4px;';

        avatarContainer.appendChild(thumbShimmer);
        item.append(avatarContainer, nameShimmer);
        listContainer.appendChild(item);
    });

    container.appendChild(listContainer);
}

async function loadContributors() {
    const container = document.getElementById('rovalra-contributors-list');
    if (!container) return;

    if (contributorsCache) {
        renderContributors(
            container,
            contributorsCache.users,
            contributorsCache.thumbMap,
        );
        return;
    }

    renderContributorsShimmer(container);

    try {
        const response = await callRobloxApi({
            subdomain: 'users',
            endpoint: '/v1/users',
            method: 'POST',
            body: {
                userIds: CONTRIBUTOR_USER_IDS,
                excludeBannedUsers: false,
            },
        });

        if (!response.ok) throw new Error('Failed to fetch users');
        const data = await response.json();
        const users = data.data;

        const thumbnails = await getBatchThumbnails(
            CONTRIBUTOR_USER_IDS,
            'AvatarHeadshot',
            '150x150',
        );
        const thumbMap = new Map();
        thumbnails.forEach((t) => {
            thumbMap.set(String(t.targetId), t);
        });

        contributorsCache = { users, thumbMap };
        renderContributors(container, users, thumbMap);
    } catch (err) {
        console.error('RoValra: Error loading contributors', err);
        container.innerHTML = `<p style="color: var(--rovalra-secondary-text-color);">${ts('settings.credits.failedToLoadContributors')}</p>`;  // Verified
    }
}

function createAnonymousToggle(isAnonymous, onToggle) {
    const anonBtn = document.createElement('button');
    anonBtn.style.cssText =
        'background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; margin-left: 5px; color: var(--rovalra-secondary-text-color); flex-shrink: 0; transition: color 0.2s;';

    const path1 =
        'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7M2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2m4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3z';
    const path2 =
        'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3';

    anonBtn.innerHTML = `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="${isAnonymous ? path1 : path2}"></path></svg>`;

    addTooltip(
        anonBtn,
        isAnonymous ? 'Disable anonymous mode' : 'Enable anonymous mode',
    );

    anonBtn.onclick = onToggle;
    return anonBtn;
}

function renderTopDonators(container, donators, thumbMap) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top: 15px;';

    const top3 = donators.slice(0, 3);
    if (top3.length > 0) {
        const pedestalContainer = document.createElement('div');
        pedestalContainer.style.cssText =
            'display: flex; align-items: flex-end; justify-content: center; gap: 20px; margin-bottom: 30px; padding: 20px 0; border-bottom: 1px solid var(--rovalra-border-color);';

        const podiumData = [
            donators[2]
                ? {
                      ...donators[2],
                      rank: 3,
                      color: '#cd7f32',
                      height: '60px',
                      size: '64px',
                  }
                : null,
            donators[0]
                ? {
                      ...donators[0],
                      rank: 1,
                      color: '#ffd700',
                      height: '100px',
                      size: '80px',
                  }
                : null,
            donators[1]
                ? {
                      ...donators[1],
                      rank: 2,
                      color: '#c0c0c0',
                      height: '80px',
                      size: '72px',
                  }
                : null,
        ].filter(Boolean);

        podiumData.forEach((data) => {
            const column = document.createElement('div');
            column.className = 'rovalra-donator-card';
            column.style.cssText =
                'display: flex; flex-direction: column; align-items: center; width: 110px;';

            const thumbData = thumbMap.get(String(data.user_id));
            const thumbElement = createThumbnailElement(
                thumbData,
                data.username,
                '',
                {
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                },
            );

            const isAnonymous = String(data.user_id) === '1';

            const thumbLink = document.createElement(isAnonymous ? 'div' : 'a');
            if (!isAnonymous) {
                thumbLink.href = `https://www.roblox.com/users/${data.user_id}/profile`;
                thumbLink.className = 'avatar-card-link';
                thumbLink.target = '_blank';
            }
            thumbLink.style.display = 'block';
            if (isAnonymous) thumbLink.style.cursor = 'default';

            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-card-image-container';
            Object.assign(avatarContainer.style, {
                width: data.size,
                height: data.size,
                marginBottom: '10px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            });

            const avatarImage = document.createElement('div');
            avatarImage.className = 'avatar-card-image';
            Object.assign(avatarImage.style, {
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: `3px solid ${data.color}`,
                backgroundColor: 'var(--rovalra-container-background-color)',
                overflow: 'hidden',
            });
            avatarImage.appendChild(thumbElement);
            avatarContainer.appendChild(avatarImage);
            thumbLink.appendChild(avatarContainer);

            const name = document.createElement(isAnonymous ? 'span' : 'a');
            if (!isAnonymous) {
                name.href = `https://www.roblox.com/users/${data.user_id}/profile`;
                name.target = '_blank';
            }
            name.textContent = data.username;
            name.style.cssText =
                'color: var(--rovalra-main-text-color); font-weight: bold; font-size: 13px; text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            if (isAnonymous) {
                name.style.cursor = 'default';
                addTooltip(thumbLink, 'This user has enabled anonymous mode');
                addTooltip(name, 'This user has enabled anonymous mode');
            }

            const amount = document.createElement('div');
            amount.innerHTML = `<span class="icon-robux-16x16"></span>${safeHtml(data.amount.toLocaleString())}`;  // Verified
            amount.style.cssText =
                'color: var(--rovalra-main-text-color); font-size: 13px; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 2px;';

            const stool = document.createElement('div');
            stool.style.cssText = `width: 80px; height: ${data.height}; background-color: var(--rovalra-container-background-color); border-radius: 8px 8px 0 0; border: 1px solid var(--rovalra-border-color); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: ${data.color};`;
            stool.textContent = data.rank;

            column.append(thumbLink, name, amount, stool);
            pedestalContainer.appendChild(column);
        });
        wrapper.appendChild(pedestalContainer);
    }

    const remaining = donators.slice(3);
    if (remaining.length > 0) {
        const list = document.createElement('div');
        list.style.cssText =
            'display: flex; flex-direction: column; gap: 10px;';

        remaining.forEach((donor, idx) => {
            const rank = idx + 4;
            const item = document.createElement('div');
            item.className = 'rovalra-donator-card';
            item.style.cssText =
                'display: flex; align-items: center; padding: 10px 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color);';

            const rankEl = document.createElement('span');
            rankEl.textContent = `#${rank}`;
            rankEl.style.cssText =
                'width: 40px; font-weight: bold; color: var(--rovalra-secondary-text-color); font-size: 14px;';

            const thumbData = thumbMap.get(String(donor.user_id));
            const thumb = createThumbnailElement(
                thumbData,
                donor.username,
                '',
                {
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                },
            );

            const isAnonymous = String(donor.user_id) === '1';

            const thumbLink = document.createElement(isAnonymous ? 'div' : 'a');
            if (!isAnonymous) {
                thumbLink.href = `https://www.roblox.com/users/${donor.user_id}/profile`;
                thumbLink.className = 'avatar-card-link';
                thumbLink.target = '_blank';
            }
            thumbLink.style.display = 'flex';
            if (isAnonymous) thumbLink.style.cursor = 'default';

            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-card-image-container';
            Object.assign(avatarContainer.style, {
                width: '36px',
                height: '36px',
                marginRight: '15px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            });

            const avatarImage = document.createElement('div');
            avatarImage.className = 'avatar-card-image';
            Object.assign(avatarImage.style, {
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: 'var(--rovalra-container-background-color)',
                overflow: 'hidden',
            });
            avatarImage.appendChild(thumb);
            avatarContainer.appendChild(avatarImage);
            thumbLink.appendChild(avatarContainer);

            const userInfo = document.createElement('div');
            userInfo.style.cssText =
                'flex: 1; display: flex; align-items: center; justify-content: space-between;';

            const name = document.createElement(isAnonymous ? 'span' : 'a');
            if (!isAnonymous) {
                name.href = `https://www.roblox.com/users/${donor.user_id}/profile`;
                name.target = '_blank';
            }
            name.textContent = donor.username;
            name.style.cssText =
                'color: var(--rovalra-main-text-color); font-weight: 500; text-decoration: none; font-size: 14px;';
            if (isAnonymous) {
                name.style.cursor = 'default';
                addTooltip(thumbLink, 'This user has enabled anonymous mode');
                addTooltip(name, 'This user has enabled anonymous mode');
            }
            const amount = document.createElement('span');
            amount.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 2px;"></span>${safeHtml(donor.amount.toLocaleString())}`;  // Verified
            amount.style.cssText =
                'color: var(--rovalra-secondary-text-color); font-size: 12px; font-weight: bold; display: flex; align-items: center;';

            userInfo.append(name, amount);
            item.append(rankEl, thumbLink, userInfo);
            list.appendChild(item);
        });
        wrapper.appendChild(list);
    }

    container.appendChild(wrapper);
}

function renderTopDonatorsShimmer(container) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top: 15px;';

    const pedestalContainer = document.createElement('div');
    pedestalContainer.style.cssText =
        'display: flex; align-items: flex-end; justify-content: center; gap: 20px; margin-bottom: 30px; padding: 20px 0; border-bottom: 1px solid var(--rovalra-border-color);';

    const podiumOrder = [
        { rank: 3, height: '60px', size: '64px', color: '#cd7f32' },
        { rank: 1, height: '100px', size: '80px', color: '#ffd700' },
        { rank: 2, height: '80px', size: '72px', color: '#c0c0c0' },
    ];

    podiumOrder.forEach((config) => {
        const column = document.createElement('div');
        column.className = 'rovalra-donator-card';
        column.style.cssText =
            'display: flex; flex-direction: column; align-items: center; width: 110px;';

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-card-image-container';
        Object.assign(avatarContainer.style, {
            width: config.size,
            height: config.size,
            marginBottom: '10px',
            position: 'relative',
        });

        const avatarImage = document.createElement('div');
        avatarImage.className = 'avatar-card-image';
        Object.assign(avatarImage.style, {
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            border: `3px solid ${config.color}`,
            backgroundColor: 'var(--rovalra-container-background-color)',
            overflow: 'hidden',
        });

        const thumbShimmer = createThumbnailElement(
            { state: 'Pending' },
            'Loading...',
            '',
            {
                width: '100%',
                height: '100%',
            },
        );

        avatarImage.appendChild(thumbShimmer);
        avatarContainer.appendChild(avatarImage);
        const nameShimmer = document.createElement('div');
        nameShimmer.className = 'thumbnail-2d-container shimmer';
        nameShimmer.style.cssText =
            'width: 80px; height: 14px; border-radius: 4px; margin-bottom: 10px;';

        const amountShimmer = document.createElement('div');
        amountShimmer.className = 'thumbnail-2d-container shimmer';
        amountShimmer.style.cssText =
            'width: 50px; height: 12px; border-radius: 4px; margin-bottom: 10px;';

        const stool = document.createElement('div');
        stool.style.cssText = `width: 80px; height: ${config.height}; background-color: var(--rovalra-container-background-color); border-radius: 8px 8px 0 0; border: 1px solid var(--rovalra-border-color); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: ${config.color}; opacity: 0.5;`;
        stool.textContent = config.rank;

        column.append(avatarContainer, nameShimmer, amountShimmer, stool);
        pedestalContainer.appendChild(column);
    });
    wrapper.appendChild(pedestalContainer);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    for (let i = 0; i < 5; i++) {
        const item = document.createElement('div');
        item.className = 'rovalra-donator-card';
        item.style.cssText =
            'display: flex; align-items: center; padding: 10px 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color);';

        const rankEl = document.createElement('span');
        rankEl.textContent = `#${i + 4}`;
        rankEl.style.cssText =
            'width: 40px; font-weight: bold; color: var(--rovalra-secondary-text-color); font-size: 14px; opacity: 0.5;';

        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'avatar-card-image-container';
        Object.assign(avatarContainer.style, {
            width: '36px',
            height: '36px',
            marginRight: '15px',
            position: 'relative',
        });

        const avatarImage = document.createElement('div');
        avatarImage.className = 'avatar-card-image';
        Object.assign(avatarImage.style, {
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            overflow: 'hidden',
        });

        const thumbShimmer = createThumbnailElement(
            { state: 'Pending' },
            'Loading...',
            '',
            {
                width: '100%',
                height: '100%',
            },
        );

        avatarImage.appendChild(thumbShimmer);
        avatarContainer.appendChild(avatarImage);

        const userInfo = document.createElement('div');
        userInfo.style.cssText =
            'flex: 1; display: flex; align-items: center; justify-content: space-between;';

        const nameShimmer = document.createElement('div');
        nameShimmer.className = 'thumbnail-2d-container shimmer';
        nameShimmer.style.cssText =
            'width: 100px; height: 14px; border-radius: 4px;';

        const amountShimmer = document.createElement('div');
        amountShimmer.className = 'thumbnail-2d-container shimmer';
        amountShimmer.style.cssText =
            'width: 60px; height: 12px; border-radius: 4px;';

        userInfo.append(nameShimmer, amountShimmer);
        item.append(rankEl, avatarContainer, userInfo);
        list.appendChild(item);
    }
    wrapper.appendChild(list);

    container.appendChild(wrapper);
}

async function loadTopDonators() {
    const container = document.getElementById('rovalra-top-donators');
    const toggleContainer = document.getElementById(
        'rovalra-anon-toggle-container',
    );
    if (!container) return;

    if (topDonatorsCache) {
        if (toggleContainer && topDonatorsCache.authedDonorInfo) {
            renderAnonToggleArea(
                toggleContainer,
                topDonatorsCache.authedDonorInfo,
            );
        }
        renderTopDonators(
            container,
            topDonatorsCache.donators,
            topDonatorsCache.thumbMap,
        );
        return;
    }
    renderTopDonatorsShimmer(container);

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/donators/top',
            method: 'GET',
        });

        if (!response.ok) throw new Error('Failed to fetch top donators');
        const data = await response.json();
        const donators = data.donators || [];

        if (donators.length === 0) {
            container.innerHTML = '';
            return;
        }

        const userIds = donators.map((d) => d.user_id);
        const thumbnails = await getBatchThumbnails(
            userIds,
            'AvatarHeadshot',
            '150x150',
        );
        const thumbMap = new Map();
        thumbnails.forEach((t) => {
            thumbMap.set(String(t.targetId), t);
        });

        const authenticatedUserId = await getAuthenticatedUserId();
        const userTier = getCurrentUserTier();
        let authedDonorInfo = null;

        if (authenticatedUserId && userTier >= 1 && toggleContainer) {
            try {
                const settings = await getUserSettings(authenticatedUserId, {
                    noCache: true,
                });

                const userResponse = await callRobloxApi({
                    subdomain: 'users',
                    endpoint: `/v1/users/${authenticatedUserId}`,
                    method: 'GET',
                });

                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    const thumbs = await getBatchThumbnails(
                        [authenticatedUserId],
                        'AvatarHeadshot',
                        '60x60',
                    );
                    authedDonorInfo = {
                        userId: authenticatedUserId,
                        name: userData.displayName || userData.name,
                        thumb: thumbs[0],
                        isAnonymous: settings.anonymous_leaderboard === true,
                    };
                    renderAnonToggleArea(toggleContainer, authedDonorInfo);
                }
            } catch (error) {
                console.error(
                    'RoValra: Error rendering anon toggle area',
                    error,
                );
            }
        }

        topDonatorsCache = {
            donators,
            thumbMap,
            currentUserId: authenticatedUserId,
            authedDonorInfo,
        };
        renderTopDonators(container, donators, thumbMap);
    } catch (err) {
        console.error('RoValra: Error loading top donators', err);
        container.innerHTML = '';
    }
}

function renderAnonToggleArea(container, info) {
    container.innerHTML = '';
    container.style.cssText =
        'display: flex; align-items: center; gap: 8px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--rovalra-border-color);';

    const thumb = createThumbnailElement(info.thumb, info.name, '', {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
    });

    const nameSpan = document.createElement('span');
    nameSpan.textContent = info.name;
    nameSpan.style.cssText =
        'color: var(--rovalra-main-text-color); font-size: 12px; font-weight: 600;';

    const toggle = createAnonymousToggle(info.isAnonymous, async (e) => {
        e.preventDefault();
        const success = await updateUserSettingViaApi(
            'anonymous_leaderboard',
            !info.isAnonymous,
        );
        if (success) {
            topDonatorsCache = null; // Force refetch to update leaderboard
            loadTopDonators();
        }
    });

    container.append(thumb, nameSpan, toggle);
}

export const buttonData = [
    {
        id: 'info',
        get text() {
            return ts('settings.tabs.info');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.info.title')}</h2>
                <p>${ts('settings.info.desc1')}</p>
                <div style="margin-top: 5px;">
                    <p>${ts('settings.info.desc2')}</p>
                    <div style="margin-top: 5px;">
                        <p>${ts('settings.info.desc3')}</p>
                        <div style="margin-top: 5px;">
                            <p>${ts('settings.info.desc4')}</p>
                            <div style="margin-top: 5px;">
                                <p>${ts('settings.info.gilbert')}</p>
                                <div style="margin-top: 5px;">
                                    <p>${ts('settings.info.suggestions')}</p>
                                    <div style="margin-top: 5px;">
                                        <p>${ts('settings.info.bugs')}</p>
                                        <div style="margin-top: 5px;">
                                            <p>${ts('settings.info.review')}</p>
                                        </div>
                                        <div style="margin-top: 10px; margin-bottom: 20px;">
                                            <a href="https://discord.gg/GHd5cSKJRk" target="_blank" class="rovalra-discord-link">${ts('settings.info.discord')}</a>
                                            <a href="https://github.com/NotValra/RoValra" target="_blank" class="rovalra-github-link">
                                                ${ts('settings.info.github')}
                                                <img src="${assets.rovalraIcon}" style="width: 20px; height: 20px; margin-right: 0px; vertical-align: middle;" />
                                            </a>
                                            <a href="https://www.roblox.com/games/store-section/9452973012" target="_blank" class="rovalra-roblox-link">${ts('settings.info.support')}</a>
                                            <a href="https://www.tiktok.com/@valrawantbanana" target="_blank" class="rovalra-tiktok-link">${ts('settings.info.tiktok')}</a>
                                            <a href="https://x.com/ValraSwag" target="_blank" class="rovalra-x-link">${ts('settings.info.x')}</a>
                                        </div>
                                        <div id="export-import-buttons-container" style="border-top: 1px solid var(--rovalra-secondary-text-color); opacity: 0.8; padding-top: 15px; display: flex; justify-content: flex-start; gap: 10px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        },
    },
    {
        id: 'credits',
        get text() {
            return ts('settings.tabs.credits');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.credits.title')}</h2>
                <ul style="margin-top: 10px; padding-left: 0px; color: var(--rovalra-secondary-text-color);">
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        ${ts('settings.credits.frames')}
                        <a href="https://github.com/workframes/roblox-owner-counts" target="_blank" class="rovalra-github-link">${ts('settings.info.github')}</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        ${ts('settings.credits.julia')}
                        <a href="https://github.com/RoSeal-Extension/Top-Secret-Thing" target="_blank" class="rovalra-github-link">${ts('settings.info.github')}</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                         ${ts('settings.credits.aspect')}
                         <a href="https://github.com/Aspectise" target="_blank" class="rovalra-github-link">GitHub</a>
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                         ${ts('settings.credits.l5se')}
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        ${ts('settings.credits.lz')}
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        ${ts('settings.credits.mmfw')}
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        ${ts('settings.credits.coweggs')}
                    </li>
                    <li style="margin-bottom: 8px; list-style-type: disc; margin-left: 20px;">
                        ${ts('settings.credits.woozynate')}
                    </li>
                </ul>

                <h3 style="margin-top: 25px; margin-bottom: 10px; color: var(--rovalra-main-text-color); font-size: 18px;">${ts('settings.credits.contributorsTitle')}</h3>
                <div id="rovalra-contributors-list"></div>
            </div>`;
        },
    },
    {
        id: 'donatorPerks',
        get text() {
            return ts('settings.tabs.donatorPerks');
        },
        get content() {
            const theme = getCurrentTheme();
            const themeColors = THEME_CONFIG[theme] || THEME_CONFIG.dark;

            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.donatorPerks.title')}</h2>
                <p>${ts('settings.donatorPerks.subtitle')}</p>
                
                <div style="margin-top: 15px; font-size: 13px; color: var(--rovalra-secondary-text-color);">
                    ${parseMarkdown(ts('settings.donatorPerks.note'), themeColors)}
                </div>

                <div style="margin-top: 15px;">
                    <h3 style="color: var(--rovalra-main-text-color); margin-bottom: 5px; font-size: 18px;">${ts('settings.donatorPerks.howToGet')}</h3>
                    <p>${ts('settings.donatorPerks.howToGetDesc')}</p>
                    <div style="margin-top: 10px;">
                        <a href="https://www.roblox.com/games/store-section/9452973012" target="_blank" class="rovalra-roblox-link">${ts('settings.donatorPerks.goToGame')}</a>
                    </div>
                </div>

                <div style="margin-top: 10px;">
                    <h3 style="color: var(--rovalra-main-text-color); margin-bottom: 10px; font-size: 18px;">${ts('settings.donatorPerks.perkTiers')}</h3>
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div style="padding: 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2));">
                            <div id="donator-tier-1-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <img src="${BADGE_CONFIG.donator_1.icon}" style="width: 32px; height: 32px; ${getBadgeStyle('donator_1')}" />
                                <h4 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 16px;">${ts('settings.donatorPerks.tier1')}</h4>
                            </div>
                            <div style="color: var(--rovalra-secondary-text-color); font-size: 14px;">${parseMarkdown(ts('settings.donatorPerks.tier1Desc'), themeColors)}</div>
                            <ul style="margin-top: 5px; padding-left: 20px; color: var(--rovalra-secondary-text-color); margin-bottom: 0;">
                                <li>${ts('settings.donatorPerks.tier1Reward').replace(/\n/g, '<br>')}</li>
                                ${getFeaturesByTier(1)}
                            </ul>
                        </div>

                        <div style="padding: 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2));">
                            <div id="donator-tier-2-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <img src="${BADGE_CONFIG.donator_2.icon}" style="width: 32px; height: 32px; ${getBadgeStyle('donator_2')}" />
                                <h4 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 16px;">${ts('settings.donatorPerks.tier2')}</h4>
                            </div>
                            <div style="color: var(--rovalra-secondary-text-color); font-size: 14px;">${parseMarkdown(ts('settings.donatorPerks.tier2Desc'), themeColors)}</div>
                            <ul style="margin-top: 5px; padding-left: 20px; color: var(--rovalra-secondary-text-color); margin-bottom: 0;">
                                <li>${ts('settings.donatorPerks.tier2Reward').replace(/\n/g, '<br>')}</li>
                                <li>${ts('settings.donatorPerks.previousRewards').replace(/\n/g, '<br>')}</li>
                                ${getFeaturesByTier(2)}
                            </ul>
                        </div>

                        <div style="padding: 15px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2));">
                            <div id="donator-tier-3-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <img src="${BADGE_CONFIG.donator_3.icon}" style="width: 32px; height: 32px; ${getBadgeStyle('donator_3')}" />
                                <h4 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 16px;">${ts('settings.donatorPerks.tier3')}</h4>
                            </div>
                            <div style="color: var(--rovalra-secondary-text-color); font-size: 14px;">${parseMarkdown(ts('settings.donatorPerks.tier3Desc'), themeColors)}</div>
                            <ul style="margin-top: 5px; padding-left: 20px; color: var(--rovalra-secondary-text-color); margin-bottom: 0;">
                                <li>${ts('settings.donatorPerks.tier3Reward').replace(/\n/g, '<br>')}</li>
                                <li>${ts('settings.donatorPerks.previousRewards').replace(/\n/g, '<br>')}</li>
                                ${getFeaturesByTier(3)}
                            </ul>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                    <h3 style="color: var(--rovalra-main-text-color); margin-bottom: 10px; font-size: 18px;">${ts('settings.donatorPerks.availableBadges')}</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px; align-items: stretch;">
                        ${getDonatorBadgesHtml()}
                    </div>
                </div>

                <div style="margin-top: 25px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                        <h3 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 18px;">Top Donators</h3>
                        <div id="rovalra-anon-toggle-container"></div>
                    </div>
                    <div id="rovalra-top-donators"></div>
                </div>
            </div>`;
        },
    },
    {
        id: 'store',
        get text() {
            return 'Store';
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 15px; color: var(--rovalra-main-text-color) !important;">Avatar Border Store</h2>
                <p style="color: var(--rovalra-secondary-text-color); margin-bottom: 20px;">Preview and select your avatar borders. This is a <strong>Donator Tier 3</strong> perk.</p>
                <div id="rovalra-store-border-container" style="color: var(--rovalra-secondary-text-color);">Loading borders...</div>
            </div>`;
        },
    },
    {
        id: 'accountStanding',
        get text() {
            return ts('settings.tabs.accountStanding');
        },
        get content() {
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 15px; color: var(--rovalra-main-text-color) !important;">${ts('settings.tabs.accountStanding') || 'Account Standing'}</h2>
                <div id="rovalra-account-standing-container">
                    <div style="color: var(--rovalra-secondary-text-color);">${ts('settings.credits.loadingContributors')}</div>
                </div>
            </div>`;
        },
    },
    {
        id: 'settings',
        get text() {
            return ts('settings.tabs.settings');
        },
        get content() {
            return `
            <div id="settings-content" style="padding: 0; background-color: transparent;">
                <div id="setting-section-buttons" style="display: flex; margin-bottom: 25px;"></div>
                <div id="setting-section-content" style="padding: 5px;"></div>
            </div>`;
        },
    },
];

function openAppealOverlay(onSave) {
    const container = document.createElement('div');
    Object.assign(container.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingTop: '5px',
        alignItems: 'center',
    });

    const { container: inputContainer, input } = createStyledInput({
        id: 'rovalra-appeal-message-input',
        label: 'Enter your appeal message (20-3000 characters)',
        value: '',
        multiline: true,
    });
    inputContainer.style.width = '100%';
    input.minLength = 20;
    input.maxLength = 3000;

    container.appendChild(inputContainer);

    const errorDisplay = document.createElement('p');
    errorDisplay.className = 'text-error';
    Object.assign(errorDisplay.style, {
        display: 'none',
        marginTop: '-4px',
        marginBottom: '0',
    });
    container.appendChild(errorDisplay);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary-md';
    submitBtn.textContent = 'Submit Appeal';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-control-md';
    cancelBtn.textContent = 'Cancel';

    const { close } = createOverlay({
        title: 'Submit Appeal',
        bodyContent: container,
        actions: [cancelBtn, submitBtn],
        maxWidth: '450px',
        preventBackdropClose: true,
    });

    cancelBtn.onclick = close;
    submitBtn.onclick = async () => {
        const appealMessage = input.value.trim();
        if (appealMessage.length < 20 || appealMessage.length > 3000) {
            errorDisplay.textContent =
                'Appeal message must be between 20 and 3000 characters.';
            errorDisplay.style.display = 'block';
            return;
        }
        submitBtn.disabled = true;
        const success = await onSave(appealMessage);
        if (success) {
            close();
            const standingContainer = document.getElementById(
                'rovalra-account-standing-container',
            );
            if (standingContainer) renderAccountStanding(standingContainer);
        } else {
            submitBtn.disabled = false;
            errorDisplay.textContent =
                'Failed to submit appeal. Please try again.';
            errorDisplay.style.display = 'block';
        }
    };
}

async function renderAccountStanding(container) {
    container.innerHTML = '';

    const levels = [
        { label: 'All Good', color: '#23a55a' },
        { label: 'Limited', color: '#f0b232' },
        { label: 'Very Limited', color: '#f26522' },
        { label: 'At Risk', color: '#f23f43' },
        { label: 'Suspended', color: '#8b0000' },
    ];

    const discordCard = document.createElement('div');
    discordCard.style.cssText =
        'background-color: var(--rovalra-container-background-color); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 24px;';
    container.appendChild(discordCard);

    // Initial instant render assuming good standing
    discordCard.innerHTML = DOMPurify.sanitize(`
        <div style="display: flex; align-items: flex-start; gap: 20px;">
            <div class="standing-status-icon-bg" style="width: 48px; height: 48px; border-radius: 50%; background-color: #23a55a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background-color 0.3s;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path class="standing-status-icon-path" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
            </div>
            <div style="flex: 1;">
                <h3 class="standing-status-title" style="margin: 0 0 8px 0; font-size: 18px; color: var(--rovalra-main-text-color);">Your account is in good standing.</h3>
                <p class="standing-status-desc" style="margin: 0; font-size: 14px; color: var(--rovalra-secondary-text-color); line-height: 1.5;">You do not have any active violations or restrictions from the RoValra safety team.</p>
            </div>
        </div>
        <div style="padding: 20px 10px 40px 10px; border-radius: 8px; margin-top: 10px;">
            <div style="height: 12px; background: rgba(128,128,128,0.2); border-radius: 6px; position: relative; margin-bottom: 25px;">
                <div class="standing-status-fill" style="position: absolute; left: 0; top: 0; height: 100%; width: 0%; background: #23a55a; border-radius: 6px; transition: width 0.5s ease, background-color 0.3s;"></div>
                ${levels
                    .map((level, index) => {
                        const leftPos = (index / (levels.length - 1)) * 100;
                        return `
                        <div class="standing-status-dot" data-index="${index}" style="position: absolute; left: ${leftPos}%; top: 50%; transform: translate(-50%, -50%); width: 20px; height: 20px; border-radius: 50%; background: ${index === 0 ? level.color : '#4f545c'}; border: 4px solid var(--rovalra-container-background-color); z-index: 2; transition: background 0.3s;"></div>
                        <div class="standing-status-label" data-index="${index}" style="font-size: 12px; font-weight: 600; color: ${index === 0 ? 'var(--rovalra-main-text-color)' : 'var(--rovalra-secondary-text-color)'}; opacity: ${index === 0 ? '1' : '0.5'}; text-align: center; width: 60px; margin-left: -30px; position: absolute; left: ${leftPos}%; margin-top: 15px; transition: color 0.3s, opacity 0.3s;">${level.label}</div>
                    `;
                    })
                    .join('')}
            </div>
        </div>
        <div class="standing-policy-anchor"></div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--rovalra-border-color); font-size: 12px; color: var(--rovalra-secondary-text-color); line-height: 1.5;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--rovalra-secondary-text-color);">RoValra Safety Policy</div>
            Accounts found in violation of the <a href="https://www.rovalra.com/tou/" target="_blank" style="color: inherit; text-decoration: underline;">RoValra Terms of Service</a> or deemed a risk via third-party detections will have specific features disabled. Please note that while specific online capabilities may be restricted, the RoValra safety team will <strong>never</strong> disable the entire extension or fully local features.
        </div>
    `);

    if (standingCache) {
        updateAccountStandingUI(discordCard, standingCache, levels);
        return;
    }

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: '/v1/auth/moderation/status',
            method: 'GET',
            isRovalraApi: true,
        });

        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        standingCache = data;
        updateAccountStandingUI(discordCard, data, levels);
    } catch (err) {
        console.error('RoValra: Failed to load standing data', err);
    }
}

function updateAccountStandingUI(discordCard, data, levels) {
    const currentStatus = data.moderation.moderation_status ?? 0;
    const isGoodStanding = currentStatus === 0;

    const iconBg = discordCard.querySelector('.standing-status-icon-bg');
    const iconPath = discordCard.querySelector('.standing-status-icon-path');
    const statusTitle = discordCard.querySelector('.standing-status-title');
    const statusDesc = discordCard.querySelector('.standing-status-desc');
    const fill = discordCard.querySelector('.standing-status-fill');
    const dots = discordCard.querySelectorAll('.standing-status-dot');
    const labels = discordCard.querySelectorAll('.standing-status-label');
    const policyAnchor = discordCard.querySelector('.standing-policy-anchor');

    if (!isGoodStanding) {
        iconBg.style.backgroundColor = '#f23f43';
        iconPath.setAttribute(
            'd',
            'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
        );
        statusTitle.textContent = 'We found a violation on your account.';
        statusDesc.textContent = `Your account status has been set to: ${RESTRICTION_LEVELS[currentStatus] || 'Unknown'}`;
    }

    fill.style.width = `${(currentStatus / (levels.length - 1)) * 100}%`;
    fill.style.backgroundColor = levels[currentStatus]?.color || '#808080';

    dots.forEach((dot, index) => {
        dot.style.background =
            index <= currentStatus ? levels[index].color : '#4f545c';
    });

    labels.forEach((label, index) => {
        const isCurrent = index === currentStatus;
        label.style.color = isCurrent
            ? 'var(--rovalra-main-text-color)'
            : 'var(--rovalra-secondary-text-color)';
        label.style.opacity = isCurrent ? '1' : '0.5';
    });

    if (!isGoodStanding) {
        const reason = data.moderation.moderation_reason;
        const modContent = data.moderation.moderated_content_history || [];

        const automatedHtml = data.moderation.automated
            ? `<div style="display: inline-block; margin-top: 8px; padding: 2px 6px; background: #0084ff; color: white; border-radius: 4px; font-size: 12px; font-weight: 600;">Automated Action</div>`
            : `<div style="display: inline-block; margin-top: 8px; padding: 2px 6px; background: rgba(128, 128, 128, 0.2); color: var(--rovalra-secondary-text-color); border-radius: 4px; font-size: 12px; font-weight: 600;">Manual Review</div>`;

        const disabledFeatures =
            (typeof reason === 'object' && reason?.disabled_features) || [];

        const disabledFeaturesHtml =
            disabledFeatures.length > 0
                ? `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--rovalra-border-color);">
                <div style="color: #f23f43; font-weight: 600; font-size: 13px; margin-bottom: 8px;">Disabled Features</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${disabledFeatures
                        .map(
                            (feature) =>
                                `<div style="background: rgba(242, 63, 67, 0.1); padding: 4px 10px; border-radius: 6px; color: #f23f43; font-size: 11px; font-weight: 600; text-transform: capitalize;">${feature}</div>`,
                        )
                        .join('')}
                </div>
            </div>`
                : '';

        const modContentHtml =
            modContent.length > 0
                ? `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--rovalra-border-color);">
                <div style="color: #f23f43; font-weight: 600; font-size: 13px; margin-bottom: 8px;">Moderated Content</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${modContent
                        .map(
                            (item) => `
                        <div style="background: rgba(0,0,0,0.1); padding: 8px; border-radius: 8px;">
                            <div style="font-weight: 600; color: var(--rovalra-secondary-text-color); font-size: 12px; margin-bottom: 4px;">${item.config_key}</div>
                            <div style="font-size: 13px; color: var(--rovalra-main-text-color); word-break: break-all;">${item.content_value}</div>
                        </div>
                    `,
                        )
                        .join('')}
                </div>
            </div>`
                : '';

        const reasonHtml = document.createElement('div');
        const violationColor = levels[currentStatus]?.color || '#f23f43';
        reasonHtml.style.cssText =
            'margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--rovalra-border-color);';
        reasonHtml.innerHTML = DOMPurify.sanitize(`
            <div style="font-size: 14px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 8px;">Violation Details</div>
            <div style="background: rgba(0,0,0,0.05); padding: 15px; border-radius: 8px; border-left: 4px solid ${violationColor};">
                <div style="font-weight: 600; color: var(--rovalra-main-text-color); margin-bottom: 4px;">${typeof reason === 'string' ? reason : reason?.title || 'Unknown Reason'}</div>
                ${reason?.description ? `<div style="font-size: 13px; color: var(--rovalra-secondary-text-color);">${reason.description}</div>` : ''}
                ${automatedHtml}
                ${disabledFeaturesHtml}
                ${modContentHtml}
                <div style="margin-top: 10px; font-size: 11px; opacity: 0.7;" class="standing-mod-date">Moderated: </div>
            </div>
        `);
        const dateContainer = reasonHtml.querySelector('.standing-mod-date');
        if (data.moderation.moderated_at)
            dateContainer.appendChild(
                createInteractiveTimestamp(data.moderation.moderated_at),
            );
        discordCard.insertBefore(reasonHtml, policyAnchor);

        if (
            data.appeal &&
            data.appeal.appeal_status !== null &&
            data.appeal.appeal_status !== 0
        ) {
            const statusColors = ['#808080', '#f0b232', '#f23f43', '#23a55a'];
            const statusColor =
                statusColors[data.appeal.appeal_status] ||
                'var(--rovalra-secondary-text-color)';

            const appealSection = document.createElement('div');
            appealSection.style.cssText = `padding: 15px; background: rgba(0,0,0,0.05); border-radius: 8px; border-left: 4px solid ${statusColor};`;
            appealSection.innerHTML = DOMPurify.sanitize(`
                <div style="font-size: 14px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 8px;">Appeal Case</div>
                <div style="font-size: 14px; color: var(--rovalra-main-text-color); margin-bottom: 12px;">Status: <strong style="color: ${statusColor};">${APPEAL_STATUSES[data.appeal.appeal_status]}</strong></div>
                
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 13px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 2px;">Your Message</div>
                    <div style="font-size: 13px; color: var(--rovalra-main-text-color); opacity: 0.9;">${data.appeal.appeal_message || 'N/A'}</div>
                </div>

                <div style="font-size: 13px; font-weight: 600; color: var(--rovalra-secondary-text-color); margin-bottom: 2px;">Response</div>
                <div style="font-size: 13px; color: var(--rovalra-secondary-text-color);">${data.appeal.appeal_response || 'Our team is currently reviewing your appeal.'}</div>
            `);
            discordCard.insertBefore(appealSection, policyAnchor);
        }

        if (data.appeal?.appeal_status === 0) {
            const btn = document.createElement('button');
            btn.className = 'btn-secondary-md';
            btn.textContent = 'Appeal this decision';
            btn.style.marginTop = '20px';
            btn.style.width = '100%';
            btn.onclick = () =>
                openAppealOverlay(async (msg) => {
                    try {
                        const res = await callRobloxApi({
                            subdomain: 'apis',
                            endpoint: '/v1/auth/moderation/appeal',
                            method: 'POST',
                            isRovalraApi: true,
                            body: { message: msg },
                        });
                        return res.ok;
                    } catch {
                        return false;
                    }
                });
            discordCard.insertBefore(btn, policyAnchor);
        }
    }
}

function flattenBorders(borderCategories) {
    const flat = [];
    for (const category of borderCategories) {
        if (category.value === 'none') {
            flat.push(category);
            continue;
        }
        if (category.variants) {
            for (const variant of category.variants) {
                flat.push({
                    value: variant.value,
                    label: variant.label,
                    link: variant.link,
                    gamepassId: variant.gamepassId,
                    artistId: variant.artistId,
                    categoryLabel: category.label,
                    isAnimated: false,
                });
                if (variant.animated) {
                    for (const anim of variant.animated) {
                        flat.push({
                            value: anim.value,
                            label: anim.label,
                            link: anim.link,
                            categoryLabel: category.label,
                            isAnimated: true,
                            parentValue: variant.value,
                        });
                    }
                }
            }
        }
    }
    return flat;
}

function findBorderItem(categories, value) {
    if (!value || value === 'none') return null;
    for (const category of categories) {
        if (category.value === value) return category;
        if (category.variants) {
            for (const variant of category.variants) {
                if (variant.value === value) return variant;
                if (variant.animated) {
                    for (const anim of variant.animated) {
                        if (anim.value === value) return anim;
                    }
                }
            }
        }
    }
    return null;
}

async function renderStoreBorders(container) {
    container.innerHTML = '';
    const skeleton = document.createDocumentFragment();

    const previewShimmer = document.createElement('div');
    previewShimmer.style.cssText =
        'display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-bottom: 20px;';
    previewShimmer.innerHTML = `
        <div class="shimmer" style="width: 180px; height: 12px; margin-bottom: 10px; border-radius: 4px;"></div>
        <div class="setting-label-divider" style="width: 100%; margin-bottom: 10px;"></div>
        <div class="shimmer" style="width: 110px; height: 110px; border-radius: 50%; margin: 25px 0;"></div>
    `;
    skeleton.appendChild(previewShimmer);

    const noneShimmer = document.createElement('div');
    noneShimmer.style.cssText =
        'display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-bottom: 16px; opacity: 0.6;';
    noneShimmer.innerHTML = `
        <div class="shimmer" style="width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0;"></div>
        <div class="shimmer" style="width: 80px; height: 14px; border-radius: 4px;"></div>
    `;
    skeleton.appendChild(noneShimmer);

    for (let i = 0; i < 4; i++) {
        const header = document.createElement('div');
        header.className = 'shimmer';
        header.style.cssText =
            'width: 130px; height: 18px; margin: 20px 0 10px 0; border-radius: 4px;';
        skeleton.appendChild(header);

        const grid = document.createElement('div');
        grid.style.cssText =
            'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 10px;';

        for (let j = 0; j < 2; j++) {
            const card = document.createElement('div');
            card.style.cssText =
                'display: flex; flex-direction: column; padding: 12px; background: var(--rovalra-container-background-color); border-radius: 12px; gap: 12px; opacity: 0.8;';
            card.innerHTML = `
                <div style="display: flex; justify-content: center; gap: 15px;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <div class="shimmer" style="width: 100px; height: 100px; border-radius: 50%;"></div>
                        <div class="shimmer" style="width: 40px; height: 8px; border-radius: 2px;"></div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <div class="shimmer" style="width: 100px; height: 100px; border-radius: 50%;"></div>
                        <div class="shimmer" style="width: 40px; height: 8px; border-radius: 2px;"></div>
                    </div>
                </div>
                <div class="shimmer" style="width: 50%; height: 12px; align-self: center; border-radius: 4px;"></div>
                <div class="shimmer" style="width: 25%; height: 10px; align-self: center; border-radius: 4px;"></div>
                <div class="shimmer" style="width: 100px; height: 16px; align-self: center; border-radius: 20px; margin-top: 5px;"></div>
            `;
            grid.appendChild(card);
        }
        skeleton.appendChild(grid);
    }

    container.appendChild(skeleton);

    try {
        const borderCategories = await getBorders();
        const ownedData = await getOwnedBorders();
        if (!borderCategories || borderCategories.length === 0) {
            container.innerHTML =
                '<p style="color: var(--rovalra-secondary-text-color);">No borders available.</p>';
            return;
        }

        const userId = await getAuthenticatedUserId();
        const settings = await loadSettings();
        const currentBorderValue = settings.avatarBorderChoice || 'none';

        let authedUserData = null;
        if (userId) {
            const [displayRes, thumbnails] = await Promise.all([
                getUserDisplayName ? await getUserDisplayName(userId) : 'User',
                getBatchThumbnails([userId], 'AvatarHeadshot', '150x150'),
            ]);
            authedUserData = {
                displayName:
                    typeof displayRes === 'string'
                        ? displayRes
                        : displayRes || 'User',
                thumbData: thumbnails[0] || { state: 'Error' },
                userId,
            };
        }

        const allBordersFlat = flattenBorders(borderCategories);

        container.innerHTML = '';

        const previewWrapper = document.createElement('div');
        previewWrapper.style.cssText =
            'display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-bottom: 20px;';
        previewWrapper.innerHTML = `
            <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; color: var(--rovalra-secondary-text-color);">Current Selection Preview</div>
            <div class="setting-label-divider" style="width: 100%; margin-bottom: 10px;"></div>
            <div id="rovalra-store-preview-holder"></div>
        `;
        container.appendChild(previewWrapper);

        const previewHolder = previewWrapper.querySelector(
            '#rovalra-store-preview-holder',
        );
        if (authedUserData) {
            const card = createUserCard({
                displayName: authedUserData.displayName,
                username: '',
                thumbData: authedUserData.thumbData,
                href: `https://www.roblox.com/users/${authedUserData.userId}/profile`,
                presenceInfo: 1,
                hidePresence: true,
            });
            card.style.transform = 'scale(1.2)';
            card.style.margin = '25px 0';
            previewHolder.appendChild(card);

            if (currentBorderValue !== 'none') {
                const currentBorder = findBorderItem(
                    borderCategories,
                    currentBorderValue,
                );
                if (currentBorder && currentBorder.link) {
                    const avatarEl = card.querySelector(
                        '.avatar.avatar-card-fullbody',
                    );
                    if (avatarEl) {
                        applyBorderToContainer(avatarEl, currentBorder.link);
                    }
                }
            }
        } else {
            previewHolder.innerHTML =
                '<p style="color: var(--rovalra-secondary-text-color);">Sign in to preview borders on your avatar.</p>';
        }

        const noneCategory = borderCategories.find((b) => b.value === 'none');
        if (noneCategory) {
            const noneCard = document.createElement('div');
            noneCard.setAttribute('data-variant-value', 'none');
            noneCard.style.cssText =
                'display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--rovalra-container-background-color); border-radius: 12px; margin-bottom: 16px; cursor: pointer; border: 1.5px solid transparent;';
            noneCard.setAttribute('data-border-card', '');
            noneCard.onclick = async () => {
                await handleSaveSettings('avatarBorderChoice', 'none');
                updateUserSettingViaApi(
                    'border',
                    noneCategory.link || '',
                ).catch(() => {});
                updatePreviewAndUI('none', null, container, previewHolder);
            };

            const noneImg = document.createElement('div');
            noneImg.style.cssText =
                'width: 48px; height: 48px; border-radius: 50%; background: var(--rovalra-main-background-color); display: flex; align-items: center; justify-content: center; flex-shrink: 0;';
            noneImg.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--rovalra-secondary-text-color)">
                    <path d="M19 13H5v-2h14v2z"/>
                </svg>
            `;

            const noneLabelCol = document.createElement('div');
            noneLabelCol.className = 'rovalra-none-label-container';
            noneLabelCol.style.cssText =
                'display: flex; flex-direction: column;';

            const noneLabel = document.createElement('div');
            noneLabel.style.cssText =
                'color: var(--rovalra-main-text-color); font-weight: 600; font-size: 15px;';
            noneLabel.textContent = 'None';
            noneLabelCol.appendChild(noneLabel);

            if (currentBorderValue === 'none') {
                const eq = document.createElement('div');
                eq.className = 'rovalra-equipped-label';
                eq.style.cssText =
                    'font-size: 11px; color: var(--rovalra-main-text-color); font-weight: 600; margin-top: 2px; opacity: 0.9; display: flex; flex-direction: column; align-items: center; width: max-content;';
                eq.textContent = 'EQUIPPED';
                const underline = document.createElement('div');
                underline.style.cssText =
                    'width: calc(100% + 6px); height: 3px; background-color: var(--rovalra-playbutton-color); border-radius: 2px; margin-top: 1px;';
                eq.appendChild(underline);
                noneLabelCol.appendChild(eq);
            }

            noneCard.append(noneImg, noneLabelCol);
            container.appendChild(noneCard);
        }

        for (const category of borderCategories) {
            if (category.value === 'none' || !category.variants) continue;

            const categoryHeader = document.createElement('h3');
            categoryHeader.style.cssText =
                'color: var(--rovalra-main-text-color); font-size: 16px; margin: 20px 0 10px 0; padding-bottom: 8px; border-bottom: 1px solid var(--rovalra-border-color);';
            categoryHeader.textContent = category.label;
            container.appendChild(categoryHeader);

            const variantsGrid = document.createElement('div');
            variantsGrid.style.cssText =
                'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 10px; align-items: flex-start;';
            container.appendChild(variantsGrid);

            for (const variant of category.variants) {
                const hasAnimated =
                    variant.animated && variant.animated.length > 0;
                const isStaticSelected = currentBorderValue === variant.value;
                const isAnimatedSelected =
                    hasAnimated &&
                    variant.animated.some(
                        (a) => a.value === currentBorderValue,
                    );

                const variantCard = document.createElement('div');
                variantCard.setAttribute('data-border-card', '');
                variantCard.style.cssText = `display: flex; flex-direction: column; padding: 12px; background: var(--rovalra-container-background-color); border-radius: 12px; border: 2px solid transparent;`;

                const previewRow = document.createElement('div');
                previewRow.style.cssText =
                    'display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 8px;';

                const staticContainer = document.createElement('div');
                staticContainer.setAttribute(
                    'data-variant-value',
                    variant.value,
                );
                staticContainer.style.cssText =
                    'display: flex; flex-direction: column; align-items: center; cursor: pointer; flex: 1; border: 1.5px solid transparent; border-radius: 10px; padding: 6px;';

                const staticCard = createUserCard({
                    displayName: authedUserData?.displayName || 'User',
                    username: '',
                    thumbData: authedUserData?.thumbData || { state: 'Error' },
                    href: '',
                    presenceInfo: 1,
                    hidePresence: true,
                });
                staticCard.style.pointerEvents = 'none';
                staticCard.style.transform = 'scale(1.1)';
                staticCard.style.margin = '5px 0';
                staticCard
                    .querySelector(
                        '.user-card-labels, .user-card-labels-no-username',
                    )
                    ?.remove();

                const staticAvatarEl = staticCard.querySelector(
                    '.avatar.avatar-card-fullbody',
                );
                if (staticAvatarEl)
                    applyBorderToContainer(staticAvatarEl, variant.link);

                const staticLabel = document.createElement('div');
                staticLabel.style.cssText =
                    'font-size: 11px; color: var(--rovalra-secondary-text-color); text-align: center; white-space: nowrap; margin-top: 5px; font-weight: 700;';
                staticLabel.textContent = 'STATIC';
                staticContainer.onclick = async () => {
                    openBorderOverlay(
                        variant,
                        hasAnimated ? variant.animated[0] : null,
                        authedUserData,
                        container,
                        previewHolder,
                        variant.artistId,
                        variant.gamepassId,
                    );
                };
                staticContainer.append(staticCard, staticLabel);
                if (isStaticSelected) {
                    const eq = document.createElement('div');
                    eq.className = 'rovalra-equipped-label';
                    eq.style.cssText =
                        'font-size: 11px; color: var(--rovalra-main-text-color); font-weight: 600; margin-top: 2px; opacity: 0.9; display: flex; flex-direction: column; align-items: center; width: max-content;';
                    eq.textContent = 'EQUIPPED';
                    const underline = document.createElement('div');
                    underline.style.cssText =
                        'width: calc(100% + 6px); height: 3px; background-color: var(--rovalra-playbutton-color); border-radius: 2px; margin-top: 1px;';
                    eq.appendChild(underline);
                    staticContainer.appendChild(eq);
                }

                previewRow.appendChild(staticContainer);

                if (hasAnimated) {
                    const animVariant = variant.animated[0];
                    const animContainer = document.createElement('div');
                    animContainer.setAttribute(
                        'data-variant-value',
                        animVariant.value,
                    );

                    animContainer.style.cssText =
                        'display: flex; flex-direction: column; align-items: center; cursor: pointer; flex: 1; border: 1.5px solid transparent; border-radius: 10px; padding: 6px;';

                    const animCard = createUserCard({
                        displayName: authedUserData?.displayName || 'User',
                        username: '',
                        thumbData: authedUserData?.thumbData || {
                            state: 'Error',
                        },
                        href: '',
                        presenceInfo: 1,
                        hidePresence: true,
                    });
                    animCard.style.pointerEvents = 'none';
                    animCard.style.transform = 'scale(1.1)';
                    animCard.style.margin = '5px 0';
                    animCard
                        .querySelector(
                            '.user-card-labels, .user-card-labels-no-username',
                        )
                        ?.remove();

                    const animAvatarEl = animCard.querySelector(
                        '.avatar.avatar-card-fullbody',
                    );
                    if (animAvatarEl)
                        applyBorderToContainer(animAvatarEl, animVariant.link);

                    const animLabel = document.createElement('div');
                    animLabel.style.cssText =
                        'font-size: 11px; color: var(--rovalra-secondary-text-color); text-align: center; white-space: nowrap; margin-top: 5px; font-weight: 700;';
                    animLabel.textContent = 'ANIMATED';
                    animContainer.onclick = async () => {
                        openBorderOverlay(
                            animVariant,
                            variant,
                            authedUserData,
                            container,
                            previewHolder,
                            variant.artistId,
                            variant.gamepassId,
                        );
                    };
                    animContainer.append(animCard, animLabel);
                    if (isAnimatedSelected) {
                        const eq = document.createElement('div');
                        eq.className = 'rovalra-equipped-label';
                        eq.style.cssText =
                            'font-size: 11px; color: var(--rovalra-main-text-color); font-weight: 600; margin-top: 2px; opacity: 0.9; display: flex; flex-direction: column; align-items: center; width: max-content;';
                        eq.textContent = 'EQUIPPED';
                        const underline = document.createElement('div');
                        underline.style.cssText =
                            'width: calc(100% + 6px); height: 3px; background-color: var(--rovalra-playbutton-color); border-radius: 2px; margin-top: 1px;';
                        eq.appendChild(underline);
                        animContainer.appendChild(eq);
                    }
                    previewRow.appendChild(animContainer);
                }

                const variantLabel = document.createElement('div');
                variantLabel.style.cssText =
                    'color: var(--rovalra-main-text-color); font-weight: 600; font-size: 13px; text-align: center; margin-bottom: 4px;';
                variantLabel.textContent = variant.label;

                const priceLabel = document.createElement('div');
                if (variant.gamepassId) {
                    priceLabel.style.cssText =
                        'font-size: 12px; font-weight: 600; color: var(--rovalra-secondary-text-color); display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 4px;';
                    const tier = getCurrentUserTier();
                    const isOwned =
                        tier >= 3 ||
                        ownedData.borders.has(variant.value) ||
                        ownedData.gamepasses.has(String(variant.gamepassId));

                    getGamePassPrice(variant.gamepassId).then((price) => {
                        if (price !== null && price !== undefined) {
                            const priceValue = price.toLocaleString();
                            if (isOwned) {
                                priceLabel.innerHTML = `
                                    <span style="text-decoration: line-through; opacity: 0.6; display: flex; align-items: center; gap: 2px;">
                                        <span class="icon-robux-16x16"></span>${priceValue}
                                    </span>
                                    <span class="rovalra-free-label" style="color: var(--rovalra-main-text-color); margin-left: 4px; cursor: help; font-size: 14px;">${tier >= 3 ? 'Free' : 'Owned'}</span>
                                `; //Verified
                                const freeLabel = priceLabel.querySelector(
                                    '.rovalra-free-label',
                                );
                                if (freeLabel) {
                                    addTooltip(
                                        freeLabel,
                                        tier >= 3
                                            ? 'Free because you have Donator Tier 3!'
                                            : 'You own this border!',
                                        {
                                            position: 'top',
                                        },
                                    );
                                }
                            } else {
                                priceLabel.innerHTML = `<span class="icon-robux-16x16"></span>${priceValue}`; // Verified
                            }
                        }
                    });
                }

                if (variant.artistId) {
                    variantCard.appendChild(
                        createArtistCreditSection(variant.artistId),
                    );
                }

                variantCard.append(previewRow, variantLabel, priceLabel);
                variantsGrid.appendChild(variantCard);
            }
        }
    } catch (error) {
        console.error('RoValra: Failed to render store borders', error);
        container.innerHTML =
            '<p style="color: var(--rovalra-secondary-text-color);">Failed to load borders. Please try again later.</p>';
    }
}

function updatePreviewAndUI(selectedValue, link, container, previewHolder) {
    const avatarEl = previewHolder.querySelector(
        '.avatar.avatar-card-fullbody',
    );
    if (avatarEl) {
        const existingBorder = avatarEl.querySelector('.rovalra-avatar-border');
        if (existingBorder) existingBorder.remove();
        const clip = avatarEl.querySelector('.rovalra-avatar-border-clip');
        if (clip) {
            while (clip.firstChild) avatarEl.appendChild(clip.firstChild);
            clip.remove();
        }
        delete avatarEl.dataset.rovalraBorderLoading;
        if (link) {
            applyBorderToContainer(avatarEl, link);
        }
    }
    container.querySelectorAll('[data-border-card]').forEach((c) => {
        c.style.borderColor = 'transparent';
    });
    container
        .querySelectorAll('.rovalra-equipped-label')
        .forEach((el) => el.remove());

    const selectedSubContainer = container.querySelector(
        `[data-variant-value="${selectedValue}"]`,
    );

    if (selectedSubContainer) {
        const eq = document.createElement('div');
        eq.className = 'rovalra-equipped-label';
        eq.style.cssText =
            'font-size: 11px; color: var(--rovalra-main-text-color); font-weight: 600; margin-top: 2px; opacity: 0.9; display: flex; flex-direction: column; align-items: center; width: max-content;';
        eq.textContent = 'EQUIPPED';
        const underline = document.createElement('div');
        underline.style.cssText =
            'width: calc(100% + 6px); height: 3px; background-color: var(--rovalra-playbutton-color); border-radius: 2px; margin-top: 1px;';
        eq.appendChild(underline);

        if (selectedValue === 'none') {
            const labelCol = selectedSubContainer.querySelector(
                '.rovalra-none-label-container',
            );
            if (labelCol) labelCol.appendChild(eq);
            else selectedSubContainer.appendChild(eq);
        } else {
            selectedSubContainer.appendChild(eq);
        }
    }
}

function handleGlobalDomChange(event) {
    if (document.getElementById('settings-popover-menu')) {
        addPopoverButton();
    } else if (window.rovalraPopoverButtonAdded) {
        window.rovalraPopoverButtonAdded = false;
    }

    debouncedAddCustomButton();
    debouncedAddPopoverButton();

    const mutationsList = event.detail?.mutationsList;
    if (!mutationsList) return;

    const shouldUpdateTheme = mutationsList.some(
        (mutation) =>
            mutation.type === 'childList' &&
            mutation.addedNodes.length > 0 &&
            Array.from(mutation.addedNodes).some(
                (node) =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches(
                        '[data-theme-dependent], .setting, .menu-option, #content-container',
                    ) ||
                        node.querySelector(
                            '[data-theme-dependent], .setting, .menu-option, #content-container',
                        )),
            ),
    );

    if (shouldUpdateTheme) {
        debouncedApplyTheme();
    }
}

export async function updateContent(buttonInfo, contentContainer) {
    if (
        typeof buttonInfo !== 'object' ||
        buttonInfo === null ||
        !buttonInfo.content
    )
        return;

    const buttonId = buttonInfo.id;
    const sanitizeConfig = { ADD_URI_SCHEMES: ['chrome-extension'] };

    if (
        buttonId === 'info' ||
        buttonId === 'credits' ||
        buttonId === 'accountStanding' ||
        buttonId === 'donatorPerks' ||
        buttonId === 'store'
    ) {
        ((contentContainer.innerHTML = `
            <div id="settings-content" style="padding: 0; background-color: transparent !important;"> 
                <div id="setting-section-content" style="padding: 5px;"> 
                    <div id="info-credits-background-wrapper" class="setting" style="margin-bottom: 15px;">
                        ${buttonInfo.content}
                    </div> 
                </div> 
                </div>`), //verified
            sanitizeConfig);
    } else {
        contentContainer.innerHTML = safeHtml(
            buttonInfo.content,
            sanitizeConfig,
        ); //verified
    }

    if (buttonId === 'info') {
        const buttonContainer = contentContainer.querySelector(
            '#export-import-buttons-container',
        );
        if (buttonContainer) {
            buttonContainer.appendChild(createExportImportButtons());
        }
    }

    if (buttonId === 'credits') {
        loadContributors();
    }

    if (buttonId === 'accountStanding') {
        const container = contentContainer.querySelector(
            '#rovalra-account-standing-container',
        );
        if (container) {
            renderAccountStanding(container);
        }
    }

    if (buttonId === 'donatorPerks') {
        await syncDonatorTier();
        const userTier = getCurrentUserTier();
        if (userTier > 0) {
            const userId = await getAuthenticatedUserId();
            if (userId) {
                const thumbs = await getBatchThumbnails(
                    [userId],
                    'AvatarHeadshot',
                    '60x60',
                );
                const userThumb = thumbs[0]?.imageUrl;
                if (userThumb) {
                    const tierContainer = contentContainer.querySelector(
                        `#donator-tier-${userTier}-header`,
                    );
                    if (tierContainer) {
                        const img = document.createElement('img');
                        img.src = userThumb;
                        img.style.cssText =
                            'width: 32px; height: 32px; border-radius: 50%; border: 2px solid rgb(2, 170, 81); margin-left: auto;';
                        tierContainer.appendChild(img);
                    }
                }
            }
        }

        loadTopDonators();
    }

    if (buttonId === 'store') {
        const borderContainer = contentContainer.querySelector(
            '#rovalra-store-border-container',
        );
        if (borderContainer) {
            renderStoreBorders(borderContainer);
        }
    }

    const rovalraHeader = document.querySelector(
        '#react-user-account-base > h1',
    );
    if (rovalraHeader) {
        rovalraHeader.style.setProperty(
            'color',
            'var(--rovalra-main-text-color)',
            'important',
        );
    }
}

export async function handleSearch(event) {
    const query =
        event.target && event.target.value
            ? event.target.value.toLowerCase().trim()
            : '';

    const contentContainer = document.querySelector('#content-container');
    if (!contentContainer) return;

    const url = new URL(window.location.href);
    if (query) {
        url.searchParams.set('q', query);
    } else {
        url.searchParams.delete('q');
    }

    if (url.searchParams.get('rovalra') === 'search') {
        window.history.replaceState(
            null,
            '',
            url.pathname + url.search + window.location.hash,
        );
    }

    document
        .querySelectorAll('#unified-menu .menu-option-content')
        .forEach((el) => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });

    if (query.length < 2) {
        contentContainer.innerHTML = DOMPurify.sanitize(
            `<div id="settings-content" style="padding: 15px; text-align: center; color: var(--rovalra-main-text-color);">${ts('settings.search.minLength')}</div>`,
        );
        await applyTheme();
        return;
    }

    const searchResults = [];
    const queryNoSpaces = query.replace(/\s+/g, '');

    for (const categoryName in SETTINGS_CONFIG) {
        const category = SETTINGS_CONFIG[categoryName];
        for (const [settingName, settingDef] of Object.entries(
            category.settings,
        )) {
            const label = (
                Array.isArray(settingDef.label)
                    ? settingDef.label.join(' ')
                    : settingDef.label || ''
            ).toLowerCase();
            const description = (
                Array.isArray(settingDef.description)
                    ? settingDef.description.join(' ')
                    : settingDef.description || ''
            ).toLowerCase();
            const fullText = `${label} ${description}`;

            let isMatch =
                fullText.includes(query) ||
                fullText.replace(/\s+/g, '').includes(queryNoSpaces) ||
                settingName.toLowerCase() === query;

            if (!isMatch) {
                const words = fullText.split(/\s+/);
                const threshold = query.length > 5 ? 2 : 1;
                isMatch = words.some(
                    (word) => getLevenshteinDistance(query, word) <= threshold,
                );
            }

            if (!isMatch && settingDef.childSettings) {
                for (const [childName, childDef] of Object.entries(
                    settingDef.childSettings,
                )) {
                    const childLabel = (
                        Array.isArray(childDef.label)
                            ? childDef.label.join(' ')
                            : childDef.label || ''
                    ).toLowerCase();
                    const childDesc = (
                        Array.isArray(childDef.description)
                            ? childDef.description.join(' ')
                            : childDef.description || ''
                    ).toLowerCase();
                    if (
                        `${childLabel} ${childDesc}`.includes(query) ||
                        childName.toLowerCase() === query
                    ) {
                        isMatch = true;
                        break;
                    }
                }
            }

            if (
                isMatch &&
                !searchResults.some((res) => res.name === settingName)
            ) {
                searchResults.push({
                    category: category.title,
                    name: settingName,
                    config: settingDef,
                });
            }
        }
    }

    if (searchResults.length === 0) {
        contentContainer.innerHTML = safeHtml`<div id="settings-content" style="padding: 15px; text-align: center; color: var(--rovalra-main-text-color);">${ts('settings.search.noResults', { query })}</div>`;
    } else {
        const groupedResults = searchResults.reduce((acc, setting) => {
            if (!acc[setting.category]) acc[setting.category] = [];
            acc[setting.category].push(setting);
            return acc;
        }, {});

        contentContainer.innerHTML = '';

        const resultsWrapper = document.createElement('div');
        resultsWrapper.id = 'setting-section-content';
        resultsWrapper.style.padding = '5px';

        for (const categoryTitle in groupedResults) {
            const header = document.createElement('h2');
            header.className = 'settings-category-header';
            header.style.cssText =
                'margin-left: 5px; margin-bottom: 10px; color: var(--rovalra-main-text-color);'; // Verified
            header.textContent = categoryTitle;
            resultsWrapper.appendChild(header);

            for (const setting of groupedResults[categoryTitle]) {
                const settingElement = generateSingleSettingHTML(
                    setting.name,
                    setting.config,
                    REGIONS,
                );

                if (settingElement instanceof Node) {
                    resultsWrapper.appendChild(settingElement);
                } else {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = safeHtml(settingElement); // Verified
                    while (tempDiv.firstChild) {
                        resultsWrapper.appendChild(tempDiv.firstChild);
                    }
                }
            }
        }

        contentContainer.appendChild(resultsWrapper);
    }

    await initSettings(contentContainer);
    await applyTheme();
}

document.addEventListener('click', (event) => {
    const target = event.target;

    const perkLink = target.closest('.rovalra-perk-link');
    if (perkLink) {
        event.preventDefault();
        const settingName = perkLink.dataset.setting;
        const url = new URL(window.location.href);
        url.searchParams.set('rovalra', 'search');
        url.searchParams.set('q', settingName);
        window.location.href = url.pathname + url.search + '#!/search';
        return;
    }

    if (target.id === 'export-rovalra-settings') return exportSettings();
    if (target.id === 'import-rovalra-settings') return importSettings();
    if (target.matches('.tab-button, .setting-section-button')) return;

    if (target.matches('input[type="checkbox"]')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            handleSaveSettings(settingName, target.checked).then(() => {
                const settingsContent = document.querySelector(
                    '#setting-section-content',
                );
                if (settingsContent) {
                    loadSettings().then((currentSettings) =>
                        updateConditionalSettingsVisibility(
                            settingsContent,
                            currentSettings,
                        ),
                    );
                }
            });
        }
    } else if (target.matches('select')) {
        const settingName = target.dataset.settingName;
        if (settingName) {
            handleSaveSettings(settingName, target.value).then(() => {
                const settingsContent = document.querySelector(
                    '#setting-section-content',
                );
                if (settingsContent) {
                    loadSettings().then((currentSettings) =>
                        updateConditionalSettingsVisibility(
                            settingsContent,
                            currentSettings,
                        ),
                    );
                }
            });
        }
    }
});

function onPopoverRemoved() {
    window.rovalraPopoverButtonAdded = false;
}

async function initializeExtension() {
    try {
        const data = await getRegionData();
        REGIONS = data.regions;
    } catch (e) {
        console.warn('Failed to load region data:', e);
    }

    await applyTheme();

    if (window.location.href.includes('rovalra=')) {
        injectStylesheet(
            'css/settings_layout.css',
            'rovalra-settings-layout-css',
        );
    }

    await buildSettingsKey();

    addCustomButton(debouncedAddPopoverButton);
    addPopoverButton();

    initializeSettingsEventListeners();

    document.addEventListener('roblox-dom-changed', handleGlobalDomChange);

    observeElement('#settings-popover-menu', addPopoverButton, {
        onRemove: onPopoverRemoved,
    });
    observeElement('ul.menu-vertical[role="tablist"]', () =>
        addCustomButton(debouncedAddPopoverButton),
    );

    await checkRoValraPage();
}

export function init() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExtension);
    } else {
        initializeExtension();
    }
}

window.addEventListener('beforeunload', () => {
    document.removeEventListener('roblox-dom-changed', handleGlobalDomChange);
});

function initializeHeartbeatSpoofer() {
    const originalFetch = window.fetch;
    let pulseInterval = null;
    let spoofingMode = 'off';

    const sendSpoofedHeartbeat = async () => {
        let locationInfoPayload;

        if (spoofingMode === 'studio') {
            locationInfoPayload = { studioLocationInfo: { placeId: 0 } };
        } else {
            return;
        }

        const spoofedPulseRequest = {
            clientSideTimestampEpochMs: Date.now(),
            locationInfo: locationInfoPayload,
            sessionInfo: { sessionId: crypto.randomUUID() },
        };

        try {
            await callRobloxApi({
                subdomain: 'apis',
                endpoint: '/user-heartbeats-api/pulse',
                method: 'POST',
                body: spoofedPulseRequest,
                headers: { 'RoValra-Internal': 'true' },
                useBackground: true,
            });
            console.log(
                `RoValra: Spoofed heartbeat sent. Mode: ${spoofingMode}`,
            );
        } catch (error) {
            console.error('RoValra: Failed to send spoofed heartbeat.', error);
        }
    };

    const startSpoofingTimer = () => {
        if (pulseInterval) return;
        console.log(`RoValra: Starting spoofer timer (${spoofingMode}).`);
        pulseInterval = setInterval(async () => {
            if (spoofingMode === 'studio') {
                sendSpoofedHeartbeat();
            }
        }, 30000);
    };

    const stopSpoofingTimer = () => {
        if (pulseInterval) {
            console.log('RoValra: Stopping spoofer timer.');
            clearInterval(pulseInterval);
            pulseInterval = null;
        }
    };

    const updateSpoofingMode = (settings) => {
        chrome.runtime.sendMessage({
            action: 'updateOfflineRule',
            enabled: settings.spoofAsOffline,
        });
        chrome.runtime.sendMessage({
            action: 'updateEarlyAccessRule',
            enabled: settings.EarlyAccessProgram,
        });

        if (settings.spoofAsOffline) spoofingMode = 'offline';
        else if (settings.spoofAsStudio) spoofingMode = 'studio';
        else spoofingMode = 'off';

        if (spoofingMode === 'studio') startSpoofingTimer();
        else stopSpoofingTimer();
    };

    const relevantSettings = [
        'spoofAsStudio',
        'spoofAsOffline',
        'EarlyAccessProgram',
    ];
    chrome.storage.local.get(relevantSettings, updateSpoofingMode);

    chrome.storage.onChanged.addListener((changes) => {
        if (relevantSettings.some((setting) => changes[setting])) {
            chrome.storage.local.get(relevantSettings, (result) => {
                if (changes.LaunchDelay) {
                    const toggle = document.querySelector(
                        '#LaunchDelay-enabled',
                    );
                    if (toggle) {
                        toggle.checked = changes.LaunchDelay.newValue > 0;
                        updateConditionalSettingsVisibility(
                            document.body,
                            result,
                        );
                    }
                }
                updateSpoofingMode(result);
            });
        }
    });

    window.fetch = async function (...args) {
        const url = args[0] ? args[0].toString() : '';
        let isInternal = false;

        if (args.length > 1 && args[1] && args[1].headers) {
            const originalOptions = args[1];
            const newOptions = { ...originalOptions };

            let hasHeader = false;

            if (newOptions.headers instanceof Headers) {
                if (newOptions.headers.get('RoValra-Internal') === 'true') {
                    hasHeader = true;
                    newOptions.headers = new Headers(newOptions.headers);
                    newOptions.headers.delete('RoValra-Internal');
                }
            } else if (
                typeof newOptions.headers === 'object' &&
                !Array.isArray(newOptions.headers)
            ) {
                if (newOptions.headers['RoValra-Internal'] === 'true') {
                    hasHeader = true;
                    newOptions.headers = { ...newOptions.headers };
                    delete newOptions.headers['RoValra-Internal'];
                }
            }

            if (hasHeader) {
                isInternal = true;
                args[1] = newOptions;
            }
        }

        if (
            url.includes('apis.roblox.com/user-heartbeats-api/pulse') &&
            spoofingMode !== 'off' &&
            !isInternal
        ) {
            return new Response(null, { status: 200, statusText: 'OK' });
        }

        return originalFetch.apply(this, args);
    };

    console.log('RoValra: Proactive heartbeat spoofer initialized.');
}

initializeHeartbeatSpoofer();
loadDatacenterMap();
