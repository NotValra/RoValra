export const NORMAL_TELEMETRY_RULES = [
    { id: 7100, regexFilter: '^https?://ecsv2\\.roblox\\.com/' },
    {
        id: 7101,
        regexFilter:
            '^https://apis\\.roblox\\.com/experience-signals-ingest/public/v1/events/(single|optimized)([?]|$)',
    },
    {
        id: 7102,
        regexFilter:
            '^https://apis\\.roblox\\.com/affiliate-links/v1/events/(authenticated-visit|qualified-signup)([?]|$)',
    },
    {
        id: 7103,
        regexFilter:
            '^https://apis\\.roblox\\.com/modals-api/v1/prompts/impression([?]|$)',
    },
];

export const AGGRESSIVE_TELEMETRY_RULES = [
    {
        id: 7200,
        regexFilter:
            '^https?://metrics\\.roblox\\.com/v1/thumbnails/(load|metadata)([?]|$)',
    },
    {
        id: 7201,
        regexFilter:
            '^https?://apis\\.roblox\\.com/account-security-service/v1/metrics/record([?]|$)',
    },
    {
        id: 7202,
        regexFilter:
            '^https://o293668\\.ingest\\.us\\.sentry\\.io/api/4509158985826304/(envelope|store)/([?]|$)',
    },
    {
        id: 7203,
        regexFilter:
            '^https://metrics\\.roblox\\.com/v1/games/report-event([?]|$)',
    },
    {
        id: 7204,
        regexFilter:
            '^https://assetgame\\.roblox\\.com/game/report-stats([?]|$)',
    },
    {
        id: 7205,
        regexFilter: '^https://www\\.roblox\\.com/game/report-event([?]|$)',
    },
    {
        id: 7206,
        regexFilter:
            '^https://apis\\.roblox\\.com/user-heartbeats-api/pulse([?]|$)',
    },
    {
        id: 7207,
        regexFilter: '^https://tracing\\.roblox\\.com/v1/traces([?]|$)',
    },
    {
        id: 7208,
        regexFilter:
            '^https://metrics\\.roblox\\.com/v1/bundle-metrics/report([?]|$)',
    },
    {
        id: 7209,
        regexFilter:
            '^https://adconfiguration\\.roblox\\.com/v2/tracking/click([?]|$)',
    },
    {
        id: 7210,
        regexFilter: '^https://lms\\.roblox\\.com/report([?]|$)',
    },
    {
        id: 7211,
        regexFilter:
            '^https://metrics\\.roblox\\.com/v1/performance/measurements([?]|$)',
    },
];

export function getTelemetryRules(settings) {
    if (settings.telemetryBlockerEnabled !== true) return [];

    const definitions =
        settings.telemetryBlockerAggressiveEnabled === true
            ? [...NORMAL_TELEMETRY_RULES, ...AGGRESSIVE_TELEMETRY_RULES]
            : NORMAL_TELEMETRY_RULES;

    return definitions.map(({ id, regexFilter }) => ({
        id,
        priority: 1,
        action: { type: 'block' },
        condition: {
            regexFilter,
            initiatorDomains: ['roblox.com'],
            resourceTypes: ['xmlhttprequest', 'ping', 'image', 'other'],
        },
    }));
}

export function initializeTelemetryBlocker() {
    const removeRuleIds = [
        ...NORMAL_TELEMETRY_RULES,
        ...AGGRESSIVE_TELEMETRY_RULES,
    ].map(({ id }) => id);
    let pendingUpdate = Promise.resolve();

    const synchronize = () => {
        pendingUpdate = pendingUpdate
            .then(async () => {
                const settings = await chrome.storage.local.get({
                    telemetryBlockerEnabled: false,
                    telemetryBlockerAggressiveEnabled: false,
                });
                await chrome.declarativeNetRequest.updateDynamicRules({
                    removeRuleIds,
                    addRules: getTelemetryRules(settings),
                });
            })
            .catch((error) => {
                console.error(
                    'RoValra: Failed to update telemetry blocking.',
                    error,
                );
            });
        return pendingUpdate;
    };

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
            areaName === 'local' &&
            (changes.telemetryBlockerEnabled ||
                changes.telemetryBlockerAggressiveEnabled)
        ) {
            synchronize();
        }
    });
    chrome.runtime.onInstalled.addListener(synchronize);
    chrome.runtime.onStartup.addListener(synchronize);
    return synchronize();
}
