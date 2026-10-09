// This script should always be used to start up the Roblox client
import { callRobloxApiJson } from '../api.js';

let preLaunchHook = null;
let followUserHook = null;
let privateServerLaunchHook = null;
let followLaunchObserver = null;
let privateServerLaunchObserver = null;
let lastObservedFollowLaunch = null;
let lastObservedPrivateServerLaunch = null;

// Lets a feature do something right before the client starts, such as changing
// the avatar. Opt in on purpose: with no hook registered every launch below
// stays exactly as synchronous as it was.
export function setPreLaunchHook(hook) {
    preLaunchHook = typeof hook === 'function' ? hook : null;
}

export function setFollowUserHook(hook) {
    followUserHook = typeof hook === 'function' ? hook : null;
    if (followUserHook && !followLaunchObserver) {
        followLaunchObserver = observeGameLaunch((_frame, launch) => {
            if (
                !followUserHook ||
                !launch ||
                launch.request !== 'RequestFollowUser' ||
                !launch.userId ||
                launch.src === lastObservedFollowLaunch
            ) {
                return;
            }

            lastObservedFollowLaunch = launch.src;
            resolveGameLaunchPlaceId(launch)
                .then((placeId) => followUserHook?.(placeId))
                .catch((error) => {
                    console.error(
                        'RoValra Launcher: Observed follow hook failed',
                        error,
                    );
                });
        });
    } else if (!followUserHook && followLaunchObserver) {
        followLaunchObserver.disconnect();
        followLaunchObserver = null;
        lastObservedFollowLaunch = null;
    }
}

export function setPrivateServerLaunchHook(hook) {
    privateServerLaunchHook = typeof hook === 'function' ? hook : null;
    if (privateServerLaunchHook && !privateServerLaunchObserver) {
        privateServerLaunchObserver = observeGameLaunch((_frame, launch) => {
            if (
                !privateServerLaunchHook ||
                !launch ||
                launch.request !== 'RequestPrivateGame' ||
                !launch.placeId ||
                launch.src === lastObservedPrivateServerLaunch
            ) {
                return;
            }

            lastObservedPrivateServerLaunch = launch.src;
            Promise.resolve()
                .then(() => privateServerLaunchHook?.(launch.placeId))
                .catch((error) => {
                    console.error(
                        'RoValra Launcher: Private server launch hook failed',
                        error,
                    );
                });
        });
    } else if (!privateServerLaunchHook && privateServerLaunchObserver) {
        privateServerLaunchObserver.disconnect();
        privateServerLaunchObserver = null;
        lastObservedPrivateServerLaunch = null;
    }
}

export function parseGameLaunchUrl(src) {
    if (typeof src !== 'string' || !src.includes('placelauncherurl:')) {
        return null;
    }

    try {
        const urlString = src.substring(src.indexOf('placelauncherurl:'));
        const decodedUrl = decodeURIComponent(
            urlString.split('+')[0].substring('placelauncherurl:'.length),
        );
        const params = new URLSearchParams(new URL(decodedUrl).search);

        return {
            src,
            params,
            placeId: params.get('placeId'),
            userId: params.get('userId'),
            request: params.get('request'),
            gameId: params.get('gameId'),
        };
    } catch (error) {
        return null;
    }
}

export async function resolveGameLaunchPlaceId(launch) {
    if (!launch) return null;
    if (launch.placeId) return launch.placeId;
    if (launch.request !== 'RequestFollowUser' || !launch.userId) return null;

    try {
        const data = await callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: [parseInt(launch.userId, 10)] },
        });
        const presence = data?.userPresences?.[0];
        return presence?.rootPlaceId || presence?.placeId || null;
    } catch (error) {
        return null;
    }
}

export function observeGameLaunch(callback) {
    if (typeof callback !== 'function') return { disconnect() {} };

    let active = true;
    const notify = (frame) => {
        if (active) callback(frame, parseGameLaunchUrl(frame?.src));
    };
    const scan = () => {
        const frame = document.querySelector('#gamelaunch');
        if (frame) notify(frame);
    };

    const observer = new MutationObserver(() => scan());
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
    });
    scan();

    return {
        disconnect() {
            if (!active) return;
            active = false;
            observer.disconnect();
        },
    };
}

function runLaunch(placeId, codeToInject) {
    if (!preLaunchHook) {
        executeLaunchScript(codeToInject);
        return;
    }

    Promise.resolve()
        .then(() => preLaunchHook(placeId))
        .catch((error) => {
            console.error('RoValra Launcher: Pre launch hook failed', error);
        })
        .finally(() => executeLaunchScript(codeToInject));
}

