export const SETTING_STATUSES = [
    'deprecated',
    'experimental',
    'beta',
    'locked',
];

export function getSettingStatus(settingDef) {
    return SETTING_STATUSES.filter((status) => Boolean(settingDef?.[status]));
}

export function parseSearchQuery(query = '') {
    const parsed = { text: '', contributor: null, hiddenStatuses: new Set() };
    const words = [];

    for (const word of query.trim().split(/\s+/).filter(Boolean)) {
        const contributor = word.match(/^contributor:(.+)$/i);
        const hiddenStatus = word.match(/^-status:([a-z]+)$/i);
        if (contributor) {
            parsed.contributor = contributor[1];
        } else if (
            hiddenStatus &&
            SETTING_STATUSES.includes(hiddenStatus[1].toLowerCase())
        ) {
            parsed.hiddenStatuses.add(hiddenStatus[1].toLowerCase());
        } else {
            words.push(word);
        }
    }

    parsed.text = words.join(' ');
    parsed.hasFilters =
        parsed.contributor !== null || parsed.hiddenStatuses.size > 0;
    return parsed;
}

export function buildSearchQuery({ text = '', contributor, hiddenStatuses }) {
    return [
        ...[...(hiddenStatuses || [])].map((status) => `-status:${status}`),
        contributor ? `contributor:${contributor}` : '',
        text.trim(),
    ]
        .filter(Boolean)
        .join(' ');
}
