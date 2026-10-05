import { callRobloxApiJson } from '../../core/api.js';
import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { Icon } from '../../core/ui/buildericon.js';
import { t } from '../../core/locale/i18n.js';
import { setLaunchGuard } from '../../core/utils/launcher.js';

const SETTING_NAME = 'PlayGuardEnabled';

const PRESENCE_FRESH_MS = 2500;
const PRESENCE_POLL_MS = 8000;

const LOCKABLE_PLAY_SELECTOR = [
    '.play-game-button',
    '.btn-common-play-game-lg',
    '[data-testid="play-button"]',
    '.play-button-overlay button',

    '.rovalra-quick-play-btn',
    '.private-server-join-btn',
    '.game-server-join-btn',
    '[data-rovalra-join-button="true"]',
].join(',');

const NATIVE_PLAY_SELECTOR = [
    '.play-game-button',
    '.btn-common-play-game-lg',
    '[data-testid="play-button"]',
    '.play-button-overlay button',
].join(',');

const IGNORE_SELECTOR = [
    '.group-join-button',
    '.notification-option',
    '.favorite-button',
    '[data-testid="group-button"]',
].join(',');

const LOCK_CLASS =
    'rovalra-play-guard-active';

const LOCK_ICON_CLASS =
    'rovalra-play-guard-lock-icon';

let featureEnabled = false;

let inGame = false;
let lastPresenceCheck = 0;
let presenceRequest = null;

let pollTimer = null;

let observersRegistered = false;
let listenersRegistered = false;

let nativeClickBusy = false;
let activePromptPromise = null;

const nativeBypassButtons =
    new WeakSet();

let allowNextLauncherRequest = false;
let launcherBypassTimer = null;

function isGuardActive() {
    return featureEnabled;
}

function isEligiblePlayButton(button) {
    if (
        !(button instanceof HTMLElement)
    ) {
        return false;
    }

    if (
        button.matches(
            ':disabled, [aria-disabled="true"]',
        )
    ) {
        return false;
    }

    if (
        button.closest(
            IGNORE_SELECTOR,
        )
    ) {
        return false;
    }

    return true;
}

function setButtonLocked(
    button,
    locked,
) {
    if (
        !isEligiblePlayButton(button)
    ) {
        return;
    }

    const existingLock =
        button.querySelector(
            `.${LOCK_ICON_CLASS}`,
        );

    if (!locked) {
        button.classList.remove(
            LOCK_CLASS,
        );

        existingLock?.remove();

        return;
    }

    button.classList.add(
        LOCK_CLASS,
    );

    if (existingLock) {
        return;
    }

    const lockIcon = Icon({
        icon: 'lock',
        material: true,
        size: 'medium',
        classes: LOCK_ICON_CLASS,
    });

    lockIcon.setAttribute(
        'aria-hidden',
        'true',
    );

    button.appendChild(
        lockIcon,
    );
}

function refreshButtonState() {
    const locked =
        isGuardActive() &&
        inGame;

    document
        .querySelectorAll(
            LOCKABLE_PLAY_SELECTOR,
        )
        .forEach((button) => {
            setButtonLocked(
                button,
                locked,
            );
        });
}

async function checkPresence(
    force = false,
) {
    if (!isGuardActive()) {
        return false;
    }

    if (
        !force &&
        Date.now() -
            lastPresenceCheck <
            PRESENCE_FRESH_MS
    ) {
        return inGame;
    }

    if (presenceRequest) {
        return presenceRequest;
    }

    presenceRequest =
        (async () => {
            const userId =
                await getAuthenticatedUserId();

            if (!userId) {
                inGame = false;

                refreshButtonState();

                return false;
            }

            const data =
                await callRobloxApiJson({
                    subdomain:
                        'presence',
                    endpoint:
                        '/v1/presence/users',
                    method: 'POST',
                    body: {
                        userIds: [
                            Number(
                                userId,
                            ),
                        ],
                    },
                });

            const presence =
                data
                    ?.userPresences
                    ?.[0];

            inGame =
                presence
                    ?.userPresenceType ===
                    2 ||
                presence
                    ?.userPresenceType ===
                    4;

            lastPresenceCheck =
                Date.now();

            refreshButtonState();

            return inGame;
        })()
            .catch((error) => {
                /*
                 * Fail open. If Roblox presence
                 * cannot be checked, never block
                 * the user from launching.
                 */
                console.warn(
                    'RoValra Play Guard: Presence check failed',
                    error,
                );

                inGame = false;

                lastPresenceCheck =
                    Date.now();

                refreshButtonState();

                return false;
            })
            .finally(() => {
                presenceRequest = null;
            });

    return presenceRequest;
}

