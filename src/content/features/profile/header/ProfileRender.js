import { observeElement } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { injectStylesheet } from '../../../core/ui/cssInjector.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';
import { createOverlay } from '../../../core/ui/overlay.js'; 
import { createDropdown } from '../../../core/ui/dropdown.js';
import { getAssets } from '../../../core/assets.js';
import { 
    RegisterWrappers, 
    RBXRenderer, 
    Instance, 
    HumanoidDescriptionWrapper, 
    RBX, 
    Outfit, 
    API,
    FLAGS,
    AnimatorWrapper,
    animNamesR15,
    animNamesR6
} from 'roavatar-renderer';

FLAGS.ASSETS_PATH = chrome.runtime.getURL("assets/rbxasset/");
FLAGS.USE_WORKERS = false; 


let currentRig = null;
let currentRigType = null;
let lastFrameTime = 0;
let emoteStopTimer = null;
let preloadedCanvas = null;
let isPreloading = false;
let globalAvatarData = null; 
let avatarDataPromise = null;

let activeEmoteId = null;
let activeAnimValue = null;


function getAnimatorW(rig = currentRig) {
    if (!rig) return null;
    const humanoid = rig.FindFirstChildOfClass("Humanoid");
    const animator = humanoid?.FindFirstChildOfClass("Animator");
    return animator ? new AnimatorWrapper(animator) : null;
}

async function playIdle() {
    const animatorW = getAnimatorW();
    if (animatorW) animatorW.playAnimation("idle");
    activeEmoteId = null;
    activeAnimValue = null;
}

async function playEmote(emoteAssetId, loop = false, durationLimit = null) {
 if (!currentRig || currentRigType !== 'R15') {
        console.warn("Emotes are only supported on R15 rigs.");
        return false;
    }
    if (emoteStopTimer) clearTimeout(emoteStopTimer);

    const animatorW = getAnimatorW();
    if (!animatorW) return false;

    if (activeEmoteId === emoteAssetId) {
        await playIdle();
        return false; 
    }

    const animName = `emote.${emoteAssetId}`;
    await animatorW.loadAvatarAnimation(BigInt(emoteAssetId), true, loop);
    animatorW.playAnimation(animName);
    
    activeEmoteId = emoteAssetId;
    activeAnimValue = null; 

    if (durationLimit) {
        emoteStopTimer = setTimeout(() => {
            if (activeEmoteId === emoteAssetId) playIdle();
            emoteStopTimer = null;
        }, durationLimit * 1000);
    }
    return true; 
}

// Prerendering
async function loadRig(rigType) {
    if (!globalAvatarData) return;
    if (currentRig) {
        currentRig.Destroy();
        currentRig = null;
    }

    const outfit = new Outfit();
    outfit.fromJson(globalAvatarData);
    outfit.playerAvatarType = rigType;

    const rigUrl = chrome.runtime.getURL(`assets/Rig${rigType}.rbxm`);
    const rigResult = await API.Asset.GetRBX(rigUrl, undefined);

    if (rigResult instanceof RBX) {
        currentRig = rigResult.generateTree().GetChildren()[0];
        const humanoid = currentRig?.FindFirstChildOfClass("Humanoid");
        if (humanoid) {
            const desc = new Instance("HumanoidDescription");
            const wrapper = new HumanoidDescriptionWrapper(desc);
            wrapper.fromOutfit(outfit);
            await wrapper.applyDescription(humanoid);
            
            RBXRenderer.addInstance(currentRig, null);
            currentRigType = rigType;

            // If we just loaded R15, background-trigger the emote loads for this specific rig
            if (rigType === 'R15' && globalAvatarData.emotes) {
                const animatorW = getAnimatorW(currentRig);
                globalAvatarData.emotes.forEach(emote => {
                    animatorW?.loadAvatarAnimation(BigInt(emote.assetId), true, false);
                });
            }

            await playIdle();
        }
    }
}

