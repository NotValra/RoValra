import * as storage from "../../core/chrome/localStorage.js";
import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createButton } from '../../core/ui/buttons.js';
import { callRobloxApi } from '../../core/api.js';
import { getAssets } from '../../core/assets.js';
import { fetchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { safeHtml } from '../../core/packages/dompurify';
import { ts } from '../../core/locale/i18n.js';

const INACTIVE_MAIN_BUTTON_ID = 'rovalra-bulk-inactivate-btn';
const SET_INACTIVE_BTN_ID = 'rovalra-set-inactive-btn';
const ACTIVE_MAIN_BUTTON_ID = 'rovalra-bulk-activate-btn';
const SET_ACTIVE_BTN_ID = 'rovalra-set-active-btn';
const SELECT_ALL_BTN_ID = 'rovalra-select-all-btn';

const FILTERED_LIST_ID = 'rovalra-filtered-assets-list';
const PROGRESS_TEXT_ID = 'rovalra-progress-text';
const PROGRESS_RESULTS_ID = 'rovalra-progress-results';
const LOADING_SPINNER_ID = 'rovalra-loading-spinner';

let isFilteredInactive = false;
let isFilteredActive = false;

async function processServerRequest(selectedItems, isActive) {
    let isCancelled = false;

    const bodyContent = document.createElement('div');
    bodyContent.style.textAlign = 'center';
    bodyContent.innerHTML = `
        <div id="${PROGRESS_TEXT_ID}">${ts('privateServer.starting')}</div>
        <div id="${LOADING_SPINNER_ID}"></div>
        <div id="${PROGRESS_RESULTS_ID}" style="display: none;"></div>
    `; // Verified

    const cancelButton = createButton(
        ts('privateServer.cancel'),
        'primary-destructive',
        {
            onClick: () => {
                isCancelled = true;
                progressText.textContent = ts('privateServer.cancelling');
                cancelButton.disabled = true;
            },
        },
    );

    const { overlay, close } = createOverlay({
        title: ts('privateServer.processingTitle'),
        bodyContent: bodyContent,
        actions: [cancelButton],
        maxWidth: '500px',
    });

    const progressText = bodyContent.querySelector(`#${PROGRESS_TEXT_ID}`);
    const resultsContainer = bodyContent.querySelector(
        `#${PROGRESS_RESULTS_ID}`,
    );
    const spinner = bodyContent.querySelector(`#${LOADING_SPINNER_ID}`);
    const footer = overlay.querySelector('.flex.justify-end');

    cancelButton.onclick = () => {
        isCancelled = true;
        progressText.textContent = ts('privateServer.cancelling');
        cancelButton.disabled = true;
    };

    const totalServers = selectedItems.length;
    const actionText = isActive
        ? ts('privateServer.activating')
        : ts('privateServer.inactivating');
    const errorLog = [];
    let i = 0;

    for (i = 0; i < totalServers; i++) {
        if (isCancelled) break;
        const serverItem = selectedItems[i];
        const serverId = serverItem.dataset.serverId;
        const placeId = serverItem.dataset.placeId;
        progressText.textContent = ts('privateServer.progressText', {
            actionText: actionText,
            current: i + 1,
            total: totalServers,
        });
        const serverName = serverItem
            .closest('.selectable-item-card')
            .querySelector('.item-card-name').title;
        try {
            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${serverId}`,
                method: 'PATCH',
                body: { active: isActive },
            });
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage =
                    errorData.errors && errorData.errors[0]
                        ? errorData.errors[0].message
                        : ts('privateServer.unknownApiError');
                errorLog.push({
                    placeId,
                    name: serverName,
                    reason: errorMessage,
                });
            } else {
                serverItem.closest('li').remove();
            }
        } catch (error) {
            console.error(error);
        }
        if (i < totalServers - 1)
            await new Promise((res) => setTimeout(res, 500));
    }

    spinner.style.display = 'none';
    resultsContainer.style.display = 'flex';
    resultsContainer.style.flexDirection = 'column';
    resultsContainer.style.alignItems = 'center';
    resultsContainer.innerHTML = '';
    if (footer) footer.innerHTML = '';

    const processedCount = i;
    const successCount = processedCount - errorLog.length;

    if (isCancelled) {
        progressText.innerHTML = `${ts('privateServer.processCancelled', { count: successCount })}`; // Verified
    } else {
        progressText.innerHTML = `${ts('privateServer.completed', { successCount: successCount, errorCount: errorLog.length })}`; // Verified
    }

    const resultBody = document.createElement('div');
    if (errorLog.length > 0) {
        const errorList = document.createElement('ul');
        errorLog.forEach((err) => {
            const errorItem = document.createElement('li');
            const gameUrl = `https://www.roblox.com/games/${err.placeId}`;
            errorItem.innerHTML = safeHtml`<a href="${gameUrl}" target="_blank" rel="noopener noreferrer">${err.name}</a>: ${err.reason}`;
            errorList.appendChild(errorItem);
        });
        resultBody.appendChild(errorList);
    }

    const assets = getAssets();
    const iconUrl = assets.rovalraIcon;
    const successImage = document.createElement('img');
    successImage.src = iconUrl;
    successImage.style.width = '64px';
    successImage.style.height = '64px';
    successImage.style.margin = '15px auto 5px auto';
    successImage.style.display = 'block';
    resultBody.appendChild(successImage);

    const titleElement = overlay.querySelector(
        '.group-description-dialog-body-header',
    );
    if (titleElement)
        titleElement.textContent = ts('privateServer.processingComplete');

    resultsContainer.appendChild(resultBody);

    setTimeout(() => {
        close();
        updateButtonStates();
    }, 5000);
}

