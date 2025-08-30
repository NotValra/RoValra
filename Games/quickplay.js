chrome.storage.local.get({ QuickPlayEnable: false }, (settings) => {
    if (settings.QuickPlayEnable && !window.hasRunQuickPlayScript) {
        window.hasRunQuickPlayScript = true;

        function waitForElement(selector, callback) {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    callback();
                }
            }, 100);
        }

        function initializeQuickPlay() {
            function injectStyles() {
                const style = document.createElement('style');
                style.textContent = `
                    .scroller-new { z-index: 5 !Important; }
                    .scroller {z-index: 5 !Important; }
                    a.game-tile-styles.game-card-link { position: relative; display: block; z-index: 2; transform: translateZ(0); }
                    a.game-tile-styles.game-card-link:hover { z-index: 3; }
                    a.game-tile-styles.game-card-link::after { content: ''; position: absolute; top: -2.5%; left: -2.5%; width: 105%; height: 105%; z-index: 1; }
                    a.game-tile-styles.game-card-link::before, .hover-background { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 12px; opacity: 0; transition: opacity 0.15s ease-out, transform 0.15s ease-out; pointer-events: none; will-change: transform, opacity; }
                    a.game-tile-styles.game-card-link::before { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); z-index: -2; }
                    .hover-background { background-color: rgb(39, 41, 48); transform: scale(1); z-index: -1; }
                    a.game-tile-styles.game-card-link:hover::before { opacity: 1; }
                    a.game-tile-styles.game-card-link:hover .hover-background { opacity: 1; transform: scale(1.05); }
                    a.game-tile-styles.game-card-link:hover .game-card-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                    a.game-tile-styles.game-card-link:hover .game-card-native-ad { display: none; }
    

                    .roblox-original-stats { visibility: hidden; !important; }
                    .quick-play-base-stats-container { position: absolute; bottom: 6px; left: 4px; right: 4px; z-index: 9; pointer-events: none; opacity: 1; transition: opacity 0.2s ease-out; }
                    a.game-tile-styles.game-card-link:hover .quick-play-base-stats-container { opacity: 0; }
                    .play-button-overlay { display: flex; flex-direction: column; position: absolute; bottom: 0px; left: 4px; right: 4px; z-index: 10; opacity: 0; gap: 0px; transform: translateY(8px); transition: opacity 0.2s ease-out, transform 0.2s ease-out; pointer-events: none; }
                    a.game-tile-styles.game-card-link:hover .play-button-overlay { opacity: 1; transform: translateY(0); transition-delay: 0.1s; }


                    .play-button-overlay .game-card-info, .quick-play-base-stats-container .game-card-info { display: flex; align-items: center; justify-content: flex-start; gap: 0px; height: 16px; }
                    .play-buttons-wrapper { display: flex; gap: 4px; width: 100%; }
                    .play-game-button, .server-browser-button { pointer-events: auto; background-color: rgb(51, 95, 255); color: white; border: none; padding: 4px; line-height: 0; border-radius: 6px; cursor: pointer; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; height: 28px; }
                    .play-game-button:hover, .server-browser-button:hover { background-color: rgba(41, 82, 233, 1); }
                    .play-game-button { flex-grow: 1; }
                    .server-browser-button { flex-shrink: 0; padding: 0 6px; }

                    .featured-game-container a.game-tile-styles.game-card-link::after,
                    .featured-game-container a.game-tile-styles.game-card-link::before,
                    .featured-game-container .hover-background,
                    .featured-game-container .play-button-overlay .game-card-info { display: none; }
                    .featured-game-container .play-button-overlay { bottom: 1px; left: 0px; right: 0px; justify-content: flex-end; }
                    
                    .featured-game-container .wide-game-tile-metadata {
                        transition: opacity 0.2s ease-out 0.1s, transform 0.2s ease-out 0.1s;
                        will-change: opacity, transform;
                    }
                    .featured-game-container .list-item:hover .wide-game-tile-metadata {
                        opacity: 0;
                        pointer-events: none;
                        transform: translateY(8px);
                        transition-delay: 0s;
                    }

                    li.list-item[data-testid="wide-game-tile"]:hover .play-button-overlay { opacity: 1; transform: translateY(0); transition-delay: 0.1s; }
                    li.list-item[data-testid="wide-game-tile"]:hover .original-game-stats, li.list-item[data-testid="wide-game-tile"]:hover .game-card-friend-info { opacity: 0; pointer-events: none; transform: translateY(8px); transition-delay: 0s; }
                    body:not(.dark-theme) .hover-background { background-color: rgb(247, 248, 248); }
                    body:not(.dark-theme) a.game-tile-styles.game-card-link::before { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); }
                    :root { --modal-bg-light: #FFFFFF; --modal-text-light: #1E2024; --modal-subtext-light: #5F6368; --modal-border-light: #E0E0E0; --modal-input-bg-light: #F1F3F4; --modal-input-text-light: #202124; --modal-btn-secondary-bg-light: #E8EAED; --modal-btn-secondary-text-light: #3C4043; --modal-btn-secondary-hover-light: #D2D5D9; --modal-bg-dark: #2D2F34; --modal-text-dark: #E8EAED; --modal-subtext-dark: #9AA0A6; --modal-border-dark: #5F6368; --modal-input-bg-dark: #3C4043; --modal-input-text-dark: #E8EAED; --modal-btn-secondary-bg-dark: #5F6368; --modal-btn-secondary-text-dark: #E8EAED; --modal-btn-secondary-hover-dark: #72777D; }
                    #my-region-selection-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 10001; opacity: 0; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s ease; }
                    #my-region-selection-modal-overlay.visible { opacity: 1; visibility: visible; }
                    #my-region-selection-modal-content { background-color: var(--modal-bg-light); color: var(--modal-text-light); padding: 0; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2); max-width: 500px; width: 90%; text-align: left; position: relative; transform: scale(0.95); opacity: 0; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease; }
                    #my-region-selection-modal-overlay.visible #my-region-selection-modal-content { transform: scale(1); opacity: 1; }
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
                    body.dark-theme #my-region-selection-modal-content { background-color: var(--modal-bg-dark); color: var(--modal-text-dark); }
                    body.dark-theme .my-modal-header { border-bottom-color: var(--modal-border-dark); }
                    body.dark-theme .my-modal-body p { color: var(--modal-subtext-dark); }
                    body.dark-theme .custom-select-wrapper select { background-color: var(--modal-input-bg-dark); color: var(--modal-input-text-dark); border-color: var(--modal-border-dark); }
                    body.dark-theme .custom-select-wrapper::after { color: var(--modal-subtext-dark); }
                    body.dark-theme .my-modal-footer { border-top-color: var(--modal-border-dark); }
                    body.dark-theme .my-modal-footer button.close-button { background-color: var(--modal-btn-secondary-bg-dark); color: var(--modal-btn-secondary-text-dark); }
                    body.dark-theme .my-modal-footer button.close-button:hover { background-color: var(--modal-btn-secondary-hover-dark); }
                    #my-extension-loading-overlay-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.75); z-index: 10000; visibility: hidden; opacity: 0; transition: opacity 0.3s ease; }
                    #my-extension-loading-overlay-backdrop.visible { visibility: visible; opacity: 1; }
                    #my-extension-loading-overlay { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95); min-width: 350px; padding: 30px 40px; border-radius: 8px; background-color: rgb(39, 41, 48); display: flex; flex-direction: column; align-items: center; z-index: 10001; color: #E1E1E1; visibility: hidden; opacity: 0; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                    #my-extension-loading-overlay.visible { visibility: visible; opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    #my-extension-loading-overlay-logo img { width: 75px; height: 75px; margin-bottom: 18px; }
                    #my-extension-loading-overlay-text { font-size: 1.15em; font-weight: 500; margin-bottom: 22px; text-align: center; }
                    #my-extension-loading-overlay-dots { display: flex; justify-content: center; gap: 10px; }
                    .my-extension-loading-overlay-dot { width: 13px; height: 13px; background-color: #808080; border-radius: 3px; animation: my-extension-loading-overlay-pulse 1.4s infinite ease-in-out both; }
                    .my-extension-loading-overlay-dot:nth-child(1) { animation-delay: -0.32s; } .my-extension-loading-overlay-dot:nth-child(2) { animation-delay: -0.16s; }
                    @keyframes my-extension-loading-overlay-pulse { 0%, 80%, 100% { transform: scale(0.8); background-color: #666; } 40% { transform: scale(1.0); background-color: #a0a0a0; } }
                    #my-extension-loading-overlay-close-button { position: absolute; top: 10px; right: 12px; background: transparent; border: none; color: #aaa; font-size: 28px; line-height: 1; cursor: pointer; }
                    body:not(.dark-theme) #my-extension-loading-overlay { background-color: var(--modal-bg-light); color: var(--modal-text-light); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15); }
                    body:not(.dark-theme) #my-extension-loading-overlay-close-button { color: var(--modal-subtext-light); }
                    body:not(.dark-theme) .my-extension-loading-overlay-dot { animation-name: my-extension-loading-overlay-pulse-light; background-color: #E8EAED; }
                    @keyframes my-extension-loading-overlay-pulse-light { 0%, 80%, 100% { transform: scale(0.8); background-color: #D2D5D9; } 40% { transform: scale(1.0); background-color: #9AA0A6; } }
                    .game-card-friend-info {bottom: 93px !Important; left: 3px !Important; z-index: 100;}
                    .featured-grid-item-container .game-card-friend-info {bottom: 60px !Important; left: 3px !Important; z-index: 100;}
                    .featured-grid-item-container .game-card-description-info {bottom: 10px !Important; position: relative;}
                    
                                    `;
                document.head.appendChild(style);
            }

            function createGlobeSVG() {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("width", "22");
                svg.setAttribute("height", "22");
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

            const PREFERRED_REGION_STORAGE_KEY = 'robloxPreferredRegion';
            const MAX_SERVER_PAGES = Infinity;
            const MODAL_ID = 'my-region-selection-modal';
            const LOADING_OVERLAY_ID = 'my-extension-loading-overlay';

            let REGIONS = {};
            let serverIpMap = {};
            let csrfToken = null;
            let isCurrentlyFetchingData = false;
            let userRequestedStop = false;
            let keepOverlayOpen = false;
            let serverLocations = {};
            const joinedServerIds = new Set();

            const COUNTRY_CONTINENT_MAP = {'AF': 'Asia', 'AX': 'Europe', 'AL': 'Europe', 'DZ': 'Africa', 'AS': 'Oceania', 'AD': 'Europe', 'AO': 'Africa', 'AI': 'North America', 'AQ': 'Antarctica', 'AG': 'North America', 'AR': 'South America', 'AM': 'Asia', 'AW': 'North America', 'AU': 'Oceania', 'AT': 'Europe', 'AZ': 'Asia', 'BS': 'North America', 'BH': 'Asia', 'BD': 'Asia', 'BB': 'North America', 'BY': 'Europe', 'BE': 'Europe', 'BZ': 'North America', 'BJ': 'Africa', 'BM': 'North America', 'BT': 'Asia', 'BO': 'South America', 'BQ': 'North America', 'BA': 'Europe', 'BW': 'Africa', 'BV': 'Antarctica', 'BR': 'South America', 'IO': 'Asia', 'BN': 'Asia', 'BG': 'Europe', 'BF': 'Africa', 'BI': 'Africa', 'CV': 'Africa', 'KH': 'Asia', 'CM': 'Africa', 'CA': 'North America', 'KY': 'North America', 'CF': 'Africa', 'TD': 'Africa', 'CL': 'South America', 'CN': 'Asia', 'CX': 'Asia', 'CC': 'Asia', 'CO': 'South America', 'KM': 'Africa', 'CG': 'Africa', 'CD': 'Africa', 'CK': 'Oceania', 'CR': 'North America', 'CI': 'Africa', 'HR': 'Europe', 'CU': 'North America', 'CW': 'North America', 'CY': 'Asia', 'CZ': 'Europe', 'DK': 'Europe', 'DJ': 'Africa', 'DM': 'North America', 'DO': 'North America', 'EC': 'South America', 'EG': 'Africa', 'SV': 'North America', 'GQ': 'Africa', 'ER': 'Africa', 'EE': 'Europe', 'SZ': 'Africa', 'ET': 'Africa', 'FK': 'South America', 'FO': 'Europe', 'FJ': 'Oceania', 'FI': 'Europe', 'FR': 'Europe', 'GF': 'South America', 'PF': 'Oceania', 'TF': 'Antarctica', 'GA': 'Africa', 'GM': 'Africa', 'GE': 'Asia', 'DE': 'Europe', 'GH': 'Africa', 'GI': 'Europe', 'GR': 'Europe', 'GL': 'North America', 'GD': 'North America', 'GP': 'North America', 'GU': 'Oceania', 'GT': 'North America', 'GG': 'Europe', 'GN': 'Africa', 'GW': 'Africa', 'GY': 'South America', 'HT': 'North America', 'HM': 'Antarctica', 'VA': 'Europe', 'HN': 'North America', 'HK': 'Asia', 'HU': 'Europe', 'IS': 'Europe', 'IN': 'Asia', 'ID': 'Asia', 'IR': 'Asia', 'IQ': 'Asia', 'IE': 'Europe', 'IM': 'Europe', 'IL': 'Asia', 'IT': 'Europe', 'JM': 'North America', 'JP': 'Asia', 'JE': 'Europe', 'JO': 'Asia', 'KZ': 'Asia', 'KE': 'Africa', 'KI': 'Oceania', 'KP': 'Asia', 'KR': 'Asia', 'KW': 'Asia', 'KG': 'Asia', 'LA': 'Asia', 'LV': 'Europe', 'LB': 'Asia', 'LS': 'Africa', 'LR': 'Africa', 'LY': 'Africa', 'LI': 'Europe', 'LT': 'Europe', 'LU': 'Europe', 'MO': 'Asia', 'MG': 'Africa', 'MW': 'Africa', 'MY': 'Asia', 'MV': 'Asia', 'ML': 'Africa', 'MT': 'Europe', 'MH': 'Oceania', 'MQ': 'North America', 'MR': 'Africa', 'MU': 'Africa', 'YT': 'Africa', 'MX': 'North America', 'FM': 'Oceania', 'MD': 'Europe', 'MC': 'Europe', 'MN': 'Asia', 'ME': 'Europe', 'MS': 'North America', 'MA': 'Africa', 'MZ': 'Africa', 'MM': 'Asia', 'NA': 'Africa', 'NR': 'Oceania', 'NP': 'Asia', 'NL': 'Europe', 'NC': 'Oceania', 'NZ': 'Oceania', 'NI': 'North America', 'NE': 'Africa', 'NG': 'Africa', 'NU': 'Oceania', 'NF': 'Oceania', 'MK': 'Europe', 'MP': 'Oceania', 'NO': 'Europe', 'OM': 'Asia', 'PK': 'Asia', 'PW': 'Oceania', 'PS': 'Asia', 'PA': 'North America', 'PG': 'Oceania', 'PY': 'South America', 'PE': 'South America', 'PH': 'Asia', 'PN': 'Oceania', 'PL': 'Europe', 'PT': 'Europe', 'PR': 'North America', 'QA': 'Asia', 'RE': 'Africa', 'RO': 'Europe', 'RU': 'Europe', 'RW': 'Africa', 'BL': 'North America', 'SH': 'Africa', 'KN': 'North America', 'LC': 'North America', 'MF': 'North America', 'PM': 'North America', 'VC': 'North America', 'WS': 'Oceania', 'SM': 'Europe', 'ST': 'Africa', 'SA': 'Asia', 'SN': 'Africa', 'RS': 'Europe', 'SC': 'Africa', 'SL': 'Africa', 'SG': 'Asia', 'SX': 'North America', 'SK': 'Europe', 'SI': 'Europe', 'SB': 'Oceania', 'SO': 'Africa', 'ZA': 'Africa', 'GS': 'Antarctica', 'SS': 'Africa', 'ES': 'Europe', 'LK': 'Asia', 'SD': 'Africa', 'SR': 'South America', 'SJ': 'Europe', 'SE': 'Europe', 'CH': 'Europe', 'SY': 'Asia', 'TW': 'Asia', 'TJ': 'Asia', 'TZ': 'Africa', 'TH': 'Asia', 'TL': 'Asia', 'TG': 'Africa', 'TK': 'Oceania', 'TO': 'Oceania', 'TT': 'North America', 'TN': 'Africa', 'TR': 'Asia', 'TM': 'Asia', 'TC': 'North America', 'TV': 'Oceania', 'UG': 'Africa', 'UA': 'Europe', 'AE': 'Asia', 'GB': 'Europe', 'US': 'North America', 'UM': 'Oceania', 'UY': 'South America', 'UZ': 'Asia', 'VU': 'Oceania', 'VE': 'South America', 'VN': 'Asia', 'VG': 'North America', 'VI': 'North America', 'WF': 'Oceania', 'EH': 'Africa', 'YE': 'Asia', 'ZM': 'Africa', 'ZW': 'Africa'};
            function getContinent(countryCode) { 
    return COUNTRY_CONTINENT_MAP[countryCode] || 'Other'; 
}
            const stateMap = {'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'};
            function getStateCodeFromRegion(regionName) { return regionName ? (stateMap[regionName] || regionName.substring(0, 2).toUpperCase()) : '??'; }


function processDataPayload(data) {
    const newRegions = {};
    const newIpMap = {};

    for (const entry of data) {
        if (!entry.location || !entry.dataCenterIds || !entry.location.country || !entry.location.latLong || entry.location.latLong.length !== 2) {
            continue; 
        }

        const loc = entry.location;
        const countryCode = loc.country;
        const state = loc.region;
        const city = loc.city;
        let regionCode = countryCode; 

       
        if (countryCode === 'US' && state && city) {
            const stateCode = getStateCodeFromRegion(state);
            const cityCode = city.replace(/\s+/g, '').toUpperCase();
            regionCode = `US-${stateCode}-${cityCode}`;
        } else if (countryCode === 'US' && state) {
            const stateCode = getStateCodeFromRegion(state);
            regionCode = `US-${stateCode}`;
        }


        if (!newRegions[regionCode]) {
            newRegions[regionCode] = {
                latitude: parseFloat(loc.latLong[0]),
                longitude: parseFloat(loc.latLong[1]),
                city: city,
                state: state,
                country: loc.countryName || countryCode
            };
        }


        for (const id of entry.dataCenterIds) {
            newIpMap[id] = loc;
        }
    }

    REGIONS = newRegions;
    serverIpMap = newIpMap;
}

            const dataPromise = new Promise((resolve, reject) => {
                const dataElementId = 'rovalra-datacenter-data-storage';

                const updateDataFromElement = (element) => {
                    if (!element || !element.textContent) {
                        console.warn("Quick Play: Data source element is empty or not found.");
                        return false;
                    }
                    try {
                        const data = JSON.parse(element.textContent);
                        if (data && Array.isArray(data) && data.length > 0) {
                            processDataPayload(data);
                            return true;
                        }
                    } catch (e) {
                        console.error("Quick Play: Failed to parse datacenter JSON from element.", e);
                    }
                    return false;
                };

                const setupObserver = (element) => {
                    if (updateDataFromElement(element)) {
                        resolve(); 
                    }
                    
                    const observer = new MutationObserver(() => {
                        updateDataFromElement(element);
                    });
                    
                    observer.observe(element, { characterData: true, childList: true, subtree: true });
                };

                const findElementInterval = setInterval(() => {
                    const el = document.getElementById(dataElementId);
                    if (el) {
                        clearInterval(findElementInterval);
                        setupObserver(el);
                    }
                }, 150);

                setTimeout(() => {
                    clearInterval(findElementInterval);
                    if (!document.getElementById(dataElementId)) {
                       reject(new Error(`Quick Play: Timed out waiting for data element #${dataElementId}.`));
                    }
                }, 20000); 
            });

            function launchGame(placeId, jobId) {
                const joinFunction = jobId ? `Roblox.GameLauncher.joinGameInstance(parseInt('${placeId}', 10), '${jobId}')` : `Roblox.GameLauncher.joinGameInstance(parseInt('${placeId}', 10))`;
                const codeToInject = `if (typeof Roblox?.GameLauncher?.joinGameInstance === 'function') { ${joinFunction}; }`;
                chrome.runtime.sendMessage({ action: "injectScript", codeToInject });
            }
            
            async function getCsrfToken() {
                if (csrfToken) return csrfToken;
                try {
                    const metaTag = document.querySelector('meta[name="csrf-token"]');
                    const token = metaTag ? metaTag.getAttribute('data-token') : null;
                    if (token) {
                        csrfToken = token;
                    } else {
                        console.error("Quick Play: CSRF meta tag not found.");
                    }
                } catch (e) { 
                    console.error("Quick Play: Error retrieving CSRF token from meta tag.", e); 
                }
                return csrfToken;
            }

            async function _internal_handleServer(server, placeId) {
                if (!server?.id || userRequestedStop) return;
                try {
                    let currentCsrfToken = await getCsrfToken();
                    if (!currentCsrfToken) return;
                    const res = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                        method: 'POST', headers: { "Content-Type": "application/json", "X-Csrf-Token": currentCsrfToken, "Accept": "application/json" },
                        body: JSON.stringify({ placeId: parseInt(placeId, 10), gameId: server.id, gameJoinAttemptId: crypto.randomUUID() }),
                        credentials: 'include',
                    });
                    if (!res.ok) { if (res.status === 403) csrfToken = null; return; }
                    const info = await res.json();
                    if (userRequestedStop) return;
                    const dataCenterId = info?.joinScript?.DataCenterId;
                    if (dataCenterId && serverIpMap?.[dataCenterId]) {
                        const loc = serverIpMap[dataCenterId];
                        const regionCode = loc.country === "US" ? `US-${getStateCodeFromRegion(loc.region)}` : loc.country || "???";
                        serverLocations[server.id] = { c: regionCode };
                    }
                } catch (error) { }
            }

            async function findAndJoinServerProcess(placeId, targetRegionCode) {
                serverLocations = {};
                await Promise.all([dataPromise, getCsrfToken()]);
                let nextCursor = null, pageCount = 0;
                while (pageCount++ < MAX_SERVER_PAGES && !userRequestedStop) {
                    try {
                        let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100${nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ''}`;
                        const response = await fetch(url, { credentials: 'include' });
                        if (!response.ok) { await new Promise(r => setTimeout(r, 2000)); continue; }
                        const pageData = await response.json();
                        const servers = pageData.data || [];
                        if (servers.length > 0) {
                            await Promise.all(servers.map(s => _internal_handleServer(s, placeId)));
                            const availableServers = servers.filter(s => serverLocations[s.id]?.c === targetRegionCode && !joinedServerIds.has(s.id) && s.playing < s.maxPlayers);
                            if (availableServers.length > 0) {
                                const bestServer = availableServers.reduce((best, current) => (current.playing > best.playing) ? current : best, availableServers[0]);
                                if (bestServer) {
                                    joinedServerIds.add(bestServer.id);
                                    launchGame(placeId, bestServer.id);
                                    return { joined: true };
                                }
                            }
                        }
                        if (!pageData.nextPageCursor) break;
                        nextCursor = pageData.nextPageCursor;
                    } catch (e) { break; }
                }
                return { joined: false };
            }

            async function performJoinAction(placeId, regionCode) {
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
                        const locationName = REGIONS[regionCode] ? `${REGIONS[regionCode].city}, ${REGIONS[regionCode].country}` : regionCode;
                        
                        if (textEl && overlayEl) {
                             textEl.innerHTML = `No available servers found in ${locationName}.<br>Some Regions might not be running 24/7`;
                            document.getElementById(`${LOADING_OVERLAY_ID}-dots`).style.display = 'none';
                            
                            const existingButton = overlayEl.querySelector('.change-region-button');
                            if (existingButton) {
                                existingButton.remove();
                            }

                            const changeRegionButton = document.createElement('button');
                            changeRegionButton.textContent = 'Change Region';
                            changeRegionButton.className = 'change-region-button';
                            
                            Object.assign(changeRegionButton.style, {
                                marginTop: '15px',
                                padding: '10px 20px',
                                border: 'none',
                                borderRadius: '8px',
                                backgroundColor: 'rgb(51, 95, 255)',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.95em',
                                fontWeight: '600',
                                transition: 'background-color 0.2s ease'
                            });
            
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
                        <div id="${LOADING_OVERLAY_ID}-dots"><div class="my-extension-loading-overlay-dot"></div><div class="my-extension-loading-overlay-dot"></div><div class="my-extension-loading-overlay-dot"></div></div>`;
                    document.body.appendChild(overlay);
                    document.getElementById(`${LOADING_OVERLAY_ID}-logo`).appendChild(createRobloxLogoIMG());
                    document.getElementById(`${LOADING_OVERLAY_ID}-close-button`).onclick = () => { userRequestedStop = true; hideLoadingOverlay(); };
                }


                const existingButton = overlay.querySelector('.change-region-button');
                if (existingButton) {
                    existingButton.remove();
                }

                document.getElementById(`${LOADING_OVERLAY_ID}-text`).textContent = 'Searching For Servers...';
                document.getElementById(`${LOADING_OVERLAY_ID}-dots`).style.display = 'flex';
                
                requestAnimationFrame(() => { backdrop.classList.add('visible'); overlay.classList.add('visible'); });
            }

            function hideLoadingOverlay() {
                if (keepOverlayOpen) return;
                const overlay = document.getElementById(LOADING_OVERLAY_ID);
                const backdrop = document.getElementById(`${LOADING_OVERLAY_ID}-backdrop`);
                if (overlay) overlay.classList.remove('visible');
                if (backdrop) backdrop.classList.remove('visible');
                isCurrentlyFetchingData = false;
            }
            async function showRegionSelectionModal() {
                if (document.getElementById(`${MODAL_ID}-overlay`)) return;
                await dataPromise;
                const groupedRegions = {};
                
                const continentOrder = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania', 'Other'];

                Object.keys(REGIONS).sort((a, b) => (REGIONS[a].country || '').localeCompare(REGIONS[b].country || '') || (REGIONS[a].state || '').localeCompare(REGIONS[b].state || '') || (REGIONS[a].city || '').localeCompare(REGIONS[b].city || '')).forEach(key => {
                    const region = REGIONS[key];
                    const countryCode = region.country; 
                    const continent = getContinent(countryCode);
                    
                    if (!groupedRegions[continent]) {
                        groupedRegions[continent] = [];
                    }
                    
                    let text = `${region.city}${region.state && region.country === 'US' ? `, ${region.state}` : ''} (${region.country})`;
                    groupedRegions[continent].push({ key, text });
                });

                let optionsHtml = continentOrder
                    .map(continent => groupedRegions[continent] ? `<optgroup label="${continent}">${groupedRegions[continent].map(r => `<option value="${r.key}">${r.text}</option>`).join('')}</optgroup>` : '')
                    .join('');
                const overlay = document.createElement('div');
                overlay.id = `${MODAL_ID}-overlay`;
                overlay.innerHTML = `<div id="${MODAL_ID}-content">
                    <div class="my-modal-header"><h2>Select Preferred Region</h2><button class="close-icon">&times;</button></div>
                    <div class="my-modal-body"><p>Choose the server region closest to you for the best connection.<br>You can always change it later in the RoValra Settings.</p><label for="${MODAL_ID}-select">Preferred Region</label><div class="custom-select-wrapper"><select id="${MODAL_ID}-select"><option value="" disabled selected>-- Please choose a region --</option>${optionsHtml}</select></div></div>
                    <div class="my-modal-footer"><button class="close-button">Close</button><button class="save-button">Save</button></div>
                </div>`;
                document.body.appendChild(overlay);
                requestAnimationFrame(() => overlay.classList.add('visible'));

                const closeModal = () => { overlay.classList.remove('visible'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
                const content = overlay.querySelector(`#${MODAL_ID}-content`);
                content.querySelector('.save-button').onclick = async () => { const val = content.querySelector('select').value; if (val) { await chrome.storage.local.set({ [PREFERRED_REGION_STORAGE_KEY]: val }); closeModal(); } };
                content.querySelector('.close-button').onclick = closeModal;
                content.querySelector('.close-icon').onclick = closeModal;
                overlay.onclick = e => { if (e.target === overlay) closeModal(); };
            }

                function addQuickPlayButtons(gameLink, settings) {
                    if (gameLink.closest('.roseal-game-card-container')) {
                        return;
                    }

                    const isFeatured = gameLink.closest('.featured-game-container');

                    if (!gameLink.querySelector('.play-button-overlay')) {
                        gameLink.classList.add('game-tile-styles');

                        const hoverBackground = document.createElement('div');
                        hoverBackground.className = 'hover-background';
                        gameLink.appendChild(hoverBackground);

                        const buttonContainer = document.createElement('div');
                        buttonContainer.className = 'play-button-overlay';

                        const buttonsWrapper = document.createElement('div');
                        buttonsWrapper.className = 'play-buttons-wrapper';
                        const playButton = document.createElement('button');
                        playButton.className = 'play-game-button';
                        playButton.innerHTML = `<span class="icon-common-play"></span>`;
                        playButton.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const match = gameLink.href.match(/games\/(\d+)/);
                            if (match ?.[1]) launchGame(match[1]);
                        };
                        buttonsWrapper.appendChild(playButton);

                        if (settings.PreferredRegionEnabled) {
                            const serverButton = document.createElement('button');
                            serverButton.className = 'server-browser-button';
                            serverButton.appendChild(createGlobeSVG());
                            serverButton.onclick = async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const match = gameLink.href.match(/games\/(\d+)/);
                                if (!match ?.[1]) return;
                                try {
                                    await dataPromise;
                                    const {
                                        [PREFERRED_REGION_STORAGE_KEY]: savedRegion
                                    } = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
                                    if (savedRegion && REGIONS[savedRegion]) {
                                        performJoinAction(match[1], savedRegion);
                                    } else {
                                        showRegionSelectionModal();
                                    }
                                } catch (error) {
                                    console.error("Quick Play: Error during server join action.", error);
                                }
                            };
                            buttonsWrapper.appendChild(serverButton);
                        } else {
                            playButton.style.width = '100%';
                        }

                        buttonContainer.appendChild(buttonsWrapper);
                        gameLink.appendChild(buttonContainer);
                    }

                    if (!isFeatured) {
                        const originalStats = gameLink.querySelector('.game-card-info:has(.icon-votes-gray):not(.roblox-original-stats), .game-card-info:has(.icon-playing-counts-gray):not(.roblox-original-stats)');

                        if (originalStats) {
                            const statsHTML = originalStats.innerHTML;
                            let baseStatsContainer = gameLink.querySelector('.quick-play-base-stats-container');
                            const hoverOverlay = gameLink.querySelector('.play-button-overlay');
                            let hoverStats = hoverOverlay.querySelector('.game-card-info');


                            if (!baseStatsContainer) {
                                baseStatsContainer = document.createElement('div');
                                baseStatsContainer.className = 'quick-play-base-stats-container';
                                gameLink.insertBefore(baseStatsContainer, gameLink.firstChild);
                            }
                            baseStatsContainer.innerHTML = `<div class="game-card-info">${statsHTML}</div>`;

                            if (!hoverStats) {
                                hoverStats = document.createElement('div');
                                hoverStats.className = 'game-card-info';
                                hoverOverlay.prepend(hoverStats);
                            }
                            hoverStats.innerHTML = statsHTML;

                            originalStats.classList.add('roblox-original-stats');
                        }
                    }
                }
            

            function setupObserverAndProcessExisting(settings) {
                const observerCallback = (mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.matches && node.matches('a.game-card-link[href*="/games/"]')) {
                                    addQuickPlayButtons(node, settings);
                                } 
                                else if (node.querySelectorAll) {
                                    node.querySelectorAll('a.game-card-link[href*="/games/"]').forEach(link => addQuickPlayButtons(link, settings));
                                }
                            }
                        }
                    }
                };

                const observer = new MutationObserver(observerCallback);
                const targetNode = document.body; 
                observer.observe(targetNode, { childList: true, subtree: true });

                document.querySelectorAll('a.game-card-link[href*="/games/"]').forEach(link => addQuickPlayButtons(link, settings));
            }

            injectStyles();


            chrome.storage.local.get({ PreferredRegionEnabled: true }, setupObserverAndProcessExisting);
            
        }
        // hard coding was not a good idea... It worked out ig wow wee woo i cnat wait to spent years future proofing the extension AHHHHH
        waitForElement('#games-carousel, .game-home-page-container, #game-discovery-page, .game-grid, .games-list-container, .container-list.games-detail, .group-experiences-container, .hlist.game-cards', initializeQuickPlay);
    }

});
