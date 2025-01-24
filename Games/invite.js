const copyToClipboard = (text) => {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
            .catch(() => fallbackCopyTextToClipboard(text));
    } else {
        fallbackCopyTextToClipboard(text);
    }
};

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.cssText = "top: 0; left: 0; position: fixed;";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
         document.execCommand('copy');
    } catch (err) {
    }
    document.body.removeChild(textArea);
}


function getPlaceIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/games\/(\d+)/);
    return match ? match[1] : null;
}


function createInviteLink(placeId, jobId) {
    return `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${jobId}`;
}


function addOrUpdateInviteButton(serverItem, placeId) {
    if (!serverItem) {
        return;
    }

    const oldInviteButton = serverItem.querySelector('.create-server-link');
    const copyJoinLinkButton = serverItem.querySelector('a.rg-btn');

    if (oldInviteButton) {
        oldInviteButton.style.display = 'none';
    }
    if (copyJoinLinkButton) {
        copyJoinLinkButton.remove();
    }

   const joinButton = serverItem.querySelector('button.rbx-game-server-join');

    let jobId = null;
    if (joinButton)
    {
          jobId = joinButton.getAttribute('data-btr-instance-id');
    }
    if (!jobId) {
        jobId = serverItem.getAttribute('jobid') || serverItem.getAttribute('data-gameid');
    }


    if (!jobId) {
        return;
    }


    let inviteButton = serverItem.querySelector('.custom-invite-button');
    if (inviteButton) {
        return;
    }

    const inviteLink = createInviteLink(placeId, jobId);
    inviteButton = document.createElement('a');
    inviteButton.textContent = 'Invite';
    inviteButton.classList.add('btn-control-xs', 'custom-invite-button');
    inviteButton.style.cssText = 'width: 30%; margin-left: 2%; position: relative; margin-top: 12px;';
    inviteButton.setAttribute('data-placeid', placeId);

    inviteButton.addEventListener('click', (event) => {
        event.preventDefault();
        const originalText = inviteButton.textContent;
        inviteButton.textContent = "Copied!";
        copyToClipboard(inviteLink);
        setTimeout(() => {
            inviteButton.textContent = originalText;
        }, 5000);
    });

    if(joinButton){
      joinButton.style.width = '68%';
      joinButton.insertAdjacentElement('afterend', inviteButton);
    } else{
         serverItem.appendChild(inviteButton);
    }
}


function processServerItems(placeId, serverItems) {
    if (!serverItems || serverItems.length === 0) {
        return;
    }

    serverItems.forEach(serverItem => {
        if (serverItem.classList.contains('rbx-game-server-item') &&
            !serverItem.classList.contains('ropro-server-invite-added') &&
            !serverItem.classList.contains('stack-row')) {
            try {
                addOrUpdateInviteButton(serverItem, placeId);
                serverItem.classList.add('ropro-server-invite-added');
            } catch (err) {
            }
        }
    });
}


function monitorServerList(placeId) {
    let serverList = document.getElementById('running-game-instances-container') || document.getElementById('rbx-game-server-item-container');
    if (!serverList) {
        return;
    }
    let noJobIdCount = 0;
    let isProcessing = false;
    let observer = null;

    async function processAvailableServers(addedNodes) {
       if (isProcessing) {
            return;
        }
       isProcessing = true;

        try{
          let serverItems = [];
          if (!addedNodes || addedNodes.length === 0) {
             serverItems = Array.from(serverList.querySelectorAll('li.rbx-game-server-item'));
        } else {
            serverItems = Array.from(addedNodes).filter(node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('rbx-game-server-item'));
        }

        if (serverItems.length === 0) {
          return;
        }

        let hasJobId = false;
         for (const serverItem of serverItems)
         {
            const joinButton = serverItem.querySelector('button.rbx-game-server-join');
               if (joinButton?.getAttribute('data-btr-instance-id') || serverItem.getAttribute('jobid') || serverItem.getAttribute('data-gameid'))
             {
                hasJobId = true;
                break;
             }
        }

        if (!hasJobId)
            {
               noJobIdCount++;
                if (noJobIdCount >= 5)
                {
                    observer.disconnect();
                    return;
                }
             } else {
               noJobIdCount = 0;
             }
            processServerItems(placeId, serverItems);

        } finally {
          isProcessing = false;
        }
    }

    async function initializeMonitor() {
        if (!serverList) {
            return;
        }
        const allCopyButtons = serverList.querySelectorAll('a.rg-btn');
        allCopyButtons.forEach(button => {
            try {
                button.remove();
            } catch (err) {
            }
        });

        const initialServerItems = Array.from(serverList.querySelectorAll('li.rbx-game-server-item'));
        setTimeout(() => {
            processServerItems(placeId, initialServerItems);
        }, 500);



          observer = new MutationObserver((mutations) => {

                mutations.forEach(mutation => {
                  if(mutation.type === 'childList')
                    {
                      processAvailableServers(Array.from(mutation.addedNodes));
                    }
                });
           });

        observer.observe(serverList, { childList: true, subtree: true });

    }

    initializeMonitor();
}


const placeId = getPlaceIdFromUrl();

if (placeId) {
    monitorServerList(placeId);
}