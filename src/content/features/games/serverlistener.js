import { callRobloxApi } from '../../core/api.js';

let isInitialized = false;
const capturedServerData = {};
const sentServerIds = new Map();
const ROBLOX_SERVER_URL_PATTERN = /^https:\/\/games\.roblox\.com\/v1\/games\/(\d+)\/servers\/Public/;

async function sendToLocalAPI(placeId, serverIds) {
    if (!placeId || !serverIds || !serverIds.length) {
        return;
    }

    try {
        await callRobloxApi({
            isRovalraApi: true,
            endpoint: '/process_servers',
            method: 'POST',
            body: { 
                place_id: placeId, 
                server_ids: serverIds 
            }
        });
    } catch (apiError) {}
}

function processServerData(placeId, responseData) {
    if (responseData && responseData.data && Array.isArray(responseData.data)) {
        
        if (!sentServerIds.has(placeId)) {
            sentServerIds.set(placeId, new Set());
        }
        const sentSet = sentServerIds.get(placeId);
        
        const idsToSend = [];

        responseData.data.forEach(server => {
            capturedServerData[server.id] = server;

            if (!sentSet.has(server.id)) {
                sentSet.add(server.id); 
                idsToSend.push(server.id); 
            }
        });
        
        if (idsToSend.length > 0) {
            sendToLocalAPI(placeId, idsToSend);
        }
    }
}

export function init() {
    if (isInitialized) return;

    chrome.storage.local.get({ ServerdataEnabled: true }, function(settings) {
        if (!settings.ServerdataEnabled) return;

        isInitialized = true;

        document.addEventListener('rovalra-game-servers-response', (event) => {
            if (!event.detail) return;

            const { url, data } = event.detail;

            const matches = url ? url.match(ROBLOX_SERVER_URL_PATTERN) : null;

            if (matches && matches[1]) {
                const placeId = matches[1];
                processServerData(placeId, data);
            }
        });

        window.addEventListener('rovalra:getServerDataRequest', (event) => {
            if (event.detail && event.detail.gameId) {
                const gameId = event.detail.gameId;
                const serverInfo = capturedServerData[gameId] || null;

                window.dispatchEvent(new CustomEvent('rovalra:getServerDataResponse', {
                    detail: { gameId: gameId, serverInfo: serverInfo }
                }));
            }
        });
    });
}