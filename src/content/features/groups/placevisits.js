import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { getGroupIdFromUrl } from '../../core/idExtractor.js';
import { createPill } from '../../core/ui/general/pill.js';
import { t } from '../../core/locale/i18n.js';

async function fetchTotalVisits(groupId) {
    let totalVisits = 0;
    let cursor = '';

    try {
        do {
            const res = await callRobloxApiJson({
                subdomain: 'games',
                endpoint: `/v2/groups/${groupId}/gamesV2?accessFilter=2&limit=50&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ''}`,
            });

            if (res && res.data) {
                totalVisits += res.data.reduce(
                    (sum, game) => sum + (game.placeVisits || 0),
                    0,
                );
                cursor = res.nextPageCursor;
            } else {
                cursor = null;
            }
        } while (cursor);

        return totalVisits;
    } catch (e) {
        console.error('RoValra: Failed to fetch group place visits', e);
        return null;
    }
}

export function init() {
    chrome.storage.local.get({ groupPlaceVisitsEnabled: true }, (settings) => {
        if (!settings.groupPlaceVisitsEnabled) return;

        observeElement(
            '.profile-insights-container.flex.gap-small',
            async (container) => {
                if (container.dataset.rovalraVisitsProcessed) return;

                const groupId = getGroupIdFromUrl();
                if (!groupId) return;

                container.dataset.rovalraVisitsProcessed = 'true';

                const totalVisits = await fetchTotalVisits(groupId);
                if (totalVisits === null) {
                    delete container.dataset.rovalraVisitsProcessed;
                    return;
                }

                const formattedVisits = totalVisits.toLocaleString();
                const pill = createPill(
                    await t('placeVisits.label', { count: formattedVisits }),
                    await t('placeVisits.tooltip'),
                    { size: 'small', isButton: true },
                );
                pill.classList.add(
                    'profile-insight-pill-button',
                    'rovalra-total-visits-pill',
                );

                container.appendChild(pill);
            },
        );
    });
}
