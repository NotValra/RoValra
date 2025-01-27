// Dont look at this shit dookie poo po of code
// Starting roblox logic, i would recommend not touching this :)
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === "injectScript") {
      const { codeToInject } = message;
  
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
         func: (code) => {
                  try {
                     const script = document.createElement('script');
                     script.textContent = code;
                     document.documentElement.appendChild(script);
                     script.remove();
                 } catch(error){
                      console.error("Error in injected script:", error);
                  }
  
              },
        args: [codeToInject],
      })
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error("Error injecting script:", error);
          sendResponse({ success: false, error: error.message });
        });
  
      return true;
    }
    return false;
  });
// this was from back when i was testing stuff, pretty sure its not in use i just dont wanna remove it since if it aint broke dont fix it
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
                  return { ...header, value: `${cookie}` };
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
          // Not in use like almost the entire script
          case "fetchUserIP": { // This is not in use, the reason why its called "FetchUserIp" is back when it was used. This does not fetch ur ip i just dont wanna remove it since parts of this code i still in use and i cant be bothered
              try {
                  const cookie = await getRobloxCookie();
                  const response = await fetch("", {
                      headers: {
                          "Cookie": `${cookie}`
                      }
                  });
                  if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                  }
                  const data = await response.json();
                  if (data && data.ClientIpAddress) {
                      sendResponse({
                          success: true,
                          ip: data.ClientIpAddress
                      });
                  } else {
                      sendResponse({
                          success: false,
                          message: "IP address not found in settings"
                      });
                  }
              } catch (error) {
                  sendResponse({
                      success: false,
                      message: error.message
                  });
              }
              return true;
          }
          case "initializeServerRegion":
              try {
                  const cookie = await getRobloxCookie();
                  const response = await fetch("", {
                      headers: {
                          "Cookie": `${cookie}`
                      }
                  });
                  if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                  }
                  const data = await response.json();
                  if (data && data.ClientIpAddress) {
                      sendResponse({
                          success: true,
                          ip: data.ClientIpAddress,
                          cookie: cookie
                      });
                  } else {
                      sendResponse({
                          success: false,
                          // This is also not in used, it was used to find the closest server to u but its now all running inside of Regions_content.js and its not using ur ip anymore to do it.
                          message: "IP address not found in settings"
                      });
                  }
              } catch (error) {
                  sendResponse({
                      success: false,
                      message: error.message
                  });
              }
              return true;
          // this was also from back when it wasnt released on the chrome webstore, ur country code is not being used anymore. Back then it was using a third party api that we are not using anymore.
          case "fetchCountryCode": {
            try {
               const cookie = await getRobloxCookie();
               sendResponse({ success: true, cookie: cookie });
             } catch (error) {
                  sendResponse({ success: false, message: error.message });
                }
             return true
          }
          case "fetchItemData":
              fetch("")
                  .then((response) => response.json())
                  .then((data) => {
                      sendResponse({
                          success: true,
                          data: data
                      });
                  })
                  .catch((error) => {
                      sendResponse({
                          success: false,
                          message: error.message
                      });
                  });
              return true;
          default:
              return;
      }
      return;
  });
  
  
  const currentVersion = chrome.runtime.getManifest().version;
  const repoOwner = "";
  const repoName = "";
  const githubApiUrl = ``;
  let isDebugMode = false;
  //Old updating logic that doesnt matter anymore
  async function fetchLatestRelease() {
      try {
          const response = await fetch(githubApiUrl);
          if (!response.ok) {
              return null;
          }
          const data = await response.json();
          return data.tag_name.startsWith('v') ? data.tag_name.substring(1) : data.tag_name;
      } catch (error) {
          return null;
      }
  }
  
  async function applyUpdate() {
      const latestVersion = await fetchLatestRelease();
      if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
          chrome.tabs.create({
              url: ``
          });
      } else {
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
  
      const latestVersion = await fetchLatestRelease();
      chrome.storage.local.get(['doNotShowAgain', 'dismissedVersion'], (result) => {
          if (result.doNotShowAgain === true && result.dismissedVersion === latestVersion && !bypassDoNotShow) {
              return;
          }
  
          if (result.dismissedVersion !== latestVersion)
              chrome.storage.local.remove(['doNotShowAgain', 'dismissedVersion']);
  
  
          if (latestVersion) {
  
              if (isDebugMode || compareVersions(latestVersion, currentVersion) > 0 || bypassDoNotShow) {
                  applyUpdate();
              } else {
              }
          }
      });
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "checkUpdatesDebug") {
          isDebugMode = true;
          checkForUpdates();
      } else if (request.action === "fetchHiddenGames") {
          chrome.tabs.query({
              active: true,
              currentWindow: true
          }, function(tabs) {
              chrome.tabs.sendMessage(tabs[0].id, request, function(response) {
                  sendResponse(response);
              });
          });
          return true;
          // more cookie logic which im 99% sure isnt in use, now how we do it is just by adding it directly into the api request.
      } else if (request.action === "getRobloxCookie") {
          getRobloxCookie()
              .then(cookie => {
                  //   sendResponse({ success: true, cookie: cookie });
                  chrome.tabs.query({
                      active: true,
                      currentWindow: true
                  }, function(tabs) {
                      chrome.tabs.sendMessage(tabs[0].id, {
                          action: "cookieUpdate",
                          cookie: cookie
                      });
                  });
                  sendResponse({
                      success: true,
                      message: 'cookie sent to content script'
                  });
                  return true
              })
              .catch(error => {
                  sendResponse({
                      success: false,
                      message: error
                  });
              });
          return true
      } else if (request.action === 'resetDoNotShow') {
          console.log("resetting do not show");
          chrome.storage.local.remove('doNotShowAgain');
          sendResponse({
              message: 'do not show reset'
          });
          return true;
      } else if (request.action === "applyUpdate") {
          applyUpdate();
      } else if (request.action === 'showUpdateOverlayFromPopup') {
          checkForUpdates(true);
          sendResponse({
              message: 'showing update overlay from popup'
          });
          return true;
      } else if (request.action === 'setDoNotShowAgain') {
          const latestVersion = request.latestVersion;
          console.log("setting do not show again preference", latestVersion);
          chrome.storage.local.set({
              doNotShowAgain: true,
              dismissedVersion: latestVersion
          });
          sendResponse({
              message: 'do not show set'
          });
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
  
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('roblox.com')) {
          checkForUpdates();
      }
  });
  
  // Not updating logic :D
  // Unsure if this is being used, it might be but its only to send api request with ur cookie which is needed THIS IS HOW APIS WORK.
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