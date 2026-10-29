import { observeChildren, observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import {
    getUniverseIdsFromPlaceIds,
    getUniversesDetails,
} from '../../core/apis/games.js';
import {
    createThumbnailElement,
    fetchThumbnails,
} from '../../core/thumbnail/thumbnails.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';
import { createBarChart } from '../../core/ui/barChart.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getCurrentUserTier } from '../../core/settings/handlesettings.js';
import { updateUserSettingViaApi } from '../../core/donators/settingHandler.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { createToggle } from '../../core/ui/general/toggle.js';
import { showSystemAlert } from '../../core/ui/roblox/alert.js';

const SECTION_CLASS = 'rovalra-profile-playtime';
const DAY_MS = 24 * 60 * 60 * 1000;
const CELL_SIZE = 10;
const CELL_GAP = 3;
const LEFT_PADDING = 30;
const TOP_PADDING = 20;
const DAILY_BARS_MAX_DAYS = 90;
const TOOLTIP_GAMES = 5;
const LIST_GAMES = 10;
const LEVELS = [
    { min: 2 * 3600, opacity: 1.0 },
    { min: 3600, opacity: 0.8 },
    { min: 30 * 60, opacity: 0.6 },
    { min: 1, opacity: 0.4 },
];

const heatmapCache = new Map();
const PUBLIC_TIER = 3;
const VISIBILITY_API_KEY = 'public_playtime';

const parseDay = (day) => {
    const [year, month, date] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
};
const toDayKey = (time) => new Date(time).toISOString().slice(0, 10);
const formatDate = (time, options) =>
    new Date(time).toLocaleDateString(undefined, {
        ...options,
        timeZone: 'UTC',
    });

const escapeHtml = (text) =>
    String(text).replace(
        /[&<>"']/g,
        (char) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[char],
    );

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    if (!hours) return `${Math.max(seconds > 0 ? 1 : 0, minutes)}m`;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatTotal(seconds) {
    if (seconds >= 3600) {
        const hours = seconds / 3600;
        const value = hours >= 10 ? Math.round(hours) : hours.toFixed(1);
        return ts('playtime.hours', { value: value.toLocaleString() });
    }
    return ts('playtime.minutes', {
        value: Math.max(1, Math.round(seconds / 60)),
    });
}

function getHeatmap(userId) {
    if (!heatmapCache.has(userId)) {
        heatmapCache.set(
            userId,
            callRobloxApiJson({
                subdomain: 'apis',
                isRovalraApi: true,
                endpoint: `/v1/users/${userId}/playtime/heatmap?granularity=day`,
            }).catch((error) => {
                heatmapCache.delete(userId);
                throw error;
            }),
        );
    }
    return heatmapCache.get(userId);
}

async function getPlaceNames(placeIds) {
    const universeIds = await getUniverseIdsFromPlaceIds(placeIds);
    const ids = [...new Set(universeIds.values())];
    const universeNames = new Map();
    for (let i = 0; i < ids.length; i += 50) {
        const games = await getUniversesDetails(ids.slice(i, i + 50));
        for (const game of games) {
            universeNames.set(Number(game.id), game.name);
        }
    }

    const names = new Map();
    for (const [placeId, universeId] of universeIds) {
        const name = universeNames.get(universeId);
        if (name) names.set(placeId, name);
    }
    return names;
}

function summarize(buckets) {
    const totals = new Map();
    for (const bucket of buckets) {
        totals.set(
            bucket.placeId,
            (totals.get(bucket.placeId) || 0) + bucket.seconds,
        );
    }
    return [...totals]
        .map(([placeId, seconds]) => ({ placeId, seconds }))
        .sort((a, b) => b.seconds - a.seconds);
}

function createGamesTooltip(title, games, names) {
    const total = games.reduce((sum, game) => sum + game.seconds, 0);
    const lines = [`<b>${escapeHtml(title)}</b> · ${formatDuration(total)}`];
    for (const game of games.slice(0, TOOLTIP_GAMES)) {
        const name = names.get(game.placeId) || ts('common.unknown');
        lines.push(`${escapeHtml(name)} · ${formatDuration(game.seconds)}`);
    }
    if (games.length > TOOLTIP_GAMES) {
        lines.push(
            ts('playtime.moreGames', { count: games.length - TOOLTIP_GAMES }),
        );
    }
    return lines.join('<br>');
}

function renderHeatmap({ start, end, bucketsByDay, names, onSelect }) {
    const gridStart = start - new Date(start).getUTCDay() * DAY_MS;
    const weeks = Math.floor((end - gridStart) / DAY_MS / 7) + 1;
    const weekWidth = CELL_SIZE + CELL_GAP;
    const gridHeight = 7 * weekWidth;
    const legendY = TOP_PADDING + gridHeight + 8;
    const totalWidth = LEFT_PADDING + weeks * weekWidth;
    const totalHeight = legendY + CELL_SIZE + 4;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.style.display = 'block';

    const addText = (text, x, y, anchor = 'start') => {
        const element = document.createElementNS(svgNS, 'text');
        element.setAttribute('x', x);
        element.setAttribute('y', y);
        element.setAttribute('font-size', '9');
        element.setAttribute('text-anchor', anchor);
        element.setAttribute('fill', 'var(--rovalra-secondary-text-color)');
        element.textContent = text;
        svg.appendChild(element);
    };

    const createCell = (x, y, opacity) => {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', CELL_SIZE);
        rect.setAttribute('height', CELL_SIZE);
        rect.setAttribute('rx', 2);
        rect.setAttribute(
            'fill',
            opacity
                ? 'var(--rovalra-playbutton-color)'
                : 'var(--rovalra-border-color)',
        );
        rect.setAttribute('fill-opacity', opacity || 1);
        svg.appendChild(rect);
        return rect;
    };

    [1, 3, 5].forEach((dayIndex) => {
        addText(
            formatDate(gridStart + dayIndex * DAY_MS, { weekday: 'short' }),
            LEFT_PADDING - 5,
            TOP_PADDING + dayIndex * weekWidth + CELL_SIZE - 1,
            'end',
        );
    });

    let lastMonth = null;
    let selectedCell = null;
    for (let week = 0; week < weeks; week++) {
        const weekStart = gridStart + week * 7 * DAY_MS;
        const month = new Date(weekStart).getUTCMonth();
        if (month !== lastMonth && week > 0 && week < weeks - 2) {
            addText(
                formatDate(weekStart, { month: 'short' }),
                LEFT_PADDING + week * weekWidth,
                10,
            );
        }
        lastMonth = month;

        for (let day = 0; day < 7; day++) {
            const time = weekStart + day * DAY_MS;
            if (time < start || time > end) continue;

            const buckets = bucketsByDay.get(toDayKey(time)) || [];
            const games = summarize(buckets);
            const seconds = games.reduce((sum, game) => sum + game.seconds, 0);
            const level = LEVELS.find((entry) => seconds >= entry.min);
            const cell = createCell(
                LEFT_PADDING + week * weekWidth,
                TOP_PADDING + day * weekWidth,
                level?.opacity,
            );
            const dateLabel = formatDate(time, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });

            if (!seconds) {
                addTooltip(
                    cell,
                    `${escapeHtml(dateLabel)} · ${ts('playtime.noActivity')}`,
                    { position: 'top' },
                );
                continue;
            }

            cell.style.cursor = 'pointer';
            addTooltip(cell, createGamesTooltip(dateLabel, games, names), {
                position: 'top',
            });
            cell.addEventListener('click', () => {
                selectedCell?.removeAttribute('stroke');
                if (selectedCell === cell) {
                    selectedCell = null;
                    onSelect(null);
                    return;
                }
                selectedCell = cell;
                cell.setAttribute(
                    'stroke',
                    'var(--rovalra-main-text-color, currentColor)',
                );
                cell.setAttribute('stroke-width', '1');
                onSelect({
                    title: ts('playtime.playedOn', {
                        date: formatDate(time, { dateStyle: 'long' }),
                    }),
                    buckets,
                });
            });
        }
    }

    const legendLevels = [0, ...LEVELS.map((level) => level.opacity).reverse()];
    let legendX = totalWidth - legendLevels.length * weekWidth - CELL_GAP - 50;
    addText(ts('common.less'), legendX, legendY + CELL_SIZE - 1);
    legendX += 25;
    for (const opacity of legendLevels) {
        createCell(legendX, legendY, opacity);
        legendX += weekWidth;
    }
    addText(ts('common.more'), legendX + 2, legendY + CELL_SIZE - 1);

    return {
        element: svg,
        clearSelection: () => {
            selectedCell?.removeAttribute('stroke');
            selectedCell = null;
        },
    };
}
function buildBars(buckets, end, names) {
    const firstActive = Math.min(...buckets.map((b) => parseDay(b.time)));
    const daily = (end - firstActive) / DAY_MS <= DAILY_BARS_MAX_DAYS;
    const step = daily ? DAY_MS : 7 * DAY_MS;
    const first = daily
        ? firstActive
        : firstActive - new Date(firstActive).getUTCDay() * DAY_MS;

    const bars = [];
    for (let time = first; time <= end; time += step) {
        bars.push({ start: time, buckets: [] });
    }
    for (const bucket of buckets) {
        const index = Math.floor((parseDay(bucket.time) - first) / step);
        bars[index]?.buckets.push(bucket);
    }

    return bars.map((bar) => {
        const games = summarize(bar.buckets);
        const label = formatDate(bar.start, { month: 'short', day: 'numeric' });
        const title = daily
            ? ts('playtime.playedOn', {
                  date: formatDate(bar.start, { dateStyle: 'long' }),
              })
            : ts('playtime.weekOf', {
                  date: formatDate(bar.start, { dateStyle: 'long' }),
              });
        return {
            label,
            title,
            buckets: bar.buckets,
            value: games.reduce((sum, game) => sum + game.seconds, 0),
            tooltip: games.length
                ? createGamesTooltip(title, games, names)
                : `${escapeHtml(title)} · ${ts('playtime.noActivity')}`,
        };
    });
}

function renderGameList(container, title, buckets, names, thumbnails) {
    const games = summarize(buckets);
    const max = games[0]?.seconds || 1;

    const heading = document.createElement('div');
    heading.className = 'rovalra-profile-playtime-list-title';
    heading.textContent = title;

    const list = document.createElement('div');
    list.className = 'rovalra-profile-playtime-list';
    for (const game of games.slice(0, LIST_GAMES)) {
        const name = names.get(game.placeId) || ts('common.unknown');

        const row = document.createElement('a');
        row.className = 'rovalra-profile-playtime-row';
        row.href = `https://www.roblox.com/games/${game.placeId}`;

        const icon = createThumbnailElement(
            thumbnails.get(game.placeId),
            name,
            'rovalra-profile-playtime-icon',
            { width: '36px', height: '36px' },
        );

        const info = document.createElement('div');
        info.className = 'rovalra-profile-playtime-info';
        const nameElement = document.createElement('span');
        nameElement.className = 'rovalra-profile-playtime-name';
        nameElement.textContent = name;
        const track = document.createElement('div');
        track.className = 'rovalra-profile-playtime-track';
        const fill = document.createElement('div');
        fill.style.width = `${(game.seconds / max) * 100}%`;
        track.appendChild(fill);
        info.append(nameElement, track);

        const time = document.createElement('span');
        time.className = 'rovalra-profile-playtime-time';
        time.textContent = formatDuration(game.seconds);

        row.append(icon, info, time);
        list.appendChild(row);
    }

    container.replaceChildren(heading, list);
}

async function isPlaytimePublic() {
    const data = await callRobloxApiJson({
        isRovalraApi: true,
        subdomain: 'apis',
        endpoint: '/v1/auth/settings',
        method: 'GET',
        retryOnTransientStatus: false,
    });
    const value = data?.settings?.[VISIBILITY_API_KEY];
    return (
        value === true ||
        ['true', '1', 't', 'yes', 'public'].includes(
            String(value).toLowerCase(),
        )
    );
}

async function createVisibilityToggle() {
    const [tier, isPublic] = await Promise.all([
        getCurrentUserTier().catch(() => 0),
        isPlaytimePublic().catch(() => false),
    ]);
    const isLocked = tier < PUBLIC_TIER;

    const wrapper = document.createElement('label');
    wrapper.className = `${SECTION_CLASS}-visibility`;
    const text = document.createElement('span');
    text.textContent = ts('playtime.public');

    const toggle = createToggle({
        checked: isPublic,
        onChange: async (checked) => {
            toggle.disabled = true;
            try {
                const saved = await updateUserSettingViaApi(
                    VISIBILITY_API_KEY,
                    checked,
                    { throwOnError: true, suppressErrorLog: true },
                );
                if (saved === false) throw new Error('Not saved');
                await chrome.storage.local.set({
                    profilePlaytimePublic: checked,
                });
            } catch (error) {
                toggle.classList.toggle('on', !checked);
                toggle.setAttribute('aria-checked', !checked);
                showSystemAlert(
                    error?.userMessage || ts('playtime.publicFailed'),
                    'warning',
                );
            } finally {
                toggle.disabled = false;
            }
        },
    });
    wrapper.append(text, toggle);

    if (isLocked) {
        toggle.disabled = true;
        wrapper.classList.add('disabled');
        addTooltip(wrapper, ts('playtime.publicLocked'));
    } else {
        addTooltip(wrapper, ts('playtime.publicTooltip'));
    }
    return wrapper;
}

function createSampleBuckets(end) {
    let seed = 1337;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    const buckets = [];
    for (let day = 69; day >= 0; day--) {
        if (random() < 0.45) continue;
        const time = toDayKey(end - day * DAY_MS);
        const games = 1 + Math.floor(random() * 3);
        for (let game = 0; game < games; game++) {
            buckets.push({
                placeId: 1 + Math.floor(random() * 5),
                seconds: 300 + Math.floor(random() * 8700),
                time,
            });
        }
    }
    return buckets;
}

function createPreviewOverlay() {
    const overlay = document.createElement('div');
    overlay.className = `${SECTION_CLASS}-preview-overlay`;
    const title = document.createElement('div');
    title.className = `${SECTION_CLASS}-preview-title`;
    title.textContent = ts('playtime.previewOwnTitle');
    const text = document.createElement('div');
    text.className = `${SECTION_CLASS}-preview-text`;
    text.textContent = ts('playtime.previewOwnText');
    overlay.append(title, text);
    return overlay;
}

async function addPlaytimeSection(content) {
    if (content.querySelector(`.${SECTION_CLASS}`)) return;
    const userId = Number(getUserIdFromUrl());
    if (!userId) return;

    const data = await getHeatmap(userId).catch(() => null);
    let buckets = ((data?.status === 'success' && data.buckets) || [])
        .map((bucket) => ({
            placeId: Number(bucket.placeId),
            seconds: Number(bucket.seconds),
            time: bucket.time,
        }))
        .filter((bucket) => bucket.placeId > 0 && bucket.seconds > 0);
    if (content.querySelector(`.${SECTION_CLASS}`)) return;

    const isOwnProfile =
        Number(await getAuthenticatedUserId().catch(() => 0)) === userId;
    const isPreview = !buckets.length;
    if (isPreview && !isOwnProfile) return;

    const end = data?.end ? parseDay(data.end) : parseDay(toDayKey(Date.now()));
    const start = data?.start ? parseDay(data.start) : end - 364 * DAY_MS;
    if (isPreview) buckets = createSampleBuckets(end);

    const placeIds = [...new Set(buckets.map((bucket) => bucket.placeId))];
    const [names, thumbnails, visibilityToggle] = await Promise.all([
        isPreview
            ? new Map(
                  placeIds.map((id) => [
                      id,
                      ts('playtime.sampleGame', { number: id }),
                  ]),
              )
            : getPlaceNames(placeIds),
        isPreview
            ? new Map()
            : fetchThumbnails(
                  placeIds.map((id) => ({ id })),
                  'PlaceIcon',
                  '150x150',
              ),
        isOwnProfile ? createVisibilityToggle() : null,
    ]);
    if (!content.isConnected || content.querySelector(`.${SECTION_CLASS}`)) {
        return;
    }
    const bucketsByDay = new Map();
    for (const bucket of buckets) {
        if (!bucketsByDay.has(bucket.time)) bucketsByDay.set(bucket.time, []);
        bucketsByDay.get(bucket.time).push(bucket);
    }
    const totalSeconds = isPreview
        ? 0
        : (data.totalSeconds ?? buckets.reduce((sum, b) => sum + b.seconds, 0));

    const section = document.createElement('div');
    section.className = SECTION_CLASS;

    const header = document.createElement('div');
    header.className = `${SECTION_CLASS}-header`;
    const title = document.createElement('h2');
    title.className = 'content-emphasis text-heading-small padding-none';
    title.textContent = ts('playtime.topic');
    const total = document.createElement('span');
    total.className = `${SECTION_CLASS}-total`;
    const totalValue = document.createElement('b');
    totalValue.textContent = isPreview
        ? ts('playtime.minutes', { value: 0 })
        : formatTotal(totalSeconds);
    total.append(`${ts('playtime.totalLabel')} `, totalValue);
    const headerInfo = document.createElement('div');
    headerInfo.className = `${SECTION_CLASS}-header-info`;
    headerInfo.append(total);
    if (visibilityToggle) headerInfo.append(visibilityToggle);
    header.append(title, headerInfo);

    const details = document.createElement('div');
    const showDetails = (selection) =>
        renderGameList(
            details,
            selection?.title || ts('playtime.mostPlayed'),
            selection?.buckets || buckets,
            names,
            thumbnails,
        );

    let chart = null;
    const heatmap = renderHeatmap({
        start,
        end,
        bucketsByDay,
        names,
        onSelect: (selection) => {
            chart?.setSelected(null);
            showDetails(selection);
        },
    });
    const heatmapContainer = document.createElement('div');
    heatmapContainer.className = `${SECTION_CLASS}-heatmap`;
    heatmapContainer.appendChild(heatmap.element);

    const bars = buildBars(buckets, end, names);
    chart = createBarChart({
        data: bars,
        height: 140,
        formatValue: formatDuration,
        maxLabels: 10,
        onSelect: (_index, bar) => {
            heatmap.clearSelection();
            showDetails(bar?.buckets.length ? bar : null);
        },
    });

    showDetails(null);
    if (isPreview) {
        const preview = document.createElement('div');
        preview.className = `${SECTION_CLASS}-preview`;
        const body = document.createElement('div');
        body.className = `${SECTION_CLASS}-preview-body`;
        body.setAttribute('aria-hidden', 'true');
        body.inert = true;
        body.append(heatmapContainer, chart.element, details);
        preview.append(body, createPreviewOverlay());
        section.append(header, preview);
    } else {
        section.append(header, heatmapContainer, chart.element, details);
    }
    content.appendChild(section);

    const childObserver = observeChildren(content, () => {
        if (!content.isConnected || section.parentElement !== content) {
            childObserver.disconnect();
        } else if (content.lastElementChild !== section) {
            content.appendChild(section);
        }
    });
}

export async function init() {
    if (!(await settings.profilePlaytimeEnabled)) return;

    observeElement(
        '.profile-content',
        (content) =>
            addPlaytimeSection(content).catch((error) =>
                console.warn('RoValra: Failed to load profile playtime', error),
            ),
        { multiple: true },
    );
}
