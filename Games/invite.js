let processedIds = new Set();
let previousServerListHash = null;
let observer = null;

function getPlaceIdFromUrl() {
    try {
        const path = window.location.pathname;
        const match = path.match(/\/games\/(\d+)/);
        if (match) {
            return match[1];
        }
        return null;
    } catch (error) {
        return null;
    } finally {
    }
}

function addInviteButton(detailsElement, serverId, placeId) {
    try {

        if (!serverId) {
            return;
        }
        const serverItem = detailsElement ? detailsElement.closest('.rbx-game-server-item') : null;

        if (!serverItem) {
            return;
        }
        if (serverItem.classList.contains('rovalra-inviter')) {
            return;
        }

        const existingInviteButton = detailsElement ? detailsElement.querySelector('.create-server-link') : null;
        if (existingInviteButton) {
            serverItem.classList.add('rovalra-inviter');
            return;
        }

        const joinButton = detailsElement ? detailsElement.querySelector('.rbx-game-server-join.game-server-join-btn') : null;
        if (!joinButton) {
            return;
        }

        let inviteButton = document.createElement('a');
        inviteButton.style.cssText = 'width:30%;margin-left:2%;position:relative!important;';
        inviteButton.classList.add('btn-full-width', 'btn-control-xs', 'create-server-link');
        inviteButton.dataset.placeid = placeId;
        inviteButton.dataset.serverid = serverId;
        inviteButton.textContent = 'Invite';
        inviteButton.href = 'javascript:void(0);';
        const inviteUrl = `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;

        inviteButton.addEventListener('click', function (event) {
             try {
                event.preventDefault();
                navigator.clipboard.writeText(inviteUrl)
                    .then(() => {
                            inviteButton.textContent = 'Copied!';
                            setTimeout(() => {
                             inviteButton.textContent = 'Invite';
                            }, 2000)

                    })
                    .catch(err => {
                    });
            } catch (error) {
            }


        });

        joinButton.style.width = "68%";
        detailsElement.appendChild(inviteButton);
        if (serverItem) {
            serverItem.classList.add('server-with-invite');
            serverItem.classList.add('rovalra-inviter');
        }
    } catch (error) {
    } finally {
    }
}

function getServerListHash() {
    try {
        const serverDetailsElements = document.querySelectorAll('.rbx-game-server-details.game-server-details');
        let hashString = '';
        serverDetailsElements.forEach(detailsElement => {
            try {
                const joinButton = detailsElement.querySelector('.rbx-game-server-join.game-server-join-btn');
                if (joinButton && joinButton.dataset.btrInstanceId) {
                    hashString += joinButton.dataset.btrInstanceId;
                }
            } catch (error) {
            }

        });
        return hashString;
    } catch (error) {
        return "";
    } finally {
    }
}

function processServerList(placeId, force = false, targetNode) {
     try {
        const currentHash = getServerListHash();

        if (!force && currentHash === previousServerListHash) {
            return;
        }
          const serverDetailsElements = targetNode ? targetNode.querySelectorAll('.rbx-game-server-details.game-server-details') : [];
            serverDetailsElements.forEach(detailsElement => {
              try {
                 const joinButton = detailsElement.querySelector('.rbx-game-server-join.game-server-join-btn');
                 if (joinButton && joinButton.dataset.btrInstanceId) {
                     const serverId = joinButton.dataset.btrInstanceId;
                      const copyJoinLinkButton = detailsElement.querySelector('.btn-full-width.btn-control-xs.rg-btn');
                     if (copyJoinLinkButton) {
                       copyJoinLinkButton.remove();
                     }

                      addInviteButton(detailsElement, serverId, placeId);
                  }
             } catch (error) {
              }
            });
            previousServerListHash = currentHash;
     } catch (error) {
    } finally {
    }
}


async function waitForElement(selector) {
    try {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    } catch (error) {
        return null;
    } finally {
    }
}

async function trackServerChanges(placeId) {
    try {

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        observer = new MutationObserver(mutationsList => {
            trackServerChangesInternal(placeId)
        });


        trackServerChangesInternal(placeId);

    }  catch(error) {
    } finally {
    }
}
async function trackServerChangesInternal(placeId) {
    try {
       let targetNode = document.querySelector('#rbx-running-games');

       if (!targetNode) {
            return;
        }


         let serverListContainer =  targetNode.querySelector("#rbx-game-server-item-container");
       if(!serverListContainer){
              return
        }
         if(serverListContainer.classList.contains('section-content-off') && serverListContainer.classList.contains('empty-game-instances-container')){
             return;
         }

         processServerList(placeId, true, serverListContainer);
            if(observer){
          observer.observe(targetNode, { childList: true, subtree: true });
        }

    } catch (error) {
    }
}
const placeId = getPlaceIdFromUrl();
if (placeId) {
    trackServerChanges(placeId);
}

window.addEventListener('beforeunload', function () {
    try {
        processedIds.clear();
    } catch (error) {
    } finally {
    }
});