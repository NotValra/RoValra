// adds the server ids to the server elements so we know what is what
import {
    observeElement,
    observeAttributes,
    observeChildren,
} from '../../observer.js';

export const SERVER_ROW_SELECTOR = [
    '.rbx-public-game-server-item',
    '.rbx-friends-game-server-item',
    '.rbx-private-game-server-item',
    '.flex.items-center.justify-between.padding-y-medium.width-full',
].join(', ');

let extractorScriptInjected = false;

function injectExtractorScript() {
    if (extractorScriptInjected) return;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(
        'public/Assets/data/serverid_extractor.js',
    );
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
                window.removeEventListener(
                    'rovalra-serverid-extracted',
                    listener,
                );
                server.removeAttribute('data-rovalra-extraction-id'); // Remove the attribute after extraction
                resolve(event.detail); // Resolve with the full detail object
            }
        };
        window.addEventListener('rovalra-serverid-extracted', listener);

        window.dispatchEvent(
            new CustomEvent('rovalra-extract-serverid-request', {
                detail: { extractionId },
            }),
        );

        setTimeout(() => {
            window.removeEventListener('rovalra-serverid-extracted', listener);
            server.removeAttribute('data-rovalra-extraction-id'); // Ensure attribute is removed even on timeout
            resolve(null);
        }, 1000);
    });
}

export async function syncServerId(serverItem) {
    const requestId = (serverItem._rovalraIdRequest || 0) + 1;
    serverItem._rovalraIdRequest = requestId;

    const extractionResult = await extractServerIdFromFiber(serverItem);

    if (serverItem._rovalraIdRequest !== requestId) return null;
    if (!extractionResult || extractionResult.error) return null;

    const { serverId, privateServerId, accessCode, isFriendServer, isOwner } =
        extractionResult;

    if (privateServerId) {
        serverItem.setAttribute('data-private-server-id', privateServerId);
    }
    if (accessCode) {
        serverItem.setAttribute('data-access-code', accessCode);
    }
    serverItem.setAttribute(
        'data-rovalra-is-friend-server',
        String(Boolean(isFriendServer)),
    );
    serverItem.setAttribute('data-rovalra-is-owner', String(Boolean(isOwner)));

    if (serverId) {
        const previousId = serverItem.getAttribute('data-rovalra-serverid');
        if (previousId !== serverId) {
            serverItem.setAttribute('data-rovalra-serverid', serverId);
            serverItem.dispatchEvent(
                new CustomEvent('rovalra-serverid-set', {
                    detail: { serverId, previousId },
                    bubbles: true,
                }),
            );
        }
    }

    return extractionResult;
}

async function processServerElement(serverItem, retries = 5) {
    try {
        await syncServerId(serverItem);

        if (
            serverItem.classList.contains('rbx-private-game-server-item') &&
            !serverItem.hasAttribute('data-access-code') &&
            !serverItem.hasAttribute('data-private-server-id') &&
            retries > 0
        ) {
            setTimeout(
                () => processServerElement(serverItem, retries - 1),
                1000,
            );
            return;
        }

        serverItem.classList.add('rovalra-checked');
    } catch (e) {
        console.error('[RoValra ServerIDs] Error processing server:', e);
    }
}

function scheduleServerIdSync(serverItem) {
    if (serverItem._rovalraIdSyncQueued) return;
    serverItem._rovalraIdSyncQueued = true;

    queueMicrotask(() => {
        serverItem._rovalraIdSyncQueued = false;
        if (serverItem.isConnected) processServerElement(serverItem);
    });
}

function watchServerElement(serverItem) {
    if (serverItem._rovalraIdWatchers) return;

    const onChange = () => scheduleServerIdSync(serverItem);
    const watchers = [];

    const card = serverItem.firstElementChild;
    if (card) {
        watchers.push(
            observeAttributes(card, onChange, ['src', 'href'], {
                subtree: true,
            }),
        );
    }

    const thumbnails = serverItem.querySelector('.player-thumbnails-container');
    if (thumbnails) watchers.push(observeChildren(thumbnails, onChange));

    serverItem._rovalraIdWatchers = watchers;
}

function unwatchServerElement(serverItem) {
    serverItem._rovalraIdWatchers?.forEach((watcher) => watcher.disconnect());
    serverItem._rovalraIdWatchers = null;
}

export function initServerIdExtraction() {
    injectExtractorScript();

    observeElement(
        SERVER_ROW_SELECTOR,
        (serverElement) => {
            processServerElement(serverElement);
            watchServerElement(serverElement);
        },
        { multiple: true, onRemove: unwatchServerElement },
    );
}
