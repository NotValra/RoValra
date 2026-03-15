// This script should always be used to start up the Roblox client
import { callRobloxApiJson } from '../api.js';
import { log, logLevel } from '../logging.js';

function executeLaunchScript(codeToInject) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: "injectScript", codeToInject });
    } else {
        log(logLevel.ERROR, "RoValra Launcher: Chrome runtime is not available to inject the script.");
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

export function followUser(userId) {
    const uId = parseInt(userId, 10);
    const placeLauncherUrl = `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&userId=${uId}&is30=false`;
    const deepLink = `roblox-player:1+launchmode:play+placelauncherurl:${encodeURIComponent(placeLauncherUrl)}`;

    const codeToInject = `
        if (typeof Roblox !== 'undefined' && Roblox.GameLauncher && typeof Roblox.GameLauncher.followPlayerIntoGame === 'function') {
            Roblox.GameLauncher.followPlayerIntoGame(${uId});
        } else {
            window.location.href = '${deepLink}';
        }
    `;
    executeLaunchScript(codeToInject);
}

export async function launchStudioForGame(placeId) {
    try {
        const gameDetails = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`
        });

        if (gameDetails && gameDetails.length > 0 && gameDetails[0].universeId) {
            const universeId = gameDetails[0].universeId;
            const editFunction = `Roblox.GameLauncher.editGameInStudio(${placeId}, ${universeId})`;
            const codeToInject = `if (typeof Roblox?.GameLauncher?.editGameInStudio === 'function') { ${editFunction}; }`;
            executeLaunchScript(codeToInject);
        } else {
            throw new Error(`Could not retrieve universeId for placeId ${placeId}`);
        }
    } catch (error) {
        log(logLevel.ERROR, 'RoValra Launcher: Failed to launch studio with universeId, falling back.', error);
        const uri = `roblox-studio:launchmode:edit+task:EditPlace+placeId:${placeId}`;
        const codeToInject = `window.location.href = '${uri}';`;
        executeLaunchScript(codeToInject);
    }
}