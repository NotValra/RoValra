import { callRobloxApiJson } from './api.js';

export const TEMPORARILY_LIMITED_MESSAGE =
    'Your account has been temporarily limited for violating terms of service.';

const RESTRICTION_LEVELS = [
    'None / No restrictions',
    'Limited',
    'Very Limited',
    'At Risk',
    'Suspended',
];

export function getModerationStatusLabel(status) {
    return RESTRICTION_LEVELS[Number(status)] || 'Unknown';
}

export function isTemporaryLimitedError(error) {
    const message = error?.response?.message || error?.response?.error || '';
    return (
        error?.status === 403 &&
        typeof message === 'string' &&
        message.toLowerCase().includes('temporarily limited')
    );
}

export function isPastModerationExpiry(expiresAt) {
    if (!expiresAt) return false;
    const expiryTime = Date.parse(expiresAt);
    return Number.isFinite(expiryTime) && expiryTime <= Date.now();
}

export function getActiveModeration(data) {
    const moderation = data?.moderation;
    if (!moderation) return null;

    const status = Number(moderation.moderation_status ?? 0);
    if (status <= 0) return null;
    if (isPastModerationExpiry(moderation.moderation_expires_at)) return null;

    return moderation;
}

export function formatModerationExpiry(expiresAt) {
    if (!expiresAt) return null;

    const expiryDate = new Date(expiresAt);
    if (Number.isNaN(expiryDate.getTime())) return null;

    return expiryDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

export async function fetchModerationStatus() {
    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: '/v1/auth/moderation/status',
        method: 'GET',
        isRovalraApi: true,
        noCache: true,
    });

    document.dispatchEvent(
        new CustomEvent('rovalra:moderationStatusUpdated', {
            detail: { data },
        }),
    );

    return data;
}

export async function refreshModerationStatusAfterLimitedError(error) {
    if (!isTemporaryLimitedError(error)) return null;

    try {
        return await fetchModerationStatus();
    } catch (refreshError) {
        console.warn(
            'RoValra: Failed to refresh moderation status after temporary limit.',
            refreshError,
        );
        return null;
    }
}

export function getTemporaryLimitedUserMessage(data) {
    const moderation = getActiveModeration(data);
    const expiresAt = moderation?.moderation_expires_at;
    const expiryLabel = formatModerationExpiry(expiresAt);

    if (expiryLabel) {
        return `Your account has been temporarily limited. This restriction expires ${expiryLabel}.`;
    }

    return 'Your account has been temporarily limited. Check Account Standing for details.';
}
