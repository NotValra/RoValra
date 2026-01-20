import { observeElement, startObserving } from '../../../observer.js';
import { getAssets } from '../../../assets.js';
import { callRobloxApiJson } from '../../../api.js';
import { addTooltip } from '../../../ui/tooltip.js';
import { getStateCodeFromRegion } from '../../../preferredregion.js';
import { createButton } from '../../../ui/buttons.js';
import { showReviewPopup } from '../../../review/review.js';
import DOMPurify from 'dompurify';

const DEFAULT_PLACE_ID = window.ROVALRA_PLACE_ID;
const GLOBE_DRAG_THRESHOLD = 6;

const GLOBE_PANEL_ID = 'rovalra-globe-panel';
const GLOBE_CONTAINER_ID = 'rovalra-globe-container';
const GLOBE_TOOLTIP_ID = 'rovalra-globe-tooltip';
const EASTER_EGG_TRIGGER_ID = 'rovalra-easter-egg-trigger';
const HEADER_TITLE_ID = 'rovalra-header-title';

const EVT_REGIONS_UPDATED = 'rovalraRegionsUpdated';
const EVT_GLOBE_UPDATE_DATA = 'rovalraGlobe_UpdateData';
const EVT_GLOBE_EASTER_EGG = 'rovalraGlobeEasterEgg';
const EVT_GLOBE_EASTER_EGG_OFF = 'rovalraGlobeEasterEggOff';
const EVT_INIT_GLOBE = 'initRovalraGlobe';
const EVT_REGION_SELECTED = 'rovalraRegionSelected';
const EVT_UPTIME_SELECTED = 'rovalraUptimeSelected';
const EVT_CLEAR_FILTERS = 'rovalraClearFilters';
const EVT_REGION_SERVERS_LOADED = 'rovalraRegionServersLoaded';
const EVT_REQUEST_REGION_SERVERS = 'rovalraRequestRegionServers';
const EVT_GLOBE_HOVER = 'rovalraGlobeHover';

const US_STATE_NAME_TO_CODE = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA",
    "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "FLORIDA": "FL", "GEORGIA": "GA",
    "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA",
    "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS", "MISSOURI": "MO",
    "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH",
    "OKLAHOMA": "OK", "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
    "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY",
    "DISTRICT OF COLUMBIA": "DC"
};

const State = {
    regions: {},
    dataCenterCounts: {},
    serverIpMap: {},
    regionServersCache: {},
    activeServerCounts: {},
    flags: {},
    apiCounts: null,
    allLocalServerIds: new Set(),
    localServersByRegion: {},

    isGlobeOpen: false,
    easterEggActive: false,

    isScanning: false,
    scanCursor: null,
    scanCompleted: false,

    globe: {
        assetsLoaded: false,
        initDispatched: false,
        pointerDown: false,
        pointerDragged: false,
        startX: 0,
        startY: 0,
        lastDragTime: 0,
        scriptPromise: null,
        resourcesPreloaded: false
    },

    injected: false,
    listenersAttached: false,
    storageListenerAttached: false,
};

function normalizeKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function detectTheme() {
    try {
        const body = document.body;
        return body && (body.classList.contains('dark-theme') || body.classList.contains('rbx-dark-theme')) ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { s.remove(); resolve(); };
        s.onerror = () => { s.remove(); reject(new Error(`Failed to load ${src}`)); };
        (document.head || document.documentElement).appendChild(s);
    });
}

function getPlaceIdFromUrl() {
    try {
        const url = window.location.href;
        const qp = new URLSearchParams(window.location.search);
        const qpId = qp.get('placeId') || qp.get('place_id') || qp.get('placeid');
        if (qpId && /^\d+$/.test(qpId)) return qpId;
        const match = url.match(/\/games\/([0-9]+)/i) || url.match(/\/(\d{5,})\b/);
        if (match) return match[1];
    } catch {}
    return DEFAULT_PLACE_ID;
}

async function cacheFlag(countryCode) {
    const code = countryCode.toLowerCase();
    if (State.flags[code]) return;
    try {
        const response = await fetch(`https://flagcdn.com/w40/${code}.png`);
        const blob = await response.blob();
        State.flags[code] = URL.createObjectURL(blob);
    } catch (e) {
        console.warn('RoValra: Failed to cache flag for', code);
    }
}

