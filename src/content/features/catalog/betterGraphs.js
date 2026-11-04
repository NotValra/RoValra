import { observeElement, observeResize } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { settings } from '../../core/settings/getSettings.js';
import { ts } from '../../core/locale/i18n.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getCatalogItemDetailField } from '../../core/apis/catalog.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { createDropdown } from '../../core/ui/dropdown.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROOT_CLASS = 'rovalra-better-graph';
const ACTIVE_CLASS = 'rovalra-better-graph-active';
const DAY_MS = 86400000;
const MAX_POINTS = 140;
const LINE_HEIGHT = 200;
const VOLUME_HEIGHT = 48;
const PANE_GAP = 16;
const AXIS_HEIGHT = 24;
const AXIS_WIDTH = 48;
const TOP_PADDING = 8;
const RIGHT_PADDING = 8;
const Y_TICKS = 4;
const X_TICKS = 6;
const RANGES = [
    { key: '30d', days: 30 },
    { key: '90d', days: 90 },
    { key: '180d', days: 180 },
    { key: '1y', days: 365 },
    { key: 'all', days: Infinity },
];
const SERIES = ['price', 'volume'];
const LINE_SERIES = ['price'];

let observer = null;

export function bucketPoints(points, maxPoints = MAX_POINTS) {
    const size = Math.ceil(points.length / maxPoints);
    if (size <= 1) return points;
    const buckets = [];
    for (let i = 0; i < points.length; i += size) {
        const group = points.slice(i, i + size);
        const prices = group.map((point) => point.price).sort((a, b) => a - b);
        const middle = Math.floor(prices.length / 2);
        buckets.push({
            ...group.at(-1),
            price:
                prices.length % 2
                    ? prices[middle]
                    : (prices[middle - 1] + prices[middle]) / 2,
            volume: group.reduce((sum, point) => sum + point.volume, 0),
        });
    }
    return buckets;
}

export function niceTicks(min, max, count = Y_TICKS) {
    if (!(max > min)) {
        const value = Number.isFinite(min) ? min : 0;
        return [Math.max(0, value - 1), value + 1];
    }
    const rough = (max - min) / count;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step =
        [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) *
        magnitude;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks = [];
    for (let value = start; value <= end + step / 2; value += step) {
        ticks.push(Math.round(value * 1e6) / 1e6);
    }
    return ticks;
}

export function monotonePath(coords) {
    if (coords.length < 2) {
        return coords.length ? `M${coords[0][0]},${coords[0][1]}` : '';
    }
    const n = coords.length;
    const slopes = [];
    for (let i = 0; i < n - 1; i++) {
        const dx = coords[i + 1][0] - coords[i][0];
        slopes.push(dx ? (coords[i + 1][1] - coords[i][1]) / dx : 0);
    }
    const tangents = [slopes[0]];
    for (let i = 1; i < n - 1; i++) {
        tangents.push(
            slopes[i - 1] * slopes[i] <= 0
                ? 0
                : (slopes[i - 1] + slopes[i]) / 2,
        );
    }
    tangents.push(slopes[n - 2]);
    for (let i = 0; i < n - 1; i++) {
        if (slopes[i] === 0) {
            tangents[i] = 0;
            tangents[i + 1] = 0;
            continue;
        }
        const a = tangents[i] / slopes[i];
        const b = tangents[i + 1] / slopes[i];
        const sum = a * a + b * b;
        if (sum > 9) {
            const t = 3 / Math.sqrt(sum);
            tangents[i] = t * a * slopes[i];
            tangents[i + 1] = t * b * slopes[i];
        }
    }
    let path = `M${coords[0][0]},${coords[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = coords[i];
        const [x1, y1] = coords[i + 1];
        const dx = (x1 - x0) / 3;
        path += `C${x0 + dx},${y0 + tangents[i] * dx},${x1 - dx},${y1 - tangents[i + 1] * dx},${x1},${y1}`;
    }
    return path;
}

function svg(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    return element;
}

function formatNumber(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString() : '-';
}

function formatCompact(value) {
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function formatDate(date, withYear = true) {
    return date.toLocaleDateString(undefined, {
        year: withYear ? 'numeric' : undefined,
        month: 'short',
        day: 'numeric',
    });
}

async function loadData(assetId) {
    const collectibleItemId = await getCatalogItemDetailField(
        assetId,
        'Asset',
        'collectibleItemId',
    );
    if (!collectibleItemId) return null;

    const resale = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/marketplace-sales/v1/item/${collectibleItemId}/resale-data`,
    });

    const volumes = new Map(
        (resale?.volumeDataPoints || []).map((point) => [
            point.date,
            point.value,
        ]),
    );
    const points = (resale?.priceDataPoints || [])
        .map((point) => ({
            date: new Date(point.date),
            price: point.value,
            volume: volumes.get(point.date) || 0,
        }))
        .filter((point) => !Number.isNaN(point.date.getTime()))
        .sort((a, b) => a.date - b.date);
    if (points.length < 2) return null;

    return { points };
}

