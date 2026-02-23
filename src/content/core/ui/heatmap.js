import { addTooltip } from './tooltip.js';
import { createInteractiveTimestamp } from './time/time.js';

function renderDetails(container, dateStr, updates) {
    container.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.style.borderTop = '1px solid var(--divider-color)';
    wrapper.style.marginTop = '15px';
    wrapper.style.paddingTop = '10px';
    
    const dateObj = new Date(dateStr);
    const dateFormatted = dateObj.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const header = document.createElement('div');
    header.textContent = `Updates on ${dateFormatted}`;
    header.style.fontWeight = '600';
    header.style.fontSize = '16px';
    header.style.marginBottom = '8px';
    header.style.color = 'var(--rovalra-main-text-color, inherit)';

    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '0';

    updates.sort((a, b) => new Date(b.first_seen) - new Date(a.first_seen));

    updates.forEach(update => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid var(--divider-color)';
        li.style.fontSize = '14px';

        const timeElement = createInteractiveTimestamp(update.first_seen);
        
        const verSpan = document.createElement('span');
        verSpan.textContent = update.place_version ? `Version: ${update.place_version}` : '';
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

function _renderHeatmap(graphContainer, history, detailsContainer) {
    graphContainer.innerHTML = '';
    if (detailsContainer) detailsContainer.innerHTML = '';

    const updatesByDate = {};
    if (history) {
        history.forEach(entry => {
            const date = new Date(entry.first_seen).toISOString().split('T')[0];
            if (!updatesByDate[date]) {
                updatesByDate[date] = [];
            }
            updatesByDate[date].push(entry);
        });
    }

    const today = new Date();
    const endDate = new Date(today);
    const startDate = new Date(today);

    startDate.setFullYear(startDate.getFullYear() - 1);

    startDate.setDate(startDate.getDate() - startDate.getDay());

    const cellSize = 10;
    const cellGap = 3;
    const weekWidth = cellSize + cellGap;
    const leftPadding = 30;
    const topPadding = 20;
    
    const timeDiff = endDate - startDate;
    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const weeks = Math.ceil(dayDiff / 7);

    const width = weeks * weekWidth;
    const totalWidth = width + leftPadding;
    const height = 7 * (cellSize + cellGap);
    const legendHeight = 20;
    const totalHeight = topPadding + height + legendHeight + 10;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
    svg.style.display = "block";
    
    const dayLabels = ['Mon', 'Wed', 'Fri'];
    const dayIndices = [1, 3, 5];
    
    dayIndices.forEach((dayIndex, i) => {
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", leftPadding - 5);
        text.setAttribute("y", topPadding + dayIndex * (cellSize + cellGap) + cellSize - 1);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("font-size", "9");
        text.setAttribute("fill", "var(--rovalra-secondary-text-color)");
        text.textContent = dayLabels[i];
        svg.appendChild(text);
    });

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastMonth = -1;
    let firstLabelDrawn = false;

    for (let w = 0; w < weeks; w++) {
        const weekStartDate = new Date(startDate);
        weekStartDate.setDate(weekStartDate.getDate() + (w * 7));
        
        const month = weekStartDate.getMonth();
        if (month !== lastMonth) {
            if (firstLabelDrawn) {
                const text = document.createElementNS(svgNS, "text");
                text.setAttribute("x", leftPadding + w * weekWidth);
                text.setAttribute("y", 10);
                text.setAttribute("font-size", "10");
                text.setAttribute("fill", "var(--rovalra-secondary-text-color)");
                text.textContent = monthLabels[month];
                svg.appendChild(text);
            }
            lastMonth = month;
            firstLabelDrawn = true;
        }

        for (let d = 0; d < 7; d++) {
            const currentDate = new Date(weekStartDate);
            currentDate.setDate(currentDate.getDate() + d);
            
            if (currentDate > today) continue;

            const dateStr = currentDate.toISOString().split('T')[0];
            const updates = updatesByDate[dateStr] || [];
            const count = updates.length;
            
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", leftPadding + w * weekWidth);
            rect.setAttribute("y", topPadding + d * (cellSize + cellGap));
            rect.setAttribute("width", cellSize);
            rect.setAttribute("height", cellSize);
            rect.setAttribute("rx", 2);
            rect.setAttribute("ry", 2);
            
            if (count > 0) {
                rect.setAttribute("fill", "var(--rovalra-playbutton-color)");
                let opacity = 0.4;
                if (count >= 4) opacity = 1.0;
                else if (count === 3) opacity = 0.8;
                else if (count === 2) opacity = 0.6;
                
                rect.setAttribute("fill-opacity", opacity);
                
                rect.style.cursor = 'pointer';
                rect.addEventListener('click', () => {
                    renderDetails(detailsContainer, dateStr, updates);
                });
            } else {
                rect.setAttribute("fill", "var(--divider-color)");
                rect.setAttribute("fill-opacity", "0.5");
            }

            svg.appendChild(rect);
            
            const dateFormatted = currentDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const tooltipText = `${count} update${count !== 1 ? 's' : ''} on ${dateFormatted}`;
            addTooltip(rect, tooltipText, { position: 'top' });
        }
    }
    
    const legendY = topPadding + height + 15;
    const legendRectSize = 10;
    const legendGap = 3;
    
    const legendWidth = 25 + (5 * (legendRectSize + legendGap)) + 25;
    let legendX = totalWidth - legendWidth;
    if (legendX < leftPadding) legendX = leftPadding;

    const lessText = document.createElementNS(svgNS, "text");
    lessText.textContent = "Less";
    lessText.setAttribute("font-size", "10");
    lessText.setAttribute("fill", "var(--rovalra-secondary-text-color)");
    lessText.setAttribute("x", legendX);
    lessText.setAttribute("y", legendY + legendRectSize - 1);
    svg.appendChild(lessText);
    
    let currentX = legendX + 25;
    
    const levels = [
        { fill: "var(--divider-color)", opacity: "0.5" },
        { fill: "var(--rovalra-playbutton-color)", opacity: "0.4" },
        { fill: "var(--rovalra-playbutton-color)", opacity: "0.6" },
        { fill: "var(--rovalra-playbutton-color)", opacity: "0.8" },
        { fill: "var(--rovalra-playbutton-color)", opacity: "1.0" }
    ];
    
    levels.forEach(level => {
        const r = document.createElementNS(svgNS, "rect");
        r.setAttribute("width", legendRectSize);
        r.setAttribute("height", legendRectSize);
        r.setAttribute("x", currentX);
        r.setAttribute("y", legendY);
        r.setAttribute("rx", 2);
        r.setAttribute("ry", 2);
        r.setAttribute("fill", level.fill);
        r.setAttribute("fill-opacity", level.opacity);
        svg.appendChild(r);
        currentX += legendRectSize + legendGap;
    });
    
    const moreText = document.createElementNS(svgNS, "text");
    moreText.textContent = "More";
    moreText.setAttribute("font-size", "10");
    moreText.setAttribute("fill", "var(--rovalra-secondary-text-color)");
    moreText.setAttribute("x", currentX + 2);
    moreText.setAttribute("y", legendY + legendRectSize - 1);
    svg.appendChild(moreText);

    graphContainer.appendChild(svg);
}

export function createHeatmap(historyData, titleText = 'Update History') {
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

    const title = document.createElement('h2');
    title.textContent = titleText;

    const graphContainer = document.createElement('div');
    graphContainer.style.overflowX = 'auto';
    graphContainer.style.width = '100%';
    graphContainer.style.display = 'flex';

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'rovalra-heatmap-details';
    detailsContainer.style.width = '100%';

    header.appendChild(title);
    container.appendChild(header);
    container.appendChild(graphContainer);
    container.appendChild(detailsContainer);

    _renderHeatmap(graphContainer, historyData, detailsContainer);

    return container;
}