function closeGlobalPanels() {
    const globe = document.getElementById(GLOBE_PANEL_ID);
    if (globe) globe.classList.remove('show');
    const tooltip = document.getElementById(GLOBE_TOOLTIP_ID);
    if (tooltip) { tooltip.style.display = 'none'; tooltip.innerHTML = ''; }
    document.querySelectorAll('.rovalra-side-panel.show').forEach(p => p.classList.remove('show'));
    document.querySelectorAll('.filter-dropdown-container button.active').forEach(b => b.classList.remove('active'));
    State.isGlobeOpen = false;
    State.isScanning = false;
}

function getInternalStateCode(stateName) {
    if (!stateName) return "";
    const upper = stateName.toUpperCase().trim();
    if (US_STATE_NAME_TO_CODE[upper]) return US_STATE_NAME_TO_CODE[upper];
    if (typeof getStateCodeFromRegion === 'function') {
        const res = getStateCodeFromRegion(stateName);
        if (res) return res;
    }
    return "";
}

function resolveApiRegionCode(internalCode) {
    if (!internalCode) return internalCode;

    const detailed = State.apiCounts?.counts?.detailed_regions;
    if (detailed) {
        const internalNorm = normalizeKey(internalCode);

        for (const [apiCode, entry] of Object.entries(detailed)) {
            const parts = apiCode.split('-');
            const country = parts[0];
            let stateCode = '';

            if (country === 'US' && parts.length > 1) {
                const stateName = parts.slice(1).join('-'); 
                stateCode = getInternalStateCode(stateName);
            }

            if (entry.cities) {
                for (const city of Object.keys(entry.cities)) {
                    let candidate;
                    if (country === 'US' && stateCode) {
                        candidate = `US-${stateCode}-${city.replace(/\s+/g, '')}`;
                    } else {
                        candidate = `${country}-${city.replace(/\s+/g, '')}`;
                    }
                    if (normalizeKey(candidate) === internalNorm) return internalCode; 
                }
            }

            if (normalizeKey(apiCode) === internalNorm) return apiCode;
        }
    }

    const countryPrefix = internalCode.split('-')[0];
    if (State.apiCounts?.counts?.regions?.[countryPrefix]) return countryPrefix;

    return internalCode;
}

function buildServerCountsMap(apiJson) {
    const out = {};
    if (!apiJson?.counts) return out;

    const { detailed_regions, regions } = apiJson.counts;

    if (detailed_regions) {
        Object.entries(detailed_regions).forEach(([apiCode, entry]) => {
            const parts = apiCode.split('-');
            const country = parts[0];
            let stateCode = '';

            if (country === 'US' && parts.length > 1) {
                const stateName = parts.slice(1).join('-');
                stateCode = getInternalStateCode(stateName);
            }

            if (entry.cities) {
                Object.entries(entry.cities).forEach(([city, count]) => {
                    const key = generateRegionKey(country, city, stateCode ? parts.slice(1).join('-') : null);
                    out[key] = typeof entry.total_servers === 'number' ? entry.total_servers : count;
                });
            } else if (typeof entry.total_servers === 'number') {
                out[apiCode] = entry.total_servers;
            }
        });
        return out;
    }

    if (regions) {
        Object.entries(regions).forEach(([apiCode, total]) => {
            let matched = false;
            Object.values(State.regions).forEach(continent => {
                Object.keys(continent).forEach(regionKey => {
                    if (regionKey === apiCode || regionKey.startsWith(`${apiCode.split('-')[0]}-`)) {
                        if (out[regionKey] === undefined) out[regionKey] = total;
                        matched = true;
                    }
                });
            });
            if (!matched) {
                out[apiCode] = total;
            }
        });
    }
    return out;
}

function generateRegionKey(country, city, regionName) { 
    if (country === 'US' && regionName) { 
        const stateCode = getInternalStateCode(regionName); 
        return `US-${stateCode}-${city.replace(/\s+/g, '')}`; 
    } 
    return `${country}-${city.replace(/\s+/g, '')}`; 
}