function showConfirmationModal(selectedItems, isActive) {
    const action = isActive ? 'active' : 'inactive';

    const bodyContent = document.createElement('div');
    bodyContent.style.textAlign = 'center';
    bodyContent.innerHTML = safeHtml`
        <p>${ts('privateServer.confirmationMessage', { count: selectedItems.length, action: action })}</p>
        <p>${isActive ? ts('privateServer.confirmationJoinable') : ts('privateServer.confirmationUnjoinable')}</p>
        <p>${ts('privateServer.confirmationReversible')}</p>
    `;

    const confirmButton = createButton(
        ts('privateServer.confirm'),
        isActive ? 'primary-confirm' : 'primary-destructive',
        {
            onClick: () => {
                close();
                processServerRequest(selectedItems, isActive);
            },
        },
    );
    const cancelButton = createButton(ts('privateServer.cancel'), 'secondary');

    const { close } = createOverlay({
        title: ts('privateServer.confirmationTitle'),
        bodyContent: bodyContent,
        actions: [cancelButton, confirmButton],
    });
}

function updateButtonStates() {
    const selectAllButton = document.getElementById(SELECT_ALL_BTN_ID);
    const checkboxes = document.querySelectorAll(
        `#${FILTERED_LIST_ID} button[role="checkbox"]`,
    );
    const selectedCount = Array.from(checkboxes).filter(
        (cb) => cb.getAttribute('aria-checked') === 'true',
    ).length;
    const setInactiveButton = document.getElementById(SET_INACTIVE_BTN_ID);
    const setActiveButton = document.getElementById(SET_ACTIVE_BTN_ID);

    if (setInactiveButton) setInactiveButton.disabled = selectedCount === 0;
    if (setActiveButton) setActiveButton.disabled = selectedCount === 0;

    if (selectAllButton && selectAllButton.style.display !== 'none') {
        if (checkboxes.length > 0 && selectedCount === checkboxes.length) {
            selectAllButton.textContent = ts('privateServer.deselectAll');
        } else {
            selectAllButton.textContent = ts('privateServer.selectAll');
        }
    }
}

