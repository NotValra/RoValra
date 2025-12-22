import { observeElement } from '../../core/observer.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { performJoinAction, getSavedPreferredRegion } from '../../core/preferredregion.js';
import DOMPurify from 'dompurify';

const targetContainerIdSelector = '#game-details-play-button-container';
const playButtonSelector = 'button[data-testid="play-button"]';
const buttonToHideSelector = 'button.random-server-join-button';

const NEW_BUTTON_ID = 'rovalra-join-preferred-region';
const NEW_BUTTON_ARIA_LABEL = 'Select or Join Preferred Server Region';
const NEW_BUTTON_WIDTH = 64;
const NEW_BUTTON_HEIGHT = 60;
const NEW_BUTTON_MARGIN_LEFT = 5;
const ROVALRA_BUTTON_CLASS = 'rovalra-region-button';

let REGIONS = {}; 
let isRegionsLoaded = false;

function getPlaceId() {
    const match = window.location.href.match(/\/games\/(\d+)/);
    return match ? match[1] : null;
}

function getUniverseId() {
    const meta = document.querySelector('meta[name="universe-id"]');
    return meta ? meta.getAttribute('data-universe-id') : null;
}

function createGlobeSVG() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "30");
    svg.setAttribute("height", "30");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.innerHTML = `<path d="M19.3 16.9c.4-.7.7-1.5.7-2.4 0-2.5-2-4.5-4.5-4.5S11 12 11 14.5s2 4.5 4.5 4.5c.9 0 1.7-.3 2.4-.7l3.2 3.2 1.4-1.4zm-3.8.1c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5M12 20v2C6.48 22 2 17.52 2 12S6.48 2 12 2c4.84 0 8.87 3.44 9.8 8h-2.07c-.64-2.46-2.4-4.47-4.73-5.41V5c0 1.1-.9 2-2 2h-2v2c0 .55-.45 1-1 1H8v2h2v3H9l-4.79-4.79C4.08 10.79 4 11.38 4 12c0 4.41 3.59 8 8 8"></path>`;
    return svg;
}

