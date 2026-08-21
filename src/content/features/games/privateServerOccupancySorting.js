import { getPlaceIdFromUrl } from "../../core/idExtractor.js";
import { callRobloxApiJson } from "../../core/api.js";
import { getAuthenticatedUserId } from "../../core/user.js";

export function init() {
    let lastApiResponse;
    let cachedPrivateServers = [];
    let AllowHoistingAboveOwnPrivateServers = false;

    function updatePrivateServerOccupancySorting() {
        chrome.storage.local.get(
            [
                'PrivateServerOccupancySorting',
                'AllowHoistingAboveOwnPrivateServers',
            ],
            (data) => {
                try {
                    if (data.PrivateServerOccupancySorting) {
                        sessionStorage.setItem(
                            'rovalra_privateserveroccupancysorting',
                            'true',
                        );
                    } else {
                        sessionStorage.removeItem(
                            'rovalra_privateserveroccupancysorting',
                        );
                    }
                } catch (e) {}

                AllowHoistingAboveOwnPrivateServers =
                    data.PrivateServerOccupancySorting &&
                    data.AllowHoistingAboveOwnPrivateServers === true;

                document.dispatchEvent(
                    new CustomEvent(
                        'rovalra-private-server-occupancy-sorting',
                        {
                            detail: data.PrivateServerOccupancySorting,
                        },
                    ),
                );
            },
        );
    }

    updatePrivateServerOccupancySorting();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (
            namespace === 'local' &&
            (changes.PrivateServerOccupancySorting ||
                changes.AllowHoistingAboveOwnPrivateServers)
        ) {
            updatePrivateServerOccupancySorting();
        }
    });

    document.addEventListener(
        'rovalra-private-server-occupancy-sorting_request-transform',
        async (e) => {
            let sendData = (success, data) => document.dispatchEvent(
                new CustomEvent(
                    `rovalra-nonce-${nonce}`, {
                        detail: {
                            success: success,
                            data: data,
                        },
                    },
                ),
            );

            let nonce = e.detail.nonce;
            let url = e.detail.url;

            if (!nonce) {
                return;
            }

            if (!url) {
                sendData(false);
            }

            try {
                let URLObject = new URL(url);
                let targetGame = getPlaceIdFromUrl(url);

                let limit = URLObject.searchParams.get('limit');
                limit = limit ? parseInt(limit) : 10;
                let cursor = URLObject.searchParams.get('cursor');
                cursor = cursor ? parseInt(cursor) : 0;

                if (isNaN(limit) || isNaN(cursor)) {
                    sendData(false);
                    return;
                };

                URLObject.searchParams.set('limit', '100');

                if (cachedPrivateServers.length == 0 || cursor == 0) {
                    let workingSet = [];
                    let nextPage = '';

                    do {
                        URLObject.searchParams.set('cursor', nextPage);

                        lastApiResponse = await callRobloxApiJson({
                            subdomain: 'games',
                            endpoint: `/v1/games/${targetGame}/private-servers${URLObject.search}`,
                        });

                        workingSet = workingSet.concat(lastApiResponse.data);
                        nextPage = lastApiResponse.nextPageCursor;
                    } while (nextPage);

                    workingSet.sort((a, b) => b.playing - a.playing);

                    if (!AllowHoistingAboveOwnPrivateServers) {
                        let userId = await getAuthenticatedUserId();

                        let ownServers = [];

                        for (let i = 0; i < workingSet.length; i++) {
                            let e = workingSet[i];

                            if (e.owner.id == userId) {
                                ownServers.push(workingSet.splice(i, 1)[0]);
                                i--;
                            }
                        }

                        workingSet.unshift(...ownServers);
                    }

                    cachedPrivateServers = workingSet;
                }

                let response = lastApiResponse;

                Object.assign(response, {
                    previousPageCursor: cursor > 0 ?
                        Math.max(
                            cursor - limit,
                            0,
                        ).toString() :
                        null,
                    nextPageCursor: cursor < cachedPrivateServers.length - limit ?
                        Math.min(
                            cursor + limit,
                            cachedPrivateServers.length,
                        ).toString() :
                        null,
                    data: cachedPrivateServers.slice(cursor, cursor + limit),
                });

                sendData(true, response);
            } catch (e) {   
                sendData(false);
            }
        }
    );
}
