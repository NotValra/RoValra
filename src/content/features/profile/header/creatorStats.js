import { callRobloxApiJson } from '../../../core/api.js';
import { getUniversesDetails } from '../../../core/apis/games.js';
import { formatPlayerCount } from '../../../core/games/playerCount.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { ts } from '../../../core/locale/i18n.js';
import {
    observeChildren,
    observeElement,
} from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';
import { createPill } from '../../../core/ui/general/pill.js';

const GAME_PAGE_SIZE = 50;
const API_BATCH_SIZE = 50;
const OWNER_RANK = 255;
const STAT_CLASS = 'rovalra-creator-stat';

let headerObserver = null;
let headerChildrenObserver = null;
let renderFrame = 0;
let runId = 0;

function cleanup() {
    headerObserver?.disconnect();
    headerObserver = null;

    headerChildrenObserver?.disconnect();
    headerChildrenObserver = null;

    if (renderFrame) {
        cancelAnimationFrame(renderFrame);
        renderFrame = 0;
    }

    document
        .querySelectorAll(`.${STAT_CLASS}`)
        .forEach((element) => element.remove());
}

function toStatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : 0;
}

function getValidStatNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0
        ? number
        : null;
}

function normalizeProfilePath(pathname) {
    return pathname
        .toLowerCase()
        .replace(
            /^\/[a-z]{2}(?:-[a-z]{2})?\//,
            '/',
        )
        .replace(/\/+$/, '');
}

function isConnectionsLink(link, userId) {
    try {
        const url = new URL(
            link.href,
            window.location.origin,
        );

        return (
            normalizeProfilePath(url.pathname) ===
            `/users/${userId}/friends`
        );
    } catch {
        return false;
    }
}

function findSocialStatsContainer(header, userId) {
    const links = Array.from(
        header.querySelectorAll('a[href]'),
    ).filter((link) =>
        isConnectionsLink(link, userId),
    );

    if (links.length < 2) {
        return null;
    }

    let candidate = links[0].parentElement;

    while (
        candidate &&
        candidate !== header
    ) {
        if (
            links.every((link) =>
                candidate.contains(link),
            )
        ) {
            return candidate;
        }

        candidate = candidate.parentElement;
    }

    return null;
}

async function getCreatedUniverseIds(userId) {
    const universeIds = new Set();
    const seenCursors = new Set();

    let cursor = '';

    while (true) {
        const params = new URLSearchParams({
            accessFilter: '2',
            limit: String(GAME_PAGE_SIZE),
            sortOrder: 'Asc',
        });

        if (cursor) {
            params.set('cursor', cursor);
        }

        const data = await callRobloxApiJson({
            subdomain: 'games',
            endpoint:
                `/v2/users/${userId}/games?${params.toString()}`,
            method: 'GET',
        });

        const games = Array.isArray(data?.data)
            ? data.data
            : [];

        for (const game of games) {
            const universeId = Number(game?.id);

            if (
                Number.isSafeInteger(universeId) &&
                universeId > 0
            ) {
                universeIds.add(universeId);
            }
        }

        const nextCursor =
            typeof data?.nextPageCursor === 'string'
                ? data.nextPageCursor
                : '';

        if (
            !nextCursor ||
            seenCursors.has(nextCursor)
        ) {
            break;
        }

        seenCursors.add(nextCursor);
        cursor = nextCursor;
    }

    return Array.from(universeIds);
}

async function getCombinedGameStats(userId) {
    const universeIds =
        await getCreatedUniverseIds(userId);

    if (!universeIds.length) {
        return {
            hasGames: false,
            ccu: 0,
            visits: 0,
        };
    }

    let ccu = 0;
    let visits = 0;

    for (
        let index = 0;
        index < universeIds.length;
        index += API_BATCH_SIZE
    ) {
        const batch = universeIds.slice(
            index,
            index + API_BATCH_SIZE,
        );

        const games =
            await getUniversesDetails(batch);

        if (!games.length) {
            throw new Error(
                'Failed to retrieve universe statistics.',
            );
        }

        for (const game of games) {
            ccu += toStatNumber(game?.playing);
            visits += toStatNumber(game?.visits);
        }
    }

    return {
        hasGames: true,
        ccu,
        visits,
    };
}

async function getUserCommunityMemberships(
    userId,
) {
    const data = await callRobloxApiJson({
        subdomain: 'groups',
        endpoint:
            `/v1/users/${userId}/groups/roles?includeLocked=true`,
        method: 'GET',
    });

    return Array.isArray(data?.data)
        ? data.data
        : [];
}

function isOwnedMembership(membership, userId) {
    if (Number(membership?.role?.rank) === OWNER_RANK) {
        return true;
    }

    return (
        Number(
            membership?.group?.owner?.id ??
                membership?.group?.owner?.userId,
        ) === userId
    );
}

async function getCommunityMemberCount(membership) {
    const inlineCount = getValidStatNumber(
        membership?.group?.memberCount,
    );

    if (inlineCount !== null) {
        return inlineCount;
    }

    const groupId = Number(
        membership?.group?.id,
    );

    if (
        !Number.isSafeInteger(groupId) ||
        groupId <= 0
    ) {
        return null;
    }

    try {
        const group = await callRobloxApiJson({
            subdomain: 'groups',
            endpoint: `/v1/groups/${groupId}`,
            method: 'GET',
        });

        return getValidStatNumber(
            group?.memberCount,
        );
    } catch (error) {
        console.warn(
            `RoValra: Failed to load member count for community ${groupId}`,
            error,
        );
        return null;
    }
}

