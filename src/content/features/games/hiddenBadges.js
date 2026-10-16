import { callRobloxApiJson } from '../../core/api.js';
import { getPlaceDetails } from '../../core/apis/games.js';
import { getAssets } from '../../core/assets.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { getGameBadges } from '../../core/utils/trackers/badges.js';
import { t } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import {
    get as getCache,
    set as setCache,
} from '../../core/storage/cacheHandler.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';

const BADGES_STORAGE_KEY = 'rovalra_badges_v1';
const DETAILS_CACHE_SECTION = 'badge_details';
const PUBLIC_BADGES_CACHE_SECTION = 'universe_public_badges';
const HIDDEN_LIST_CLASS = 'rovalra-hidden-badges-list';
const EMPTY_MESSAGE_CLASS = 'rovalra-hidden-badges-empty';
const SHIMMER_ROW_CLASS = 'rovalra-hidden-badge-shimmer';
const STORAGE_REFRESH_DELAY = 1500;

let initialized = false;
let storageRefreshTimer = null;
const hiddenBadgeMemoryCache = new Map();

async function getLocaleText() {
    const [
        badgesTab,
        hiddenBadgesTab,
        hiddenOwnedNotice,
        unableToDetectPlace,
        unableToDetectUniverse,
        stillScanning,
        noneOwnedFound,
        noneFound,
        failedToLoad,
        rolimonsSource,
        viewOnRolimons,
        rarity,
        wonYesterday,
        wonEver,
    ] = await Promise.all([
        t('hiddenBadges.tabs.badges'),
        t('hiddenBadges.tabs.hiddenBadges'),
        t('hiddenBadges.hiddenOwnedNotice'),
        t('hiddenBadges.unableToDetectPlace'),
        t('hiddenBadges.unableToDetectUniverse'),
        t('hiddenBadges.stillScanning'),
        t('hiddenBadges.noneOwnedFound'),
        t('hiddenBadges.noneFound'),
        t('hiddenBadges.failedToLoad'),
        t('hiddenBadges.rolimonsSource'),
        t('hiddenBadges.viewOnRolimons'),
        t('privateGames.badges.rarity'),
        t('privateGames.badges.wonYesterday'),
        t('privateGames.badges.wonEver'),
    ]);

    return {
        tabs: {
            badges: badgesTab,
            hiddenBadges: hiddenBadgesTab,
        },
        hiddenOwnedNotice,
        unableToDetectPlace,
        unableToDetectUniverse,
        stillScanning,
        noneOwnedFound,
        noneFound,
        failedToLoad,
        rolimonsSource,
        viewOnRolimons,
        stats: {
            rarity,
            wonYesterday,
            wonEver,
        },
    };
}

function getRarityLabel(winRate) {
    if (winRate <= 0) return 'Impossible';
    if (winRate < 5) return 'Impossible';
    if (winRate < 10) return 'Insane';
    if (winRate < 20) return 'Hard';
    if (winRate < 50) return 'Moderate';
    return 'Easy';
}

function createEmptyMessage(text) {
    const message = document.createElement('li');
    message.className = EMPTY_MESSAGE_CLASS;
    message.textContent = text;
    return message;
}

function showHiddenMessage(hiddenList, text) {
    hiddenList.innerHTML = '';
    hiddenList.appendChild(createEmptyMessage(text));
}

function createOwnedNotice(text) {
    const notice = document.createElement('li');
    notice.className = 'rovalra-hidden-badges-notice';
    notice.textContent = text;
    return notice;
}

