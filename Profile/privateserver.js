const INACTIVE_MAIN_BUTTON_ID = 'btr-bulk-inactivate-btn';
const SET_INACTIVE_BTN_ID = 'btr-set-inactive-btn';
const ACTIVE_MAIN_BUTTON_ID = 'btr-bulk-activate-btn';
const SET_ACTIVE_BTN_ID = 'btr-set-active-btn';
const SELECT_ALL_BTN_ID = 'btr-select-all-btn';

const FILTERED_LIST_ID = 'btr-filtered-assets-list';
const CONFIRMATION_MODAL_ID = 'btr-confirmation-modal';
const RESULTS_MODAL_ID = 'btr-results-modal';
const PROGRESS_TEXT_ID = 'btr-progress-text';
const PROGRESS_RESULTS_ID = 'btr-progress-results';
const LOADING_SPINNER_ID = 'btr-loading-spinner';

let isFilteredInactive = false;
let isFilteredActive = false;

window.addEventListener('themeDetected', (event) => {
    currentTheme = event.detail.theme;
    if (currentTheme === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
    [INACTIVE_MAIN_BUTTON_ID, SET_INACTIVE_BTN_ID, ACTIVE_MAIN_BUTTON_ID, SET_ACTIVE_BTN_ID, SELECT_ALL_BTN_ID].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) applyButtonStyling(btn, !btn.id.includes('main'));
    });
});

function applyButtonStyling(button, isSecondary = false) {
    const isDarkMode = currentTheme === 'dark';
    const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgb(57, 59, 61)';
    const bgColor = isDarkMode ? 'rgb(45, 48, 51)' : 'rgb(242, 244, 245)';
    const hoverBgColor = isDarkMode ? 'rgb(57, 60, 64)' : 'rgb(224, 226, 227)';
    const borderColor = isDarkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)';

    button.style.position = 'absolute';
    button.style.top = '-40px';
    if (button.id === INACTIVE_MAIN_BUTTON_ID) button.style.right = '130px';
    if (button.id === ACTIVE_MAIN_BUTTON_ID) button.style.right = '0px';
    if (button.id === SET_INACTIVE_BTN_ID) button.style.right = '285px';
    if (button.id === SET_ACTIVE_BTN_ID) button.style.right = '155px';
    if (button.id === SELECT_ALL_BTN_ID) button.style.right = '265px';

    button.style.padding = '4px 10px';
    button.style.fontSize = '14px';
    button.style.borderRadius = '8px';
    button.style.cursor = 'pointer';
    button.style.transition = 'background-color 0.2s ease, opacity 0.2s ease, right 0.2s ease';
    button.style.fontWeight = 'bold';
    button.style.minWidth = 'auto';
    button.style.outline = 'none';
    button.style.zIndex = '100';
    button.style.color = textColor;
    button.style.backgroundColor = bgColor;
    button.style.border = borderColor;
    button.onmouseover = () => { if (!button.disabled) button.style.backgroundColor = hoverBgColor; };
    button.onmouseout = () => { if (!button.disabled) button.style.backgroundColor = bgColor; };
}

