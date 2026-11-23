import {
    showLoadingOverlay,
    hideLoadingOverlay,
    updateLoadingOverlayText,
    updateServerInfo,
    showLoadingOverlayResult,
    showLoadingOverlaySpinner,
} from '../../ui/startModal/gamelaunchmodal.js';
import { buildServerInfoList } from './serverInfoList.js';
import { watchClientLaunch } from './clientLaunchWatcher.js';
import { showDownloadDialog } from './downloadDialog.js';
import { launchGame } from '../../utils/launcher.js';
import { ts } from '../../locale/i18n.js';

const HIDE_ROBLOX_UI_CLASS = 'rovalra-hide-roblox-dialogs';

let currentDialog = null;

class JoinDialog {
    #active = true;
    #cleanups = new Set();

    get isActive() {
        return this.#active;
    }

    addCleanup(fn) {
        if (!this.#active) {
            fn();
            return;
        }
        this.#cleanups.add(fn);
    }

    setStatus(text) {
        if (this.#active) updateLoadingOverlayText(text);
    }

    setServerInfo({ gameName, iconUrl, details } = {}) {
        if (!this.#active) return;

        if (!details) {
            updateServerInfo(gameName, iconUrl, null);
            return;
        }

        const { items, startLiveUpdates } = buildServerInfoList(details);
        updateServerInfo(gameName, iconUrl, items);
        this.addCleanup(startLiveUpdates());
    }

    showResult(message, button) {
        if (this.#active) showLoadingOverlayResult(message, button);
    }

    showClosableResult(message) {
        this.showResult(message, {
            text: ts('revertLogo.close'),
            onClick: () => this.close(),
        });
    }

    watchForLaunch(placeId) {
        if (!this.#active) return;

        const stopWatching = watchClientLaunch({
            placeId,
            onLaunched: () => this.showClosableResult(ts('revertLogo.haveFun')),
            onClientMissing: () => this.#offerDownload(placeId),
            onClientFound: () => {
                if (!this.#active) return;
                showLoadingOverlaySpinner();
                this.setStatus(ts('revertLogo.joiningServer'));
            },
        });
        this.addCleanup(stopWatching);
    }

    #offerDownload(placeId) {
        this.showResult(ts('revertLogo.launchingRoblox'), {
            text: ts('revertLogo.downloadRoblox'),
            emphasis: true,
            onClick: () => {
                hideLoadingOverlay(true);
                const removeDownloadDialog = showDownloadDialog({
                    onClose: () => this.close(),
                    onJoin: () => {
                        this.close();
                        if (placeId) launchGame(placeId);
                    },
                });
                this.addCleanup(removeDownloadDialog);
            },
        });
    }

    close() {
        if (!this.#active) return;
        this.#active = false;

        for (const cleanup of this.#cleanups) {
            try {
                cleanup();
            } catch (e) {
                console.error('RoValra: Join dialog cleanup failed', e);
            }
        }
        this.#cleanups.clear();

        if (currentDialog === this) {
            currentDialog = null;
            document.body.classList.remove(HIDE_ROBLOX_UI_CLASS);
            hideLoadingOverlay(true);
        }
    }
}

export function openJoinDialog({
    customLogo = null,
    closeOnBackgroundClick = false,
    onClose,
} = {}) {
    currentDialog?.close();

    const dialog = new JoinDialog();
    currentDialog = dialog;
    document.body.classList.add(HIDE_ROBLOX_UI_CLASS);

    showLoadingOverlay(
        () => {
            if (!dialog.isActive) return;
            dialog.close();
            onClose?.();
        },
        customLogo,
        closeOnBackgroundClick,
    );

    return dialog;
}

export function closeJoinDialog() {
    currentDialog?.close();
}

export function getOpenJoinDialog() {
    return currentDialog;
}
