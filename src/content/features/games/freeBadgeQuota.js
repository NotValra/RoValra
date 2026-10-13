import { callRobloxApiJson } from '../../core/api.js';
import { getPlaceDetails } from '../../core/apis/games.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { addTooltip } from '../../core/ui/tooltip.js';

const STAT_CLASS = 'rovalra-free-badge-quota';
const quotaCache = new Map();

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

function getFreeBadgeQuota(universeId) {
    if (!quotaCache.has(universeId)) {
        const promise = callRobloxApiJson({
            subdomain: 'badges',
            endpoint: `/v1/universes/${universeId}/free-badges-quota`,
        });
        quotaCache.set(universeId, promise);
        promise.catch(() => quotaCache.delete(universeId));
    }
    return quotaCache.get(universeId);
}

async function addQuotaStat(container) {
    if (container.querySelector(`.${STAT_CLASS}`)) return;

    const universeId = await getCurrentUniverseId();
    if (!universeId) return;

    let quota;
    try {
        quota = await getFreeBadgeQuota(universeId);
    } catch (e) {
        console.warn('RoValra: Failed to load free badge quota', e);
        return;
    }
    if (typeof quota !== 'number') return;
    if (container.querySelector(`.${STAT_CLASS}`)) return;

    const stat = document.createElement('li');
    stat.className = `game-stat ${STAT_CLASS}`;

    const label = document.createElement('p');
    label.className = 'text-label text-overflow font-caption-header';
    label.textContent = ts('freeBadgeQuota.label');

    const value = document.createElement('p');
    value.className = 'text-lead font-caption-body';
    value.textContent = ts('freeBadgeQuota.value', { count: quota });

    stat.append(label, value);
    addTooltip(stat, ts('freeBadgeQuota.tooltip'), { position: 'top' });
    container.appendChild(stat);
}

let initialized = false;
export async function init() {
    if (initialized) return;
    if ((await settings.freeBadgeQuotaEnabled) !== true) return;
    initialized = true;
    observeElement('.game-stat-container', addQuotaStat, { multiple: true });
}
