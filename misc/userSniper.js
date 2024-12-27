if (window.location.pathname.startsWith('/users/')) {
(function() {
    console.log("Script started");

    let isRunning = false;
    let intervalId;
    let isRateLimited = false;
    let lastRequestTime = 0;
    const requestDelay = 50;
    let hasJoinedGame = false;
    let canMakeRequest = true;


    function getUserIdFromUrl() {
        const path = window.location.pathname;
        console.log("URL Path:", path);
        const match = path.match(/\/users\/(\d+)/);
        if (match) {
            const userId = parseInt(match[1], 10);
            console.log("UserId", userId);
            return userId;
        } else {
            console.log("Could not extract the user id from the path");
            return null;
        }
    }

    async function sendPresenceRequest(userId) {
        if (isRateLimited || !canMakeRequest) {
                console.log("Rate limited or request is pending. Waiting to resume.");
                return;
            }
             canMakeRequest = false;
        console.log("sendPresenceRequest called");
        const url = "https://presence.roblox.com/v1/presence/users";
        const requestBody = JSON.stringify({
            userIds: [userId],
        });
        console.log("Request Body:", requestBody);
        try {
              const response = await fetch(url, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Origin": "https://roblox.com",
                    "Referer": "https://www.roblox.com/",
                    "User-Agent": "Roblox/WinInet"
                },
                body: requestBody,
                credentials: 'include'
            });
              if (response.status === 429) {
                   isRateLimited = true;
                   console.log("Rate limit detected. Waiting 3 seconds.");
                   setTimeout(() => {
                       isRateLimited = false;
                       console.log("Resuming requests.");
                   }, 3000);
                    canMakeRequest = true;
                    return;
                }
              if (!response.ok) {
                  console.error('API Error:', response.status, await response.text());
                  canMakeRequest = true;
                  return;
               }
              const data = await response.json();
             console.log('API Response:', data);
            if (data && data.userPresences && data.userPresences.length > 0) {
                  const presence = data.userPresences[0];
                  if (presence.placeId && presence.gameId) {
                      if (!hasJoinedGame) {
                          const joinURL = `roblox://experiences/start?placeId=${presence.placeId}&gameInstanceId=${presence.gameId}`;
                         window.open(joinURL, '_blank');
                         console.log('Joining game:', joinURL);
                         hasJoinedGame = true;
                           stopPresenceCheck();
                        } else{
                          console.log("Already joined a game, not joining another")
                         }
                        canMakeRequest = true;
                        return;
                   }
            }
            canMakeRequest = true;
            return data;
        } catch (error) {
            console.error('Fetch Error:', error);
            canMakeRequest = true;
        }
    }

    function enableForcedHeaders() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
             chrome.runtime.sendMessage({ action: "enableServerJoinHeaders" }, (response) => {
                    if (response) {
                        console.log("Forced headers enabled");
                    } else {
                       console.error("Error enabling forced headers");
                    }
                });
            }
    }
    function disableForcedHeaders() {
           if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
               chrome.runtime.sendMessage({ action: "disableServerJoinHeaders" }, (response) => {
                    if (response) {
                         console.log("Forced headers disabled");
                    } else {
                         console.error("Error disabling forced headers");
                    }
                });
            }
    }
   function stopPresenceCheck() {
        disableForcedHeaders();
        button.textContent = 'Snipe User';
        clearInterval(intervalId);
        isRunning = false;
        hasJoinedGame = false;
        console.log("Stopping presence check");
    }

   function showConfirmationOverlay(callback) {
        if (document.getElementById('snipe-user-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'snipe-user-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '10000';

        const modal = document.createElement('div');
        modal.style.backgroundColor = '#393b3d';
        modal.style.padding = '20px';
        modal.style.borderRadius = '5px';
        modal.style.textAlign = 'center';
        modal.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";

        const title = document.createElement('h2');
        title.textContent = 'Confirm Action';
        title.style.color = "white";
        title.style.fontWeight = "600";

        const message = document.createElement('p');
        message.textContent = 'This will automatically attempt to join the user into a game.';
         message.style.color = "white";
         message.style.fontWeight = "600";


       const message1 = document.createElement('p');
        message1.textContent = 'This will require the user to have joins on for everyone or have you added.';
       message1.style.color = "white";
       message1.style.fontWeight = "600";
      
      const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'row';
         buttonContainer.style.justifyContent = 'center';
       buttonContainer.style.marginTop = '15px'
      buttonContainer.style.gap = '10px'

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Continue';
        confirmButton.style.padding = "10px 15px";
        confirmButton.style.backgroundColor = "#24292e";
        confirmButton.style.border = "1px solid #444";
        confirmButton.style.borderRadius = "6px";
        confirmButton.style.cursor = "pointer";
         confirmButton.style.fontSize = "13.4px";
        confirmButton.style.fontWeight = "600";
        confirmButton.style.borderColor = "#4c5053";
         confirmButton.style.color = "white";
         confirmButton.style.flexGrow = "0";
        confirmButton.style.flexShrink = "0";
        confirmButton.style.minWidth = "50px";
        confirmButton.style.textAlign = "center";
         confirmButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";
        confirmButton.style.width = 'auto';
        confirmButton.addEventListener('mouseover', () => {
            confirmButton.style.backgroundColor = "#4c5053";
            confirmButton.style.borderRadius = "6px";
            confirmButton.style.borderColor = "#24292e";
            confirmButton.style.transform = "scale(1.05)";
        });

        confirmButton.addEventListener('mouseout', () => {
            confirmButton.style.backgroundColor = "#24292e";
            confirmButton.style.borderRadius = "6px";
             confirmButton.style.borderColor = "#4c5053";
            confirmButton.style.transform = "scale(1)";
        });
       const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
         cancelButton.style.padding = "10px 15px";
        cancelButton.style.backgroundColor = "#24292e";
        cancelButton.style.border = "1px solid #444";
        cancelButton.style.borderRadius = "6px";
        cancelButton.style.cursor = "pointer";
        cancelButton.style.fontSize = "13.4px";
        cancelButton.style.fontWeight = "600";
        cancelButton.style.borderColor = "#4c5053";
       cancelButton.style.color = "white";
        cancelButton.style.flexGrow = "0";
        cancelButton.style.flexShrink = "0";
        cancelButton.style.minWidth = "50px";
        cancelButton.style.textAlign = "center";
         cancelButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";
         cancelButton.style.width = 'auto';
       cancelButton.addEventListener('mouseover', () => {
            cancelButton.style.backgroundColor = "#4c5053";
            cancelButton.style.borderRadius = "6px";
            cancelButton.style.borderColor = "#24292e";
            cancelButton.style.transform = "scale(1.05)";
        });

        cancelButton.addEventListener('mouseout', () => {
            cancelButton.style.backgroundColor = "#24292e";
             cancelButton.style.borderRadius = "6px";
            cancelButton.style.borderColor = "#4c5053";
            cancelButton.style.transform = "scale(1)";
        });
         cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
             callback(false);
        });
        confirmButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(true);
        });


        modal.appendChild(title);
        modal.appendChild(message);
          modal.appendChild(message1);
        buttonContainer.appendChild(confirmButton);
        buttonContainer.appendChild(cancelButton);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    const button = document.createElement('button');
    button.textContent = 'Snipe User';
    button.style.padding = "10px 15px";
    button.style.backgroundColor = "#24292e";
    button.style.border = "1px solid #444";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";
    button.style.fontSize = "15px";
    button.style.fontWeight = "600";
    button.style.color = "white";
    button.style.flexGrow = "1";
    button.style.flexShrink = "1";
    button.style.minWidth = "50px";
    button.style.textAlign = "center";
    button.style.transition = "background-color 0.3s ease, transform 0.3s ease";

    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = "#4c5053";
        button.style.borderRadius = "6px";
        button.style.borderColor = "#24292e";
        button.style.transform = "scale(1.05)";
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = "#24292e";
        button.style.borderRadius = "6px";
        button.style.borderColor = "#4c5053";
        button.style.transform = "scale(1)";
    });
    button.addEventListener('click', async () => {
        const userId = getUserIdFromUrl();
        if (!userId) {
            console.error("Could not extract user ID from URL.");
            return;
        }
        if (isRunning) {
             stopPresenceCheck();
             return;
        }
         showConfirmationOverlay(confirmation => {
             if (!confirmation) {
               return;
            }
         isRunning = !isRunning;

        enableForcedHeaders();
        button.textContent = 'Stop Sniping';
        console.log("Starting presence check");
          intervalId = setInterval(async () => {
              const currentTime = Date.now();
                if(currentTime - lastRequestTime >= requestDelay){
                  const response = await sendPresenceRequest(userId);
                  if (response) {
                    console.log('API Response (No Join):', response)
                  }
                 lastRequestTime = currentTime;
               }
            }, 50);
    });
});


    function appendButtonToTarget() {
          const targetElement = document.querySelector('.profile-header-top');
          if (targetElement) {
            targetElement.insertBefore(button, targetElement.firstChild);
             console.log('Button added to target.');
        } else {
             console.log('Target element not found. Attempting again in 100ms.');
            setTimeout(appendButtonToTarget, 100);
        }
    }
    appendButtonToTarget();
    console.log("Script fully loaded");
})();
}
// userSniper.js
function applyUserSniper(){
    const observer = new MutationObserver(mutations => {
    if (window.location.pathname.startsWith('/users/')) {
          const userId = window.location.pathname.split('/')[2];

          if (userId) {
                 const targetButton = document.querySelector('.btn.btn-secondary.btn-more.follow-button.text-label.ng-binding.ng-scope');
                    if(targetButton && !targetButton.dataset.sniper){
                        targetButton.dataset.sniper = "true";
                       targetButton.addEventListener('click', function () {
                            if (targetButton.textContent.trim() === "Unfollow") {
                                 console.log("Disabling Forced Headers");
                                 chrome.runtime.sendMessage({ action: "disableUserSniper" }, (response) => {
                                        if (chrome.runtime.lastError) {
                                           console.error("Error disabling forced headers:", chrome.runtime.lastError.message);
                                      } else {
                                           console.log("Forced headers disabled");
                                        }
                                 });
                            } else {
                                  console.log("Enabling Forced Headers");
                                   chrome.runtime.sendMessage({ action: "enableUserSniper" }, (response) => {
                                          if (chrome.runtime.lastError) {
                                                console.error("Error enabling forced headers:", chrome.runtime.lastError.message);
                                            }
                                            else
                                            {
                                                  console.log("Forced headers enabled");
                                            }
                                   });
                            }
                        });
                    }
              }
         }
     });

      observer.observe(document.body, { childList: true, subtree: true });

}

applyUserSniper();