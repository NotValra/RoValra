import {
    observeElement,
    observeResize,
    observeChildren,
} from '../../../core/observer.js';
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
import { createToggle } from '../../../core/ui/general/toggle.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { showConfirmationPrompt } from '../../../core/ui/confirmationPrompt.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { getAssets } from '../../../core/assets.js';
import { SETTINGS_CONFIG } from '../../../core/settings/settingConfig.js';
import {
    handleSaveSettings,
    syncDonatorTier,
    getCurrentUserTier,
} from '../../../core/settings/handlesettings.js';
import {
    getUserDescription,
    updateUserDescription,
    updateUserSettingViaApi,
} from '../../../core/profile/descriptionhandler.js';
import { getUserSettings } from '../../../core/donators/settingHandler.js';
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
    AnimationTrack,
    animNamesR15,
    animNamesR6,
} from 'roavatar-renderer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { safeHtml } from '../../../core/packages/dompurify.js';
FLAGS.ENABLE_API_MESH_CACHE = false;
FLAGS.ENABLE_API_RBX_CACHE = false;
FLAGS.USE_WORKERS = false;
FLAGS.ONLINE_ASSETS = true;

let currentRig = null;
let currentRigType = null;
let emoteStopTimer = null;
let preloadedCanvas = null;
let isPreloading = false;
let globalAvatarData = null;
let customModelInstance = null;
let avatarDataPromise = null;
let isCustomEnvLoaded = false;
let environmentConfig = null;
let activeEmoteId = null;
const animationSpeed = 1;

let isAnimatePatched = false;
const raycaster = new THREE.Raycaster();
let intendedDistance = 15;
let lastAppliedDistance = 15;
let lastCameraPos = new THREE.Vector3();
let lastTargetPos = new THREE.Vector3();
let raycastFrameSkip = 0;
let raycastTargets = [];
let isRenderingPaused = false;
let currentDirectTrack = null;
let directEmoteTimer = null;
let hasMovedCamera = false;

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
// freecam stuff
let recenterBtnRef = null;
const movementKeys = ['w', 'a', 's', 'd', 'q', 'e'];
const keysDown = { w: false, a: false, s: false, d: false, q: false, e: false };
let isLeftMouseDown = false;

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keysDown) keysDown[key] = true;
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keysDown) keysDown[key] = false;
});
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) isLeftMouseDown = true;
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) isLeftMouseDown = false;
});

const isMoving = () => movementKeys.some((key) => keysDown[key]);
const isFreecamActive = () => isLeftMouseDown && isMoving();

