import { callRobloxApiJson } from '../../../core/api.js';
import {
    getCloudUniverseDetails,
    getPlaceDetails,
    getUniversesDetails,
} from '../../../core/apis/games.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { t } from '../../../core/locale/i18n.js';
import { observeElement } from '../../../core/observer.js';
import { safeHtml } from '../../../core/packages/dompurify.js';
import { settings } from '../../../core/settings/getSettings.js';
import { Icon } from '../../../core/ui/buildericon.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { addTooltip } from '../../../core/ui/tooltip.js';

const STAT_CONTAINER_SELECTOR = '.game-stat-container';
const PRIVATE_GAME_DATE_SELECTOR = '#rovalra-updated-date';
const DEVICES_PER_ROW = 3;
const DEVICES = [
    {
        field: 'desktopEnabled',
        key: 'desktop',
        icon: 'computer',
        material: true,
    },
    {
        field: 'mobileEnabled',
        key: 'phone',
        icon: 'smartphone',
        material: true,
    },
    { field: 'tabletEnabled', key: 'tablet', icon: 'tablet', material: true },
    {
        field: 'consoleEnabled',
        key: 'console',
        icon: 'sports_esports',
        material: true,
    },
    { field: 'vrEnabled', key: 'vr', icon: 'xr-headset', material: false },
    {
        field: 'tvEnabled',
        fallbackField: 'tabletEnabled',
        key: 'tv',
        icon: 'tv',
        material: true,
    },
];

let observerInitialized = false;
let experienceInfoPromise = null;

async function fetchExperienceInfo(placeId) {
    const placeDetails = await getPlaceDetails(placeId);
    const universeId = Number(placeDetails?.universeId);
    if (!Number.isSafeInteger(universeId) || universeId <= 0) return null;

    const [cloudUniverse, startInfo, avatarSupport, universeDetails] =
        await Promise.all([
            getCloudUniverseDetails(universeId).catch(() => null),
            callRobloxApiJson({
                subdomain: 'avatar',
                endpoint: `/v1/game-start-info?universeId=${universeId}`,
            }).catch(() => null),
            callRobloxApiJson({
                subdomain: 'avatar',
                endpoint: '/v2/avatar/experience/get-experience-avatar-support',
                headers: { 'Roblox-Place-Id': String(placeId) },
                useBackground: true,
            }).catch(() => null),
            getUniversesDetails([universeId]),
        ]);

    return {
        devices: cloudUniverse
            ? DEVICES.filter(
                  (device) =>
                      cloudUniverse[device.field] === true ||
                      cloudUniverse[device.fallbackField] === true,
              )
            : [],
        avatarType: getAvatarTypeKey(
            startInfo,
            avatarSupport?.experienceAvatarSupportType,
        ),
        created: universeDetails[0]?.created || null,
        updated: universeDetails[0]?.updated || null,
    };
}

function getAvatarTypeKey(startInfo, avatarSupportType) {
    if (avatarSupportType === 0) return 'custom';

    switch (startInfo?.gameAvatarType) {
        case 'MorphToR6':
            return 'r6';
        case 'MorphToR15':
            return startInfo.universeAvatarMinScales?.bodyType === 1
                ? 'rthro'
                : 'r15';
        case 'PlayerChoice':
            return 'playerChoice';
        default:
            return null;
    }
}

function getExperienceInfo(placeId) {
    if (!experienceInfoPromise) {
        experienceInfoPromise = fetchExperienceInfo(placeId).catch((error) => {
            console.warn('RoValra: Failed to load experience info', error);
            return null;
        });
    }
    return experienceInfoPromise;
}

function createStat(className, label) {
    const stat = document.createElement('li');
    stat.className = `game-stat ${className}`;
    stat.innerHTML = safeHtml`
        <p class="text-label text-overflow font-caption-header">${label}</p>
        <p class="text-lead font-caption-body"></p>`;
    return stat;
}

async function createDevicesStat(devices) {
    const [label, ...deviceLabels] = await Promise.all([
        t('experienceInfoStats.supportedDevices'),
        ...devices.map((device) =>
            t(`experienceInfoStats.devices.${device.key}`),
        ),
    ]);
    const stat = createStat('rovalra-supported-devices', label);
    const value = stat.querySelector('.text-lead');
    value.style.display = 'flex';
    value.style.flexDirection = 'column';
    value.style.alignItems = 'center';
    value.style.gap = '6px';

    let row = null;
    devices.forEach((device, index) => {
        if (index % DEVICES_PER_ROW === 0) {
            row = document.createElement('span');
            row.style.display = 'flex';
            row.style.gap = '6px';
            value.appendChild(row);
        }

        const icon = Icon({
            icon: device.icon,
            material: device.material,
            size: 'medium',
        });
        icon.setAttribute('aria-label', deviceLabels[index]);
        addTooltip(icon, deviceLabels[index]);
        row.appendChild(icon);
    });

    return stat;
}

