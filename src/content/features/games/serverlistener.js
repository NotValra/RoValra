import { callRobloxApi } from '../../core/api.js';
import { fetchServerRegion } from '../../core/apis/serverApi.js';
import { getValidAccessToken } from '../../core/oauth/oauth.js';
import { settings } from '../../core/settings/getSettings.js';

let isInitialized = false;
const capturedServerData = {};
const sentServerIds = new Map();
const ROBLOX_SERVER_URL_PATTERN =
    /^https:\/\/games\.roblox\.com\/v\d+\/games\/(\d+)\/servers\/Public(?:\?|$)/;

const MAX_SERVERS_PER_SUBMIT = 100;
const SUBMIT_INTERVAL_MS = 2500;
const RESOLVE_DELAY_MS = 1500;
const SUBMIT_FLUSH_DELAY_MS = 3000;

const CHECK_INTERVAL_MS = 60 * 1000;
const CHECK_TICK_MS = 15 * 1000;
const CHECK_CONCURRENCY = 4;
const CHECK_LEASE_BUFFER_MS = 15 * 1000;
const CHECK_MAX_RUN_MS = 150 * 1000;
const CHECK_LOCK_KEY = 'rovalraCrowdCheckLock';
const CHECK_RUN_KEY = 'rovalraCrowdCheckRun';
const CHECK_HEARTBEAT_MS = 3 * 1000;
const CHECK_STALE_MS = 10 * 1000;
const GAMEJOIN_FULL_STATUS = 22;

const resolveQueue = [];
let isResolving = false;
const pendingReports = new Map();
let isSubmitting = false;
let isChecking = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildReport(serverId, joinScript) {
    if (!joinScript || typeof joinScript !== 'object') return null;
    if (
        joinScript.GameId &&
        String(joinScript.GameId).toLowerCase() !== serverId.toLowerCase()
    ) {
        return null;
    }

    const ip =
        joinScript.UdmuxEndpoints?.[0]?.Address ||
        joinScript.ServerConnections?.[0]?.Address ||
        null;
    const datacenterId = Number(joinScript.DataCenterId);
    const placeVersion = Number(joinScript.PlaceVersion);
    if (!ip || !Number.isInteger(datacenterId) || datacenterId <= 0)
        return null;
    if (!Number.isInteger(placeVersion) || placeVersion <= 0) return null;

    const report = {
        server_id: serverId,
        datacenter_id: datacenterId,
        ip_address: ip,
        place_version: placeVersion,
    };
    if (typeof joinScript.ChannelName === 'string') {
        report.channel_name = joinScript.ChannelName;
    }
    if (typeof joinScript.ServerClaimedTime === 'number') {
        report.claim_time = joinScript.ServerClaimedTime;
    }
    return report;
}

async function submitPendingReports() {
    if (isSubmitting) return;
    isSubmitting = true;

    try {
        while (pendingReports.size > 0) {
            const entry = [...pendingReports.entries()].find(
                ([, reports]) =>
                    !isResolving || reports.length >= MAX_SERVERS_PER_SUBMIT,
            );
            if (!entry) break;

            const [placeId, reports] = entry;
            const servers = reports.splice(0, MAX_SERVERS_PER_SUBMIT);
            if (reports.length === 0) pendingReports.delete(placeId);

            try {
                if (await getValidAccessToken()) {
                    await callRobloxApi({
                        isRovalraApi: true,
                        useBackground: true,
                        endpoint: '/v1/auth/servers/submit',
                        method: 'POST',
                        body: { place_id: placeId, servers },
                    });
                }
            } catch (apiError) {
                console.error(apiError);
            }

            await sleep(SUBMIT_INTERVAL_MS);
        }
    } finally {
        isSubmitting = false;
    }
}