function syncPresencePolling() {
    if (pollTimer) {
        clearInterval(
            pollTimer,
        );

        pollTimer = null;
    }

    if (!isGuardActive()) {
        return;
    }

    if (
        document.visibilityState ===
        'visible'
    ) {
        checkPresence(
            true,
        );
    }

    pollTimer = setInterval(
        () => {
            if (
                document
                    .visibilityState !==
                    'visible' ||
                !isGuardActive()
            ) {
                return;
            }

            checkPresence(
                true,
            );
        },
        PRESENCE_POLL_MS,
    );
}

async function buildWarningPrompt() {
    const [
        title,
        description,
        launchAnywayLabel,
        cancelLabel,
    ] = await Promise.all([
        t('playGuard.title'),
        t('playGuard.description'),
        t('playGuard.launchAnyway'),
        t('common.cancel'),
    ]);

    return new Promise(
        (resolve) => {
            let settled = false;
            let overlayHandle = null;

            const finish = (
                result,
            ) => {
                if (settled) {
                    return;
                }

                settled = true;

                resolve(result);

                overlayHandle
                    ?.close();
            };

            const body =
                document.createElement(
                    'div',
                );

            body.className =
                'rovalra-play-guard-body';

            const iconContainer =
                document.createElement(
                    'div',
                );

            iconContainer.className =
                'rovalra-play-guard-icon';

            iconContainer.appendChild(
                Icon({
                    icon: 'lock',
                    material: true,
                    size: 'large',
                }),
            );

            const heading =
                document.createElement(
                    'h3',
                );

            heading.className =
                'rovalra-play-guard-title';

            heading.textContent =
                title;

            const descriptionElement =
                document.createElement(
                    'p',
                );

            descriptionElement.className =
                'rovalra-play-guard-description';

            descriptionElement.textContent =
                description;

            const launchButton =
                createButton(
                    launchAnywayLabel,
                    'primary',
                );

            launchButton.classList.add(
                'rovalra-play-guard-button',
            );

            const cancelButton =
                createButton(
                    cancelLabel,
                    'secondary',
                );

            cancelButton.classList.add(
                'rovalra-play-guard-button',
            );

            body.append(
                iconContainer,
                heading,
                descriptionElement,
                launchButton,
                cancelButton,
            );

            overlayHandle =
                createOverlay({
                    title,
                    bodyContent:
                        body,
                    maxWidth:
                        '380px',
                    preventBackdropClose:
                        false,
                    onClose: () => {
                        if (
                            settled
                        ) {
                            return;
                        }

                        settled = true;

                        resolve(
                            false,
                        );
                    },
                });

            overlayHandle
                .overlay
                .classList.add(
                    'rovalra-play-guard-overlay',
                );

            launchButton.addEventListener(
                'click',
                () => {
                    finish(
                        true,
                    );
                },
            );

            cancelButton.addEventListener(
                'click',
                () => {
                    finish(
                        false,
                    );
                },
            );
        },
    );
}

function requestLaunchConfirmation() {
    if (activePromptPromise) {
        return activePromptPromise;
    }

    activePromptPromise =
        buildWarningPrompt()
            .catch((error) => {
                console.error(
                    'RoValra Play Guard: Failed to show warning',
                    error,
                );

                return true;
            })
            .finally(() => {
                activePromptPromise =
                    null;
            });

    return activePromptPromise;
}

function clearLauncherBypass() {
    allowNextLauncherRequest =
        false;

    if (launcherBypassTimer) {
        clearTimeout(
            launcherBypassTimer,
        );

        launcherBypassTimer =
            null;
    }
}