function resetCamera() {
    const controls = RBXRenderer.getRendererControls();
    const camera = RBXRenderer.getRendererCamera();
    if (!controls || !camera) return;

    controls.target.set(0, 4, 0);
    camera.position.set(0, 4, -45);
    intendedDistance = 0;
    controls.update();

    hasMovedCamera = false;
    if (recenterBtnRef) {
        recenterBtnRef.style.display = 'none';
    }
}
function updateCameraSystem() {
    const camera = RBXRenderer.getRendererCamera();
    const controls = RBXRenderer.getRendererControls();
    if (!camera || !controls) return;

    controls.enablePan = false;

    if (isFreecamActive()) {
        const moveSpeed = 0.2;
        const direction = new THREE.Vector3();

        const front = new THREE.Vector3();
        camera.getWorldDirection(front);
        const right = new THREE.Vector3()
            .crossVectors(camera.up, front)
            .normalize()
            .negate();

        if (keysDown.w) direction.add(front);
        if (keysDown.s) direction.sub(front);
        if (keysDown.d) direction.add(right);
        if (keysDown.a) direction.sub(right);
        if (keysDown.e) direction.y += 1;
        if (keysDown.q) direction.y -= 1;

        if (direction.length() > 0) {
            hasMovedCamera = true;

            const delta = direction.normalize().multiplyScalar(moveSpeed);
            camera.position.add(delta);
            controls.target.add(delta);

            intendedDistance = camera.position.distanceTo(controls.target);
        }
    } else {
        constrainCamera();
    }

    if (recenterBtnRef) {
        recenterBtnRef.style.display = hasMovedCamera ? 'flex' : 'none';
    }
}
function patchAnimateForRotation() {
    if (isAnimatePatched) return;

    RBXRenderer.animate = function () {
        const controls = RBXRenderer.getRendererControls();
        const camera = RBXRenderer.getRendererCamera();

        if (controls && camera) {
            updateCameraSystem();
            controls.update();
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
        animatorW.playAnimation('idle');
    }
    activeEmoteId = null;
}

async function playEmote(emoteAssetId, loop = false, durationLimit = null) {
    if (!currentRig) return false;

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

    const outfit = new Outfit();
    outfit.fromJson(globalAvatarData);
    outfit.playerAvatarType = rigType;

    const rigUrl = chrome.runtime.getURL(`assets/Rig${rigType}.rbxm`);

    try {
        const rigResult = await API.Asset.GetRBX(rigUrl, undefined);

        if (rigResult instanceof RBX) {
            await new Promise((r) => setTimeout(r, 10));

            const newRig = rigResult.generateTree().GetChildren()[0];
            const humanoid = newRig?.FindFirstChildOfClass('Humanoid');

            if (humanoid) {
                const desc = new Instance('HumanoidDescription');
                const wrapper = new HumanoidDescriptionWrapper(desc);
                wrapper.fromOutfit(outfit);

                await new Promise((r) => requestAnimationFrame(r));
                await wrapper.applyDescription(humanoid);

                if (currentRig) {
                    currentRig.Destroy();
                }

                if (customModelInstance) {
                    RBXRenderer.getScene().remove(customModelInstance);
                    customModelInstance = null;
                }

                currentRig = newRig;

                await playIdle();

                if (currentRig.preRender) currentRig.preRender();
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
            }
        }
    } catch (e) {
        console.error('Rig Load Error:', e);
    } finally {
        isRenderingPaused = false;
    }
}
async function playDirectAnimation(
    animationId,
    loop = false,
    durationLimit = 5,
) {
    if (!currentRig) return;

    if (directEmoteTimer) clearTimeout(directEmoteTimer);

    if (currentDirectTrack) {
        currentDirectTrack.Stop();
    }

    try {
        const url = `https://assetdelivery.roblox.com/v1/asset/?id=${animationId}`;
        const assetResult = await API.Asset.GetRBX(url, undefined);

        let root;
        try {
            root = assetResult.generateTree();
        } catch (e) {
            root = assetResult;
        }

        let animInstance = root.GetChildren()[0];
        if (animInstance.className !== 'KeyframeSequence') {
            animInstance =
                animInstance.FindFirstChildOfClass('KeyframeSequence');
        }
        if (!animInstance) return;

        let maxTime = 0;
        animInstance.GetChildren().forEach((kf) => {
            if (kf.className === 'Keyframe') {
                const time = kf.Prop('Time') || 0;
                if (time > maxTime) maxTime = time;

                const poses = kf.GetChildren();
                const hrpPose = poses.find(
                    (p) => p.Prop('Name') === 'HumanoidRootPart',
                );
                const torsoPose = poses.find((p) => p.Prop('Name') === 'Torso');

                if (torsoPose) {
                    poses.forEach((p) => {
                        if (
                            p.className === 'Pose' &&
                            p !== torsoPose &&
                            p !== hrpPose
                        ) {
                            p.parent = torsoPose;
                        }
                    });
                }
            }
        });

        const track = new AnimationTrack();
        track.loadAnimation(currentRig, animInstance);
        track.length = maxTime;
        track.looped = loop;
        track.shouldUpdateMotors = true;

        track.Play(1, 1);

        currentDirectTrack = track;
        activeEmoteId = animationId;

        if (loop && durationLimit) {
            directEmoteTimer = setTimeout(() => {
                if (currentDirectTrack === track) {
                    currentDirectTrack.Stop(0);
                    const animatorW = getAnimatorW();
                    if (animatorW) {
                        animatorW.playAnimation('idle', 0);
                    }
                    currentDirectTrack = null;
                    activeEmoteId = null;
                    directEmoteTimer = null;
                }
            }, durationLimit * 1000);
        }
    } catch (e) {
        console.error('Direct Animation Error:', e);
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

function openEnvironmentCreatorOverlay() {
    chrome.storage.local.get(null, (settings) => {
        const contentContainer = document.createElement('div');
        Object.assign(contentContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            padding: '10px',
            maxHeight: '70vh',
            overflowY: 'auto',
        });

        const createSection = (title) => {
            const section = document.createElement('div');
            section.style.marginBottom = '4px';
            const header = document.createElement('div');
            header.className = 'text-label-small';
            header.style.cssText =
                'margin-bottom:12px; color:var(--rovalra-secondary-text-color); font-weight:bold; border-bottom: 1px solid var(--rovalra-border-color); padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;';
            header.textContent = title;
            const itemsContainer = document.createElement('div');
            itemsContainer.style.cssText =
                'display:flex; flex-direction:column; gap:10px;';
            section.appendChild(header);
            section.appendChild(itemsContainer);
            contentContainer.appendChild(section);
            return itemsContainer;
        };

        const createInput = (label, key, placeholder = '', type = 'text') => {
            const { container: row, input } = createStyledInput({
                id: `creator-${key}`,
                label: label,
                value: settings[key] || '',
                placeholder: placeholder,
            });
            input.type = type;
            input.addEventListener('input', async (e) => {
                const val = e.target.value;
                await chrome.storage.local.set({ [key]: val });
                updateLive();
            });
            return row;
        };

        const createToggleRow = (label, key) => {
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            labelEl.className = 'text-label-small';
            const toggle = createToggle({
                checked: !!settings[key],
                onChange: async (checked) => {
                    await chrome.storage.local.set({ [key]: checked });
                    settings[key] = checked;
                    updateLive();
                },
            });
            row.append(labelEl, toggle);
            return row;
        };

        const createColorRow = (label, key) => {
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;';
            const labelEl = document.createElement('span');
            labelEl.textContent = label;
            labelEl.className = 'text-label-small';
            const input = document.createElement('input');
            input.type = 'color';
            input.value = settings[key] || '#ffffff';
            input.style.cssText =
                'border:none; width:30px; height:30px; cursor:pointer; background:none;';
            input.oninput = async (e) => {
                await chrome.storage.local.set({ [key]: e.target.value });
                updateLive();
            };
            row.append(labelEl, input);
            return row;
        };

        const updateLive = () => {
            chrome.storage.local.get(null, (current) => {
                const config = {
                    model: {
                        url: current.modelUrl,
                        position: [
                            parseFloat(current.modelPosX) || 0,
                            parseFloat(current.modelPosY) || 0,
                            parseFloat(current.modelPosZ) || 0,
                        ],
                        scale: [
                            parseFloat(current.modelScaleX) || 1,
                            parseFloat(current.modelScaleY) || 1,
                            parseFloat(current.modelScaleZ) || 1,
                        ],
                        castShadow: !!current.modelCastShadow,
                        receiveShadow: !!current.modelReceiveShadow,
                    },
                    atmosphere: {
                        background: current.bgColor || null,
                        showFloor: !!current.showFloor,
                        lights: [],
                        skybox: current.skyboxToggle
                            ? [
                                  current.skyboxPx,
                                  current.skyboxNx,
                                  current.skyboxPy,
                                  current.skyboxNy,
                                  current.skyboxPz,
                                  current.skyboxNz,
                              ]
                            : null,
                        fog: current.fogToggle
                            ? {
                                  color: current.fogColor,
                                  near: parseFloat(current.fogNear) || 0,
                                  far: parseFloat(current.fogFar) || 120,
                              }
                            : null,
                    },
                    camera: { far: parseFloat(current.cameraFar) || 100 },
                };

                if (current.ambientLightToggle) {
                    config.atmosphere.lights.push({
                        type: 'AmbientLight',
                        color: current.ambientLightColor,
                        intensity:
                            parseFloat(current.ambientLightIntensity) || 0,
                    });
                }
                if (current.dirLightToggle) {
                    config.atmosphere.lights.push({
                        type: 'DirectionalLight',
                        color: current.dirLightColor,
                        intensity: parseFloat(current.dirLightIntensity) || 0,
                        position: [
                            parseFloat(current.dirLightPosX) || 0,
                            parseFloat(current.dirLightPosY) || 0,
                            parseFloat(current.dirLightPosZ) || 0,
                        ],
                        castShadow: !!current.dirLightCastShadow,
                    });
                }

                const scene = RBXRenderer.getScene();
                setupAtmosphere(scene, config.atmosphere, !!config.model.url);
                if (config.model.url) {
                    loadCustomEnvironment(scene, config.model);
                } else if (customModelInstance) {
                    scene.remove(customModelInstance);
                    customModelInstance = null;
                }

                const camera = RBXRenderer.getRendererCamera();
                if (camera) {
                    camera.far = config.camera.far;
                    camera.updateProjectionMatrix();
                }
            });
        };

        const modelSec = createSection('GLB Model');
        modelSec.appendChild(
            createInput('URL / Path', 'modelUrl', 'assets/... or https://...'),
        );
        const posRow = document.createElement('div');
        posRow.style.cssText =
            'display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px;';
        posRow.append(
            createInput('Pos X', 'modelPosX'),
            createInput('Pos Y', 'modelPosY'),
            createInput('Pos Z', 'modelPosZ'),
        );
        modelSec.appendChild(posRow);
        const scaleRow = document.createElement('div');
        scaleRow.style.cssText =
            'display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px;';
        scaleRow.append(
            createInput('Scale X', 'modelScaleX'),
            createInput('Scale Y', 'modelScaleY'),
            createInput('Scale Z', 'modelScaleZ'),
        );
        modelSec.appendChild(scaleRow);
        modelSec.appendChild(createToggleRow('Cast Shadow', 'modelCastShadow'));
        modelSec.appendChild(
            createToggleRow('Receive Shadow', 'modelReceiveShadow'),
        );

        const atmosphereSec = createSection('Atmosphere');
        atmosphereSec.appendChild(
            createColorRow('Background Color', 'bgColor'),
        );
        atmosphereSec.appendChild(createToggleRow('Show Floor', 'showFloor'));
        atmosphereSec.appendChild(createInput('Camera Far', 'cameraFar'));

        const ambientSec = createSection('Ambient Light');
        ambientSec.appendChild(createToggleRow('Enable', 'ambientLightToggle'));
        ambientSec.appendChild(createColorRow('Color', 'ambientLightColor'));
        ambientSec.appendChild(
            createInput('Intensity', 'ambientLightIntensity'),
        );

        const dirSec = createSection('Directional Light');
        dirSec.appendChild(createToggleRow('Enable', 'dirLightToggle'));
        dirSec.appendChild(createColorRow('Color', 'dirLightColor'));
        dirSec.appendChild(createInput('Intensity', 'dirLightIntensity'));
        const dirPosRow = document.createElement('div');
        dirPosRow.style.cssText =
            'display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px;';
        dirPosRow.append(
            createInput('X', 'dirLightPosX'),
            createInput('Y', 'dirLightPosY'),
            createInput('Z', 'dirLightPosZ'),
        );
        dirSec.appendChild(dirPosRow);
        dirSec.appendChild(
            createToggleRow('Cast Shadow', 'dirLightCastShadow'),
        );

        const fogSec = createSection('Fog');
        fogSec.appendChild(createToggleRow('Enable', 'fogToggle'));
        fogSec.appendChild(createColorRow('Color', 'fogColor'));
        fogSec.appendChild(createInput('Near', 'fogNear'));
        fogSec.appendChild(createInput('Far', 'fogFar'));

        const skyboxSec = createSection('Skybox');
        skyboxSec.appendChild(createToggleRow('Enable Skybox', 'skyboxToggle'));

        const bulkInputRow = createInput(
            'Bulk URL Paste',
            'skyboxBulkInput',
            'Paste all 6 links here...',
        );
        const bulkInput = bulkInputRow.querySelector('input');

        const skyMapping = {
            _rt: 'skyboxPx',
            _lf: 'skyboxNx',
            _up: 'skyboxPy',
            _dn: 'skyboxNy',
            _bk: 'skyboxPz',
            _ft: 'skyboxNz',
        };

        bulkInput.addEventListener('input', async (e) => {
            const text = e.target.value;
            const urls = text
                .split(/[\s,]+/)
                .filter((u) => u.trim().startsWith('http'));
            if (urls.length > 0) {
                const updates = {};
                urls.forEach((url) => {
                    const lower = url.toLowerCase();
                    for (const suffix in skyMapping) {
                        if (lower.includes(suffix)) {
                            updates[skyMapping[suffix]] = url;
                            break;
                        }
                    }
                });
                if (Object.keys(updates).length > 0) {
                    await chrome.storage.local.set(updates);
                    Object.entries(updates).forEach(([key, val]) => {
                        const input = contentContainer.querySelector(
                            `#creator-${key}`,
                        );
                        if (input) input.value = val;
                    });
                    updateLive();
                }
            }
        });

        const skyHelp = document.createElement('p');
        skyHelp.className = 'text-description';
        skyHelp.style.fontSize = '11px';
        skyHelp.textContent =
            'Faces are automatically detected if URLs end with: _rt (Right), _lf (Left), _up (Top), _dn (Down), _bk (Back), _ft (Front).';
        skyboxSec.append(bulkInputRow, skyHelp);

        const skyGrid = document.createElement('div');
        skyGrid.style.cssText =
            'display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-top:10px;';
        skyGrid.append(
            createInput('Right (_rt)', 'skyboxPx'),
            createInput('Left (_lf)', 'skyboxNx'),
            createInput('Top (_up)', 'skyboxPy'),
            createInput('Bottom (_dn)', 'skyboxNy'),
            createInput('Back (_bk)', 'skyboxPz'),
            createInput('Front (_ft)', 'skyboxNz'),
        );
        skyboxSec.appendChild(skyGrid);

        const actionSec = createSection('Actions');
        const actionBtns = document.createElement('div');
        actionBtns.style.cssText = 'display:flex; gap:10px;';

        const genBtn = document.createElement('button');
        genBtn.className = 'btn-secondary-sm';
        genBtn.textContent = 'Print JSON';
        genBtn.style.flex = '1';
        genBtn.onclick = () => {
            chrome.storage.local.get(null, (data) => {
                const out = {
                    model: {
                        url: data.modelUrl,
                        position: [
                            parseFloat(data.modelPosX) || 0,
                            parseFloat(data.modelPosY) || 0,
                            parseFloat(data.modelPosZ) || 0,
                        ],
                        scale: [
                            parseFloat(data.modelScaleX) || 1,
                            parseFloat(data.modelScaleY) || 1,
                            parseFloat(data.modelScaleZ) || 1,
                        ],
                        castShadow: !!data.modelCastShadow,
                        receiveShadow: !!data.modelReceiveShadow,
                    },
                    atmosphere: {
                        background: data.bgColor || null,
                        showFloor: !!data.showFloor,
                        lights: [],
                        fog: data.fogToggle
                            ? {
                                  color: data.fogColor,
                                  near: parseFloat(data.fogNear) || 0,
                                  far: parseFloat(data.fogFar) || 120,
                              }
                            : null,
                    },
                    camera: { far: parseFloat(data.cameraFar) || 100 },
                };
                if (data.ambientLightToggle)
                    out.atmosphere.lights.push({
                        type: 'AmbientLight',
                        color: data.ambientLightColor,
                        intensity: parseFloat(data.ambientLightIntensity) || 0,
                    });
                if (data.dirLightToggle)
                    out.atmosphere.lights.push({
                        type: 'DirectionalLight',
                        color: data.dirLightColor,
                        intensity: parseFloat(data.dirLightIntensity) || 0,
                        position: [
                            parseFloat(data.dirLightPosX) || 0,
                            parseFloat(data.dirLightPosY) || 0,
                            parseFloat(data.dirLightPosZ) || 0,
                        ],
                        castShadow: !!data.dirLightCastShadow,
                    });
                console.log(
                    'RoValra Environment Config:',
                    JSON.stringify(out, null, 2),
                );
                alert('Config printed to console (F12)');
            });
        };

        const importBtn = document.createElement('button');
        importBtn.className = 'btn-secondary-sm';
        importBtn.textContent = 'Import JSON';
        importBtn.style.flex = '1';
        importBtn.onclick = () => {
            const json = prompt('Paste environment JSON here:');
            if (!json) return;
            try {
                const data = JSON.parse(json);
                const toSet = {};
                if (data.model) {
                    toSet.modelUrl = data.model.url || '';
                    if (data.model.position)
                        [toSet.modelPosX, toSet.modelPosY, toSet.modelPosZ] =
                            data.model.position.map(String);
                    if (data.model.scale)
                        [
                            toSet.modelScaleX,
                            toSet.modelScaleY,
                            toSet.modelScaleZ,
                        ] = data.model.scale.map(String);
                    toSet.modelCastShadow = !!data.model.castShadow;
                    toSet.modelReceiveShadow = !!data.model.receiveShadow;
                }
                if (data.atmosphere) {
                    toSet.bgColor = data.atmosphere.background || '';
                    toSet.showFloor = !!data.atmosphere.showFloor;
                    toSet.fogToggle = !!data.atmosphere.fog;
                    if (data.atmosphere.fog) {
                        toSet.fogColor = data.atmosphere.fog.color;
                        toSet.fogNear = String(data.atmosphere.fog.near);
                        toSet.fogFar = String(data.atmosphere.fog.far);
                    }
                    const amb = data.atmosphere.lights.find(
                        (l) => l.type === 'AmbientLight',
                    );
                    if (amb) {
                        toSet.ambientLightToggle = true;
                        toSet.ambientLightColor = amb.color;
                        toSet.ambientLightIntensity = String(amb.intensity);
                    }
                    const dir = data.atmosphere.lights.find(
                        (l) => l.type === 'DirectionalLight',
                    );
                    if (dir) {
                        toSet.dirLightToggle = true;
                        toSet.dirLightColor = dir.color;
                        toSet.dirLightIntensity = String(dir.intensity);
                        if (dir.position)
                            [
                                toSet.dirLightPosX,
                                toSet.dirLightPosY,
                                toSet.dirLightPosZ,
                            ] = dir.position.map(String);
                        toSet.dirLightCastShadow = !!dir.castShadow;
                    }
                }
                if (data.camera) toSet.cameraFar = String(data.camera.far);
                chrome.storage.local.set(toSet, () => location.reload());
            } catch (e) {
                alert('Invalid JSON');
            }
        };

        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn-secondary-sm';
        resetBtn.textContent = 'Reset Defaults';
        resetBtn.style.flex = '1';
        resetBtn.style.color = 'var(--rovalra-error-color, #ff4444)';
        resetBtn.onclick = () => {
            showConfirmationPrompt({
                title: 'Reset Environment',
                message:
                    'Are you sure you want to reset all Environment Creator settings? This will revert the view to the default void and reload the page.',
                confirmText: 'Reset',
                onConfirm: async () => {
                    const keysToClear = [
                        'modelUrl',
                        'modelPosX',
                        'modelPosY',
                        'modelPosZ',
                        'modelScaleX',
                        'modelScaleY',
                        'modelScaleZ',
                        'modelCastShadow',
                        'modelReceiveShadow',
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
                        'cameraFar',
                        'skyboxToggle',
                        'skyboxPx',
                        'skyboxNx',
                        'skyboxPy',
                        'skyboxNy',
                        'skyboxPz',
                        'skyboxNz',
                        'tooltipToggle',
                        'tooltipText',
                        'tooltipLink',
                        'environmentTester',
                    ];
                    await chrome.storage.local.remove(keysToClear);
                    location.reload();
                },
            });
        };

        actionBtns.append(genBtn, importBtn, resetBtn);
        actionSec.appendChild(actionBtns);

        createOverlay({
            title: 'Environment Creator',
            bodyContent: contentContainer,
            maxWidth: '500px',
            showLogo: true,
        });
    });
}

async function injectCustomButtons(toggleButton) {
    if (
        !globalAvatarData ||
        toggleButton.querySelector('.rovalra-custom-controls')
    )
        return;

    const globalSettings = await chrome.storage.local.get([
        'environmentTester',
    ]);

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

    const recenterBtn = createSquareButton({
        content: 'Recenter',
        width: 'auto',
        fontSize: '12px',
    });
    recenterBtn.style.display = 'none';
    recenterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetCamera();
    });
    recenterBtnRef = recenterBtn;
    controlsWrapper.appendChild(recenterBtn);

    if (globalSettings.environmentTester) {
        const envCreatorBtn = createSquareButton({
            content: 'Env Creator',
            width: 'auto',
            fontSize: '12px',
        });
        envCreatorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEnvironmentCreatorOverlay();
        });
        controlsWrapper.appendChild(envCreatorBtn);
    }

    const R6_DEFAULT_EMOTES = [
        { assetId: 128777973, assetName: 'Wave', position: 1, loop: false },
        { assetId: 128853357, assetName: 'Point', position: 2, loop: false },
        { assetId: 182435998, assetName: 'Dance 1', position: 3, loop: true },
        { assetId: 182436842, assetName: 'Dance 2', position: 4, loop: true },
        { assetId: 182436935, assetName: 'Dance 3', position: 5, loop: true },
        { assetId: 129423131, assetName: 'Laugh', position: 6, loop: false },
        { assetId: 129423030, assetName: 'Cheer', position: 7, loop: false },
    ];

    let emotesToShow = [];
    if (currentRigType === 'R6') {
        emotesToShow = R6_DEFAULT_EMOTES;
    } else if (globalAvatarData.emotes?.length > 0) {
        emotesToShow = globalAvatarData.emotes;
    }

    if (emotesToShow.length > 0) {
        const emoteIconContainer = document.createElement('div');
        emoteIconContainer.innerHTML = decodeURIComponent(
            assets.Emotes.split(',')[1],
        ); //verified
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
            let emotesToShow = [];
            if (currentRigType === 'R6') {
                emotesToShow = R6_DEFAULT_EMOTES;
            } else if (globalAvatarData.emotes?.length > 0) {
                emotesToShow = globalAvatarData.emotes;
            }

            if (emotesToShow.length === 0) {
                return;
            }

            const radialContent = await createEmoteRadialMenu(
                emotesToShow,
                async (emote) => {
                    if (currentRigType === 'R6') {
                        await playDirectAnimation(emote.assetId, emote.loop, 5);
                    } else {
                        await playEmote(emote.assetId, false, 10);
                    }
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
    ); // Verified
    const settingsIcon = settingsIconContainer.querySelector('svg');
    settingsIcon.style.width = '24px';
    settingsIcon.style.height = '24px';
    settingsIcon.style.fill = 'var(--rovalra-main-text-color)';

    const settingsBtn = createSquareButton({
        content: settingsIcon,
        width: 'auto',
        fontSize: '12px',
    });

    settingsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const contentContainer = document.createElement('div');
        Object.assign(contentContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            padding: '5px',
        });
        let environmentChanged = false;

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
                const defaultAnims = animNamesR15;
                const animAssets = globalAvatarData.assets.filter((a) =>
                    a.assetType.name.includes('Animation'),
                );
                const animItemsMap = new Map();

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
                initialValue: 'idle',
                onValueChange: (value) => {
                    const animatorW = getAnimatorW();
                    if (animatorW) {
                        if (value === 'idle') playIdle();
                        else {
                            animatorW.playAnimation(value);
                            activeEmoteId = null;
                        }
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

        const authUserId = await getAuthenticatedUserId();
        const userId = getUserIdFromUrl();
        const isOwnProfile = String(userId) === String(authUserId);
        const settings = await chrome.storage.local.get([
            'profileRenderEnvironment',
            'rendererDeveloperToggles',
            'profileRenderUseApi',
        ]);

        if (isOwnProfile) {
            const envSection = document.createElement('div');
            envSection.innerHTML =
                '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Environment</div>';
            const profileEnvs =
                SETTINGS_CONFIG.Profile.settings.profile3DRenderEnabled
                    .childSettings.profileRenderEnvironment.options;
            const currentEnv = settings.profileRenderEnvironment || 'void';
            const isDonator = getCurrentUserTier() >= 1;
            const effectiveCanUseApi =
                isDonator && settings.profileRenderUseApi;

            const { element: envDropdown } = createDropdown({
                items: profileEnvs,
                initialValue: currentEnv,
                onValueChange: async (value) => {
                    await handleSaveSettings('profileRenderEnvironment', value);
                    environmentChanged = true;
                    const selectedEnv = profileEnvs.find(
                        (opt) => opt.value === value,
                    );
                    const envId = selectedEnv ? selectedEnv.id : 1;
                    if (effectiveCanUseApi) {
                        try {
                            await updateUserSettingViaApi('environment', envId);
                        } catch (error) {
                            console.error(
                                'RoValra: Failed to save environment via API.',
                                error,
                            );
                        }
                    } else {
                        const currentDescription =
                            await getUserDescription(userId);
                        if (currentDescription !== null) {
                            let newDescription = currentDescription
                                .split('\n')
                                .filter((line) => !line.trim().startsWith('e:'))
                                .join('\n')
                                .trim();
                            if (envId !== 1)
                                newDescription = newDescription
                                    ? newDescription + `\n\ne:${envId}`
                                    : `e:${envId}`;
                            if (newDescription !== currentDescription)
                                await updateUserDescription(
                                    userId,
                                    newDescription,
                                );
                        }
                    }
                },
            });
            envDropdown.style.width = '100%';
            envSection.appendChild(envDropdown);
            const helpText = document.createElement('p');
            helpText.textContent =
                'Saves environment choice to your about me as "e:X" so other RoValra users can see it.';
            helpText.style.cssText =
                'font-size: 11px; color: var(--rovalra-secondary-text-color); margin-top: 5px; margin-bottom: 0;'; //Verified
            if (!effectiveCanUseApi) {
                envSection.appendChild(helpText);
            }
            contentContainer.appendChild(envSection);
        }

        if (settings.rendererDeveloperToggles) {
            const devSection = document.createElement('div');
            devSection.innerHTML =
                '<div class="text-label-small" style="margin-bottom:5px; color:var(--rovalra-secondary-text-color);">Developer</div>';
            const skeletonRow = document.createElement('div');
            Object.assign(skeletonRow.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            });
            const label = document.createElement('span');
            label.textContent = 'Show Skeleton Helper';
            label.className = 'text-label-small';
            label.style.color = 'var(--rovalra-main-text-color)';

            const toggle = createToggle({
                checked: FLAGS.SHOW_SKELETON_HELPER,
                onChange: (checked) => {
                    FLAGS.SHOW_SKELETON_HELPER = checked;
                    loadRig(currentRigType);
                },
            });
            skeletonRow.appendChild(label);
            skeletonRow.appendChild(toggle);

            devSection.appendChild(skeletonRow);
            contentContainer.appendChild(devSection);
        }

        createOverlay({
            title: 'Render Settings',
            bodyContent: contentContainer,
            maxWidth: '400px',
            overflowVisible: true,
            showLogo: true,
            onClose: () => {
                if (environmentChanged) location.reload();
            },
        });
    });

    controlsWrapper.appendChild(settingsBtn);

    if (isCustomEnvLoaded && environmentConfig && environmentConfig.tooltip) {
        const infoIconContainer = document.createElement('div');
        infoIconContainer.innerHTML = decodeURIComponent(
            assets.priceFloorIcon.split(',')[1],
        ); // Verified
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
            const deltaTime = (delta / 1000) * animationSpeed;
            const animatorW = getAnimatorW();

            if (currentDirectTrack) {
                const hasReachedEnd = currentDirectTrack.tick(deltaTime);

                if (
                    !currentDirectTrack.looped &&
                    hasReachedEnd &&
                    !currentDirectTrack._isStopping
                ) {
                    currentDirectTrack.Stop(0);
                    currentDirectTrack._isStopping = true;

                    if (animatorW) {
                        animatorW.playAnimation('idle', 0);
                    }

                    currentDirectTrack = null;
                    activeEmoteId = null;
                }

                if (
                    currentDirectTrack &&
                    (currentDirectTrack._isStopping ||
                        currentDirectTrack.weight <= 0.01)
                ) {
                    currentDirectTrack = null;
                    activeEmoteId = null;
                }
            } else if (currentRig) {
                animatorW?.renderAnimation(deltaTime);
            }

            if (currentRig) {
                if (currentRig.preRender) currentRig.preRender();
                RBXRenderer.addInstance(currentRig, null);
            }
            lastRenderTime = currentTime - (delta % interval);
        }
    };
    requestAnimationFrame(animate);
}
let lastLoadedUrl = null;
async function loadCustomEnvironment(scene, config) {
    if (!config) return;

    if (!config.url) {
        if (customModelInstance) scene.remove(customModelInstance);
        customModelInstance = null;
        lastLoadedUrl = null;
        raycastTargets = [];
        isCustomEnvLoaded = true;
        return;
    }

    if (lastLoadedUrl === config.url && customModelInstance) {
        if (config.position)
            customModelInstance.position.set(...config.position);
        if (config.scale) customModelInstance.scale.set(...config.scale);
        customModelInstance.updateMatrix();
        return;
    }

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
                if (customModelInstance) scene.remove(customModelInstance);
                customModelInstance = gltf.scene;
                lastLoadedUrl = config.url;
                raycastTargets = [];
                if (config.position)
                    customModelInstance.position.set(...config.position);
                if (config.scale)
                    customModelInstance.scale.set(...config.scale);
                customModelInstance.traverse((node) => {
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
                scene.add(customModelInstance);
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
                    'profile3DRenderBypassCheck',
                    'environmentTester',
                    'profileRenderUseApi',
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
                const setupSuccess = await RBXRenderer.fullSetup(true, true);

                if (!setupSuccess || RBXRenderer.failedToCreate) {
                    const setupError =
                        RBXRenderer.error ||
                        'WebGL 2 is disabled or your graphics card doesnt support it.';

                    if (!settings.profile3DRenderBypassCheck) {
                        await handleSaveSettings(
                            'profile3DRenderEnabled',
                            false,
                        );
                        await chrome.storage.local.set({
                            profile3DRenderForceDisabled: true,
                        });
                    }
                    isPreloading = false;
                    avatarDataPromise = null;
                    throw new Error(setupError);
                }
                await chrome.storage.local.remove(
                    'profile3DRenderForceDisabled',
                );

                RBXRenderer.setBackgroundTransparent(true);
                preloadedCanvas = RBXRenderer.getRendererElement();
                preloadedCanvas.classList.add('rovalra-canvas');
                Object.assign(preloadedCanvas.style, {
                    width: '100%',
                    height: '100%',
                    outline: 'none',
                    visibility: 'hidden',
                });
                startAnimationLoop();
            }

            await new Promise((r) => setTimeout(r, 10));

            await loadRig(globalAvatarData.playerAvatarType);

            if (preloadedCanvas) {
                preloadedCanvas.style.visibility = 'visible';
            }

            await new Promise((r) => setTimeout(r, 0));

            const setupEnvironment = async () => {
                const scene = RBXRenderer.getScene();
                const camera = RBXRenderer.getRendererCamera();
                const controls = RBXRenderer.getRendererControls();

                if (controls) {
                    controls.autoRotate = !!settings.profileRenderRotateEnabled;
                    controls.autoRotateSpeed = 1.0;
                    controls.rotateSpeed = 0.5;
                }

                const authUserId = await getAuthenticatedUserId();
                const isOwnProfile = String(userId) === String(authUserId);
                const useDevEnvironment = settings.environmentTester;

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
                    const profileEnvs =
                        SETTINGS_CONFIG.Profile.settings.profile3DRenderEnabled
                            .childSettings.profileRenderEnvironment.options;
                    const { environment: apiEnv } = await getUserSettings(
                        userId,
                        {
                            useDescription: true,
                        },
                    );
                    let envIdToRender;
                    if (isOwnProfile) {
                        const profileEnvValue =
                            settings.profileRenderEnvironment || 'void';
                        const selectedEnvFromSettings = profileEnvs.find(
                            (opt) => opt.value === profileEnvValue,
                        );
                        const localEnvId = selectedEnvFromSettings
                            ? selectedEnvFromSettings.id
                            : 1;
                        envIdToRender = localEnvId;
                        if (localEnvId !== apiEnv) {
                            const isDonator = getCurrentUserTier() >= 1;
                            if (isDonator && settings.profileRenderUseApi) {
                                try {
                                    await updateUserSettingViaApi(
                                        'environment',
                                        localEnvId,
                                    );
                                } catch (error) {
                                    console.error(
                                        'RoValra: Failed to sync environment to API.',
                                        error,
                                    );
                                }
                            } else {
                                const currentDescription =
                                    await getUserDescription(userId);
                                if (currentDescription !== null) {
                                    let newDescription = currentDescription
                                        .split('\n')
                                        .filter(
                                            (line) =>
                                                !line.trim().startsWith('e:'),
                                        )
                                        .join('\n')
                                        .trim();
                                    if (localEnvId !== 1) {
                                        newDescription = newDescription
                                            ? newDescription +
                                              `\n\ne:${localEnvId}`
                                            : `e:${localEnvId}`;
                                    }
                                    if (newDescription !== currentDescription) {
                                        await updateUserDescription(
                                            userId,
                                            newDescription,
                                        );
                                    }
                                }
                            }
                        }
                    } else {
                        envIdToRender = apiEnv;
                    }

                    const selectedEnv = profileEnvs.find(
                        (opt) => opt.id === envIdToRender,
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
                        settings.skyboxPx,
                        settings.skyboxNx,
                        settings.skyboxPy,
                        settings.skyboxNy,
                        settings.skyboxPz,
                        settings.skyboxNz,
                    ];
                } else if (environmentConfig?.skybox) {
                    skyboxUrls = environmentConfig.skybox;
                }

                if (skyboxUrls && skyboxUrls.every((url) => url)) {
                    const mapping = {
                        _rt: 0, // px
                        _lf: 1, // nx
                        _up: 2, // py
                        _dn: 3, // ny
                        _ft: 5, // nz
                        _bk: 4, // pz
                    };
                    const sorted = new Array(6);
                    let matchCount = 0;

                    for (const url of skyboxUrls) {
                        const lower = url.toLowerCase();
                        for (const suffix in mapping) {
                            if (
                                lower.includes(suffix) &&
                                sorted[mapping[suffix]] === undefined
                            ) {
                                sorted[mapping[suffix]] = url;
                                matchCount++;
                                break;
                            }
                        }
                    }
                    if (matchCount === 6) skyboxUrls = sorted;

                    const rotateSkyboxImage = (url, angle) => {
                        return new Promise((resolve) => {
                            const img = new Image();
                            img.crossOrigin = 'Anonymous';
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.height;
                                canvas.height = img.width;
                                const ctx = canvas.getContext('2d');
                                ctx.translate(
                                    canvas.width / 2,
                                    canvas.height / 2,
                                );
                                ctx.rotate((angle * Math.PI) / 180);
                                ctx.drawImage(
                                    img,
                                    -img.width / 2,
                                    -img.height / 2,
                                );
                                resolve(canvas.toDataURL());
                            };
                            img.onerror = () => resolve(url);
                            img.src = url;
                        });
                    };

                    try {
                        const [up, dn] = await Promise.all([
                            rotateSkyboxImage(skyboxUrls[2], 270), //top skybox rotation
                            rotateSkyboxImage(skyboxUrls[3], 90), //bottom skybox rotation
                        ]);
                        skyboxUrls[2] = up;
                        skyboxUrls[3] = dn;
                    } catch (e) {
                        console.warn('RoValra: Skybox rotation failed', e);
                    }

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
            avatarDataPromise = null;
            throw err;
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

    avatarPromise.catch((err) => {
        container.innerHTML = '';
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText =
            'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--rovalra-secondary-text-color); padding: 20px; text-align: center; font-size: 12px;';
        errorContainer.innerHTML = safeHtml`<span style="font-size: 24px; margin-bottom: 8px;">⚠️</span><div style="font-weight:600; margin-bottom:4px;">3D Renderer Error</div><div>${err.message}</div>`;
        container.appendChild(errorContainer);
    });

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
    syncDonatorTier();
    chrome.storage.local.get(
        { profile3DRenderEnabled: true, profile3DRenderForceDisabled: false },
        (result) => {
            if (result.profile3DRenderForceDisabled) {
                try {
                    const canvas = document.createElement('canvas');
                    if (canvas.getContext('webgl2')) {
                        chrome.storage.local.remove(
                            'profile3DRenderForceDisabled',
                        );
                    }
                } catch (e) {}
            }

            if (result.profile3DRenderEnabled) {
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
                        if (
                            element.classList.contains('thumbnail-3d-container')
                        ) {
                            attachPreloadedAvatar(element);
                        } else if (
                            element.classList.contains('avatar-toggle-button')
                        ) {
                            const updateButtons = () => {
                                element
                                    .querySelectorAll('button')
                                    .forEach((btn) => {
                                        btn.style.backgroundColor =
                                            'var(--rovalra-container-background-color)';
                                    });
                            };
                            updateButtons();
                            observeChildren(element, updateButtons);
                            avatarPromise.then((data) => {
                                if (data) injectCustomButtons(element);
                            });
                        }
                    },
                    { multiple: true },
                );

                let hasAutoSwitchedTo3D = false;
                observeElement(
                    'button.foundation-web-button',
                    (button) => {
                        if (hasAutoSwitchedTo3D) return;

                        if (button.textContent.trim() === '3D') {
                            if (
                                document.querySelector(
                                    '.thumbnail-holder-position .thumbnail-2d-container',
                                )
                            ) {
                                button.click();
                            }
                            hasAutoSwitchedTo3D = true;
                        }
                    },
                    { multiple: true },
                );
            }
        },
    );
}
