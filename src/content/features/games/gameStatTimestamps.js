import { getPlaceDetails, getUniversesDetails } from '../../core/apis/games.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';

const MARKER = 'data-rovalra-stat-timestamp';
const universeDetailsCache = new Map();

async function getCurrentUniverseId() {
    const metaData = document.getElementById('game-detail-meta-data');
    const metaDataUniverseId = Number(metaData?.dataset?.universeId);
    if (Number.isSafeInteger(metaDataUniverseId) && metaDataUniverseId > 0) {
        return metaDataUniverseId;
    }

    const placeId = getPlaceIdFromUrl();
    if (!placeId) return null;

    const placeDetails = await getPlaceDetails(placeId);
    const universeId = Number(placeDetails?.universeId);
    return Number.isSafeInteger(universeId) && universeId > 0
        ? universeId
        : null;
}

function getUniverseDetails(universeId) {
    if (!universeDetailsCache.has(universeId)) {
        universeDetailsCache.set(
            universeId,
            getUniversesDetails([universeId]).then((data) => data[0] || null),
        );
    }
    return universeDetailsCache.get(universeId);
}

function getStatKey(stat) {
    const label = stat
        .querySelector('.text-label')
        ?.textContent.trim()
        .toLowerCase();
    if (!label) return null;

    const createdLabels = ['created', ts('privateGames.stats.created')];
    const updatedLabels = ['updated', ts('privateGames.stats.updated')];
    if (createdLabels.some((l) => l?.toLowerCase() === label)) return 'created';
    if (updatedLabels.some((l) => l?.toLowerCase() === label)) return 'updated';
    return null;
}

async function replaceStat(stat) {
    const key = getStatKey(stat);
    if (!key) return;

    const valueEl = stat.querySelector('.text-lead');
    if (!valueEl || valueEl.querySelector('.rovalra-interactive-timestamp'))
        return;

    const universeId = await getCurrentUniverseId();
    if (!universeId) return;

    const details = await getUniverseDetails(universeId);
    const dateString = details?.[key];
    if (!dateString || Number.isNaN(new Date(dateString).getTime())) return;
    if (valueEl.querySelector('.rovalra-interactive-timestamp')) return;

    valueEl.setAttribute(MARKER, key);
    valueEl.replaceChildren(createInteractiveTimestamp(dateString));
}

export async function init() {
    if ((await settings.gameStatTimestampsEnabled) === false) return;
    observeElement('.game-stat-container .game-stat', replaceStat, {
        multiple: true,
    });
}

export default init;