// Emote menu
async function createEmoteRadialMenu(emotesData, onSelect) {
    injectStylesheet('css/profileRender.css', 'rovalra-profile-render-css');

    const container = document.createElement('div');
    container.className = 'emotes-radial-menu-wrapper';

    const assetIds = emotesData.map(e => e.assetId);
    let thumbMap = {};
    if (assetIds.length > 0) {
        try {
            const thumbResponse = await callRobloxApiJson({
                subdomain: 'thumbnails',
                endpoint: `/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Webp&isCircular=false`
            });
            thumbResponse.data.forEach(item => {
                thumbMap[item.targetId] = item.imageUrl;
            });
        } catch (e) { console.error(e); }
    }

    container.innerHTML = `
        <div class="emotes-radial-menu">
            <div class="emotes-radial-background-layer">
                <div class="emotes-radial-img"></div>
                <div class="text-emphasis emotes-radial-middle-text">Choose an emote to play</div>
            </div>
            <div class="emotes-radial-slices"></div>
        </div>
    `;

    const sliceParent = container.querySelector('.emotes-radial-slices');
    const middleText = container.querySelector('.emotes-radial-middle-text');

    const radius = 145; 
    const centerX = 210; 
    const centerY = 210; 

    for (let i = 0; i < 8; i++) {
        const slotNumber = i + 1;
        const emote = emotesData.find(e => e.position === slotNumber);
        const angle = ((i * 45) - 90) * (Math.PI / 180);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        const sliceDiv = document.createElement('div');
        sliceDiv.className = 'emotes-radial-slice-container';
        sliceDiv.style.left = `${x}px`;
        sliceDiv.style.top = `${y}px`;

        const hasEmote = !!emote;
        const thumbUrl = hasEmote ? thumbMap[emote.assetId] : '';
        const emoteName = hasEmote ? emote.assetName : 'Empty Slot';

        sliceDiv.innerHTML = `
            <div class="emotes-radial-button ${!hasEmote ? 'slice-disabled' : ''}">
                <div class="emotes-radial-icon">
                    <div class="emotes-radial-thumb">
                        <span class="thumbnail-2d-container emotes-radial-thumbnail">
                            ${hasEmote ? `<img src="${thumbUrl}" alt="">` : ''}
                        </span>
                    </div>
                </div>
                <div class="emotes-radial-index">${slotNumber}</div>
            </div>
        `;//Verified
        // Should be safe since this doesnt have a emote name added into the html and using safeHtml or dompurify here may break thumbnail urls

        if (hasEmote) {
            sliceDiv.addEventListener('mouseenter', () => middleText.textContent = emoteName);
            sliceDiv.addEventListener('mouseleave', () => middleText.textContent = 'Choose an emote to play');
            sliceDiv.addEventListener('click', () => onSelect(emote));
        }
        sliceParent.appendChild(sliceDiv);
    }
    return container;
}


function injectCustomButtons(container) {
    if (!globalAvatarData || container.querySelector('.rovalra-custom-controls')) return;

    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'rovalra-custom-controls';
    
    Object.assign(controlsWrapper.style, {
        display: 'flex',
        gap: '5px',
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: '10'
    });

    const assets = getAssets();

    if (globalAvatarData.emotes?.length > 0) {
        const emoteIcon = document.createElement('img');
        emoteIcon.src = assets.Emotes;
        emoteIcon.style.width = '24px';
        emoteIcon.style.height = '24px';
        emoteIcon.style.filter = 'invert(1)';

        const emoteBtn = createSquareButton({ content: emoteIcon, width: 'auto', fontSize: '12px' });
        emoteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            const radialContent = await createEmoteRadialMenu(globalAvatarData.emotes, async (emote) => {
                await playEmote(emote.assetId, false, 10);
                overlayHandle.close(); 
            });
            const overlayHandle = createOverlay({ title: 'Emotes', bodyContent: radialContent, maxWidth: '450px', overflowVisible: true, showLogo: true });
        });
        controlsWrapper.appendChild(emoteBtn);
    }

    const settingsIcon = document.createElement('img');
    settingsIcon.src = assets.settings;
    settingsIcon.style.width = '24px';
    settingsIcon.style.height = '24px';
    settingsIcon.style.filter = 'invert(1)';
    const settingsBtn = createSquareButton({ content: settingsIcon, width: 'auto', fontSize: '12px' });

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const contentContainer = document.createElement('div');
        Object.assign(contentContainer.style, { display: 'flex', flexDirection: 'column', gap: '15px', padding: '5px' });

        const animSection = document.createElement('div');
        animSection.innerHTML = '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Animations</div>';

        const updateAnimationDropdown = () => {
            const existingDropdown = animSection.querySelector('.rovalra-dropdown-container');
            if (existingDropdown) existingDropdown.remove();

            let animItems = [];
            const animAssets = globalAvatarData.assets.filter(a => a.assetType.name.includes("Animation"));

            if (animAssets.length > 0) {
                animItems = animAssets.map(a => ({
                    label: a.assetType.name.replace("Animation", ""),
                    value: String(a.assetType.name.toLowerCase().replace("animation", ""))
                }));
            } else {
                const excludedAnims = ['toolnone', 'idle', 'sit', 'swimidle', 'toolslash', 'toollunge'];
                const defaultAnims = currentRigType === 'R6' ? animNamesR6 : animNamesR15;
                animItems = Object.keys(defaultAnims).map(animName => {
                    if (excludedAnims.includes(animName) || animName.startsWith('dance')) return null;
                    return { label: animName.charAt(0).toUpperCase() + animName.slice(1), value: animName };
                }).filter(Boolean);
            }

            const { element: dropdownElement } = createDropdown({
                items: [{ label: 'Idle', value: 'idle' }, ...animItems],
                initialValue: activeAnimValue || 'idle',
                onValueChange: (value) => {
                    const animatorW = getAnimatorW();
                    if (animatorW) {
                        if (value === 'idle') playIdle();
                        else { animatorW.playAnimation(value); activeAnimValue = value; activeEmoteId = null; }
                    }
                }
            });
            dropdownElement.style.width = '100%';
            animSection.appendChild(dropdownElement);
        };

        const rigSection = document.createElement('div');
        rigSection.innerHTML = '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Rig Type</div>';
        const rigButtons = document.createElement('div');
        rigButtons.style.display = 'flex';
        rigButtons.style.gap = '10px';

        ['R6', 'R15'].forEach(type => {
            const btn = document.createElement('button');
            btn.className = (currentRigType === type) ? 'btn-primary-sm' : 'btn-secondary-sm';
            btn.textContent = type;
            btn.style.flex = '1';
            btn.onclick = async () => {
                if (currentRigType === type) return;
                Array.from(rigButtons.children).forEach(b => b.className = 'btn-secondary-sm');
                btn.className = 'btn-primary-sm';
                await loadRig(type);
                updateAnimationDropdown();
            };
            rigButtons.appendChild(btn);
        });

        rigSection.appendChild(rigButtons);
        contentContainer.appendChild(rigSection);
        updateAnimationDropdown();
        contentContainer.appendChild(animSection);
        createOverlay({ title: 'Render Settings', bodyContent: contentContainer, maxWidth: '400px', overflowVisible: true, showLogo: true });
    });

    controlsWrapper.appendChild(settingsBtn);
    container.appendChild(controlsWrapper);
}

