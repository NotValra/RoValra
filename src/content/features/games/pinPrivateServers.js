import { observeElement } from '../../core/observer.js';
import { Icon } from '../../core/ui/buildericon.js';
import { settings } from '../../core/settings/getSettings.js';
import { t } from '../../core/locale/i18n.js';

const SETTING_NAME = 'PinPrivateServersEnabled';
const MASTER_SETTING_NAME =
    'ServerlistmodificationsEnabled';

const STORAGE_KEY =
    'rovalra_pinned_private_servers';

const PRIVATE_SERVER_ROW_SELECTOR = [
    '.rbx-private-game-server-item',
    '.flex.items-center.justify-between.padding-y-medium.width-full',
].join(',');

const PIN_BUTTON_SELECTOR =
    '[data-rovalra-pin-private-server]';

const PIN_WRAPPER_CLASS =
    'rovalra-pin-private-server-wrapper';

const PINNED_CLASS =
    'rovalra-private-server-pinned';

const CONTAINER_CLASS =
    'rovalra-private-server-pin-container';

const CREATE_ROW_CLASS =
    'rovalra-private-server-create-row';

let pinnedServerIds = new Set();

let featureEnabled = false;
let masterEnabled = true;
let enabled = false;

let observersRegistered = false;
let storageListenerRegistered = false;
let settingListenerRegistered = false;
let extractionListenerRegistered = false;

function loadPinnedServers() {
    return new Promise((resolve) => {
        chrome.storage.local.get(
            {
                [STORAGE_KEY]: [],
            },
            (data) => {
                const stored =
                    data?.[STORAGE_KEY];

                resolve(
                    new Set(
                        Array.isArray(stored)
                            ? stored.map(String)
                            : [],
                    ),
                );
            },
        );
    });
}

function savePinnedServers() {
    return new Promise((resolve) => {
        chrome.storage.local.set(
            {
                [STORAGE_KEY]: [
                    ...pinnedServerIds,
                ],
            },
            resolve,
        );
    });
}

function getPrivateServerId(row) {
    const privateServerId =
        row.getAttribute(
            'data-private-server-id',
        );

    if (!privateServerId) {
        return null;
    }

    if (
        row.matches(
            [
                '.rbx-friends-game-server-item',
                '.rbx-public-game-server-item',
            ].join(','),
        )
    ) {
        return null;
    }

    if (
        row.closest(
            [
                '#rbx-friends-running-games',
                '[data-rovalra-section-type="friends"]',
                '#rbx-public-running-games',
                '[data-rovalra-section-type="public"]',
            ].join(','),
        )
    ) {
        return null;
    }

    return String(privateServerId);
}

function getNativeJoinButton(row) {
    return (
        row.querySelector(
            '[data-rovalra-join-button="true"]',
        ) ||
        row.querySelector(
            '.game-server-join-btn',
        ) ||
        row.querySelector(
            [
                'button:not(',
                '[data-rovalra-hide-private-server]',
                '):not(',
                '[data-rovalra-pin-private-server]',
                ')',
            ].join(''),
        )
    );
}

function getButtonContainer(
    row,
    nativeButton,
) {
    if (!nativeButton) {
        return null;
    }

    return (
        nativeButton.closest(
            [
                '.flex.items-center.gap-small.grow-0.shrink-0.basis-auto',
                '.flex.flex-col.items-center.gap-xsmall.grow-0.shrink-0.basis-auto',
            ].join(','),
        ) ||
        nativeButton.parentElement ||
        row
    );
}

function markContainer(row) {
    const container = row.parentElement;

    if (!container) {
        return;
    }

    container.classList.add(
        CONTAINER_CLASS,
    );

    const rows = Array.from(
        container.children,
    ).filter((child) =>
        child.matches(
            PRIVATE_SERVER_ROW_SELECTOR,
        ),
    );

    rows.forEach((child) => {
        child.classList.remove(
            CREATE_ROW_CLASS,
        );
    });

    const createRow = rows.find(
        (child) =>
            !child.hasAttribute(
                'data-private-server-id',
            ),
    );

    if (createRow) {
        createRow.classList.add(
            CREATE_ROW_CLASS,
        );
    }
}