async function getOwnedCommunityStats(userId) {
    const memberships =
        await getUserCommunityMemberships(
            userId,
        );

    const ownedMemberships = memberships.filter(
        (membership) =>
            isOwnedMembership(
                membership,
                userId,
            ),
    );

    if (!ownedMemberships.length) {
        return {
            hasOwnedCommunities: false,
            members: 0,
        };
    }

    const counts = await Promise.all(
        ownedMemberships.map((membership) =>
            getCommunityMemberCount(
                membership,
            ),
        ),
    );

    const validCounts = counts.filter(
        (count) => count !== null,
    );

    if (!validCounts.length) {
        return {
            hasOwnedCommunities: false,
            members: 0,
        };
    }

    return {
        hasOwnedCommunities: true,
        members: validCounts.reduce(
            (total, count) => total + count,
            0,
        ),
    };
}

async function loadCreatorStats(userId) {
    const [gameResult, communityResult] =
        await Promise.allSettled([
            getCombinedGameStats(userId),
            getOwnedCommunityStats(userId),
        ]);

    if (gameResult.status === 'rejected') {
        console.warn(
            'RoValra: Failed to load creator game stats',
            gameResult.reason,
        );
    }

    if (
        communityResult.status === 'rejected'
    ) {
        console.warn(
            'RoValra: Failed to load creator community stats',
            communityResult.reason,
        );
    }

    return {
        games:
            gameResult.status === 'fulfilled'
                ? gameResult.value
                : null,

        communities:
            communityResult.status ===
            'fulfilled'
                ? communityResult.value
                : null,
    };
}

function createStatPill(
    value,
    label,
    tooltip,
    stat,
) {
    const pill = createPill(
        `${formatPlayerCount(value)} ${label}`,
        tooltip,
    );

    pill.classList.add(STAT_CLASS);
    pill.dataset.rovalraCreatorStat = stat;

    return pill;
}

function getRequiredStats(stats) {
    const required = [];

    if (stats.games?.hasGames) {
        required.push('ccu', 'visits');
    }

    if (
        stats.communities
            ?.hasOwnedCommunities
    ) {
        required.push('members');
    }

    return required;
}

function renderStats(
    header,
    userId,
    stats,
) {
    const container =
        findSocialStatsContainer(
            header,
            userId,
        );

    if (!container) {
        return false;
    }

    const requiredStats =
        getRequiredStats(stats);

    if (!requiredStats.length) {
        return true;
    }

    const existing = Array.from(
        container.querySelectorAll(
            `:scope > .${STAT_CLASS}`,
        ),
    );

    const existingStats = new Set(
        existing.map(
            (element) =>
                element.dataset
                    .rovalraCreatorStat,
        ),
    );

    if (
        requiredStats.every((stat) =>
            existingStats.has(stat),
        )
    ) {
        return true;
    }

    existing.forEach((element) =>
        element.remove(),
    );

    const pills = [];

    if (stats.games?.hasGames) {
        pills.push(
            createStatPill(
                stats.games.ccu,
                ts('creatorStats.ccu'),
                ts(
                    'creatorStats.ccuTooltip',
                ),
                'ccu',
            ),
        );

        pills.push(
            createStatPill(
                stats.games.visits,
                ts('creatorStats.visits'),
                ts(
                    'creatorStats.visitsTooltip',
                ),
                'visits',
            ),
        );
    }

    if (
        stats.communities
            ?.hasOwnedCommunities
    ) {
        pills.push(
            createStatPill(
                stats.communities.members,
                ts('creatorStats.members'),
                ts(
                    'creatorStats.membersTooltip',
                ),
                'members',
            ),
        );
    }

    container.append(...pills);

    return true;
}

function scheduleRender(
    header,
    userId,
    stats,
    token,
) {
    if (renderFrame) return;

    renderFrame =
        requestAnimationFrame(() => {
            renderFrame = 0;

            if (
                token !== runId ||
                !header.isConnected ||
                Number(
                    getUserIdFromUrl(),
                ) !== userId
            ) {
                return;
            }

            renderStats(
                header,
                userId,
                stats,
            );
        });
}

async function attachHeader(
    header,
    userId,
    token,
) {
    const stats =
        await loadCreatorStats(userId);

    if (
        token !== runId ||
        !header.isConnected ||
        Number(getUserIdFromUrl()) !==
            userId
    ) {
        return;
    }

    headerChildrenObserver?.disconnect();

    headerChildrenObserver =
        observeChildren(header, () => {
            scheduleRender(
                header,
                userId,
                stats,
                token,
            );
        });

    scheduleRender(
        header,
        userId,
        stats,
        token,
    );
}

export async function init() {
    cleanup();

    const token = ++runId;

    if (
        !(await settings.creatorStatsEnabled)
    ) {
        return;
    }

    const userId = Number(
        getUserIdFromUrl(),
    );

    if (
        !Number.isSafeInteger(userId) ||
        userId <= 0
    ) {
        return;
    }

    headerObserver = observeElement(
        '.user-profile-header',
        (header) => {
            attachHeader(
                header,
                userId,
                token,
            ).catch((error) => {
                console.warn(
                    'RoValra: Failed to initialize creator stats',
                    error,
                );
            });
        },
        {
            multiple: false,
            onRemove: () => {
                headerChildrenObserver?.disconnect();
                headerChildrenObserver =
                    null;
            },
        },
    );
}
