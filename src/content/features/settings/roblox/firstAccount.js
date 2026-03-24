import * as storage from "../../../core/chrome/localStorage.js";
import { observeElement } from '../../../core/observer.js';
import { getAssets } from '../../../core/assets.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { ts } from '../../../core/locale/i18n.js';

function createFirstAccountElement(isFirst, creationTimestamp) {
    const container = document.createElement('div');
    container.className =
        'form-group settings-text-field-container rovalra-first-account';

    const textField = document.createElement('div');
    textField.className = 'account-settings-text-field';

    const label = document.createElement('span');
    label.className = 'text-title-large account-info-inline-label';
    label.textContent = ts('firstAccount.label');

    const valueContainer = document.createElement('div');
    valueContainer.className = 'settings-text-lines-container';

    const valueMetaContainer = document.createElement('div');
    valueMetaContainer.className = 'account-settings-value-metadata-container';
    valueMetaContainer.style.display = 'flex';
    valueMetaContainer.style.alignItems = 'center';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'settings-text-span-visible text-body-medium';
    valueSpan.textContent = isFirst
        ? ts('firstAccount.yes')
        : ts('firstAccount.no');

    valueMetaContainer.appendChild(valueSpan);

    const assets = getAssets();
    const icon = document.createElement('div');
    Object.assign(icon.style, {
        width: '16px',
        height: '16px',
        marginLeft: '4px',
        cursor: 'help',
        display: 'inline-block',
        backgroundColor: 'var(--rovalra-secondary-text-color)',
        webkitMask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
        mask: `url("${assets.priceFloorIcon}") no-repeat center / contain`,
    });

    let tooltipText = ts('firstAccount.tooltip');
    if (creationTimestamp) {
        const date = new Date(parseInt(creationTimestamp, 10));
        tooltipText += `<br>${ts('firstAccount.createdDate', { date: date.toLocaleDateString() })}`;
    }

    addTooltip(icon, tooltipText, { position: 'top' });
    valueMetaContainer.appendChild(icon);

    valueContainer.appendChild(valueMetaContainer);
    textField.appendChild(label);
    textField.appendChild(valueContainer);
    container.appendChild(textField);

    return container;
}

export function init() {
    if (!window.location.pathname.startsWith('/my/account')) {
        return;
    }

    storage.get({ firstAccountEnabled: true }).then((result) => {
        if (!result.firstAccountEnabled) return;

        observeElement(
            'h2.setting-section-header',
            async (header) => {
                if (header.textContent.trim() === 'Login Methods') {
                    const section = header.closest('.setting-section');
                    if (
                        section &&
                        !section.querySelector('.rovalra-first-account')
                    ) {
                        const userId = await getAuthenticatedUserId();
                        if (!userId) return;

                        const STORAGE_KEY = 'rovalra_first_account_cache';

                        storage.get([STORAGE_KEY]).then((result) => {
                            const allCache = result[STORAGE_KEY] || {};
                            const userCache = allCache[userId];
                            const now = Date.now();

                            const render = (isFirst, creationTimestamp) => {
                                if (
                                    !section.querySelector(
                                        '.rovalra-first-account',
                                    )
                                ) {
                                    const element = createFirstAccountElement(
                                        isFirst,
                                        creationTimestamp,
                                    );

                                    const contentContainer =
                                        section.querySelector(
                                            '.section-content',
                                        ) || section;
                                    contentContainer.appendChild(element);
                                }
                            };

                            if (
                                userCache &&
                                now - userCache.timestamp < 3600000
                            ) {
                                render(
                                    userCache.isOriginalUser,
                                    userCache.originalAccountCreationTimestampMs,
                                );
                                return;
                            }

                            fetch(
                                'https://apis.roblox.com/player-hydration-service/v1/players/signed',
                                {
                                    method: 'GET',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    credentials: 'include',
                                },
                            ) //Verified
                                // Stupid api yall dont even wanna know.
                                .then((res) => {
                                    if (!res.ok) throw new Error('API failed');
                                    return res.json();
                                })
                                .then((data) => {
                                    if (data && data.playerInfo) {
                                        const isOriginalUser =
                                            data.playerInfo.isOriginalUser;
                                        const creationTimestamp =
                                            data.playerInfo
                                                .originalAccountCreationTimestampMs;

                                        storage.get([STORAGE_KEY]).then((latestResult) => {
                                            const currentCache =
                                                latestResult[STORAGE_KEY] ||
                                                {};
                                            currentCache[userId] = {
                                                isOriginalUser,
                                                originalAccountCreationTimestampMs:
                                                    creationTimestamp,
                                                timestamp: Date.now(),
                                            };
                                            storage.set({
                                                [STORAGE_KEY]: currentCache,
                                            });
                                        });
                                        render(
                                            isOriginalUser,
                                            creationTimestamp,
                                        );
                                    }
                                })
                                .catch((err) => {
                                    console.error(
                                        'RoValra: Failed to get first account info',
                                        err,
                                    );
                                });
                        });
                    }
                }
            },
            { multiple: true },
        );
    });
}
