// version filters

import { observeElement } from '../../../observer.js';
import { callRobloxApiJson } from '../../../api.js';
import { createStyledInput } from '../../../ui/catalog/input.js'; 
import { createDropdown } from '../../../ui/dropdown.js';
import { addTooltip } from '../../../ui/tooltip.js'; 
import DOMPurify from 'dompurify';

let isInitialized = false;
let currentCursor = null;

let currentDropdownInstance = null;
let inputInstance = null;

const STYLES = `
    .rovalra-version-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0; 
        
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 8px;
        padding-top: 4px;
        padding-right: 4px; 
        border-top: 1px solid var(--divider-color);
        
        max-height: 250px; 
    }

    .rovalra-version-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        color: var(--text-default); 
        transition: background-color 0.1s;
        flex-shrink: 0; 
    }

    .rovalra-version-item:hover {
        background-color: var(--color-state-hover);
    }

    .rovalra-version-item:active {
        background-color: var(--color-state-press);
    }
    
    .rovalra-version-item span {
        font-weight: 600;
    }
`;

function getPlaceIdFromUrl() {
    try {
        const match = window.location.href.match(/\/games\/(\d+)/);
        return match ? match[1] : null;
    } catch { return null; }
}


async function fetchVersionCounts() {
    try {
        const placeId = getPlaceIdFromUrl();
        if (!placeId) return [];
        
        const response = await callRobloxApiJson({
            endpoint: `/v1/servers/counts?place_id=${placeId}`,
            isRovalraApi: true
        });
        return response?.counts?.place_versions || [];
    } catch (e) {
        console.warn('RoValra: Failed to fetch version counts', e);
        return [];
    }
}

async function fetchServersForVersion(version, cursor = null) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId) return null;

    let endpoint = `/v1/servers/versions?place_id=${placeId}&place_version=${version}&limit=10`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;

    try {
        return await callRobloxApiJson({
            endpoint: endpoint,
            isRovalraApi: true
        });
    } catch (error) {
        console.error(`RoValra: Failed to fetch version ${version}.`, error);
        return null;
    }
}


function closeDropdown() {
    if (currentDropdownInstance && currentDropdownInstance.panel) {
        currentDropdownInstance.panel.classList.remove('show');
        currentDropdownInstance.trigger.setAttribute('data-state', 'closed');
        currentDropdownInstance.panel.setAttribute('data-state', 'closed');
    }
}

async function executeSearch(version) {
    if (!version) return;
    
    closeDropdown();
    currentCursor = null;

    if (currentDropdownInstance) {
        const span = currentDropdownInstance.trigger.querySelector('.content-emphasis');
        if (span) span.textContent = `v${version}`;
        currentDropdownInstance.trigger.removeAttribute('data-placeholder');
    }

    document.dispatchEvent(new CustomEvent('rovalraVersionSelected', { detail: { version } }));

    if (!document.body.classList.contains('rovalra-filter-active')) {
        document.body.classList.add('rovalra-filter-active');
        const clearButton = document.getElementById('rovalra-clear-filter-btn');
        if (clearButton) clearButton.style.display = 'flex';
    }

    const response = await fetchServersForVersion(version, null);
    const servers = response?.servers || [];
    currentCursor = response?.next_cursor || null;

    document.dispatchEvent(new CustomEvent('rovalraRegionServersLoaded', {
        detail: {
            regionCode: `version-${version}`,
            servers: servers,
            next_cursor: currentCursor
        }
    }));
}

function resetFilter() {
    currentCursor = null;
    
    if (inputInstance) {
        inputInstance.input.value = '';
        inputInstance.input.dispatchEvent(new Event('input'));
    }

    if (currentDropdownInstance) {
        const span = currentDropdownInstance.trigger.querySelector('.content-emphasis');
        if (span) span.textContent = 'Version';
        currentDropdownInstance.trigger.setAttribute('data-placeholder', 'true');
    }
}


async function createVersionWidget(container) {
    if (!document.getElementById('rovalra-version-filter-styles')) {
        const s = document.createElement('style');
        s.id = 'rovalra-version-filter-styles';
        s.textContent = STYLES;
        document.head.appendChild(s);
    }

    const dropdown = createDropdown({
        items: [], 
        initialValue: null,
        placeholder: 'Version',
        onValueChange: () => {}, 
        showFlags: false
    });

    if (dropdown.trigger) {
        addTooltip(dropdown.trigger, 'Filter servers by game version', { position: 'top' });
    }

    dropdown.element.classList.add('rovalra-version-filter-widget', 'rovalra-filter-widget');
    dropdown.element.style.minWidth = '130px';

    if (dropdown.panel) {

        dropdown.panel.style.display = 'flex';
        dropdown.panel.style.flexDirection = 'column';
        dropdown.panel.style.overflow = 'hidden'; 
        
        inputInstance = createStyledInput({
            id: 'rovalra-version-search',
            label: 'Enter Version',
            placeholder: ' '
        });
        
        inputInstance.container.style.width = '100%';
        inputInstance.container.style.flexShrink = '0'; 
        
        inputInstance.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = inputInstance.input.value.trim();
                if (val) executeSearch(val);
            }
        });

        dropdown.panel.appendChild(inputInstance.container);

        let versions = await fetchVersionCounts();
        
        if (versions.length > 0) {
            versions.sort((a, b) => Number(b) - Number(a));

            const listContainer = document.createElement('div');
            listContainer.className = 'rovalra-version-list';
            
            versions.forEach(v => {
                const item = document.createElement('div');
                item.className = 'rovalra-version-item';
                item.innerHTML = DOMPurify.sanitize(`<span>${v}</span>`);
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    inputInstance.input.value = v;
                    inputInstance.input.dispatchEvent(new Event('input'));
                    executeSearch(v);
                });
                
                listContainer.appendChild(item);
            });

            dropdown.panel.appendChild(listContainer);
        }
    }

    container.prepend(dropdown.element);
    currentDropdownInstance = dropdown;
}


export function initVersionFilters() {
    if (isInitialized) return;
    isInitialized = true;

    document.addEventListener('rovalraRequestRegionServers', async (ev) => {
        const { regionCode } = ev.detail || {};
        if (!regionCode || !regionCode.startsWith('version-')) return;

        const version = regionCode.replace('version-', '');

        if (!currentCursor) {
            document.dispatchEvent(new CustomEvent('rovalraRegionServersLoaded', {
                detail: { regionCode: regionCode, servers: [], next_cursor: null, append: true }
            }));
            return;
        }

        const response = await fetchServersForVersion(version, currentCursor);
        const servers = response?.servers || [];
        currentCursor = response?.next_cursor || null;

        document.dispatchEvent(new CustomEvent('rovalraRegionServersLoaded', {
            detail: { regionCode: regionCode, servers: servers, next_cursor: currentCursor, append: true }
        }));
    });

    const resetHandler = () => {
        closeDropdown();
        resetFilter();
    };

    document.addEventListener('rovalraRegionSelected', resetHandler);
    document.addEventListener('rovalraUptimeSelected', resetHandler);
    document.addEventListener('rovalraClearFilters', resetHandler);

    observeElement('#rovalra-main-controls', (container) => {
        if (container.querySelector('.rovalra-version-filter-widget')) return;
        createVersionWidget(container);
    }, { multiple: false });
}