// Rendering loop
function startAnimationLoop() {
    const animate = () => {
        if (currentRig) {
            const animatorW = getAnimatorW();
            if (animatorW) {
                const currentTime = Date.now() / 1000;
                const deltaTime = currentTime - lastFrameTime;
                lastFrameTime = currentTime;
                animatorW.renderAnimation(deltaTime);
                RBXRenderer.addInstance(currentRig, null);
            }
        }
        requestAnimationFrame(animate);
    };
    lastFrameTime = Date.now() / 1000;
    animate();
}

// PRELOADER WITH EMOTE PRERENDERING
async function preloadAvatar() {
    if (avatarDataPromise) return avatarDataPromise;
    avatarDataPromise = (async () => {
        if (isPreloading) return;
        isPreloading = true;
        const userId = getUserIdFromUrl();
        if (!userId) { isPreloading = false; return null; }
        try {
            RegisterWrappers();
            await RBXRenderer.fullSetup(true, true);
            RBXRenderer.setBackgroundTransparent(true);
            preloadedCanvas = RBXRenderer.getRendererElement();
            
            Object.assign(preloadedCanvas.style, {
                width: '100%',
                height: '100%',
                outline: 'none'
            });

            globalAvatarData = await callRobloxApiJson({
                subdomain: 'avatar',
                endpoint: `/v2/avatar/users/${userId}/avatar`
            });

            await loadRig(globalAvatarData.playerAvatarType);
            startAnimationLoop();

            // Background pre-loading of emotes (non-blocking)
            // To prevent a delay when a user plays an emote
            if (globalAvatarData.emotes && currentRigType === 'R15') {
                const animatorW = getAnimatorW(currentRig);
                if (animatorW) {
                    globalAvatarData.emotes.forEach(emote => {
                        animatorW.loadAvatarAnimation(BigInt(emote.assetId), true, false);
                    });
                }
            }

            return globalAvatarData;
        } catch (err) {
            console.error("RoValra Preload Error:", err);
            return null;
        } finally {
            isPreloading = false;
        }
    })();
    return avatarDataPromise;
}

async function attachPreloadedAvatar(container) {
    if (container.dataset.rovalraRendered) return;
    await preloadAvatar();
    if (preloadedCanvas) {
        container.innerHTML = '';
        Object.assign(container.style, {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            position: 'relative'
        });

        container.appendChild(preloadedCanvas);
        container.dataset.rovalraRendered = 'true';

        const resizeObserver = new ResizeObserver(() => {
            const w = container.clientWidth || 420;
            const h = container.clientHeight || 420;
            RBXRenderer.setRendererSize(w, h);
        });
        resizeObserver.observe(container);
    }
}

export function init() {
    chrome.storage.local.get({ profile3DRenderEnabled: true }, (result) => {
        if (result.profile3DRenderEnabled) {
            const avatarPromise = preloadAvatar();
            observeElement(
                '.thumbnail-holder-position .thumbnail-3d-container > canvas[data-engine*="three.js"], .avatar-toggle-button',
                (element) => {
                    if (element.tagName === 'CANVAS') {
                        attachPreloadedAvatar(element.parentElement);
                    } else {
                        const container = element.closest('.thumbnail-3d-container') || element.parentElement;
                        if (container) {
                            avatarPromise.then(data => data && injectCustomButtons(container));
                        }
                    }
                },
                { multiple: true }
            );
        }
    });
}