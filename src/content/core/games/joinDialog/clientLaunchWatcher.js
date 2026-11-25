import { callRobloxApiJson } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';
import { subscribeToPresenceUpdates } from '../../utils/trackers/servers.js';

const POLL_INTERVAL_MS = 3000;
const UNKNOWN_RETRY_MS = 1000;
const UNKNOWN_STATUS_LIMIT = 3;
const PRESENCE_IN_GAME = 2;
const PRESENCE_IN_STUDIO = 4;

export function watchClientLaunch({
    placeId,
    onLaunched,
    onClientMissing,
    onClientFound,
}) {
    const targetPlaceId = placeId ? parseInt(placeId, 10) : null;
    let stopped = false;
    let intervalId = null;
    let retryTimeoutId = null;
    let unknownStatusCount = 0;
    let clientMissing = false;
    let unsubscribePresence = null;

    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(intervalId);
        clearTimeout(retryTimeoutId);
        unsubscribePresence?.();
        document.removeEventListener(
            'rovalra-game-launch-success',
            markLaunched,
        );
    };

    function markLaunched() {
        if (stopped) return;
        stop();
        onLaunched();
    }

    const handleClientStatus = (status) => {
        if (!status || stopped) return;

        if (status === 'Unknown') {
            unknownStatusCount++;
            if (unknownStatusCount >= UNKNOWN_STATUS_LIMIT) {
                if (!clientMissing) {
                    clientMissing = true;
                    onClientMissing?.();
                }
            } else {
                retryTimeoutId = setTimeout(
                    checkClientStatus,
                    UNKNOWN_RETRY_MS,
                );
            }
            return;
        }

        unknownStatusCount = 0;
        if (clientMissing) {
            clientMissing = false;
            onClientFound?.();
        }
        if (status === 'InGame') markLaunched();
    };

    async function checkClientStatus() {
        if (stopped) return;
        try {
            const data = await callRobloxApiJson({
                subdomain: 'apis',
                endpoint: '/matchmaking-api/v1/client-status',
                method: 'GET',
                noCache: true,
            });
            handleClientStatus(data?.status);
        } catch {}
    }

    const handlePresence = (presence) => {
        if (
            presence &&
            (presence.userPresenceType === PRESENCE_IN_GAME ||
                presence.userPresenceType === PRESENCE_IN_STUDIO) &&
            (!targetPlaceId || presence.rootPlaceId === targetPlaceId)
        ) {
            markLaunched();
        }
    };

    document.addEventListener('rovalra-game-launch-success', markLaunched);

    let subscribed = false;
    unsubscribePresence = subscribeToPresenceUpdates((presence) => {
        if (subscribed) handlePresence(presence);
    });
    subscribed = true;

    getAuthenticatedUserId()
        .then((userId) => {
            if (stopped || !userId) return;

            checkClientStatus();
            intervalId = setInterval(checkClientStatus, POLL_INTERVAL_MS);
        })
        .catch(() => {});

    return stop;
}
