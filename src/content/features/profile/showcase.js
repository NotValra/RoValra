import { observeElement } from '../../core/observer.js';
import { createTab } from '../../core/ui/profile/tab.js';
import { createDropdownContent } from '../../core/ui/selects.js';
import { createSearchInput } from '../../core/ui/general/gameInput.js';
import {
    fetchThumbnails,
    createThumbnailElement,
    fetchPromotionalThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import {
    getUniversesDetails,
    getExperienceGuidelinesAgeRecommendation,
} from '../../core/apis/games.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { callRobloxApiJson } from '../../core/api.js';
import {
    getUserSettings,
    updateUserSettingViaApi,
} from '../../core/donators/settingHandler.js';
import {
    getSavedPreferredRegion,
    performJoinAction,
} from '../../core/preferredregion.js';
import { launchGame } from '../../core/utils/launcher.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { getAssets } from '../../core/assets.js';

const initialized = 'rovalraShowcaseInitialized';

function createMoreIcon() {
    const icon = document.createElement('span');
    icon.className = 'rovalra-showcase-more-icon';
    icon.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index++) {
        icon.appendChild(document.createElement('span'));
    }
    return icon;
}

function centerDropdown(trigger, panel) {
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth;
    const left = Math.max(
        8,
        Math.min(
            triggerRect.left + triggerRect.width / 2 - panelWidth / 2,
            viewportWidth - panelWidth - 8,
        ),
    );
    panel.style.left = `${left + window.scrollX}px`;
}

function getGameUrl(game) {
    const slug = encodeURIComponent(
        String(game.name || 'game')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, ''),
    );
    return `https://www.roblox.com/games/${game.rootPlaceId}/${slug}`;
}

async function getGroup(groupId, fallback = {}) {
    const id = Number(groupId);
    if (!id) return null;

    const details =
        (await callRobloxApiJson({
            subdomain: 'groups',
            endpoint: `/v1/groups/${id}`,
        }).catch(() => null)) || {};
    const thumbnails = await fetchThumbnails([{ id }], 'GroupIcon', '150x150');
    return {
        id,
        name: fallback.name || details.name || ts('showcase.unknownCommunity'),
        memberCount: fallback.memberCount ?? details.memberCount ?? 0,
        hasVerifiedBadge:
            fallback.hasVerifiedBadge ?? details.hasVerifiedBadge ?? false,
        owner: fallback.owner || details.owner || null,
        thumbnail: thumbnails.get(id),
    };
}

async function getGame(universeId, fallback = {}) {
    const id = Number(universeId);
    if (!id) return null;

    const details = (await getUniversesDetails([id]))[0] || {};
    const rootPlaceId = Number(
        fallback.rootPlaceId || fallback.root_place_id || details.rootPlaceId,
    );
    let thumbnail = (await fetchPromotionalThumbnails(id))?.[0] || null;
    if (!thumbnail && rootPlaceId) {
        const thumbnails = await fetchThumbnails(
            [{ id: rootPlaceId }],
            'GameThumbnail',
            '768x432',
        );
        thumbnail = thumbnails.get(rootPlaceId) || null;
    }
    if (!thumbnail) {
        const thumbnails = await fetchThumbnails(
            [{ id }],
            'GameIcon',
            '420x420',
        );
        thumbnail = thumbnails.get(id) || null;
    }

    let maturity = null;
    try {
        maturity = await getExperienceGuidelinesAgeRecommendation(id);
    } catch {}

    return {
        universeId: id,
        rootPlaceId,
        name: fallback.name || details.name || ts('showcase.unknownExperience'),
        thumbnail,
        creator: fallback.creator || details.creator || null,
        maturity:
            typeof maturity === 'string'
                ? maturity
                : maturity?.displayName ||
                  maturity?.contentMaturity ||
                  ts('showcase.maturityUnavailable'),
    };
}

