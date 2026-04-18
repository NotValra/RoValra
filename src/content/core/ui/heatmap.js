import { addTooltip } from './tooltip.js';
import { createInteractiveTimestamp } from './time/time.js';
import { createDropdown } from './dropdown.js';

function renderDetails(
    container,
    startStr,
    endStr,
    updates,
    timeframe = 'year',
) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.borderTop = '1px solid var(--divider-color)';
    wrapper.style.marginTop = '15px';
    wrapper.style.paddingTop = '10px';

    const startObj = new Date(startStr);
    const endObj = new Date(endStr);

    const dateOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    };

    const timeOptions = {
        hour: '2-digit',
        minute: '2-digit',
    };

    const dateFormatted = startObj.toLocaleDateString(undefined, dateOptions);

    const header = document.createElement('div');
    if (timeframe !== 'year') {
        const startFormatted = startObj.toLocaleTimeString(
            undefined,
            timeOptions,
        );
        const endFormatted = endObj.toLocaleTimeString(undefined, timeOptions);
        header.textContent = `Updates between ${startFormatted} - ${endFormatted} on ${dateFormatted}`;
    } else {
        header.textContent = `Updates on ${dateFormatted}`;
    }
    header.style.fontWeight = '600';
    header.style.fontSize = '16px';
    header.style.marginBottom = '8px';
    header.style.color = 'var(--rovalra-main-text-color, inherit)';

    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '0';

    updates.sort((a, b) => new Date(b.first_seen) - new Date(a.first_seen));

    updates.forEach((update) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid var(--divider-color)';
        li.style.fontSize = '14px';

        const timeElement = createInteractiveTimestamp(update.first_seen);

        const verSpan = document.createElement('span');
        verSpan.textContent = update.place_version
            ? `Version: ${update.place_version}`
            : '';
        verSpan.style.color = 'var(--rovalra-secondary-text-color)';

        li.appendChild(timeElement);
        li.appendChild(verSpan);
        list.appendChild(li);
    });

    if (list.lastChild) {
        list.lastChild.style.borderBottom = 'none';
    }

    wrapper.appendChild(header);
    wrapper.appendChild(list);
    container.appendChild(wrapper);
}

function injectHeatmapStyles() {
    if (document.getElementById('rovalra-heatmap-styles')) return;
    const style = document.createElement('style');
    style.id = 'rovalra-heatmap-styles';
    style.textContent = `
        @keyframes rovalra-heatmap-pop {
            0% { transform: scale(0); opacity: 0; }
            80% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
        }
        .rovalra-heatmap-cell-pop {
            animation: rovalra-heatmap-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
            transform-origin: center;
            transform-box: fill-box;
        }
    `;
    document.head.appendChild(style);
}

