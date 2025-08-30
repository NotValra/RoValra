chrome.storage.local.get(['PreferredRegionEnabled'], function(result) {
    if (!result.PreferredRegionEnabled) {
        const existingButton = document.getElementById('join-preferred-region');
        if (existingButton) {
            existingButton.remove();
        }
        return;
    }

    if (window.myCustomButtonExtensionInitialized) {
        return;
    }
    window.myCustomButtonExtensionInitialized = true;

    const joinedServerIds = new Set();
    const targetContainerId = 'game-details-play-button-container';
    const referenceButtonSelector = 'button.random-server-join-button';
    const buttonToHideSelector = 'button.random-server-button';
    const newButtonId = 'join-preferred-region';
    const newButtonAriaLabel = 'Select or Join Preferred Server Region';
    const NEW_BUTTON_WIDTH = 64;
    const NEW_BUTTON_HEIGHT = 60;
    const NEW_BUTTON_MARGIN_LEFT = 5;
    const NEW_BUTTON_MARGIN_RIGHT = 0;
    const CUSTOM_BUTTON_CLASS = 'my-extension-custom-button';
    const MODAL_ID = 'my-region-selection-modal';
    const PREFERRED_REGION_STORAGE_KEY = 'robloxPreferredRegion';
    const LOADING_OVERLAY_ID = 'my-extension-loading-overlay';
    const MAX_SERVER_PAGES = Infinity;
    let REGIONS = {};

    let newButtonAdded = false;
    let targetButtonHidden = false;
    let serverLocations = {};
    let userLocation = null;
    let isRefreshing = false;
    let rateLimited = false;
    let serverIpMap = null;
    let isCurrentlyFetchingData = false;
    let serverIpMapLoaded = false;
    let userRequestedStop = false;
    let keepOverlayOpen = false;
    let csrfToken = null;
    let csrfFetchAttempted = false;

    const COUNTRY_CONTINENT_MAP = {
        'AF': 'Asia', 'AX': 'Europe', 'AL': 'Europe', 'DZ': 'Africa', 'AS': 'Oceania', 'AD': 'Europe', 'AO': 'Africa', 'AI': 'North America', 'AQ': 'Antarctica', 'AG': 'North America', 'AR': 'South America', 'AM': 'Asia', 'AW': 'North America', 'AU': 'Oceania', 'AT': 'Europe', 'AZ': 'Asia', 'BS': 'North America', 'BH': 'Asia', 'BD': 'Asia', 'BB': 'North America', 'BY': 'Europe', 'BE': 'Europe', 'BZ': 'North America', 'BJ': 'Africa', 'BM': 'North America', 'BT': 'Asia', 'BO': 'South America', 'BQ': 'North America', 'BA': 'Europe', 'BW': 'Africa', 'BV': 'Antarctica', 'BR': 'South America', 'IO': 'Asia', 'BN': 'Asia', 'BG': 'Europe', 'BF': 'Africa', 'BI': 'Africa', 'CV': 'Africa', 'KH': 'Asia', 'CM': 'Africa', 'CA': 'North America', 'KY': 'North America', 'CF': 'Africa', 'TD': 'Africa', 'CL': 'South America', 'CN': 'Asia', 'CX': 'Asia', 'CC': 'Asia', 'CO': 'South America', 'KM': 'Africa', 'CG': 'Africa', 'CD': 'Africa', 'CK': 'Oceania', 'CR': 'North America', 'CI': 'Africa', 'HR': 'Europe', 'CU': 'North America', 'CW': 'North America', 'CY': 'Asia', 'CZ': 'Europe', 'DK': 'Europe', 'DJ': 'Africa', 'DM': 'North America', 'DO': 'North America', 'EC': 'South America', 'EG': 'Africa', 'SV': 'North America', 'GQ': 'Africa', 'ER': 'Africa', 'EE': 'Europe', 'SZ': 'Africa', 'ET': 'Africa', 'FK': 'South America', 'FO': 'Europe', 'FJ': 'Oceania', 'FI': 'Europe', 'FR': 'Europe', 'GF': 'South America', 'PF': 'Oceania', 'TF': 'Antarctica', 'GA': 'Africa', 'GM': 'Africa', 'GE': 'Asia', 'DE': 'Europe', 'GH': 'Africa', 'GI': 'Europe', 'GR': 'Europe', 'GL': 'North America', 'GD': 'North America', 'GP': 'North America', 'GU': 'Oceania', 'GT': 'North America', 'GG': 'Europe', 'GN': 'Africa', 'GW': 'Africa', 'GY': 'South America', 'HT': 'North America', 'HM': 'Antarctica', 'VA': 'Europe', 'HN': 'North America', 'HK': 'Asia', 'HU': 'Europe', 'IS': 'Europe', 'IN': 'Asia', 'ID': 'Asia', 'IR': 'Asia', 'IQ': 'Asia', 'IE': 'Europe', 'IM': 'Europe', 'IL': 'Asia', 'IT': 'Europe', 'JM': 'North America', 'JP': 'Asia', 'JE': 'Europe', 'JO': 'Asia', 'KZ': 'Asia', 'KE': 'Africa', 'KI': 'Oceania', 'KP': 'Asia', 'KR': 'Asia', 'KW': 'Asia', 'KG': 'Asia', 'LA': 'Asia', 'LV': 'Europe', 'LB': 'Asia', 'LS': 'Africa', 'LR': 'Africa', 'LY': 'Africa', 'LI': 'Europe', 'LT': 'Europe', 'LU': 'Europe', 'MO': 'Asia', 'MG': 'Africa', 'MW': 'Africa', 'MY': 'Asia', 'MV': 'Asia', 'ML': 'Africa', 'MT': 'Europe', 'MH': 'Oceania', 'MQ': 'North America', 'MR': 'Africa', 'MU': 'Africa', 'YT': 'Africa', 'MX': 'North America', 'FM': 'Oceania', 'MD': 'Europe', 'MC': 'Europe', 'MN': 'Asia', 'ME': 'Europe', 'MS': 'North America', 'MA': 'Africa', 'MZ': 'Africa', 'MM': 'Asia', 'NA': 'Africa', 'NR': 'Oceania', 'NP': 'Asia', 'NL': 'Europe', 'NC': 'Oceania', 'NZ': 'Oceania', 'NI': 'North America', 'NE': 'Africa', 'NG': 'Africa', 'NU': 'Oceania', 'NF': 'Oceania', 'MK': 'Europe', 'MP': 'Oceania', 'NO': 'Europe', 'OM': 'Asia', 'PK': 'Asia', 'PW': 'Oceania', 'PS': 'Asia', 'PA': 'North America', 'PG': 'Oceania', 'PY': 'South America', 'PE': 'South America', 'PH': 'Asia', 'PN': 'Oceania', 'PL': 'Europe', 'PT': 'Europe', 'PR': 'North America', 'QA': 'Asia', 'RE': 'Africa', 'RO': 'Europe', 'RU': 'Europe', 'RW': 'Africa', 'BL': 'North America', 'SH': 'Africa', 'KN': 'North America', 'LC': 'North America', 'MF': 'North America', 'PM': 'North America', 'VC': 'North America', 'WS': 'Oceania', 'SM': 'Europe', 'ST': 'Africa', 'SA': 'Asia', 'SN': 'Africa', 'RS': 'Europe', 'SC': 'Africa', 'SL': 'Africa', 'SG': 'Asia', 'SX': 'North America', 'SK': 'Europe', 'SI': 'Europe', 'SB': 'Oceania', 'SO': 'Africa', 'ZA': 'Africa', 'GS': 'Antarctica', 'SS': 'Africa', 'ES': 'Europe', 'LK': 'Asia', 'SD': 'Africa', 'SR': 'South America', 'SJ': 'Europe', 'SE': 'Europe', 'CH': 'Europe', 'SY': 'Asia', 'TW': 'Asia', 'TJ': 'Asia', 'TZ': 'Africa', 'TH': 'Asia', 'TL': 'Asia', 'TG': 'Africa', 'TK': 'Oceania', 'TO': 'Oceania', 'TT': 'North America', 'TN': 'Africa', 'TR': 'Asia', 'TM': 'Asia', 'TC': 'North America', 'TV': 'Oceania', 'UG': 'Africa', 'UA': 'Europe', 'AE': 'Asia', 'GB': 'Europe', 'US': 'North America', 'UM': 'Oceania', 'UY': 'South America', 'UZ': 'Asia', 'VU': 'Oceania', 'VE': 'South America', 'VN': 'Asia', 'VG': 'North America', 'VI': 'North America', 'WF': 'Oceania', 'EH': 'Africa', 'YE': 'Asia', 'ZM': 'Africa', 'ZW': 'Africa'
    };

    function getContinent(countryCode) {
        return COUNTRY_CONTINENT_MAP[countryCode] || 'Other';
    }

    async function fetchRegions() {
        try {
            const waitForElement = selector => new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el && el.textContent) return resolve(el);

                const timeout = setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timed out waiting for element: ${selector}`));
                }, 5000);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el && el.textContent) {
                        clearTimeout(timeout);
                        resolve(el);
                        observer.disconnect();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });

            const dataStorageElement = await waitForElement('#rovalra-datacenter-data-storage');
            const data = JSON.parse(dataStorageElement.textContent);
            const newRegions = {};

            for (const region of data) {
                if (!region.location || !region.location.latLong) continue;

                const location = region.location;
                const country = location.country;
                const city = location.city;
                const state = location.region;
                const lat = parseFloat(location.latLong[0]);
                const lon = parseFloat(location.latLong[1]);
                let regionCode = country;

                if (country === 'US' && state && city) {
                    const stateCode = getStateCodeFromRegion(state);
                    const cityCode = city.replace(/\s+/g, '').toUpperCase();
                    regionCode = `US-${stateCode}-${cityCode}`;
                } else if (country === 'US' && state) {
                    const stateCode = getStateCodeFromRegion(state);
                    regionCode = `US-${stateCode}`;
                }

                if (!newRegions[regionCode]) {
                    newRegions[regionCode] = {
                        latitude: lat,
                        longitude: lon,
                        city: city,
                        state: state,
                        country: location.countryName || country
                    };
                }
            }
            REGIONS = newRegions;
        } catch (error) {
            console.error("Error loading regions from data storage element:", error);
            if (typeof REGIONS === 'undefined') {
                REGIONS = {};
            }
        }
    }

    function createGlobeSVG() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "33");
        svg.setAttribute("height", "33");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.innerHTML = `<path d="M15 2.4578C14.053 2.16035 13.0452 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 10.2847 21.5681 8.67022 20.8071 7.25945M17 5.75H17.005M10.5001 21.8883L10.5002 19.6849C10.5002 19.5656 10.5429 19.4502 10.6205 19.3596L13.1063 16.4594C13.3106 16.2211 13.2473 15.8556 12.9748 15.6999L10.1185 14.0677C10.0409 14.0234 9.97663 13.9591 9.93234 13.8814L8.07046 10.6186C7.97356 10.4488 7.78657 10.3511 7.59183 10.3684L2.06418 10.8607M21 6C21 8.20914 19 10 17 12C15 10 13 8.20914 13 6C13 3.79086 14.7909 2 17 2C19.2091 2 21 3.79086 21 6ZM17.25 5.75C17.25 5.88807 17.1381 6 17 6C16.8619 6 16.75 5.88807 16.75 5.75C16.75 5.61193 16.8619 5.5 17 5.5C17.1381 5.5 17.25 5.61193 17.25 5.75Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        return svg;
    }

    function createRobloxLogoIMG() {
        const img = document.createElement('img');
        try {
            img.src = chrome.runtime.getURL("Assets/icon-128.png");
            img.alt = "Logo";
        } catch (e) {
            console.error("Could not load extension icon for modal.");
            img.alt = "Error";
        }
        return img;
    }

    function injectCustomCSS() {
        const styleId = 'my-custom-ui-styles';
        if (document.getElementById(styleId)) return;

        const css = `
            .${CUSTOM_BUTTON_CLASS} {
                position: relative; overflow: visible;
                width: ${NEW_BUTTON_WIDTH}px !important; height: ${NEW_BUTTON_HEIGHT}px !important;
                margin-left: ${NEW_BUTTON_MARGIN_LEFT}px !important; margin-right: ${NEW_BUTTON_MARGIN_RIGHT}px !important;
                padding: 0 !important; display: flex !important; align-items: center !important;
                justify-content: center !important; flex-shrink: 0 !important; visibility: visible !important;
                opacity: 1 !important; order: 0; border: none !important;
                background-color: rgb(51, 95, 255) !important; color: white !important;
                cursor: pointer; border-radius: 12px;
                transition: background-color 0.2s;
            }
            .${CUSTOM_BUTTON_CLASS}:hover {
                background-color: rgba(41, 82, 233, 1) !important;
            }
            .${CUSTOM_BUTTON_CLASS} svg path { stroke: white !important; }
            .my-extension-custom-tooltip {
                position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 8px; background-color: #232527; color: #FFFFFF; padding: 6px 10px; border-radius: 6px; font-size: 13px; font-family: "Gotham SSm A", "Gotham SSm B", Arial, sans-serif; font-weight: 500; text-align: center; z-index: 10005; visibility: hidden; opacity: 0; transition: opacity 0.15s ease, visibility 0s ease 0.15s; pointer-events: none; white-space: pre-wrap;min-width: 150px;
                max-width: 250px;
            }
            .${CUSTOM_BUTTON_CLASS}:hover .my-extension-custom-tooltip {
                visibility: visible; opacity: 1; transition: opacity 0.15s ease, visibility 0s ease 0s;
            }
            :root {
                --modal-bg-light: #FFFFFF; --modal-text-light: #1E2024; --modal-subtext-light: #5F6368; --modal-border-light: #E0E0E0; --modal-input-bg-light: #F1F3F4; --modal-input-text-light: #202124; --modal-btn-secondary-bg-light: #E8EAED; --modal-btn-secondary-text-light: #3C4043; --modal-btn-secondary-hover-light: #D2D5D9;
                --modal-bg-dark: #2D2F34; --modal-text-dark: #E8EAED; --modal-subtext-dark: #9AA0A6; --modal-border-dark: #5F6368; --modal-input-bg-dark: #3C4043; --modal-input-text-dark: #E8EAED; --modal-btn-secondary-bg-dark: #5F6368; --modal-btn-secondary-text-dark: #E8EAED; --modal-btn-secondary-hover-dark: #72777D;
            }
            #${MODAL_ID}-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s ease; }
            #${MODAL_ID}-overlay.visible { opacity: 1; visibility: visible; }
            #${MODAL_ID}-content { background-color: var(--modal-bg-light); color: var(--modal-text-light); padding: 0; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); max-width: 500px; width: 90%; text-align: left; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease; }
            #${MODAL_ID}-overlay.visible #${MODAL_ID}-content { transform: scale(1); opacity: 1; }
            .my-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--modal-border-light); }
            .my-modal-header h2 { margin: 0; font-size: 1.4em; font-weight: 600; }
            .my-modal-body { padding: 24px; }
            .my-modal-body p { margin: 0 0 20px 0; line-height: 1.6; color: var(--modal-subtext-light); }
            .my-modal-footer { padding: 16px 24px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--modal-border-light); }
            .my-modal-footer button { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.95em; font-weight: 600; transition: background-color 0.2s ease, box-shadow 0.2s ease; }
            .my-modal-footer button.save-button { background-color: rgb(51, 95, 255); color: white; }
            .my-modal-footer button.save-button:hover { background-color: rgb(31, 75, 235); box-shadow: 0 2px 8px rgba(51, 95, 255, 0.3); }
            .my-modal-footer button.close-button { background-color: var(--modal-btn-secondary-bg-light); color: var(--modal-btn-secondary-text-light); }
            .my-modal-footer button.close-button:hover { background-color: var(--modal-btn-secondary-hover-light); }
            .my-modal-header .close-icon { background: transparent; border: none; font-size: 28px; line-height: 1; cursor: pointer; color: var(--modal-subtext-light); padding: 0; }
            .custom-select-wrapper { position: relative; }
            .custom-select-wrapper select { appearance: none; -webkit-appearance: none; width: 100%; padding: 12px 40px 12px 16px; border: 1px solid var(--modal-border-light); border-radius: 8px; background-color: var(--modal-input-bg-light); color: var(--modal-input-text-light); font-size: 1.05em; cursor: pointer; }
            .custom-select-wrapper::after { content: '▼'; font-size: 14px; color: var(--modal-subtext-light); position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; }
            body.dark-theme #${MODAL_ID}-content { background-color: var(--modal-bg-dark); color: var(--modal-text-dark); }
            body.dark-theme .my-modal-header { border-bottom-color: var(--modal-border-dark); }
            body.dark-theme .my-modal-body p { color: var(--modal-subtext-dark); }
            body.dark-theme .custom-select-wrapper select { background-color: var(--modal-input-bg-dark); color: var(--modal-input-text-dark); border-color: var(--modal-border-dark); }
            body.dark-theme .custom-select-wrapper::after { color: var(--modal-subtext-dark); }
            body.dark-theme .my-modal-footer { border-top-color: var(--modal-border-dark); }
            body.dark-theme .my-modal-footer button.close-button { background-color: var(--modal-btn-secondary-bg-dark); color: var(--modal-btn-secondary-text-dark); }
            body.dark-theme .my-modal-footer button.close-button:hover { background-color: var(--modal-btn-secondary-hover-dark); }

            #${LOADING_OVERLAY_ID}-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.75); z-index: 10000; visibility: hidden; opacity: 0; transition: opacity 0.3s ease; }
            #${LOADING_OVERLAY_ID}-backdrop.visible { visibility: visible; opacity: 1; }
            #${LOADING_OVERLAY_ID} { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95); min-width: 350px; padding: 30px 40px; border-radius: 8px; background-color: rgb(39, 41, 48); display: flex; flex-direction: column; align-items: center; z-index: 10001; color: #E1E1E1; visibility: hidden; opacity: 0; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            #${LOADING_OVERLAY_ID}.visible { visibility: visible; opacity: 1; transform: translate(-50%, -50%) scale(1); }
            #${LOADING_OVERLAY_ID}-logo img { width: 75px; height: 75px; margin-bottom: 18px; }
            #${LOADING_OVERLAY_ID}-text { font-size: 1.15em; font-weight: 500; margin-bottom: 22px; text-align: center; }
            #${LOADING_OVERLAY_ID}-dots { display: flex; justify-content: center; gap: 10px; }
            .${LOADING_OVERLAY_ID}-dot { width: 13px; height: 13px; background-color: #808080; border-radius: 3px; animation: ${LOADING_OVERLAY_ID}-pulse 1.4s infinite ease-in-out both; }
            .${LOADING_OVERLAY_ID}-dot:nth-child(1) { animation-delay: -0.32s; } .${LOADING_OVERLAY_ID}-dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes ${LOADING_OVERLAY_ID}-pulse { 0%, 80%, 100% { transform: scale(0.8); background-color: #666; } 40% { transform: scale(1.0); background-color: #a0a0a0; } }
            #${LOADING_OVERLAY_ID}-close-button { position: absolute; top: 10px; right: 12px; background: transparent; border: none; color: #aaa; font-size: 28px; line-height: 1; cursor: pointer; }

            body:not(.dark-theme) .my-extension-custom-tooltip {
                background-color: var(--modal-bg-light, #FFFFFF);
                color: var(--modal-text-light, #1E2024);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                border: 1px solid var(--modal-border-light, #E0E0E0);
            }
            body:not(.dark-theme) #${LOADING_OVERLAY_ID} {
                background-color: var(--modal-bg-light);
                color: var(--modal-text-light);
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
            }
            body:not(.dark-theme) #${LOADING_OVERLAY_ID}-close-button {
                color: var(--modal-subtext-light);
            }
            body:not(.dark-theme) .${LOADING_OVERLAY_ID}-dot {
                animation-name: ${LOADING_OVERLAY_ID}-pulse-light;
                background-color: #E8EAED;
            }
            @keyframes ${LOADING_OVERLAY_ID}-pulse-light {
                0%, 80%, 100% { transform: scale(0.8); background-color: #D2D5D9; }
                40% { transform: scale(1.0); background-color: #9AA0A6; }
            }
        `;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function checkContainerStyle(container) {
        if (!container) return false;
        const style = window.getComputedStyle(container);
        return style.display === 'flex';
    }

    function findAndHideButton(container) {
        if (!container || targetButtonHidden || !referenceButtonSelector || !buttonToHideSelector) {
            return false;
        }

        const referenceButton = container.querySelector(referenceButtonSelector);
        if (!referenceButton) return false;

        const buttonToHide = container.querySelector(buttonToHideSelector);
        if (!buttonToHide || buttonToHide === referenceButton || buttonToHide.id === newButtonId) {
            return false;
        }

        Object.assign(buttonToHide.style, {
            display: 'none',
            width: '0',
            minWidth: '0',
            padding: '0',
            margin: '0',
            border: 'none',
            visibility: 'hidden'
        });
        buttonToHide.setAttribute('aria-hidden', 'true');
        buttonToHide.tabIndex = -1;

        targetButtonHidden = true;
        return true;
    }

    function updateButtonTooltip(buttonElement, regionCode) {
        if (!buttonElement) return;
        const tooltipSpan = buttonElement.querySelector('.my-extension-custom-tooltip');
        if (!tooltipSpan) return;

        if (regionCode && REGIONS[regionCode]) {
            const regionName = getFullLocationName(regionCode);
            tooltipSpan.innerHTML = `Join Preferred Region<br>${regionName}`;
        } else {
            tooltipSpan.innerHTML = 'Select Preferred Region';
        }
    }

    async function showRegionSelectionModal(buttonToUpdate) {
        if (document.getElementById(`${MODAL_ID}-overlay`)) return;
        await fetchRegions();

        const groupedRegions = {};
        const continentOrder = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania', 'Other'];

        Object.keys(REGIONS)
            .sort((a, b) =>
                (REGIONS[a].country || '').localeCompare(REGIONS[b].country || '') ||
                (REGIONS[a].state || '').localeCompare(REGIONS[b].state || '') ||
                (REGIONS[a].city || '').localeCompare(REGIONS[b].city || '')
            )
            .forEach(key => {
                const region = REGIONS[key];
                const continent = getContinent(region.country);
                if (!groupedRegions[continent]) {
                    groupedRegions[continent] = [];
                }
                groupedRegions[continent].push({ key, text: getFullLocationName(key) });
            });

        const optionsHtml = continentOrder
            .map(continent =>
                groupedRegions[continent] ?
                `<optgroup label="${continent}">${groupedRegions[continent].map(r => `<option value="${r.key}">${r.text}</option>`).join('')}</optgroup>` :
                ''
            )
            .join('');

        const overlay = document.createElement('div');
        overlay.id = `${MODAL_ID}-overlay`;
        overlay.innerHTML = `
            <div id="${MODAL_ID}-content">
                <div class="my-modal-header">
                    <h2>Select Preferred Region</h2>
                    <button class="close-icon">&times;</button>
                </div>
                <div class="my-modal-body">
                    <p>Choose the server region closest to you for the best connection.<br>You can always change it later in the RoValra Settings.</p>
                    <label for="${MODAL_ID}-select">Preferred Region</label>
                    <div class="custom-select-wrapper">
                        <select id="${MODAL_ID}-select">
                            <option value="" disabled selected>-- Please choose a region --</option>
                            ${optionsHtml}
                        </select>
                    </div>
                </div>
                <div class="my-modal-footer">
                    <button class="close-button">Close</button>
                    <button class="save-button">Save</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));

        const closeModal = () => {
            overlay.classList.remove('visible');
            overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        };

        const content = overlay.querySelector(`#${MODAL_ID}-content`);
        content.querySelector('.save-button').onclick = async () => {
            const val = content.querySelector('select').value;
            if (val) {
                await chrome.storage.local.set({ [PREFERRED_REGION_STORAGE_KEY]: val });
                if (buttonToUpdate) {
                    updateButtonTooltip(buttonToUpdate, val);
                }
                closeModal();
            }
        };

        content.querySelector('.close-button').onclick = closeModal;
        content.querySelector('.close-icon').onclick = closeModal;
        overlay.onclick = e => {
            if (e.target === overlay) closeModal();
        };
    }

    function showLoadingOverlay() {
        let backdrop = document.getElementById(`${LOADING_OVERLAY_ID}-backdrop`);
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = `${LOADING_OVERLAY_ID}-backdrop`;
            document.body.appendChild(backdrop);
        }

        let overlay = document.getElementById(LOADING_OVERLAY_ID);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = LOADING_OVERLAY_ID;
            overlay.innerHTML = `
                <button id="${LOADING_OVERLAY_ID}-close-button" aria-label="Cancel Server Search">✕</button>
                <div id="${LOADING_OVERLAY_ID}-logo"></div>
                <p id="${LOADING_OVERLAY_ID}-text">Searching For Servers...</p>
                <div id="${LOADING_OVERLAY_ID}-dots">
                    <div class="${LOADING_OVERLAY_ID}-dot"></div>
                    <div class="${LOADING_OVERLAY_ID}-dot"></div>
                    <div class="${LOADING_OVERLAY_ID}-dot"></div>
                </div>`;
            document.body.appendChild(overlay);
            document.getElementById(`${LOADING_OVERLAY_ID}-logo`).appendChild(createRobloxLogoIMG());
            document.getElementById(`${LOADING_OVERLAY_ID}-close-button`).onclick = () => {
                userRequestedStop = true;
                hideLoadingOverlay();
            };
        }

        document.getElementById(`${LOADING_OVERLAY_ID}-text`).textContent = 'Searching For Servers...';
        document.getElementById(`${LOADING_OVERLAY_ID}-dots`).style.display = 'flex';

        const existingButton = overlay.querySelector('.change-region-button');
        if (existingButton) {
            existingButton.remove();
        }

        requestAnimationFrame(() => {
            backdrop.classList.add('visible');
            overlay.classList.add('visible');
        });
    }

    function hideLoadingOverlay() {
        if (keepOverlayOpen) return;
        const overlay = document.getElementById(LOADING_OVERLAY_ID);
        const backdrop = document.getElementById(`${LOADING_OVERLAY_ID}-backdrop`);
        if (overlay) overlay.classList.remove('visible');
        if (backdrop) backdrop.classList.remove('visible');
        isCurrentlyFetchingData = false;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getPlaceIdFromUrl() {
        const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
        const match = window.location.href.match(regex);
        return (match && match[1]) ? match[1] : null;
    }

    function getFullLocationName(regionCode) {
        const regionData = REGIONS[regionCode];
        if (!regionData) {
            if (regionCode === "??") return "Unknown Region";
            if (regionCode.startsWith("US-")) {
                const parts = regionCode.split('-');
                if (parts.length === 3) return `${parts[2]}, ${parts[1]}, USA`;
                return `${parts[1]}, USA`;
            }
            return regionCode;
        }

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

    function getStateCodeFromRegion(regionName) {
        const stateMap = { 'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY' };
        return stateMap[regionName] || (regionName ? regionName.substring(0, 2).toUpperCase() : '');
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        if ([lat1, lon1, lat2, lon2].some(coord => typeof coord !== 'number' || isNaN(coord))) {
            return NaN;
        }
        const R = 6371;
        const toRadians = (degrees) => degrees * Math.PI / 180;
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);
        const rLat1 = toRadians(lat1);
        const rLat2 = toRadians(lat2);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function getCsrfToken() {
        if (csrfToken) return csrfToken;

        const metaTokenEl = document.querySelector('meta[name="csrf-token"]');
        const metaToken = metaTokenEl ? metaTokenEl.getAttribute('content') : null;

        if (csrfFetchAttempted && metaToken) {
            csrfToken = metaToken;
            return csrfToken;
        }

        csrfFetchAttempted = true;
        try {
            const response = await fetch('https://auth.roblox.com/v2/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            const token = response.headers.get('x-csrf-token');
            if (token) {
                csrfToken = token;
                return token;
            }
        } catch (error) {
        }

        if (metaToken) {
            csrfToken = metaToken;
            return csrfToken;
        }

        csrfToken = null;
        return null;
    }

    async function loadServerIpMapIfNeeded() {
        try {
            const waitForElement = selector => new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el && el.textContent) return resolve(el);
                const timeout = setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timed out waiting for element: ${selector}`));
                }, 5000);
                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el && el.textContent) {
                        clearTimeout(timeout);
                        resolve(el);
                        observer.disconnect();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });

            const dataStorageElement = await waitForElement('#rovalra-datacenter-data-storage');
            const serverListData = JSON.parse(dataStorageElement.textContent);
            const map = {};

            if (Array.isArray(serverListData)) {
                for (const dc of serverListData) {
                    if (dc.dataCenterIds && Array.isArray(dc.dataCenterIds) && dc.location) {
                        for (const id of dc.dataCenterIds) {
                            map[id] = dc.location;
                        }
                    }
                }
            }

            serverIpMap = map;
            serverIpMapLoaded = true;
            return true;
        } catch (error) {
            console.error("[Region Play Button] Failed to load datacenter map from storage element.", error);
            serverIpMap = {};
            serverIpMapLoaded = false;
            return false;
        }
    }

    async function _internal_handleServer(server, placeId) {
        const serverId = server?.id;
        if (!serverId || userRequestedStop) return;

        if (serverLocations[serverId]?.l !== undefined) {
            if (userLocation && serverLocations[serverId].l) {
                const dist = calculateDistance(userLocation.latitude, userLocation.longitude, serverLocations[serverId].l.latitude, serverLocations[serverId].l.longitude);
                server.calculatedPing = !isNaN(dist) ? Math.round(dist * 0.1) : Infinity;
            } else {
                server.calculatedPing = Infinity;
            }
            return;
        }

        let regionCode = "??";
        let serverLat = null,
            serverLon = null;
        serverLocations[serverId] = { c: "??", l: null };
        server.calculatedPing = Infinity;

        try {
            let currentCsrfToken = await getCsrfToken();
            if (!currentCsrfToken) {
                csrfToken = null;
                csrfFetchAttempted = false;
                currentCsrfToken = await getCsrfToken();
                if (!currentCsrfToken) return;
            }

            if (userRequestedStop) return;

            const serverInfoResponse = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                method: 'POST',
                headers: { "Accept": "application/json", "Content-Type": "application/json", "Referer": `https://www.roblox.com/games/${placeId}/`, "Origin": "https://www.roblox.com", "X-Csrf-Token": currentCsrfToken, },
                body: JSON.stringify({ placeId: parseInt(placeId, 10), isTeleport: false, gameId: serverId, gameJoinAttemptId: crypto.randomUUID(), }),
                credentials: 'include',
            });

            if (!serverInfoResponse.ok) {
                if (serverInfoResponse.status === 403) {
                    csrfToken = null;
                    csrfFetchAttempted = false;
                }
                return;
            }

            const serverInfo = await serverInfoResponse.json();
            if (userRequestedStop) return;

            if (serverInfo?.message === "You need to purchase access to this game before you can play.") {
                const overlayText = document.getElementById(`${LOADING_OVERLAY_ID}-text`);
                if (overlayText) overlayText.textContent = `You need to buy the game to view regions.`;
            }

            try {
                const sessionData = JSON.parse(serverInfo?.joinScript?.SessionId || '{}');
                const { Latitude, Longitude } = sessionData;
                if (typeof Latitude === 'number' && typeof Longitude === 'number' && (Latitude !== 0 || Longitude !== 0)) {
                    if (!userLocation || userLocation.latitude !== Latitude || userLocation.longitude !== Longitude) {
                        userLocation = { latitude: Latitude, longitude: Longitude };
                    }
                }
            } catch (e) {
            }

            const dataCenterId = serverInfo?.joinScript?.DataCenterId;
            if (dataCenterId && serverIpMap && serverIpMap[dataCenterId]) {
                const locationData = serverIpMap[dataCenterId];

                if (locationData.latLong?.length === 2) {
                    serverLat = parseFloat(locationData.latLong[0]);
                    serverLon = parseFloat(locationData.latLong[1]);
                }

                const { country, region, city } = locationData;
                if (country === 'US' && region && city) {
                    const stateCode = getStateCodeFromRegion(region);
                    const cityCode = city.replace(/\s+/g, '').toUpperCase();
                    regionCode = `US-${stateCode}-${cityCode}`;
                } else if (country === 'US' && region) {
                    regionCode = `US-${getStateCodeFromRegion(region)}`;
                } else if (country) {
                    regionCode = country;
                }
            }

            serverLocations[serverId] = {
                c: regionCode,
                l: (typeof serverLat === 'number' && typeof serverLon === 'number') ? { latitude: serverLat, longitude: serverLon } : null,
                dcid: dataCenterId
            };

            if (userLocation && serverLocations[serverId].l) {
                const distance = calculateDistance(userLocation.latitude, userLocation.longitude, serverLat, serverLon);
                server.calculatedPing = !isNaN(distance) ? Math.round(distance * 0.1) : Infinity;
            }

        } catch (error) {
            serverLocations[serverId] = { c: "??", l: null };
            server.calculatedPing = Infinity;
        }
    }

    async function findAndJoinServerProcess(placeId, targetRegionCode) {
        const MAX_RETRIES_PER_PAGE = 3;
        const INITIAL_DELAY_MS = 1000;
        const BACKOFF_FACTOR = 2;
        const MAX_DELAY_MS = 15000;

        rateLimited = false;
        serverLocations = {};

        try {
            const mapReady = await loadServerIpMapIfNeeded();
            if (!mapReady) return { joined: false, error: 'map_load_failed' };

            const initialToken = await getCsrfToken();
            if (!initialToken) return { joined: false, error: 'csrf_failed' };

            let nextCursor = null;
            let pageCount = 0;

            while (pageCount < MAX_SERVER_PAGES) {
                if (userRequestedStop) return { joined: false, stopped: true };

                pageCount++;
                let attempts = 0;
                let currentDelay = INITIAL_DELAY_MS;
                let pageFetchSuccess = false;
                let pageData = null;

                let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
                if (nextCursor) url += `&cursor=${encodeURIComponent(nextCursor)}`;

                while (attempts < MAX_RETRIES_PER_PAGE && !pageFetchSuccess) {
                    if (userRequestedStop) return { joined: false, stopped: true };
                    try {
                        const response = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' });
                        if (response.ok) {
                            pageData = await response.json();
                            pageFetchSuccess = true;
                        } else if (response.status === 429) {
                            rateLimited = true;
                            await delay(currentDelay);
                            currentDelay = Math.min(currentDelay * BACKOFF_FACTOR, MAX_DELAY_MS);
                        } else {
                            throw new Error(`API Error: ${response.status}`);
                        }
                    } catch (fetchError) {
                        await delay(currentDelay);
                        currentDelay = Math.min(currentDelay * BACKOFF_FACTOR, MAX_DELAY_MS);
                    }
                    attempts++;
                }

                if (!pageFetchSuccess) {
                    return { joined: false, error: 'page_fetch_failed' };
                }

                const serversOnThisPage = pageData.data || [];
                if (serversOnThisPage.length > 0) {
                    await Promise.all(serversOnThisPage.map(server => _internal_handleServer(server, placeId)));

                    const availableServers = serversOnThisPage.filter(s =>
                        serverLocations[s.id]?.c === targetRegionCode &&
                        !joinedServerIds.has(s.id)
                    );

                    if (availableServers.length > 0) {
                        let bestServer = null;
                        let bestScore = -Infinity;

                        availableServers.forEach(server => {
                            if (server.playing >= server.maxPlayers) return;

                            const ping = server.calculatedPing ?? Infinity;
                            const players = server.playing ?? 0;
                            const maxPlayers = server.maxPlayers ?? Infinity;
                            let score = (ping !== Infinity && ping >= 0) ?
                                (500 - Math.min(ping, 500)) * 10 + (players / maxPlayers) * 50 :
                                -Infinity;

                            if (score > bestScore) {
                                bestScore = score;
                                bestServer = server;
                            }
                        });

                        if (bestServer) {
                            joinSpecificServer(placeId, bestServer.id);
                            return { joined: true };
                        }
                    }
                }

                nextCursor = pageData.nextPageCursor;
                if (!nextCursor) break;
            }

            return { joined: false };
        } catch (error) {
            console.error("[Region Play Button] Error during server search process:", error);
            return { joined: false, error: 'unknown' };
        }
    }

    function joinSpecificServer(placeId, serverId) {
        const safePlaceId = String(placeId);
        const safeServerId = String(serverId);

        if (!/^\d+$/.test(safePlaceId) || !/^[0-9a-fA-F-]+$/.test(safeServerId)) {
            alert("Error: Could not join server due to invalid ID.");
            return;
        }

        joinedServerIds.add(safeServerId);
        const codeToInject = `Roblox?.GameLauncher?.joinGameInstance?.(parseInt('${safePlaceId}', 10), '${safeServerId}');`;

        chrome.runtime.sendMessage({ action: "injectScript", codeToInject }, response => {
            if (chrome.runtime.lastError) {
                alert("Error communicating with the extension's background process.");
                return;
            }
            if (response && !response.success) {
                alert(`Error initiating join: ${response?.error || 'Unknown error.'}`);
            }
        });
    }

    async function performJoinAction(regionCode) {
        const placeId = getPlaceIdFromUrl();
        if (!placeId) {
            alert("Error: Could not determine the game's Place ID.");
            return;
        }
        if (isCurrentlyFetchingData) return;

        userRequestedStop = false;
        isCurrentlyFetchingData = true;
        keepOverlayOpen = false;
        showLoadingOverlay();

        try {
            const result = await findAndJoinServerProcess(placeId, regionCode);
            if (!userRequestedStop && !result.stopped && !result.joined) {
                keepOverlayOpen = true;
                const textEl = document.getElementById(`${LOADING_OVERLAY_ID}-text`);
                const overlayEl = document.getElementById(LOADING_OVERLAY_ID);
                const locationName = getFullLocationName(regionCode);

                if (textEl && overlayEl) {
                    textEl.innerHTML = `No available servers found in ${locationName}.<br>Some Regions might not be running 24/7`;
                    document.getElementById(`${LOADING_OVERLAY_ID}-dots`).style.display = 'none';

                    overlayEl.querySelector('.change-region-button')?.remove();

                    const changeRegionButton = document.createElement('button');
                    changeRegionButton.textContent = 'Change Region';
                    changeRegionButton.className = 'change-region-button';

                    Object.assign(changeRegionButton.style, { marginTop: '15px', padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: 'rgb(51, 95, 255)', color: 'white', cursor: 'pointer', fontSize: '0.95em', fontWeight: '600', transition: 'background-color 0.2s ease' });
                    changeRegionButton.onmouseover = () => { changeRegionButton.style.backgroundColor = 'rgb(41, 82, 233)'; };
                    changeRegionButton.onmouseout = () => { changeRegionButton.style.backgroundColor = 'rgb(51, 95, 255)'; };
                    changeRegionButton.onclick = () => {
                        keepOverlayOpen = false;
                        hideLoadingOverlay();
                        showRegionSelectionModal();
                    };

                    overlayEl.appendChild(changeRegionButton);
                    document.getElementById(`${LOADING_OVERLAY_ID}-close-button`).onclick = () => {
                        keepOverlayOpen = false;
                        hideLoadingOverlay();
                    };
                }
            }
        } finally {
            if (!keepOverlayOpen) hideLoadingOverlay();
            isCurrentlyFetchingData = false;
        }
    }

    async function addCustomButton(container) {
        if (!container || document.querySelector('button.btn-common-play-game-unplayable-lg') || newButtonAdded || document.getElementById(newButtonId) || container.querySelector('span.spinner.spinner-default')) {
            return false;
        }

        try {
            const computedStyle = window.getComputedStyle(container);
            if (computedStyle.display !== 'flex') container.style.display = 'flex';
            if (computedStyle.flexDirection !== 'row') container.style.flexDirection = 'row';
        } catch (styleError) {
        }

        const newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.id = newButtonId;
        newButton.className = `btn-primary-md ${CUSTOM_BUTTON_CLASS}`;
        newButton.setAttribute('aria-label', newButtonAriaLabel);
        newButton.appendChild(createGlobeSVG());

        const tooltipSpan = document.createElement('span');
        tooltipSpan.className = 'my-extension-custom-tooltip';
        newButton.appendChild(tooltipSpan);

        try {
            await fetchRegions();
            const { [PREFERRED_REGION_STORAGE_KEY]: region } = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
            updateButtonTooltip(newButton, region);
        } catch (error) {
            updateButtonTooltip(newButton, null);
        }

        newButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (isCurrentlyFetchingData) return;

            try {
                const { [PREFERRED_REGION_STORAGE_KEY]: currentSavedRegion } = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
                await fetchRegions();
                if (currentSavedRegion && REGIONS[currentSavedRegion]) {
                    await performJoinAction(currentSavedRegion);
                } else {
                    showRegionSelectionModal(newButton);
                }
            } catch (error) {
                alert("Error reading saved preference. Please try opening the selection modal again.");
                showRegionSelectionModal(newButton);
            }
        });

        if (document.getElementById(newButtonId)) {
            newButtonAdded = true;
            return true;
        }
        container.appendChild(newButton);
        newButtonAdded = true;
        return true;
    }

    let observer = null;
    const observerCallback = (mutationsList, obs) => {
        if (newButtonAdded && targetButtonHidden) {
            if (observer) obs.disconnect();
            observer = null;
            return;
        }

        const container = document.getElementById(targetContainerId);
        if (container) {
            const containerReady = checkContainerStyle(container);
            findAndHideButton(container);
            if (containerReady) {
                addCustomButton(container);
            }
        }
    };

    const tryInitialSetup = () => {
        const initialContainer = document.getElementById(targetContainerId);
        if (initialContainer) {
            const containerReady = checkContainerStyle(initialContainer);
            findAndHideButton(initialContainer);
            if (containerReady) {
                addCustomButton(initialContainer);
            }
            if (newButtonAdded && targetButtonHidden && observer) {
                observer.disconnect();
                observer = null;
            }
        }
    };

    injectCustomCSS();
    observer = new MutationObserver(observerCallback);
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    setTimeout(tryInitialSetup, 500);
    setTimeout(() => {
        if (observer) {
            observer.disconnect();
            observer = null;
            tryInitialSetup();
        }
    }, 15000);

});