function processStorageDatacenters(apiData) {
    if (!Array.isArray(apiData)) return;

    const newRegions = {};
    const newCounts = {};
    const newIpMap = {};

    apiData.forEach(dc => {
        if (!dc.location || !dc.location.country || !dc.location.city) return;

        if (Array.isArray(dc.dataCenterIds)) {
            dc.dataCenterIds.forEach(id => newIpMap[id] = dc);
        }

        const loc = dc.location;
        const regionKey = generateRegionKey(loc.country, loc.city, loc.region);
        const count = Array.isArray(dc.dataCenterIds) ? dc.dataCenterIds.length : 0;

        newCounts[regionKey] = (newCounts[regionKey] || 0) + count;

        const continent = loc.continent || 'Other';
        if (!newRegions[continent]) {
            newRegions[continent] = {};
        }
        if (!newRegions[continent][regionKey]) {
            newRegions[continent][regionKey] = {
                city: loc.city,
                country: loc.country_name || loc.country,
                coords: {
                    lat: parseFloat(loc.latLong[0]),
                    lon: parseFloat(loc.latLong[1])
                }
            };
        }
    });

    State.regions = newRegions;
    State.dataCenterCounts = newCounts;
    State.serverIpMap = newIpMap;
    document.dispatchEvent(new CustomEvent(EVT_REGIONS_UPDATED));
}

async function fetchCounts() {
    try {
        const pid = getPlaceIdFromUrl();
        const json = await callRobloxApiJson({ endpoint: `/v1/servers/counts?place_id=${encodeURIComponent(pid)}`, isRovalraApi: true });
        State.apiCounts = json;
        State.activeServerCounts = buildServerCountsMap(json);
    } catch (e) {
        State.apiCounts = { counts: {} };
        State.activeServerCounts = {};
    } finally {
        document.dispatchEvent(new CustomEvent(EVT_REGIONS_UPDATED));
        document.dispatchEvent(new CustomEvent(EVT_GLOBE_UPDATE_DATA, { detail: { serverCounts: State.activeServerCounts } }));
    }
}

async function fetchServers(regionCode, cursor) {
    try {
        const pid = getPlaceIdFromUrl();
        
        let city;
        const country = regionCode.split('-')[0];

        for (const continent of Object.values(State.regions)) {
            if (continent[regionCode]) {
                city = continent[regionCode].city;
                break;
            }
        }

        if (!city && State.apiCounts?.counts?.detailed_regions?.[regionCode]?.cities) {
            const cities = Object.keys(State.apiCounts.counts.detailed_regions[regionCode].cities);
            if (cities.length > 0) {
                city = cities[0];
            }
        }
        
        let qs;
        if (city) {
            qs = new URLSearchParams({ 
                place_id: pid, 
                country: country,
                city: city.toLowerCase()
            });
        } else {
            qs = new URLSearchParams({ place_id: pid, region: regionCode });
        }
        
        if (cursor) {
            qs.set('cursor', cursor);
        }

        return await callRobloxApiJson({ endpoint: `/v1/servers/region?${qs.toString()}`, isRovalraApi: true });
    } catch (e) {
        return { servers: [], next_cursor: null };
    }
}

function createGlobePanel(container) {
    const theme = detectTheme();
    const assets = getAssets();
    const panel = document.createElement('div');
    panel.id = GLOBE_PANEL_ID;
    panel.className = theme;
    panel.innerHTML = `<div class="rovalra-globe-header ${theme}"><img src="${assets.rovalraIcon}" class="rovalra-header-logo" title="RoValra" id="${EASTER_EGG_TRIGGER_ID}" alt="Logo"><div id="${HEADER_TITLE_ID}" style="font-weight:bold;">RoValra Region Selector</div></div><div id="${GLOBE_CONTAINER_ID}"></div>`;
    container.appendChild(panel);

    const globeContainer = panel.querySelector(`#${GLOBE_CONTAINER_ID}`);
    if (globeContainer) {
        globeContainer.addEventListener('mouseleave', () => {
            const tooltip = document.getElementById(GLOBE_TOOLTIP_ID);
            if (tooltip) tooltip.style.display = 'none';
        });
    }

    let clickCount = 0;
    const logo = panel.querySelector(`#${EASTER_EGG_TRIGGER_ID}`);
    const title = panel.querySelector(`#${HEADER_TITLE_ID}`);
    logo.addEventListener('click', (e) => {
        e.stopPropagation();
        clickCount++;
        if (clickCount === 10) {
            clickCount = 0;
            State.easterEggActive = !State.easterEggActive;
            if (State.easterEggActive) {
                document.dispatchEvent(new CustomEvent(EVT_GLOBE_EASTER_EGG, { detail: { iconUrl: assets.rovalraIcon } }));
                if (title) title.textContent = "Gilberts In Your Area";
            } else {
                document.dispatchEvent(new CustomEvent(EVT_GLOBE_EASTER_EGG_OFF));
                if (title) title.textContent = "RoValra Region Selector";
            }
        }
    });

    setupGlobePointerEvents();
}