function createRolimonsNotice(localeText, placeId) {
    const notice = document.createElement('li');
    notice.className =
        'rovalra-hidden-badges-notice rovalra-hidden-badges-rolimons';

    const icon = document.createElement('img');
    icon.className = 'rovalra-hidden-badges-rolimons-icon';
    icon.src = getAssets().rolimonsIcon;
    icon.alt = '';

    const text = document.createElement('span');
    text.textContent = localeText.rolimonsSource;

    const link = document.createElement('a');
    link.className = 'text-link rovalra-hidden-badges-rolimons-link';
    link.href = `https://www.rolimons.com/game/${placeId}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = localeText.viewOnRolimons;

    notice.append(icon, text, link);
    return notice;
}

function renderHiddenBadgeShimmer(hiddenList, count = 3) {
    hiddenList.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const row = document.createElement('li');
        row.className = `stack-row badge-row ${SHIMMER_ROW_CLASS}`;

        const imageWrap = document.createElement('div');
        imageWrap.className = 'badge-image';

        const image = document.createElement('div');
        image.className =
            'thumbnail-2d-container badge-image-container shimmer';
        imageWrap.appendChild(image);

        const content = document.createElement('div');
        content.className = 'badge-content';

        const dataContainer = document.createElement('div');
        dataContainer.className = 'badge-data-container';

        const title = document.createElement('div');
        title.className = 'shimmer rovalra-hidden-badge-shimmer-title';

        const description = document.createElement('div');
        description.className =
            'shimmer rovalra-hidden-badge-shimmer-description';

        dataContainer.append(title, description);

        const stats = document.createElement('ul');
        stats.className = 'badge-stats-container';

        for (let statIndex = 0; statIndex < 3; statIndex++) {
            const item = document.createElement('li');
            const label = document.createElement('div');
            label.className = 'shimmer rovalra-hidden-badge-shimmer-label';
            const value = document.createElement('div');
            value.className = 'shimmer rovalra-hidden-badge-shimmer-value';
            item.append(label, value);
            stats.appendChild(item);
        }

        content.append(dataContainer, stats);
        row.append(imageWrap, content);
        hiddenList.appendChild(row);
    }
}

async function getBadgeDetails(badgeId) {
    const cacheKey = String(badgeId);
    const cached = await getCache(DETAILS_CACHE_SECTION, cacheKey, 'local');
    if (cached) return cached;

    const data = await callRobloxApiJson({
        subdomain: 'badges',
        endpoint: `/v1/badges/${badgeId}`,
        useBackground: true,
    });

    await setCache(DETAILS_CACHE_SECTION, cacheKey, data, 'local');
    return data;
}

async function getBadgeDetailsBatch(badgeIds) {
    const results = [];

    for (let i = 0; i < badgeIds.length; i += 10) {
        const batch = badgeIds.slice(i, i + 10);
        const details = await Promise.all(
            batch.map((badgeId) =>
                getBadgeDetails(badgeId).catch((error) => {
                    console.warn(
                        'RoValra: Failed to fetch hidden badge details',
                        badgeId,
                        error,
                    );
                    return null;
                }),
            ),
        );
        results.push(...details.filter(Boolean));
    }

    return results;
}

async function getDisabledBadgeIds(placeId) {
    try {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/v1/auth/games/${placeId}/disabled-badges`,
            method: 'GET',
            isRovalraApi: true,
        });
        return (data?.badgeIds || []).map(String);
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

async function getOwnedHiddenBadgeIds(placeId) {
    const placeDetails = await getPlaceDetails(placeId);
    const universeId = placeDetails?.universeId;
    if (!universeId) return { universeMissing: true };

    const { badges, isScanning } = await getGameBadges(placeId);
    const publicBadgeIds = await getPublicUniverseBadgeIds(universeId);
    const badgeIds = badges
        .map((badge) => badge.badgeId)
        .filter((badgeId) => !publicBadgeIds.has(String(badgeId)));

    return { badgeIds, isScanning };
}

async function getPublicUniverseBadgeIds(universeId) {
    const cacheKey = String(universeId);
    const cached = await getCache(
        PUBLIC_BADGES_CACHE_SECTION,
        cacheKey,
        'session',
    );
    if (cached) return new Set(cached);

    const badgeIds = [];
    let cursor = '';

    do {
        let endpoint = `/v1/universes/${universeId}/badges?languageCode=en_us&limit=100&sortOrder=Asc`;
        if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

        const data = await callRobloxApiJson({
            subdomain: 'badges',
            endpoint,
            useBackground: true,
        });

        badgeIds.push(
            ...(data?.data || [])
                .map((badge) => (badge?.id ? String(badge.id) : null))
                .filter(Boolean),
        );
        cursor = data?.nextPageCursor || '';
    } while (cursor);

    await setCache(PUBLIC_BADGES_CACHE_SECTION, cacheKey, badgeIds, 'session');
    return new Set(badgeIds);
}

