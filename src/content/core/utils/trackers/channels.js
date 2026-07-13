import { callRobloxApi } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

const STORAGE_KEY = 'rovalra_client_channel_assignments';
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const BINARY_TYPES = [
    'PS4App',
    'PS5App',
    'XboxApp',
    'QuestVRApp',
    'UWPApp',
    'RCCService',
    'WindowsPlayer',
    'MacStudio',
    'WindowsStudio64',
    'MacPlayer',
    'GoogleAndroidApp',
    'IOSApp',
    'GoogleAndroidTVApp',
];

let trackerStarted = false;
let activeUpdatePromise = null;

async function readSavedAssignments(userId) {
    try {
        const storage = await chrome.storage.local.get(STORAGE_KEY);
        return storage[STORAGE_KEY]?.[userId] || {};
    } catch (error) {
        console.warn(
            'RoValra: Failed to read client channel assignments',
            error,
        );
        return {};
    }
}

async function writeSavedAssignments(userId, assignments) {
    const storage = await chrome.storage.local.get(STORAGE_KEY);
    await chrome.storage.local.set({
        [STORAGE_KEY]: {
            ...(storage[STORAGE_KEY] || {}),
            [userId]: assignments,
        },
    });
}

function assignmentsMatch(first, second) {
    return (
        first?.channelName === second?.channelName &&
        first?.channelAssignmentType === second?.channelAssignmentType &&
        first?.isFlagOnly === second?.isFlagOnly
    );
}

async function fetchAssignment(binaryType) {
    const response = await Promise.race([
        callRobloxApi({
            subdomain: 'clientsettings',
            endpoint: `/v2/user-channel?binaryType=${encodeURIComponent(binaryType)}`,
            method: 'GET',
            noCache: true,
            useBackground: true,
        }),
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error(`${binaryType} request timed out`)),
                REQUEST_TIMEOUT_MS,
            ),
        ),
    ]);

    if (!response.ok) {
        throw new Error(`${binaryType} returned HTTP ${response.status}`);
    }

    const assignment = await response.json();
    if (typeof assignment?.channelName !== 'string') {
        throw new Error(`${binaryType} returned an invalid channel assignment`);
    }

    if (
        typeof assignment.program?.token === 'string' &&
        assignment.program.token.trim() !== ''
    ) {
        return null;
    }

    const normalizedAssignment = {
        channelName: assignment.channelName,
        binaryType,
    };

    if (typeof assignment.channelAssignmentType === 'number') {
        normalizedAssignment.channelAssignmentType =
            assignment.channelAssignmentType;
    }
    if (typeof assignment.isFlagOnly === 'boolean') {
        normalizedAssignment.isFlagOnly = assignment.isFlagOnly;
    }

    return normalizedAssignment;
}

async function reportAssignments(assignments) {
    const response = await callRobloxApi({
        subdomain: 'apis',
        endpoint: '/v1/channels/enrollments',
        method: 'POST',
        isRovalraApi: true,
        body: assignments,
        noCache: true,
    });

    if (!response.ok) {
        throw new Error(`Enrollment API returned HTTP ${response.status}`);
    }
}

export async function updateClientChannelAssignments() {
    if (activeUpdatePromise) return activeUpdatePromise;

    activeUpdatePromise = (async () => {
        const userId = await getAuthenticatedUserId();
        if (!userId) return [];

        const savedAssignments = await readSavedAssignments(userId);
        const results = await Promise.allSettled(
            BINARY_TYPES.map((binaryType) => fetchAssignment(binaryType)),
        );
        const fetchedAssignments = results
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value)
            .filter(Boolean);

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(
                    `RoValra: Failed to fetch ${BINARY_TYPES[index]} client channel`,
                    result.reason,
                );
            }
        });

        const changedAssignments = fetchedAssignments.filter(
            (assignment) =>
                !assignmentsMatch(
                    savedAssignments[assignment.binaryType],
                    assignment,
                ),
        );

        if (changedAssignments.length === 0) return [];

        await reportAssignments(changedAssignments);

        const updatedAssignments = { ...savedAssignments };
        changedAssignments.forEach((assignment) => {
            updatedAssignments[assignment.binaryType] = assignment;
        });
        await writeSavedAssignments(userId, updatedAssignments);

        return changedAssignments;
    })().finally(() => {
        activeUpdatePromise = null;
    });

    return activeUpdatePromise;
}

export function init() {
    if (trackerStarted) return;
    trackerStarted = true;

    const poll = async () => {
        try {
            await updateClientChannelAssignments();
        } catch (error) {
            console.warn(
                'RoValra: Failed to update client channel assignments',
                error,
            );
        } finally {
            setTimeout(poll, POLL_INTERVAL_MS);
        }
    };

    poll();
}