function setupGlobePointerEvents() {
    const container = document.getElementById(GLOBE_CONTAINER_ID);
    if (!container) return;
    const onMove = (e) => { if (State.globe.pointerDown && !State.globe.pointerDragged && (Math.abs(e.clientX - State.globe.startX) > GLOBE_DRAG_THRESHOLD || Math.abs(e.clientY - State.globe.startY) > GLOBE_DRAG_THRESHOLD)) { State.globe.pointerDragged = true; } };
    const onUp = (e) => { if (State.globe.pointerDragged) State.globe.lastDragTime = Date.now(); State.globe.pointerDown = false; State.globe.pointerDragged = false; try { container.releasePointerCapture(e.pointerId); } catch {} document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    container.addEventListener('pointerdown', (e) => { try { container.setPointerCapture(e.pointerId); } catch {} State.globe.pointerDown = true; State.globe.pointerDragged = false; State.globe.startX = e.clientX; State.globe.startY = e.clientY; document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); });
    container.addEventListener('click', e => e.stopPropagation());
}

async function preloadGlobeResources() {
    if (State.globe.resourcesPreloaded) return;
    State.globe.resourcesPreloaded = true;
    const assets = getAssets();
    if (!State.globe.scriptPromise && !State.globe.assetsLoaded) {
        State.globe.scriptPromise = injectScript(assets.globeInitializer).then(() => {
            State.globe.assetsLoaded = true;
        }).catch(() => {});
    }
}

async function ensureGlobeInitialized(theme) {
    if (State.globe.initDispatched) return;
    preloadGlobeResources();
    const assets = getAssets();
    
    if (State.globe.scriptPromise) await State.globe.scriptPromise;
    else if (!State.globe.assetsLoaded) { try { await injectScript(assets.globeInitializer); State.globe.assetsLoaded = true; } catch (e) { return; } }

    const mapUrl = theme === 'dark' ? assets.mapDark : assets.mapLight;
    State.activeServerCounts = buildServerCountsMap(State.apiCounts || {});
    document.dispatchEvent(new CustomEvent(EVT_INIT_GLOBE, { detail: { REGIONS: State.regions, mapUrl: mapUrl, countriesData: null, theme, serverCounts: State.activeServerCounts, dataCenterCounts: State.dataCenterCounts } }));
    State.globe.initDispatched = true;
}

function populateRegionSidePanel(container, theme) {
    container.innerHTML = '';
    const useApi = State.apiCounts?.counts?.detailed_regions;
    const groups = {};
    if (useApi) {
        const detailed = State.apiCounts.counts.detailed_regions;
        for (const [code, entry] of Object.entries(detailed)) {
            const parts = code.split('-');
            const groupName = parts[0]; 
            const city = entry.cities ? Object.keys(entry.cities)[0] : code;

            let subLabel = code;
            if (groupName === 'US' && parts.length > 1) {
                const rawState = parts.slice(1).join(' ');
                subLabel = rawState.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()); 
            }

            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push({ code, label: city || code, subLabel: subLabel, count: entry.total_servers || 0 });
        }
    } else {
        for (const [continent, regions] of Object.entries(State.regions)) {
            if (!groups[continent]) groups[continent] = [];
            for (const [key, data] of Object.entries(regions)) {
                groups[continent].push({ code: key, label: data.city, subLabel: data.country, count: State.dataCenterCounts[key] || 0 });
            }
        }
    }

    for (const [groupName, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        const header = document.createElement('div');
        header.className = `rovalra-filter-group-header ${theme}`;
        header.textContent = groupName;
        container.appendChild(header);
        items.forEach(item => {
            const row = document.createElement('a');
            row.className = `rovalra-side-panel-item ${theme}`;
            row.dataset.regionCode = item.code;
            row.innerHTML = DOMPurify.sanitize(`<div><strong>${item.label}</strong><span class="country"> ${item.subLabel}</span></div><div class="rovalra-region-count ${theme}">${item.count}</div>`);
            addTooltip(row, `Filter by ${item.label} (${item.count} servers)`, { position: 'left' });

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent(EVT_REGION_SELECTED, { detail: { regionCode: item.code } }));
            });
            container.appendChild(row);
        });
    }
}