function getFullLocationName(regionCode) {
    if (!regionCode || regionCode === 'AUTO') return 'Best Region (Auto)';
    const regionData = REGIONS[regionCode];
    if (!regionData) {
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

async function loadRegionsForTooltip() {
    if (isRegionsLoaded) return;
    return new Promise((resolve) => {
        chrome.storage.local.get(['cachedRegions'], (result) => {
            if (result.cachedRegions) {
                REGIONS = result.cachedRegions;
            }
            isRegionsLoaded = true;
            resolve();
        });
    });
}

function injectCustomCSS() {
    const styleId = 'rovalra-custom-ui-styles';
    if (document.getElementById(styleId)) return;

    const css = `
        .${ROVALRA_BUTTON_CLASS} {
            position: relative; overflow: visible;
            width: ${NEW_BUTTON_WIDTH}px !important; height: ${NEW_BUTTON_HEIGHT}px !important;
            margin-left: ${NEW_BUTTON_MARGIN_LEFT}px !important; 
            padding: 0 !important; display: flex !important; align-items: center !important;
            justify-content: center !important; flex-shrink: 0 !important; visibility: visible !important;
            opacity: 1 !important; border: none !important;
            background-color: rgb(51, 95, 255) !important; color: white !important;
            cursor: pointer; border-radius: 12px;
            transition: background-color 0.2s;
            order: 5 !important;
        }
        .${ROVALRA_BUTTON_CLASS}:hover {
            background-color: rgba(41, 82, 233, 1) !important;
        }
        .${ROVALRA_BUTTON_CLASS} svg path { 
            fill: white !important; 
            stroke: none !important;
        }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

async function updateButtonTooltip(button) {
    try {
        await loadRegionsForTooltip();
        const savedRegion = await getSavedPreferredRegion();
        
        let tooltipText;
        if (!savedRegion || savedRegion === 'AUTO') {
             tooltipText = 'Join Preferred Region<br><b>Best Region (Auto)</b>';
        } else {
             const regionName = getFullLocationName(savedRegion);
             tooltipText = `Join Preferred Region<br><b>${regionName}</b>`;
        }

        addTooltip(button, DOMPurify.sanitize(tooltipText), { position: 'top' });
        
    } catch (e) {
        addTooltip(button, "Join Preferred Region", { position: 'top' });
    }
}

function reconcileButtons(container) {
    if (!container) return;

    const randomButton = container.querySelector(buttonToHideSelector);
    if (!randomButton) return; 

    const playButton = container.querySelector(playButtonSelector);
    const children = Array.from(container.children);
    
    const otherExtensions = children.filter(child => {
        if (child === playButton || child.contains(playButton)) return false;
        if (child === randomButton) return false;
        if (child.id === NEW_BUTTON_ID || child.classList.contains(ROVALRA_BUTTON_CLASS)) return false;
        
        if (child.id === 'id-verification-container') return false; 
        
        const style = window.getComputedStyle(child);
        if (style.display === 'none') return false;
        
        if (child.tagName === 'BUTTON' || child.querySelector('button')) return true;

        return false;
    });

    if (otherExtensions.length > 0) {
        if (randomButton.style.display !== 'none') {
            Object.assign(randomButton.style, { display: 'none', width: '0', minWidth: '0', padding: '0', margin: '0', border: 'none', visibility: 'hidden' });
            randomButton.setAttribute('aria-hidden', 'true');
        }
    } else {
        if (randomButton.style.display === 'none') {
            randomButton.style.display = ''; 
            randomButton.style.width = ''; 
            randomButton.style.minWidth = ''; 
            randomButton.style.padding = ''; 
            randomButton.style.margin = ''; 
            randomButton.style.border = ''; 
            randomButton.style.visibility = '';
            randomButton.removeAttribute('aria-hidden');
        }
    }
}

function addCustomButton(container) {
    if (!container) return false;

    if (container.querySelector(`.${ROVALRA_BUTTON_CLASS}`) || document.getElementById(NEW_BUTTON_ID)) {
        return false;
    }

    if (!container.querySelector(playButtonSelector)) return false;

    try {
        const s = window.getComputedStyle(container);
        if (s.display !== 'flex') container.style.display = 'flex';
        if (s.flexDirection !== 'row') container.style.flexDirection = 'row';
    } catch (e) {}

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.id = NEW_BUTTON_ID; 
    newButton.className = `btn-primary-md ${ROVALRA_BUTTON_CLASS}`;
    newButton.setAttribute('aria-label', NEW_BUTTON_ARIA_LABEL);
    newButton.appendChild(createGlobeSVG());

    container.appendChild(newButton);

    addTooltip(newButton, 'Join Preferred Region', { position: 'top' });
    updateButtonTooltip(newButton);

    newButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        const currentRegion = await getSavedPreferredRegion();
        const placeId = getPlaceId();
        const universeId = getUniverseId();
        
        if (placeId) {
            const targetRegion = (currentRegion === 'AUTO') ? null : currentRegion;
            performJoinAction(placeId, universeId, targetRegion);
        }
    });

    return true;
}

function processContainer(container) {
    addCustomButton(container);
    reconcileButtons(container);
}

export function init() {
    chrome.storage.local.get({ PreferredRegionEnabled: true }, (settings) => {
        
        if (!settings.PreferredRegionEnabled) return;

        injectCustomCSS();

        observeElement(targetContainerIdSelector, (container) => {
            processContainer(container);

            const observer = new MutationObserver((mutations) => {
                let shouldProcess = false;
                
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        let onlyOurButtonAdded = false;
                        mutation.addedNodes.forEach(node => {
                            if (node.id === NEW_BUTTON_ID || (node.classList && node.classList.contains(ROVALRA_BUTTON_CLASS))) {
                                onlyOurButtonAdded = true;
                            }
                        });

                        if (!onlyOurButtonAdded) shouldProcess = true;
                    }
                    
                    if (mutation.type === 'attributes') {
                        const target = mutation.target;
                        if (!target.classList.contains('random-server-join-button') && 
                            !target.classList.contains(ROVALRA_BUTTON_CLASS)) {
                            shouldProcess = true;
                        }
                    }
                }

                if (shouldProcess) {
                    processContainer(container);
                }
            });
            
            observer.observe(container, { childList: true, subtree: true, attributes: true });
        }, {
            onRemove: () => {}
        });
    });
}