import { observeElement } from '../../../core/observer.js';
import DOMPurify from 'dompurify';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { enhanceServer, createUUID } from '../../../core/games/servers/serverdetails.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { _state as serverListState, processUptimeBatch } from './serverlist.js';
import { launchGame } from '../../../core/utils/launcher.js';

function formatTimeAgo(timestamp) {
    const now = Date.now();
    const secondsPast = Math.floor((now - timestamp) / 1000);

    if (secondsPast < 60) {
        return `${secondsPast}s ago`;
    }
    if (secondsPast < 3600) {
        return `${Math.floor(secondsPast / 60)}m ago`;
    }
    if (secondsPast <= 86400) {
        return `${Math.floor(secondsPast / 3600)}h ago`;
    }
    const days = Math.floor(secondsPast / 86400);
    return `${days}d ago`;
}

function createServerItem(serverData) {
    const { presence, timestamp } = serverData;
    const serverItem = document.createElement('li');
    serverItem.className = 'rbx-game-server-item';
    serverItem.dataset.rovalraServerid = presence.gameId;
    serverItem.dataset.placeid = presence.rootPlaceId;

    const lastJoinedInfo = timestamp ? `<p class="text-info" style="font-size: 12px; margin-top: 4px;">Last Joined: ${formatTimeAgo(timestamp)}</p>` : '';

    const serverContent = `
        <div class="card-content">
            <div class="player-thumbnails-container">
                <a class="avatar-card-link" style="display: none;"></a>
            </div>
            <div class="rbx-game-server-details">
                ${lastJoinedInfo}
            </div>
        </div>
    `;
    serverItem.innerHTML = serverContent;

    const detailsDiv = serverItem.querySelector('.rbx-game-server-details');
    if (detailsDiv) {
        const joinBtn = document.createElement('button');
        joinBtn.className = 'btn-full-width btn-control-xs rbx-public-game-server-join game-server-join-btn btn-primary-md btn-min-width';
        joinBtn.textContent = 'Join';
        joinBtn.onclick = () => launchGame(presence.rootPlaceId, presence.gameId);
        detailsDiv.appendChild(joinBtn);
    }

    return serverItem;
}

async function checkServerIsActive(placeId, gameId) {
    try {
        const info = await callRobloxApiJson({
            subdomain: 'gamejoin',
            endpoint: '/v1/join-game-instance',
            method: 'POST',
            body: { placeId: parseInt(placeId, 10), gameId, isTeleport: false, gameJoinAttemptId: createUUID() },
            noCache: true
        });

        if (info.jobId) {
            return true;
        }
        if (info.joinScript || info.status === 2 || (info.queuePosition && info.queuePosition > 0)) {
            return true;
        }

        return false;
    } catch (error) {
        return false;
    }
}