async function createAvatarTypeStat(avatarType) {
    const [label, valueText] = await Promise.all([
        t('experienceInfoStats.avatarType'),
        t(`experienceInfoStats.avatarTypes.${avatarType}`),
    ]);
    const stat = createStat('rovalra-avatar-type', label);
    stat.querySelector('.text-lead').textContent = valueText;
    return stat;
}

function getDateKeys(isoDate) {
    const date = new Date(isoDate);
    const toKey = (parts) => parts.sort((a, b) => a - b).join(',');
    return [
        toKey([date.getMonth() + 1, date.getDate(), date.getFullYear()]),
        toKey([
            date.getUTCMonth() + 1,
            date.getUTCDate(),
            date.getUTCFullYear(),
        ]),
    ];
}

function findDateStat(container, isoDate) {
    if (!isoDate) return null;
    const keys = getDateKeys(isoDate);

    return (
        Array.from(container.querySelectorAll(':scope > li.game-stat')).find(
            (stat) => {
                const numbers = stat
                    .querySelector('.text-lead')
                    ?.textContent.match(/\d+/g);
                if (numbers?.length !== 3) return false;
                return keys.includes(
                    numbers
                        .map(Number)
                        .sort((a, b) => a - b)
                        .join(','),
                );
            },
        ) || null
    );
}

function isRosealDateStat(stat) {
    if (stat.id || stat.className.includes('rovalra-')) return false;
    const value = stat.querySelector(':scope > .text-lead');
    return Boolean(
        value?.classList.contains('time-type-switch') ||
        value?.querySelector(':scope > span'),
    );
}

function hideRosealDuplicates(container) {
    if (!container) return;

    const hide = (element) => {
        if (element) element.style.display = 'none';
    };

    if (container.querySelector(':scope > .rovalra-supported-devices')) {
        hide(container.querySelector(':scope > #playable-devices'));
    }
    if (container.querySelector(':scope > .rovalra-avatar-type')) {
        hide(container.querySelector(':scope > #experience-avatar-type'));
    }
    if (container.querySelector(':scope > .rovalra-experience-updated')) {
        container.querySelectorAll(':scope > li.game-stat').forEach((stat) => {
            if (isRosealDateStat(stat)) hide(stat);
        });
    }
}

async function createDateStat(className, labelKey, isoDate) {
    const stat = createStat(className, await t(labelKey));
    stat.querySelector('.text-lead').appendChild(
        createInteractiveTimestamp(isoDate, { initialFormat: 'relative' }),
    );
    return stat;
}

async function addDateStats(container, info) {
    if (!info.updated || container.querySelector(PRIVATE_GAME_DATE_SELECTOR)) {
        return;
    }

    const nativeStats = [
        findDateStat(container, info.updated),
        findDateStat(container, info.created),
    ].filter(Boolean);
    const anchor =
        nativeStats[0] ||
        Array.from(container.querySelectorAll(':scope > li.game-stat')).find(
            isRosealDateStat,
        ) ||
        null;

    const stats = [];
    if (info.created) {
        stats.push(
            await createDateStat(
                'rovalra-experience-created',
                'experienceInfoStats.created',
                info.created,
            ),
        );
    }
    stats.push(
        await createDateStat(
            'rovalra-experience-updated',
            'experienceInfoStats.updated',
            info.updated,
        ),
    );

    stats.forEach((stat) => container.insertBefore(stat, anchor));
    nativeStats.forEach((stat) => {
        stat.style.display = 'none';
    });
}

async function addExperienceInfoStats(container) {
    if (container.dataset.rovalraExperienceInfo === 'true') return;
    container.dataset.rovalraExperienceInfo = 'true';

    if (!(await settings.experienceInfoStatsEnabled)) return;

    const placeId = getPlaceIdFromUrl();
    if (!placeId) return;

    const info = await getExperienceInfo(placeId);
    if (!info) return;

    await addDateStats(container, info);

    if (info.devices.length > 0) {
        container.appendChild(await createDevicesStat(info.devices));
    }
    if (info.avatarType) {
        container.appendChild(await createAvatarTypeStat(info.avatarType));
    }

    hideRosealDuplicates(container);
}

export function init() {
    if (observerInitialized) return;
    observerInitialized = true;

    observeElement(STAT_CONTAINER_SELECTOR, addExperienceInfoStats, {
        multiple: true,
    });
    observeElement(
        `${STAT_CONTAINER_SELECTOR} > li.game-stat`,
        (stat) => hideRosealDuplicates(stat.parentElement),
        { multiple: true },
    );
}
