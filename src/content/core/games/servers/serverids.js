// adds the server ids to the server elements so we know what is what
import { observeElement } from '../../observer.js';

let extractorScriptInjected = false;

function injectExtractorScript() {
    if (extractorScriptInjected) return;
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('public/Assets/data/serverid_extractor.js');
    (document.head || document.documentElement).appendChild(script);
    extractorScriptInjected = true;
}


async function extractServerIdFromFiber(server) {
    if (!server) return null;
    
    injectExtractorScript();
    
    return new Promise((resolve) => {
        const extractionId = `rovalra_extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        server.setAttribute('data-rovalra-extraction-id', extractionId);
        
        const listener = (event) => {
            if (event.detail && event.detail.extractionId === extractionId) {
                window.removeEventListener('rovalra-serverid-extracted', listener);
                server.removeAttribute('data-rovalra-extraction-id');
                resolve(event.detail.serverId || null);
            }
        };
        window.addEventListener('rovalra-serverid-extracted', listener);
        
        window.dispatchEvent(new CustomEvent('rovalra-extract-serverid-request', {
            detail: { extractionId }
        }));
        
        setTimeout(() => {
            window.removeEventListener('rovalra-serverid-extracted', listener);
            server.removeAttribute('data-rovalra-extraction-id');
            resolve(null);
        }, 1000);
    });
}


async function processServerElement(serverItem) {
    try {
        const serverId = await extractServerIdFromFiber(serverItem);
        
        if (serverId && serverId.length > 0) {
            const oldServerId = serverItem.getAttribute('data-rovalra-serverid');
            
            if (oldServerId !== serverId) {
                serverItem.setAttribute('data-rovalra-serverid', serverId);
                
                const event = new CustomEvent('rovalra-serverid-set', { 
                    detail: { serverId },
                    bubbles: true 
                });
                serverItem.dispatchEvent(event);
            }
        }
        
        serverItem.classList.add('rovalra-checked');
    } catch (e) {
        console.error('[RoValra ServerIDs] Error processing server:', e);
    }
}


function watchServerElement(serverItem) {
    const observer = new MutationObserver((mutations) => {
        const hasPlayerChange = mutations.some(mutation => {
            if (mutation.type === 'childList') {
                const target = mutation.target;
                if (target.classList?.contains('player-thumbnails-container') ||
                    target.closest('.player-thumbnails-container')) {
                    return true;
                }
            }
            return false;
        });
        
        if (hasPlayerChange) {
            
            serverItem.classList.remove('rovalra-checked');
            
            processServerElement(serverItem);
        }
    });
    
    observer.observe(serverItem, {
        childList: true,
        subtree: true
    });
    
    serverItem._rovalraServerObserver = observer;
}


export function initServerIdExtraction() {
    injectExtractorScript();
    
    const selectors = [
        '.rbx-public-game-server-item',
        '.rbx-friends-game-server-item', 
        '.rbx-private-game-server-item'
    ];
    
    selectors.forEach(selector => {
        observeElement(selector, (serverElement) => {
            processServerElement(serverElement);
            
            watchServerElement(serverElement);
        }, { multiple: true });
    });
}