function _renderHeatmap(
    graphContainer,
    history,
    detailsContainer,
    timeframe = 'year',
    animate = false,
) {
    graphContainer.innerHTML = '';
    if (detailsContainer) detailsContainer.innerHTML = '';

    const today = new Date();
    let startDate = new Date(today);

    if (timeframe === 'week') {
        startDate.setDate(today.getDate() - 7);
    } else if (timeframe === 'month') {
        startDate.setMonth(today.getMonth() - 1);
    } else if (timeframe === '3months') {
        startDate.setMonth(today.getMonth() - 3);
    } else if (timeframe === '6months') {
        startDate.setMonth(today.getMonth() - 6);
    } else {
        startDate.setFullYear(today.getFullYear() - 1);
        startDate.setDate(startDate.getDate() - startDate.getDay());
    }
    startDate.setHours(0, 0, 0, 0);

    const totalDuration = today.getTime() - startDate.getTime();
    const slotDuration = totalDuration / 364;

    const updatesBySlot = {};
    if (history) {
        history.forEach((entry) => {
            const ts = new Date(entry.first_seen).getTime();
            if (ts >= startDate.getTime() && ts <= today.getTime()) {
                const slotIndex = Math.floor(
                    (ts - startDate.getTime()) / slotDuration,
                );
                const safeIndex = Math.max(0, Math.min(363, slotIndex));
                if (!updatesBySlot[safeIndex]) {
                    updatesBySlot[safeIndex] = [];
                }
                updatesBySlot[safeIndex].push(entry);
            }
        });
    }

    const cellSize = 10;
    const cellGap = 3;
    const weekWidth = cellSize + cellGap;
    const leftPadding = 30;
    const topPadding = 20;

    const weeks = 52;
    const width = weeks * weekWidth;
    const totalWidth = width + leftPadding;
    const height = 7 * (cellSize + cellGap);
    const legendHeight = 20;
    const totalHeight = topPadding + height + legendHeight + 10;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.style.display = 'block';

    const dayLabels = ['Mon', 'Wed', 'Fri'];
    const dayIndices = [1, 3, 5];

    if (timeframe === 'year') {
        dayIndices.forEach((dayIndex, i) => {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', leftPadding - 5);
            text.setAttribute(
                'y',
                topPadding + dayIndex * (cellSize + cellGap) + cellSize - 1,
            );
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('font-size', '9');
            text.setAttribute('fill', 'var(--rovalra-secondary-text-color)');
            text.textContent = dayLabels[i];
            svg.appendChild(text);
        });
    }

    let lastTopLabel = '';
    let firstLabelDrawn = false;

    for (let w = 0; w < 52; w++) {
        const colStartTime = new Date(
            startDate.getTime() + w * 7 * slotDuration,
        );
        let currentLabel = '';

        if (timeframe === 'week') {
            currentLabel = colStartTime.toLocaleDateString(undefined, {
                weekday: 'short',
            });
        } else if (timeframe === 'month') {
            if (w % 13 === 0) {
                currentLabel = colStartTime.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                });
            } else {
                currentLabel = lastTopLabel;
            }
        } else {
            currentLabel = colStartTime.toLocaleDateString(undefined, {
                month: 'short',
            });
        }

        if (currentLabel !== lastTopLabel) {
            if (firstLabelDrawn || timeframe !== 'year') {
                const text = document.createElementNS(svgNS, 'text');
                text.setAttribute('x', leftPadding + w * weekWidth);
                text.setAttribute('y', 10);
                text.setAttribute('font-size', '10');
                text.setAttribute(
                    'fill',
                    'var(--rovalra-secondary-text-color)',
                );
                text.textContent = currentLabel;
                svg.appendChild(text);
            }
            lastTopLabel = currentLabel;
            firstLabelDrawn = true;
        }

        for (let d = 0; d < 7; d++) {
            const slotIndex = w * 7 + d;
            const slotStartTime = new Date(
                startDate.getTime() + slotIndex * slotDuration,
            );

            if (slotStartTime > today) continue;

            const updates = updatesBySlot[slotIndex] || [];
            const count = updates.length;

            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', leftPadding + w * weekWidth);
            rect.setAttribute('y', topPadding + d * (cellSize + cellGap));
            rect.setAttribute('width', cellSize);
            rect.setAttribute('height', cellSize);
            rect.setAttribute('rx', 2);
            rect.setAttribute('ry', 2);

            if (count > 0) {
                if (animate) {
                    rect.classList.add('rovalra-heatmap-cell-pop');
                    rect.style.animationDelay = `${w * 2}ms`;
                }

                const slotEndTime = new Date(
                    slotStartTime.getTime() + slotDuration,
                );
                rect.setAttribute('fill', 'var(--rovalra-playbutton-color)');
                let opacity = 0.4;
                if (count >= 4) opacity = 1.0;
                else if (count === 3) opacity = 0.8;
                else if (count === 2) opacity = 0.6;

                rect.setAttribute('fill-opacity', opacity);

                rect.style.cursor = 'pointer';
                rect.addEventListener('click', () => {
                    renderDetails(
                        detailsContainer,
                        slotStartTime.toISOString(),
                        slotEndTime.toISOString(),
                        updates,
                        timeframe,
                    );
                });
            } else {
                rect.setAttribute('fill', 'var(--divider-color)');
                rect.setAttribute('fill-opacity', '0.5');
            }

            svg.appendChild(rect);

            let dateFormatted;
            if (timeframe === 'week' || timeframe === 'month') {
                dateFormatted = slotStartTime.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
            } else {
                dateFormatted = slotStartTime.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                });
            }

            const tooltipText = `${count} update${count !== 1 ? 's' : ''} near ${dateFormatted}`;
            addTooltip(rect, tooltipText, { position: 'top' });
        }
    }

    const legendY = topPadding + height + 15;
    const legendRectSize = 10;
    const legendGap = 3;

    const legendWidth = 25 + 5 * (legendRectSize + legendGap) + 25;
    let legendX = totalWidth - legendWidth;
    if (legendX < leftPadding) legendX = leftPadding;

    const lessText = document.createElementNS(svgNS, 'text');
    lessText.textContent = 'Less';
    lessText.setAttribute('font-size', '10');
    lessText.setAttribute('fill', 'var(--rovalra-secondary-text-color)');
    lessText.setAttribute('x', legendX);
    lessText.setAttribute('y', legendY + legendRectSize - 1);
    svg.appendChild(lessText);

    let currentX = legendX + 25;

    const levels = [
        { fill: 'var(--divider-color)', opacity: '0.5' },
        { fill: 'var(--rovalra-playbutton-color)', opacity: '0.4' },
        { fill: 'var(--rovalra-playbutton-color)', opacity: '0.6' },
        { fill: 'var(--rovalra-playbutton-color)', opacity: '0.8' },
        { fill: 'var(--rovalra-playbutton-color)', opacity: '1.0' },
    ];

    levels.forEach((level) => {
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('width', legendRectSize);
        r.setAttribute('height', legendRectSize);
        r.setAttribute('x', currentX);
        r.setAttribute('y', legendY);
        r.setAttribute('rx', 2);
        r.setAttribute('ry', 2);
        r.setAttribute('fill', level.fill);
        r.setAttribute('fill-opacity', level.opacity);
        svg.appendChild(r);
        currentX += legendRectSize + legendGap;
    });

    const now = new Date();
    const expiryDate = new Date(2027, 1, 15); // February 15, 2027
    if (now < expiryDate) {
        const noticeText = document.createElementNS(svgNS, 'text');
        noticeText.textContent =
            'Update history has only been tracking since February 15, 2026';
        noticeText.setAttribute('font-size', '9');
        noticeText.setAttribute('fill', 'var(--rovalra-secondary-text-color)');
        noticeText.setAttribute('x', leftPadding);
        noticeText.setAttribute('y', legendY + legendRectSize - 1);
        svg.appendChild(noticeText);
    }

    const moreText = document.createElementNS(svgNS, 'text');
    moreText.textContent = 'More';
    moreText.setAttribute('font-size', '10');
    moreText.setAttribute('fill', 'var(--rovalra-secondary-text-color)');
    moreText.setAttribute('x', currentX + 2);
    moreText.setAttribute('y', legendY + legendRectSize - 1);
    svg.appendChild(moreText);

    graphContainer.appendChild(svg);
}