function renderBadgeRows(
    list,
    badges,
    thumbMap,
    localeText,
    ownedOnly,
    placeId,
) {
    list.innerHTML = '';
    list.appendChild(
        ownedOnly
            ? createOwnedNotice(localeText.hiddenOwnedNotice)
            : createRolimonsNotice(localeText, placeId),
    );

    badges.forEach((badge) => {
        const stats = badge.statistics || {};
        const winRate = (stats.winRatePercentage ?? 0) * 100;
        const rarityText = `${winRate.toFixed(1)}% (${getRarityLabel(winRate)})`;
        const pastDayAwarded = stats.pastDayAwardedCount ?? 0;
        const awardedCount = stats.awardedCount ?? 0;
        const name = badge.displayName || badge.name || `Badge ${badge.id}`;
        const description = badge.displayDescription || badge.description || '';
        const thumb = thumbMap.get(Number(badge.id));

        const row = document.createElement('li');
        row.className = 'stack-row badge-row rovalra-hidden-badge-row';

        const imageWrap = document.createElement('div');
        imageWrap.className = 'badge-image';

        const link = document.createElement('a');
        link.href = `https://www.roblox.com/badges/${badge.id}/${encodeURIComponent(name)}`;

        const thumbnail = document.createElement('span');
        thumbnail.className = 'thumbnail-2d-container badge-image-container';

        const image = document.createElement('img');
        image.src = thumb?.imageUrl || '';
        image.alt = name;
        image.title = name;

        thumbnail.appendChild(image);
        link.appendChild(thumbnail);
        imageWrap.appendChild(link);

        const content = document.createElement('div');
        content.className = 'badge-content';

        const dataContainer = document.createElement('div');
        dataContainer.className = 'badge-data-container';

        const title = document.createElement('div');
        title.className = 'font-header-2 badge-name';
        title.textContent = name;

        const desc = document.createElement('p');
        desc.className = 'para-overflow';
        desc.textContent = description;

        dataContainer.append(title, desc);

        const statsList = document.createElement('ul');
        statsList.className = 'badge-stats-container';

        [
            [localeText.stats.rarity, rarityText],
            [localeText.stats.wonYesterday, pastDayAwarded.toLocaleString()],
            [localeText.stats.wonEver, awardedCount.toLocaleString()],
        ].forEach(([label, value]) => {
            const item = document.createElement('li');
            const labelEl = document.createElement('div');
            labelEl.className = 'text-label';
            labelEl.textContent = label;
            const valueEl = document.createElement('div');
            valueEl.className = 'font-header-2 badge-stats-info';
            valueEl.textContent = value;
            item.append(labelEl, valueEl);
            statsList.appendChild(item);
        });

        content.append(dataContainer, statsList);
        row.append(imageWrap, content);
        list.appendChild(row);
    });
}

async function renderHiddenBadges(container, hiddenList) {
    const localeText = await getLocaleText();

    try {
        const placeId = getPlaceIdFromUrl();
        if (!placeId) {
            showHiddenMessage(hiddenList, localeText.unableToDetectPlace);
            return;
        }

        const cached = hiddenBadgeMemoryCache.get(String(placeId));
        if (cached) {
            if (cached.message) {
                showHiddenMessage(hiddenList, cached.message);
            } else {
                renderBadgeRows(
                    hiddenList,
                    cached.details,
                    cached.thumbMap,
                    localeText,
                    cached.ownedOnly,
                    placeId,
                );
            }
            hiddenList.dataset.rovalraHiddenBadgesLoaded = 'true';
            return;
        }

        hiddenList.dataset.rovalraHiddenBadgesLoading = 'true';
        if (!hiddenList.dataset.rovalraHiddenBadgesLoaded) {
            renderHiddenBadgeShimmer(hiddenList);
        }

        let hiddenBadgeIds = await getDisabledBadgeIds(placeId);
        const ownedOnly = hiddenBadgeIds === null;
        let isScanning = false;

        if (ownedOnly) {
            const owned = await getOwnedHiddenBadgeIds(placeId);
            if (owned.universeMissing) {
                showHiddenMessage(
                    hiddenList,
                    localeText.unableToDetectUniverse,
                );
                return;
            }
            hiddenBadgeIds = owned.badgeIds;
            isScanning = owned.isScanning;
        }

        if (hiddenBadgeIds.length === 0) {
            const message = !ownedOnly
                ? localeText.noneFound
                : isScanning
                  ? localeText.stillScanning
                  : localeText.noneOwnedFound;
            showHiddenMessage(hiddenList, message);
            if (!isScanning) {
                hiddenBadgeMemoryCache.set(String(placeId), {
                    message,
                    ownedOnly,
                });
            }
            hiddenList.dataset.rovalraHiddenBadgesLoaded = 'true';
            delete hiddenList.dataset.rovalraHiddenBadgesLoading;
            return;
        }

        const details = await getBadgeDetailsBatch(hiddenBadgeIds);
        const thumbMap = await fetchThumbnails(
            details.map((badge) => ({ id: badge.id })),
            'BadgeIcon',
            '150x150',
        );

        hiddenBadgeMemoryCache.set(String(placeId), {
            details,
            thumbMap,
            ownedOnly,
        });
        hiddenList.dataset.rovalraHiddenBadgesLoaded = 'true';
        if (details.length === 0) {
            const message = ownedOnly
                ? localeText.noneOwnedFound
                : localeText.noneFound;
            hiddenBadgeMemoryCache.set(String(placeId), {
                message,
                ownedOnly,
            });
            showHiddenMessage(hiddenList, message);
        } else {
            renderBadgeRows(
                hiddenList,
                details,
                thumbMap,
                localeText,
                ownedOnly,
                placeId,
            );
        }
    } catch (error) {
        showHiddenMessage(hiddenList, localeText.failedToLoad);
        console.warn('RoValra: Failed to render hidden badges', error);
    } finally {
        delete hiddenList.dataset.rovalraHiddenBadgesLoading;
    }
}

