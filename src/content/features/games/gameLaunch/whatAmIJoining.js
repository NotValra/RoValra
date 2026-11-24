import { settings } from '../../../core/settings/getSettings.js';
import { t } from '../../../core/locale/i18n.js';
import {
    addGameLaunchHook,
    resolveGameLaunchPlaceId,
} from '../../../core/utils/launcher.js';
import { fetchServerDetails } from '../../../core/apis/serverApi.js';
import { openJoinDialog } from '../../../core/games/joinDialog/joinDialog.js';
import {
    getLaunchType,
    fetchPlaceDetails,
    fetchJoinInfo,
    resolveServerRegion,
    fetchPrivateServerOwner,
} from '../../../core/games/joinDialog/joinInfo.js';
import { getCustomLaunchLogo } from './revertLogo.js';

async function handleGameLaunch(launch) {
    const dialog = openJoinDialog({
        customLogo: await getCustomLaunchLogo(),
        closeOnBackgroundClick: await settings.closeUiByClickingTheBackground,
    });

    if (!launch) {
        dialog.showClosableResult(await t('revertLogo.errorParsingUrl'));
        return;
    }

    const launchType = getLaunchType(launch);

    let placeId = launch.placeId;
    if (!placeId && launchType.isFollowingUser && launchType.userId) {
        dialog.setStatus(await t('revertLogo.findingUser'));
        placeId = await resolveGameLaunchPlaceId(launch);
    }

    const placeDetailsPromise = fetchPlaceDetails(placeId);

    let joinResponse = null;
    if (await settings.AlwaysGetInfo) {
        dialog.setStatus(await t('revertLogo.fetchingServerInfo'));
        const result = await fetchJoinInfo({
            placeId,
            launchType,
            isActive: () => dialog.isActive,
        });

        if (result.blockedMessage) {
            dialog.showClosableResult(result.blockedMessage);
            return;
        }
        joinResponse = result.joinResponse;
    }

    if (!dialog.isActive) return;

    try {
        const joinScript = joinResponse?.joinScript;
        const serverId = joinScript?.GameId || launchType.serverId;

        const [owner, region] = await Promise.all([
            fetchPrivateServerOwner(joinScript?.PrivateServerOwnerID),
            resolveServerRegion(joinResponse),
            serverId && placeId
                ? fetchServerDetails(placeId, [serverId])
                : null,
        ]);
        const placeDetails = await placeDetailsPromise;

        dialog.setServerInfo({
            gameName: placeDetails.name,
            iconUrl: placeDetails.iconUrl,
            details: {
                serverId,
                isPrivateServer: launchType.isPrivateServer,
                owner,
                regionCode: region.regionCode,
                regionName: region.regionName,
                placeVersion: joinScript?.PlaceVersion,
                channel: joinScript?.ChannelName,
                rccVersion: joinScript?.RccVersion,
            },
        });
        dialog.setStatus(
            await t(
                joinScript
                    ? 'revertLogo.joiningServer'
                    : 'revertLogo.waitingForRoblox',
            ),
        );
    } catch (e) {
        console.error('RoValra: Failed to show server info', e);
        const placeDetails = await placeDetailsPromise;
        dialog.setServerInfo({
            gameName: placeDetails.name,
            iconUrl: placeDetails.iconUrl,
        });
        dialog.setStatus(await t('revertLogo.launching'));
    }

    dialog.watchForLaunch(placeId);
}

export async function init() {
    if (!(await settings.whatamIJoiningEnabled)) return;

    addGameLaunchHook(handleGameLaunch);
}
