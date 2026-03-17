import './patch.js';
import { observeElement, observeResize } from '../../../core/observer.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import {
    injectStylesheet,
    removeStylesheet,
} from '../../../core/ui/cssInjector.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { createSquareButton } from '../../../core/ui/profile/header/squarebutton.js';
import { createOverlay } from '../../../core/ui/overlay.js';
import { createDropdown } from '../../../core/ui/dropdown.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { showConfirmationPrompt } from '../../../core/ui/confirmationPrompt.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { getAssets } from '../../../core/assets.js';
import { SETTINGS_CONFIG } from '../../../core/settings/settingConfig.js';
import {
    getUserDescription,
    updateUserDescription,
} from '../../../core/profile/descriptionhandler.js';
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
    animNamesR6,
} from 'roavatar-renderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
FLAGS.ASSETS_PATH = chrome.runtime.getURL('assets/rbxasset/');
FLAGS.USE_WORKERS = true;

let currentRig = null;
let currentRigType = null;
let emoteStopTimer = null;
let preloadedCanvas = null;
let isPreloading = false;
let globalAvatarData = null;
let avatarDataPromise = null;
let isCustomEnvLoaded = false;
let environmentConfig = null;

let activeEmoteId = null;
let animationSpeed = 1;
let savedAnimationR6 = 'idle';
let savedAnimationR15 = 'idle';

let isAnimatePatched = false;
const raycaster = new THREE.Raycaster();
let intendedDistance = 15;
let lastAppliedDistance = 15;
let lastCameraPos = new THREE.Vector3();
let lastTargetPos = new THREE.Vector3();
let raycastFrameSkip = 0;
let raycastTargets = [];
let isRenderingPaused = false;
function constrainCamera() {
    const controls = RBXRenderer.getRendererControls();
    const camera = RBXRenderer.getRendererCamera();
    if (!controls || !camera || raycastTargets.length === 0) return;

    if (
        camera.position.equals(lastCameraPos) &&
        controls.target.equals(lastTargetPos)
    ) {
        return;
    }

    // runs the math stuff every second frame, actually reduces cpu by 50%
    raycastFrameSkip++;
    if (raycastFrameSkip % 2 !== 0) return;

    const currentCameraDistance = camera.position.distanceTo(controls.target);
    if (Math.abs(currentCameraDistance - lastAppliedDistance) > 0.001) {
        intendedDistance = currentCameraDistance;
    }

    const direction = new THREE.Vector3()
        .subVectors(camera.position, controls.target)
        .normalize();

    raycaster.set(controls.target, direction);
    raycaster.far = intendedDistance;

    const intersects = raycaster.intersectObjects(raycastTargets, false);

    let finalDistance = intendedDistance;
    if (intersects.length > 0) {
        finalDistance = Math.max(0.1, intersects[0].distance - 0.2);
    }

    camera.position
        .copy(controls.target)
        .add(direction.multiplyScalar(finalDistance));

    lastAppliedDistance = finalDistance;
    lastCameraPos.copy(camera.position);
    lastTargetPos.copy(controls.target);
}

function patchAnimateForRotation() {
    if (isAnimatePatched) return;

    RBXRenderer.animate = function () {
        const controls = RBXRenderer.getRendererControls();
        const camera = RBXRenderer.getRendererCamera();

        if (controls && camera) {
            controls.update();
            constrainCamera();
        }

        RBXRenderer.renderer.setRenderTarget(null);
        if (RBXRenderer.effectComposer) {
            RBXRenderer.effectComposer.render();
        } else {
            RBXRenderer.renderer.render(RBXRenderer.scene, RBXRenderer.camera);
        }

        requestAnimationFrame(() => RBXRenderer.animate());
    };
    isAnimatePatched = true;
}
function getAnimatorW(rig = currentRig) {
    if (!rig) return null;
    const humanoid = rig.FindFirstChildOfClass('Humanoid');
    const animator = humanoid?.FindFirstChildOfClass('Animator');
    return animator ? new AnimatorWrapper(animator) : null;
}

async function playIdle() {
    const animatorW = getAnimatorW();
    if (animatorW) {
        animatorW.stopMoodAnimation();
        animatorW.playAnimation('idle');
    }
    activeEmoteId = null;
}

