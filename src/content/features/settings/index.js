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
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';

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
            return `
            <div style="padding: 8px;">
                <h2 style="margin-bottom: 10px; color: var(--rovalra-main-text-color) !important;">${ts('settings.donatorPerks.title')}</h2>
                <p>${ts('settings.donatorPerks.subtitle')}</p>
                
                <div style="margin-top: 15px;">
                    <h3 style="color: var(--rovalra-main-text-color); margin-bottom: 5px; font-size: 18px;">${ts('settings.donatorPerks.howToGet')}</h3>
                    <p>${ts('settings.donatorPerks.howToGetDesc')}</p>
                    <div style="margin-top: 10px;">
                        <a href="https://www.roblox.com/games/store-section/9452973012" target="_blank" class="rovalra-roblox-link">${ts('settings.donatorPerks.goToGame')}</a>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                    <h3 style="color: var(--rovalra-main-text-color); margin-bottom: 10px; font-size: 18px;">${ts('settings.donatorPerks.perkTiers')}</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px; margin-bottom: 10px; padding: 10px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2));">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <img src="${BADGE_CONFIG.donator_1.icon}" style="width: 32px; height: 32px; ${getBadgeStyle('donator_1')}" />
                                <h4 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 16px;">${ts('settings.donatorPerks.tier1')}</h4>
                            </div>
                            <p style="color: var(--rovalra-secondary-text-color); font-size: 14px;">${ts('settings.donatorPerks.tier1Desc')}</p>
                            <ul style="margin-top: 5px; padding-left: 20px; color: var(--rovalra-secondary-text-color); margin-bottom: 0;">
                                <li>${ts('settings.donatorPerks.tier1Reward')}</li>
                                <li>${ts('settings.donatorPerks.moreComingSoon')}</li>
                            </ul>
                        </div>

                        <div style="flex: 1; min-width: 200px; margin-bottom: 10px; padding: 10px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2));">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <img src="${BADGE_CONFIG.donator_2.icon}" style="width: 32px; height: 32px; ${getBadgeStyle('donator_2')}" />
                                <h4 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 16px;">${ts('settings.donatorPerks.tier2')}</h4>
                            </div>
                            <p style="color: var(--rovalra-secondary-text-color); font-size: 14px;">${ts('settings.donatorPerks.tier2Desc')}</p>
                            <ul style="margin-top: 5px; padding-left: 20px; color: var(--rovalra-secondary-text-color); margin-bottom: 0;">
                                <li>${ts('settings.donatorPerks.tier2Reward')}</li>
                                <li>${ts('settings.donatorPerks.previousRewards')}</li>
                                <li>${ts('settings.donatorPerks.moreComingSoon')}</li>
                            </ul>
                        </div>

                        <div style="flex: 1; min-width: 200px; margin-bottom: 10px; padding: 10px; background-color: var(--rovalra-container-background-color, rgba(0,0,0,0.1)); border-radius: 8px; border: 1px solid var(--rovalra-border-color, rgba(128,128,128,0.2));">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                <img src="${BADGE_CONFIG.donator_3.icon}" style="width: 32px; height: 32px; ${getBadgeStyle('donator_3')}" />
                                <h4 style="color: var(--rovalra-main-text-color); margin: 0; font-size: 16px;">${ts('settings.donatorPerks.tier3')}</h4>
                            </div>
                            <p style="color: var(--rovalra-secondary-text-color); font-size: 14px;">${ts('settings.donatorPerks.tier3Desc')}</p>
                            <ul style="margin-top: 5px; padding-left: 20px; color: var(--rovalra-secondary-text-color); margin-bottom: 0;">
                                <li>${ts('settings.donatorPerks.tier3Reward')}</li>
                                <li>${ts('settings.donatorPerks.previousRewards')}</li>
                                <li>${ts('settings.donatorPerks.moreComingSoon')}</li>

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
                
                <p style="margin-top: 15px; font-size: 12px; color: var(--rovalra-secondary-text-color);">
                    ${ts('settings.donatorPerks.note')}
                </p>
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
                fullText.replace(/\s+/g, '').includes(queryNoSpaces);

            if (!isMatch) {
                const words = fullText.split(/\s+/);
                const threshold = query.length > 5 ? 2 : 1;
                isMatch = words.some(
                    (word) => getLevenshteinDistance(query, word) <= threshold,
                );
            }

            if (!isMatch && settingDef.childSettings) {
                for (const childDef of Object.values(
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
                    if (`${childLabel} ${childDesc}`.includes(query)) {
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

document.addEventListener('DOMContentLoaded', function () {
    const PreferredRegionEnabled = document.getElementById(
        'PreferredRegionEnabled',
    );
    const preferredRegionSelect = document.getElementById(
        'preferredRegionSelect',
    );
    const regionSettingDiv = document.getElementById(
        'setting-preferred-region',
    );

    function updateRegionSelectVisibility() {
        if (PreferredRegionEnabled && regionSettingDiv) {
            const isEnabled = PreferredRegionEnabled.checked;
            regionSettingDiv.style.display = isEnabled ? 'flex' : 'none';
            if (preferredRegionSelect)
                preferredRegionSelect.disabled = !isEnabled;
        }
    }

    if (PreferredRegionEnabled) {
        PreferredRegionEnabled.addEventListener('change', function () {
            updateRegionSelectVisibility();
            handleSaveSettings('PreferredRegionEnabled', this.checked);
        });
    }

    if (preferredRegionSelect) {
        preferredRegionSelect.addEventListener('change', function () {
            handleSaveSettings('robloxPreferredRegion', this.value);
        });

        if (preferredRegionSelect.options.length === 0) {
            Object.keys(REGIONS).forEach((regionCode) => {
                const option = document.createElement('option');
                option.value = regionCode;
                option.textContent = getFullRegionName(regionCode);
                preferredRegionSelect.appendChild(option);
            });
        }
    }
    updateRegionSelectVisibility();
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

function manageSingletonExecution() {
    const KEYS = {
        ID: 'rovalra_singleton_leader_id',
        SEEN: 'rovalra_singleton_last_seen',
    };
    const INTERVAL = 5000;
    const LEASE = 10000;

    const instanceId = crypto.randomUUID();
    let isLeader = false;
    let timerId = null;
    let featuresInitialized = false;

    const toggleFeatures = (shouldRun) => {
        if (shouldRun && !featuresInitialized) {
            console.log(
                'RoValra: Leader instance. Initializing singleton features.',
            );
            initializeHeartbeatSpoofer();
            featuresInitialized = true;
        } else if (!shouldRun && featuresInitialized) {
            featuresInitialized = false;
            console.log('RoValra: No longer leader.');
        }
    };

    const resetLoop = (nextFn) => {
        if (timerId) clearInterval(timerId);
        timerId = setInterval(nextFn, INTERVAL);
    };

    const attemptToBecomeLeader = () => {
        isLeader = true;
        const info = { [KEYS.ID]: instanceId, [KEYS.SEEN]: Date.now() };

        chrome.storage.local.set(info, () => {
            toggleFeatures(true);
            resetLoop(renewLease);
        });
    };

    const renewLease = () => {
        if (!isLeader) return;

        if (
            typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local
        ) {
            isLeader = false;
            toggleFeatures(false);
            resetLoop(checkForLeader);
            return;
        }

        chrome.storage.local.get(KEYS.ID, (result) => {
            if (chrome.runtime?.lastError || result[KEYS.ID] !== instanceId) {
                isLeader = false;
                toggleFeatures(false);
                resetLoop(checkForLeader);
            } else {
                chrome.storage.local.set({ [KEYS.SEEN]: Date.now() });
            }
        });
    };

    const checkForLeader = () => {
        chrome.storage.local.get([KEYS.ID, KEYS.SEEN], (result) => {
            const lastSeen = result[KEYS.SEEN];
            const isLeaseActive = lastSeen && Date.now() - lastSeen < LEASE;

            if (!result[KEYS.ID] || !isLeaseActive) {
                attemptToBecomeLeader();
            }
        });
    };

    window.addEventListener('beforeunload', () => {
        if (isLeader) chrome.storage.local.remove([KEYS.ID, KEYS.SEEN]);
    });

    checkForLeader();
    resetLoop(checkForLeader);
}

manageSingletonExecution();
loadDatacenterMap();