function renderGameCard(container, game, canEdit) {
    container.replaceChildren();
    if (!game) {
        const emptyCard = document.createElement('article');
        emptyCard.className = 'rovalra-showcase-game rovalra-showcase-empty';
        const empty = document.createElement('p');
        empty.className = 'text-body';
        empty.textContent = canEdit
            ? ts('showcase.chooseGame')
            : ts('showcase.noFeaturedGame');
        emptyCard.appendChild(empty);
        container.appendChild(emptyCard);
        return;
    }

    const card = document.createElement('article');
    card.className = 'rovalra-showcase-game';
    const thumbnailLink = document.createElement('a');
    thumbnailLink.href = getGameUrl(game);
    thumbnailLink.className = 'rovalra-showcase-thumbnail-link';
    const thumb = createThumbnailElement(
        game.thumbnail,
        `${game.name} thumbnail`,
        'rovalra-showcase-game-thumbnail',
        { width: '220px', height: '124px' },
    );
    thumbnailLink.appendChild(thumb);
    card.appendChild(thumbnailLink);

    const details = document.createElement('div');
    details.className = 'rovalra-showcase-game-details';
    const title = document.createElement('h3');
    title.className = 'text-heading-medium';
    const titleLink = document.createElement('a');
    titleLink.href = getGameUrl(game);
    titleLink.className = 'rovalra-showcase-title-link';
    titleLink.textContent = game.name;
    title.appendChild(titleLink);
    const creator = document.createElement('div');
    creator.className =
        'rovalra-showcase-creator game-creator with-verified-badge';
    if (game.creator?.id && game.creator?.name) {
        const by = document.createElement('span');
        by.className = 'text-label';
        by.textContent = ts('showcase.by');
        const creatorLink = document.createElement('a');
        creatorLink.className = 'text-name text-overflow';
        creatorLink.href =
            game.creator.type === 'Group'
                ? `https://www.roblox.com/communities/${game.creator.id}`
                : `https://www.roblox.com/users/${game.creator.id}/profile`;
        creatorLink.textContent = game.creator.name;
        creator.append(by, creatorLink);

        if (game.creator.hasVerifiedBadge) {
            const badge = document.createElement('span');
            badge.style.cssText = 'display:inline-flex;vertical-align:middle;';
            const badgeButton = document.createElement('span');
            badgeButton.setAttribute('role', 'button');
            badgeButton.tabIndex = 0;
            badgeButton.dataset.rblxVerifiedBadgeIcon = '';
            badgeButton.dataset.rblxBadgeIcon = 'true';
            badgeButton.className = 'css-1myerb2-imgWrapper';
            const badgeImage = document.createElement('img');
            badgeImage.className = 'verified-badge-icon-experience-creator';
            badgeImage.src = getAssets().verifiedBadgeMono;
            badgeImage.title = ts('showcase.verifiedBadge');
            badgeImage.alt = ts('showcase.verifiedBadge');
            badgeButton.appendChild(badgeImage);
            badge.appendChild(badgeButton);
            creator.appendChild(badge);
        }
    }

    const maturity = document.createElement('p');
    maturity.className = 'text-body rovalra-showcase-maturity';
    maturity.textContent = /^maturity\b/i.test(game.maturity)
        ? game.maturity
        : `${ts('showcase.maturity')}: ${game.maturity}`;
    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'play-game-button';
    const playIcon = document.createElement('span');
    playIcon.className = 'icon-common-play';
    join.appendChild(playIcon);
    join.addEventListener('click', async () => {
        if (!game.rootPlaceId) return;
        const localSettings = await chrome.storage.local.get({
            PreferredRegionEnabled: true,
            playbuttonpreferredregionenabled: true,
        });
        if (
            localSettings.PreferredRegionEnabled &&
            localSettings.playbuttonpreferredregionenabled
        ) {
            const savedRegion = await getSavedPreferredRegion();
            await performJoinAction(
                game.rootPlaceId,
                game.universeId,
                savedRegion === 'AUTO' ? null : savedRegion,
            );
        } else {
            launchGame(game.rootPlaceId);
        }
    });
    details.append(title, creator, maturity, join);
    card.appendChild(details);
    container.appendChild(card);
}

