//Updating logic
const currentVersion = chrome.runtime.getManifest().version;
const repoOwner = "NotValra";
const repoName = "RoValra";
const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
let isDebugMode = false;

async function fetchLatestRelease() {
  try {
    const response = await fetch(githubApiUrl);
    if (!response.ok) {
      console.error("Failed to fetch latest release:", response.status, response.statusText);
      return null;
    }
    const data = await response.json();
    return data.tag_name.startsWith('v') ? data.tag_name.substring(1) : data.tag_name;
  } catch (error) {
    console.error("Error fetching latest release:", error);
    return null;
  }
}
function createUpdateOverlay(latestVersion) {
    if (document.getElementById('rovalra-update-overlay')) return;

    chrome.storage.local.get(['doNotShowAgain', 'dismissedVersion'], (result) => {
        const overlay = document.createElement('div');
        overlay.id = 'rovalra-update-overlay';
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
        title.textContent = 'RoValra Update Available';
        title.style.color = "white"

        const message = document.createElement('p');
        message.textContent = `Version ${latestVersion} of RoValra is available.`;
        message.style.color = "white"

        const updateButton = document.createElement('button');
        updateButton.textContent = '🗗 See What Changed';
        updateButton.style.padding = "10px 15px";
        updateButton.style.backgroundColor = "#24292e";
        updateButton.style.border = "1px solid #444";
        updateButton.style.borderRadius = "6px";
        updateButton.style.cursor = "pointer";
        updateButton.style.fontSize = "13.4px";
        updateButton.style.fontWeight = "600";
        updateButton.style.borderColor = "#4c5053";
        updateButton.style.color = "white";
        updateButton.style.flexGrow = "1";
        updateButton.style.flexShrink = "1";
        updateButton.style.minWidth = "50px";
        updateButton.style.textAlign = "center";
        updateButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";
        updateButton.addEventListener('mouseover', () => {
            updateButton.style.backgroundColor = "#4c5053";
            updateButton.style.borderRadius = "6px";
            updateButton.style.borderColor = "#24292e";
            updateButton.style.transform = "scale(1.05)";
        });

        updateButton.addEventListener('mouseout', () => {
            updateButton.style.backgroundColor = "#24292e";
            updateButton.style.borderRadius = "6px";
            updateButton.style.borderColor = "#4c5053";
            updateButton.style.transform = "scale(1)";
        });
        updateButton.onclick = () => {
          window.open('https://github.com/NotValra/RoValra/releases/latest', '_blank');
          overlay.remove();
        };
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Do Not Show Again';
        closeButton.style.padding = "10px 15px";
            closeButton.style.backgroundColor = "#24292e";
            closeButton.style.border = "1px solid #444";
            closeButton.style.borderRadius = "6px";
            closeButton.style.cursor = "pointer";
            closeButton.style.fontSize = "13.4px";
            closeButton.style.fontWeight = "600";
            closeButton.style.borderColor = "#4c5053";
            closeButton.style.color = "white";
            closeButton.style.flexGrow = "1";
            closeButton.style.flexShrink = "1";
            closeButton.style.minWidth = "50px";
            closeButton.style.textAlign = "center";
            closeButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";
        closeButton.addEventListener('mouseover', () => {
            closeButton.style.backgroundColor = "#4c5053";
            closeButton.style.borderRadius = "6px";
            closeButton.style.borderColor = "#24292e";
            closeButton.style.transform = "scale(1.05)";
        });

        closeButton.addEventListener('mouseout', () => {
            closeButton.style.backgroundColor = "#24292e";
            closeButton.style.borderRadius = "6px";
            closeButton.style.borderColor = "#4c5053";
            closeButton.style.transform = "scale(1)";
        });
          closeButton.onclick = () => {
            const confirmationOverlay = document.createElement('div');
            confirmationOverlay.style.position = 'fixed';
            confirmationOverlay.style.top = '0';
            confirmationOverlay.style.left = '0';
            confirmationOverlay.style.width = '100%';
            confirmationOverlay.style.height = '100%';
            confirmationOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            confirmationOverlay.style.display = 'flex';
            confirmationOverlay.style.justifyContent = 'center';
            confirmationOverlay.style.alignItems = 'center';
            confirmationOverlay.style.zIndex = '10001';

            const confirmationModal = document.createElement('div');
            confirmationModal.style.backgroundColor = '#393b3d';
            confirmationModal.style.padding = '20px';
            confirmationModal.style.borderRadius = '5px';
            confirmationModal.style.textAlign = 'center';
          confirmationModal.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";

        const confirmationMessage = document.createElement('p');
            confirmationMessage.textContent = "This will remove the update notification until the next version is released. Are you sure?";
              confirmationMessage.style.color = "white";

        const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.gap = '10px';

        const yesButton = document.createElement('button');
              yesButton.textContent = 'Yes';
                yesButton.style.padding = "10px 20px";
                yesButton.style.backgroundColor = "#24292e";
                yesButton.style.border = "1px solid #444";
                yesButton.style.borderRadius = "6px";
                yesButton.style.cursor = "pointer";
                yesButton.style.fontSize = "13.4px";
                yesButton.style.fontWeight = "600";
                yesButton.style.borderColor = "#4c5053";
                yesButton.style.color = "white";
                yesButton.style.flexGrow = "0";
                yesButton.style.flexShrink = "0";
                yesButton.style.minWidth = "80px";
                yesButton.style.textAlign = "center";
                yesButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";
            yesButton.addEventListener('mouseover', () => {
                yesButton.style.backgroundColor = "#4c5053";
                yesButton.style.borderRadius = "6px";
                yesButton.style.borderColor = "#24292e";
                yesButton.style.transform = "scale(1.05)";
            });

            yesButton.addEventListener('mouseout', () => {
                yesButton.style.backgroundColor = "#24292e";
                yesButton.style.borderRadius = "6px";
                yesButton.style.borderColor = "#4c5053";
                yesButton.style.transform = "scale(1)";
            });
                yesButton.onclick = () => {
                chrome.runtime.sendMessage({ action: 'setDoNotShowAgain', latestVersion: latestVersion });

                    confirmationOverlay.remove();
                    overlay.remove();
            }
        const noButton = document.createElement('button');
            noButton.textContent = 'No';
              noButton.style.padding = "10px 20px";
                noButton.style.backgroundColor = "#24292e";
                noButton.style.border = "1px solid #444";
                noButton.style.borderRadius = "6px";
                noButton.style.cursor = "pointer";
                noButton.style.fontSize = "13.4px";
                noButton.style.fontWeight = "600";
                noButton.style.borderColor = "#4c5053";
                noButton.style.color = "white";
                 noButton.style.flexGrow = "0";
                noButton.style.flexShrink = "0";
                noButton.style.minWidth = "80px";
                noButton.style.textAlign = "center";
                noButton.style.transition = "background-color 0.3s ease, transform 0.3s ease";
            noButton.addEventListener('mouseover', () => {
                noButton.style.backgroundColor = "#4c5053";
                noButton.style.borderRadius = "6px";
                noButton.style.borderColor = "#24292e";
                noButton.style.transform = "scale(1.05)";
            });

            noButton.addEventListener('mouseout', () => {
                noButton.style.backgroundColor = "#24292e";
                noButton.style.borderRadius = "6px";
                noButton.style.borderColor = "#4c5053";
                noButton.style.transform = "scale(1)";
            });
            noButton.onclick = () => {
                confirmationOverlay.remove();
            }

             buttonContainer.appendChild(yesButton);
             buttonContainer.appendChild(noButton);

            confirmationModal.appendChild(confirmationMessage);
            confirmationModal.appendChild(buttonContainer);
            confirmationOverlay.appendChild(confirmationModal);
            document.body.appendChild(confirmationOverlay);
          };
           modal.style.display = "flex";
        modal.style.flexDirection = "column";
        modal.style.gap = "10px";
        modal.appendChild(title);
        modal.appendChild(message);
        modal.appendChild(updateButton);
        modal.appendChild(closeButton);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    });
}
async function applyUpdate() {
  const latestVersion = await fetchLatestRelease();
  if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
    console.log("Automatic Update: Applying new version", latestVersion);
    chrome.tabs.create({ url: `https://github.com/NotValra/RoValra/releases/tag/v${latestVersion}` });
  } else {
    console.log("No update available for automatic update.");
  }
}


