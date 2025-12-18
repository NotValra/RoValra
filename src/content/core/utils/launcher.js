// This script should always be used to start up the Roblox client
function executeLaunchScript(codeToInject) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: "injectScript", codeToInject });
    } else {
        console.error("RoValra Launcher: Chrome runtime is not available to inject the script.");
    }
}


export function launchGame(placeId, jobId = null) {
    const joinFunction = jobId
        ? `Roblox.GameLauncher.joinGameInstance(parseInt('${placeId}', 10), '${jobId}')`
        : `Roblox.GameLauncher.joinGameInstance(parseInt('${placeId}', 10))`;
    const codeToInject = `if (typeof Roblox?.GameLauncher?.joinGameInstance === 'function') { ${joinFunction}; }`;
    executeLaunchScript(codeToInject);
}


export function launchPrivateGame(placeId, accessCode, linkCode) {
    const joinFunction = `Roblox.GameLauncher.joinPrivateGame(parseInt('${placeId}', 10), '${accessCode}', '${linkCode}')`;
    const codeToInject = `if (typeof Roblox?.GameLauncher?.joinPrivateGame === 'function') { ${joinFunction}; }`;
    executeLaunchScript(codeToInject);
}


export function launchMultiplayerGame(placeId, launchData = {}) {
    window.__rovalra_skipNextLaunch = true;
    
    const joinData = { launchData };
    const codeToInject = `if (typeof Roblox.GameLauncher.joinMultiplayerGame === 'function') { Roblox.GameLauncher.joinMultiplayerGame(${placeId}, false, false, null, null, ${JSON.stringify(joinData)}); }`;
    executeLaunchScript(codeToInject);
}