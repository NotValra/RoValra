
import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getBatchThumbnails, createThumbnailElement } from '../../core/thumbnail/thumbnails.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';

export function init() {
    if (!window.location.pathname.includes('/my/avatar')) return;

    chrome.storage.local.get('avatarRotatorEnabled', (data) => {
        if (!data.avatarRotatorEnabled) return;

        observeElement('.breadcrumb-container', (container) => {
        if (!window.location.pathname.includes('/my/avatar')) return;
        if (container.querySelector('.rovalra-avatar-rotator-btn')) return;

        const li = document.createElement('li');
        li.style.float = 'right';
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '5px';

        const stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.className = 'btn-control-xs rovalra-avatar-rotator-stop-btn';
        stopBtn.textContent = 'Stop Rotator';
        stopBtn.style.display = 'none';
        stopBtn.onclick = () => {
            chrome.storage.local.set({ rovalra_avatar_rotator_enabled: false });
        };

        const rotatorBtn = document.createElement('button');
        rotatorBtn.type = 'button';
        rotatorBtn.className = 'btn-secondary-xs rovalra-avatar-rotator-btn';
        rotatorBtn.textContent = 'Avatar Rotator';

        let nextPageCursor = '';
        let isLoading = false;
        let avatarListContainer = null;
        let selectedAvatars = new Set();
        let setRotatorsBtn = null;
        let disableRotatorBtn = null;

        function updateButtonState() {
            const count = selectedAvatars.size;

            if (setRotatorsBtn) {
                setRotatorsBtn.disabled = count < 2;
                setRotatorsBtn.textContent = count < 2 ? 'Select at least 2 avatars' : `Set as rotators (${count})`;
            }

            const statusText = document.getElementById('rovalra-avatar-status');
            if (statusText) {
                statusText.textContent = `Select avatars to rotate between. (${count} selected)`;
                statusText.style.color = '';
            }
        }

        async function fetchAndRenderAvatars(reset = false) {
            if (isLoading) return;
            if (reset) {
                nextPageCursor = '';
                if (avatarListContainer) avatarListContainer.innerHTML = '';
            }
            if (nextPageCursor === null && !reset) return; 

            isLoading = true;
            const loadBtn = document.getElementById('rovalra-avatar-load-more');
            if (loadBtn) loadBtn.textContent = 'Loading...';

            try {
                const queryParams = new URLSearchParams({
                    sortOption: '1',
                    pageLimit: '50',
                    'itemCategories[0].ItemSubType': '3',
                    'itemCategories[0].ItemType': 'Outfit'
                });
                if (nextPageCursor) queryParams.append('cursor', nextPageCursor);

                const response = await callRobloxApiJson({
                    subdomain: 'avatar',
                    endpoint: `/v1/avatar-inventory?${queryParams.toString()}`,
                    method: 'GET'
                });

                if (response.avatarInventoryItems && response.avatarInventoryItems.length > 0) {
                    const outfitIds = response.avatarInventoryItems.map(item => item.itemId);
                    const thumbnails = await getBatchThumbnails(outfitIds, 'Outfit', '150x150');

                    response.avatarInventoryItems.forEach((outfit, index) => {
                        const card = document.createElement('div');
                        card.className = 'rovalra-avatar-card';
                        card.style.cssText = 'display: flex; flex-direction: column; align-items: center; width: 100px; margin: 5px; cursor: pointer; border-radius: 10px; padding: 5px; transition: all 0.2s; position: relative;';

                        const radio = createRadioButton({
                            id: `avatar-radio-${outfit.itemId}`,
                            checked: selectedAvatars.has(outfit.itemId),
                            onChange: (checked) => {
                                if (checked) {
                                    selectedAvatars.add(outfit.itemId);
                                } else {
                                    selectedAvatars.delete(outfit.itemId);
                                }
                                updateButtonState();
                            }
                        });
                        radio.style.position = 'absolute';
                        radio.style.top = '5px';
                        radio.style.right = '5px';
                        radio.style.zIndex = '10';

                        card.onclick = () => {
                            if (!radio.disabled) {
                                radio.click();
                            }
                        };
                        
                        const thumbData = thumbnails.find(t => t.targetId === outfit.itemId);
                        const img = createThumbnailElement(thumbData, outfit.itemName, 'rovalra-avatar-thumb', { width: '100px', height: '100px', borderRadius: '8px', objectFit: 'cover' });
                        
                        const name = document.createElement('span');
                        name.textContent = outfit.itemName;
                        name.style.cssText = 'font-size: 12px; text-align: center; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;';

                        card.appendChild(radio);
                        card.appendChild(img);
                        card.appendChild(name);
                        avatarListContainer.appendChild(card);
                    });
                    if (avatarListContainer && avatarListContainer.parentElement) {
                        avatarListContainer.parentElement.style.height = 'auto';
                    }
                    updateButtonState();
                }

                nextPageCursor = response.nextPageCursor || null;
            } catch (error) {
                console.error('RoValra: Failed to fetch avatars', error);
            } finally {
                isLoading = false;
                if (loadBtn) {
                    loadBtn.textContent = 'Load More';
                    loadBtn.style.display = nextPageCursor ? 'block' : 'none';
                }
            }
        }

        rotatorBtn.addEventListener('click', () => {
            chrome.storage.local.get(['rovalra_avatar_rotator_ids', 'rovalra_avatar_rotator_enabled', 'rovalra_avatar_rotator_interval'], (data) => {
                selectedAvatars.clear();
                if (data.rovalra_avatar_rotator_ids && Array.isArray(data.rovalra_avatar_rotator_ids)) {
                    data.rovalra_avatar_rotator_ids.forEach(id => selectedAvatars.add(id));
                }

                avatarListContainer = document.createElement('div');
                avatarListContainer.style.cssText = 'display: flex; flex-wrap: wrap; justify-content: center; width: 100%; overflow-y: auto; flex: 1;';
                
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.id = 'rovalra-avatar-load-more';
                loadMoreBtn.className = 'btn-control-sm';
                loadMoreBtn.textContent = 'Load More';
                loadMoreBtn.style.cssText = 'display: none; margin: 10px auto; flex-shrink: 0;';
                loadMoreBtn.onclick = () => fetchAndRenderAvatars();

                const placeholderText = document.createElement('div');
                placeholderText.id = 'rovalra-avatar-status';
                placeholderText.textContent = `Select avatars to rotate between. (${selectedAvatars.size} selected)`;
                placeholderText.style.cssText = 'padding: 0 10px 10px 10px; text-align: center; font-size: 12px; opacity: 0.8; flex-shrink: 0;';

                const settingsContainer = document.createElement('div');
                settingsContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 0 10px 0; flex-shrink: 0;';
                
                const { container: inputContainer, input: intervalInput } = createStyledInput({
                    id: 'rovalra-rotator-interval',
                    label: 'Interval (seconds)'
                });

                intervalInput.type = 'number';
                intervalInput.min = '5';
                intervalInput.value = data.rovalra_avatar_rotator_interval || '5';
                inputContainer.style.width = '150px';
                inputContainer.style.marginTop = '5px';
                intervalInput.dispatchEvent(new Event('input'));
                
                intervalInput.addEventListener('change', () => {
                    if (parseInt(intervalInput.value) < 5) intervalInput.value = 5;
                });

                settingsContainer.appendChild(inputContainer);

                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 550px;';
                wrapper.appendChild(settingsContainer);
                wrapper.appendChild(placeholderText);
                wrapper.appendChild(avatarListContainer);
                wrapper.appendChild(loadMoreBtn);

                setRotatorsBtn = document.createElement('button');
                setRotatorsBtn.className = 'btn-primary-md';
                setRotatorsBtn.textContent = 'Select at least 2 avatars';
                setRotatorsBtn.disabled = true;
                setRotatorsBtn.onclick = () => {
                    const avatars = Array.from(selectedAvatars);
                    const interval = parseInt(intervalInput.value, 10) || 5;
                    chrome.storage.local.set({
                        rovalra_avatar_rotator_ids: avatars,
                        rovalra_avatar_rotator_enabled: true,
                        rovalra_avatar_rotator_interval: interval
                    });
                    setRotatorsBtn.textContent = 'Rotators Active!';
                    if (disableRotatorBtn) disableRotatorBtn.style.display = 'inline-block';
                    setTimeout(() => updateButtonState(), 2000);
                };

                disableRotatorBtn = document.createElement('button');
                disableRotatorBtn.className = 'btn-control-md';
                disableRotatorBtn.textContent = 'Disable';
                disableRotatorBtn.style.display = data.rovalra_avatar_rotator_enabled ? 'inline-block' : 'none';
                disableRotatorBtn.onclick = () => {
                    chrome.storage.local.set({
                        rovalra_avatar_rotator_enabled: false
                    });
                    disableRotatorBtn.style.display = 'none';
                };

                createOverlay({
                    title: 'Avatar Rotator',
                    bodyContent: wrapper,
                    showLogo: true,
                    maxWidth: '600px',
                    maxHeight: '600px',
                    actions: [disableRotatorBtn, setRotatorsBtn]
                });

                fetchAndRenderAvatars(true);
            });
        });

        li.appendChild(stopBtn);
        li.appendChild(rotatorBtn);
        container.appendChild(li);

        function updateStopButtonVisibility() {
            chrome.storage.local.get('rovalra_avatar_rotator_enabled', (data) => {
                stopBtn.style.display = data.rovalra_avatar_rotator_enabled ? 'inline-block' : 'none';
            });
        }

        updateStopButtonVisibility();
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.rovalra_avatar_rotator_enabled) {
                updateStopButtonVisibility();
            }
        });
    }, { multiple: true });
    });
}