function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p2 > p1) return -1;
  }
  return 0;
}

async function showUpdateOverlay(latestVersion) {
  chrome.tabs.query({}, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.includes("roblox.com")) {
          console.log("Injecting/Re-injecting update overlay script into tab:", tab.id);
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: createUpdateOverlay,
            args: [latestVersion],
          }, (injectionResults) => {
            if (chrome.runtime.lastError) {
              console.error("Error injecting script:", chrome.runtime.lastError.message);
            } else {
              console.log("Script injected/re-injected successfully:", injectionResults);
            }
          });
        }
      });
    } else {
      console.warn("No active tabs found");
    }
  });
}

async function checkForUpdates(bypassDoNotShow = false) {
  console.log("checkForUpdates called, bypassDoNotShow:", bypassDoNotShow);

  const latestVersion = await fetchLatestRelease();
  chrome.storage.local.get(['doNotShowAgain', 'dismissedVersion'], (result) => {
    if (result.doNotShowAgain === true && result.dismissedVersion === latestVersion && !bypassDoNotShow) {
      console.log("do not show again preference is true for current version", latestVersion);
      return;
    }

    if (result.dismissedVersion !== latestVersion)
      chrome.storage.local.remove(['doNotShowAgain', 'dismissedVersion']);

    console.log("Latest version:", latestVersion);

    if (latestVersion) {
      console.log("Current Version:", currentVersion, "Latest Version:", latestVersion);

      if (isDebugMode || compareVersions(latestVersion, currentVersion) > 0 || bypassDoNotShow) {
        console.log("Update available! Showing overlay.");
        showUpdateOverlay(latestVersion);
      } else {
        console.log("No update available.");
      }
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkUpdatesDebug") {
    isDebugMode = true;
    checkForUpdates();
  } else if (request.action === "fetchHiddenGames") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, request, function (response) {
        sendResponse(response);
      });
    });
    return true;
  } else if (request.action === "getRobloxCookie") {
      getRobloxCookie()
        .then(cookie => {
        //   sendResponse({ success: true, cookie: cookie });
         chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              chrome.tabs.sendMessage(tabs[0].id, { action: "cookieUpdate", cookie: cookie });
         });
            sendResponse({ success: true, message: 'cookie sent to content script' });
           return true
        })
        .catch(error => {
          sendResponse({ success: false, message: error });
        });
           return true
  } else if (request.action === 'resetDoNotShow') {
    console.log("resetting do not show");
    chrome.storage.local.remove('doNotShowAgain');
    sendResponse({ message: 'do not show reset' });
    return true;

  } else if (request.action === "applyUpdate") {
    applyUpdate();
  } else if (request.action === 'showUpdateOverlayFromPopup') {
    checkForUpdates(true);
    sendResponse({ message: 'showing update overlay from popup' });
    return true;
  }
   else if (request.action === 'setDoNotShowAgain') {
    const latestVersion = request.latestVersion;
    console.log("setting do not show again preference", latestVersion);
    chrome.storage.local.set({ doNotShowAgain: true, dismissedVersion: latestVersion });
    sendResponse({ message: 'do not show set' });
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated.");
  if (isDebugMode) {
    console.log("resetting do not show");
    console.log(typeof localStorage);
    chrome.storage.local.remove('doNotShowAgain');
  }
  checkForUpdates();
});
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started.");
  checkForUpdates();
});