async function renderRecentServers(section) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId) return;

    let gridContainer = section.querySelector('.rbx-recent-servers-grid');
    if (!gridContainer) {
        gridContainer = document.createElement('div');
        gridContainer.className = 'rbx-recent-servers-grid';
        section.appendChild(gridContainer);
    }

    gridContainer.innerHTML = '';
    section.querySelectorAll(':scope > .section-content, :scope > .section-content-off').forEach(el => el.remove());
    
    const spinnerSection = document.createElement('div');
    spinnerSection.className = 'section-content';
    spinnerSection.innerHTML = '<div class="spinner spinner-default"></div>';
    gridContainer.appendChild(spinnerSection);

    chrome.storage.local.get({ 'rovalra_server_history': {} }, async (result) => {
        const history = result.rovalra_server_history || {};
        const gameHistory = history[placeId] || [];

        spinnerSection.remove();

        if (gameHistory.length === 0) {
            const noServers = document.createElement('div');
            noServers.className = 'section-content-off empty-game-instances-container';
            noServers.innerHTML = '<p class="no-servers-message">No Recent Servers Found.</p>';
            gridContainer.appendChild(noServers);
            return;
        }

        const activeServers = [];
        const checkPromises = gameHistory.map(serverData => 
            checkServerIsActive(placeId, serverData.presence.gameId).then(isActive => {
                if (isActive) {
                    activeServers.push(serverData);
                }
            })
        );
        
        await Promise.all(checkPromises);

        if (activeServers.length === 0) {
            const noActive = document.createElement('div');
            noActive.className = 'section-content-off empty-game-instances-container';
            noActive.innerHTML = '<p class="no-servers-message">No active recent servers found.</p>';
            gridContainer.appendChild(noActive);
            return;
        }
        
        activeServers.sort((a, b) => b.timestamp - a.timestamp);

        gridContainer.style.display = 'flex';
        gridContainer.style.flexWrap = 'wrap';
        gridContainer.style.width = '100%';
        gridContainer.style.gap = '16px';
        const context = { ...serverListState, processUptimeBatch: processUptimeBatch };

        activeServers.forEach(serverData => {
            if (serverData.presence && serverData.presence.gameId) {
                const contentSection = document.createElement('div');
                contentSection.className = 'section-content';
                contentSection.style.width = '25%';
                contentSection.style.padding = '12px';
                contentSection.style.boxSizing = 'border-box';
                const serverList = document.createElement('ul');
                serverList.className = 'rbx-game-server-item-container';
                contentSection.appendChild(serverList);

                const serverItem = createServerItem(serverData);
                serverList.appendChild(serverItem);
                gridContainer.appendChild(contentSection);

                const obsReq = observeElement(`li[data-rovalra-serverid="${serverData.presence.gameId}"]`, () => {}, {
                    onRemove: () => {
                        if (serverList.children.length === 0) {
                            contentSection.remove();
                            if (gridContainer.children.length === 0) {
                                const noActive = document.createElement('div');
                                noActive.className = 'section-content-off empty-game-instances-container';
                                noActive.innerHTML = '<p class="no-servers-message">No active recent servers found.</p>';
                                gridContainer.appendChild(noActive);
                            }
                        }
                        if (obsReq) obsReq.active = false;
                    }
                });

                enhanceServer(serverItem, context).catch(e => console.error("Error enhancing recent server:", e));
            }
        });
        
        if (processUptimeBatch) {
            setTimeout(() => processUptimeBatch(), 150);
        }
    });
}

export function initRecentServers() {
    const inject = () => {
        const container = document.querySelector('#running-game-instances-container');
        if (!container) return;

        let section = container.querySelector('#rbx-recent-running-games');
        if (!section) {
            section = document.createElement('div');
            section.id = 'rbx-recent-running-games';
            section.className = 'server-list-section';
    
            const content = `
                <div class="container-header">
                    <div class="server-list-container-header">
                        <h2 class="server-list-header">Recent Servers</h2>
                        <button type="button" class="btn-more rbx-refresh refresh-link-icon btn-control-xs btn-min-width">Refresh</button>
                    </div>
                </div>
                <div class="rbx-recent-servers-grid">
                    <div class="section-content-off empty-game-instances-container">
                        <p class="no-servers-message">No Recent Servers Found.</p>
                    </div>
                </div>
            `;
    
            section.innerHTML = DOMPurify.sanitize(content);
    
            const friendsSection = container.querySelector('#rbx-friends-running-games');
            const publicSection = container.querySelector('#rbx-public-running-games');
    
            if (friendsSection) {
                friendsSection.after(section);
            } else if (publicSection) {
                publicSection.before(section);
            } else {
                container.appendChild(section);
            }

            const refreshButton = section.querySelector('.rbx-refresh');
            if (refreshButton) {
                refreshButton.addEventListener('click', () => renderRecentServers(section));
            }
        }
        
        renderRecentServers(section);
    };

    observeElement('#running-game-instances-container', () => {
        inject();
    });

    observeElement('#rbx-recent-running-games', () => {}, {
        onRemove: () => {
            setTimeout(() => {
                const container = document.querySelector('#running-game-instances-container');
                if (container && !container.querySelector('#rbx-recent-running-games')) {
                    inject();
                }
            }, 500)
        }
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'presenceUpdate') {
            const section = document.querySelector('#rbx-recent-running-games');
            if (section && document.body.contains(section)) {
                renderRecentServers(section);
            }
        }
    });
}