function renderGroupCard(container, group, canEdit) {
    container.replaceChildren();
    if (!group) {
        const emptyCard = document.createElement('article');
        emptyCard.className = 'rovalra-showcase-game rovalra-showcase-empty';
        const empty = document.createElement('p');
        empty.className = 'text-body';
        empty.textContent = canEdit
            ? ts('showcase.chooseGroup')
            : ts('showcase.noFeaturedGroup');
        emptyCard.appendChild(empty);
        container.appendChild(emptyCard);
        return;
    }

    const card = document.createElement('article');
    card.className = 'rovalra-showcase-game rovalra-showcase-group-card';
    const icon = createThumbnailElement(
        group.thumbnail,
        `${group.name} icon`,
        'rovalra-showcase-group-icon',
        { width: '96px', height: '96px', objectFit: 'cover' },
    );
    const groupLink = `https://www.roblox.com/communities/${group.id}`;
    const iconLink = document.createElement('a');
    iconLink.className = 'rovalra-showcase-group-icon-link';
    iconLink.href = groupLink;
    iconLink.appendChild(icon);
    const details = document.createElement('div');
    details.className = 'rovalra-showcase-game-details';
    const title = document.createElement('h3');
    title.className = 'text-heading-medium';
    const titleLink = document.createElement('a');
    titleLink.className = 'rovalra-showcase-title-link';
    titleLink.href = groupLink;
    titleLink.textContent = group.name;
    title.appendChild(titleLink);
    if (group.hasVerifiedBadge) {
        const badge = document.createElement('img');
        badge.className = 'verified-badge-icon-experience-creator';
        badge.src = getAssets().verifiedBadgeMono;
        badge.alt = ts('showcase.verifiedBadge');
        badge.title = ts('showcase.verifiedBadge');
        title.appendChild(badge);
    }
    details.appendChild(title);
    if (group.owner?.userId && group.owner?.username) {
        const owner = document.createElement('div');
        owner.className = 'rovalra-showcase-owner game-creator';
        const by = document.createElement('span');
        by.className = 'text-label';
        by.textContent = ts('showcase.by');
        const ownerLink = document.createElement('a');
        ownerLink.className = 'text-name text-overflow';
        ownerLink.href = `https://www.roblox.com/users/${group.owner.userId}/profile`;
        ownerLink.textContent = group.owner.displayName || group.owner.username;
        owner.append(by, ownerLink);
        if (group.owner.hasVerifiedBadge) {
            const badge = document.createElement('img');
            badge.className = 'verified-badge-icon-experience-creator';
            badge.src = getAssets().verifiedBadgeMono;
            badge.alt = ts('showcase.verifiedBadge');
            badge.title = ts('showcase.verifiedBadge');
            owner.appendChild(badge);
        }
        details.appendChild(owner);
    }
    const members = document.createElement('p');
    members.className = 'text-body rovalra-showcase-maturity';
    members.textContent = ts('showcase.members', {
        count: Number(group.memberCount || 0).toLocaleString(),
    });
    details.appendChild(members);
    card.append(iconLink, details);
    container.appendChild(card);
}

