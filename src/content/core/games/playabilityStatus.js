import { callRobloxApiJson } from '../../core/api.js';

const PLAYABILITY_STATUS_MAP = {
    0: 'This experience is unavailable',
    1: 'Playable',
    2: 'Guests cannot join this experience',
    3: 'This experience has not been approved',
    4: 'This experience is incorrectly configured',
    5: 'This experience is private',
    6: 'Only friends can join this experience',
    7: 'Only group members can join this experience',
    8: 'This experience is restricted on your device',
    9: 'This experience is under review',
    10: 'Purchase required to play',
    11: 'Your account is restricted',
    12: 'This experience is temporarily unavailable',
    13: 'This experience has no published version',
    14: 'This experience is blocked for compliance reasons',
    15: 'This experience is not available in your region',
    16: 'This experience is blocked for regional compliance reasons',
    17: 'This experience is restricted by parental controls',
    18: 'This experience is blocked by parental controls',
    19: 'This experience is age-gated',
    20: 'Verification required for 17+ experiences',
    21: 'Purchase required to play',
    22: 'Purchase restricted on this device',
    23: 'This experience is unrated',
    24: 'This experience is age-gated by content descriptor',
    25: 'This experience is available',
};

const PLAYABILITY_STATUS_STRING_TO_CODE = {
    UnplayableOtherReason: 0,
    Playable: 1,
    GuestProhibited: 2,
    GameUnapproved: 3,
    IncorrectConfiguration: 4,
    UniverseRootPlaceIsPrivate: 5,
    InsufficientPermissionFriendsOnly: 6,
    InsufficientPermissionGroupOnly: 7,
    DeviceRestricted: 8,
    UnderReview: 9,
    PurchaseRequired: 10,
    AccountRestricted: 11,
    TemporarilyUnavailable: 12,
    PlaceHasNoPublishedVersion: 13,
    ComplianceBlocked: 14,
    ContextualPlayabilityRegionalAvailability: 15,
    ContextualPlayabilityRegionalCompliance: 16,
    ContextualPlayabilityAgeRecommendationParentalControls: 17,
    ContextualPlayabilityExperienceBlockedParentalControls: 18,
    ContextualPlayabilityAgeGated: 19,
    ContextualPlayabilityUnverifiedSeventeenPlusUser: 20,
    FiatPurchaseRequired: 21,
    FiatPurchaseDeviceRestricted: 22,
    ContextualPlayabilityUnrated: 23,
    ContextualPlayabilityAgeGatedByDescriptor: 24,
    ContextualPlayabilityGeneral: 25,
};

export const PLAYABILITY_STATUS_NAMES = {
    0: 'UnplayableOtherReason',
    1: 'Playable',
    2: 'GuestProhibited',
    3: 'GameUnapproved',
    4: 'IncorrectConfiguration',
    5: 'UniverseRootPlaceIsPrivate',
    6: 'InsufficientPermissionFriendsOnly',
    7: 'InsufficientPermissionGroupOnly',
    8: 'DeviceRestricted',
    9: 'UnderReview',
    10: 'PurchaseRequired',
    11: 'AccountRestricted',
    12: 'TemporarilyUnavailable',
    13: 'PlaceHasNoPublishedVersion',
    14: 'ComplianceBlocked',
    15: 'ContextualPlayabilityRegionalAvailability',
    16: 'ContextualPlayabilityRegionalCompliance',
    17: 'ContextualPlayabilityAgeRecommendationParentalControls',
    18: 'ContextualPlayabilityExperienceBlockedParentalControls',
    19: 'ContextualPlayabilityAgeGated',
    20: 'ContextualPlayabilityUnverifiedSeventeenPlusUser',
    21: 'FiatPurchaseRequired',
    22: 'FiatPurchaseDeviceRestricted',
    23: 'ContextualPlayabilityUnrated',
    24: 'ContextualPlayabilityAgeGatedByDescriptor',
    25: 'ContextualPlayabilityGeneral',
};

export function toStatusCode(status) {
    if (typeof status === 'number') return status;
    if (typeof status === 'string') {
        const num = parseInt(status, 10);
        if (!isNaN(num)) return num;
        return PLAYABILITY_STATUS_STRING_TO_CODE[status] ?? 0;
    }
    return 0;
}

export async function getPlayabilityStatus(universeId) {
    try {
        const res = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-playability-status?universeIds=${universeId}`,
        });

        const dataArray = Array.isArray(res) ? res : res?.data;
        if (!dataArray || !dataArray[0]) {
            console.warn('RoValra: No playability status data', res);
            return null;
        }

        const statusData = dataArray[0];
        const statusCode = statusData.playabilityStatus;

        return {
            status: statusCode,
            statusName: PLAYABILITY_STATUS_NAMES[statusCode] || 'Unknown',
            displayText:
                statusData.unplayableDisplayText ||
                PLAYABILITY_STATUS_MAP[statusCode] ||
                'This experience is unavailable',
            isPlayable: statusData.isPlayable || false,
        };
    } catch (e) {
        console.warn('RoValra: Failed to fetch playability status', e);
        return null;
    }
}

export function getPlayabilityDisplayText(statusCode) {
    return (
        PLAYABILITY_STATUS_MAP[statusCode] || 'This experience is unavailable'
    );
}

export function getPlayabilityStatusName(statusCode) {
    return PLAYABILITY_STATUS_NAMES[statusCode] || 'Unknown';
}

export function isUnderReview(statusCode) {
    return statusCode === 9;
}

export function isPrivate(statusCode) {
    return statusCode === 5;
}

const REASON_TO_STATUS_CODE = {
    UnplayableOtherReason: 0,
    Playable: 1,
    GuestProhibited: 2,
    GameUnapproved: 3,
    IncorrectConfiguration: 4,
    UniverseRootPlaceIsPrivate: 5,
    InsufficientPermissionFriendsOnly: 6,
    InsufficientPermissionGroupOnly: 7,
    DeviceRestricted: 8,
    UnderReview: 9,
    PurchaseRequired: 10,
    AccountRestricted: 11,
    TemporarilyUnavailable: 12,
    PlaceHasNoPublishedVersion: 13,
    ComplianceBlocked: 14,
    ContextualPlayabilityRegionalAvailability: 15,
    ContextualPlayabilityRegionalCompliance: 16,
    ContextualPlayabilityAgeRecommendationParentalControls: 17,
    ContextualPlayabilityExperienceBlockedParentalControls: 18,
    ContextualPlayabilityAgeGated: 19,
    ContextualPlayabilityUnverifiedSeventeenPlusUser: 20,
    FiatPurchaseRequired: 21,
    FiatPurchaseDeviceRestricted: 22,
    ContextualPlayabilityUnrated: 23,
    ContextualPlayabilityAgeGatedByDescriptor: 24,
    ContextualPlayabilityGeneral: 25,
};

export function getReasonProhibitedDisplayText(reason) {
    const code = REASON_TO_STATUS_CODE[reason];
    if (code !== undefined) {
        return PLAYABILITY_STATUS_MAP[code] || 'This experience is unavailable';
    }
    return 'This experience is unavailable';
}