async function resolveQueuedServers() {
    if (isResolving) return;
    isResolving = true;

    try {
        await sleep(RESOLVE_DELAY_MS);
        while (resolveQueue.length > 0) {
            while (resolveQueue.length > 0) {
                const { placeId, serverId } = resolveQueue.shift();
                const info = await fetchServerRegion(placeId, serverId);
                const report = buildReport(serverId, info?.joinScript);
                if (!report) continue;

                if (!pendingReports.has(placeId)) {
                    pendingReports.set(placeId, []);
                }
                const reports = pendingReports.get(placeId);
                reports.push(report);
                if (reports.length >= MAX_SERVERS_PER_SUBMIT) {
                    submitPendingReports();
                }
            }
            await sleep(SUBMIT_FLUSH_DELAY_MS);
        }
    } finally {
        isResolving = false;
    }
    submitPendingReports();
}

async function sendToLocalAPI(placeId, serverIds) {
    if (!placeId || !serverIds || !serverIds.length) {
        return;
    }

    try {
        await callRobloxApi({
            isRovalraApi: true,
            endpoint: '/process_servers',
            method: 'POST',
            body: {
                place_id: placeId,
                server_ids: serverIds,
            },
        });
    } catch (apiError) {
        console.error(apiError);
    }
}

async function processServerData(placeId, responseData) {
    if (responseData && responseData.data && Array.isArray(responseData.data)) {
        const useLegacy = (await settings.ServerdataLegacyEnabled) !== false;

        if (!sentServerIds.has(placeId)) {
            sentServerIds.set(placeId, new Set());
        }
        const sentSet = sentServerIds.get(placeId);

        const idsToSend = [];

        responseData.data.forEach((server) => {
            capturedServerData[server.id] = server;

            if (!sentSet.has(server.id)) {
                sentSet.add(server.id);
                idsToSend.push(server.id);
            }
        });

        if (idsToSend.length === 0) return;

        if (useLegacy) {
            sendToLocalAPI(placeId, idsToSend);
            return;
        }

        idsToSend.forEach((serverId) =>
            resolveQueue.push({ placeId, serverId }),
        );
        resolveQueuedServers();
    }
}

async function checkServer(server) {
    const response = await callRobloxApi({
        subdomain: 'gamejoin',
        endpoint: '/v1/join-game-instance',
        method: 'POST',
        body: {
            placeId: parseInt(server.place_id, 10),
            gameId: server.server_id,
            isTeleport: false,
        },
    });
    if (!response.ok) {
        throw new Error(`Gamejoin failed with status ${response.status}`);
    }

    const data = await response.json();
    const status = Number.isInteger(data?.status) ? data.status : null;
    return {
        server_id: server.server_id,
        place_id: server.place_id,
        active:
            Boolean(data?.joinScript && typeof data.joinScript === 'object') ||
            status === GAMEJOIN_FULL_STATUS,
        status,
    };
}

async function getStoredRun() {
    const stored = await chrome.storage.local.get(CHECK_RUN_KEY);
    return stored[CHECK_RUN_KEY] || null;
}

function saveRun(run) {
    return chrome.storage.local.set({
        [CHECK_RUN_KEY]: { ...run, heartbeat: Date.now() },
    });
}

async function ownsRun(owner) {
    return (await getStoredRun())?.owner === owner;
}

async function finishRun(run) {
    try {
        if (run.results.length > 0 && Date.now() < run.expiresAt) {
            await callRobloxApi({
                isRovalraApi: true,
                useBackground: true,
                endpoint: '/v1/auth/servers/check-results',
                method: 'POST',
                body: { lease: run.lease, results: run.results },
            });
        }
    } finally {
        await chrome.storage.local.remove(CHECK_RUN_KEY);
        await setNextCheckAt(Date.now() + CHECK_INTERVAL_MS, run.owner);
    }
}

async function continueRun(run) {
    const checked = new Set(run.results.map((result) => result.server_id));
    const remaining = run.servers.filter(
        (server) => !checked.has(server.server_id),
    );
    const deadline = run.expiresAt - CHECK_LEASE_BUFFER_MS;
    let stopped = false;
    let lostOwnership = false;
    let saving = Promise.resolve();

    const persist = () => {
        saving = saving.then(async () => {
            if (lostOwnership) return;
            if (!(await ownsRun(run.owner))) {
                lostOwnership = stopped = true;
                return;
            }
            await saveRun(run);
        });
        return saving;
    };

    const heartbeat = setInterval(persist, CHECK_HEARTBEAT_MS);
    const worker = async () => {
        while (!stopped && remaining.length > 0 && Date.now() < deadline) {
            const server = remaining.shift();
            try {
                run.results.push(await checkServer(server));
                await persist();
            } catch {
                stopped = true;
            }
        }
    };

    try {
        await Promise.all(
            Array.from({ length: CHECK_CONCURRENCY }, () => worker()),
        );
    } finally {
        clearInterval(heartbeat);
    }
    await saving;

    if (!lostOwnership) {
        await finishRun(run);
    }
}