async function setupBadgeTabs(container) {
    if (container.dataset.rovalraHiddenBadgesAdded) return;

    const header = container.querySelector('.container-header');
    const heading = header?.querySelector('h3');
    const nativeList = container.querySelector('.stack-list');
    if (!header || !heading || !nativeList) return;

    container.dataset.rovalraHiddenBadgesAdded = 'true';

    const hiddenList = document.createElement('ul');
    hiddenList.className = `stack-list ${HIDDEN_LIST_CLASS}`;
    nativeList.after(hiddenList);

    const localeText = await getLocaleText();
    const toggle = createPillToggle({
        options: [
            { text: localeText.tabs.badges, value: 'badges' },
            {
                text: localeText.tabs.hiddenBadges,
                value: 'hidden',
            },
        ],
        initialValue: 'badges',
        onChange: (value) => {
            const showHidden = value === 'hidden';
            container.classList.toggle(
                'rovalra-show-hidden-badges',
                showHidden,
            );

            if (
                showHidden &&
                !hiddenList.dataset.rovalraHiddenBadgesLoaded &&
                !hiddenList.dataset.rovalraHiddenBadgesLoading
            ) {
                renderHiddenBadges(container, hiddenList);
            }
        },
    });

    header.prepend(toggle);
    heading.remove();
}

export async function init() {
    if (initialized) return;
    if (!(await settings.hiddenBadgesEnabled)) return;
    initialized = true;

    observeElement('.game-badges-list', setupBadgeTabs, {
        multiple: true,
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[BADGES_STORAGE_KEY]) return;

        const placeId = getPlaceIdFromUrl();
        if (!placeId) return;

        const cached = hiddenBadgeMemoryCache.get(String(placeId));
        if (cached && !cached.ownedOnly) return;

        const { oldValue, newValue } = changes[BADGES_STORAGE_KEY];
        const getPlaceState = (data) =>
            JSON.stringify([
                data?.places?.[String(placeId)]?.badgeIds || [],
                !!data?.isScanning,
            ]);
        if (getPlaceState(oldValue) === getPlaceState(newValue)) return;

        clearTimeout(storageRefreshTimer);
        storageRefreshTimer = setTimeout(() => {
            hiddenBadgeMemoryCache.delete(String(placeId));

            document
                .querySelectorAll(
                    `.game-badges-list.rovalra-show-hidden-badges > .${HIDDEN_LIST_CLASS}`,
                )
                .forEach((hiddenList) => {
                    if (hiddenList.dataset.rovalraHiddenBadgesLoading) return;
                    renderHiddenBadges(
                        hiddenList.closest('.game-badges-list'),
                        hiddenList,
                    );
                });
        }, STORAGE_REFRESH_DELAY);
    });
}

export default init;