async function addShowcaseTab(tabContainer) {
    if (tabContainer.dataset[initialized] === 'true') return;
    const profileContainer = tabContainer.parentElement;
    const contentContainer =
        profileContainer?.querySelector('.profile-tab-content-wrapper') ||
        profileContainer?.parentElement?.querySelector(
            '.profile-tab-content-wrapper',
        ) ||
        document.querySelector('.profile-tab-content-wrapper') ||
        profileContainer;
    const userId = Number(getUserIdFromUrl());
    if (!contentContainer || !userId) return;
    tabContainer.dataset[initialized] = 'true';

    const { contentPane } = createTab({
        id: 'showcase',
        label: ts('showcase.tab'),
        container: tabContainer,
        contentContainer,
    });
    contentPane.classList.add('rovalra-showcase-content');

    const ownProfile = Number(await getAuthenticatedUserId()) === userId;
    const profileSettings = await getUserSettings(userId, {
        noCache: ownProfile,
    });
    const gameArea = document.createElement('section');
    gameArea.className = 'rovalra-showcase-section';
    const gameHeadingRow = document.createElement('div');
    gameHeadingRow.className = 'rovalra-showcase-heading-row';
    const gameHeading = document.createElement('h2');
    gameHeading.className = 'text-heading-medium';
    gameHeading.textContent = ts('showcase.favoriteGame');
    gameHeadingRow.appendChild(gameHeading);
    gameArea.appendChild(gameHeadingRow);
    const cardArea = document.createElement('div');
    gameArea.appendChild(cardArea);

    const groupArea = document.createElement('section');
    groupArea.className = 'rovalra-showcase-section';
    const groupHeadingRow = document.createElement('div');
    groupHeadingRow.className = 'rovalra-showcase-heading-row';
    const groupHeading = document.createElement('h2');
    groupHeading.className = 'text-heading-medium';
    groupHeading.textContent = ts('showcase.favoriteGroup');
    groupHeadingRow.appendChild(groupHeading);
    const groupCardArea = document.createElement('div');
    groupArea.append(groupHeadingRow, groupCardArea);

    const showcaseGrid = document.createElement('div');
    showcaseGrid.className = 'rovalra-showcase-grid';
    showcaseGrid.append(gameArea, groupArea);
    contentPane.appendChild(showcaseGrid);

    const currentGame = await getGame(profileSettings.fav_game);
    let hasFeaturedGame = Boolean(currentGame);
    renderGameCard(cardArea, currentGame, ownProfile);
    const currentGroup = await getGroup(profileSettings.fav_group);
    renderGroupCard(groupCardArea, currentGroup, ownProfile);
    if (!ownProfile) return;

    let searchDropdown = null;
    const search = createSearchInput({
        placeholder: ts('showcase.searchGame'),
        onResultSelect: async (game) => {
            const selected = await getGame(game.universeId || game.id, game);
            if (!selected) return;
            const saved = await updateUserSettingViaApi(
                'fav_game',
                selected.universeId,
            );
            if (saved !== false) {
                if (searchDropdown) searchDropdown.style.display = 'none';
                hasFeaturedGame = true;
                renderGameCard(cardArea, selected, true);
                dropdownInner?.prepend(search.element);
                if (!menuButton.isConnected) {
                    gameHeadingRow.appendChild(menuButton);
                }
            }
        },
    });
    let dropdown;
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'rovalra-showcase-menu-button btn-control-md';
    menuButton.setAttribute('aria-label', ts('showcase.gameOptions'));
    menuButton.setAttribute('aria-haspopup', 'listbox');
    menuButton.appendChild(createMoreIcon());

    const items = [{ value: 'clear', label: ts('showcase.clearGame') }];
    dropdown = createDropdownContent(
        menuButton,
        items,
        null,
        async (value) => {
            if (searchDropdown) searchDropdown.style.display = 'none';
            if (value !== 'clear') return;
            if ((await updateUserSettingViaApi('fav_game', 0)) !== false) {
                hasFeaturedGame = false;
                renderGameCard(cardArea, null, true);
                menuButton.remove();
                cardArea
                    .querySelector('.rovalra-showcase-empty')
                    ?.appendChild(search.element);
            }
        },
        () => {},
    );
    const dropdownPanel = dropdown.element;
    dropdownPanel.classList.add('rovalra-showcase-options-dropdown');
    const dropdownInner = dropdownPanel.querySelector('.flex-dropdown-menu');
    search.element.classList.add('rovalra-showcase-search');
    if (hasFeaturedGame) {
        dropdownInner?.prepend(search.element);
    } else {
        const emptyCard = cardArea.querySelector('.rovalra-showcase-empty');
        emptyCard?.appendChild(search.element);
    }

    searchDropdown = search.element.querySelector('.game-search-dropdown');
    const positionSearchDropdown = () => {
        if (!searchDropdown || !search.input) return;
        if (
            hasFeaturedGame &&
            dropdownPanel.getAttribute('data-state') !== 'open'
        ) {
            searchDropdown.style.display = 'none';
            return;
        }
        const rect = search.input.getBoundingClientRect();
        Object.assign(searchDropdown.style, {
            position: 'absolute',
            top: `${rect.bottom + window.scrollY + 4}px`,
            left: `${rect.left + window.scrollX}px`,
            width: `${rect.width}px`,
            zIndex: '10020',
        });
    };
    if (searchDropdown) {
        document.body.appendChild(searchDropdown);
        search.input.addEventListener('focus', positionSearchDropdown);
        search.input.addEventListener('input', () =>
            setTimeout(positionSearchDropdown, 0),
        );
        window.addEventListener('resize', positionSearchDropdown);
        window.addEventListener('scroll', positionSearchDropdown, true);

        const searchVisibilityObserver = new MutationObserver(() => {
            if (
                hasFeaturedGame &&
                dropdownPanel.getAttribute('data-state') !== 'open' &&
                searchDropdown.style.display !== 'none'
            ) {
                searchDropdown.style.display = 'none';
            }
        });
        searchVisibilityObserver.observe(searchDropdown, {
            attributes: true,
            attributeFilter: ['style'],
        });
        searchVisibilityObserver.observe(dropdownPanel, {
            attributes: true,
            attributeFilter: ['data-state'],
        });
    }

    const setDropdownVisibility = (isVisible) => {
        dropdown.toggleVisibility(isVisible);
        if (!isVisible && searchDropdown) {
            searchDropdown.style.display = 'none';
        }
    };

    let closeGroupDropdown = () => {};
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeGroupDropdown();
        setDropdownVisibility();
        if (dropdownPanel.getAttribute('data-state') === 'open') {
            requestAnimationFrame(() =>
                centerDropdown(menuButton, dropdownPanel),
            );
        }
    });
    dropdownPanel.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', (event) => {
        if (
            !dropdownPanel.contains(event.target) &&
            !menuButton.contains(event.target) &&
            dropdownPanel.getAttribute('data-state') === 'open'
        ) {
            setDropdownVisibility(false);
        }
    });
    if (hasFeaturedGame) {
        gameHeadingRow.appendChild(menuButton);
    }

    let hasFeaturedGroup = Boolean(currentGroup);
    let groupMenuButton;
    let groupDropdownInner;
    const groupSearch = createSearchInput({
        placeholder: ts('showcase.searchGroup'),
        searchGroups: true,
        onResultSelect: async (group) => {
            const saved = await updateUserSettingViaApi('fav_group', group.id);
            if (saved !== false) {
                hasFeaturedGroup = true;
                const selectedGroup = await getGroup(group.id, group);
                renderGroupCard(groupCardArea, selectedGroup, true);
                groupDropdownInner?.prepend(groupSearch.element);
                if (groupMenuButton && !groupMenuButton.isConnected) {
                    groupHeadingRow.appendChild(groupMenuButton);
                }
            }
        },
    });
    groupMenuButton = document.createElement('button');
    groupMenuButton.type = 'button';
    groupMenuButton.className = 'rovalra-showcase-menu-button btn-control-md';
    groupMenuButton.setAttribute('aria-label', ts('showcase.groupOptions'));
    groupMenuButton.setAttribute('aria-haspopup', 'listbox');
    groupMenuButton.appendChild(createMoreIcon());
    const groupDropdown = createDropdownContent(
        groupMenuButton,
        [{ value: 'clear', label: ts('showcase.clearGroup') }],
        null,
        async (value) => {
            if (value !== 'clear') return;
            if ((await updateUserSettingViaApi('fav_group', 0)) !== false) {
                hasFeaturedGroup = false;
                renderGroupCard(groupCardArea, null, true);
                groupMenuButton.remove();
                groupCardArea
                    .querySelector('.rovalra-showcase-empty')
                    ?.appendChild(groupSearch.element);
            }
        },
        () => {},
    );
    const groupDropdownPanel = groupDropdown.element;
    groupDropdownPanel.classList.add('rovalra-showcase-options-dropdown');
    groupDropdownInner = groupDropdownPanel.querySelector(
        '.flex-dropdown-menu',
    );
    const groupSearchDropdown = groupSearch.element.querySelector(
        '.game-search-dropdown',
    );
    const positionGroupSearchDropdown = () => {
        if (!groupSearchDropdown) return;
        if (
            hasFeaturedGroup &&
            groupDropdownPanel.getAttribute('data-state') !== 'open'
        ) {
            groupSearchDropdown.style.display = 'none';
            return;
        }
        const rect = groupSearch.input.getBoundingClientRect();
        Object.assign(groupSearchDropdown.style, {
            position: 'absolute',
            top: `${rect.bottom + window.scrollY + 4}px`,
            left: `${rect.left + window.scrollX}px`,
            width: `${rect.width}px`,
            zIndex: '10020',
        });
    };
    if (groupSearchDropdown) {
        document.body.appendChild(groupSearchDropdown);
        groupSearch.input.addEventListener(
            'focus',
            positionGroupSearchDropdown,
        );
        groupSearch.input.addEventListener('input', () =>
            setTimeout(positionGroupSearchDropdown, 0),
        );
        window.addEventListener('resize', positionGroupSearchDropdown);
        window.addEventListener('scroll', positionGroupSearchDropdown, true);
        const groupSearchVisibilityObserver = new MutationObserver(() => {
            if (
                hasFeaturedGroup &&
                groupDropdownPanel.getAttribute('data-state') !== 'open' &&
                groupSearchDropdown.style.display !== 'none'
            ) {
                groupSearchDropdown.style.display = 'none';
            }
        });
        groupSearchVisibilityObserver.observe(groupSearchDropdown, {
            attributes: true,
            attributeFilter: ['style'],
        });
        groupSearchVisibilityObserver.observe(groupDropdownPanel, {
            attributes: true,
            attributeFilter: ['data-state'],
        });
    }
    if (!hasFeaturedGroup) {
        groupCardArea
            .querySelector('.rovalra-showcase-empty')
            ?.appendChild(groupSearch.element);
    } else {
        groupDropdownInner?.prepend(groupSearch.element);
        groupHeadingRow.appendChild(groupMenuButton);
    }
    groupMenuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setDropdownVisibility(false);
        groupDropdown.toggleVisibility();
        if (groupDropdownPanel.getAttribute('data-state') === 'open') {
            requestAnimationFrame(() =>
                centerDropdown(groupMenuButton, groupDropdownPanel),
            );
        }
    });
    groupDropdownPanel.addEventListener('click', (event) =>
        event.stopPropagation(),
    );
    document.addEventListener('click', (event) => {
        if (
            !groupDropdownPanel.contains(event.target) &&
            !groupMenuButton.contains(event.target) &&
            groupDropdownPanel.getAttribute('data-state') === 'open'
        ) {
            groupDropdown.toggleVisibility(false);
        }
    });
    closeGroupDropdown = () => groupDropdown.toggleVisibility(false);
}

export async function init() {
    if (!(await settings.profileShowcaseEnabled)) return;

    observeElement(
        '.profile-tabs',
        (tabs) =>
            addShowcaseTab(tabs).catch((error) => {
                console.error(
                    'RoValra: Failed to initialize Showcase tab.',
                    error,
                );
            }),
        { multiple: true },
    );
}
