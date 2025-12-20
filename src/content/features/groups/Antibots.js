import { createDropdown } from '../../core/ui/dropdown.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { fetchThumbnails, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import DOMPurify from 'dompurify';



let userPermissions = { canBan: null, canKick: null, lastChecked: 0 };

let quickActionState = {
    cursor: null,
    isLoading: false,
    hasMore: true,
    groupId: null,
    abortController: null,
    scrollListener: null,
    members: [] 
};

let antiBotState = {
    abortController: null,
    isScanning: false,
    allMembersCache: [],
    likelyBotsCache: [],
    thumbnailCache: {},
    hashesCache: {},
    renderCursor: 0,
    scrollListener: null
};

async function getFeatureSettings() {
    return new Promise((resolve) => {
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get({ antibotsEnabled: true, QuickActionsEnabled: true }, resolve);
        } else {
            resolve({ antibotsEnabled: true, QuickActionsEnabled: true });
        }
    });
}

async function checkUserPermissions() {
    const now = Date.now();
    if (userPermissions.lastChecked && (now - userPermissions.lastChecked < 300000)) return userPermissions;

    const groupId = getGroupIdFromUrl();
    if (!groupId) return { canBan: false, canKick: false };

    try {
        const data = await callRobloxApiJson({ subdomain: 'groups', endpoint: `/v1/groups/${groupId}/membership` });
        const permissions = data.permissions.groupMembershipPermissions;
        userPermissions = { canBan: permissions.banMembers === true, canKick: permissions.removeMembers === true, lastChecked: now };
        return userPermissions;
    } catch (error) {
        return { canBan: false, canKick: false };
    }
}

async function getGroupDetails(groupId) {
    return await callRobloxApiJson({ subdomain: 'groups', endpoint: `/v1/groups/${groupId}` });
}

async function banUser(groupId, userId) {
    return await callRobloxApiJson({ subdomain: 'groups', endpoint: `/v1/groups/${groupId}/bans/${userId}`, method: 'POST', body: {} });
}

async function kickUser(groupId, userId) {
    return await callRobloxApiJson({ subdomain: 'groups', endpoint: `/v1/groups/${groupId}/users/${userId}`, method: 'DELETE' });
}