async function playEmote(emoteAssetId, loop = false, durationLimit = null) {
    if (!currentRig || currentRigType !== 'R15') {
        console.warn('Emotes are only supported on R15 rigs.');
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

    isRenderingPaused = true;

    if (currentRig) {
        currentRig.Destroy();
        currentRig = null;
    }

    const outfit = new Outfit();
    outfit.fromJson(globalAvatarData);
    outfit.playerAvatarType = rigType;

    const rigUrl = chrome.runtime.getURL(`assets/Rig${rigType}.rbxm`);

    try {
        const rigResult = await API.Asset.GetRBX(rigUrl, undefined);

        if (rigResult instanceof RBX) {
            await new Promise((r) => setTimeout(r, 10));

            currentRig = rigResult.generateTree().GetChildren()[0];
            const humanoid = currentRig?.FindFirstChildOfClass('Humanoid');

            if (humanoid) {
                const desc = new Instance('HumanoidDescription');
                const wrapper = new HumanoidDescriptionWrapper(desc);
                wrapper.fromOutfit(outfit);

                await new Promise((r) => requestAnimationFrame(r));
                await wrapper.applyDescription(humanoid);

                await playIdle();

                RBXRenderer.addInstance(currentRig, null);
                currentRigType = rigType;

                if (rigType === 'R15' && globalAvatarData.emotes) {
                    const animatorW = getAnimatorW(currentRig);
                    for (const emote of globalAvatarData.emotes) {
                        animatorW?.loadAvatarAnimation(
                            BigInt(emote.assetId),
                            true,
                            false,
                        );
                        if (Math.random() > 0.5)
                            await new Promise((r) => setTimeout(r, 1));
                    }
                }

                const animToPlay =
                    rigType === 'R6' ? savedAnimationR6 : savedAnimationR15;
                const animatorW = getAnimatorW();
                if (animatorW && animToPlay && animToPlay !== 'idle') {
                    animatorW.playAnimation(animToPlay);
                }
            }
        }
    } catch (e) {
        console.error('Rig Load Error:', e);
    } finally {
        isRenderingPaused = false;
    }
}

// Emote menu
async function createEmoteRadialMenu(emotesData, onSelect) {
    injectStylesheet('css/profileRender.css', 'rovalra-profile-render-css');

    const container = document.createElement('div');
    container.className = 'emotes-radial-menu-wrapper';

    const assetIds = emotesData.map((e) => e.assetId);
    let thumbMap = {};
    if (assetIds.length > 0) {
        try {
            const thumbResponse = await callRobloxApiJson({
                subdomain: 'thumbnails',
                endpoint: `/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Webp&isCircular=false`,
            });
            thumbResponse.data.forEach((item) => {
                thumbMap[item.targetId] = item.imageUrl;
            });
        } catch (e) {
            console.error(e);
        }
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
        const emote = emotesData.find((e) => e.position === slotNumber);
        const angle = (i * 45 - 90) * (Math.PI / 180);
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
        `; //Verified
        // Should be safe since this doesnt have a emote name added into the html and using safeHtml or dompurify here may break thumbnail urls

        if (hasEmote) {
            sliceDiv.addEventListener(
                'mouseenter',
                () => (middleText.textContent = emoteName),
            );
            sliceDiv.addEventListener(
                'mouseleave',
                () => (middleText.textContent = 'Choose an emote to play'),
            );
            sliceDiv.addEventListener('click', () => onSelect(emote));
        }
        sliceParent.appendChild(sliceDiv);
    }
    return container;
}

function injectCustomButtons(toggleButton) {
    if (
        !globalAvatarData ||
        toggleButton.querySelector('.rovalra-custom-controls')
    )
        return;

    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'rovalra-custom-controls';

    Object.assign(controlsWrapper.style, {
        display: 'flex',
        gap: '5px',
        alignItems: 'center',
        position: 'absolute',
        bottom: '0px',
        right: '800px',
        zIndex: '100',
        pointerEvents: 'auto',
    });

    toggleButton.style.overflow = 'visible';

    const assets = getAssets();

    if (globalAvatarData.emotes?.length > 0) {
        const emoteIconContainer = document.createElement('div');
        emoteIconContainer.innerHTML = decodeURIComponent(
            assets.Emotes.split(',')[1],
        ); //Verified
        const emoteIcon = emoteIconContainer.querySelector('svg');
        emoteIcon.style.width = '24px';
        emoteIcon.style.height = '24px';
        emoteIcon.style.fill = 'var(--rovalra-main-text-color)';

        const emoteBtn = createSquareButton({
            content: emoteIcon,
            width: 'auto',
            fontSize: '12px',
        });
        emoteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const radialContent = await createEmoteRadialMenu(
                globalAvatarData.emotes,
                async (emote) => {
                    await playEmote(emote.assetId, false, 10);
                    overlayHandle.close();
                },
            );
            const overlayHandle = createOverlay({
                title: 'Emotes',
                bodyContent: radialContent,
                maxWidth: '450px',
                overflowVisible: true,
                showLogo: true,
                onClose: () => removeStylesheet('rovalra-profile-render-css'),
            });
        });
        controlsWrapper.appendChild(emoteBtn);
    }

    const settingsIconContainer = document.createElement('div');
    settingsIconContainer.innerHTML = decodeURIComponent(
        assets.settings.split(',')[1],
    ); // verified
    const settingsIcon = settingsIconContainer.querySelector('svg');
    settingsIcon.style.width = '24px';
    settingsIcon.style.height = '24px';
    settingsIcon.style.fill = 'var(--rovalra-main-text-color)';

    const settingsBtn = createSquareButton({
        content: settingsIcon,
        width: 'auto',
        fontSize: '12px',
    });

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const contentContainer = document.createElement('div');
        Object.assign(contentContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            padding: '5px',
        });

        const animSection = document.createElement('div');
        animSection.innerHTML =
            '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Animations</div>';

        const updateAnimationDropdown = () => {
            const existingDropdown = animSection.querySelector(
                '.rovalra-dropdown-container',
            );
            if (existingDropdown) existingDropdown.remove();

            let animItems = [];
            const excludedAnims = [
                'toolnone',
                'idle',
                'sit',
                'swimidle',
                'toolslash',
                'toollunge',
            ];

            if (currentRigType === 'R6') {
                const defaultAnims = animNamesR6;
                animItems = Object.keys(defaultAnims)
                    .map((animName) => {
                        if (
                            excludedAnims.includes(animName) ||
                            animName.startsWith('dance')
                        )
                            return null;
                        return {
                            label:
                                animName.charAt(0).toUpperCase() +
                                animName.slice(1),
                            value: animName,
                        };
                    })
                    .filter(Boolean);
            } else {
                // R15
                const defaultAnims = animNamesR15;
                const animAssets = globalAvatarData.assets.filter((a) =>
                    a.assetType.name.includes('Animation'),
                );
                const animItemsMap = new Map();

                // Add default R15 animations
                Object.keys(defaultAnims).forEach((animName) => {
                    if (
                        !excludedAnims.includes(animName) &&
                        !animName.startsWith('dance')
                    ) {
                        animItemsMap.set(animName, {
                            label:
                                animName.charAt(0).toUpperCase() +
                                animName.slice(1),
                            value: animName,
                        });
                    }
                });

                // Add users equipped animations, which may override defaults
                animAssets.forEach((asset) => {
                    const animName = String(
                        asset.assetType.name
                            .toLowerCase()
                            .replace('animation', ''),
                    );
                    if (
                        !excludedAnims.includes(animName) &&
                        !animName.startsWith('dance')
                    ) {
                        animItemsMap.set(animName, {
                            label: asset.assetType.name.replace(
                                'Animation',
                                '',
                            ),
                            value: animName,
                        });
                    }
                });
                animItems = Array.from(animItemsMap.values());
            }
            const { element: dropdownElement } = createDropdown({
                items: [{ label: 'Idle', value: 'idle' }, ...animItems],
                initialValue:
                    (currentRigType === 'R6'
                        ? savedAnimationR6
                        : savedAnimationR15) || 'idle',
                onValueChange: (value) => {
                    const animatorW = getAnimatorW();
                    if (animatorW) {
                        if (value === 'idle') playIdle();
                        else {
                            animatorW.playAnimation(value);
                            activeEmoteId = null;
                        }
                    }
                    if (currentRigType === 'R6') {
                        savedAnimationR6 = value;
                        chrome.storage.local.set({
                            profileRenderAnimationR6: value,
                        });
                    } else {
                        savedAnimationR15 = value;
                        chrome.storage.local.set({
                            profileRenderAnimationR15: value,
                        });
                    }
                },
            });
            dropdownElement.style.width = '100%';
            animSection.appendChild(dropdownElement);
        };

        const rigSection = document.createElement('div');
        rigSection.innerHTML =
            '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Rig Type</div>';
        const rigButtons = document.createElement('div');
        rigButtons.style.display = 'flex';
        rigButtons.style.gap = '10px';
        ['R6', 'R15'].forEach((type) => {
            const btn = document.createElement('button');
            btn.className =
                currentRigType === type ? 'btn-primary-sm' : 'btn-secondary-sm';
            btn.textContent = type;
            btn.style.flex = '1';
            btn.onclick = async () => {
                if (currentRigType === type) return;
                Array.from(rigButtons.children).forEach(
                    (b) => (b.className = 'btn-secondary-sm'),
                );
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

        const speedSection = document.createElement('div');
        speedSection.innerHTML =
            '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Animation Speed</div>';

        const speedSliderWrapper = document.createElement('div');
        speedSliderWrapper.style.display = 'flex';
        speedSliderWrapper.style.alignItems = 'center';
        speedSliderWrapper.style.gap = '10px';

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = 0;
        speedSlider.max = 2;
        speedSlider.step = 0.1;
        speedSlider.style.flexGrow = '1';

        const speedValueDisplay = document.createElement('span');
        speedValueDisplay.style.minWidth = '40px';
        speedValueDisplay.style.textAlign = 'right';

        speedSlider.addEventListener('input', () => {
            const newSpeed = parseFloat(speedSlider.value);
            speedValueDisplay.textContent = `${newSpeed.toFixed(1)}x`;
        });

        speedSlider.addEventListener('change', () => {
            const newSpeed = parseFloat(speedSlider.value);
            chrome.storage.local.set({ profileRenderAnimationSpeed: newSpeed });
        });

        chrome.storage.local.get(
            { profileRenderAnimationSpeed: 1 },
            (settings) => {
                const initialSpeed = parseFloat(
                    settings.profileRenderAnimationSpeed ?? 1,
                );
                speedSlider.value = initialSpeed;
                speedValueDisplay.textContent = `${initialSpeed.toFixed(1)}x`;
            },
        );

        speedSliderWrapper.appendChild(speedSlider);
        speedSliderWrapper.appendChild(speedValueDisplay);
        speedSection.appendChild(speedSliderWrapper);
        contentContainer.appendChild(speedSection);

        createOverlay({
            title: 'Render Settings',
            bodyContent: contentContainer,
            maxWidth: '400px',
            overflowVisible: true,
            showLogo: true,
        });
    });

    controlsWrapper.appendChild(settingsBtn);

    if (isCustomEnvLoaded && environmentConfig && environmentConfig.tooltip) {
        const infoIconContainer = document.createElement('div');
        infoIconContainer.innerHTML = decodeURIComponent(
            assets.priceFloorIcon.split(',')[1],
        ); //Verified
        const infoIcon = infoIconContainer.querySelector('svg');
        infoIcon.style.width = '24px';
        infoIcon.style.height = '24px';
        infoIcon.style.cursor = 'pointer';
        infoIcon.style.fill = 'var(--rovalra-main-text-color)';

        addTooltip(infoIcon, environmentConfig.tooltip.text, {
            position: 'top',
        });

        infoIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirmationPrompt({
                title: 'External Site',
                message:
                    'You are about to be redirected to an external website which may have different privacy policies than Roblox. Do you want to continue?',
                confirmText: 'Continue',
                onConfirm: () => {
                    window.open(environmentConfig.tooltip.link, '_blank');
                },
            });
        });
        controlsWrapper.appendChild(infoIcon);
    }

    toggleButton.prepend(controlsWrapper);
}
// Rendering loop
function startAnimationLoop() {
    const fpsLimit = 45;
    const interval = 1000 / fpsLimit;
    let lastRenderTime = performance.now();

    const animate = (currentTime) => {
        requestAnimationFrame(animate);

        if (isRenderingPaused) return;

        const delta = currentTime - lastRenderTime;

        if (delta >= interval) {
            if (currentRig) {
                const animatorW = getAnimatorW();
                if (animatorW && animationSpeed > 0) {
                    const deltaTime = (delta / 1000) * animationSpeed;
                    animatorW.renderAnimation(deltaTime);
                    RBXRenderer.addInstance(currentRig, null);
                } else {
                    RBXRenderer.addInstance(currentRig, null);
                }
            }
            lastRenderTime = currentTime - (delta % interval);
        }
    };

    requestAnimationFrame(animate);
}
async function loadCustomEnvironment(scene, config) {
    if (!config || !config.url) return;

    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        let envUrl = config.url;

        try {
            new URL(envUrl);
        } catch (e) {
            envUrl = chrome.runtime.getURL(envUrl);
        }

        loader.load(
            envUrl,
            async (gltf) => {
                const model = gltf.scene;

                raycastTargets = [];

                if (config.position) model.position.set(...config.position);
                if (config.scale) model.scale.set(...config.scale);

                model.traverse((node) => {
                    if (node.isMesh) {
                        node.userData.isEnvironment = true;

                        if (config.receiveShadow !== undefined)
                            node.receiveShadow = config.receiveShadow;
                        if (config.castShadow !== undefined)
                            node.castShadow = config.castShadow;

                        node.matrixAutoUpdate = false;
                        node.updateMatrix();

                        raycastTargets.push(node);
                    }
                });

                scene.add(model);

                if (RBXRenderer.plane) {
                    RBXRenderer.plane.visible = false;
                }

                if (RBXRenderer.shadowPlane) {
                    RBXRenderer.shadowPlane.visible = false;
                }

                isCustomEnvLoaded = true;
                resolve();
            },
            undefined,
            (error) => {
                console.error('RoValra: GLTF Load Error', error);
                reject(error);
            },
        );
    });
}

function setupAtmosphere(scene, config, isCustomEnv = false) {
    if (!config) return;

    if (config.background) {
        scene.background = new THREE.Color(config.background);
    } else {
        scene.background = null;
    }
    if (!isCustomEnv && RBXRenderer.plane) {
        raycastTargets = [RBXRenderer.plane];
    }
    scene.children
        .filter((obj) => obj.isLight)
        .forEach((light) => scene.remove(light));
    if (config.lights && Array.isArray(config.lights)) {
        config.lights.forEach((lightDef) => {
            let light;
            const color = new THREE.Color(lightDef.color || 0xffffff);
            const intensity =
                lightDef.intensity !== undefined ? lightDef.intensity : 1;

            if (lightDef.type === 'DirectionalLight') {
                light = new THREE.DirectionalLight(color, intensity);
                if (lightDef.position) light.position.set(...lightDef.position);
                if (lightDef.castShadow) light.castShadow = true;
            } else if (lightDef.type === 'AmbientLight') {
                light = new THREE.AmbientLight(color, intensity);
            }

            if (light) scene.add(light);
        });
    }

    const shouldShowPlane =
        config.showFloor !== undefined ? config.showFloor : !isCustomEnv;

    if (RBXRenderer.shadowPlane)
        RBXRenderer.shadowPlane.visible = shouldShowPlane;
    if (RBXRenderer.plane) RBXRenderer.plane.visible = shouldShowPlane;

    if (config.fog) {
        scene.fog = new THREE.Fog(
            new THREE.Color(config.fog.color || 0xffffff),
            config.fog.near || 30,
            config.fog.far || 120,
        );
    } else {
        scene.fog = null;
    }
}
// PRELOADER WITH EMOTE PRERENDERING
// Define a standard lighting setup to use when no custom environment is active
const DEFAULT_VOID_CONFIG = {
    atmosphere: {
        showFloor: false,
        lights: [
            {
                type: 'AmbientLight',
                color: '#ffffff',
                intensity: 1.2,
            },
            {
                type: 'DirectionalLight',
                color: '#ffffff',
                intensity: 1.5,
                position: [10, 20, 10],
                castShadow: true,
            },
        ],
    },
};

async function preloadAvatar() {
    if (avatarDataPromise) return avatarDataPromise;

    avatarDataPromise = (async () => {
        if (isPreloading) return;
        isPreloading = true;

        const userId = getUserIdFromUrl();
        if (!userId) {
            isPreloading = false;
            return null;
        }

        try {
            const [settings, avatarData] = await Promise.all([
                chrome.storage.local.get([
                    'profileRenderRotateEnabled',
                    'profileRenderEnvironment',
                    'environmentTester',
                    'modelUrl',
                    'modelPosX',
                    'modelPosY',
                    'modelPosZ',
                    'modelScaleX',
                    'modelScaleY',
                    'modelScaleZ',
                    'modelCastShadow',
                    'modelReceiveShadow',
                    'cameraFar',
                    'skyboxToggle',
                    'skyboxPx',
                    'skyboxNx',
                    'skyboxPy',
                    'skyboxNy',
                    'skyboxPz',
                    'skyboxNz',
                    'bgColor',
                    'showFloor',
                    'ambientLightToggle',
                    'ambientLightColor',
                    'ambientLightIntensity',
                    'dirLightToggle',
                    'dirLightColor',
                    'dirLightIntensity',
                    'dirLightPosX',
                    'dirLightPosY',
                    'dirLightPosZ',
                    'dirLightCastShadow',
                    'fogToggle',
                    'fogColor',
                    'fogNear',
                    'fogFar',
                    'tooltipToggle',
                    'tooltipText',
                    'tooltipLink',
                ]),
                callRobloxApiJson({
                    subdomain: 'avatar',
                    endpoint: `/v2/avatar/users/${userId}/avatar`,
                }),
            ]);

            globalAvatarData = avatarData;

            await new Promise((r) => setTimeout(r, 0));

            if (!preloadedCanvas) {
                RegisterWrappers();
                patchAnimateForRotation();
                await RBXRenderer.fullSetup(true, true);
                RBXRenderer.setBackgroundTransparent(true);
                preloadedCanvas = RBXRenderer.getRendererElement();
                preloadedCanvas.classList.add('rovalra-canvas');
                Object.assign(preloadedCanvas.style, {
                    width: '100%',
                    height: '100%',
                    outline: 'none',
                });
                startAnimationLoop();
            }

            await new Promise((r) => setTimeout(r, 10));

            await loadRig(globalAvatarData.playerAvatarType);

            await new Promise((r) => setTimeout(r, 0));

            const setupEnvironment = async () => {
                const scene = RBXRenderer.getScene();
                const camera = RBXRenderer.getRendererCamera();
                const controls = RBXRenderer.getRendererControls();

                if (controls) {
                    controls.autoRotate = !!settings.profileRenderRotateEnabled;
                    controls.autoRotateSpeed = 1.0;
                }

                const authUserId = await getAuthenticatedUserId();
                const isOwnProfile = String(userId) === String(authUserId);
                const useDevEnvironment =
                    settings.environmentTester && settings.modelUrl;

                if (useDevEnvironment) {
                    environmentConfig = {
                        model: {
                            url: settings.modelUrl,
                            position: [
                                parseFloat(settings.modelPosX) || 0,
                                parseFloat(settings.modelPosY) || 0,
                                parseFloat(settings.modelPosZ) || 0,
                            ],
                            scale: [
                                parseFloat(settings.modelScaleX) || 1,
                                parseFloat(settings.modelScaleY) || 1,
                                parseFloat(settings.modelScaleZ) || 1,
                            ],
                            castShadow: settings.modelCastShadow,
                            receiveShadow: settings.modelReceiveShadow,
                        },
                        atmosphere: {
                            background: settings.bgColor || null,
                            showFloor: settings.showFloor,
                            lights: [],
                            fog: null,
                        },
                    };
                    if (settings.ambientLightToggle)
                        environmentConfig.atmosphere.lights.push({
                            type: 'AmbientLight',
                            color: settings.ambientLightColor,
                            intensity:
                                parseFloat(settings.ambientLightIntensity) || 0,
                        });
                    if (settings.dirLightToggle)
                        environmentConfig.atmosphere.lights.push({
                            type: 'DirectionalLight',
                            color: settings.dirLightColor,
                            intensity:
                                parseFloat(settings.dirLightIntensity) || 0,
                            position: [
                                parseFloat(settings.dirLightPosX) || 0,
                                parseFloat(settings.dirLightPosY) || 0,
                                parseFloat(settings.dirLightPosZ) || 0,
                            ],
                            castShadow: settings.dirLightCastShadow,
                        });
                    if (settings.fogToggle)
                        environmentConfig.atmosphere.fog = {
                            color: settings.fogColor,
                            near: parseFloat(settings.fogNear) || 0,
                            far: parseFloat(settings.fogFar) || 0,
                        };
                    if (settings.tooltipToggle)
                        environmentConfig.tooltip = {
                            text: settings.tooltipText,
                            link: settings.tooltipLink,
                        };
                    isCustomEnvLoaded = true;
                } else {
                    let envId = 1;
                    const profileEnvs =
                        SETTINGS_CONFIG.Profile.settings.profile3DRenderEnabled
                            .childSettings.profileRenderEnvironment.options;

                    if (isOwnProfile) {
                        const profileEnvValue =
                            settings.profileRenderEnvironment || 'void';
                        const selectedEnvFromSettings = profileEnvs.find(
                            (opt) => opt.value === profileEnvValue,
                        );
                        if (selectedEnvFromSettings)
                            envId = selectedEnvFromSettings.id;

                        const currentDescription =
                            await getUserDescription(userId);
                        if (currentDescription !== null) {
                            let descriptionEnvId = 1;
                            const envLine = currentDescription
                                .split('\n')
                                .find((line) => line.trim().startsWith('e:'));
                            if (envLine) {
                                const parsedId = parseInt(
                                    envLine.trim().substring(2),
                                    10,
                                );
                                if (!isNaN(parsedId))
                                    descriptionEnvId = parsedId;
                            }

                            if (envId !== descriptionEnvId) {
                                const lines = currentDescription.split('\n');
                                let newDescription;
                                if (envId !== 1) {
                                    const envLineStr = `e:${envId}`;
                                    let envFound = false;
                                    const newLines = [];
                                    for (const line of lines) {
                                        if (line.trim().startsWith('e:')) {
                                            if (!envFound) {
                                                newLines.push(envLineStr);
                                                envFound = true;
                                            }
                                        } else newLines.push(line);
                                    }
                                    if (!envFound) {
                                        if (currentDescription.trim())
                                            newLines.push(envLineStr);
                                        else newLines[0] = envLineStr;
                                    }
                                    newDescription = newLines.join('\n');
                                } else {
                                    newDescription = lines
                                        .filter(
                                            (line) =>
                                                !line.trim().startsWith('e:'),
                                        )
                                        .join('\n')
                                        .trimEnd();
                                }
                                if (newDescription !== currentDescription)
                                    await updateUserDescription(
                                        userId,
                                        newDescription,
                                    );
                            }
                        }
                    } else {
                        const description = await getUserDescription(userId);
                        if (description) {
                            const envLine = description
                                .split('\n')
                                .find((line) => line.trim().startsWith('e:'));
                            if (envLine) {
                                const parsedId = parseInt(
                                    envLine.trim().substring(2),
                                    10,
                                );
                                if (
                                    !isNaN(parsedId) &&
                                    profileEnvs.some((e) => e.id === parsedId)
                                )
                                    envId = parsedId;
                            }
                        }
                    }

                    const selectedEnv = profileEnvs.find(
                        (opt) => opt.id === envId,
                    );
                    const environmentEndpoint =
                        selectedEnv?.environmentEndpoint || null;

                    if (environmentEndpoint) {
                        environmentConfig = await callRobloxApiJson({
                            isRovalraApi: true,
                            subdomain: 'www',
                            endpoint: environmentEndpoint,
                            method: 'GET',
                        });
                        isCustomEnvLoaded = !!environmentConfig.model;
                    } else {
                        environmentConfig = DEFAULT_VOID_CONFIG;
                        isCustomEnvLoaded = false;
                    }
                }

                setupAtmosphere(
                    scene,
                    environmentConfig?.atmosphere ||
                        DEFAULT_VOID_CONFIG.atmosphere,
                    isCustomEnvLoaded,
                );

                if (isCustomEnvLoaded && environmentConfig.model) {
                    await new Promise((r) => setTimeout(r, 0));
                    await loadCustomEnvironment(scene, environmentConfig.model);
                }

                let skyboxUrls = null;
                if (useDevEnvironment && settings.skyboxToggle) {
                    skyboxUrls = [
                        settings.skyboxNx,
                        settings.skyboxPx,
                        settings.skyboxPy,
                        settings.skyboxNy,
                        settings.skyboxPz,
                        settings.skyboxNz,
                    ];
                } else if (environmentConfig?.skybox) {
                    skyboxUrls = environmentConfig.skybox;
                }

                if (skyboxUrls && skyboxUrls.every((url) => url)) {
                    const cubeLoader = new THREE.CubeTextureLoader();
                    scene.background = cubeLoader.load(skyboxUrls);
                    if (RBXRenderer.plane) RBXRenderer.plane.visible = false;
                    if (RBXRenderer.shadowPlane)
                        RBXRenderer.shadowPlane.visible = false;
                }

                if (camera) {
                    camera.far = environmentConfig?.camera?.far
                        ? environmentConfig.camera.far
                        : useDevEnvironment && settings.cameraFar
                          ? parseFloat(settings.cameraFar)
                          : 100;
                    camera.updateProjectionMatrix();
                }
            };

            await setupEnvironment().catch((err) => {
                console.error('RoValra: Background env load failed', err);
                setupAtmosphere(
                    RBXRenderer.getScene(),
                    DEFAULT_VOID_CONFIG.atmosphere,
                    false,
                );
            });

            return globalAvatarData;
        } catch (err) {
            console.error('RoValra Preload Error:', err);
            return null;
        } finally {
            isPreloading = false;
        }
    })();
    return avatarDataPromise;
}

async function attachPreloadedAvatar(container) {
    if (container.dataset.rovalraRendered) return;
    container.dataset.rovalraRendered = 'true';
    Object.assign(container.style, {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'relative',
    });

    const avatarPromise = preloadAvatar();

    const ensureCanvasAttached = () => {
        if (preloadedCanvas && !container.contains(preloadedCanvas)) {
            container.appendChild(preloadedCanvas);

            observeResize(container, () => {
                RBXRenderer.setRendererSize(
                    container.clientWidth || 420,
                    container.clientHeight || 420,
                );
            });
            return true;
        }
        return false;
    };

    if (!ensureCanvasAttached()) {
        const checkInterval = setInterval(() => {
            if (ensureCanvasAttached()) clearInterval(checkInterval);
        }, 50);

        avatarPromise.finally(() => clearInterval(checkInterval));
    }
}

export function init() {
    chrome.storage.local.get({ profile3DRenderEnabled: true }, (result) => {
        if (result.profile3DRenderEnabled) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local') {
                    if (changes.profileRenderAnimationSpeed) {
                        try {
                            const newSpeed = parseFloat(
                                changes.profileRenderAnimationSpeed.newValue,
                            );
                            animationSpeed = isNaN(newSpeed) ? 1 : newSpeed;
                        } catch (e) {
                            animationSpeed = 1;
                        }
                    }
                    if (changes.profileRenderAnimationR6) {
                        savedAnimationR6 =
                            changes.profileRenderAnimationR6.newValue || 'idle';
                    }
                    if (changes.profileRenderAnimationR15) {
                        savedAnimationR15 =
                            changes.profileRenderAnimationR15.newValue ||
                            'idle';
                    }
                }
            });
            chrome.storage.local.get(
                {
                    profileRenderAnimationSpeed: 1,
                    profileRenderAnimationR6: 'idle',
                    profileRenderAnimationR15: 'idle',
                },
                (settings) => {
                    const initialSpeed = parseFloat(
                        settings.profileRenderAnimationSpeed ?? 1,
                    );
                    animationSpeed = isNaN(initialSpeed) ? 1 : initialSpeed;
                    savedAnimationR6 =
                        settings.profileRenderAnimationR6 || 'idle';
                    savedAnimationR15 =
                        settings.profileRenderAnimationR15 || 'idle';
                },
            );
            const avatarPromise = preloadAvatar();
            injectStylesheet(
                'css/thumbnailholder.css',
                'rovalra-thumbnail-holder-css',
            );

            observeElement(
                '.thumbnail-holder-position .thumbnail-3d-container > canvas:not(.rovalra-canvas), .thumbnail-holder-position .thumbnail-3d-container > .placeholder-generated-image',
                (elementToRemove) => {
                    elementToRemove.remove();
                },
                { multiple: true },
            );

            observeElement(
                '.thumbnail-holder-position .thumbnail-3d-container, .avatar-toggle-button',
                (element) => {
                    if (element.classList.contains('thumbnail-3d-container')) {
                        attachPreloadedAvatar(element);
                    } else if (
                        element.classList.contains('avatar-toggle-button')
                    ) {
                        avatarPromise.then((data) => {
                            if (data) injectCustomButtons(element);
                        });
                    }
                },
                { multiple: true },
            );
        }
    });
}