async function startRun(owner) {
    const batchResponse = await callRobloxApi({
        isRovalraApi: true,
        useBackground: true,
        endpoint: '/v1/auth/servers/check-batch',
        method: 'GET',
    });
    const batch = await batchResponse.json();
    if (batch?.status !== 'success' || !batch.lease) {
        await setNextCheckAt(Date.now() + CHECK_INTERVAL_MS, owner);
        return;
    }

    const run = {
        owner,
        lease: batch.lease,
        expiresAt: Date.now() + (batch.expires_in || 120) * 1000,
        servers: Array.isArray(batch.servers) ? batch.servers : [],
        results: [],
    };
    await saveRun(run);
    await continueRun(run);
}

async function resumeStoredRun(owner) {
    const run = await getStoredRun();
    if (!run) return false;
    if (run.owner !== owner && Date.now() - run.heartbeat < CHECK_STALE_MS) {
        return true;
    }

    await saveRun({ ...run, owner });
    await sleep(500 + Math.random() * 500);
    const claimed = await getStoredRun();
    if (claimed?.owner !== owner) return true;

    await continueRun(claimed);
    return true;
}

function setNextCheckAt(nextAt, owner) {
    return chrome.storage.local.set({ [CHECK_LOCK_KEY]: { nextAt, owner } });
}

async function claimActivityCheck(owner) {
    const stored = await chrome.storage.local.get(CHECK_LOCK_KEY);
    if (Date.now() < (stored[CHECK_LOCK_KEY]?.nextAt || 0)) return false;

    await setNextCheckAt(Date.now() + CHECK_MAX_RUN_MS, owner);
    await sleep(500 + Math.random() * 500);
    const confirmed = await chrome.storage.local.get(CHECK_LOCK_KEY);
    return confirmed[CHECK_LOCK_KEY]?.owner === owner;
}

const tabOwner = crypto.randomUUID();

async function activityCheckTick() {
    if (isChecking) return;
    isChecking = true;

    try {
        if ((await settings.ServerdataLegacyEnabled) !== false) return;
        if (!(await getValidAccessToken())) return;
        if (await resumeStoredRun(tabOwner)) return;
        if (!(await claimActivityCheck(tabOwner))) return;
        await startRun(tabOwner);
    } catch (error) {
        console.error(error);
    } finally {
        isChecking = false;
    }
}

async function releaseRunOnLeave() {
    const run = await getStoredRun();
    if (run?.owner === tabOwner) {
        await chrome.storage.local.set({
            [CHECK_RUN_KEY]: { ...run, heartbeat: 0 },
        });
    }
}

export function init() {
    if (isInitialized) return;

    chrome.storage.local.get({ ServerdataEnabled: true }, function (settings) {
        if (!settings.ServerdataEnabled) return;

        isInitialized = true;

        document.addEventListener('rovalra-game-servers-response', (event) => {
            if (!event.detail) return;

            const { url, data } = event.detail;

            const matches = url ? url.match(ROBLOX_SERVER_URL_PATTERN) : null;

            if (matches && matches[1]) {
                const placeId = matches[1];
                processServerData(placeId, data);
            }
        });

        window.addEventListener('rovalra:getServerDataRequest', (event) => {
            if (event.detail && event.detail.gameId) {
                const gameId = event.detail.gameId;
                const serverInfo = capturedServerData[gameId] || null;

                window.dispatchEvent(
                    new CustomEvent('rovalra:getServerDataResponse', {
                        detail: { gameId: gameId, serverInfo: serverInfo },
                    }),
                );
            }
        });

        window.addEventListener('pagehide', releaseRunOnLeave);
        activityCheckTick();
        setInterval(activityCheckTick, CHECK_TICK_MS);
    });
}