function injectUiCss() {
    const styleId = 'rovalra-antibots-content-style';
    if (document.getElementById(styleId)) return;

    const css = `
        .rovalra-action-summary-list { max-height: 250px; overflow-y: auto; padding-left: 20px; border: 0px solid var(--border-color); padding: 10px; border-radius: 4px; list-style-type: disc; }
        .rovalra-action-progress-bar-container { width: 100%; background-color: var(--surface-default); border-radius: 4px; margin-top: 15px; display: none; height: 10px; }
        .rovalra-action-progress-bar { width: 0%; height: 100%; background-color: #28a745; border-radius: 4px; transition: width 0.3s ease; }
        .rovalra-action-status-text { margin-top: 5px; font-size: 13px; text-align: center; color: var(--rovalra-secondary-text-color); min-height: 18px; }
        .rovalra-ban-warning { background-color: rgba(220, 53, 69, 0.1); color: #dc3545; padding: 12px; border-radius: 6px; margin-top: 15px; font-size: 14px; border: 1px solid rgba(220, 53, 69, 0.3); }
        .rovalra-score-selector-container { margin: 20px 0; }
        .rovalra-score-selector-container label { display: block; margin-bottom: 10px; font-weight: 500; }
        .rovalra-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 5px; background: var(--surface-default); outline: none; opacity: 0.9; transition: opacity .2s; }
        .rovalra-slider:hover { opacity: 1; }
        .rovalra-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #dc3545; cursor: pointer; }
        .rovalra-score-impact-text { text-align: center; font-size: 15px; color: var(--rovalra-secondary-text-color); margin-top: 10px; }
        
        .quick-ban-card { cursor: pointer; user-select: none; }
        .quick-ban-card .avatar-card-container { position: relative; }
        .quick-ban-card.selected .avatar-card-container { outline: 2px solid #dc3545; box-shadow: 0 0 5px #dc3545; border-radius: 3px; }
        .quick-ban-card.processed { opacity: 0.4; pointer-events: none; transition: opacity 0.5s; }
        
        .rovalra-loading-more { 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            padding: 20px; 
            width: 100%; 
            color: var(--rovalra-secondary-text-color);
            font-weight: 500;
            gap: 12px;
        }
        .rovalra-loading-more .spinner {
            position: relative;
            width: 24px;
            height: 24px;
        }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

export function refreshMainPageSelectionCount() {
    updateActionCount();
}

async function showActionOverlay(selectedMembers, isFromBotScan = false) {
    if (!selectedMembers.length) return;
    
    membersToAction = selectedMembers;

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = DOMPurify.sanitize(`
        <div class="rovalra-action-description">Review ${selectedMembers.length} selected members:</div>
        <ul class="rovalra-action-summary-list">
            ${selectedMembers.map(m => `<li>${m.user.displayName} (@${m.user.username})</li>`).join('')}
        </ul>
        ${isFromBotScan ? `<div class="rovalra-action-bot-warning rovalra-ban-warning"><strong>Warning:</strong> Ensure these are bots before taking action.</div>` : ''}
        <div class="rovalra-action-permission-warning rovalra-ban-warning" style="display:none"></div>
        <div class="rovalra-action-progress-container" style="display:none">
            <div class="rovalra-action-status-text"></div>
            <div class="rovalra-action-progress-bar-container">
                <div class="rovalra-action-progress-bar"></div>
            </div>
        </div>
    `);

    const btnBan = createBtn('Ban Members', 'btn-alert-md');
    const btnKick = createBtn('Kick Members', 'btn-control-md');
    const btnCancel = createBtn('Cancel', 'btn-secondary-md');

    const overlayInstance = createOverlay({
        title: `Action Required (${selectedMembers.length})`,
        bodyContent: bodyContainer,
        actions: [btnBan, btnKick, btnCancel],
        showLogo: true,
        preventBackdropClose: true
    });

    const permissions = await checkUserPermissions();
    const warningEl = bodyContainer.querySelector('.rovalra-action-permission-warning');
    if (!permissions.canBan) btnBan.disabled = true;
    if (!permissions.canKick) btnKick.disabled = true;

    if (!permissions.canBan && !permissions.canKick) {
        warningEl.textContent = "You do not have permission to ban or kick members.";
        warningEl.style.display = 'block';
    }

    btnBan.onclick = () => showDoubleConfirmOverlay('ban', isFromBotScan);
    btnKick.onclick = () => showDoubleConfirmOverlay('kick', isFromBotScan);
    btnCancel.onclick = () => {
        overlayInstance.close();
        window.rovalra.ui.actionOverlay = null;
    };

    window.rovalra.ui.actionOverlay = overlayInstance;
    
    btnCancel.classList.add('rovalra-action-cancel-btn');
    btnBan.classList.add('rovalra-action-ban-btn');
    btnKick.classList.add('rovalra-action-kick-btn');
}

function showDoubleConfirmOverlay(actionType, isFromBotScan) {
    const memberCount = membersToAction.length;
    const bodyContent = document.createElement('div');
    
    let message = actionType === 'ban' 
        ? `You are about to <strong>ban ${memberCount} member(s)</strong>. They will be permanently blocked.` 
        : `You are about to <strong>kick ${memberCount} member(s)</strong>. They can rejoin anytime.`;
        
    if (actionType === 'ban' && isFromBotScan) {
        message += `<br><br><div class="rovalra-ban-warning" style="margin-top:0;"><strong>Reminder:</strong> Verify bot scores before banning.</div>`;
    }

    bodyContent.innerHTML = DOMPurify.sanitize(`<div id="rovalra-double-confirm-message" style="text-align:center; font-size:16px;">${message}</div>`);

    const btnConfirm = createBtn(`Yes, ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`, 'btn-alert-md');
    const btnCancel = createBtn('Cancel', 'btn-secondary-md');

    const overlayInstance = createOverlay({
        title: 'Confirm Action',
        bodyContent: bodyContent,
        actions: [btnConfirm, btnCancel],
        maxWidth: '400px'
    });

    window.rovalra.ui.doubleConfirmOverlay = overlayInstance;

    btnConfirm.onclick = () => {
        overlayInstance.close();
        processMembers(actionType);
    };

    btnCancel.onclick = () => overlayInstance.close();
}

function createBtn(text, className) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = className;
    return btn;
}

let membersToAction = [];

async function processMembers(actionType) {
    const groupId = getGroupIdFromUrl();
    if (!groupId) return;

    const overlayInstance = window.rovalra.ui.actionOverlay;
    if (!overlayInstance || !overlayInstance.overlay) return;

    const overlayEl = overlayInstance.overlay;
    const totalMembers = membersToAction.length;
    let successCount = 0;
    const failedMembers = [];

    const progressBar = overlayEl.querySelector('.rovalra-action-progress-bar');
    const statusText = overlayEl.querySelector('.rovalra-action-status-text');
    const progressContainer = overlayEl.querySelector('.rovalra-action-progress-container');
    const summaryList = overlayEl.querySelector('.rovalra-action-summary-list');
    const warning = overlayEl.querySelector('.rovalra-action-bot-warning');
    const btns = overlayEl.querySelectorAll('button:not(.rovalra-action-cancel-btn)'); 

    if(summaryList) summaryList.style.display = 'none';
    if(warning) warning.style.display = 'none';
    btns.forEach(b => b.style.display = 'none');
    
    if (progressContainer) {
        progressContainer.style.display = 'block';
        const barContainer = progressContainer.querySelector('.rovalra-action-progress-bar-container');
        if(barContainer) barContainer.style.display = 'block';
    }
    
    if(progressBar) progressBar.style.width = '0%';

    const startTime = Date.now();
    
    for (let i = 0; i < totalMembers; i++) {
        const member = membersToAction[i];
        const user = member.user;
        let success = false;

        const elapsedTime = (Date.now() - startTime) / 1000;
        const avgTimePerUser = i > 0 ? elapsedTime / i : 2;
        const remainingTime = Math.round(avgTimePerUser * (totalMembers - i));
        
        if(statusText) statusText.textContent = `Processing ${i + 1} of ${totalMembers}: ${user.displayName}... ETA: ${remainingTime}s`;

        try {
            if (actionType === 'ban') {
                await banUser(groupId, user.userId);
            } else if (actionType === 'kick') {
                await kickUser(groupId, user.userId);
            }
            success = true;
        } catch (error) {
            let reason = error.message || 'Unknown Error';
            if (error.status) reason = `API Error ${error.status}`;
            failedMembers.push({ user, reason });
        }

        if (success) {
            successCount++;
            antiBotState.allMembersCache = antiBotState.allMembersCache.filter(m => m.user.userId !== user.userId);
            antiBotState.likelyBotsCache = antiBotState.likelyBotsCache.filter(m => m.user.userId !== user.userId);
            quickActionState.members = quickActionState.members.filter(m => m.user.userId !== user.userId);
            
            const cardElement = document.getElementById(`quick-ban-card-${user.userId}`);
            if (cardElement) {
                cardElement.classList.add('processed');
                cardElement.classList.remove('selected');
                const radio = cardElement.querySelector('button[role="checkbox"]');
                if (radio && radio.setChecked) radio.setChecked(false);
            }
        }
        if(progressBar) progressBar.style.width = `${((i + 1) / totalMembers) * 100}%`;
    }

    let finalMessage = `${successCount} of ${totalMembers} members were successfully ${actionType}ed.`;
    if (failedMembers.length > 0) finalMessage += `\n${failedMembers.length} failed.`;
    
    if(statusText) statusText.innerHTML = DOMPurify.sanitize(finalMessage.replace('\n', '<br>'));
    
    const cancelBtn = overlayEl.querySelector('.rovalra-action-cancel-btn');
    if(cancelBtn) {
        cancelBtn.textContent = 'Close';
        cancelBtn.style.display = 'block'; 
    }
    
    updateActionCount();
}

function createMemberCard(member, thumbnail, isBot = false) {
    const li = document.createElement('li');
    li.className = 'list-item avatar-card quick-ban-card';
    li.id = `quick-ban-card-${member.user.userId}`;

    const container = document.createElement('div');
    container.className = 'avatar-card-container';
    container.style.position = 'relative';

    const radio = createRadioButton({
        id: `rb-${member.user.userId}`,
        checked: false,
        onChange: (isChecked) => {
            li.classList.toggle('selected', isChecked);
            updateActionCount();
        }
    });
    radio.style.position = 'absolute';
    radio.style.top = '4px';
    radio.style.right = '4px';
    radio.style.zIndex = '10';

    const content = document.createElement('div');
    content.className = 'avatar-card-content';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'avatar avatar-card-fullbody';
    
    const thumbContainer = document.createElement('span');
    thumbContainer.className = 'thumbnail-2d-container';
    thumbContainer.style.cssText = 'display:flex;justify-content:center;align-items:center;width:100%;height:100%;';
    
    const thumbEl = createThumbnailElement(thumbnail, member.user.displayName);
    thumbContainer.appendChild(thumbEl);
    avatarDiv.appendChild(thumbContainer);

    const captionDiv = document.createElement('div');
    captionDiv.className = 'avatar-card-caption';
    
    const span = document.createElement('span');
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'avatar-name text-overflow';
    nameDiv.textContent = member.user.displayName;
    
    const tagDiv = document.createElement('div');
    tagDiv.className = 'avatar-card-label text-overflow';
    tagDiv.textContent = `@${member.user.username}`;
    
    span.append(nameDiv, tagDiv);

    if (isBot) {
        const { score } = member;
        let scoreColor = score >= 85 ? "#e34040" : score >= 60 ? "#f58d42" : "#f5c542";
        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'avatar-card-label';
        scoreDiv.style.cssText = `color:${scoreColor};font-weight:bold;`;
        scoreDiv.textContent = `Score: ${score}/100`;
        span.appendChild(scoreDiv);
    }

    captionDiv.appendChild(span);
    content.append(avatarDiv, captionDiv);
    container.append(radio, content);
    li.appendChild(container);

    li.addEventListener('click', (e) => {
        const currentState = radio.getAttribute('aria-checked') === 'true';
        radio.setChecked(!currentState);
        li.classList.toggle('selected', !currentState);
        updateActionCount();
    });

    return li;
}

function updateActionCount() {
    ['rovalra-quick-ban-list', 'rovalra-bot-list'].forEach(listId => {
        const container = document.getElementById(listId);
        if (!container || container.offsetParent === null) return; 

        const btnId = listId === 'rovalra-quick-ban-list' ? 'rovalra-quick-ban-confirm-btn' : 'rovalra-antibot-confirm-btn';
        const btn = document.getElementById(btnId);
        
        if (container && btn) {
            const count = container.querySelectorAll('button[role="checkbox"][aria-checked="true"]').length;
            btn.textContent = `Action (${count})`;
            btn.disabled = count === 0;
            
            const selectAllBtnId = listId === 'rovalra-quick-ban-list' ? 'rovalra-quick-ban-select-all-btn' : 'rovalra-antibot-select-all-btn';
            const selectAllBtn = document.getElementById(selectAllBtnId);
            if (selectAllBtn) {
                const total = container.querySelectorAll('.quick-ban-card').length;
                selectAllBtn.textContent = (count > 0 && count === total) ? 'Unselect All' : 'Select All';
            }
        }
    });
}

async function addFeatureButtons(searchContainer) {
    if (document.getElementById('rovalra-button-container')) return;

    const settings = await getFeatureSettings();
    if (!settings.antibotsEnabled && !settings.QuickActionsEnabled) return;

    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'rovalra-button-container';
    buttonContainer.style.cssText = 'display: flex; gap: 5px;';

    let antiBotsButton, banByScoreButton, antiBotSelectAllButton, antiBotConfirmButton;
    let quickBanButton, quickBanSelectAllButton, quickBanConfirmButton;

    function createBtnControl(id, text, extraClass = '', hidden = false) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = `btn-control btn-control-sm ${extraClass}`;
        btn.textContent = text;
        if (hidden) btn.style.display = 'none';
        return btn;
    }

    if (settings.antibotsEnabled) {
        antiBotsButton = createBtnControl('rovalra-anti-bots-btn', 'Anti Bots');
        banByScoreButton = createBtnControl('rovalra-ban-by-score-btn', 'Ban by Score', 'btn-alert-sm', true);
        antiBotSelectAllButton = createBtnControl('rovalra-antibot-select-all-btn', 'Select All', '', true);
        antiBotConfirmButton = createBtnControl('rovalra-antibot-confirm-btn', 'Action (0)', 'btn-alert-sm', true);
        buttonContainer.append(antiBotSelectAllButton, antiBotConfirmButton, banByScoreButton, antiBotsButton);
    }

    if (settings.QuickActionsEnabled) {
        quickBanButton = createBtnControl('rovalra-quick-ban-btn', 'Quick Action', 'btn-secondary-sm');
        quickBanSelectAllButton = createBtnControl('rovalra-quick-ban-select-all-btn', 'Select All', '', true);
        quickBanConfirmButton = createBtnControl('rovalra-quick-ban-confirm-btn', 'Action (0)', 'btn-alert-sm', true);
        buttonContainer.prepend(quickBanSelectAllButton, quickBanConfirmButton, quickBanButton);
    }

    if (buttonContainer.children.length > 0) {
        const parentContainer = searchContainer.parentNode;
        parentContainer.style.display = 'flex';
        parentContainer.style.alignItems = 'center';
        const spacer = document.createElement('div');
        spacer.style.flexGrow = '1';
        parentContainer.insertBefore(spacer, searchContainer);
        parentContainer.insertBefore(buttonContainer, searchContainer);
    }

    const membersTitleElement = document.querySelector('h2.group-title-with-input');
    const originalMembersTitleText = membersTitleElement ? membersTitleElement.textContent : 'Members';
    const originalMemberList = document.querySelector('.hlist.avatar-cards');
    const roleDropdown = document.querySelector('.input-group-btn.group-dropdown');
    
    let botMemberListContainer, quickBanListContainer;
    let isBotDetectionActive = false, isQuickBanActive = false;

    const resetUiState = () => {
        if (quickActionState.scrollListener) {
            window.removeEventListener('scroll', quickActionState.scrollListener);
            quickActionState.scrollListener = null;
        }
        if (quickActionState.abortController) {
            quickActionState.abortController.abort();
            quickActionState.abortController = null;
        }
        quickActionState.members = [];
        quickActionState.cursor = null;
        if (quickBanListContainer) { quickBanListContainer.remove(); quickBanListContainer = null; }

        if (antiBotState.abortController) {
            antiBotState.abortController.abort();
            antiBotState.abortController = null;
        }
        if (antiBotState.scrollListener) {
            window.removeEventListener('scroll', antiBotState.scrollListener);
            antiBotState.scrollListener = null;
        }
        antiBotState.hashesCache = {}; 
        
        if (botMemberListContainer) { botMemberListContainer.remove(); botMemberListContainer = null; }
        
        [banByScoreButton, quickBanConfirmButton, quickBanSelectAllButton, 
         antiBotConfirmButton, antiBotSelectAllButton].forEach(b => { if(b) b.style.display = 'none'; });

        if (antiBotsButton) { antiBotsButton.textContent = 'Anti Bots'; antiBotsButton.disabled = false; antiBotsButton.style.display = ''; }
        if (quickBanButton) { quickBanButton.textContent = 'Quick Action'; quickBanButton.style.display = ''; }
        if (membersTitleElement) membersTitleElement.textContent = originalMembersTitleText;
        if (originalMemberList) originalMemberList.style.display = '';
        if (searchContainer) searchContainer.style.display = '';
        if (roleDropdown) roleDropdown.style.display = '';
        
        isBotDetectionActive = false;
        isQuickBanActive = false;
    };

    function toggleSelectAll(container, btn) {
        if (!container) return;
        const shouldSelect = btn.textContent === 'Select All';
        const radios = container.querySelectorAll('button[role="checkbox"]');
        
        radios.forEach(radio => {
            radio.setChecked(shouldSelect);
            const card = radio.closest('.quick-ban-card');
            if (card) card.classList.toggle('selected', shouldSelect);
        });
        
        updateActionCount();
    }

    if (quickBanSelectAllButton) quickBanSelectAllButton.onclick = () => toggleSelectAll(quickBanListContainer, quickBanSelectAllButton);
    if (antiBotSelectAllButton) antiBotSelectAllButton.onclick = () => toggleSelectAll(botMemberListContainer, antiBotSelectAllButton);

    function getSelectedMembers(cache) {
        const selectedIds = new Set();
        const container = isQuickBanActive ? quickBanListContainer : botMemberListContainer;
        if (!container) return [];

        container.querySelectorAll('button[role="checkbox"][aria-checked="true"]').forEach(btn => {
            const userId = parseInt(btn.id.replace('rb-', ''));
            selectedIds.add(userId);
        });

        return cache.filter(m => selectedIds.has(m.user.userId));
    }

    if (quickBanConfirmButton) quickBanConfirmButton.onclick = () => {
        showActionOverlay(getSelectedMembers(quickActionState.members), false);
    };
    if (antiBotConfirmButton) antiBotConfirmButton.onclick = () => {
        showActionOverlay(getSelectedMembers(antiBotState.likelyBotsCache), true);
    };

    if (quickBanButton) {
        quickBanButton.onclick = async function() {
            if (isQuickBanActive) { resetUiState(); return; }
            resetUiState();
            
            isQuickBanActive = true;
            quickBanButton.textContent = 'Cancel';
            if (antiBotsButton) antiBotsButton.style.display = 'none';
            if (searchContainer) searchContainer.style.display = 'none';
            if (roleDropdown) roleDropdown.style.display = 'none';
            originalMemberList.style.display = 'none';

            quickBanListContainer = document.createElement('ul');
            quickBanListContainer.id = 'rovalra-quick-ban-list';
            quickBanListContainer.className = 'hlist avatar-cards';
            originalMemberList.parentNode.insertBefore(quickBanListContainer, originalMemberList.nextSibling);

            quickActionState.groupId = getGroupIdFromUrl();
            quickActionState.cursor = null;
            quickActionState.hasMore = true;
            quickActionState.isLoading = false;
            quickActionState.abortController = new AbortController();

            if (membersTitleElement) membersTitleElement.textContent = 'Loading Members...';
            await loadNextQuickBanPage();

            quickActionState.scrollListener = () => {
                if (!isQuickBanActive) return;
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                    loadNextQuickBanPage();
                }
            };
            window.addEventListener('scroll', quickActionState.scrollListener);
            
            quickBanConfirmButton.style.display = '';
            quickBanConfirmButton.disabled = true;
            quickBanSelectAllButton.style.display = '';
            quickBanSelectAllButton.textContent = 'Select All';
        };
    }

    async function loadNextQuickBanPage() {
        if (quickActionState.isLoading || !quickActionState.hasMore || !isQuickBanActive) return;
        quickActionState.isLoading = true;
        
        let loader = quickBanListContainer.querySelector('.rovalra-loading-more');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'rovalra-loading-more';
            loader.innerHTML = DOMPurify.sanitize('<span class="spinner spinner-default"></span> <span>Loading more...</span>');
            quickBanListContainer.appendChild(loader);
        }

        try {
            const signal = quickActionState.abortController.signal;
            const pageData = await fetchMemberPageWithRetry(quickActionState.groupId, quickActionState.cursor);
            if (signal.aborted) { loader.remove(); return; }

            const newMembers = pageData.data || [];
            quickActionState.cursor = pageData.nextPageCursor;
            quickActionState.hasMore = !!pageData.nextPageCursor;
            loader.remove(); 

            if (newMembers.length > 0) {
                quickActionState.members = quickActionState.members.concat(newMembers);
                const ids = newMembers.map(m => m.user.userId);
                const thumbnails = await getThumbnailsWithCache(ids, signal);
                if (signal.aborted) return;
                
                newMembers.forEach(member => {
                    const thumb = thumbnails.find(t => t && t.targetId === member.user.userId);
                    const card = createMemberCard(member, thumb);
                    quickBanListContainer.appendChild(card);
                });
                
                equalizeCardHeights(quickBanListContainer);
                if (membersTitleElement) membersTitleElement.textContent = `Select Members for Action (${quickActionState.members.length} Loaded)`;
            } else if (quickActionState.members.length === 0) {
                quickBanListContainer.innerHTML = DOMPurify.sanitize(`<div style="text-align: center; padding: 20px;">No members found.</div>`);
            }
        } catch (e) {
            loader.remove();
            if (e.name !== 'AbortError') console.error(e);
        } finally {
            quickActionState.isLoading = false;
        }
    }

    function renderNextBotBatch() {
        if (!botMemberListContainer) return;

        const BATCH_SIZE = 50; 
        const totalBots = antiBotState.likelyBotsCache.length;
        
        if (antiBotState.renderCursor >= totalBots) return;

        const nextBatch = antiBotState.likelyBotsCache.slice(
            antiBotState.renderCursor, 
            antiBotState.renderCursor + BATCH_SIZE
        );

        const fragment = document.createDocumentFragment();

        nextBatch.forEach(member => {
            const thumb = antiBotState.thumbnailCache[member.user.userId];
            const card = createMemberCard(member, thumb, true);
            fragment.appendChild(card);
        });

        botMemberListContainer.appendChild(fragment);
        antiBotState.renderCursor += nextBatch.length;

        equalizeCardHeights(botMemberListContainer);
    }

    if (antiBotsButton) {
        antiBotsButton.onclick = async function() {
            if (isBotDetectionActive) { resetUiState(); return; }
            resetUiState();

            isBotDetectionActive = true;
            antiBotsButton.textContent = 'Cancel';
            if (quickBanButton) quickBanButton.style.display = 'none';
            if (searchContainer) searchContainer.style.display = 'none';
            if (roleDropdown) roleDropdown.style.display = 'none';
            originalMemberList.style.display = 'none';

            botMemberListContainer = document.createElement('ul');
            botMemberListContainer.id = 'rovalra-bot-list';
            botMemberListContainer.className = 'hlist avatar-cards';
            originalMemberList.parentNode.insertBefore(botMemberListContainer, originalMemberList.nextSibling);

            antiBotState.abortController = new AbortController();
            const signal = antiBotState.abortController.signal;

            let processedImageCount = 0;
            let loadedMemberCount = 0;
            let totalGroupMembers = 0;

            const updateLoadingStatus = () => {
                if (!membersTitleElement) return;
                const pct = totalGroupMembers > 0 ? Math.round((loadedMemberCount / totalGroupMembers) * 100) : 0;
                membersTitleElement.innerHTML = DOMPurify.sanitize(`
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="spinner spinner-default" style="width:20px;height:20px;"></span>
                        <span>Scanned: ${loadedMemberCount} (${pct}%) | Analyzed: ${processedImageCount}</span>
                    </div>`);
            };

            const imageProcessingTasks = [];
            const processBatch = async (members) => {
                try {
                    const ids = members.map(m => m.user.userId);
                    const thumbnails = await getThumbnailsWithCache(ids, signal);
                    if (signal.aborted) return;
                    
                    const hashes = await calculateAllHashes(thumbnails);
                    if (signal.aborted) return;

                    hashes.forEach(h => {
                        if (h && h.hash) antiBotState.hashesCache[h.id] = h;
                    });
                    
                    processedImageCount += members.length;
                    updateLoadingStatus();
                } catch (e) {
                    console.warn("Batch processing error", e);
                }
            };

            try {
                const groupId = getGroupIdFromUrl();

                if (membersTitleElement) membersTitleElement.textContent = "Initializing Scan...";
                const groupDetails = await getGroupDetails(groupId);
                totalGroupMembers = groupDetails.memberCount || 1;
                
                const roles = await fetchGroupRoles(groupId);
                const defaultRole = roles.find(r => r.rank === 1); 

                let cursor = null;
                let more = true;
                antiBotState.allMembersCache = [];

                while (more) {
                    if (signal.aborted) throw new Error('Aborted');

                    await new Promise(r => setTimeout(r, 200));

                    try {
                        const data = await fetchMemberPageWithRetry(groupId, cursor);
                        
                        if (!data || !data.data) {
                            console.warn("Empty data received, stopping scan.");
                            break;
                        }

                        const pageMembers = data.data;
                        antiBotState.allMembersCache = antiBotState.allMembersCache.concat(pageMembers);
                        loadedMemberCount = antiBotState.allMembersCache.length;
                        updateLoadingStatus();

                        const candidates = pageMembers.filter(m => m.role.id === defaultRole?.id);
                        
                        if (candidates.length > 0) {
                            const task = processBatch(candidates);
                            imageProcessingTasks.push(task);
                            
                            if (imageProcessingTasks.length > 10) {
                                await imageProcessingTasks.shift(); 
                            }
                        }

                        cursor = data.nextPageCursor;
                        
                        more = !!cursor;

                    } catch (err) {
                        console.error("Error fetching page:", err);
                        break; 
                    }
                }
                if (membersTitleElement) membersTitleElement.innerHTML = `<span class="spinner spinner-default"></span> Finalizing analysis...`;
                await Promise.all(imageProcessingTasks);

                if (signal.aborted) throw new Error('Aborted');


                const potentialBots = antiBotState.allMembersCache.filter(m => m.role.id === defaultRole?.id);
                const hashList = potentialBots.map(m => antiBotState.hashesCache[m.user.userId]).filter(Boolean);

                const groups = findSimilarAvatars(hashList);
                antiBotState.likelyBotsCache = analyzeMembersForBotScore(potentialBots, groups);
                
                if (!isBotDetectionActive) return;
                
                if (membersTitleElement) {
                     membersTitleElement.textContent = antiBotState.likelyBotsCache.length > 0 ? 
                        `${antiBotState.likelyBotsCache.length} Likely Bots Found` : 'No Likely Bots Found';
                }

                if (antiBotState.likelyBotsCache.length > 0) {
                    banByScoreButton.style.display = '';
                    antiBotSelectAllButton.style.display = '';
                    antiBotSelectAllButton.textContent = 'Select All';
                    antiBotConfirmButton.style.display = '';
                    antiBotConfirmButton.disabled = true;

                    antiBotState.renderCursor = 0;
                    renderNextBotBatch();

                    antiBotState.scrollListener = () => {
                        if (!isBotDetectionActive) return;
                        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                            renderNextBotBatch();
                        }
                    };
                    window.addEventListener('scroll', antiBotState.scrollListener);
                } else {
                    botMemberListContainer.innerHTML = DOMPurify.sanitize(`<div style="text-align: center; padding: 20px;">No bots detected.</div>`);
                }

            } catch (e) {
                if (e.message !== 'Aborted') {
                    antiBotsButton.textContent = 'Error - Retry';
                    console.error(e);
                    if (membersTitleElement) membersTitleElement.textContent = 'Error during scan.';
                } else {
                    resetUiState();
                }
            }
        };
    }
    
    if (banByScoreButton) {
        banByScoreButton.onclick = () => {
            if (antiBotState.likelyBotsCache.length === 0) return;

            const bodyContainer = document.createElement('div'); bodyContainer.innerHTML = DOMPurify.sanitize(`
                <div class="rovalra-score-selector-container">
                    <label>Minimum Bot Score: <span id="rovalra-score-value">50</span></label>
                    <input type="range" id="rovalra-score-slider" class="rovalra-slider" min="20" max="100" value="50">
                    <div class="rovalra-score-impact-text">
                        This will select approximately <span id="rovalra-score-ban-count">0</span> members.
                    </div>
                </div>
                <div id="rovalra-score-action-container"></div>
            `);

            let selectedAction = 'ban';
            const actionDropdown = createDropdown({
                items: [{ value: 'ban', label: 'Ban' }, { value: 'kick', label: 'Kick' }],
                initialValue: 'ban',
                onValueChange: (value) => { selectedAction = value; }
            });
            bodyContainer.querySelector('#rovalra-score-action-container').appendChild(actionDropdown.element);

            const btnConfirm = createBtnControl('Confirm', 'btn-alert-md');
            const btnCancel = createBtnControl('Cancel', 'btn-secondary-md');

            const overlayInstance = createOverlay({
                title: 'Ban/Kick by Score',
                bodyContent: bodyContainer,
                actions: [btnConfirm, btnCancel]
            });

            const slider = bodyContainer.querySelector('#rovalra-score-slider');
            const valDisplay = bodyContainer.querySelector('#rovalra-score-value');
            const countDisplay = bodyContainer.querySelector('#rovalra-score-ban-count');

            const update = () => {
                const min = parseInt(slider.value, 10);
                valDisplay.textContent = min;
                const matches = antiBotState.likelyBotsCache.filter(m => m.score >= min);
                countDisplay.textContent = matches.length;
                btnConfirm.textContent = `Confirm (${matches.length})`;
                btnConfirm.disabled = matches.length === 0;
                overlayInstance._tempMatches = matches;
            };

            slider.oninput = update;
            update();

            btnConfirm.onclick = () => {
                const matches = overlayInstance._tempMatches || [];
                if (matches.length > 0) {
                    overlayInstance.close();
                    membersToAction = matches;
                    showDoubleConfirmOverlay(selectedAction, true);
                }
            };

            btnCancel.onclick = () => overlayInstance.close();
        };
    }
}

function getGroupIdFromUrl() {
    const match = window.location.href.match(/id=(\d+)/);
    return match ? match[1] : null;
}

async function fetchMemberPageWithRetry(groupId, cursor, retries = 3) {

    const params = new URLSearchParams({
        limit: '100',
        sortOrder: 'Desc'
    });

    if (cursor) {
        params.append('cursor', cursor);
    }

    const endpoint = `/v1/groups/${groupId}/users?${params.toString()}`;

    for (let i = 0; i < retries; i++) {
        try {
            return await callRobloxApiJson({
                subdomain: 'groups',
                endpoint: endpoint
            });
        } catch (error) {
            if (i === retries - 1) throw error;
            
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
async function fetchGroupRoles(groupId) {
    const data = await callRobloxApiJson({ subdomain: 'groups', endpoint: `/v1/groups/${groupId}/roles` });
    return data.roles || [];
}

async function getThumbnailsWithCache(userIds, signal) {
    const missingIds = userIds.filter(id => !antiBotState.thumbnailCache[id]);
    
    if (missingIds.length > 0) {
        const items = missingIds.map(id => ({ id }));
        const newThumbsMap = await fetchThumbnails(items, 'AvatarHeadshot', '150x150', false, signal);
        newThumbsMap.forEach((data, id) => {
            antiBotState.thumbnailCache[id] = data;
        });
    }
    
    return userIds.map(id => antiBotState.thumbnailCache[id]).filter(Boolean);
}

async function calculateAllHashes(thumbnails) {
    return await Promise.all(thumbnails.map(t => {
        if (t?.imageUrl && t.state !== "Blocked") {
            return calculateImageHash(t.imageUrl).then(h => ({ id: t.targetId, hash: h }));
        }
        return Promise.resolve({ id: t?.targetId, hash: null });
    }));
}
async function calculateImageHash(url) {
    try {
        const img = new Image(); img.crossOrigin = "Anonymous";
        return new Promise(res => {
            img.onload = () => {
                const c = document.createElement('canvas'); c.width=9; c.height=8;
                const ctx = c.getContext('2d'); ctx.drawImage(img,0,0,9,8);
                const d = ctx.getImageData(0,0,9,8).data;
                const gray = []; for(let i=0;i<d.length;i+=4) gray.push(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
                let h=''; for(let y=0;y<8;y++) for(let x=0;x<8;x++) h+=gray[y*9+x]<gray[y*9+x+1]?'1':'0';
                res(h);
            };
            img.onerror = () => res(null); img.src = url;
        });
    } catch { return null; }
}
function findSimilarAvatars(hashes) {
    const valid = hashes.filter(h => h?.hash);
    const groups = []; const processed = new Set();
    for (let i=0; i<valid.length; i++) {
        if (processed.has(i)) continue;
        const group = [valid[i]]; processed.add(i);
        for (let j=i+1; j<valid.length; j++) {
            if (!processed.has(j)) {
                let dist=0; const h1=valid[i].hash, h2=valid[j].hash;
                for(let k=0;k<Math.min(h1.length,h2.length);k++) if(h1[k]!==h2[k]) dist++;
                if (dist <= 5) { group.push(valid[j]); processed.add(j); }
            }
        }
        if (group.length > 1) groups.push(group);
    }
    return groups;
}
function analyzeMembersForBotScore(members, groups) {
    const names = new Map(); members.forEach(m => names.set(m.user.displayName, (names.get(m.user.displayName)||0)+1));
    const grpData = new Map(); groups.forEach(g => g.forEach(m => grpData.set(m.id, { size: g.length })));
    return members.map(m => {
        const nc = names.get(m.user.displayName)||0;
        const gs = grpData.get(m.user.userId)?.size||0;
        const ns = nc>=25?60:nc>=10?50:nc>=4?35:nc>=2?20:0;
        const as = gs>=10?40:gs>=5?30:gs>=3?15:gs>=2?10:0;
        return { ...m, score: Math.min(ns+as, 100), scoreBreakdown: { nameCount: nc, avatarGroupSize: gs } };
    }).filter(m => m.score >= 20).sort((a,b) => b.score - a.score);
}
function equalizeCardHeights(container) {
    const cards = container.querySelectorAll('.list-item.avatar-card');
    if (cards.length < 2) return;
    cards.forEach(c => c.style.height = 'auto');
    requestAnimationFrame(() => {
        let max = 0; cards.forEach(c => max = Math.max(max, c.offsetHeight));
        if(max > 0) cards.forEach(c => c.style.height = `${max}px`);
    });
}

let isAntiBotScriptActive = false;

function handleContainerRemoval() {
    document.getElementById('rovalra-button-container')?.remove();
}

function antiBotsFullCleanup() {
    handleContainerRemoval();
    const overlays = document.querySelectorAll('.rovalra-global-overlay');
    overlays.forEach(o => o.remove());
    
    document.getElementById('rovalra-quick-ban-list')?.remove();
    document.getElementById('rovalra-bot-list')?.remove();

    if (quickActionState.scrollListener) window.removeEventListener('scroll', quickActionState.scrollListener);
    if (quickActionState.abortController) quickActionState.abortController.abort();
    if (antiBotState.abortController) antiBotState.abortController.abort();
    if (antiBotState.scrollListener) window.removeEventListener('scroll', antiBotState.scrollListener);

    isAntiBotScriptActive = false;
}

async function checkUrlAndManageState() {
    const settings = await getFeatureSettings();
    const isMembersPage = /^https:\/\/www\.roblox\.com\/(?:[a-z]{2}\/)?communities\/configure\?id=\d+#!(\/)?members/.test(window.location.href);
    const active = isMembersPage && (settings.antibotsEnabled || settings.QuickActionsEnabled);

    if (active && !isAntiBotScriptActive) {
        isAntiBotScriptActive = true;
        observeElement('.input-group.search-container', (el) => addFeatureButtons(el), { onRemove: handleContainerRemoval });
    } else if (!active && isAntiBotScriptActive) {
        antiBotsFullCleanup();
    }
}

export function init() {
    injectUiCss();
    if (!window.rovalra) window.rovalra = {};
    if (!window.rovalra.ui) window.rovalra.ui = {};
    window.addEventListener('hashchange', checkUrlAndManageState);
    checkUrlAndManageState();
}