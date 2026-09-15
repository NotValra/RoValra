import { fetchThumbnails as fetchThumbnailsBatch } from '../../../core/thumbnail/thumbnails.js';
import { createGameCard } from '../../../core/ui/games/gameCard.js';
import { callRobloxApi } from '../../../core/api.js';
import { observeElement } from '../../../core/observer.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { createDropdown } from '../../../core/ui/dropdown.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import DOMPurify from 'dompurify';
import { createTab } from '../../../core/ui/games/tab.js';
import { t, ts } from '../../../core/locale/i18n.js';
import { settings } from '../../../core/settings/getSettings.js';
import { getAssets } from '../../../core/assets.js';

const PAGE_SIZE = 12;

let isInitialized = false;
export async function init() {
    if (isInitialized) return;
    if ((await settings.subplacesEnabled) !== true) return;
    isInitialized = true;

    const fetchUniverseId = async (placeId) => {
        const response = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch universe ID: ${response.status}`);
        }

        const data = await response.json();
        if (data?.[0]?.universeId) {
            return data[0].universeId;
        }
        throw new Error('Universe ID not found in the API response.');
    };

    const fetchUniverseDetails = async (universeId) => {
        if (document.hidden) {
            await new Promise((resolve) => {
                const onVisibilityChange = () => {
                    if (!document.hidden) {
                        document.removeEventListener(
                            'visibilitychange',
                            onVisibilityChange,
                        );
                        resolve();
                    }
                };
                document.addEventListener(
                    'visibilitychange',
                    onVisibilityChange,
                );
            });
        }

        let attempts = 0;
        while (attempts < 5) {
            try {
                const response = await callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/games?universeIds=${universeId}`,
                    method: 'GET',
                });

                if (response.status === 429) {
                    attempts++;
                    await new Promise((r) => setTimeout(r, 2000 * attempts));
                    continue;
                }

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch universe details: ${response.status}`,
                    );
                }

                const data = await response.json();
                if (data?.data?.[0]) {
                    return data.data[0];
                }
                throw new Error(
                    'Universe details not found in the API response.',
                );
            } catch (e) {
                if (attempts >= 4) throw e;
                attempts++;
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    };

    const checkSubplaceJoinability = async (placeId) => {
        try {
            const attemptId = self.crypto.randomUUID();

            const response = await callRobloxApi({
                subdomain: 'gamejoin',
                endpoint: '/v2/join-game',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    placeId: parseInt(placeId, 10),
                    gameJoinAttemptId: attemptId,
                }),
            });

            if (!response.ok) {
                return null;
            }

            return await response.json();
        } catch (error) {
            return null;
        }
    };

    const fetchAllSubplaces = async (universeId) => {
        let allSubplaces = [];
        let nextCursor = '';
        const maxRetries = 3;

        do {
            let retryCount = 0;
            let success = false;

            while (retryCount < maxRetries && !success) {
                try {
                    const endpoint = nextCursor
                        ? `/v2/universes/${universeId}/places?limit=100&cursor=${nextCursor}`
                        : `/v2/universes/${universeId}/places?limit=100`;

                    const response = await callRobloxApi({
                        subdomain: 'develop',
                        endpoint: endpoint,
                        method: 'GET',
                    });

                    if (!response.ok) {
                        if (response.status === 429) {
                            const delay = Math.pow(2, retryCount) * 1000;
                            await new Promise((resolve) =>
                                setTimeout(resolve, delay),
                            );
                            retryCount++;
                            continue;
                        }
                        throw new Error(
                            `HTTP error! status: ${response.status}`,
                        );
                    }

                    const data = await response.json();
                    if (data?.data) {
                        allSubplaces.push(...data.data);
                    }
                    nextCursor = data?.nextPageCursor || '';
                    success = true;
                } catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        return allSubplaces;
                    }
                    await new Promise((resolve) =>
                        setTimeout(resolve, 2000 * retryCount),
                    );
                }
            }
        } while (nextCursor);

        return allSubplaces;
    };

    const fetchThumbnails = async (gamesToDisplay) => {
        if (gamesToDisplay.length === 0) return new Map();
        try {
            return await fetchThumbnailsBatch(
                gamesToDisplay,
                'PlaceIcon',
                '150x150',
            );
        } catch (e) {
            return new Map();
        }
    };

    const fetchPlaceVersions = async (placeIds) => {
        if (placeIds.length === 0) return new Map();
        try {
            const response = await callRobloxApi({
                subdomain: 'develop',
                endpoint: '/v1/assets/latest-versions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    assetIds: placeIds,
                    versionStatus: 'Published',
                }),
            });

            if (!response.ok) return new Map();

            const data = await response.json();
            const versionMap = new Map();

            if (data?.results) {
                data.results.forEach((result) => {
                    versionMap.set(result.assetId, result.versionNumber);
                });
            }

            return versionMap;
        } catch (e) {
            console.warn('RoValra: Failed to fetch place versions', e);
            return new Map();
        }
    };

    const fetchAccurateUpdatedTimes = async (placeIds) => {
        const updatedMap = new Map();

        await Promise.all(
            placeIds.map(async (placeId) => {
                try {
                    const response = await callRobloxApi({
                        subdomain: 'economy',
                        endpoint: `/v2/assets/${placeId}/details`,
                        method: 'GET',
                    });
                    if (!response.ok) return;

                    const data = await response.json();
                    if (data?.Updated) {
                        updatedMap.set(placeId, data.Updated);
                    }
                } catch (e) {
                    console.warn(
                        'RoValra: Failed to fetch accurate place update time',
                        placeId,
                        e,
                    );
                }
            }),
        );

        return updatedMap;
    };

    const checkAndDisplaySubplaceBanner = async (universeId, placeId) => {
        try {
            const universeDetails = await fetchUniverseDetails(universeId);
            if (
                universeDetails &&
                universeDetails.rootPlaceId &&
                universeDetails.rootPlaceId.toString() !== placeId
            ) {
                const rootPlaceName =
                    universeDetails.name ||
                    (await t('subplaces.banner.mainExperience'));
                const rootPlaceUrl = `https://www.roblox.com/games/${universeDetails.rootPlaceId}/YAYAYAY`;

                const joinData = await checkSubplaceJoinability(placeId);

                const bannerTitle = await t('subplaces.banner.title', {
                    rootPlaceName: DOMPurify.sanitize(rootPlaceName),
                    rootPlaceUrl,
                });
                let bannerDescription = await t(
                    'subplaces.banner.descriptionDefault',
                );

                if (joinData && joinData.status === 12) {
                    bannerDescription = await t(
                        'subplaces.banner.descriptionRestricted',
                    );
                }
                if (joinData && joinData.status === 2) {
                    bannerDescription = await t(
                        'subplaces.banner.descriptionJoinable',
                    );
                }

                const checkBannerInterval = setInterval(() => {
                    if (window.GameBannerManager) {
                        clearInterval(checkBannerInterval);
                        const subplaceIcon = decodeURIComponent(
                            getAssets().subplaceBannerIcon.replace(
                                'data:image/svg+xml,',
                                '',
                            ),
                        );
                        window.GameBannerManager.addNotice(
                            bannerTitle,
                            subplaceIcon,
                            bannerDescription,
                        );
                    }
                }, 200);
            }
        } catch (e) {
            console.warn('RoValra: Failed to check for subplace banner', e);
        }
    };

    const sortSubplaces = (list, sort, order, accurateUpdatedMap) => {
        const orderMultiplier = order === 'asc' ? 1 : -1;
        const sorted = [...list];
        const getUpdated = (place) =>
            accurateUpdatedMap?.get(place.id) || place.updated;

        if (sort === 'updated') {
            sorted.sort(
                (a, b) =>
                    (new Date(getUpdated(a) || 0).getTime() -
                        new Date(getUpdated(b) || 0).getTime()) *
                    orderMultiplier,
            );
        } else if (sort === 'created') {
            sorted.sort(
                (a, b) =>
                    (new Date(a.created || 0).getTime() -
                        new Date(b.created || 0).getTime()) *
                    orderMultiplier,
            );
        } else if (sort === 'name') {
            sorted.sort(
                (a, b) =>
                    (a.name || '').localeCompare(b.name || '') *
                    orderMultiplier,
            );
        } else {
            sorted.sort((a, b) => {
                if (a.isRootPlace && !b.isRootPlace) return -1;
                if (!a.isRootPlace && b.isRootPlace) return 1;
                return 0;
            });
            if (order === 'asc') sorted.reverse();
        }

        return sorted;
    };

    const createSubplacesTab = async (
        universeId,
        horizontalTabs,
        contentSection,
    ) => {
        const { contentPane: subplacesContentDiv } = createTab({
            id: 'subplaces',
            label: ts('subplaces.tabTitle'),
            container: horizontalTabs,
            contentContainer: contentSection,
            hash: '#!/subplaces',
        });

        const filtersContainer = document.createElement('div');
        filtersContainer.className = 'rovalra-filters-container';

        const createFilterSection = (label, element) => {
            const div = document.createElement('div');
            div.className = 'rovalra-filter-section';
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            div.append(labelEl, element);
            return div;
        };

        const filters = { sort: 'default', order: 'desc' };

        const sortDropdown = createDropdown({
            items: [
                {
                    value: 'default',
                    label: ts('subplaces.sort.default'),
                },
                {
                    value: 'updated',
                    label: ts('subplaces.sort.updated'),
                },
                {
                    value: 'created',
                    label: ts('subplaces.sort.created'),
                },
                { value: 'name', label: ts('subplaces.sort.name') },
            ],
            initialValue: 'default',
            onValueChange: (v) => {
                filters.sort = v;
                handleSortChange();
            },
        });

        const orderDropdown = createDropdown({
            items: [
                {
                    value: 'desc',
                    label: ts('subplaces.order.descending'),
                },
                {
                    value: 'asc',
                    label: ts('subplaces.order.ascending'),
                },
            ],
            initialValue: 'desc',
            onValueChange: (v) => {
                filters.order = v;
                handleSortChange();
            },
        });

        filtersContainer.append(
            createFilterSection(
                ts('subplaces.labels.sort'),
                sortDropdown.element,
            ),
            createFilterSection(
                ts('subplaces.labels.order'),
                orderDropdown.element,
            ),
        );

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'rovalra-subplaces-search-wrapper';
        const searchInputComponent = createStyledInput({
            id: 'rovalra-subplaces-search',
            label: ts('subplaces.searchPlaceholder'),
            placeholder: ' ',
        });
        searchWrapper.appendChild(searchInputComponent.container);
        const searchInput = searchInputComponent.input;

        const subplacesContainer = document.createElement('div');
        subplacesContainer.className = 'rovalra-subplaces-list';

        const loadMoreWrapper = document.createElement('div');
        loadMoreWrapper.className = 'rovalra-load-more-wrapper';
        const loadMoreButton = document.createElement('button');
        loadMoreButton.textContent = ts('subplaces.loadMore');
        loadMoreButton.className = 'rovalra-load-more-btn btn-control-md';
        loadMoreWrapper.appendChild(loadMoreButton);

        const sortEnabled = await settings.subplacesSortEnabled;
        subplacesContentDiv.append(
            ...(sortEnabled ? [filtersContainer] : []),
            searchWrapper,
            subplacesContainer,
            loadMoreWrapper,
        );

        let isLoaded = false;
        let handleSortChange = () => {};

        const initData = async () => {
            if (isLoaded) return;
            isLoaded = true;

            subplacesContainer.innerHTML =
                '<div class="spinner spinner-default"></div>';
            loadMoreWrapper.style.display = 'none';

            try {
                const rawSubplaces = await fetchAllSubplaces(universeId);
                let subplaces = sortSubplaces(
                    rawSubplaces,
                    filters.sort,
                    filters.order,
                );

                subplacesContainer.innerHTML = '';

                let displayedCount = 0;
                let allDisplayed = false;
                let accurateUpdatedMap = null;

                const displaySubplaces = async (gamesToDisplay) => {
                    const [thumbnails, placeVersions] = await Promise.all([
                        fetchThumbnails(gamesToDisplay),
                        fetchPlaceVersions(gamesToDisplay.map((s) => s.id)),
                    ]);

                    for (const subplace of gamesToDisplay) {
                        const gameData = {
                            id: subplace.id,
                            name: subplace.name,
                            rootPlaceId: subplace.id,
                        };
                        const stats = { thumbnails };

                        const version = placeVersions.get(subplace.id);

                        let infoParts = [];
                        if (version) {
                            infoParts.push(`v${version.toLocaleString()}`);
                        }
                        if (subplace.isRootPlace) {
                            infoParts.push(await t('subplaces.rootPlace'));
                        }

                        const customInfoText =
                            infoParts.length > 0 ? infoParts : null;

                        const card = createGameCard({
                            game: gameData,
                            stats,
                            showVotes: false,
                            showPlayers: false,
                            customInfoText,
                        });
                        card.classList.add(
                            'rovalra-subplace-card',
                            'game-card-container',
                        );
                        const nameEl = card.querySelector('.game-card-name');
                        if (nameEl) nameEl.dataset.fullName = subplace.name;
                        subplacesContainer.appendChild(card);
                    }
                };

                const loadMore = async () => {
                    const toLoad = subplaces.slice(
                        displayedCount,
                        displayedCount + PAGE_SIZE,
                    );
                    if (toLoad.length > 0) {
                        await displaySubplaces(toLoad);
                        displayedCount += toLoad.length;
                    }
                    if (displayedCount >= subplaces.length) {
                        allDisplayed = true;
                        loadMoreWrapper.style.display = 'none';
                    }
                };
                loadMoreButton.addEventListener('click', loadMore);

                const applySearchFilter = async () => {
                    const term = searchInput.value.trim().toLowerCase();
                    if (term && !allDisplayed) {
                        while (!allDisplayed) {
                            await loadMore();
                        }
                    }
                    subplacesContainer
                        .querySelectorAll('.rovalra-subplace-card')
                        .forEach((c) => {
                            const name =
                                c
                                    .querySelector('.game-card-name')
                                    ?.dataset.fullName?.toLowerCase() || '';
                            c.style.display = name.includes(term) ? '' : 'none';
                        });
                    loadMoreWrapper.style.display = term
                        ? 'none'
                        : allDisplayed
                          ? 'none'
                          : 'flex';
                };

                const showSubplaces = async () => {
                    if (subplaces.length === 0) {
                        subplacesContainer.innerHTML = DOMPurify.sanitize(
                            `<p style="grid-column: 1 / -1;">${await t('subplaces.noSubplaces')}</p>`,
                        );
                        loadMoreWrapper.style.display = 'none';
                        return;
                    }

                    await loadMore();
                    await applySearchFilter();
                };

                handleSortChange = async () => {
                    if (filters.sort === 'updated' && !accurateUpdatedMap) {
                        subplacesContainer.innerHTML =
                            '<div class="spinner spinner-default"></div>';
                        loadMoreWrapper.style.display = 'none';
                        accurateUpdatedMap = await fetchAccurateUpdatedTimes(
                            rawSubplaces.map((s) => s.id),
                        );
                    }

                    subplaces = sortSubplaces(
                        rawSubplaces,
                        filters.sort,
                        filters.order,
                        accurateUpdatedMap,
                    );
                    displayedCount = 0;
                    allDisplayed = false;
                    subplacesContainer.innerHTML = '';
                    await showSubplaces();
                };

                await showSubplaces();
                searchInput.addEventListener('input', applySearchFilter);
            } catch (e) {
                subplacesContainer.innerHTML = DOMPurify.sanitize(
                    `<p style="grid-column: 1 / -1; padding: 20px;">${await t('subplaces.failedToLoad')}</p>`,
                );
            }
        };

        const checkUrl = () => {
            if (window.location.hash.includes('#!/subplaces')) {
                initData();
            }
        };

        window.addEventListener('hashchange', checkUrl);
        checkUrl();
    };

    const initializeSubplacesFeature = async (tabContainer) => {
        if (tabContainer.dataset.rovalraSubplacesInitialized === 'true') {
            return;
        }
        tabContainer.dataset.rovalraSubplacesInitialized = 'true';

        const placeId = getPlaceIdFromUrl();
        if (!placeId) {
            return;
        }

        const contentSection = document.querySelector(
            '.tab-content.rbx-tab-content',
        );
        if (!contentSection) {
            return;
        }

        document.querySelector('.tab-subplaces')?.remove();
        document.getElementById('subplaces-content-pane')?.remove();

        try {
            const universeId = await fetchUniverseId(placeId);
            if (universeId) {
                checkAndDisplaySubplaceBanner(universeId, placeId);
                createSubplacesTab(universeId, tabContainer, contentSection);
            }
        } catch (error) {
            tabContainer.dataset.rovalraSubplacesInitialized = 'false';
        }
    };

    const onTabContainerRemoved = () => {
        const oldTabContainer = document.querySelector(
            '[data-rovalra-subplaces-initialized]',
        );
        if (oldTabContainer) {
            oldTabContainer.dataset.rovalraSubplacesInitialized = 'false';
        }
    };

    if (observeElement && typeof observeElement === 'function') {
        observeElement(
            '#horizontal-tabs',
            (tabContainer) => initializeSubplacesFeature(tabContainer),
            { onRemove: onTabContainerRemoved },
        );
    }
}
