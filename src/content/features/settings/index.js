import { getAssets } from '../../core/assets.js';
import {
    getRegionData,
    loadDatacenterMap,
    getFullRegionName,
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
import { getAuthenticatedUserId } from '../../core/user.js';
import { parseMarkdown } from '../../core/utils/markdown.js';
import { getCurrentTheme, THEME_CONFIG } from '../../core/theme.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { injectStylesheet } from '../../core/ui/cssInjector.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { updateUserSettingViaApi } from '../../core/profile/descriptionhandler.js';
import { getUserSettings } from '../../core/donators/settingHandler.js';

const assets = getAssets();
let REGIONS = {};

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

            const link = document.createElement('a');
            link.href = `https://www.roblox.com/users/${id}/profile`;
            link.target = '_blank';
            link.style.cssText = `display: flex; align-items: center; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 8px 12px; border-radius: 8px; text-decoration: none; color: var(--rovalra-main-text-color); transition: background-color 0.2s;`;

            const thumbElement = createThumbnailElement(
                thumbData,
                user.displayName,
                '',
                {
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    marginRight: '10px',
                },
            );

            const span = document.createElement('span');
            span.textContent = user.displayName;
            span.style.fontWeight = '500';

            link.appendChild(thumbElement);
            link.appendChild(span);
            listContainer.appendChild(link);
        }
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
        container.innerHTML = `<p style="color: var(--rovalra-secondary-text-color);">${ts('settings.credits.failedToLoadContributors')}</p>`;
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

    anonBtn.innerHTML = `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1phnduy" focusable="false" aria-hidden="true" viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="${isAnonymous ? path2 : path1}"></path></svg>`;

    addTooltip(
        anonBtn,
        isAnonymous ? 'Disable anonymous mode' : 'Enable anonymous mode',
    );

    anonBtn.onclick = onToggle;
    return anonBtn;
}

function renderTopDonators(container, donators, thumbMap, currentUserId) {
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
            column.style.cssText =
                'display: flex; flex-direction: column; align-items: center; width: 110px;';

            const thumbData = thumbMap.get(String(data.user_id));
            const thumbElement = createThumbnailElement(
                thumbData,
                data.username,
                '',
                {
                    width: data.size,
                    height: data.size,
                    borderRadius: '50%',
                    border: `3px solid ${data.color}`,
                    marginBottom: '10px',
                    backgroundColor:
                        'var(--rovalra-container-background-color)',
                },
            );

            const isAnonymous = String(data.user_id) === '1';

            const thumbLink = document.createElement(isAnonymous ? 'div' : 'a');
            if (!isAnonymous) {
                thumbLink.href = `https://www.roblox.com/users/${data.user_id}/profile`;
                thumbLink.target = '_blank';
            }
            thumbLink.style.display = 'block';
            if (isAnonymous) thumbLink.style.cursor = 'default';
            thumbLink.appendChild(thumbElement);

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
            amount.innerHTML = `<span class="icon-robux-16x16"></span>${data.amount.toLocaleString()}`;
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
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    marginRight: '15px',
                },
            );

            const isAnonymous = String(donor.user_id) === '1';

            const thumbLink = document.createElement(isAnonymous ? 'div' : 'a');
            if (!isAnonymous) {
                thumbLink.href = `https://www.roblox.com/users/${donor.user_id}/profile`;
                thumbLink.target = '_blank';
            }
            thumbLink.style.display = 'flex';
            if (isAnonymous) thumbLink.style.cursor = 'default';
            thumbLink.appendChild(thumb);

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
            amount.innerHTML = `<span class="icon-robux-16x16" style="margin-right: 2px;"></span>${donor.amount.toLocaleString()}`;
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

async function loadTopDonators() {
    const container = document.getElementById('rovalra-top-donators');
    const toggleContainer = document.getElementById(
        'rovalra-anon-toggle-container',
    );
    if (!container) return;

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

        if (authenticatedUserId && userTier >= 1 && toggleContainer) {
            try {
                const settings = await getUserSettings(authenticatedUserId, {
                    noCache: true,
                });
                const isAnonymous = settings.anonymous_leaderboard === true;

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
                    const thumbData = thumbs[0];

                    toggleContainer.innerHTML = '';
                    toggleContainer.style.cssText =
                        'display: flex; align-items: center; gap: 8px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--rovalra-border-color);';

                    const thumb = createThumbnailElement(
                        thumbData,
                        userData.name,
                        '',
                        {
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                        },
                    );

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent =
                        userData.displayName || userData.name;
                    nameSpan.style.cssText =
                        'color: var(--rovalra-main-text-color); font-size: 12px; font-weight: 600;';

                    const toggle = createAnonymousToggle(
                        isAnonymous,
                        async (e) => {
                            e.preventDefault();
                            const success = await updateUserSettingViaApi(
                                'anonymous_leaderboard',
                                !isAnonymous,
                            );
                            if (success) {
                                loadTopDonators();
                            }
                        },
                    );

                    toggleContainer.append(thumb, nameSpan, toggle);
                }
            } catch (error) {
                console.error(
                    'RoValra: Error rendering anon toggle area',
                    error,
                );
            }
        }

        renderTopDonators(container, donators, thumbMap, authenticatedUserId);
    } catch (err) {
        console.error('RoValra: Error loading top donators', err);
        container.innerHTML = '';
    }
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
                <div id="rovalra-contributors-list">
                    <div style="color: var(--rovalra-secondary-text-color);">${ts('settings.credits.loadingContributors')}</div>
                </div>
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
                    <div id="rovalra-top-donators">
                        <div style="color: var(--rovalra-secondary-text-color);">${ts('settings.credits.loadingContributors')}</div>
                    </div>
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
        buttonId === 'donatorPerks'
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