chrome.action.onClicked.addListener(() => {
  checkForUpdates(true);
});

chrome.alarms.create('updateCheck', { periodInMinutes: 360 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateCheck') {
    checkForUpdates();
  }
});



chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('roblox.com')) {
    checkForUpdates();
  }
});








// Not updating logic :D
function getRobloxCookie() {
  return new Promise((resolve, reject) => {
    chrome.cookies.get({ url: "https://www.roblox.com", name: ".ROBLOSECURITY" }, (cookie) => {
      if (cookie) {
        resolve(cookie.value);
      } else {
        reject("No .ROBLOSECURITY cookie found");
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchHiddenGames") {
        const userId = message.userId;
        const apiUrl = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=10&sortOrder=Asc`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                const hiddenGames = data.data.filter(game => {
                    return !document.querySelector(`[data-game-id="${game.id}"]`);
                });

                const newTabHtml = hiddenGames.map(game => `
                    <div>
                        <h3>${game.name}</h3>
                        <a href="https://www.roblox.com/games/${game.id}" target="_blank">
                            ${game.name}
                        </a>
                    </div>
                `).join("");

                const newTabContent = `
                    <html>
                    <head>
                        <title>Hidden Games</title>
                    </head>
                    <body>
                        <h1>Hidden Games for User ${userId}</h1>
                        ${newTabHtml || "<p>No hidden games found.</p>"}
                    </body>
                    </html>
                `;

                const blob = new Blob([newTabContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);

                chrome.tabs.create({ url });
            })
            .catch(error => console.error('Error fetching hidden games:', error));
    }
});