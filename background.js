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

async function updateDeclarativeNetRequestRuleWithCookie(rulesetId) {
  try {
    const cookie = await getRobloxCookie();
    const ruleset = await chrome.declarativeNetRequest.getRules([rulesetId]);

    if (ruleset.length > 0) {
      const rule = ruleset[0];
      if (rule) {
        const updatedRule = {
          ...rule,
          action: {
            ...rule.action,
            requestHeaders: rule.action.requestHeaders.map(header => {
              if (header.header === "Cookie") {
                return { ...header, value: `.ROBLOSECURITY=${cookie}` };
              }
              return header;
            })
          }
        };
        await chrome.declarativeNetRequest.updateRules({
          removeRuleIds: [updatedRule.id],
          addRules: [updatedRule]
        });
        console.log(`Declarative Net Request rule ${rulesetId} updated with cookie`);
      }
    } else {
      console.error(`No rulesets found to update for ${rulesetId}`);
    }
  } catch (error) {
    console.error(`Error getting or updating the ruleset with cookie for ${rulesetId}`, error);
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.action) {
    case 'enableServerJoinHeaders':
      console.log("enableServerJoinHeaders");
      await updateDeclarativeNetRequestRuleWithCookie('ruleset_2');
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['ruleset_2'],
      });
      break;
    case 'disableServerJoinHeaders':
      console.log("disableServerJoinHeaders");
      chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['ruleset_2'],
      });
      break;
    case 'enableUserSniper':
      console.log("enableUserSniper");
      await updateDeclarativeNetRequestRuleWithCookie('ruleset_1');
      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['ruleset_1'],
      });
      break;
    case 'disableUserSniper':
      console.log("disableUserSniper");
      chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['ruleset_1'],
      });
      break;
    case "getRobloxCookie":
      getRobloxCookie()
        .then((cookie) => {
          sendResponse({ success: true, cookie: cookie });
        })
        .catch((error) => {
          sendResponse({ success: false, message: error });
        });
      return true;
      case "fetchUserIP": {
        try {
          const cookie = await getRobloxCookie();
            const response = await fetch("https://www.roblox.com/my/settings/json", {
                headers: {
                  "Cookie": `${cookie}`
                }
            });
          if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
           if (data && data.ClientIpAddress) {
              sendResponse({ success: true, ip: data.ClientIpAddress });
            } else {
                sendResponse({ success: false, message: "IP address not found in settings" });
          }
        } catch (error) {
          sendResponse({ success: false, message: error.message });
        }
        return true;
      }
      case "initializeServerRegion":
          try {
              const cookie = await getRobloxCookie();
              const response = await fetch("https://www.roblox.com/my/settings/json", {
                  headers: {
                      "Cookie": `${cookie}`
                  }
              });
              if (!response.ok) {
                  throw new Error(`HTTP error! Status: ${response.status}`);
              }
              const data = await response.json();
               if (data && data.ClientIpAddress) {
                  sendResponse({ success: true, ip: data.ClientIpAddress, cookie: cookie });
              } else {
                    sendResponse({ success: false, message: "IP address not found in settings" });
                }
          } catch (error) {
               sendResponse({ success: false, message: error.message });
          }
         return true;
    case "fetchGeolocation": {
      const ip = message.ip;
      fetch(`https://get.geojs.io/v1/ip/country/${ip}.json`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          return fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`)
            .then((locationResponse) => {
              if (!locationResponse.ok) {
                throw new Error(`HTTP error! Status: ${locationResponse.status}`);
              }
              return locationResponse.json();
            })
            .then((locationData) => {
              sendResponse({
                success: true,
                geolocation: {
                  name: data.name || "Unknown",
                  countryCode: data.country || "Unknown",
                  countryCode3: data.country_3 || "Unknown",
                  latitude: parseFloat(locationData.latitude),
                  longitude: parseFloat(locationData.longitude),
                  ip: ip
                }
              });
            })
        })
        .catch((error) => {
          sendResponse({ success: false, message: error.message });
        });
      return true;
    }
    case "fetchItemData":
      fetch("https://raw.githubusercontent.com/workframes/roblox-owner-counts/refs/heads/main/items.json")
        .then((response) => response.json())
        .then((data) => {
          sendResponse({ success: true, data: data });
        })
        .catch((error) => {
          sendResponse({ success: false, message: error.message });
        });
      return true;
    default:
      return;
  }
  return;
});

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    if (request.action === "fetchUserIP") {
      fetch("https://api.ipify.org?format=json")
        .then((response) => response.json())
        .then((data) => {
          sendResponse({ success: true, ip: data.ip });
        })
        .catch((error) => {
          sendResponse({ success: false, message: error.message });
        });
      return true;
    }
    if (request.action === "initializeServerRegion") {
      const placeId = request.placeId;
      fetch("https://api.ipify.org?format=json")
        .then((response) => response.json())
        .then((data) => {
          chrome.runtime.sendMessage({ action: "getRobloxCookie" }, (response) => {
            if (response.success) {
              sendResponse({ success: true, ip: data.ip, cookie: response.cookie });
            } else {
              sendResponse({ success: false, message: response.message });
            }
          });
        })
        .catch((error) => {
          sendResponse({ success: false, message: error.message });
        });
      return true;
    }
  }
);

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
        console.log("Update available!");
          applyUpdate();
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