async function updatePinButton(
    button,
    privateServerId,
) {
    const isPinned =
        pinnedServerIds.has(
            privateServerId,
        );

    const label = await t(
        isPinned
            ? 'serverList.unpinPrivateServer'
            : 'serverList.pinPrivateServer',
    );

    button.setAttribute(
        'aria-pressed',
        String(isPinned),
    );

    button.setAttribute(
        'aria-label',
        label,
    );

    button.title = label;

    button.classList.toggle(
        'rovalra-pin-private-server-active',
        isPinned,
    );

    const icon =
        button.querySelector('icon');

    if (icon) {
        icon.toggleAttribute(
            'filled',
            isPinned,
        );
    }
}

async function togglePin(
    privateServerId,
) {
    if (
        pinnedServerIds.has(
            privateServerId,
        )
    ) {
        pinnedServerIds.delete(
            privateServerId,
        );
    } else {
        pinnedServerIds.add(
            privateServerId,
        );
    }

    await savePinnedServers();

    applyAllRows();
}

async function addPinButton(
    row,
    privateServerId,
) {
    const existingButton =
        row.querySelector(
            PIN_BUTTON_SELECTOR,
        );

    if (existingButton) {
        await updatePinButton(
            existingButton,
            privateServerId,
        );

        return;
    }

    if (
        row.dataset
            .rovalraPinPrivatePending ===
        'true'
    ) {
        return;
    }

    row.dataset.rovalraPinPrivatePending =
        'true';

    try {
        const nativeButton =
            getNativeJoinButton(row);

        if (!nativeButton) {
            return;
        }

        const buttonContainer =
            getButtonContainer(
                row,
                nativeButton,
            );

        if (!buttonContainer) {
            return;
        }

        const wrapper =
            nativeButton.parentElement
                ?.cloneNode(false);

        if (!wrapper) {
            return;
        }

        const pinButton =
            nativeButton.cloneNode(true);

        const content =
            pinButton.querySelector(
                '.flex.items-center.min-width-0.gap-xsmall',
            );

        if (!content) {
            return;
        }

        wrapper.className = [
            'grow-0',
            'shrink-0',
            'basis-auto',
            PIN_WRAPPER_CLASS,
        ].join(' ');

        pinButton.classList.remove(
            'width-full',
            'padding-x-small',
            'bg-action-soft-emphasis',
            'content-action-soft-emphasis',
        );

        pinButton.classList.add(
            'width-[40px]',
            'padding-x-none',
            'bg-action-standard',
            'content-action-standard',
            'rovalra-pin-private-server-button',
        );

        pinButton.removeAttribute(
            'data-rovalra-join-button',
        );

        pinButton.setAttribute(
            'data-rovalra-pin-private-server',
            'true',
        );

        content.replaceChildren(
            Icon({
                icon: 'push_pin',
                material: true,
                size: 'medium',
            }),
        );

        pinButton.addEventListener(
            'click',
            async (event) => {
                event.preventDefault();
                event.stopPropagation();

                await togglePin(
                    privateServerId,
                );
            },
        );

        await updatePinButton(
            pinButton,
            privateServerId,
        );

        wrapper.appendChild(
            pinButton,
        );

        buttonContainer.appendChild(
            wrapper,
        );
    } finally {
        delete row.dataset
            .rovalraPinPrivatePending;
    }
}

function removePinButton(row) {
    const button =
        row.querySelector(
            PIN_BUTTON_SELECTOR,
        );

    if (!button) {
        return;
    }

    const wrapper =
        button.closest(
            `.${PIN_WRAPPER_CLASS}`,
        );

    if (wrapper) {
        wrapper.remove();
    } else {
        button.remove();
    }
}

function applyToRow(row) {
    if (!enabled) {
        removePinButton(row);

        row.classList.remove(
            PINNED_CLASS,
        );

        return;
    }

    const privateServerId =
        getPrivateServerId(row);

    if (!privateServerId) {
        removePinButton(row);

        row.classList.remove(
            PINNED_CLASS,
        );

        return;
    }

    markContainer(row);

    row.classList.toggle(
        PINNED_CLASS,
        pinnedServerIds.has(
            privateServerId,
        ),
    );

    addPinButton(
        row,
        privateServerId,
    ).catch(() => {});
}

