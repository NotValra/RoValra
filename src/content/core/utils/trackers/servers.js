import { callRobloxApi } from '../../api.js';

let latestPresence = null;
const subscribers = new Set();

function broadcast(presence) {
    subscribers.forEach(callback => callback(presence));
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'presenceUpdate') {
        const presence = request.presence;
        if (JSON.stringify(presence) !== JSON.stringify(latestPresence)) {
            latestPresence = presence;
            broadcast(presence);
        }
    }
});

export function init() {
    chrome.storage.local.get({ recentServersEnabled: true }, (settings) => {
        if (!settings.recentServersEnabled) return;

        const currentUserElement = document.querySelector('meta[name="user-data"]');
        const currentUserId = currentUserElement ? currentUserElement.dataset.userid : null;
        if (currentUserId) {
            chrome.runtime.sendMessage({ action: 'updateUserId', userId: currentUserId });
        }

        chrome.runtime.sendMessage({ action: 'getLatestPresence' }, (response) => {
            if (chrome.runtime.lastError) {
            } else if (response && response.presence) {
                latestPresence = response.presence;
                broadcast(latestPresence);
            }
        });
    });
}


function subscribeToPresenceUpdates(callback) {
    subscribers.add(callback);

    if (latestPresence) {
        callback(latestPresence);
    }
    return () => subscribers.delete(callback);
}

export function trackUserGameJoin(targetPlaceId) {
    return new Promise((resolve) => {
        let timeout;

        const checkPresence = (presence) => {
            if (presence && (presence.userPresenceType === 2 || presence.userPresenceType === 4)) {
                if (targetPlaceId) {
                    if (presence.rootPlaceId === parseInt(targetPlaceId, 10)) {
                        unsubscribe();
                        clearTimeout(timeout);
                        resolve(presence);
                    }
                } else {
                    unsubscribe();
                    clearTimeout(timeout);
                    resolve(presence);
                }
            }
        };

        const unsubscribe = subscribeToPresenceUpdates(checkPresence);

        timeout = setTimeout(() => {
            unsubscribe();
            resolve(null);
        }, 60000);
    });
}
