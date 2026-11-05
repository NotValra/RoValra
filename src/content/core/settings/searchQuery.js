export const SETTING_STATUSES = [
    'deprecated',
    'experimental',
    'beta',
    'locked',
];

export function getSettingStatus(settingDef) {
    const statuses = new Set(
        SETTING_STATUSES.filter((status) => Boolean(settingDef?.[status])),
    );
    for (const child of Object.values(settingDef?.childSettings || {})) {
        if (child.hidden) continue;
        for (const status of SETTING_STATUSES) {
            if (child[status]) statuses.add(status);
        }
    }
    return [...statuses];
}

export function parseSearchQuery(query = '') {
    const parsed = { text: '', contributor: null, statuses: new Set() };
    const words = [];

    for (const word of query.trim().split(/\s+/).filter(Boolean)) {
        const contributor = word.match(/^contributor:(.+)$/i);
        const status = word.match(/^status:([a-z]+)$/i);
        if (contributor) {
            parsed.contributor = contributor[1];
        } else if (
            status &&
            SETTING_STATUSES.includes(status[1].toLowerCase())
        ) {
            parsed.statuses.add(status[1].toLowerCase());
        } else {
            words.push(word);
        }
    }

    parsed.text = words.join(' ');
    parsed.hasFilters = parsed.contributor !== null || parsed.statuses.size > 0;
    return parsed;
}

export function buildSearchQuery({ text = '', contributor, statuses }) {
    return [
        ...[...(statuses || [])].map((status) => `status:${status}`),
        contributor ? `contributor:${contributor}` : '',
        text.trim(),
    ]
        .filter(Boolean)
        .join(' ');
}