function applyAllRows() {
    document
        .querySelectorAll(
            PRIVATE_SERVER_ROW_SELECTOR,
        )
        .forEach(applyToRow);
}

function removeUi() {
    document
        .querySelectorAll(
            PIN_BUTTON_SELECTOR,
        )
        .forEach((button) => {
            const wrapper =
                button.closest(
                    `.${PIN_WRAPPER_CLASS}`,
                );

            if (wrapper) {
                wrapper.remove();
            } else {
                button.remove();
            }
        });

    document
        .querySelectorAll(
            `.${PINNED_CLASS}`,
        )
        .forEach((row) => {
            row.classList.remove(
                PINNED_CLASS,
            );
        });

    document
        .querySelectorAll(
            `.${CREATE_ROW_CLASS}`,
        )
        .forEach((row) => {
            row.classList.remove(
                CREATE_ROW_CLASS,
            );
        });

    document
        .querySelectorAll(
            `.${CONTAINER_CLASS}`,
        )
        .forEach((container) => {
            container.classList.remove(
                CONTAINER_CLASS,
            );
        });
}

function refreshEnabledState() {
    enabled =
        featureEnabled &&
        masterEnabled;

    if (!enabled) {
        removeUi();
        return;
    }

    applyAllRows();
}

function registerObservers() {
    if (observersRegistered) {
        return;
    }

    observersRegistered = true;

    observeElement(
        PRIVATE_SERVER_ROW_SELECTOR,
        (row) => {
            applyToRow(row);
        },
        {
            multiple: true,
        },
    );
}

function registerExtractionListener() {
    if (extractionListenerRegistered) {
        return;
    }

    extractionListenerRegistered = true;

    window.addEventListener(
        'rovalra-serverid-extracted',
        (event) => {
            const extractionId =
                event.detail?.extractionId;

            const privateServerId =
                event.detail?.privateServerId;

            if (
                !extractionId ||
                !privateServerId
            ) {
                return;
            }

            const row =
                document.querySelector(
                    `[data-rovalra-extraction-id="${extractionId}"]`,
                );

            if (!row) {
                return;
            }

            queueMicrotask(() => {
                applyToRow(row);
            });
        },
    );
}

function registerSettingListener() {
    if (settingListenerRegistered) {
        return;
    }

    settingListenerRegistered = true;

    document.addEventListener(
        'rovalra:settingSaved',
        (event) => {
            const name =
                event.detail?.name;

            const value =
                event.detail?.value;

            if (
                name ===
                SETTING_NAME
            ) {
                featureEnabled =
                    value === true;

                refreshEnabledState();
            }

            if (
                name ===
                MASTER_SETTING_NAME
            ) {
                masterEnabled =
                    value !== false;

                refreshEnabledState();
            }
        },
    );
}

function registerStorageListener() {
    if (storageListenerRegistered) {
        return;
    }

    storageListenerRegistered = true;

    chrome.storage.onChanged.addListener(
        (changes, areaName) => {
            if (
                areaName !== 'local'
            ) {
                return;
            }

            if (changes[STORAGE_KEY]) {
                const stored =
                    changes[
                        STORAGE_KEY
                    ].newValue;

                pinnedServerIds =
                    new Set(
                        Array.isArray(stored)
                            ? stored.map(String)
                            : [],
                    );

                if (enabled) {
                    applyAllRows();
                }
            }

            if (changes[SETTING_NAME]) {
                featureEnabled =
                    changes[
                        SETTING_NAME
                    ].newValue === true;

                refreshEnabledState();
            }

            if (
                changes[
                    MASTER_SETTING_NAME
                ]
            ) {
                masterEnabled =
                    changes[
                        MASTER_SETTING_NAME
                    ].newValue !== false;

                refreshEnabledState();
            }
        },
    );
}

export async function init() {
    registerObservers();
    registerExtractionListener();
    registerSettingListener();
    registerStorageListener();

    pinnedServerIds =
        await loadPinnedServers();

    featureEnabled =
        (await settings[
            SETTING_NAME
        ]) === true;

    masterEnabled =
        (await settings[
            MASTER_SETTING_NAME
        ]) !== false;

    refreshEnabledState();
}