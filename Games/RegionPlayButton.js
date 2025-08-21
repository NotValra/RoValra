chrome.storage.local.get(['PreferredRegionEnabled'], function(result) {
    if (result.PreferredRegionEnabled) {
        if (window.myCustomButtonExtensionInitialized) {
        } else {
            window.myCustomButtonExtensionInitialized = true;

            const joinedServerIds = new Set();
            // Cough cough gemini is good at naming elements cough cough
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
            const MAX_SERVER_PAGES = 20;
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

            const countryToContinentMap = { 'US': 'Americas', 'CA': 'Americas', 'BR': 'Americas', 'MX': 'Americas', 'DE': 'Europe', 'GB': 'Europe', 'FR': 'Europe', 'NL': 'Europe', 'JP': 'Asia', 'SG': 'Asia', 'KR': 'Asia', 'IN': 'Asia', 'AU': 'Oceania', 'ZA': 'Africa' };
            function getContinent(countryCode) { return countryToContinentMap[countryCode] || 'Other'; }


            const regionsPromise = fetchRegions();

            async function fetchRegions() {
                if (Object.keys(REGIONS).length > 0) return;

                try {
                    const waitForElement = selector => new Promise(resolve => {
                        const el = document.querySelector(selector);
                        if (el) return resolve(el);
                        const observer = new MutationObserver(() => {
                            const el = document.querySelector(selector);
                            if (el) {
                                resolve(el);
                                observer.disconnect();
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    });

                    const dataStorageElement = await waitForElement('#rovalra-datacenter-data-storage');
                    if (!dataStorageElement) {
                         throw new Error("Data storage element '#rovalra-datacenter-data-storage' not found.");
                    }

                    const data = JSON.parse(dataStorageElement.textContent);
                    const newRegions = {};
                    for (const region of data) {
                        const location = region.location;
                        const country = location.country;
                        const city = location.city;
                        const state = location.region;
                        const lat = parseFloat(location.latLong[0]);
                        const lon = parseFloat(location.latLong[1]);

                        let regionCode = country;
                        if (country === 'US') {
                            regionCode = `US-${getStateCodeFromRegion(state)}`;
                        }

                        newRegions[regionCode] = {
                            latitude: lat,
                            longitude: lon,
                            city: city,
                            state: state,
                            country: location.countryName || country
                        };
                    }
                    REGIONS = newRegions;
                } catch (error) {
                    console.error("Error loading regions from data storage element:", error);
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
                style.id = styleId; style.textContent = css;
                document.head.appendChild(style);
             }
            injectCustomCSS();
            function checkContainerStyle(container) {
                if (!container) return false;
                const style = window.getComputedStyle(container);
                return style.display === 'flex';
             }
            function findAndHideButton(container) {
                if (!container) {
                    return false;
                }
                if (targetButtonHidden) return true;

                if (!referenceButtonSelector) {
                    return false;
                }
                const referenceButton = container.querySelector(referenceButtonSelector);
                if (!referenceButton) {
                    return false;
                }

                if (!buttonToHideSelector) {
                    return false;
                }

                const buttonToHide = container.querySelector(buttonToHideSelector);

                if (!buttonToHide) {
                    return false;
                }

                if (buttonToHide === referenceButton) {
                    return false;
                }
                if (buttonToHide.id === newButtonId) {
                    return false;
                }

                buttonToHide.style.setProperty('display', 'none', 'important');
                buttonToHide.style.setProperty('width', '0', 'important');
                buttonToHide.style.setProperty('min-width', '0', 'important');
                buttonToHide.style.setProperty('padding', '0', 'important');
                buttonToHide.style.setProperty('margin', '0', 'important');
                buttonToHide.style.setProperty('border', 'none', 'important');
                buttonToHide.style.setProperty('visibility', 'hidden', 'important');
                buttonToHide.setAttribute('aria-hidden', 'true');
                buttonToHide.tabIndex = -1;

                targetButtonHidden = true;
                return true;
            }
            function updateButtonTooltip(buttonElement, regionCode) {
                 if (!buttonElement) return;
                const tooltipSpan = buttonElement.querySelector('.my-extension-custom-tooltip');
                if (!tooltipSpan) return;

                let tooltipHTML = '';
                if (regionCode && REGIONS[regionCode]) {
                    const regionName = getFullLocationName(regionCode);
                    tooltipHTML = `Join Preferred Region<br>${regionName}`;
                } else {
                    tooltipHTML = 'Select Preferred Region';
                }
                tooltipSpan.innerHTML = tooltipHTML;
            }
            async function showRegionSelectionModal(buttonToUpdate) {
                if (document.getElementById(`${MODAL_ID}-overlay`)) return;
                await regionsPromise;

                const groupedRegions = {};
                const continentOrder = ['Americas', 'Europe', 'Asia', 'Oceania', 'Africa', 'Other'];
                Object.keys(REGIONS).sort((a, b) => (REGIONS[a].country || '').localeCompare(REGIONS[b].country || '') || (REGIONS[a].state || '').localeCompare(REGIONS[b].state || '') || (REGIONS[a].city || '').localeCompare(REGIONS[b].city || '')).forEach(key => {
                    const region = REGIONS[key], countryCode = key.split('-')[0], continent = getContinent(countryCode);
                    if (!groupedRegions[continent]) groupedRegions[continent] = [];
                    let text = `${region.city}${region.state && region.country === 'United States' ? `, ${region.state}` : ''} (${region.country})`;
                    groupedRegions[continent].push({ key, text });
                });
                let optionsHtml = continentOrder.map(continent => groupedRegions[continent] ? `<optgroup label="${continent}">${groupedRegions[continent].map(r => `<option value="${r.key}">${r.text}</option>`).join('')}</optgroup>` : '').join('');

                const overlay = document.createElement('div');
                overlay.id = `${MODAL_ID}-overlay`;
                overlay.innerHTML = `<div id="${MODAL_ID}-content">
                    <div class="my-modal-header"><h2>Select Preferred Region</h2><button class="close-icon">&times;</button></div>
                    <div class="my-modal-body"><p>Choose the server region closest to you for the best connection.</p><label for="${MODAL_ID}-select">Preferred Region</label><div class="custom-select-wrapper"><select id="${MODAL_ID}-select"><option value="" disabled selected>-- Please choose a region --</option>${optionsHtml}</select></div></div>
                    <div class="my-modal-footer"><button class="close-button">Close</button><button class="save-button">Save</button></div>
                </div>`;
                document.body.appendChild(overlay);
                requestAnimationFrame(() => overlay.classList.add('visible'));

                const closeModal = () => { overlay.classList.remove('visible'); overlay.addEventListener('transitionend', () => overlay.remove(), { once: true }); };
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
                overlay.onclick = e => { if (e.target === overlay) closeModal(); };
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
                        <div id="${LOADING_OVERLAY_ID}-dots"><div class="${LOADING_OVERLAY_ID}-dot"></div><div class="${LOADING_OVERLAY_ID}-dot"></div><div class="${LOADING_OVERLAY_ID}-dot"></div></div>`;
                    document.body.appendChild(overlay);
                    document.getElementById(`${LOADING_OVERLAY_ID}-logo`).appendChild(createRobloxLogoIMG());
                    document.getElementById(`${LOADING_OVERLAY_ID}-close-button`).onclick = () => { userRequestedStop = true; hideLoadingOverlay(); };
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

            function delay(ms) {  return new Promise(resolve => setTimeout(resolve, ms)); }
            function getPlaceIdFromUrl() {
                const regex = /https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/;
                const match = window.location.href.match(regex);
                return (match && match[1]) ? match[1] : null;
             }
            function getFullLocationName(regionCode) {
                 const regionData = REGIONS[regionCode];
                if (!regionData) {
                     if (regionCode === "??") return "Unknown Region";
                     if (regionCode.startsWith("US-")) return `${regionCode.split('-')[1]}, USA`;
                    return regionCode;
                }
                let parts = [];
                if (regionData.city && regionData.city !== regionData.country) parts.push(regionData.city);
                if (regionData.state && regionData.country === "United States") parts.push(regionData.state);
                if (regionData.country) parts.push(regionData.country);
                parts = [...new Set(parts.filter(p => p))];
                if (parts.length > 1 && parts[parts.length-1] === "United States") parts[parts.length-1] = "USA";
                return parts.join(', ') || regionCode;
            }
            function getStateCodeFromRegion(regionName) {
                const stateMap = {
                    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
                    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
                    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
                    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
                    'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
                    'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
                    'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
                    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
                    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
                    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
                };
                return stateMap[regionName] || (regionName ? regionName.substring(0, 2).toUpperCase() : '');
            }
            function calculateDistance(lat1, lon1, lat2, lon2) {
                 if (lat1 === null || lon1 === null || lat2 === null || lon2 === null ||
                     typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
                     typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
                     isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
                    return NaN;
                }
                const R = 6371;
                const toRadians = (degrees) => degrees * Math.PI / 180;
                const dLat = toRadians(lat2 - lat1); const dLon = toRadians(lon2 - lon1);
                const rLat1 = toRadians(lat1); const rLat2 = toRadians(lat2);
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }
            async function getCsrfToken() {
                if (csrfToken) return csrfToken;
                if (csrfFetchAttempted) {
                    const metaToken = document.querySelector('meta[name="csrf-token"]');
                    if (metaToken) {
                        const metaContent = metaToken.getAttribute('content');
                        if (metaContent) { csrfToken = metaContent; return csrfToken; }
                    }
                    return null;
                }
                csrfFetchAttempted = true;
                try {
                    const response = await fetch('https://auth.roblox.com/v2/logout', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include'
                    });
                    const token = response.headers.get('x-csrf-token');
                    if (token) { csrfToken = token; return token; }
                    else { console.warn(`[Region Play Button] Fetch to logout endpoint did not return a CSRF token (Status: ${response.status}). Trying meta tag...`); }
                } catch (error) { }
                const metaToken = document.querySelector('meta[name="csrf-token"]');
                if (metaToken) {
                    const metaContent = metaToken.getAttribute('content');
                    if (metaContent) {  csrfToken = metaContent; return csrfToken; }
                }
                csrfToken = null;
                return null;
             }

            async function loadServerIpMapIfNeeded() {
                if (serverIpMapLoaded) return true;

                const stateKey = 'myPreferredRegionDatacenterState';
                const promiseKey = 'myPreferredRegionDatacenterPromise';

                if (window[stateKey] === 'complete') {
                    serverIpMap = await window[promiseKey];
                    serverIpMapLoaded = true;
                    return true;
                }
                if (window[stateKey] === 'fetching') {
                    serverIpMap = await window[promiseKey];
                    serverIpMapLoaded = !!serverIpMap;
                    return serverIpMapLoaded;
                }

                window[stateKey] = 'fetching';
                window[promiseKey] = new Promise(async (resolve, reject) => {
                    try {
                        const waitForElement = selector => new Promise(resolve => {
                            const el = document.querySelector(selector);
                            if (el) return resolve(el);
                            const observer = new MutationObserver(() => {
                                const el = document.querySelector(selector);
                                if (el) {
                                    resolve(el);
                                    observer.disconnect();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                        });

                        const dataStorageElement = await waitForElement('#rovalra-datacenter-data-storage');
                        if (!dataStorageElement) {
                             throw new Error("Data storage element '#rovalra-datacenter-data-storage' not found.");
                        }

                        const serverListData = JSON.parse(dataStorageElement.textContent);
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

                        window[stateKey] = 'complete';
                        resolve(map);

                    } catch (error) {
                        console.error("[Region Play Button] Failed to load datacenter map from storage element.", error);
                        delete window[stateKey];
                        delete window[promiseKey];
                        reject(error);
                    }
                });

                try {
                    serverIpMap = await window[promiseKey];
                    serverIpMapLoaded = true;
                    return true;
                } catch (error) {
                    serverIpMap = {};
                    serverIpMapLoaded = false;
                    return false;
                }
            }

            async function _internal_handleServer(server, placeId) {
                const serverId = server?.id; if (!serverId) return;
                if (userRequestedStop) return;

                if (serverLocations[serverId] && serverLocations[serverId].l !== undefined) {
                     if (userLocation && serverLocations[serverId].l) {
                         const dist = calculateDistance(userLocation.latitude, userLocation.longitude, serverLocations[serverId].l.latitude, serverLocations[serverId].l.longitude);
                         server.calculatedPing = !isNaN(dist) ? Math.round(dist * 0.1) : Infinity;
                     } else { server.calculatedPing = Infinity; }
                     return;
                }

                let regionCode = "??";
                let serverLat = null, serverLon = null;
                serverLocations[serverId] = { c: "??", l: null };
                server.calculatedPing = Infinity;

                try {
                    if (userRequestedStop) return;
                    let currentCsrfToken = await getCsrfToken();
                    if (!currentCsrfToken) {
                         csrfToken = null; csrfFetchAttempted = false;
                         currentCsrfToken = await getCsrfToken();
                         if (!currentCsrfToken) { console.error(`[Region Play Button] Cannot fetch join info for server ${serverId}: CSRF token missing after retry.`); return; }
                    }

                     if (userRequestedStop) return;
                    const serverInfoResponse = await fetch(`https://gamejoin.roblox.com/v1/join-game-instance`, {
                        method: 'POST',
                        headers: { "Accept": "application/json", "Content-Type": "application/json", "Referer": `https://www.roblox.com/games/${placeId}/`, "Origin": "https://www.roblox.com", "X-Csrf-Token": currentCsrfToken, },
                        body: JSON.stringify({ placeId: parseInt(placeId, 10), isTeleport: false, gameId: serverId, gameJoinAttemptId: crypto.randomUUID(), }),
                        credentials: 'include',
                    });

                    if (!serverInfoResponse.ok) {
                         if (serverInfoResponse.status === 403) { csrfToken = null; csrfFetchAttempted = false; }
                         else if (serverInfoResponse.status === 429) { console.warn(`[Region Play Button] Rate limited fetching join info for server ${serverId}.`); }
                         else { console.warn(`[Region Play Button] Failed to get join info for server ${serverId}. Status: ${serverInfoResponse.status}`); }
                        return;
                    }

                    const serverInfo = await serverInfoResponse.json();
                    if (userRequestedStop) return;

                    if (serverInfo?.message === "You need to purchase access to this game before you can play.") {
                        const overlayText = document.getElementById(`${LOADING_OVERLAY_ID}-text`);
                        if(overlayText) overlayText.textContent = `You need to buy the game to view regions.`;
                    }
                    try {
                         const sessionData = JSON.parse(serverInfo?.joinScript?.SessionId || '{}');
                         const latitude = sessionData?.Latitude; const longitude = sessionData?.Longitude;
                         if (typeof latitude === 'number' && typeof longitude === 'number' && (latitude !== 0 || longitude !== 0)) {
                              if (!userLocation || userLocation.latitude !== latitude || userLocation.longitude !== longitude) {
                                 userLocation = { latitude: latitude, longitude: longitude };
                              }
                         }
                    } catch (e) { }

                    const dataCenterId = serverInfo?.joinScript?.DataCenterId;

                    if (dataCenterId && serverIpMap && serverIpMap[dataCenterId]) {
                        const locationData = serverIpMap[dataCenterId];

                        if (locationData.latLong && locationData.latLong.length === 2) {
                            serverLat = parseFloat(locationData.latLong[0]);
                            serverLon = parseFloat(locationData.latLong[1]);
                        }

                        const countryCode = locationData.country;
                        if (countryCode === "US" && locationData.region) {
                            const stateCode = getStateCodeFromRegion(locationData.region);
                            regionCode = `US-${stateCode}`;
                        } else if (countryCode) {
                            regionCode = countryCode;
                        } else {
                            regionCode = "??";
                        }
                    } else {
                        regionCode = "??";
                    }

                    serverLocations[serverId] = {
                        c: regionCode,
                        l: (typeof serverLat === 'number' && typeof serverLon === 'number') ? { latitude: serverLat, longitude: serverLon } : null,
                        dcid: serverInfo?.joinScript?.DataCenterId
                    };

                    if (userLocation && serverLocations[serverId].l) {
                        const distance = calculateDistance(userLocation.latitude, userLocation.longitude, serverLat, serverLon);
                        server.calculatedPing = !isNaN(distance) ? Math.round(distance * 0.1) : Infinity;
                    } else { server.calculatedPing = Infinity; }
                } catch (error) {
                     if (!userRequestedStop) { }
                     serverLocations[serverId] = { c: "??", l: null }; server.calculatedPing = Infinity;
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
                    if (!mapReady) {
                        console.error("[Region Play Button] Failed to load the datacenter map. Aborting search.");
                        return { joined: false, error: 'map_load_failed' };
                    }

                    const initialToken = await getCsrfToken();
                    if (!initialToken) return { joined: false, error: 'csrf_failed' };

                    let nextCursor = null;
                    let pageCount = 0;
                    let fetchComplete = false;

                    while (!fetchComplete && pageCount < MAX_SERVER_PAGES) {
                        if (userRequestedStop) return { joined: false, stopped: true };

                        pageCount++;
                        let attempts = 0;
                        let currentDelay = INITIAL_DELAY_MS;
                        let pageFetchSuccess = false;
                        let serversOnThisPage = [];
                        let pageData = null;

                        let url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?excludeFullGames=true&limit=100`;
                        if (nextCursor) url += `&cursor=${encodeURIComponent(nextCursor)}`;

                        while (attempts < MAX_RETRIES_PER_PAGE && !pageFetchSuccess) {
                            if (userRequestedStop) return { joined: false, stopped: true };
                            try {
                                const response = await fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'include' });
                                if (response.ok) {
                                    pageData = await response.json();
                                    serversOnThisPage = pageData.data || [];
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
                             console.error(`[Region Play Button] Failed to fetch page ${pageCount}. Stopping search.`);
                             return { joined: false, error: 'page_fetch_failed' };
                        }

                        if (serversOnThisPage.length > 0) {
                            const serverPromises = serversOnThisPage.map(server => _internal_handleServer(server, placeId));
                            await Promise.all(serverPromises);

                            const regionServers = serversOnThisPage.filter(s => serverLocations[s.id]?.c === targetRegionCode);
                            const availableServers = regionServers.filter(s => !joinedServerIds.has(s.id));

                            if (availableServers.length > 0) {
                                let bestServer = null;
                                let bestScore = -Infinity;

                                availableServers.forEach(server => {
                                    if (server.playing >= server.maxPlayers) return;

                                    const ping = server.calculatedPing ?? Infinity;
                                    const players = server.playing ?? 0;
                                    const maxPlayers = server.maxPlayers ?? Infinity;
                                    let score = 0;

                                    if (ping !== Infinity && ping >= 0) {
                                        score = (500 - Math.min(ping, 500)) * 10;
                                        if (maxPlayers > 0 && players > 0) {
                                            score += (players / maxPlayers) * 50;
                                        }
                                    } else {
                                        score = -Infinity;
                                    }

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
                        if (!nextCursor) fetchComplete = true;
                    }

                    return { joined: false };

                } catch (error) {
                    console.error("[Region Play Button] Error during server search process:", error);
                    return { joined: false, error: 'unknown' };
                }
            }

            function joinSpecificServer(placeId, serverId) {
                const safePlaceId = String(placeId); const safeServerId = String(serverId);
                if (!/^\d+$/.test(safePlaceId) || !/^[0-9a-fA-F-]+$/.test(safeServerId)) {
                    alert("Error: Could not join server due to invalid ID.");
                    return;
                }

                joinedServerIds.add(safeServerId);

                const codeToInject = `
                    (function() {
                        if (typeof Roblox !== 'undefined' && Roblox.GameLauncher && Roblox.GameLauncher.joinGameInstance) {
                            Roblox.GameLauncher.joinGameInstance(parseInt('${safePlaceId}', 10), '${safeServerId}');
                        } else {
                            console.error("Roblox.GameLauncher.joinGameInstance is not available in page context.");
                        }
                    })();
                `;

                chrome.runtime.sendMessage({ action: "injectScript", codeToInject: codeToInject }, (response) => {
                    if (chrome.runtime.lastError) {
                        alert("Error communicating with the extension's background process. Please try reloading the extension or browser.");
                        return;
                    }
                    if (response && !response.success) {
                        alert(`Error initiating join: ${response?.error || 'Unknown error. Check console for details.'}`);
                    }
                });
            }

            async function performJoinAction(regionCode) {
                if (isCurrentlyFetchingData) return;

                userRequestedStop = false;
                isCurrentlyFetchingData = true;
                keepOverlayOpen = false;
                showLoadingOverlay();

                try {
                    const placeId = getPlaceIdFromUrl();
                    if (!placeId) throw new Error("Missing Place ID");

                    const result = await findAndJoinServerProcess(placeId, regionCode);

                    if (userRequestedStop || result.stopped) {
                    } else if (result.joined) {
                    } else {
                        keepOverlayOpen = true;
                        const textEl = document.getElementById(`${LOADING_OVERLAY_ID}-text`);
                        const locationName = getFullLocationName(regionCode);
                        if (textEl) {
                            textEl.textContent = `No available servers found in ${locationName}.`;
                            document.getElementById(`${LOADING_OVERLAY_ID}-dots`).style.display = 'none';
                            document.getElementById(`${LOADING_OVERLAY_ID}-close-button`).onclick = () => { keepOverlayOpen = false; hideLoadingOverlay(); };
                        }
                    }

                } catch (error) {
                     if (!userRequestedStop) {
                         alert(`An error occurred: ${error.message || 'Unknown error'}.`);
                     }
                } finally {
                     if (!keepOverlayOpen) {
                         hideLoadingOverlay();
                     }
                     isCurrentlyFetchingData = false;
                     userRequestedStop = false;
                }
             }

            async function addCustomButton(container) {
                if (!container) return false;
                const unplayableButtonSelector = 'button.btn-common-play-game-unplayable-lg.btn-primary-md.btn-full-width[disabled][data-testid="play-unplayable-button"]';
                if (document.querySelector(unplayableButtonSelector)) return false;
                if (newButtonAdded) return true;
                if (document.getElementById(newButtonId)) {
                    newButtonAdded = true;
                    return true;
                }
                const loadingSpinnerSelector = 'span.spinner.spinner-default';
                if (container.querySelector(loadingSpinnerSelector)) return false;

                try {
                    const computedStyle = window.getComputedStyle(container);
                    let styleChanged = false;
                    if (computedStyle.display !== 'flex') {
                        container.style.setProperty('display', 'flex', 'important');
                        styleChanged = true;
                    }
                    if (computedStyle.flexDirection !== 'row') {
                        container.style.setProperty('flex-direction', 'row', 'important');
                        styleChanged = true;
                    }
                } catch (styleError) {}
                let referenceNode = null;
                if (referenceButtonSelector) {
                    referenceNode = container.querySelector(referenceButtonSelector);
                }
                const newButton = document.createElement('button');
                newButton.type = 'button';
                newButton.id = newButtonId;
                newButton.classList.add('btn-primary-md', CUSTOM_BUTTON_CLASS);
                newButton.setAttribute('aria-label', newButtonAriaLabel);
                const svgIcon = createGlobeSVG();
                if (svgIcon) newButton.appendChild(svgIcon);
                else { newButton.textContent = "RG"; }
                const tooltipSpan = document.createElement('span');
                tooltipSpan.classList.add('my-extension-custom-tooltip');
                newButton.appendChild(tooltipSpan);
                try {
                    await regionsPromise;
                    const storageResult = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
                    updateButtonTooltip(newButton, storageResult[PREFERRED_REGION_STORAGE_KEY]);
                } catch (error) {
                    updateButtonTooltip(newButton, null);
                }
                newButton.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    if (isCurrentlyFetchingData) return;
                    try {
                        const storageResult = await chrome.storage.local.get(PREFERRED_REGION_STORAGE_KEY);
                        const currentSavedRegion = storageResult[PREFERRED_REGION_STORAGE_KEY];
                        
                        await regionsPromise;

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
                try {
                    if (document.getElementById(newButtonId)) {
                        newButtonAdded = true;
                        return true;
                    }
                    container.appendChild(newButton);
                    newButtonAdded = true;
                    return true;
                } catch (error) {
                    newButtonAdded = false;
                    const failedButton = document.getElementById(newButtonId);
                    if (failedButton === newButton) {
                        failedButton.remove();
                    }
                    return false;
                }
            }
            let observer = null;
            const observerCallback = (mutationsList, obs) => {
                 if (newButtonAdded && targetButtonHidden) {
                    if (observer) { obs.disconnect(); observer = null; }
                    return;
                 }
                const container = document.getElementById(targetContainerId);
                if (container) {
                    let containerReady = checkContainerStyle(container);
                    if (!targetButtonHidden) findAndHideButton(container);
                    if (!newButtonAdded && containerReady) addCustomButton(container).catch(err => console.error("Error adding button from observer (direct find):", err));
                    if (newButtonAdded && targetButtonHidden && observer) { obs.disconnect(); observer = null; }
                } else {
                     for (const mutation of mutationsList) {
                         if (mutation.type === 'childList') {
                             for (const node of mutation.addedNodes) {
                                  if (node.nodeType !== Node.ELEMENT_NODE) continue;
                                  let foundContainer = null;
                                  if (node.id === targetContainerId) {
                                      foundContainer = node;
                                  } else if (typeof node.querySelector === 'function') {
                                       foundContainer = node.querySelector(`#${targetContainerId}`);
                                  }
                                   if (foundContainer) {
                                       let containerReady = checkContainerStyle(foundContainer);
                                       if (!targetButtonHidden) findAndHideButton(foundContainer);
                                       if (!newButtonAdded && containerReady) addCustomButton(foundContainer).catch(err => console.error("Error adding button from mutation:", err));
                                       if (newButtonAdded && targetButtonHidden && observer) { obs.disconnect(); observer = null; return; }
                                       break;
                                   }
                             }
                         }
                         else if (mutation.type === 'attributes' && mutation.target.id === targetContainerId && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                             const maybeContainer = document.getElementById(targetContainerId);
                             if (maybeContainer && checkContainerStyle(maybeContainer)) {
                                 if (!targetButtonHidden) findAndHideButton(maybeContainer);
                                 if (!newButtonAdded) addCustomButton(maybeContainer).catch(err => console.error("Error adding button from attribute mutation:", err));
                                 if (newButtonAdded && targetButtonHidden && observer) { obs.disconnect(); observer = null; return; }
                             }
                         }
                     }
                }
            };
            observer = new MutationObserver(observerCallback);
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
            setTimeout(() => {
                if (!observer) return;
                const initialContainer = document.getElementById(targetContainerId);
                if (initialContainer) {
                    let containerReady = checkContainerStyle(initialContainer);
                    if (!targetButtonHidden) findAndHideButton(initialContainer);
                    if (!newButtonAdded && containerReady) addCustomButton(initialContainer).catch(err => console.error("Error adding button from initial check:", err));
                    if (newButtonAdded && targetButtonHidden && observer) { observer.disconnect(); observer = null; }
                }
             }, 500);
            setTimeout(() => {
                if (observer) {
                    observer.disconnect(); observer = null;
                    const finalContainer = document.getElementById(targetContainerId);
                    if (finalContainer) {
                         let containerReady = checkContainerStyle(finalContainer);
                         if(!targetButtonHidden) findAndHideButton(finalContainer);
                         if(!newButtonAdded && containerReady) addCustomButton(finalContainer).catch(err => console.error("Error adding button from final attempt:", err));
                    } else {
                         newButtonAdded = false;
                         targetButtonHidden = false;
                    }
                }
             }, 20000);
        }
    } else {
        const existingButton = document.getElementById('join-preferred-region');
        if (existingButton) existingButton.remove();
    }
});