function executeLaunchScript(codeToInject) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: 'injectScript', codeToInject });
    } else {
        console.error(
            'RoValra Launcher: Chrome runtime is not available to inject the script.',
        );
    }
}

export function launchGame(placeId, jobId = null) {
    const joinFunction = jobId
        ? `Roblox.GameLauncher.joinGameInstance(parseInt('${placeId}', 10), '${jobId}')`
        : `Roblox.GameLauncher.joinGameInstance(parseInt('${placeId}', 10))`;
    const codeToInject = `if (typeof Roblox?.GameLauncher?.joinGameInstance === 'function') { ${joinFunction}; }`;
    runLaunch(placeId, codeToInject);
}

export function launchPrivateGame(placeId, accessCode, linkCode) {
    const joinFunction = `Roblox.GameLauncher.joinPrivateGame(parseInt('${placeId}', 10), '${accessCode}', '${linkCode}')`;
    const codeToInject = `if (typeof Roblox?.GameLauncher?.joinPrivateGame === 'function') { ${joinFunction}; }`;
    runLaunch(placeId, codeToInject);
}

export function launchMultiplayerGame(placeId, launchData = {}) {
    window.__rovalra_skipNextLaunch = true;

    const joinData = { launchData };
    const codeToInject = `if (typeof Roblox.GameLauncher.joinMultiplayerGame === 'function') { Roblox.GameLauncher.joinMultiplayerGame(${placeId}, false, false, null, null, ${JSON.stringify(joinData)}); }`;
    runLaunch(placeId, codeToInject);
}

export function followUser(userId) {
    const uId = parseInt(userId, 10);
    if (!uId) return;

    const placeLauncherUrl = `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&userId=${uId}&is30=false`;
    const deepLink = `roblox-player:1+launchmode:play+placelauncherurl:${encodeURIComponent(placeLauncherUrl)}`;

    const codeToInject = `
        if (typeof Roblox !== 'undefined' && Roblox.GameLauncher && typeof Roblox.GameLauncher.followPlayerIntoGame === 'function') {
            Roblox.GameLauncher.followPlayerIntoGame(${uId});
        } else {
            window.location.href = '${deepLink}';
        }
    `;

    if (!followUserHook) {
        executeLaunchScript(codeToInject);
        return;
    }

    resolveGameLaunchPlaceId({
        request: 'RequestFollowUser',
        userId: String(uId),
    })
        .then((placeId) => followUserHook(placeId))
        .catch((error) => {
            console.error('RoValra Launcher: Follow user hook failed', error);
        })
        .finally(() => executeLaunchScript(codeToInject));
}

export function openWebChat(userId) {
    const uId = parseInt(userId, 10);
    if (!uId) return;

    const codeToInject = `
        if (typeof Roblox !== 'undefined' && Roblox.DeepLinkService && typeof Roblox.DeepLinkService.navigateToDeepLink === 'function') {
            Roblox.DeepLinkService.navigateToDeepLink('roblox://navigation/chat?userId=${uId}');
        }
    `;
    executeLaunchScript(codeToInject);
}

export async function launchStudioForGame(placeId) {
    try {
        const gameDetails = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${placeId}`,
        });

        if (
            gameDetails &&
            gameDetails.length > 0 &&
            gameDetails[0].universeId
        ) {
            const universeId = gameDetails[0].universeId;
            const editFunction = `Roblox.GameLauncher.editGameInStudio(${placeId}, ${universeId})`;
            const codeToInject = `if (typeof Roblox?.GameLauncher?.editGameInStudio === 'function') { ${editFunction}; }`;
            executeLaunchScript(codeToInject);
        } else {
            throw new Error(
                `Could not retrieve universeId for placeId ${placeId}`,
            );
        }
    } catch (error) {
        console.error(
            'RoValra Launcher: Failed to launch studio with universeId, falling back.',
            error,
        );
        const uri = `roblox-studio:launchmode:edit+task:EditPlace+placeId:${placeId}`;
        const codeToInject = `window.location.href = '${uri}';`;
        executeLaunchScript(codeToInject);
    }
}

export function launchDeeplink(url) {
    const safeUrl = url.replace(/'/g, "\\'");
    const codeToInject = `if (typeof Roblox?.GameLauncher?.openProtocolUrl === 'function') { Roblox.GameLauncher.openProtocolUrl('${safeUrl}'); } else { window.location.href = '${safeUrl}'; }`;
    executeLaunchScript(codeToInject);
}
