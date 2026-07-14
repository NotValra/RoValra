import { callRobloxApi } from '../../api.js';
import { settings } from '../../settings/getSettings.js';
import { getAuthenticatedUserId } from '../../user.js';

const STORAGE_KEY = 'rovalra_client_channel_assignments';
const LAST_REPORTED_AT_STORAGE_KEY = 'rovalra_client_channel_last_reported_at';
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REPORT_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
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

async function readLastReportedAt(userId) {
    try {
        const storage = await chrome.storage.local.get(
            LAST_REPORTED_AT_STORAGE_KEY,
        );
        const timestamp = storage[LAST_REPORTED_AT_STORAGE_KEY]?.[userId];
        return typeof timestamp === 'number' ? timestamp : 0;
    } catch (error) {
        console.warn(
            'RoValra: Failed to read client channel report timestamp',
            error,
        );
        return 0;
    }
}

async function writeLastReportedAt(userId, timestamp) {
    const storage = await chrome.storage.local.get(
        LAST_REPORTED_AT_STORAGE_KEY,
    );
    await chrome.storage.local.set({
        [LAST_REPORTED_AT_STORAGE_KEY]: {
            ...(storage[LAST_REPORTED_AT_STORAGE_KEY] || {}),
            [userId]: timestamp,
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
    const hasToken = [assignment.token, assignment.program?.token].some(
        (token) => typeof token === 'string' && token.trim() !== '',
    );

    if (hasToken) {
        return { assignment: null, blocked: true };
    }

    if (typeof assignment?.channelName !== 'string') {
        throw new Error(`${binaryType} returned an invalid channel assignment`);
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

    return { assignment: normalizedAssignment, blocked: false };
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
        if (await settings.disableChannelTracking) return [];

        const userId = await getAuthenticatedUserId();
        if (!userId) return [];

        const savedAssignments = await readSavedAssignments(userId);
        const results = await Promise.allSettled(
            BINARY_TYPES.map((binaryType) => fetchAssignment(binaryType)),
        );
        const fetchedResults = results
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value);

        if (fetchedResults.some((result) => result.blocked)) {
            return [];
        }

        const fetchedAssignments = fetchedResults
            .map((result) => result.assignment)
            .filter(Boolean);

        const lastReportedAt = await readLastReportedAt(userId);
        const shouldRefreshReport =
            Date.now() - lastReportedAt >= REPORT_REFRESH_INTERVAL_MS;

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

        const assignmentsToReport = shouldRefreshReport
            ? fetchedAssignments
            : changedAssignments;

        if (assignmentsToReport.length === 0) return [];

        if (await settings.disableChannelTracking) return [];

        await reportAssignments(assignmentsToReport);

        const updatedAssignments = { ...savedAssignments };
        changedAssignments.forEach((assignment) => {
            updatedAssignments[assignment.binaryType] = assignment;
        });
        if (changedAssignments.length > 0) {
            await writeSavedAssignments(userId, updatedAssignments);
        }
        await writeLastReportedAt(userId, Date.now());

        return assignmentsToReport;
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