function armLauncherBypass() {
    clearLauncherBypass();

    allowNextLauncherRequest =
        true;

    /*
     * Some modified native Play buttons eventually
     * reach RoValra's launcher asynchronously.
     * Keep one bypass available briefly so the same
     * user click cannot trigger Play Guard twice.
     */
    launcherBypassTimer =
        setTimeout(
            clearLauncherBypass,
            1500,
        );
}

async function handleLauncherRequest() {
    if (
        allowNextLauncherRequest
    ) {
        clearLauncherBypass();

        return true;
    }

    if (!isGuardActive()) {
        return true;
    }

    const currentlyInGame =
        await checkPresence();

    if (!currentlyInGame) {
        return true;
    }

    return requestLaunchConfirmation();
}

function replayNativeButton(
    button,
) {
    nativeBypassButtons.add(
        button,
    );

    armLauncherBypass();

    button.click();

    queueMicrotask(() => {
        nativeBypassButtons.delete(
            button,
        );
    });
}

function handleNativeClick(event) {
    if (
        !isGuardActive() ||
        !(event.target instanceof Element)
    ) {
        return;
    }

    const button =
        event.target.closest(
            NATIVE_PLAY_SELECTOR,
        );

    if (
        !button ||
        !isEligiblePlayButton(
            button,
        )
    ) {
        return;
    }

    if (
        nativeBypassButtons.has(
            button,
        )
    ) {
        nativeBypassButtons.delete(
            button,
        );

        return;
    }

    if (
        Date.now() -
            lastPresenceCheck <
            PRESENCE_FRESH_MS &&
        !inGame
    ) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (nativeClickBusy) {
        return;
    }

    nativeClickBusy = true;

    Promise.resolve()
        .then(async () => {
            const currentlyInGame =
                await checkPresence();

            if (
                !currentlyInGame
            ) {
                replayNativeButton(
                    button,
                );

                return;
            }

            const allowed =
                await requestLaunchConfirmation();

            if (allowed) {
                replayNativeButton(
                    button,
                );
            }
        })
        .finally(() => {
            nativeClickBusy =
                false;
        });
}

function registerObservers() {
    if (observersRegistered) {
        return;
    }

    observersRegistered = true;

    observeElement(
        LOCKABLE_PLAY_SELECTOR,
        (button) => {
            setButtonLocked(
                button,
                isGuardActive() &&
                    inGame,
            );
        },
        {
            multiple: true,
        },
    );
}

function registerListeners() {
    if (listenersRegistered) {
        return;
    }

    listenersRegistered = true;

    window.addEventListener(
        'click',
        handleNativeClick,
        true,
    );

    document.addEventListener(
        'visibilitychange',
        () => {
            if (
                document
                    .visibilityState ===
                    'visible' &&
                isGuardActive()
            ) {
                checkPresence(
                    true,
                );
            }
        },
    );

    document.addEventListener(
        'rovalra:settingSaved',
        (event) => {
            if (
                event.detail
                    ?.name !==
                SETTING_NAME
            ) {
                return;
            }

            featureEnabled =
                event.detail
                    ?.value ===
                true;

            applyFeatureState();
        },
    );

    chrome.storage.onChanged.addListener(
        (
            changes,
            areaName,
        ) => {
            if (
                areaName !==
                    'local' ||
                !changes[
                    SETTING_NAME
                ]
            ) {
                return;
            }

            featureEnabled =
                changes[
                    SETTING_NAME
                ].newValue === true;

            applyFeatureState();
        },
    );
}

function applyFeatureState() {
    setLaunchGuard(
        isGuardActive()
            ? handleLauncherRequest
            : null,
    );

    if (!isGuardActive()) {
        clearLauncherBypass();

        inGame = false;
    }

    refreshButtonState();
    syncPresencePolling();
}

export async function init() {
    registerObservers();
    registerListeners();

    featureEnabled =
        (await settings[
            SETTING_NAME
        ]) === true;

    applyFeatureState();

    if (isGuardActive()) {
        checkPresence(
            true,
        );
    }
}