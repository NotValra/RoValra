import { addTooltip } from './tooltip.js';

const DEFAULT_HEIGHT = 160;
const MIN_BAR_WIDTH = 6;
const BAR_GAP = 2;

/**
 * @param {Object} options
 * @param {Array<{label: string, value: number, tooltip?: string}>} [options.data]
 * @param {number} [options.height] Height of the plot area in pixels
 * @param {(value: number) => string} [options.formatValue] Used for the axis and default tooltips
 * @param {string} [options.barColor] Any CSS color
 * @param {string} [options.emptyText] Shown when there is no data
 * @param {number} [options.maxLabels] Max number of x-axis labels to show
 * @param {(index: number|null, item: Object|null) => void} [options.onSelect] Makes bars clickable, clicking the selected bar again clears it
 * @returns {{element: HTMLElement, update: (data: Array) => void, setSelected: (index: number|null) => void}}
 */
export function createBarChart({
    data = [],
    height = DEFAULT_HEIGHT,
    formatValue = (value) => value.toLocaleString(),
    barColor = 'var(--rovalra-playbutton-color, #3fc679)',
    emptyText = '',
    maxLabels = 8,
    onSelect = null,
} = {}) {
    const element = document.createElement('div');
    element.className = 'rovalra-bar-chart';
    element.style.display = 'flex';
    element.style.gap = '8px';
    element.style.width = '100%';

    const axis = document.createElement('div');
    axis.style.display = 'flex';
    axis.style.flexDirection = 'column';
    axis.style.justifyContent = 'space-between';
    axis.style.alignItems = 'flex-end';
    axis.style.height = `${height}px`;
    axis.style.fontSize = '11px';
    axis.style.color = 'var(--rovalra-secondary-text-color)';
    axis.style.flex = '0 0 auto';

    const scroller = document.createElement('div');
    scroller.style.flex = '1';
    scroller.style.minWidth = '0';
    scroller.style.overflowX = 'auto';
    scroller.style.overflowY = 'hidden';

    const plot = document.createElement('div');
    plot.style.display = 'flex';
    plot.style.alignItems = 'flex-end';
    plot.style.gap = `${BAR_GAP}px`;
    plot.style.height = `${height}px`;
    plot.style.borderBottom =
        '1px solid var(--rovalra-border-color, rgba(255, 255, 255, 0.12))';
    plot.style.backgroundImage =
        'linear-gradient(to bottom, var(--rovalra-border-color, rgba(255, 255, 255, 0.12)) 1px, transparent 1px)';
    plot.style.backgroundSize = `100% ${height / 2}px`;

    const labels = document.createElement('div');
    labels.style.display = 'flex';
    labels.style.gap = `${BAR_GAP}px`;
    labels.style.marginTop = '4px';
    labels.style.fontSize = '11px';
    labels.style.color = 'var(--rovalra-secondary-text-color)';

    scroller.append(plot, labels);
    element.append(axis, scroller);

    let bars = [];
    let selectedIndex = null;

    const paintBars = (hoverIndex = null) => {
        bars.forEach((bar, index) => {
            let opacity = 1;
            if (selectedIndex !== null && index !== selectedIndex) {
                opacity = index === hoverIndex ? 0.75 : 0.4;
            } else if (selectedIndex === null && index === hoverIndex) {
                opacity = 0.7;
            }
            bar.style.opacity = String(opacity);
        });
    };

    const setSelected = (index) => {
        selectedIndex = index ?? null;
        paintBars();
    };

    const update = (nextData = []) => {
        bars = [];
        selectedIndex = null;
        plot.replaceChildren();
        labels.replaceChildren();
        axis.replaceChildren();

        if (!nextData.length) {
            const empty = document.createElement('div');
            empty.textContent = emptyText;
            empty.style.margin = 'auto';
            empty.style.color = 'var(--rovalra-secondary-text-color)';
            plot.appendChild(empty);
            return;
        }

        const max = Math.max(
            ...nextData.map((item) => Number(item.value) || 0),
        );
        for (const value of [max, max / 2, 0]) {
            const tick = document.createElement('span');
            tick.textContent = formatValue(Math.round(value));
            axis.appendChild(tick);
        }

        const labelEvery = Math.max(1, Math.ceil(nextData.length / maxLabels));
        nextData.forEach((item, index) => {
            const value = Number(item.value) || 0;

            const column = document.createElement('div');
            column.style.flex = `1 0 ${MIN_BAR_WIDTH}px`;
            column.style.height = '100%';
            column.style.display = 'flex';
            column.style.alignItems = 'flex-end';
            column.style.cursor = onSelect ? 'pointer' : 'default';

            const bar = document.createElement('div');
            bar.style.width = '100%';
            bar.style.height = max > 0 ? `${(value / max) * 100}%` : '0';
            bar.style.minHeight = value > 0 ? '2px' : '0';
            bar.style.background = barColor;
            bar.style.borderRadius = '3px 3px 0 0';
            bar.style.transition = 'opacity 0.15s';
            column.appendChild(bar);
            bars.push(bar);
            column.addEventListener('mouseenter', () => paintBars(index));
            column.addEventListener('mouseleave', () => paintBars());
            if (onSelect) {
                column.addEventListener('click', () => {
                    setSelected(selectedIndex === index ? null : index);
                    onSelect(
                        selectedIndex,
                        selectedIndex === null ? null : item,
                    );
                });
            }
            addTooltip(
                column,
                item.tooltip ?? `${item.label}: ${formatValue(value)}`,
                { position: 'top' },
            );
            plot.appendChild(column);

            const label = document.createElement('div');
            label.style.flex = `1 0 ${MIN_BAR_WIDTH}px`;
            label.style.position = 'relative';
            label.style.height = '14px';
            if (index % labelEvery === 0) {
                const text = document.createElement('span');
                text.textContent = item.label;
                text.style.position = 'absolute';
                text.style.left = '0';
                text.style.whiteSpace = 'nowrap';
                label.appendChild(text);
            }
            labels.appendChild(label);
        });
    };

    update(data);
    return { element, update, setSelected };
}