export function createHeatmap(historyData, titleText = 'Update History') {
    injectHeatmapStyles();
    let filteredHistory = (historyData || []).filter((d) => {
        const date = new Date(d.first_seen);
        return !(
            date.getUTCFullYear() === 2026 &&
            date.getUTCMonth() === 1 &&
            date.getUTCDate() === 15
        );
    });

    const container = document.createElement('div');
    container.className = 'rovalra-heatmap-container';
    container.style.marginTop = '24px';
    container.style.marginBottom = '12px';
    container.style.width = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';

    const dropdownItems = [
        { label: 'Past Year', value: 'year' },
        { label: 'Past 6 Months', value: '6months' },
        { label: 'Past 3 Months', value: '3months' },
        { label: 'Past Month', value: 'month' },
        { label: 'Past Week', value: 'week' },
    ];

    const getStartTime = (tf) => {
        const today = new Date();
        const d = new Date(today);
        if (tf === 'week') d.setDate(today.getDate() - 7);
        else if (tf === 'month') d.setMonth(today.getMonth() - 1);
        else if (tf === '3months') d.setMonth(today.getMonth() - 3);
        else if (tf === '6months') d.setMonth(today.getMonth() - 6);
        else {
            d.setFullYear(today.getFullYear() - 1);
            d.setDate(d.getDate() - d.getDay());
        }
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };

    const calculateBestTimeframe = (data) => {
        if (!data || data.length === 0) return 'year';
        const oldestTs = Math.min(
            ...data.map((d) => new Date(d.first_seen).getTime()),
        );

        if (oldestTs >= getStartTime('week')) return 'week';
        if (oldestTs >= getStartTime('month')) return 'month';
        if (oldestTs >= getStartTime('3months')) return '3months';
        if (oldestTs >= getStartTime('6months')) return '6months';
        return 'year';
    };

    let defaultTimeframe = calculateBestTimeframe(filteredHistory);

    const title = document.createElement('h2');
    const initialSelected = dropdownItems.find(
        (i) => i.value === defaultTimeframe,
    );
    title.textContent = `${titleText} (${initialSelected.label})`;
    header.appendChild(title);

    const filterDropdown = createDropdown({
        items: dropdownItems,
        initialValue: defaultTimeframe,
        onValueChange: (value) => {
            const selected = dropdownItems.find((item) => item.value === value);
            if (selected) {
                title.textContent = `${titleText} (${selected.label})`;
            }
            _renderHeatmap(
                graphContainer,
                filteredHistory,
                detailsContainer,
                value,
            );
        },
    });
    filterDropdown.element.style.minWidth = '160px';
    if (filteredHistory.length === 0) {
        filterDropdown.element.style.display = 'none';
    }

    header.appendChild(filterDropdown.element);

    const graphContainer = document.createElement('div');
    graphContainer.style.overflowX = 'auto';
    graphContainer.style.width = '100%';
    graphContainer.style.display = 'flex';

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'rovalra-heatmap-details';
    detailsContainer.style.width = '100%';

    container.appendChild(header);
    container.appendChild(graphContainer);

    container.appendChild(detailsContainer);

    _renderHeatmap(
        graphContainer,
        filteredHistory,
        detailsContainer,
        defaultTimeframe,
        false,
    );

    container._updateData = (newData) => {
        filteredHistory = (newData || []).filter((d) => {
            const date = new Date(d.first_seen);
            return !(
                date.getUTCFullYear() === 2026 &&
                date.getUTCMonth() === 1 &&
                date.getUTCDate() === 15
            );
        });

        if (filteredHistory.length > 0) {
            filterDropdown.element.style.display = '';
        }

        const bestTf = calculateBestTimeframe(filteredHistory);
        const selected = dropdownItems.find((i) => i.value === bestTf);
        if (selected) {
            title.textContent = `${titleText} (${selected.label})`;
        }

        if (filterDropdown.setValue) {
            filterDropdown.setValue(bestTf);
        }

        _renderHeatmap(
            graphContainer,
            filteredHistory,
            detailsContainer,
            bestTf,
            true,
        );
    };

    return container;
}