function createRegionDropdownWidget(container) {
    const theme = detectTheme();
    const wrapper = document.createElement('div');
    wrapper.id = 'rovalra-region-filter-dropdown-wrapper';
    wrapper.className = 'filter-dropdown-container rovalra-filter-widget';

    const btn = createButton('Region', 'secondary');
    btn.classList.add('filter-button-alignment');
    btn.innerHTML = `<span>Region</span><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19.3 16.9c.4-.7.7-1.5.7-2.4 0-2.5-2-4.5-4.5-4.5S11 12 11 14.5s2 4.5 4.5 4.5c.9 0 1.7-.3 2.4-.7l3.2 3.2 1.4-1.4zm-3.8.1c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5M12 20v2C6.48 22 2 17.52 2 12S6.48 2 12 2c4.84 0 8.87 3.44 9.8 8h-2.07c-.64-2.46-2.4-4.47-4.73-5.41V5c0 1.1-.9 2-2 2h-2v2c0 .55-.45 1-1 1H8v2h2v3H9l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.41 3.59 8 8 8"></path></svg>`;
    addTooltip(btn, 'Filter servers by region', { position: 'top' });
    wrapper.appendChild(btn);

    const sidePanel = document.createElement('div');
    sidePanel.className = `rovalra-side-panel ${theme}`;
    sidePanel.innerHTML = `<div class="rovalra-side-panel-list ${theme}"></div>`;
    
    const listContainer = sidePanel.querySelector('.rovalra-side-panel-list');
    createGlobePanel(wrapper);
    wrapper.appendChild(sidePanel);

    const onButtonClick = e => {
        e.stopPropagation();
        const globe = document.getElementById(GLOBE_PANEL_ID);
        if (btn.classList.contains('active')) {
            closeGlobalPanels();
        } else {
            closeGlobalPanels();
            btn.classList.add('active');
            startIndependentServerScan();
            State.isGlobeOpen = true;
            if (globe) globe.classList.add('show');
            ensureGlobeInitialized(theme).catch(() => {});
        }
    };

    btn.addEventListener('mouseenter', () => preloadGlobeResources());
    setTimeout(() => preloadGlobeResources(), 2000);
    btn.addEventListener('click', onButtonClick);

    const updateList = () => populateRegionSidePanel(listContainer, theme);
    document.addEventListener(EVT_REGIONS_UPDATED, updateList);
    updateList();

    window.addEventListener('click', (ev) => {
        if (!wrapper.contains(ev.target) && (Date.now() - State.globe.lastDragTime) > 500) {
            closeGlobalPanels();
        }
    });

    container.appendChild(wrapper);
}

async function getAndCacheServerRegion(server, placeId) {
    if (document.querySelector(`[data-gameid="${server.id}"]`)?.dataset.rovalraRegion) return;
    try {
        const res = await callRobloxApiJson({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: { placeId: parseInt(placeId, 10), gameId: server.id, gameJoinAttemptId: crypto.randomUUID() }
        });
        if (!res.joinScript?.DataCenterId) return;
        const dataCenterId = res.joinScript.DataCenterId;
        const dcInfo = State.serverIpMap[dataCenterId];
        if (dcInfo?.location) {
            const loc = dcInfo.location;
            const regionKey = generateRegionKey(loc.country, loc.city, loc.region);
            if (!State.localServersByRegion[regionKey]) State.localServersByRegion[regionKey] = [];
            const alreadyExists = State.localServersByRegion[regionKey].some(s => s.id === server.id);
            if (!alreadyExists) {
                State.localServersByRegion[regionKey].push(server);
                const currentGlobalCount = State.activeServerCounts[regionKey] || 0;
                const localCount = State.localServersByRegion[regionKey].length;
                if (localCount > currentGlobalCount) {
                    State.activeServerCounts[regionKey] = localCount;
                    document.dispatchEvent(new CustomEvent(EVT_GLOBE_UPDATE_DATA, { detail: { serverCounts: State.activeServerCounts } }));
                }
            }
        }
    } catch (error) {}
}