function injectCss() {
    if (document.getElementById('btr-bulk-action-styles')) return;
    const style = document.createElement('style');
    style.id = 'btr-bulk-action-styles';
    style.textContent = `
        @keyframes btr-rotation{0%{transform:rotate(0deg)}to{transform:rotate(359deg)}}
        .item-card-thumb-container { transition: box-shadow 0.2s ease; }
        .item-card-thumb-container .thumbnail-2d-container { border-radius: 8px; overflow: hidden; }
        .list-item.selected .item-card-thumb-container { box-shadow: 0 0 8px rgba(0, 123, 255, 0.9); }
        .selectable-item-card { position: relative; padding-top: 5px; }
        .server-checkbox { position: absolute; top: 10px; left: 10px; width: 20px; height: 20px; cursor: pointer; z-index: 5; appearance: none; -webkit-appearance: none; background-color: #393b3d; border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 4px; display: grid; place-content: center; }
        .server-checkbox::before { content: ""; width: 5px; height: 10px; border: solid white; border-width: 0 3px 3px 0; transform: rotate(45deg) scale(0); transition: transform 0.2s ease-in-out; margin-bottom: 3px; }
        .server-checkbox:checked { box-shadow: 0 0 5px rgba(255, 255, 255, 0.95); }
        .server-checkbox:checked::before { transform: rotate(45deg) scale(1); }
        #${FILTERED_LIST_ID} .list-item { cursor: pointer; }
        .btr-no-servers-message { text-align: center; padding: 40px 20px; color: var(--text-secondary); font-size: 16px; font-style: italic; }
        #${CONFIRMATION_MODAL_ID}, #${RESULTS_MODAL_ID} { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background-color: #fff; color: #000; padding: 25px; border-radius: 8px; text-align: center; width: 450px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); position: relative; }
        #${RESULTS_MODAL_ID} .modal-content { min-height: 250px; display: flex; flex-direction: column; justify-content: center; }
        .modal-content h3 { margin-top: 0; }
        .modal-buttons { margin-top: 20px; display: flex; justify-content: center; }
        .modal-buttons button { padding: 8px 16px; border-radius: 5px; border: none; cursor: pointer; font-weight: bold; margin: 0 10px; transition: background-color 0.2s ease; }
        button:disabled { cursor: not-allowed !important; opacity: 0.5; }
        .modal-confirm-btn.inactive { background-color: #e53935; color: white; }
        .modal-confirm-btn.inactive:hover:not(:disabled) { background-color: #c62828; }
        .modal-confirm-btn.active { background-color: #43b581; color: white; }
        .modal-confirm-btn.active:hover:not(:disabled) { background-color: #3aa572; }
        .modal-cancel-btn { background-color: #eee; color: #333; }
        .modal-cancel-btn:hover { background-color: #ddd; }
        #${PROGRESS_TEXT_ID} { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        #${PROGRESS_RESULTS_ID} { flex-grow: 1; display: flex; flex-direction: column; text-align: left; }
        #${PROGRESS_RESULTS_ID} ul { list-style-type: none; padding: 0; margin: 10px 0; max-height: 150px; overflow-y: auto; background-color: rgba(0,0,0,0.3); border-radius: 5px; padding: 10px; }
        #${PROGRESS_RESULTS_ID} li { margin-bottom: 8px; font-size: 13px; }
        #${PROGRESS_RESULTS_ID} a { color: #58a6ff; text-decoration: none; font-weight: bold; }
        #${PROGRESS_RESULTS_ID} a:hover { text-decoration: underline; }
        .btr-modal-footer { text-align: center; margin-top: auto; padding-top: 15px; }
        .success-text { color: #43b581; }
        .error-text { color: #e53935; }
        #${LOADING_SPINNER_ID} { width: 40px; height: 40px; border: 4px solid rgba(0, 0, 0, 0.1); border-top-color: #333; border-radius: 50%; animation: btr-rotation 1s linear infinite; margin: 20px auto; }
        .modal-content.dark #${LOADING_SPINNER_ID} { border-color: rgba(255, 255, 255, 0.2); border-top-color: #fff; }
        .modal-content.dark { background-color: rgb(45, 48, 51); color: rgba(255, 255, 255, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); }
        .modal-content.dark .modal-cancel-btn { background-color: rgb(80, 83, 86); color: rgba(255, 255, 255, 0.9); }
        .modal-content.dark .modal-cancel-btn:hover { background-color: rgb(95, 98, 102); }
        .btr-button-primary-active { background-color: #43b581 !important; color: white !important; border-color: transparent !important; }
        .btr-button-primary-active:hover:not(:disabled) { background-color: #3aa572 !important; }
        .btr-button-primary-inactive { background-color: #e53935 !important; color: white !important; border-color: transparent !important; }
        .btr-button-primary-inactive:hover:not(:disabled) { background-color: #c62828 !important; }
    `;
    document.head.appendChild(style);
}

