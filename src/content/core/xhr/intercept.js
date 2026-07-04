(function() {
    'use strict';

    if (window.__ROVALRA_INTERCEPTOR_SETUP__) {
        return;
    }
    window.__ROVALRA_INTERCEPTOR_SETUP__ = true;

    const CATALOG_API_URL =
        'https://catalog.roblox.com/v1/catalog/items/details';
    const CLIENT_STATUS_API_URL =
        'https://apis.roblox.com/matchmaking-api/v1/client-status';
    const GAME_LAUNCH_SUCCESS_URL =
        'https://metrics.roblox.com/v1/games/report-event';
    const GAME_SERVERS_API_URL = 'https://games.roblox.com/v1/games/';
    const GAMES_ROBLOX_API = 'https://games.roblox.com/';
    const TRADES_API_URL = 'https://trades.roblox.com/v2/users/';
    const TRADES_LIST_API_URL = 'https://trades.roblox.com/v1/trades/';
    const OMNI_RECOMMENDATION_API_URL =
        'https://apis.roblox.com/discovery-api/omni-recommendation';
    const FRIEND_CAROUSEL_TOPIC_ID = 600000000;
    const FRIEND_CAROUSEL_TREATMENT_TYPE = 'FriendCarousel';

    let ASSET_TYPE_ACCESSORIES = [8, 41, 42, 43, 44, 45, 46, 47, 57, 58];
    let ASSET_TYPE_LAYERED = [64, 65, 66, 67, 68, 69, 70, 71, 72];

    let streamerModeEnabled = false;
    let settingsPageInfoEnabled = true;
    let accurateContinueEnabled = true;
    let accurateContinueGames = [];
    let homeLayoutOrder = [];
    let homeLayoutHidden = [];
    let homeExtraSorts = [];

    try {
        streamerModeEnabled =
            sessionStorage.getItem('rovalra_streamermode') === 'true';
        settingsPageInfoEnabled =
            sessionStorage.getItem('rovalra_settingsPageInfo') !== 'false';
        accurateContinueEnabled =
            sessionStorage.getItem('rovalra_accurateContinue') !== 'false';
        homeLayoutOrder = JSON.parse(
            sessionStorage.getItem('rovalra_homeLayoutOrder') || '[]',
        );
        homeLayoutHidden = JSON.parse(
            sessionStorage.getItem('rovalra_homeLayoutHidden') || '[]',
        );
    } catch (e) { }

    document.addEventListener('rovalra-streamer-mode', (e) => {
        if (typeof e.detail === 'object') {
            streamerModeEnabled = e.detail.enabled === true;
            settingsPageInfoEnabled = e.detail.settingsPageInfo !== false;
        } else {
            streamerModeEnabled = e.detail === true;
        }
    });

    document.addEventListener('rovalra-accurate-continue', (e) => {
        if (e.detail) {
            accurateContinueEnabled = e.detail.enabled !== false;
            accurateContinueGames = Array.isArray(e.detail.games)
                ? e.detail.games
                : [];
        }
    });

    document.addEventListener('rovalra-home-layout', (e) => {
        homeLayoutOrder = Array.isArray(e.detail?.order) ? e.detail.order : [];
        homeLayoutHidden = Array.isArray(e.detail?.hidden)
            ? e.detail.hidden
            : [];
        try {
            sessionStorage.setItem(
                'rovalra_homeLayoutOrder',
                JSON.stringify(homeLayoutOrder),
            );
            sessionStorage.setItem(
                'rovalra_homeLayoutHidden',
                JSON.stringify(homeLayoutHidden),
            );
        } catch (error) { }
    });

    document.addEventListener('rovalra-home-extra-sorts', (e) => {
        homeExtraSorts = Array.isArray(e.detail?.sorts) ? e.detail.sorts : [];
    });

    function getRequestUrl(url) {
        if (typeof url === 'string') return url;
        if (url instanceof Request) return url.url;
        return '';
    }

    function getHomeSortKey(sort) {
        if (!sort || typeof sort !== 'object') return '';
        if (sort.topicId !== undefined && sort.topicId !== null) {
            return `topicId:${sort.topicId}`;
        }
        if (sort.topic) return `topic:${sort.topic}`;
        return '';
    }

    function isFriendCarouselSort(sort) {
        return (
            sort?.topicId === FRIEND_CAROUSEL_TOPIC_ID &&
            sort?.treatmentType === FRIEND_CAROUSEL_TREATMENT_TYPE
        );
    }

    function dispatchHomeLayoutCategories(data) {
        if (data?.pageType !== 'Home' || !Array.isArray(data.sorts)) return;

        const seenKeys = new Set();
        const categories = data.sorts
            .map((sort) => ({
                key: getHomeSortKey(sort),
                topic: sort?.topic || 'Untitled',
                topicId: sort?.topicId ?? null,
                treatmentType: sort?.treatmentType || '',
            }))
            .filter((category) => {
                if (!category.key || seenKeys.has(category.key)) return false;

                seenKeys.add(category.key);
                return true;
            });

        if (!categories.length) return;

        document.dispatchEvent(
            new CustomEvent('rovalra-home-layout-categories', {
                detail: { categories },
            }),
        );
    }

    function findHomeEventTileIndex(sorts) {
        return sorts.findIndex(
            (sort) => sort?.topicLayoutData?.componentType === 'EventTile',
        );
    }

    function addHomeExtraSorts(data) {
        if (
            data?.pageType !== 'Home' ||
            !Array.isArray(data.sorts) ||
            !Array.isArray(homeExtraSorts) ||
            !homeExtraSorts.length
        ) {
            return false;
        }

        const existingKeys = new Set(data.sorts.map(getHomeSortKey));
        let insertionIndex = findHomeEventTileIndex(data.sorts);
        let changed = false;

        homeExtraSorts.forEach((sort) => {
            const sortCopy = { ...sort };
            const key = getHomeSortKey(sortCopy);

            if (!key || existingKeys.has(key)) {
                return;
            }

            if (Array.isArray(sortCopy.games)) {
                if (!data.contentMetadata) {
                    data.contentMetadata = {};
                }
                if (!data.contentMetadata.Game) {
                    data.contentMetadata.Game = {};
                }

                if (!Array.isArray(data.games)) data.games = [];
                const existingGameIds = new Set(
                    data.games.map((g) => g.universeId),
                );

                sortCopy.games.forEach((game) => {
                    const uId = game.universeId;
                    if (!uId) return;
                    const uIdStr = String(uId);

                    data.contentMetadata.Game[uIdStr] = {
                        ...(data.contentMetadata.Game[uIdStr] || {}),
                        ...game,
                    };

                    if (!existingGameIds.has(uId)) {
                        data.games.push(game);
                        existingGameIds.add(uId);
                    }
                });

                delete sortCopy.games;
            }

            if (insertionIndex === -1) {
                data.sorts.push(sortCopy);
            } else {
                data.sorts.splice(insertionIndex, 0, sortCopy);
                insertionIndex += 1;
            }
            existingKeys.add(key);
            changed = true;
        });

        return changed;
    }

    function getEffectiveHomeLayoutOrder(sorts) {
        const order = homeLayoutOrder.map(String);
        const orderedKeys = new Set(order);
        const sortKeys = new Set(sorts.map(getHomeSortKey));
        const missingExtraKeys = homeExtraSorts
            .map(getHomeSortKey)
            .filter((key) => key && sortKeys.has(key) && !orderedKeys.has(key));

        if (!missingExtraKeys.length) return order;

        const eventTileIndex = findHomeEventTileIndex(sorts);
        const eventTileKey =
            eventTileIndex === -1 ? '' : getHomeSortKey(sorts[eventTileIndex]);
        const insertionIndex = eventTileKey ? order.indexOf(eventTileKey) : -1;

        if (insertionIndex === -1) return [...order, ...missingExtraKeys];

        return [
            ...order.slice(0, insertionIndex),
            ...missingExtraKeys,
            ...order.slice(insertionIndex),
        ];
    }

    function reorderHomeSorts(data) {
        if (
            !Array.isArray(homeLayoutOrder) ||
            !homeLayoutOrder.length ||
            data?.pageType !== 'Home' ||
            !Array.isArray(data.sorts)
        ) {
            return false;
        }

        const effectiveOrder = getEffectiveHomeLayoutOrder(data.sorts);
        const orderMap = new Map(
            effectiveOrder.map((key, index) => [String(key), index]),
        );
        const originalIndexMap = new Map(
            data.sorts.map((sort, index) => [sort, index]),
        );

        data.sorts.sort((a, b) => {
            const aIndex = orderMap.get(getHomeSortKey(a));
            const bIndex = orderMap.get(getHomeSortKey(b));
            const aHasOrder = aIndex !== undefined;
            const bHasOrder = bIndex !== undefined;

            if (aHasOrder && bHasOrder) return aIndex - bIndex;
            if (aHasOrder) return -1;
            if (bHasOrder) return 1;

            return originalIndexMap.get(a) - originalIndexMap.get(b);
        });

        return true;
    }

    function applyAccurateContinue(data) {
        if (
            !accurateContinueEnabled ||
            !accurateContinueGames.length ||
            data?.pageType !== 'Home' ||
            !Array.isArray(data.sorts)
        ) {
            return false;
        }

        const continueSort = data.sorts.find((s) => s.topicId === 100000003);
        if (!continueSort) return false;

        continueSort.recommendationList = accurateContinueGames.map((game) => ({
            contentType: 'Game',
            contentId: game.universeId,
            contentStringId: '',
            contentMetadata: {},
            analyticsData: {},
        }));

        if (!data.contentMetadata) data.contentMetadata = {};
        if (!data.contentMetadata.Game) data.contentMetadata.Game = {};
        if (!Array.isArray(data.games)) data.games = [];

        const existingGameIds = new Set(data.games.map((g) => g.universeId));

        accurateContinueGames.forEach((game) => {
            const uId = game.universeId;
            if (!uId) return;
            const uIdStr = String(uId);

            data.contentMetadata.Game[uIdStr] = {
                ...(data.contentMetadata.Game[uIdStr] || {}),
                ...game,
                universeId: uId,
            };

            if (!existingGameIds.has(uId)) {
                data.games.push(game);
                existingGameIds.add(uId);
            }
        });

        if (!continueSort.treatmentType) {
            continueSort.treatmentType = 'Carousel';
        }

        continueSort.numberOfRows = 1;

        return true;
    }

    function hideHomeSorts(data) {
        if (
            !Array.isArray(homeLayoutHidden) ||
            !homeLayoutHidden.length ||
            data?.pageType !== 'Home' ||
            !Array.isArray(data.sorts)
        ) {
            return false;
        }

        const hiddenKeys = new Set(homeLayoutHidden.map(String));
        const previousLength = data.sorts.length;
        data.sorts = data.sorts.filter(
            (sort) =>
                isFriendCarouselSort(sort) ||
                !hiddenKeys.has(getHomeSortKey(sort)),
        );

        return data.sorts.length !== previousLength;
    }

    async function applyHomeLayoutToFetchResponse(url, response) {
        if (!url.includes(OMNI_RECOMMENDATION_API_URL)) {
            return response;
        }

        try {
            const data = await response.clone().json();
            const addedExtraSorts = addHomeExtraSorts(data);
            const accurateContinue = applyAccurateContinue(data);
            dispatchHomeLayoutCategories(data);
            const hiddenSorts = hideHomeSorts(data);
            const reorderedSorts = reorderHomeSorts(data);
            if (
                !addedExtraSorts &&
                !hiddenSorts &&
                !reorderedSorts &&
                !accurateContinue
            ) {
                return response;
            }

            const newHeaders = new Headers(response.headers);
            newHeaders.delete('content-length');

            return new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders,
            });
        } catch (error) {
            return response;
        }
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url] = args;
        const requestUrl = getRequestUrl(url);

        let response = await originalFetch(...args);

        if (
            streamerModeEnabled &&
            settingsPageInfoEnabled &&
            typeof requestUrl === 'string'
        ) {
            const isSensitive = [
                '/my/settings/json',
                'accountinformation.roblox.com/v1/phone',
                'users.roblox.com/v1/birthdate',
                'apis.roblox.com/age-verification-service/v1/age-verification/verified-age',
                'accountsettings.roblox.com/v1/account/settings/account-country',
                'apis.roblox.com/user-settings-api/v1/account-insights/age-group',
                'apis.roblox.com/token-metadata-service/v1/sessions',
            ].some((path) => requestUrl.includes(path));

            if (isSensitive && location.hostname != "create.roblox.com") {
                try {
                    const clone = response.clone();
                    const data = await clone.json();

                    if (requestUrl.includes('/my/settings/json')) {
                        data.UserEmail = 'RoValra Streamer Mode Enabled';
                        data.UserEmailVerified = true;
                    }
                    if (requestUrl.includes('v1/phone')) {
                        data.phone =
                            data.prefix =
                            data.countryCode =
                            'RoValra Streamer Mode Enabled';
                    }
                    if (requestUrl.includes('v1/birthdate')) {
                        data.birthMonth = data.birthDay = data.birthYear = 0;
                    }
                    if (requestUrl.includes('verified-age')) {
                        data.verifiedAge = 0;
                        data.isSeventeenPlus = false;
                    }
                    if (requestUrl.includes('account-country') && data.value) {
                        data.value.countryName = data.value.localizedName =
                            'RoValra Streamer Mode Enabled';
                        data.value.countryId = 1;
                    }
                    if (requestUrl.includes('age-group')) {
                        data.ageGroupTranslationKey =
                            'RoValra Streamer Mode Enabled';
                    }
                    if (requestUrl.includes('sessions') && data.sessions) {
                        data.sessions.forEach((s) => {
                            if (s.location) {
                                s.location.city = s.location.subdivision = '';
                                s.location.subdivision = '';
                                s.location.country =
                                    'To view your sessions please disable "RoValra streamer mode"';
                            }
                            if (s.agent) {
                                s.agent.os = 'RoValra streamer mode enabled';
                                s.agent.type = 'App';
                            }
                            s.lastAccessedIp = 'Hidden';
                            s.lastAccessedTimestampEpochMilliseconds = '0';
                        });
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.delete('content-length');
                    response = new Response(JSON.stringify(data), {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                } catch (e) { }
            }
        }

        response = await applyHomeLayoutToFetchResponse(requestUrl, response);

        if (typeof requestUrl === 'string') {
            if (requestUrl.includes(CATALOG_API_URL)) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        window.dispatchEvent(
                            new CustomEvent('rovalra-catalog-details', {
                                detail: d,
                            }),
                        ),
                    )
                    .catch(() => { });
            }
            if (requestUrl.includes(CATALOG_API_URL)) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        document.dispatchEvent(
                            new CustomEvent(
                                'rovalra-catalog-details-response',
                                { detail: d },
                            ),
                        ),
                    )
                    .catch(() => { });
            }
            if (requestUrl.includes(CLIENT_STATUS_API_URL)) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        document.dispatchEvent(
                            new CustomEvent('rovalra-client-status-response', {
                                detail: d,
                            }),
                        ),
                    )
                    .catch(() => { });
            }
            if (
                requestUrl.includes(GAME_LAUNCH_SUCCESS_URL) &&
                requestUrl.includes('GameLaunchSuccessWeb_Win32')
            ) {
                document.dispatchEvent(
                    new CustomEvent('rovalra-game-launch-success', {
                        detail: { url: requestUrl },
                    }),
                );
            }
            if (
                requestUrl.includes(GAME_SERVERS_API_URL) &&
                requestUrl.includes('/servers/')
            ) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        document.dispatchEvent(
                            new CustomEvent('rovalra-game-servers-response', {
                                detail: { url: requestUrl, data: d },
                            }),
                        ),
                    )
                    .catch(() => { });
            }
            if (
                requestUrl.includes(GAMES_ROBLOX_API) &&
                requestUrl.includes('/media')
            ) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        document.dispatchEvent(
                            new CustomEvent('rovalra-game-media-response', {
                                detail: d,
                            }),
                        ),
                    )
                    .catch(() => { });
            }
            if (
                requestUrl.includes(TRADES_API_URL) &&
                requestUrl.includes('/tradableitems')
            ) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        document.dispatchEvent(
                            new CustomEvent('rovalra-tradable-items-response', {
                                detail: d,
                            }),
                        ),
                    )
                    .catch(() => { });
            }
            if (requestUrl.includes(TRADES_LIST_API_URL)) {
                response
                    .clone()
                    .json()
                    .then((d) =>
                        document.dispatchEvent(
                            new CustomEvent('rovalra-trades-list-response', {
                                detail: d,
                            }),
                        ),
                    )
                    .catch(() => { });
            }
        }

        return response;
    };

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._rovalra_url = url;
        this._rovalra_method = method;

        if (
            streamerModeEnabled &&
            typeof url === 'string' &&
            settingsPageInfoEnabled &&
            location.hostname != "create.roblox.com"
        ) {
            if (url.includes('/my/settings/json'))
                this._rovalra_spoof_settings = true;
            if (url.includes('/v1/emails')) this._rovalra_email_settings = true;
            if (url.includes('v1/phone')) this._rovalra_spoof_phone = true;
            if (url.includes('v1/birthdate'))
                this._rovalra_spoof_birthdate = true;
            if (url.includes('verified-age')) this._rovalra_spoof_age = true;
            if (url.includes('account-country'))
                this._rovalra_spoof_country = true;
            if (url.includes('age-group')) this._rovalra_spoof_age_group = true;
            if (url.includes('sessions')) this._rovalra_spoof_sessions = true;
        }

        if (
            typeof url === 'string' &&
            url.includes(OMNI_RECOMMENDATION_API_URL)
        ) {
            this._rovalra_home_layout = true;
        }

        return originalXhrOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        const xhr = this;
        if (
            xhr._rovalra_spoof_settings ||
            xhr._rovalra_spoof_phone ||
            xhr._rovalra_spoof_birthdate ||
            xhr._rovalra_spoof_age ||
            xhr._rovalra_spoof_country ||
            xhr._rovalra_spoof_age_group ||
            xhr._rovalra_spoof_sessions ||
            xhr._rovalra_home_layout
        ) {
            Object.defineProperty(xhr, 'responseText', {
                configurable: true,
                get: function() {
                    if (xhr._rovalra_cached_response)
                        return xhr._rovalra_cached_response;

                    const descriptor = Object.getOwnPropertyDescriptor(
                        XMLHttpRequest.prototype,
                        'responseText',
                    );
                    const original = descriptor.get.call(this);

                    if (this.readyState !== 4) return original;

                    try {
                        const data = JSON.parse(original);
                        if (xhr._rovalra_home_layout) {
                            addHomeExtraSorts(data);
                            dispatchHomeLayoutCategories(data);
                            hideHomeSorts(data);
                            applyAccurateContinue(data);
                            reorderHomeSorts(data);
                        }
                        if (xhr._rovalra_spoof_settings) {
                            data.UserEmail = 'RoValra Streamer Mode Enabled';
                            data.UserEmailVerified = true;
                            data.PreviousUserNames =
                                'RoValra Streamer Mode Enabled';
                            data.UserEmailMasked = false;
                        }
                        if (xhr._rovalra_email_settings) {
                            data.verifiedEmail =
                                'RoValra Streamer Mode Enabled';
                        }
                        if (xhr._rovalra_spoof_phone) {
                            data.countryCode =
                                data.prefix =
                                data.phone =
                                'RoValra Streamer Mode Enabled';
                        }
                        if (xhr._rovalra_spoof_birthdate) {
                            data.birthMonth =
                                data.birthDay =
                                data.birthYear =
                                0;
                        }
                        if (xhr._rovalra_spoof_age) {
                            data.isVerified = true;
                            data.verifiedAge = 0;
                            data.isSeventeenPlus = false;
                        }
                        if (xhr._rovalra_spoof_country && data.value) {
                            data.value.countryName = data.value.localizedName =
                                'RoValra Streamer Mode Enabled';
                            data.value.countryId = 1;
                        }
                        if (xhr._rovalra_spoof_age_group) {
                            data.ageGroupTranslationKey =
                                'RoValra Streamer Mode Enabled';
                        }
                        if (xhr._rovalra_spoof_sessions && data.sessions) {
                            data.sessions.forEach((s) => {
                                if (s.location) {
                                    s.location.city = s.location.subdivision =
                                        '';
                                    s.location.country =
                                        'To view your sessions please disable "RoValra streamer mode"';
                                }
                                if (s.agent) {
                                    s.agent.os =
                                        'RoValra streamer mode enabled';
                                    s.agent.type = 'App';
                                }
                                s.lastAccessedIp = 'Hidden';
                                s.lastAccessedTimestampEpochMilliseconds = '0';
                            });
                        }
                        xhr._rovalra_cached_response = JSON.stringify(data);
                        return xhr._rovalra_cached_response;
                    } catch (e) {
                        return original;
                    }
                },
            });

            Object.defineProperty(xhr, 'response', {
                configurable: true,
                get: function() {
                    if (this.responseType === 'json') {
                        try {
                            return JSON.parse(this.responseText);
                        } catch (e) {
                            return Object.getOwnPropertyDescriptor(
                                XMLHttpRequest.prototype,
                                'response',
                            ).get.call(this);
                        }
                    }
                    return this.responseText;
                },
            });
        }

        xhr.addEventListener('load', function() {
            if (typeof xhr._rovalra_url === 'string') {
                const triggerEvent = (eventName, detail) =>
                    document.dispatchEvent(
                        new CustomEvent(eventName, { detail }),
                    );
                try {
                    const url = xhr._rovalra_url;
                    if (url.includes(CATALOG_API_URL))
                        window.dispatchEvent(
                            new CustomEvent('rovalra-catalog-details', {
                                detail: JSON.parse(xhr.responseText),
                            }),
                        );
                    if (url.includes(CATALOG_API_URL))
                        triggerEvent(
                            'rovalra-catalog-details-response',
                            JSON.parse(xhr.responseText),
                        );
                    if (url.includes(CLIENT_STATUS_API_URL))
                        triggerEvent(
                            'rovalra-client-status-response',
                            JSON.parse(xhr.responseText),
                        );
                    if (
                        url.includes(GAME_SERVERS_API_URL) &&
                        url.includes('/servers/')
                    )
                        triggerEvent('rovalra-game-servers-response', {
                            url,
                            data: JSON.parse(xhr.responseText),
                        });
                    if (
                        url.includes(GAMES_ROBLOX_API) &&
                        url.includes('/media')
                    )
                        triggerEvent(
                            'rovalra-game-media-response',
                            JSON.parse(xhr.responseText),
                        );
                    if (
                        url.includes(TRADES_API_URL) &&
                        url.includes('/tradableitems')
                    )
                        triggerEvent(
                            'rovalra-tradable-items-response',
                            JSON.parse(xhr.responseText),
                        );
                    if (url.includes(TRADES_LIST_API_URL))
                        triggerEvent(
                            'rovalra-trades-list-response',
                            JSON.parse(xhr.responseText),
                        );
                } catch (e) { }
            }
        });

        return originalXhrSend.apply(this, args);
    };

    let multiAccessoryEnabled = false;

    document.addEventListener('rovalra-multi-equip', (e) => {
        if (e.detail) {
            if (typeof e.detail.enabled === 'boolean') {
                multiAccessoryEnabled = e.detail.enabled;
            }
            if (Array.isArray(e.detail.accessories)) {
                ASSET_TYPE_ACCESSORIES = e.detail.accessories;
            }
            if (Array.isArray(e.detail.layered)) {
                ASSET_TYPE_LAYERED = e.detail.layered;
            }
        }
    });

    const patchAvatarService = (service) => {
        if (!service || service.__rovalra_patched) return;
        service.__rovalra_patched = true;

        const originalGetLimit = service.getAdvancedAccessoryLimit;
        service.getAdvancedAccessoryLimit = function(assetTypeId, ...args) {
            if (multiAccessoryEnabled) {
                const id = Number(assetTypeId);
                if (
                    ASSET_TYPE_ACCESSORIES.includes(id) ||
                    ASSET_TYPE_LAYERED.includes(id)
                ) {
                    return 100;
                }
            }
            return originalGetLimit
                ? originalGetLimit.call(this, assetTypeId, ...args)
                : 10;
        };

        const originalAddAsset = service.addAssetToAvatar;
        service.addAssetToAvatar = function(asset, currentAssets) {
            if (!multiAccessoryEnabled) {
                return originalAddAsset.apply(this, arguments);
            }

            const robloxResult = originalAddAsset.apply(this, arguments);

            const newAssetList = robloxResult.filter((item) => {
                const typeId = item?.assetType?.id;
                return (
                    !ASSET_TYPE_ACCESSORIES.includes(typeId) &&
                    !ASSET_TYPE_LAYERED.includes(typeId)
                );
            });

            const potentialAssets = [asset, ...currentAssets];
            const uniqueMultiEquipAssets = [];
            const seenIds = new Set();

            for (const item of potentialAssets) {
                if (item && item.id && !seenIds.has(item.id)) {
                    const typeId = item?.assetType?.id;
                    if (
                        ASSET_TYPE_ACCESSORIES.includes(typeId) ||
                        ASSET_TYPE_LAYERED.includes(typeId)
                    ) {
                        uniqueMultiEquipAssets.push(item);
                        seenIds.add(item.id);
                    }
                }
            }

            const counts = { accessory: 0, layered: 0 };
            const limits = { accessory: 10, layered: 10 };

            for (const item of uniqueMultiEquipAssets) {
                const typeId = item?.assetType?.id;
                if (ASSET_TYPE_ACCESSORIES.includes(typeId)) {
                    if (counts.accessory < limits.accessory) {
                        newAssetList.push(item);
                        counts.accessory++;
                    }
                } else if (ASSET_TYPE_LAYERED.includes(typeId)) {
                    if (counts.layered < limits.layered) {
                        newAssetList.push(item);
                        counts.layered++;
                    }
                }
            }

            return newAssetList;
        };

        console.log('RoValra: Multi-Accessory patch applied.');
    };

    const initializeHooks = () => {
        let robloxObj = window.Roblox;

        const defineServiceProperty = (obj) => {
            let serviceObj = obj.AvatarAccoutrementService;
            if (serviceObj) patchAvatarService(serviceObj);

            Object.defineProperty(obj, 'AvatarAccoutrementService', {
                configurable: true,
                enumerable: true,
                get: () => serviceObj,
                set: (val) => {
                    serviceObj = val;
                    patchAvatarService(val);
                },
            });
        };

        if (robloxObj) {
            defineServiceProperty(robloxObj);
        } else {
            Object.defineProperty(window, 'Roblox', {
                configurable: true,
                enumerable: true,
                get: () => robloxObj,
                set: (val) => {
                    robloxObj = val;
                    if (val && typeof val === 'object') {
                        defineServiceProperty(val);
                    }
                },
            });
        }
    };

    initializeHooks();

    console.log(
        'RoValra: Privacy Spoofing and Multi-Accessory loaded successfully.',
    );
})();
