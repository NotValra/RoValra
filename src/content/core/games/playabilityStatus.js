import { callRobloxApiJson } from '../../core/api.js';
import { t, ts } from '../../core/locale/i18n.js';

export const PLAYABILITY_STATUS_STRING_TO_CODE = {
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

export function getPlayabilityDisplayText(statusCode) {
    const code = toStatusCode(statusCode);
    return ts(`playabilityStatus.${code}`, {
        defaultValue: ts('playabilityStatus.unknown'),
    });
}

export function getPlayabilityStatusName(statusCode) {
    const code = toStatusCode(statusCode);
    return PLAYABILITY_STATUS_NAMES[code] || 'Unknown';
}

export function isUnderReview(statusCode) {
    return statusCode === 9;
}

export function isPrivate(statusCode) {
    return statusCode === 5;
}

export async function getPlayabilityDisplayTextAsync(statusCode) {
    const code = toStatusCode(statusCode);
    return await t(`playabilityStatus.${code}`, {
        defaultValue: await t('playabilityStatus.unknown'),
    });
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
    if (!reason || reason === 'None') return null;
    const code = REASON_TO_STATUS_CODE[reason];
    if (code !== undefined) {
        return ts(`playabilityStatus.${code}`, {
            defaultValue: ts('playabilityStatus.unknown'),
        });
    }
    return ts('playabilityStatus.unknown');
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
        const rawStatus = statusData.playabilityStatus;
        const statusCode = toStatusCode(rawStatus);

        return {
            status: statusCode,
            statusName: PLAYABILITY_STATUS_NAMES[statusCode] || 'Unknown',
            displayText:
                statusData.unplayableDisplayText ||
                ts(`playabilityStatus.${statusCode}`, {
                    defaultValue: ts('playabilityStatus.unknown'),
                }),
            isPlayable: statusData.isPlayable || false,
        };
    } catch (e) {
        console.warn('RoValra: Failed to fetch playability status', e);
        return null;
    }
}
