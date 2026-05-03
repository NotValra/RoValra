import { callRobloxApi } from '../api.js';
import { loadDatacenterMap, datacenterList } from '../regions.js';

const serverDataCache = new Map();
const serverLocations = {};
const serverUptimeBases = {};
const serverUptimeIsEstimate = {};
const serverVersionsCache = {};
let uptimeUpdateInterval = null;

export function formatUptime(seconds, isEstimate = false) {
    if (typeof seconds !== 'number' || seconds < 0) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s${isEstimate ? '~' : ''}`);

    return parts.join(' ');
}

function startUptimeLiveCounter() {
    if (uptimeUpdateInterval) return;

    uptimeUpdateInterval = setInterval(() => {
        document
            .querySelectorAll('[data-rovalra-serverid]')
            .forEach((serverEl) => {
                const serverId = serverEl.dataset.rovalraServerid;
                if (serverId && serverUptimeBases[serverId]) {
                    const currentUptime = getServerUptime(serverId);
                    const event = new CustomEvent('rovalra-uptime-update', {
                        detail: {
                            serverId,
                            uptime: currentUptime,
                            isEstimate: !!serverUptimeIsEstimate[serverId],
                        },
                    });
                    serverEl.dispatchEvent(event);
                }
            });
    }, 1000);
}

function stopUptimeLiveCounter() {
    if (uptimeUpdateInterval) {
        clearInterval(uptimeUpdateInterval);
        uptimeUpdateInterval = null;
    }
}

export function createUUID() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
}

export async function fetchServerDetails(placeId, serverIds) {
    const validIds = serverIds.filter((id) => id && id !== 'null');
    if (!validIds.length) return { servers: [] };

    try {
        const response = await callRobloxApi({
            subdomain: 'apis',
            endpoint: `/v1/servers/details?place_id=${placeId}&server_ids=${validIds.join(',')}`,
            method: 'GET',
            isRovalraApi: true,
        });

        if (!response.ok) throw new Error('API Error');
        const data = await response.json();

        if (data.status !== 'success' || !data.servers)
            throw new Error('Invalid API Data');

        const now = Date.now();
        const processedServers = data.servers
            .map((info) => {
                const {
                    server_id,
                    first_seen,
                    place_version,
                    city,
                    region,
                    country,
                    ip_address,
                    datacenter_id,
                } = info;

                if (!server_id) return null;

                let regionStr = null;
                const locParts = [
                    city,
                    region && region !== city ? region : null,
                    country,
                ].filter((p) => p && p !== 'Unknown');
                if (locParts.length) {
                    regionStr = [...new Set(locParts)].join(', ');
                    serverLocations[server_id] = regionStr;
                }

                if (place_version)
                    serverVersionsCache[server_id] = place_version;

                if (first_seen) {
                    const date = new Date(
                        first_seen.endsWith('Z')
                            ? first_seen
                            : first_seen + 'Z',
                    );
                    if (!isNaN(date)) {
                        const firstSeenTimestamp = date.getTime();
                        const apiUptime = Math.max(
                            0,
                            (now - firstSeenTimestamp) / 1000,
                        );

                        const existingBase = serverUptimeBases[server_id];

                        if (
                            !existingBase ||
                            firstSeenTimestamp < existingBase
                        ) {
                            serverUptimeBases[server_id] = firstSeenTimestamp;
                            serverUptimeIsEstimate[server_id] = true;

                            startUptimeLiveCounter();
                        }
                    }
                }

                return {
                    serverId: server_id,
                    placeVersion: place_version,
                    uptime: getServerUptime(server_id),
                    isEstimate: !!serverUptimeIsEstimate[server_id],
                    region: regionStr,
                    ipAddress: ip_address,
                    datacenterId: datacenter_id,
                    city,
                    regionName: region,
                    country,
                };
            })
            .filter(Boolean);

        return { servers: processedServers };
    } catch (e) {
        console.error('Failed to fetch server details:', e);
        const defaultServers = validIds.map((id) => ({
            serverId: id,
            placeVersion: null,
            uptime: getServerUptime(id) ?? 60,
            isEstimate: !!serverUptimeIsEstimate[id],
            region: null,
            ipAddress: null,
            datacenterId: null,
            city: null,
            regionName: null,
            country: null,
        }));
        return { servers: defaultServers };
    }
}

export async function fetchServerRegion(placeId, serverId, options = {}) {
    try {
        const endpoint = options.isPrivate
            ? '/v1/join-private-game'
            : '/v1/join-game-instance';
        const body = options.isPrivate
            ? {
                  placeId: parseInt(placeId),
                  accessCode: options.accessCode,
                  gameJoinAttemptId: createUUID(),
              }
            : {
                  placeId: parseInt(placeId),
                  gameId: serverId,
                  gameJoinAttemptId: createUUID(),
              };

        const response = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: endpoint,
            method: 'POST',
            body: body,
        });

        if (!response.ok) throw new Error('API Error');
        const info = await response.json();

        const result = {
            status: info.status,
            message: info.message,
            joinScript: info.joinScript,
            queuePosition: info.queuePosition,
        };

        if (info.joinScript) {
            if (
                info.joinScript.ServerClaimedTime &&
                typeof info.joinScript.ServerClaimedTime === 'number' &&
                info.joinScript.ServerClaimedTime > 0
            ) {
                const now = Date.now();
                const gamejoinUptime = Math.max(
                    0,
                    (now - info.joinScript.ServerClaimedTime) / 1000,
                );

                const calculatedBase = now - gamejoinUptime * 1000;
                const existingBase = serverUptimeBases[serverId];

                serverUptimeIsEstimate[serverId] = false;

                if (!existingBase || calculatedBase < existingBase) {
                    serverUptimeBases[serverId] = calculatedBase;

                    startUptimeLiveCounter();
                }
            }

            const dcId = info.joinScript?.DataCenterId;
            if (dcId) {
                await loadDatacenterMap();
                const locInfo =
                    datacenterList?.find(
                        (entry) =>
                            (Array.isArray(entry.dataCenterIds) &&
                                entry.dataCenterIds.includes(dcId)) ||
                            entry.dataCenterId === dcId,
                    ) || null;

                if (locInfo) {
                    const { city, region, country } =
                        locInfo.location || locInfo;
                    const locParts = [
                        city,
                        region && region !== city ? region : null,
                        country,
                    ].filter((p) => p && p !== 'Unknown');
                    if (locParts.length) {
                        result.region = [...new Set(locParts)].join(', ');
                        result.city = city;
                        result.regionName = region;
                        result.country = country;
                        result.datacenterId = dcId;

                        if (
                            info.joinScript.UdmuxEndpoints &&
                            info.joinScript.UdmuxEndpoints.length > 0 &&
                            info.joinScript.UdmuxEndpoints[0].Address
                        ) {
                            result.ipAddress =
                                info.joinScript.UdmuxEndpoints[0].Address;
                        } else if (info.joinScript.MachineAddress) {
                            result.ipAddress = info.joinScript.MachineAddress;
                        }
                    }
                }
            }
        }

        result.isEstimate = !!serverUptimeIsEstimate[serverId];

        return result;
    } catch (e) {
        console.error('Failed to fetch server region:', e);
        return { status: 0, message: 'Failed to fetch region data' };
    }
}

export async function isServerActive(placeId, gameId) {
    if (!gameId) return false;
    try {
        const response = await callRobloxApi({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: {
                placeId: parseInt(placeId, 10),
                gameId: gameId,
                isTeleport: false,
            },
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 2 || data.status === 22;
    } catch (e) {
        return false;
    }
}

export function getServerRegion(serverId) {
    return serverLocations[serverId] || null;
}

export function getServerUptime(serverId) {
    if (!serverUptimeBases[serverId]) return null;
    return Math.max(0, (Date.now() - serverUptimeBases[serverId]) / 1000);
}

export function getServerVersion(serverId) {
    return serverVersionsCache[serverId] || null;
}

export function clearServerCache() {
    serverDataCache.clear();
    Object.keys(serverLocations).forEach((key) => delete serverLocations[key]);
    Object.keys(serverUptimeBases).forEach(
        (key) => delete serverUptimeBases[key],
    );
    Object.keys(serverUptimeIsEstimate).forEach(
        (key) => delete serverUptimeIsEstimate[key],
    );
    Object.keys(serverVersionsCache).forEach(
        (key) => delete serverVersionsCache[key],
    );
    stopUptimeLiveCounter();
}