async function startIndependentServerScan() {
    if (State.isScanning || State.scanCompleted) return;
    State.isScanning = true;
    if (State.scanCursor === null) { State.localServersByRegion = {}; State.allLocalServerIds.clear(); }
    const placeId = getPlaceIdFromUrl();
    let pageCount = 0;

    while (pageCount++ < Infinity && State.isScanning) {
        try {
            const response = await callRobloxApiJson({ subdomain: 'games', endpoint: `/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100${State.scanCursor ? `&cursor=${encodeURIComponent(State.scanCursor)}` : ''}` });
            const serversOnPage = response.data || [];
            if (serversOnPage.length > 0) {
                for (let i = 0; i < serversOnPage.length; i += 10) {
                    if (!State.isScanning) break;
                    const batch = serversOnPage.slice(i, i + 10);
                    await Promise.all(batch.map(s => getAndCacheServerRegion(s, placeId)));
                    if (i + 10 < serversOnPage.length) await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            if (!response.nextPageCursor) { State.scanCompleted = true; State.scanCursor = null; break; }
            State.scanCursor = response.nextPageCursor;
        } catch (e) { break; }
    }
    for (const region in State.localServersByRegion) { for (const server of State.localServersByRegion[region]) { State.allLocalServerIds.add(server.id); } }
    State.isScanning = false;
}

function handleGlobeHover(e) {
    const tooltip = document.getElementById(GLOBE_TOOLTIP_ID);
    if (!tooltip) return;
    const panel = document.getElementById(GLOBE_PANEL_ID);
    if (!panel || !panel.classList.contains('show') || !e.detail?.active || !e.detail.regionCode) { tooltip.style.display = 'none'; return; } 
    const { regionCode, city, x, y } = e.detail;
    const countryCode = regionCode.split('-')[0].toLowerCase();
    const serverCount = State.activeServerCounts[regionCode] || 0;
    const dcCount = State.dataCenterCounts[regionCode] || 0;
    let flagSrc = State.flags[countryCode];
    if (!flagSrc) { flagSrc = `https://flagcdn.com/w40/${countryCode}.png`; cacheFlag(countryCode); }
    tooltip.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 2px;"><img src="${flagSrc}" style="width: 20px; height: 13px; border-radius: 2px;"><span style="font-weight: 600; font-size: 12px; color: #eee;">${city}</span></div><div style="display: flex; flex-direction: column; align-items: center; gap: 0px; font-size: 11px; color: #ccc; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 3px; width: 100%;"><span>Servers: <b style="color:#fff;">${serverCount.toLocaleString()}</b></span>${dcCount > 0 ? `<span>Datacenters: <b style="color:#fff;">${dcCount.toLocaleString()}</b></span>` : ''}</div>`;
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`; tooltip.style.display = 'flex';
}

function onOtherFilterSelected() {
    closeGlobalPanels();
}

async function onRegionSelected(event) {
    const code = event.detail?.regionCode;
    if (!code) return;

    showReviewPopup('region_filters');
    closeGlobalPanels();
    delete State.regionServersCache[code];

    const apiRegion = resolveApiRegionCode(code);
    const item = document.querySelector(`.rovalra-side-panel-item[data-region-code="${code}"]`);
    if (item) item.classList.add('loading');

    try {
        const res = await fetchServers(apiRegion);
        const apiServers = res.servers || [];
        const locallyFoundServers = State.localServersByRegion[code] || [];
        const localServerIds = new Set(locallyFoundServers.map(s => s.id));

        const filteredApiServers = apiServers.filter(apiServer => !localServerIds.has(apiServer.server_id));
        const combinedServers = [...locallyFoundServers, ...filteredApiServers];

        const initialDisplayServers = combinedServers.slice(0, 8);
        const remainingServers = combinedServers.slice(8);

        State.regionServersCache[code] = {
            allServers: combinedServers,
            apiNextCursor: res.next_cursor
        };

        document.dispatchEvent(new CustomEvent(EVT_REGION_SERVERS_LOADED, {
            detail: {
                regionCode: code,
                servers: initialDisplayServers,
                next_cursor: (remainingServers.length > 0 || res.next_cursor) ? 'HAS_MORE' : null
            }
        }));
    } catch (e) {
        const locallyFoundServers = State.localServersByRegion[code] || [];
        document.dispatchEvent(new CustomEvent(EVT_REGION_SERVERS_LOADED, {
            detail: {
                regionCode: code,
                servers: locallyFoundServers,
                next_cursor: null
            }
        }));
    } finally {
        if (item) item.classList.remove('loading');
    }
}

async function onRequestMoreRegionServers(event) {
    const { regionCode } = event.detail || {};
    if (!regionCode || regionCode === 'newest' || regionCode === 'oldest') return;

    const apiRegion = resolveApiRegionCode(regionCode);
    const item = document.querySelector(`.rovalra-side-panel-item[data-region-code="${regionCode}"]`);
    if (item) item.classList.add('loading');

    try {
        const cachedData = State.regionServersCache[regionCode];
        const serverListContainer = document.querySelector('#rbx-public-game-server-item-container');
        const currentlyDisplayedCount = serverListContainer ? serverListContainer.children.length : 0;

        if (cachedData && currentlyDisplayedCount < cachedData.allServers.length) {
            const nextServers = cachedData.allServers.slice(currentlyDisplayedCount, currentlyDisplayedCount + 8);
            const hasMoreAfterThis = (currentlyDisplayedCount + 8) < cachedData.allServers.length || !!cachedData.apiNextCursor;
            document.dispatchEvent(new CustomEvent(EVT_REGION_SERVERS_LOADED, { detail: { regionCode, servers: nextServers, next_cursor: hasMoreAfterThis ? 'HAS_MORE' : null, append: true } }));
        } else if (cachedData && cachedData.apiNextCursor) {
            const res = await fetchServers(apiRegion, cachedData.apiNextCursor);
            const apiServers = res.servers || [];
            const filteredApiServers = apiServers.filter(apiServer => !State.allLocalServerIds.has(apiServer.server_id));
            cachedData.allServers.push(...filteredApiServers);
            cachedData.apiNextCursor = res.next_cursor;
            document.dispatchEvent(new CustomEvent(EVT_REGION_SERVERS_LOADED, { detail: { regionCode, servers: filteredApiServers, next_cursor: res.next_cursor, append: true } }));
        }
    } catch (e) {
        document.dispatchEvent(new CustomEvent(EVT_REGION_SERVERS_LOADED, { detail: { regionCode, servers: [], next_cursor: null, append: true } }));
    } finally {
        if (item) item.classList.remove('loading');
    }
}

function attachGlobalListeners() {
    if (State.listenersAttached) return;

    document.addEventListener(EVT_UPTIME_SELECTED, onOtherFilterSelected);
    document.addEventListener(EVT_CLEAR_FILTERS, onOtherFilterSelected);
    document.addEventListener(EVT_REGION_SELECTED, onRegionSelected);
    document.addEventListener(EVT_REQUEST_REGION_SERVERS, onRequestMoreRegionServers);

    State.listenersAttached = true;
}

function onStorageChanged(changes, area) {
    if (area === 'local' && changes.rovalraDatacenters) {
        processStorageDatacenters(changes.rovalraDatacenters.newValue);
    }
}

async function initializeData() {
    const { rovalraDatacenters } = await chrome.storage.local.get('rovalraDatacenters');
    processStorageDatacenters(rovalraDatacenters);
    await fetchCounts();

    if (!State.storageListenerAttached && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(onStorageChanged);
        State.storageListenerAttached = true;
    }
}

function setupUI() {
    if (!document.getElementById(GLOBE_TOOLTIP_ID)) {
        const tooltip = document.createElement('div');
        tooltip.id = GLOBE_TOOLTIP_ID;
        document.body.appendChild(tooltip);
        document.addEventListener(EVT_GLOBE_HOVER, handleGlobeHover);
    }

    const mainControls = document.getElementById('rovalra-main-controls');
    if (mainControls && !mainControls.querySelector('#rovalra-region-filter-dropdown-wrapper')) {
        createRegionDropdownWidget(mainControls);
    }
}

export async function initRegionFilters() {
    if (State.injected) return;
    State.injected = true;

    try {
        startObserving();
    } catch (e) {
        console.error("RoValra: Failed to start observing.", e);
    }

    setupUI();
    attachGlobalListeners();
    await initializeData();
}
export default { initRegionFilters };