function createChart(root, data) {
    const state = {
        range: '180d',
        hidden: new Set(),
        hoverIndex: null,
        width: 0,
        points: [],
    };

    const top = document.createElement('div');
    top.className = 'rovalra-better-graph-top';
    const summary = document.createElement('div');
    summary.className = 'rovalra-better-graph-summary';
    const summaryLabel = document.createElement('span');
    summaryLabel.className = 'rovalra-better-graph-summary-label';
    summaryLabel.textContent = ts('betterGraphs.summary');
    const summaryRow = document.createElement('div');
    summaryRow.className = 'rovalra-better-graph-summary-row';
    const summaryValue = document.createElement('span');
    summaryValue.className = 'rovalra-better-graph-summary-value';
    const summaryChange = document.createElement('span');
    summaryChange.className = 'rovalra-better-graph-change';
    summaryRow.append(
        createRobuxIcon({ size: '20px' }),
        summaryValue,
        summaryChange,
    );
    summary.append(summaryLabel, summaryRow);

    const rangeDropdown = createDropdown({
        items: RANGES.map((range) => ({
            value: range.key,
            label: ts(`betterGraphs.ranges.${range.key}`),
        })),
        initialValue: state.range,
        onValueChange: (value) => {
            state.range = value;
            state.hoverIndex = null;
            render();
        },
    });
    rangeDropdown.element.classList.add('rovalra-better-graph-range');
    top.append(summary, rangeDropdown.element);

    const plot = document.createElement('div');
    plot.className = 'rovalra-better-graph-plot';
    const chart = svg('svg', { class: 'rovalra-better-graph-svg' });
    const tooltip = document.createElement('div');
    tooltip.className = 'rovalra-better-graph-tooltip';
    tooltip.hidden = true;
    plot.append(chart, tooltip);

    const legend = document.createElement('div');
    legend.className = 'rovalra-better-graph-legend';
    for (const series of SERIES) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `rovalra-better-graph-legend-item rovalra-series-${series}`;
        item.dataset.series = series;
        const marker = document.createElement('span');
        marker.className = 'rovalra-better-graph-marker';
        const label = document.createElement('span');
        label.textContent = ts(`betterGraphs.series.${series}`);
        item.append(marker, label);
        item.addEventListener('click', () => {
            if (state.hidden.has(series)) state.hidden.delete(series);
            else state.hidden.add(series);
            render();
        });
        legend.append(item);
    }

    root.append(top, plot, legend);

    function getVisiblePoints() {
        const days = RANGES.find((range) => range.key === state.range).days;
        let visible = data.points;
        if (Number.isFinite(days)) {
            const last = data.points.at(-1).date.getTime();
            visible = data.points.filter(
                (point) => last - point.date.getTime() <= days * DAY_MS,
            );
            if (visible.length < 2) visible = data.points.slice(-2);
        }
        return bucketPoints(visible);
    }

    function updateSummary(points) {
        const average =
            points.reduce((sum, point) => sum + point.price, 0) / points.length;
        summaryValue.textContent = formatNumber(average);
        const first = points[0].price;
        const change = first
            ? ((points.at(-1).price - first) / first) * 100
            : 0;
        summaryChange.textContent = `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`;
        summaryChange.classList.toggle('is-down', change < 0);
    }

    function updateTooltip(points, x) {
        if (state.hoverIndex === null) {
            tooltip.hidden = true;
            return;
        }
        const point = points[state.hoverIndex];
        const title = document.createElement('div');
        title.className = 'rovalra-better-graph-tooltip-title';
        title.textContent = formatDate(point.date);
        const rows = SERIES.filter((series) => !state.hidden.has(series)).map(
            (series) => {
                const row = document.createElement('div');
                row.className = `rovalra-better-graph-tooltip-row rovalra-series-${series}`;
                const marker = document.createElement('span');
                marker.className = 'rovalra-better-graph-marker';
                const name = document.createElement('span');
                name.textContent = ts(`betterGraphs.series.${series}`);
                const value = document.createElement('strong');
                value.textContent = formatNumber(point[series]);
                row.append(marker, name, value);
                return row;
            },
        );
        tooltip.replaceChildren(title, ...rows);
        tooltip.hidden = false;
        const flip = x > state.width / 2;
        tooltip.style.left = flip ? '' : `${x + 12}px`;
        tooltip.style.right = flip ? `${state.width - x + 12}px` : '';
    }

    function render() {
        const points = getVisiblePoints();
        state.points = points;
        const width = state.width || root.clientWidth || 600;
        const showVolume = !state.hidden.has('volume');
        const lineBottom = TOP_PADDING + LINE_HEIGHT;
        const volumeTop = lineBottom + PANE_GAP;
        const height =
            (showVolume ? volumeTop + VOLUME_HEIGHT : lineBottom) + AXIS_HEIGHT;
        const left = AXIS_WIDTH;
        const right = width - RIGHT_PADDING;

        chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
        chart.setAttribute('height', height);
        chart.replaceChildren();

        legend.querySelectorAll('button').forEach((item) => {
            item.classList.toggle(
                'is-hidden',
                state.hidden.has(item.dataset.series),
            );
        });

        const lines = LINE_SERIES.filter((series) => !state.hidden.has(series));
        const values = lines.flatMap((series) =>
            points.map((point) => point[series]),
        );
        const ticks = niceTicks(
            values.length ? Math.min(...values) : 0,
            values.length ? Math.max(...values) : 1,
        );
        const min = ticks[0];
        const max = ticks.at(-1);
        const x = (i) =>
            left +
            (points.length > 1 ? i / (points.length - 1) : 0) * (right - left);
        const y = (value) =>
            TOP_PADDING + (1 - (value - min) / (max - min || 1)) * LINE_HEIGHT;

        for (const tick of ticks) {
            chart.append(
                svg('line', {
                    class: 'rovalra-better-graph-grid',
                    x1: left,
                    x2: right,
                    y1: y(tick),
                    y2: y(tick),
                }),
            );
            const label = svg('text', {
                class: 'rovalra-better-graph-axis',
                x: left - 10,
                y: y(tick) + 4,
                'text-anchor': 'end',
            });
            label.textContent = formatCompact(tick);
            chart.append(label);
        }

        if (showVolume) {
            const maxVolume = Math.max(...points.map((p) => p.volume), 1);
            const barWidth = Math.max(
                1,
                ((right - left) / points.length) * 0.6,
            );
            for (const [i, point] of points.entries()) {
                const barHeight = (point.volume / maxVolume) * VOLUME_HEIGHT;
                chart.append(
                    svg('rect', {
                        class: `rovalra-better-graph-bar${state.hoverIndex === i ? ' is-active' : ''}`,
                        x: x(i) - barWidth / 2,
                        y: volumeTop + VOLUME_HEIGHT - barHeight,
                        width: barWidth,
                        height: barHeight,
                    }),
                );
            }
        }

        const span = points.at(-1).date - points[0].date;
        const withYear = span > 300 * DAY_MS;
        const labelCount = Math.min(X_TICKS, points.length);
        const axisY = height - 6;
        for (let t = 0; t < labelCount; t++) {
            const i = Math.round(
                (t / (labelCount - 1 || 1)) * (points.length - 1),
            );
            const label = svg('text', {
                class: 'rovalra-better-graph-axis',
                x: x(i),
                y: axisY,
                'text-anchor':
                    t === 0 ? 'start' : t === labelCount - 1 ? 'end' : 'middle',
            });
            label.textContent = formatDate(points[i].date, withYear);
            chart.append(label);
        }

        for (const series of [...lines].reverse()) {
            chart.append(
                svg('path', {
                    class: `rovalra-better-graph-line rovalra-series-${series}`,
                    d: monotonePath(
                        points.map((point, i) => [x(i), y(point[series])]),
                    ),
                }),
            );
        }

        if (state.hoverIndex !== null) {
            const cx = x(state.hoverIndex);
            chart.append(
                svg('line', {
                    class: 'rovalra-better-graph-cursor',
                    x1: cx,
                    x2: cx,
                    y1: TOP_PADDING,
                    y2: height - AXIS_HEIGHT,
                }),
            );
            for (const series of lines) {
                chart.append(
                    svg('circle', {
                        class: `rovalra-better-graph-point rovalra-series-${series}`,
                        cx,
                        cy: y(points[state.hoverIndex][series]),
                        r: 4,
                    }),
                );
            }
            updateTooltip(points, cx);
        } else {
            updateTooltip(points, 0);
        }

        updateSummary(points);
    }

    function setHover(event) {
        const rect = chart.getBoundingClientRect();
        const scale = rect.width / (state.width || rect.width);
        const plotLeft = AXIS_WIDTH * scale;
        const plotWidth = (state.width - AXIS_WIDTH - RIGHT_PADDING) * scale;
        const ratio = (event.clientX - rect.left - plotLeft) / plotWidth;
        const index = Math.min(
            state.points.length - 1,
            Math.max(0, Math.round(ratio * (state.points.length - 1))),
        );
        if (index !== state.hoverIndex) {
            state.hoverIndex = index;
            render();
        }
    }

    chart.addEventListener('pointermove', setHover);
    chart.addEventListener('pointerleave', () => {
        state.hoverIndex = null;
        render();
    });

    observeResize(plot, (entry) => {
        const width = Math.round(entry.contentRect.width);
        if (width && width !== state.width) {
            state.width = width;
            render();
        }
    });
    state.width = plot.clientWidth || root.clientWidth || 600;
    render();
}

async function mount(chartsContainer) {
    if (chartsContainer.querySelector(`.${ROOT_CLASS}`)) return;
    const assetId = getPlaceIdFromUrl();
    if (!assetId) return;

    try {
        const data = await loadData(assetId);
        if (!data || chartsContainer.querySelector(`.${ROOT_CLASS}`)) return;

        const root = document.createElement('div');
        root.className = ROOT_CLASS;
        const infoRow = chartsContainer.querySelector(':scope > .clearfix');
        if (infoRow) infoRow.before(root);
        else chartsContainer.append(root);
        chartsContainer.classList.add(ACTIVE_CLASS);
        createChart(root, data);
    } catch (error) {
        console.error('RoValra: Failed to build better graphs', error);
    }
}

export async function init() {
    observer?.disconnect();
    observer = null;

    if (
        !/\/catalog\/\d+/i.test(window.location.pathname) ||
        !(await settings.betterGraphsEnabled)
    ) {
        return;
    }

    observer = observeElement(
        '#price-chart .price-volume-charts-container',
        mount,
    );
}
