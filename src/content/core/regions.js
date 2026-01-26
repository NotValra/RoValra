// TODO i hate this script...

import { callRobloxApi } from './api.js';

const API_ENDPOINT_DATACENTERS_LIST = '/v1/datacenters/list';
const FALLBACK_JSON_PATH = 'data/ServerList.json';
const STORAGE_KEY_DATACENTERS = 'rovalraDatacenters';
const STORAGE_KEY_REGIONS = 'cachedRegions';
const STORAGE_KEY_CONTINENTS = 'cachedRegionContinents';


let cachedRegionData = null;
export let REGIONS = {}; 
const stateMap = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'Hesse': 'HE'
};


export function getStateCodeFromRegion(regionName) {
    if (!regionName) return null;
    return stateMap[regionName] || regionName.substring(0, 2).toUpperCase();
}


export function getContinent(countryCode) {
    return COUNTRY_CONTINENT_MAP[countryCode] || 'Other';
}


export async function loadDatacenterMap() {
    if (window.rovalraDatacenterState && window.rovalraDatacenterState !== 'initial') return;
    window.rovalraDatacenterState = 'loading';

    let currentData = null;

    const processDataIntoMap = (serverListData) => {
        const map = {};
        if (Array.isArray(serverListData)) {
            serverListData.forEach(dc => {
                if (dc.dataCenterIds && Array.isArray(dc.dataCenterIds) && dc.location) {
                    dc.dataCenterIds.forEach(id => {
                        map[id] = dc.location;
                    });
                }
            });
        }
        serverIpMap = map;
    };

    try {
        const storageResult = await chrome.storage.local.get(STORAGE_KEY_DATACENTERS);
        if (storageResult[STORAGE_KEY_DATACENTERS]) {
            currentData = storageResult[STORAGE_KEY_DATACENTERS];
            processDataIntoMap(currentData);
        }
    } catch (e) {
        console.error("RoValra: Error reading datacenter map from storage.", e);
    }

    if (!currentData) {
        try {
            const fallbackUrl = chrome.runtime.getURL(FALLBACK_JSON_PATH);
            const response = await fetch(fallbackUrl);
            if (!response.ok) throw new Error(`Status: ${response.status}`);

            const localData = await response.json();
            currentData = localData;
            await chrome.storage.local.set({ [STORAGE_KEY_DATACENTERS]: localData });
            processDataIntoMap(localData);
        } catch (e) {
            console.error("RoValra: Could not load local fallback JSON.", e);
            serverIpMap = {};
        }
    }


    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const apiResponse = await callRobloxApi({
            isRovalraApi: true,
            endpoint: API_ENDPOINT_DATACENTERS_LIST,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!apiResponse.ok) throw new Error(`API Status: ${apiResponse.status}`);

        const apiData = await apiResponse.json();

        if (JSON.stringify(apiData) !== JSON.stringify(currentData)) {
            await chrome.storage.local.set({ [STORAGE_KEY_DATACENTERS]: apiData });
            processDataIntoMap(apiData);
        }
    } catch (e) {
        const msg = e.name === 'AbortError' ? 'Timeout' : e.message;
    } finally {
        window.rovalraDatacenterState = 'complete';
    }
}