async function processServerRequest(selectedItems, isActive) {
    const delay = ms => new Promise(res => setTimeout(res, ms));
    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    if (!csrfTokenMeta) {
        alert('BTR Bulk Action: CSRF token meta tag not found. Cannot proceed.');
        return;
    }
    const csrfToken = csrfTokenMeta.dataset.token;
    let isCancelled = false;

    const resultsModal = document.createElement('div');
    resultsModal.id = RESULTS_MODAL_ID;
    resultsModal.innerHTML = `
        <div class="modal-content ${currentTheme === 'dark' ? 'dark' : ''}">
            <div id="${PROGRESS_TEXT_ID}">Starting...</div>
            <div id="${LOADING_SPINNER_ID}"></div>
            <div id="${PROGRESS_RESULTS_ID}" style="display: none;"></div>
            <div class="btr-modal-footer"></div>
        </div>
    `;
    document.body.appendChild(resultsModal);

    const progressText = resultsModal.querySelector(`#${PROGRESS_TEXT_ID}`);
    const resultsContainer = resultsModal.querySelector(`#${PROGRESS_RESULTS_ID}`);
    const spinner = resultsModal.querySelector(`#${LOADING_SPINNER_ID}`);
    const footer = resultsModal.querySelector('.btr-modal-footer');
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    applyButtonStyling(cancelButton);
    cancelButton.className = 'btr-button-primary-inactive';
    cancelButton.style.position = 'static';
    cancelButton.style.padding = '8px 24px';
    cancelButton.onclick = () => {
        isCancelled = true;
        progressText.textContent = "Cancelling...";
        cancelButton.disabled = true;
    };
    footer.appendChild(cancelButton);

    const totalServers = selectedItems.length;
    const actionText = isActive ? 'Activating' : 'Inactivating';
    const errorLog = [];
    let i = 0;

    for (i = 0; i < totalServers; i++) {
        if (isCancelled) break;
        const serverItem = selectedItems[i];
        const serverId = serverItem.dataset.serverId;
        const placeId = serverItem.dataset.placeId;
        progressText.textContent = `${actionText} server ${i + 1} of ${totalServers}...`;
        const serverName = serverItem.closest('.selectable-item-card').querySelector('.item-card-name').title;
        try {
            const response = await fetch(`https://games.roblox.com/v1/vip-servers/${serverId}`, { credentials: 'include', method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Csrf-Token': csrfToken }, body: JSON.stringify({ active: isActive }), });
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.errors && errorData.errors[0] ? errorData.errors[0].message : 'An unknown API error occurred.';
                errorLog.push({ placeId, name: serverName, reason: errorMessage });
            } else {
                serverItem.closest('li').remove();
            }
        } catch (error) {
            errorLog.push({ placeId, name: serverName, reason: 'A network error occurred.' });
        }
        if (i < totalServers - 1) await delay(500);
    }
    
    spinner.style.display = 'none';
    resultsContainer.style.display = 'flex';
    resultsContainer.innerHTML = '';
    footer.innerHTML = '';
    
    const processedCount = i;
    const successCount = processedCount - errorLog.length;

    if (isCancelled) {
        progressText.innerHTML = `Process Cancelled. <span class="success-text">${successCount} server(s) processed.</span>`;
    } else {
        progressText.innerHTML = `Completed: <span class="success-text">${successCount} succeeded</span>, <span class="error-text">${errorLog.length} failed</span>.`;
    }

    const resultBody = document.createElement('div');
    if (errorLog.length > 0) {
        const errorList = document.createElement('ul');
        errorLog.forEach(err => {
            const errorItem = document.createElement('li');
            const gameUrl = `https://www.roblox.com/games/${err.placeId}`;
            errorItem.innerHTML = `<a href="${gameUrl}" target="_blank" rel="noopener noreferrer">${err.name}</a>: ${err.reason}`;
            errorList.appendChild(errorItem);
        });
        resultBody.appendChild(errorList);
    }

    const iconUrl = chrome.runtime.getURL("Assets/icon-128.png");
    const successImage = document.createElement('img');
    successImage.src = iconUrl;
    successImage.style.width = '64px';
    successImage.style.height = '64px';
    successImage.style.margin = '15px auto 5px auto';
    successImage.style.display = 'block';
    resultBody.appendChild(successImage);
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.className = 'btr-button-primary-active';
    applyButtonStyling(closeButton);
    closeButton.style.position = 'static';
    closeButton.style.padding = '8px 24px';
    closeButton.onclick = () => { resultsModal.remove(); updateButtonStates(); };
    
    resultsContainer.appendChild(resultBody);
    footer.appendChild(closeButton);
}

function showConfirmationModal(selectedItems, isActive) {
    const action = isActive ? 'active' : 'inactive';
    const modal = document.createElement('div');
    modal.id = CONFIRMATION_MODAL_ID;
    modal.innerHTML = `
        <div class="modal-content ${currentTheme === 'dark' ? 'dark' : ''}">
            <h3>Confirm Action</h3>
            <p>You are about to set ${selectedItems.length} private server(s) as ${action}.</p>
            <p>${isActive ? 'This will make the private server joinable.' : 'This will make the private server unjoinable'}</p>
            <p>You can always change this back later.</p>
            <div class="modal-buttons">
                <button class="modal-cancel-btn">Cancel</button>
                <button class="modal-confirm-btn ${action}">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-confirm-btn').addEventListener('click', () => {
        modal.remove();
        processServerRequest(selectedItems, isActive);
    });
}

function updateButtonStates() {
    const selectAllButton = document.getElementById(SELECT_ALL_BTN_ID);
    const checkboxes = document.querySelectorAll(`#${FILTERED_LIST_ID} .server-checkbox`);
    const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const setInactiveButton = document.getElementById(SET_INACTIVE_BTN_ID);
    const setActiveButton = document.getElementById(SET_ACTIVE_BTN_ID);

    if (setInactiveButton) setInactiveButton.disabled = selectedCount === 0;
    if (setActiveButton) setActiveButton.disabled = selectedCount === 0;

    if (selectAllButton && selectAllButton.style.display !== 'none') {
        if (checkboxes.length > 0 && selectedCount === checkboxes.length) {
            selectAllButton.textContent = "Deselect All";
        } else {
            selectAllButton.textContent = "Select All";
        }
    }
}

function handleSelectAll() {
    const checkboxes = document.querySelectorAll(`#${FILTERED_LIST_ID} .server-checkbox`);
    if (checkboxes.length === 0) return;
    const shouldSelectAll = Array.from(checkboxes).some(cb => !cb.checked);
    checkboxes.forEach(checkbox => {
        if (checkbox.checked !== shouldSelectAll) {
            checkbox.checked = shouldSelectAll;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    updateButtonStates();
}

function cleanupUI() {
    [INACTIVE_MAIN_BUTTON_ID, SET_INACTIVE_BTN_ID, ACTIVE_MAIN_BUTTON_ID, SET_ACTIVE_BTN_ID, SELECT_ALL_BTN_ID, FILTERED_LIST_ID].forEach(id => {
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

    const fetchAllServers = (url) => {
        let allData = [];
        function fetchPage(pageUrl) {
            return fetch(pageUrl, { credentials: 'include' })
                .then(response => { if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); return response.json(); })
                .then(body => {
                    allData = allData.concat(body.data);
                    if (body.nextPageCursor) {
                        const nextUrl = new URL(pageUrl);
                        nextUrl.searchParams.set('cursor', body.nextPageCursor);
                        return fetchPage(nextUrl.toString());
                    } else return allData;
                });
        }
        return fetchPage(url);
    };

    if ((isActive && isFilteredActive) || (!isActive && isFilteredInactive)) {
        originalAssetsList.style.display = '';
        document.getElementById(FILTERED_LIST_ID)?.remove();
        if (mainButtonInactive) { mainButtonInactive.textContent = "Bulk Inactivate"; mainButtonInactive.style.display = 'block'; mainButtonInactive.style.right = '130px'; }
        if (mainButtonActive) { mainButtonActive.textContent = "Bulk Activate"; mainButtonActive.style.display = 'block'; mainButtonActive.style.right = '0px'; }
        if (setInactiveButton) { setInactiveButton.style.right = '285px'; setInactiveButton.style.display = 'none'; }
        if (setActiveButton) { setActiveButton.style.right = '155px'; setActiveButton.style.display = 'none'; }
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
        if (mainButtonActive) { mainButtonActive.textContent = "Cancel"; mainButtonActive.style.right = '0px'; }
        if (setActiveButton) { setActiveButton.style.right = '85px'; setActiveButton.style.display = 'block'; }
        if (selectAllButton) selectAllButton.style.right = '190px';
        if (mainButtonInactive) mainButtonInactive.style.display = 'none';
    } else {
        if (mainButtonInactive) { mainButtonInactive.textContent = "Cancel"; mainButtonInactive.style.right = '0px'; }
        if (setInactiveButton) { setInactiveButton.style.right = '85px'; setInactiveButton.style.display = 'block'; }
        if (selectAllButton) selectAllButton.style.right = '195px';
        if (mainButtonActive) mainButtonActive.style.display = 'none';
    }
    
    document.getElementById(FILTERED_LIST_ID)?.remove();
    const newFilteredList = document.createElement('ul');
    newFilteredList.id = FILTERED_LIST_ID;
    newFilteredList.className = originalAssetsList.className;
    originalAssetsList.parentNode.insertBefore(newFilteredList, originalAssetsList.nextSibling);

    const privateServersApiUrl = 'https://games.roblox.com/v1/private-servers/my-private-servers?itemsPerPage=100&privateServersTab=MyPrivateServers';
    const thumbnailsApiUrl = 'https://thumbnails.roblox.com/v1/batch';

    fetchAllServers(privateServersApiUrl)
    .then(allServers => {
        const filteredServers = allServers.filter(server => server.active === !isActive && new Date(server.expirationDate) > new Date());
        if (filteredServers.length === 0) {
            newFilteredList.innerHTML = `<li><div class="btr-no-servers-message">No ${isActive ? 'inactive' : 'active'} private servers found.</div></li>`;
            if (selectAllButton) selectAllButton.style.display = 'none';
            return;
        }

        const thumbnailPayload = filteredServers.map(server => ({ requestId: `${server.universeId}:GameIcon:150x150`, type: 'GameIcon', targetId: server.universeId, format: 'webp', size: '150x150' }));

        return fetch(thumbnailsApiUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(thumbnailPayload) })
        .then(res => res.json())
        .then(thumbnailData => {
            const thumbnailMap = new Map(thumbnailData.data.map(thumb => [thumb.targetId, thumb.imageUrl]));
            newFilteredList.innerHTML = '';
            filteredServers.forEach(server => {
                const thumbnailUrl = thumbnailMap.get(server.universeId) || '';
                const priceDisplay = server.priceInRobux ? `<span class="icon-robux-16x16"></span><span class="text-robux-tile ng-binding">${server.priceInRobux}</span>` : `<span class="text-overflow font-caption-body ng-binding ng-scope text-robux-tile">Free</span>`;
                const listItem = document.createElement('li');
                listItem.className = 'list-item item-card ng-scope place-item';
                listItem.innerHTML = `<div class="selectable-item-card"><input type="checkbox" class="server-checkbox" data-server-id="${server.privateServerId}" data-place-id="${server.placeId}"><div class="item-card-container"><div class="item-card-link"><div class="item-card-thumb-container"><span class="thumbnail-2d-container"><img src="${thumbnailUrl}" alt="${server.name}" title="${server.name}"></span></div><div class="item-card-name" title="${server.name}"><span class="ng-binding">${server.name}</span></div></div><div class="text-overflow item-card-label ng-scope"><span class="ng-binding">By </span><a class="creator-name text-overflow text-link ng-binding" href="https://www.roblox.com/users/${server.ownerId}/profile" target="_blank" rel="noopener noreferrer">@${server.ownerName}</a></div><div class="text-overflow item-card-price ng-scope">${priceDisplay}</div></div></div>`;
                newFilteredList.appendChild(listItem);
            });
            newFilteredList.querySelectorAll('.list-item.item-card').forEach(item => {
                const checkbox = item.querySelector('.server-checkbox');
                item.addEventListener('click', (event) => {
                    if (event.target.closest('a') || event.target === checkbox) return;
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                });
                checkbox.addEventListener('change', () => {
                    item.classList.toggle('selected', checkbox.checked);
                    updateButtonStates();
                });
            });
            updateButtonStates();
        });
    })
    .catch(error => { console.error('BTR Bulk Action: There was a problem with the operation:', error); cleanupUI(); });
}

function handlePageUpdate() {
    const currentUrl = window.location.href;
    const isCorrectPage = (currentUrl.includes("private-servers") || currentUrl.includes("my-private-servers")) && !currentUrl.includes("other-private-servers");
    if (!isCorrectPage) { cleanupUI(); return; }

    const assetsListElement = document.getElementById("assetsItems");
    if (!assetsListElement) return;
    const parentContainer = assetsListElement.parentElement;
    if (!parentContainer) return;
    parentContainer.style.position = 'relative';

    if (document.getElementById(INACTIVE_MAIN_BUTTON_ID)) return;

    const mainButtonInactive = document.createElement("button"); mainButtonInactive.id = INACTIVE_MAIN_BUTTON_ID; mainButtonInactive.textContent = "Bulk Inactivate"; parentContainer.appendChild(mainButtonInactive);
    const setInactiveButton = document.createElement("button"); setInactiveButton.id = SET_INACTIVE_BTN_ID; setInactiveButton.textContent = "Set Inactive"; setInactiveButton.style.display = 'none'; setInactiveButton.className = 'btr-button-primary-inactive'; parentContainer.appendChild(setInactiveButton);
    const mainButtonActive = document.createElement("button"); mainButtonActive.id = ACTIVE_MAIN_BUTTON_ID; mainButtonActive.textContent = "Bulk Activate"; parentContainer.appendChild(mainButtonActive);
    const setActiveButton = document.createElement("button"); setActiveButton.id = SET_ACTIVE_BTN_ID; setActiveButton.textContent = "Set Active"; setActiveButton.style.display = 'none'; setActiveButton.className = 'btr-button-primary-active'; parentContainer.appendChild(setActiveButton);
    const selectAllButton = document.createElement("button"); selectAllButton.id = SELECT_ALL_BTN_ID; selectAllButton.textContent = "Select All"; selectAllButton.style.display = 'none'; parentContainer.appendChild(selectAllButton);
    
    [mainButtonInactive, setInactiveButton, mainButtonActive, setActiveButton, selectAllButton].forEach((btn) => {
        applyButtonStyling(btn);
    });

    setInactiveButton.addEventListener('click', () => { const selected = Array.from(document.querySelectorAll('.server-checkbox:checked')); if (selected.length > 0) showConfirmationModal(selected, false); });
    setActiveButton.addEventListener('click', () => { const selected = Array.from(document.querySelectorAll('.server-checkbox:checked')); if (selected.length > 0) showConfirmationModal(selected, true); });
    selectAllButton.addEventListener('click', handleSelectAll);
    mainButtonInactive.addEventListener('click', () => handleBulkAction(false));
    mainButtonActive.addEventListener('click', () => handleBulkAction(true));

    updateButtonStates();
}

function initializeObserver() {
    injectCss();
    const observer = new MutationObserver(handlePageUpdate);
    observer.observe(document.body, { childList: true, subtree: true });
    handlePageUpdate();
}


chrome.storage.local.get('PrivateServerBulkEnabled', (data) => {
    if (data.PrivateServerBulkEnabled === true) {
        initializeObserver();
    }
});