function handleSelectAll() {
    const checkboxes = document.querySelectorAll(
        `#${FILTERED_LIST_ID} button[role="checkbox"]`,
    );
    if (checkboxes.length === 0) return;
    const shouldSelectAll = Array.from(checkboxes).some(
        (cb) => cb.getAttribute('aria-checked') !== 'true',
    );
    checkboxes.forEach((checkbox) => {
        if (
            (checkbox.getAttribute('aria-checked') === 'true') !==
            shouldSelectAll
        ) {
            checkbox.setChecked(shouldSelectAll);
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    updateButtonStates();
}

function cleanupUI() {
    [
        INACTIVE_MAIN_BUTTON_ID,
        SET_INACTIVE_BTN_ID,
        ACTIVE_MAIN_BUTTON_ID,
        SET_ACTIVE_BTN_ID,
        SELECT_ALL_BTN_ID,
        FILTERED_LIST_ID,
    ].forEach((id) => {
        document.getElementById(id)?.remove();
    });
    const originalAssetsList = document.getElementById('assetsItems');
    if (originalAssetsList) originalAssetsList.style.display = '';
    isFilteredInactive = false;
    isFilteredActive = false;
}

function handleBulkAction(isActive) {
    const originalAssetsList = document.getElementById('assetsItems');
    if (!originalAssetsList) return;

    const mainButtonInactive = document.getElementById(INACTIVE_MAIN_BUTTON_ID);
    const mainButtonActive = document.getElementById(ACTIVE_MAIN_BUTTON_ID);
    const setInactiveButton = document.getElementById(SET_INACTIVE_BTN_ID);
    const setActiveButton = document.getElementById(SET_ACTIVE_BTN_ID);
    const selectAllButton = document.getElementById(SELECT_ALL_BTN_ID);

    const fetchAllServers = async (url) => {
        let allData = [];
        let nextCursor = '';
        const initialUrl = new URL(url);

        do {
            const currentUrl = new URL(initialUrl);
            if (nextCursor) {
                currentUrl.searchParams.set('cursor', nextCursor);
            }

            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: `${currentUrl.pathname}${currentUrl.search}`,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const body = await response.json();
            if (body.data) {
                allData = allData.concat(body.data);
            }
            nextCursor = body.nextPageCursor;
        } while (nextCursor);

        return allData;
    };

    if ((isActive && isFilteredActive) || (!isActive && isFilteredInactive)) {
        originalAssetsList.style.display = '';
        document.getElementById(FILTERED_LIST_ID)?.remove();
        if (mainButtonInactive) {
            mainButtonInactive.textContent = ts('privateServer.bulkInactivate');
            mainButtonInactive.style.display = 'block';
            mainButtonInactive.style.right = '130px';
        }
        if (mainButtonActive) {
            mainButtonActive.textContent = ts('privateServer.bulkActivate');
            mainButtonActive.style.display = 'block';
            mainButtonActive.style.right = '0px';
        }
        if (setInactiveButton) {
            setInactiveButton.style.right = '285px';
            setInactiveButton.style.display = 'none';
        }
        if (setActiveButton) {
            setActiveButton.style.right = '155px';
            setActiveButton.style.display = 'none';
        }
        if (selectAllButton) selectAllButton.style.display = 'none';
        isFilteredInactive = false;
        isFilteredActive = false;
        return;
    }

    isFilteredInactive = !isActive;
    isFilteredActive = isActive;
    originalAssetsList.style.display = 'none';
    if (selectAllButton) selectAllButton.style.display = 'block';
    updateButtonStates();

    if (isActive) {
        if (mainButtonActive) {
            mainButtonActive.textContent = ts('privateServer.cancel');
            mainButtonActive.style.right = '0px';
        }
        if (setActiveButton) {
            setActiveButton.style.right = '85px';
            setActiveButton.style.display = 'block';
        }
        if (selectAllButton) selectAllButton.style.right = '190px';
        if (mainButtonInactive) mainButtonInactive.style.display = 'none';
    } else {
        if (mainButtonInactive) {
            mainButtonInactive.textContent = ts('privateServer.cancel');
            mainButtonInactive.style.right = '0px';
        }
        if (setInactiveButton) {
            setInactiveButton.style.right = '85px';
            setInactiveButton.style.display = 'block';
        }
        if (selectAllButton) selectAllButton.style.right = '195px';
        if (mainButtonActive) mainButtonActive.style.display = 'none';
    }

    document.getElementById(FILTERED_LIST_ID)?.remove();
    const newFilteredList = document.createElement('ul');
    newFilteredList.id = FILTERED_LIST_ID;
    newFilteredList.className = originalAssetsList.className;
    originalAssetsList.parentNode.insertBefore(
        newFilteredList,
        originalAssetsList.nextSibling,
    );

    const privateServersApiUrl =
        'https://games.roblox.com/v1/private-servers/my-private-servers?itemsPerPage=100&privateServersTab=MyPrivateServers';

    fetchAllServers(privateServersApiUrl)
        .then((allServers) => {
            const filteredServers = allServers.filter(
                (server) =>
                    server.active === !isActive &&
                    new Date(server.expirationDate) > new Date(),
            );
            if (filteredServers.length === 0) {
                newFilteredList.innerHTML = safeHtml`<li><div class="btr-no-servers-message">${ts('privateServer.noServersFound', { status: isActive ? 'inactive' : 'active' })}</div></li>`;
                if (selectAllButton) selectAllButton.style.display = 'none';
                return;
            }

            const thumbnailItems = filteredServers.map((server) => ({
                id: server.universeId,
            }));
            return fetchThumbnails(thumbnailItems, 'GameIcon', '150x150').then(
                (thumbnailMap) => {
                    newFilteredList.innerHTML = '';
                    filteredServers.forEach((server) => {
                        const thumbnailData = thumbnailMap.get(
                            server.universeId,
                        );
                        const thumbnailUrl = thumbnailData?.imageUrl || '';
                        const listItem = document.createElement('li');
                        listItem.className =
                            'list-item item-card ng-scope place-item selectable-item-card';

                        const itemCardContainer = document.createElement('div');
                        itemCardContainer.className = 'item-card-container';

                        const itemCardLink = document.createElement('div');
                        itemCardLink.className = 'item-card-link';

                        const itemCardThumbContainer =
                            document.createElement('div');
                        itemCardThumbContainer.className =
                            'item-card-thumb-container';

                        const thumbnail2dContainer =
                            document.createElement('span');
                        thumbnail2dContainer.className =
                            'thumbnail-2d-container';

                        const img = document.createElement('img');
                        img.src = thumbnailUrl;
                        img.alt = server.name;
                        img.title = server.name;

                        thumbnail2dContainer.appendChild(img);
                        itemCardThumbContainer.appendChild(
                            thumbnail2dContainer,
                        );

                        const itemCardName = document.createElement('div');
                        itemCardName.className = 'item-card-name';
                        itemCardName.title = server.name;

                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'ng-binding';
                        nameSpan.textContent = server.name;

                        itemCardName.appendChild(nameSpan);
                        itemCardLink.appendChild(itemCardThumbContainer);
                        itemCardLink.appendChild(itemCardName);

                        const itemCardLabel = document.createElement('div');
                        itemCardLabel.className =
                            'text-overflow item-card-label ng-scope';

                        const bySpan = document.createElement('span');
                        bySpan.className = 'ng-binding';
                        bySpan.textContent = ts('privateServer.byCreator');

                        const creatorLink = document.createElement('a');
                        creatorLink.className =
                            'creator-name text-overflow text-link ng-binding';
                        creatorLink.href = `https://www.roblox.com/users/${server.ownerId}/profile`;
                        creatorLink.target = '_blank';
                        creatorLink.rel = 'noopener noreferrer';
                        creatorLink.textContent = `@${server.ownerName}`;

                        itemCardLabel.appendChild(bySpan);
                        itemCardLabel.appendChild(creatorLink);

                        const itemCardPrice = document.createElement('div');
                        itemCardPrice.className =
                            'text-overflow item-card-price ng-scope';

                        if (server.priceInRobux) {
                            const iconSpan = document.createElement('span');
                            iconSpan.className = 'icon-robux-16x16';

                            const priceSpan = document.createElement('span');
                            priceSpan.className = 'text-robux-tile ng-binding';
                            priceSpan.textContent = server.priceInRobux;

                            itemCardPrice.appendChild(iconSpan);
                            itemCardPrice.appendChild(priceSpan);
                        } else {
                            const freeSpan = document.createElement('span');
                            freeSpan.className =
                                'text-overflow font-caption-body ng-binding ng-scope text-robux-tile';
                            freeSpan.textContent = 'Free';
                            itemCardPrice.appendChild(freeSpan);
                        }

                        itemCardContainer.appendChild(itemCardLink);
                        itemCardContainer.appendChild(itemCardLabel);
                        itemCardContainer.appendChild(itemCardPrice);
                        listItem.appendChild(itemCardContainer);

                        const radio = createRadioButton();
                        radio.dataset.serverId = server.privateServerId;
                        radio.dataset.placeId = server.placeId;
                        Object.assign(radio.style, {
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            zIndex: '5',
                        });

                        listItem.prepend(radio);
                        newFilteredList.appendChild(listItem);
                    });
                    newFilteredList
                        .querySelectorAll('.list-item.item-card')
                        .forEach((item) => {
                            const checkbox = item.querySelector(
                                'button[role="checkbox"]',
                            );
                            item.addEventListener('click', (event) => {
                                if (
                                    event.target.closest('a') ||
                                    event.target === checkbox
                                )
                                    return;
                                const isChecked =
                                    checkbox.getAttribute('aria-checked') ===
                                    'true';
                                checkbox.setChecked(!isChecked);
                                checkbox.dispatchEvent(
                                    new Event('change', { bubbles: true }),
                                );
                            });
                            checkbox.addEventListener('change', () => {
                                const isChecked =
                                    checkbox.getAttribute('aria-checked') ===
                                    'true';
                                item.classList.toggle('selected', isChecked);
                                updateButtonStates();
                            });
                        });
                    updateButtonStates();
                },
            );
        })
        .catch(() => {
            cleanupUI();
        });
}

function handlePageUpdate() {
    const currentUrl = window.location.href;
    const isCorrectPage =
        (currentUrl.includes('private-servers') ||
            currentUrl.includes('my-private-servers')) &&
        !currentUrl.includes('other-private-servers');

    if (!isCorrectPage) {
        cleanupUI();
        return;
    }

    const headerContainer = document.querySelector('.container-header');
    const assetsListElement = document.getElementById('assetsItems');

    if (!headerContainer || !assetsListElement) {
        return;
    }

    if (document.getElementById(INACTIVE_MAIN_BUTTON_ID)) {
        return;
    }

    const buttonWrapper = document.createElement('div');
    buttonWrapper.style.display = 'flex';
    buttonWrapper.style.justifyContent = 'flex-end';
    buttonWrapper.style.gap = '8px';
    buttonWrapper.style.bottom = '5px';
    buttonWrapper.style.left = '-8px';
    buttonWrapper.style.position = 'relative';
    headerContainer.appendChild(buttonWrapper);

    const mainButtonInactive = createButton(
        ts('privateServer.bulkInactivate'),
        'secondary',
        {
            id: INACTIVE_MAIN_BUTTON_ID,
        },
    );
    buttonWrapper.appendChild(mainButtonInactive);

    const setInactiveButton = createButton(
        ts('privateServer.setInactive'),
        'primary-destructive',
        { id: SET_INACTIVE_BTN_ID },
    );
    setInactiveButton.style.display = 'none';
    buttonWrapper.appendChild(setInactiveButton);

    const mainButtonActive = createButton(
        ts('privateServer.bulkActivate'),
        'secondary',
        {
            id: ACTIVE_MAIN_BUTTON_ID,
        },
    );
    buttonWrapper.appendChild(mainButtonActive);

    const setActiveButton = createButton(
        ts('privateServer.setActive'),
        'primary-confirm',
        {
            id: SET_ACTIVE_BTN_ID,
        },
    );
    setActiveButton.style.display = 'none';
    buttonWrapper.appendChild(setActiveButton);

    const selectAllButton = createButton(
        ts('privateServer.selectAll'),
        'secondary',
        {
            id: SELECT_ALL_BTN_ID,
        },
    );
    selectAllButton.style.display = 'none';
    buttonWrapper.appendChild(selectAllButton);

    [
        mainButtonInactive,
        setInactiveButton,
        mainButtonActive,
        setActiveButton,
        selectAllButton,
    ].forEach((btn) => {
        btn.style.position = 'static';
        btn.style.top = 'auto';
        btn.style.right = 'auto';
        btn.style.height = '32px';
    });

    setInactiveButton.addEventListener('click', () => {
        const selected = Array.from(
            document.querySelectorAll(
                'button[role="checkbox"][aria-checked="true"]',
            ),
        );
        if (selected.length > 0) showConfirmationModal(selected, false);
    });
    setActiveButton.addEventListener('click', () => {
        const selected = Array.from(
            document.querySelectorAll(
                'button[role="checkbox"][aria-checked="true"]',
            ),
        );
        if (selected.length > 0) showConfirmationModal(selected, true);
    });
    selectAllButton.addEventListener('click', handleSelectAll);
    mainButtonInactive.addEventListener('click', () => handleBulkAction(false));
    mainButtonActive.addEventListener('click', () => handleBulkAction(true));

    updateButtonStates();
}

export function init() {
    storage.get({ PrivateServerBulkEnabled: true }).then((data) => {
        if (data.PrivateServerBulkEnabled === true) {
            const wrapHistory = (type) => {
                const original = history[type];
                return function () {
                    const result = original.apply(this, arguments);
                    window.dispatchEvent(new Event(type));
                    return result;
                };
            };
            history.pushState = wrapHistory('pushState');
            history.replaceState = wrapHistory('replaceState');

            window.addEventListener('popstate', handlePageUpdate);
            window.addEventListener('hashchange', handlePageUpdate);
            window.addEventListener('pushState', handlePageUpdate);
            window.addEventListener('replaceState', handlePageUpdate);

            observeElement('.container-header', handlePageUpdate);

            handlePageUpdate();
        }
    });
}