async function fetchAndProcessRegions() {
    const newRegions = { "AUTO": { city: "Automatic", state: null, country: null, latitude: null, longitude: null } };
    const newContinents = {};
    let data;

    try {
        const response = await callRobloxApi({
            isRovalraApi: true,
            endpoint: API_ENDPOINT_DATACENTERS_LIST
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        data = await response.json();
    } catch (error) {
        console.warn("RoValra: API failed, using fallback.", error.message);
        try {
            const fallbackUrl = chrome.runtime.getURL(FALLBACK_JSON_PATH);
            const response = await fetch(fallbackUrl);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            data = await response.json();
        } catch (fallbackError) {
            console.error("RoValra Critical: Could not load region data.", fallbackError);
            return { regions: newRegions, continents: newContinents };
        }
    }

    if (data && Array.isArray(data)) {
        for (const item of data) {
            const loc = item.location;
            if (!loc || !loc.country || !loc.latLong || loc.latLong.length !== 2) continue;

            const countryCode = loc.country;
            const state = loc.region;
            const city = loc.city;
            let regionCode = countryCode;

            if (countryCode === 'US' && state && city) {
                const stateCode = getStateCodeFromRegion(state);
                const cityCode = city.replace(/\s+/g, '').toUpperCase();
                regionCode = `US-${stateCode}-${cityCode}`;
            } else if (countryCode === 'US' && state) {
                regionCode = `US-${getStateCodeFromRegion(state)}`;
            } else if (city) {
                regionCode = `${countryCode}-${city.replace(/\s+/g, '').toUpperCase()}`;
            }

            if (!newRegions[regionCode]) {
                newRegions[regionCode] = {
                    latitude: parseFloat(loc.latLong[0]),
                    longitude: parseFloat(loc.latLong[1]),
                    city: loc.city,
                    state: state,
                    country: countryCode,
                    countryName: loc.countryName
                };
            }
        }
    }

    await chrome.storage.local.set({ 
        [STORAGE_KEY_REGIONS]: newRegions, 
        [STORAGE_KEY_CONTINENTS]: newContinents 
    });
    
    REGIONS = newRegions;
    cachedRegionData = { regions: newRegions, continents: newContinents };
    
    return cachedRegionData;
}


export async function getRegionData() {
    if (cachedRegionData) return cachedRegionData;

    return new Promise((resolve, reject) => {
        chrome.storage.local.get([STORAGE_KEY_REGIONS, STORAGE_KEY_CONTINENTS], async (result) => {
            if (result[STORAGE_KEY_REGIONS] && 
                result[STORAGE_KEY_REGIONS]["AUTO"] && 
                result[STORAGE_KEY_REGIONS]["AUTO"].city === "Automatic") {
                
                REGIONS = result[STORAGE_KEY_REGIONS];
                cachedRegionData = { 
                    regions: result[STORAGE_KEY_REGIONS], 
                    continents: result[STORAGE_KEY_CONTINENTS] || {} 
                };
                resolve(cachedRegionData);
            } else {
                try {
                    const data = await fetchAndProcessRegions();
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            }
        });
    });
}

export function getFullRegionName(regionCode) {
    const regionData = REGIONS[regionCode];
    
    if (!regionData) {
        if (regionCode === "AUTO") return "Automatic";
        
        const parts = regionCode.split('-');
        if (parts.length >= 2) {
            const countryCode = parts[0];
            const cityCode = parts[parts.length - 1];
            
            const formattedCity = cityCode
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .trim();
            
            return `${formattedCity}, ${countryCode}`;
        }
        return regionCode;
    }

    if (regionCode === "AUTO") return regionData.city;

    let parts = [];
    if (regionData.city && regionData.city !== regionData.country) parts.push(regionData.city);
    if (regionData.state && regionData.country === "United States") parts.push(regionData.state);
    if (regionData.country) parts.push(regionData.country);
    
    parts = [...new Set(parts.filter(p => p))];
    
    if (parts.length > 1 && parts[parts.length - 1] === "United States") {
        parts[parts.length - 1] = "USA";
    }
    
    return parts.join(', ') || regionCode;
}


const COUNTRY_CONTINENT_MAP = {
    'AF': 'Asia', 'AX': 'Europe', 'AL': 'Europe', 'DZ': 'Africa', 'AS': 'Oceania', 'AD': 'Europe', 
    'AO': 'Africa', 'AI': 'North America', 'AQ': 'Antarctica', 'AG': 'North America', 'AR': 'South America', 
    'AM': 'Asia', 'AW': 'North America', 'AU': 'Oceania', 'AT': 'Europe', 'AZ': 'Asia', 'BS': 'North America', 
    'BH': 'Asia', 'BD': 'Asia', 'BB': 'North America', 'BY': 'Europe', 'BE': 'Europe', 'BZ': 'North America', 
    'BJ': 'Africa', 'BM': 'North America', 'BT': 'Asia', 'BO': 'South America', 'BQ': 'North America', 
    'BA': 'Europe', 'BW': 'Africa', 'BV': 'Antarctica', 'BR': 'South America', 'IO': 'Asia', 'BN': 'Asia', 
    'BG': 'Europe', 'BF': 'Africa', 'BI': 'Africa', 'CV': 'Africa', 'KH': 'Asia', 'CM': 'Africa', 
    'CA': 'North America', 'KY': 'North America', 'CF': 'Africa', 'TD': 'Africa', 'CL': 'South America', 
    'CN': 'Asia', 'CX': 'Asia', 'CC': 'Asia', 'CO': 'South America', 'KM': 'Africa', 'CG': 'Africa', 
    'CD': 'Africa', 'CK': 'Oceania', 'CR': 'North America', 'CI': 'Africa', 'HR': 'Europe', 'CU': 'North America', 
    'CW': 'North America', 'CY': 'Asia', 'CZ': 'Europe', 'DK': 'Europe', 'DJ': 'Africa', 'DM': 'North America', 
    'DO': 'North America', 'EC': 'South America', 'EG': 'Africa', 'SV': 'North America', 'GQ': 'Africa', 
    'ER': 'Africa', 'EE': 'Europe', 'SZ': 'Africa', 'ET': 'Africa', 'FK': 'South America', 'FO': 'Europe', 
    'FJ': 'Oceania', 'FI': 'Europe', 'FR': 'Europe', 'GF': 'South America', 'PF': 'Oceania', 'TF': 'Antarctica', 
    'GA': 'Africa', 'GM': 'Africa', 'GE': 'Asia', 'DE': 'Europe', 'GH': 'Africa', 'GI': 'Europe', 'GR': 'Europe', 
    'GL': 'North America', 'GD': 'North America', 'GP': 'North America', 'GU': 'Oceania', 'GT': 'North America', 
    'GG': 'Europe', 'GN': 'Africa', 'GW': 'Africa', 'GY': 'South America', 'HT': 'North America', 'HM': 'Antarctica', 
    'VA': 'Europe', 'HN': 'North America', 'HK': 'Asia', 'HU': 'Europe', 'IS': 'Europe', 'IN': 'Asia', 'ID': 'Asia', 
    'IR': 'Asia', 'IQ': 'Asia', 'IE': 'Europe', 'IM': 'Europe', 'IL': 'Asia', 'IT': 'Europe', 'JM': 'North America', 
    'JP': 'Asia', 'JE': 'Europe', 'JO': 'Asia', 'KZ': 'Asia', 'KE': 'Africa', 'KI': 'Oceania', 'KP': 'Asia', 
    'KR': 'Asia', 'KW': 'Asia', 'KG': 'Asia', 'LA': 'Asia', 'LV': 'Europe', 'LB': 'Asia', 'LS': 'Africa', 
    'LR': 'Africa', 'LY': 'Africa', 'LI': 'Europe', 'LT': 'Europe', 'LU': 'Europe', 'MO': 'Asia', 'MG': 'Africa', 
    'MW': 'Africa', 'MY': 'Asia', 'MV': 'Asia', 'ML': 'Africa', 'MT': 'Europe', 'MH': 'Oceania', 'MQ': 'North America', 
    'MR': 'Africa', 'MU': 'Africa', 'YT': 'Africa', 'MX': 'North America', 'FM': 'Oceania', 'MD': 'Europe', 
    'MC': 'Europe', 'MN': 'Asia', 'ME': 'Europe', 'MS': 'North America', 'MA': 'Africa', 'MZ': 'Africa', 
    'MM': 'Asia', 'NA': 'Africa', 'NR': 'Oceania', 'NP': 'Asia', 'NL': 'Europe', 'NC': 'Oceania', 'NZ': 'Oceania', 
    'NI': 'North America', 'NE': 'Africa', 'NG': 'Africa', 'NU': 'Oceania', 'NF': 'Oceania', 'MK': 'Europe', 
    'MP': 'Oceania', 'NO': 'Europe', 'OM': 'Asia', 'PK': 'Asia', 'PW': 'Oceania', 'PS': 'Asia', 'PA': 'North America', 
    'PG': 'Oceania', 'PY': 'South America', 'PE': 'South America', 'PH': 'Asia', 'PN': 'Oceania', 'PL': 'Europe', 
    'PT': 'Europe', 'PR': 'North America', 'QA': 'Asia', 'RE': 'Africa', 'RO': 'Europe', 'RU': 'Europe', 'RW': 'Africa', 
    'BL': 'North America', 'SH': 'Africa', 'KN': 'North America', 'LC': 'North America', 'MF': 'North America', 
    'PM': 'North America', 'VC': 'North America', 'WS': 'Oceania', 'SM': 'Europe', 'ST': 'Africa', 'SA': 'Asia', 
    'SN': 'Africa', 'RS': 'Europe', 'SC': 'Africa', 'SL': 'Africa', 'SG': 'Asia', 'SX': 'North America', 'SK': 'Europe', 
    'SI': 'Europe', 'SB': 'Oceania', 'SO': 'Africa', 'ZA': 'Africa', 'GS': 'Antarctica', 'SS': 'Africa', 'ES': 'Europe', 
    'LK': 'Asia', 'SD': 'Africa', 'SR': 'South America', 'SJ': 'Europe', 'SE': 'Europe', 'CH': 'Europe', 'SY': 'Asia', 
    'TW': 'Asia', 'TJ': 'Asia', 'TZ': 'Africa', 'TH': 'Asia', 'TL': 'Asia', 'TG': 'Africa', 'TK': 'Oceania', 
    'TO': 'Oceania', 'TT': 'North America', 'TN': 'Africa', 'TR': 'Asia', 'TM': 'Asia', 'TC': 'North America', 
    'TV': 'Oceania', 'UG': 'Africa', 'UA': 'Europe', 'AE': 'Asia', 'GB': 'Europe', 'US': 'North America', 
    'UM': 'Oceania', 'UY': 'South America', 'UZ': 'Asia', 'VU': 'Oceania', 'VE': 'South America', 'VN': 'Asia', 
    'VG': 'North America', 'VI': 'North America', 'WF': 'Oceania', 'EH': 'Africa', 'YE': 'Asia', 'ZM': 'Africa', 
    'ZW': 'Africa'
};