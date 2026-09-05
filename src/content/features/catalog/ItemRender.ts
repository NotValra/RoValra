import { observeChildren, observeElement } from '../../core/observer.js';
import {
    RBXRenderer,
    Outfit,
    FLAGS,
    Authentication,
    OutfitRenderer,
    API,
    AssetTypes,
    CFrame,
    OutfitModel,
    AvatarType,
    Vec3,
    RBXRendererScene,
    Vector3,
    Vec2,
    CACHE as RENDERER_CACHE,
} from 'roavatar-renderer';
import { callRobloxApiJson } from '../../core/api.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { getAssets } from '../../core/assets.js';
import { isDarkMode } from '../../core/theme.js';
import { ts } from '../../core/locale/i18n.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { backgroundRendererRequests, getItemCardColor, getMainColor, setSceneColor } from '../../core/utils/renderer.js';

const assets = getAssets();

//RENDERER FLAGS
FLAGS.ONLINE_ASSETS = true;
FLAGS.AUDIO_ENABLED = false;

backgroundRendererRequests();

const HOVER_FRAME_TIME = 5;
const HOVER_AUTO_SWITCH_ANIM_TIME = 3;
const HOVER_CAMERA_ROTATION_SPEED = 120;
const DEFAULT_ITEM_RENDER_LIGHTING_MULTIPLIER = 1.5;
const BASEPLATE_ENVIRONMENT_ENDPOINT = '/static/json/baseplate.json';
const renderEnvironmentModeValues = new Set([
    'default',
    'dark',
    'baseplate',
    'dark-baseplate',
]);
const R6_ANIMATION_NAMES = ['idle', 'walk', 'jump', 'fall', 'climb'];
const R15_ANIMATION_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'climb', 'swim'];

//outfit data
let ogAvatarDataLoaded = false;
let ogAvatarData = new OutfitModel();

let mainOutfit = new OutfitModel();
let itemHoverOutfit = new OutfitModel();

//rendering data
const mainScene = RBXRenderer.addScene();
const itemHoverScene = RBXRenderer.addScene();
RBXRenderer.firstScene.noRect();
mainScene.noRect();
itemHoverScene.noRect();

let needsMainOutfitRenderer = true;

let mainOutfitRenderer: OutfitRenderer | undefined = undefined;
let itemHoverOutfitRenderer: OutfitRenderer | undefined = undefined;

let startedRenderer = false;

let mainRendererEnabled = false;
let hoverPreviewEnabled = true;

let selectedAnimName = 'idle';
let accessoriesEnabled = true;
let selectedRenderEnvironmentMode = 'default';

type RendererEnviromentMenu = {
    wrapper: HTMLButtonElement,
    button: HTMLButtonElement,
    panel: HTMLDivElement,
}

type RadioElement = HTMLButtonElement & {
    setChecked: (isChecked: boolean) => {}
}

let renderEnvironmentMenu: RendererEnviromentMenu | undefined = undefined;
let renderEnvironmentDarkToggle: RadioElement | undefined = undefined;
let renderEnvironmentBaseplateToggle: RadioElement | undefined = undefined;
let baseplateEnvironmentConfig: any = undefined;
let itemRenderEnvironmentModel: THREE.Group | undefined = undefined;
let itemRenderEnvironmentModelUrl: string | undefined = undefined;

type SceneLightState = {
    light: THREE.AmbientLight | THREE.DirectionalLight,
    intensity: number,
    visible: boolean,
}

type ScenePlaneState = {
    plane: boolean,
    shadowPlane: boolean
}

type ModelConfig = {
    url: string,
    position: Vec3,
    scale: Vec3,
    castShadow?: boolean,
    receiveShadow?: boolean
}

type AtmosphereConfig = {
    showFloor: boolean,
    lights: {
        type: string,
        color: string,
        intensity: number,
        position?: Vec3,
        castShadow?: boolean,
    }[]
}

let defaultMainSceneLightState: SceneLightState[] | undefined = undefined;
let defaultMainScenePlaneState: ScenePlaneState | undefined = undefined;

let currentlyLoadingAssets: boolean = false;
let pendingAnimationUpdate: boolean = false;

API.Events.OnLoadingAssets.Connect((newValue) => {
    currentlyLoadingAssets = newValue as boolean;
});

//dom info
let mainSceneContainer: HTMLElement | undefined = undefined;
let mainButtonContainer: HTMLElement | undefined = undefined;
let mousePos = [0, 0];
let buttonFor3d: HTMLElement | undefined = undefined;
let animationDropdown: HTMLElement | undefined = undefined;
let toggleAccessories: HTMLElement | undefined = undefined;
let buttonForRig: HTMLElement | undefined = undefined;
let selectedRigType: AvatarType | undefined = undefined;

let lastUrl = window.location.href;
let lastCurrentHoveredItemElement: HTMLElement | undefined = undefined;
let currentHoveredItemFrames = 0;
let currentHoveredItemElement: HTMLElement | undefined = undefined;
let currentHoveredItemLink: string | undefined = undefined;
let currentHoveredItemThumbElement: HTMLElement | undefined = undefined;
let currentHoveredItemLoading = false;
let currentHoveredItemType: string | undefined = undefined;
let itemHoverCameraRotation = 0;
let itemHoverCameraRotating = false;
let itemHoverRotateButton: HTMLElement | undefined = undefined;
let itemHoverShouldAutoSwitchAnim = false;
let itemHoverAutoSwitchAnimTimePassed = 0;

const toggleDefaultButtons = (enabled: boolean) => {
    if (!mainButtonContainer) return;
    for (const child of mainButtonContainer.children) {
        if (child instanceof HTMLElement) {
            if (child.dataset.rovalraItemRendererControl) continue;
            child.style.display = enabled ? 'none' : '';
        }
    }

    //make size of left button container small so it doesnt affect button placement in the right container
    const leftAlignContainer = document.body.querySelector(".thumbnail-ui-container > .bottom-align-container > .left-align-container") as HTMLElement;
    if (leftAlignContainer) {
        leftAlignContainer.style = enabled ? "width: 0;" : "";
    }

    //stop animations from playing in robloxs animation preview since its super laggy
    if (enabled) {
        const bigstop = document.body.querySelector(".enable-three-dee.btn-control > .icon-bigstop") as HTMLElement;
        if (bigstop) {
            bigstop.click();
        }
    }
};

const updateRigButtonText = () => {
    if (!buttonForRig) return;
    buttonForRig.textContent =
        selectedRigType || ogAvatarData.outfit.playerAvatarType || 'R15';
};

const updateAnimationDropdown = () => {
    if (!mainButtonContainer) return;
    if (animationDropdown) {
        animationDropdown.remove();
        animationDropdown = undefined;
    }

    if (
        !mainRendererEnabled ||
        mainOutfit.outfit.containsAssetType('EmoteAnimation')
    ) {
        return;
    }

    selectedAnimName = 'idle';
    const currentType =
        selectedRigType || ogAvatarData.outfit.playerAvatarType || 'R15';
    const isR6 = currentType === 'R6';
    const items = isR6
        ? R6_ANIMATION_NAMES
        : R15_ANIMATION_NAMES;

    const trueItems = items.map((v) => {
        return { label: ts(`animations.${v}`), value: v };
    });

    
    const { element: dropdownElement } = createDropdown({
        // @ts-ignore
        items: trueItems,
        initialValue: 'idle',
        onValueChange: (value: string) => {
            selectedAnimName = value;
            if (mainOutfitRenderer) mainOutfitRenderer.setMainAnimation(selectedAnimName);
        },
    });
    animationDropdown = dropdownElement;
    animationDropdown.dataset.rovalraItemRendererControl = 'true';
    animationDropdown.style.zIndex = "2";
    animationDropdown.style.width = '110px';

    mainButtonContainer.prepend(animationDropdown);
    toggleDefaultButtons(mainRendererEnabled);
};

function getMainSceneDefaultLights() {
    return [
        mainScene.ambientLight,
        mainScene.directionalLight,
        mainScene.directionalLight2,
    ].filter((v => {return !!v}));
}

function captureMainSceneDefaults() {
    if (!defaultMainSceneLightState) {
        defaultMainSceneLightState = getMainSceneDefaultLights().map(
            (light) => ({
                light,
                intensity: light.intensity,
                visible: light.visible,
            }),
        );
    }

    if (!defaultMainScenePlaneState) {
        defaultMainScenePlaneState = {
            plane: mainScene.plane?.visible || false,
            shadowPlane: mainScene.shadowPlane?.visible || false,
        };
    }
}

function removeItemRenderEnvironmentLights() {
    mainScene.scene.children
        .filter((object) => object.userData?.rovalraItemRenderEnvironmentLight)
        .forEach((light) => mainScene.scene.remove(light));
}

function setMainSceneDefaultLightsEnabled(enabled: boolean) {
    captureMainSceneDefaults();

    if (defaultMainSceneLightState) {
        defaultMainSceneLightState.forEach(({ light, intensity, visible }) => {
            light.visible = enabled ? visible : false;
            light.intensity = enabled ? intensity : 0;
        });
    }
}

function addItemRenderEnvironmentLight(light: THREE.Light) {
    light.userData.rovalraItemRenderEnvironmentLight = true;
    mainScene.scene.add(light);
}

function applyDarkItemRenderLighting() {
    setMainSceneDefaultLightsEnabled(false);
    removeItemRenderEnvironmentLights();

    addItemRenderEnvironmentLight(new THREE.AmbientLight(0xffffff, 0.015));

    const directionalLight = new THREE.DirectionalLight(0xd9e6ff, 0.02);
    directionalLight.position.set(-4, 8, -6);
    addItemRenderEnvironmentLight(directionalLight);
}

function applyAtmosphereItemRenderLighting(atmosphere: AtmosphereConfig) {
    setMainSceneDefaultLightsEnabled(false);
    removeItemRenderEnvironmentLights();

    if (atmosphere?.lights && Array.isArray(atmosphere.lights)) {
        atmosphere.lights.forEach((lightDef) => {
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

            if (light) addItemRenderEnvironmentLight(light);
        });
    }
}

function resetItemRenderEnvironmentLighting() {
    removeItemRenderEnvironmentLights();
    setMainSceneDefaultLightsEnabled(true);
}

function getRenderEnvironmentTogglesFromMode(mode: string): {[key: string]: boolean} {
    return {
        dark: mode === 'dark' || mode === 'dark-baseplate',
        baseplate: mode === 'baseplate' || mode === 'dark-baseplate',
    };
}

function getRenderEnvironmentModeFromToggles({ dark, baseplate }: {[key: string]: boolean}) {
    if (dark && baseplate) return 'dark-baseplate';
    if (dark) return 'dark';
    if (baseplate) return 'baseplate';
    return 'default';
}

function updateRenderEnvironmentToggleButtons() {
    const toggles = getRenderEnvironmentTogglesFromMode(
        selectedRenderEnvironmentMode,
    );
    renderEnvironmentDarkToggle?.setChecked(toggles.dark);
    renderEnvironmentBaseplateToggle?.setChecked(toggles.baseplate);
}

function setRenderEnvironmentToggle(toggleName: string, isEnabled: boolean) {
    const toggles = getRenderEnvironmentTogglesFromMode(
        selectedRenderEnvironmentMode,
    );
    toggles[toggleName] = isEnabled;

    selectedRenderEnvironmentMode =
        getRenderEnvironmentModeFromToggles(toggles);

    chrome.storage.local.set({
        marketplace3DRenderEnvironment: selectedRenderEnvironmentMode,
    });

    updateRenderEnvironmentToggleButtons();
    applyItemRenderEnvironmentMode();
}

function resolveRenderEnvironmentUrl(url: string) {
    try {
        new URL(url);
        return url;
    } catch {
        return chrome.runtime.getURL(url);
    }
}

function sortSkyboxUrls(skyboxUrls: string[]) {
    const mapping: {[key: string]: number} = {
        _rt: 0,
        _lf: 1,
        _up: 2,
        _dn: 3,
        _ft: 5,
        _bk: 4,
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

    return matchCount === 6 ? sorted : skyboxUrls;
}

function transformSkyboxImage(url: string, { angle = 0, darken = false } = {}) {
    if (!angle && !darken) return Promise.resolve(url);

    return new Promise<string>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            try {
                const isRotated = Math.abs(angle) % 180 !== 0;
                const canvas = document.createElement('canvas');
                canvas.width = isRotated ? img.height : img.width;
                canvas.height = isRotated ? img.width : img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw "no context"
                ctx.translate(canvas.width / 2, canvas.height / 2);
                if (angle) ctx.rotate((angle * Math.PI) / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                if (darken) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                resolve(canvas.toDataURL());
            } catch {
                resolve(url);
            }
        };
        img.onerror = () => resolve(url);
        img.src = url;
    });
}

async function applyItemRenderSkybox(skyboxUrls: string[], darken = false) {
    if (!Array.isArray(skyboxUrls) || skyboxUrls.length !== 6) return false;
    if (!skyboxUrls.every((url) => url)) return false;

    skyboxUrls = sortSkyboxUrls(
        skyboxUrls.map((url) => resolveRenderEnvironmentUrl(url)),
    );

    try {
        skyboxUrls = await Promise.all([
            transformSkyboxImage(skyboxUrls[0], { darken }),
            transformSkyboxImage(skyboxUrls[1], { darken }),
            transformSkyboxImage(skyboxUrls[2], { angle: 270, darken }),
            transformSkyboxImage(skyboxUrls[3], { angle: 90, darken }),
            transformSkyboxImage(skyboxUrls[4], { darken }),
            transformSkyboxImage(skyboxUrls[5], { darken }),
        ]);
    } catch (error) {
        console.warn('RoValra: ItemRender skybox transform failed', error);
    }

    mainScene.scene.background = new THREE.CubeTextureLoader().load(skyboxUrls);
    return true;
}

async function applyItemRenderEnvironmentBackground(
    config: any,
    usesBaseplate: boolean,
    usesDarkLighting: boolean,
) {
    const atmosphere = config?.atmosphere;
    const hasSkybox =
        usesBaseplate &&
        (await applyItemRenderSkybox(config?.skybox, usesDarkLighting));

    if (!hasSkybox && atmosphere?.background) {
        mainScene.scene.background = new THREE.Color(atmosphere.background);
    } else if (!hasSkybox && !RBXRenderer.backgroundTransparent) {
        mainScene.scene.background = new THREE.Color(
            RBXRenderer.backgroundColorHex,
        );
        setSceneColor(mainScene, getMainColor());
    } else if (!hasSkybox) {
        mainScene.scene.background = null;
    }

    const showDefaultFloor = !usesBaseplate;
    if (mainScene.plane) {
        mainScene.plane.visible = showDefaultFloor
            ? (defaultMainScenePlaneState?.plane ?? true)
            : false;
    }
    if (mainScene.shadowPlane) {
        mainScene.shadowPlane.visible = showDefaultFloor
            ? (defaultMainScenePlaneState?.shadowPlane ?? true)
            : false;
    }

    if (atmosphere?.fog) {
        mainScene.scene.fog = new THREE.Fog(
            new THREE.Color(atmosphere.fog.color || 0xffffff),
            atmosphere.fog.near || 30,
            atmosphere.fog.far || 120,
        );
    } else {
        mainScene.scene.fog = null;
    }
}

async function getBaseplateEnvironmentConfig() {
    if (baseplateEnvironmentConfig) return baseplateEnvironmentConfig;

    baseplateEnvironmentConfig = await callRobloxApiJson({
        isRovalraApi: true,
        subdomain: 'www',
        endpoint: BASEPLATE_ENVIRONMENT_ENDPOINT,
        method: 'GET',
    });

    return baseplateEnvironmentConfig;
}

async function loadItemRenderEnvironmentModel(config: ModelConfig) {
    if (!config?.url) return;

    if (
        itemRenderEnvironmentModelUrl === config.url &&
        itemRenderEnvironmentModel
    ) {
        if (config.position)
            itemRenderEnvironmentModel.position.set(...config.position);
        if (config.scale) itemRenderEnvironmentModel.scale.set(...config.scale);
        itemRenderEnvironmentModel.updateMatrix();
        return;
    }

    await new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        let envUrl = config.url;
        try {
            new URL(envUrl);
        } catch {
            envUrl = chrome.runtime.getURL(envUrl);
        }

        loader.load(
            envUrl,
            (gltf) => {
                if (itemRenderEnvironmentModel) {
                    mainScene.scene.remove(itemRenderEnvironmentModel);
                }

                itemRenderEnvironmentModel = gltf.scene;
                itemRenderEnvironmentModelUrl = config.url;

                if (config.position)
                    itemRenderEnvironmentModel.position.set(...config.position);
                if (config.scale)
                    itemRenderEnvironmentModel.scale.set(...config.scale);

                itemRenderEnvironmentModel.traverse((node) => {
                    if (!(node instanceof THREE.Mesh)) return;
                    node.userData.isEnvironment = true;
                    if (config.receiveShadow !== undefined)
                        node.receiveShadow = config.receiveShadow;
                    if (config.castShadow !== undefined)
                        node.castShadow = config.castShadow;
                    node.matrixAutoUpdate = false;
                    node.updateMatrix();
                });

                mainScene.scene.add(itemRenderEnvironmentModel);
                resolve(null);
            },
            undefined,
            (error) => {
                console.error('RoValra: ItemRender GLTF Load Error', error);
                reject(error);
            },
        );
    });
}

function removeItemRenderEnvironmentModel() {
    if (!itemRenderEnvironmentModel) return;

    mainScene.scene.remove(itemRenderEnvironmentModel);
    itemRenderEnvironmentModel = undefined;
    itemRenderEnvironmentModelUrl = undefined;
}

async function applyItemRenderEnvironmentMode() {
    captureMainSceneDefaults();

    const usesBaseplate =
        selectedRenderEnvironmentMode === 'baseplate' ||
        selectedRenderEnvironmentMode === 'dark-baseplate';
    const usesDarkLighting =
        selectedRenderEnvironmentMode === 'dark' ||
        selectedRenderEnvironmentMode === 'dark-baseplate';

    let environmentConfig = null;
    if (usesBaseplate) {
        try {
            environmentConfig = await getBaseplateEnvironmentConfig();
            await loadItemRenderEnvironmentModel(environmentConfig.model);
        } catch (error) {
            console.error(
                'RoValra: Failed to load item render baseplate.',
                error,
            );
        }
    } else {
        removeItemRenderEnvironmentModel();
    }

    await applyItemRenderEnvironmentBackground(
        environmentConfig,
        usesBaseplate,
        usesDarkLighting,
    );

    if (usesDarkLighting) {
        applyDarkItemRenderLighting();
    } else if (usesBaseplate) {
        applyAtmosphereItemRenderLighting(environmentConfig?.atmosphere);
    } else {
        resetItemRenderEnvironmentLighting();
    }
}

function closeRenderEnvironmentMenu() {
    if (!renderEnvironmentMenu) return;

    renderEnvironmentMenu.panel.setAttribute('data-state', 'closed');
    renderEnvironmentMenu.panel.style.display = 'none';
    renderEnvironmentMenu.button.setAttribute('data-state', 'closed');
    renderEnvironmentMenu.button.classList.remove('filter-button-active');
}

function positionRenderEnvironmentPanel() {
    if (!renderEnvironmentMenu) return;

    const buttonBounds = renderEnvironmentMenu.button.getBoundingClientRect();
    const panelBounds = renderEnvironmentMenu.panel.getBoundingClientRect();
    const panelWidth = panelBounds.width || 260;
    const panelLeft = Math.min(
        Math.max(
            buttonBounds.left + buttonBounds.width / 2 - panelWidth / 2,
            8,
        ),
        window.innerWidth - panelWidth - 8,
    );

    renderEnvironmentMenu.panel.style.top = `${buttonBounds.bottom + 8}px`;
    renderEnvironmentMenu.panel.style.left = `${panelLeft}px`;
    renderEnvironmentMenu.panel.style.right = 'auto';
}

function createRenderEnvironmentToggleRow({ label, toggleName }: {label: string, toggleName: string}) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between';

    const text = document.createElement('label');
    text.className = 'text-body';
    text.textContent = label;

    const toggle = createRadioButton({
        checked: getRenderEnvironmentTogglesFromMode(
            selectedRenderEnvironmentMode,
        )[toggleName],
        // @ts-ignore
        onChange: (isChecked: boolean) => {
            setRenderEnvironmentToggle(toggleName, isChecked);
        },
    }) as RadioElement;

    if (toggleName === 'dark') {
        renderEnvironmentDarkToggle = toggle;
    } else {
        renderEnvironmentBaseplateToggle = toggle;
    }

    row.append(text, toggle);
    return row;
}

function updateRenderEnvironmentDropdown() {
    if (!mainButtonContainer) return;

    if (!renderEnvironmentMenu) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className =
            'enable-three-dee btn-control button-placement btn-control-md btn--width';
        button.dataset.rovalraItemRendererControl = 'true';
        button.setAttribute('aria-label', ts('itemRender.renderOptions'));
        button.title = ts('itemRender.renderOptions');
        button.style.zIndex = "2";
        button.style.display = mainRendererEnabled ? '' : 'none';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';

        const settingsIcon = document.createElement('img');
        settingsIcon.src = getSettingsIcon();
        settingsIcon.alt = '';
        settingsIcon.setAttribute('aria-hidden', 'true');
        settingsIcon.style.width = '18px';
        settingsIcon.style.height = '18px';
        settingsIcon.style.display = 'block';
        settingsIcon.style.pointerEvents = 'none';

        button.appendChild(settingsIcon);

        const panel = document.createElement('div');
        panel.className =
            'rovalra-dropdown-content foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
        panel.style.display = 'none';
        panel.style.position = 'fixed';
        panel.style.minWidth = '260px';
        panel.style.zIndex = '10010';
        panel.setAttribute('data-state', 'closed');

        const optionsContainer = document.createElement('div');
        optionsContainer.className =
            'padding-x-large padding-y-large flex flex-col gap-medium';
        optionsContainer.append(
            createRenderEnvironmentToggleRow({
                label: ts('itemRender.darkLighting'),
                toggleName: 'dark',
            }),
            createRenderEnvironmentToggleRow({
                label: ts('itemRender.baseplate'),
                toggleName: 'baseplate',
            }),
        );

        panel.append(optionsContainer);
        panel.addEventListener('click', (event) => event.stopPropagation());

        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = panel.getAttribute('data-state') === 'open';
            panel.setAttribute('data-state', isOpen ? 'closed' : 'open');
            panel.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) positionRenderEnvironmentPanel();
            button.setAttribute('data-state', isOpen ? 'closed' : 'open');
            button.classList.toggle('filter-button-active', !isOpen);
        });

        document.addEventListener('click', (event) => {
            if (
                // @ts-ignore
                !button.contains(event.target) &&
                // @ts-ignore
                !panel.contains(event.target)
            ) {
                closeRenderEnvironmentMenu();
            }
        });

        window.addEventListener('resize', positionRenderEnvironmentPanel);
        window.addEventListener('scroll', positionRenderEnvironmentPanel, true);
        document.body.appendChild(panel);

        renderEnvironmentMenu = {
            wrapper: button,
            button,
            panel,
        };
    }

    updateRenderEnvironmentToggleButtons();
    renderEnvironmentMenu.button.style.display = mainRendererEnabled
        ? ''
        : 'none';
    positionRenderEnvironmentPanel();

    if (!mainButtonContainer.contains(renderEnvironmentMenu.wrapper)) {
        mainButtonContainer.prepend(renderEnvironmentMenu.wrapper);
    }
}

function updateMousePos(e: MouseEvent) {
    mousePos = [e.clientX, e.clientY];
}

function stopItemHoverCameraRotation() {
    itemHoverCameraRotating = false;
}

function updateHoverRotateButton(bounds?: DOMRect) {
    if (!itemHoverRotateButton) return;

    if (!bounds) {
        itemHoverRotateButton.style.display = 'none';
        return;
    }

    itemHoverRotateButton.style.display = 'flex';
    itemHoverRotateButton.style.left = bounds.right - 40 + 'px';
    itemHoverRotateButton.style.top = bounds.bottom - 40 + 'px';
}

//roavatar loading icon positioning
function resetLoadingIconPos() {
    if (RBXRenderer.loadingIcon) {
        RBXRenderer.loadingIcon.style.position = 'fixed';
        RBXRenderer.loadingIcon.style.left = '';
        RBXRenderer.loadingIcon.style.top = '';
        RBXRenderer.loadingIcon.style.bottom = '';
        RBXRenderer.loadingIcon.style.right = '';
    }
}

function noLoadingIconPos() {
    if (RBXRenderer.loadingIcon) {
        RBXRenderer.loadingIcon.style.position = 'fixed';
        RBXRenderer.loadingIcon.style.left = '-100000px';
    }
}

function applyIconTheme(icon: string) {
    if (!isDarkMode()) {
        //eww! (i dont know how to do this in a better way)
        return icon.replace('fill%3D%22%23FFFFFF', 'fill%3D%22%23202227');
    }
    return icon;
}

function getSettingsIcon() {
    const iconColor = isDarkMode() ? '#FFFFFF' : '#202227';
    return `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path fill="${iconColor}" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6"></path></svg>`,
    )}`;
}

function getApparelIcon() {
    let icon = accessoriesEnabled ? assets.apparelFillIcon : assets.apparelIcon;
    return applyIconTheme(icon);
}

//Updates camera for outfitRenderer based on added assetType
function assetTypeToCamera(
    renderScene: RBXRendererScene,
    outfitRenderer: OutfitRenderer,
    assetType: string,
    rotation = 0,
) {
    const rig = outfitRenderer.currentRig;
    if (!rig) return;

    let isR6 = false;
    if (rig.FindFirstChild('Torso')) {
        isR6 = true;
    }

    let partName = isR6 ? 'Torso' : 'UpperTorso';
    let cameraMultiplier = 1;
    let yOffsetMultiplier = 0;
    let xOffsetMultiplier = 0;
    let zOffset = 3;

    switch (assetType) {
        //head overview
        case 'Hat':
        case 'HairAccessory':
        case 'Head':
        case 'DynamicHead':
        case 'EarAccessory':
        case 'EyeAccessory': {
            cameraMultiplier = 1;
            partName = 'Head';
            if (isR6) cameraMultiplier *= 0.5;
            break;
        }
        //face close up
        case 'FaceAccessory':
        case 'Face':
        case 'FaceMakeup':
        case 'LipMakeup':
        case 'EyeMakeup':
        case 'EyebrowAccessory':
        case 'EyelashAccessory': {
            cameraMultiplier = 0.75;
            partName = 'Head';
            if (isR6) cameraMultiplier *= 0.5;
            break;
        }
        //neck close up
        case 'NeckAccessory': {
            cameraMultiplier = 0.75;
            partName = 'Head';
            yOffsetMultiplier = -0.5;
            if (isR6) cameraMultiplier *= 0.5;
            break;
        }
        //shoulder view
        case 'ShoulderAccessory': {
            cameraMultiplier = 1;
            partName = 'Head';
            yOffsetMultiplier = -0.5;
            if (isR6) cameraMultiplier *= 0.5;
            break;
        }
        //back view
        case 'BackAccessory': {
            cameraMultiplier = -cameraMultiplier;
            partName = isR6 ? 'Torso' : 'UpperTorso';
            break;
        }
        //waist view
        case 'WaistAccessory': {
            cameraMultiplier = 0.6;
            partName = isR6 ? 'Torso' : 'UpperTorso';
            yOffsetMultiplier = -0.75;
            break;
        }
        //torso view
        case 'TShirt':
        case 'Shirt':
        case 'TShirtAccessory':
        case 'ShirtAccessory':
        case 'JacketAccessory':
        case 'SweaterAccessory':
        case 'FrontAccessory':
        case 'Torso': {
            cameraMultiplier = 0.8;
            partName = isR6 ? 'Torso' : 'UpperTorso';
            break;
        }
        //legs view
        case 'Pants':
        case 'PantsAccessory':
        case 'ShortsAccessory':
        case 'DressSkirtAccessory':
        case 'LeftShoeAccessory':
        case 'RightShoeAccessory':
        case 'LeftLeg':
        case 'RightLeg': {
            cameraMultiplier = 0.5;
            partName = isR6 ? 'Torso' : 'UpperTorso';
            yOffsetMultiplier = -1.1;
            break;
        }
        case 'RightArm': {
            cameraMultiplier = 0.5;
            partName = isR6 ? 'Torso' : 'UpperTorso';
            xOffsetMultiplier = 0.5;
            break;
        }
        case 'LeftArm': {
            cameraMultiplier = 0.5;
            partName = isR6 ? 'Torso' : 'UpperTorso';
            xOffsetMultiplier = -0.5;
            break;
        }
        case 'Gear':
        case 'Animation':
        case 'MoodAnimation':
        case 'ClimbAnimation':
        case 'DeathAnimation':
        case 'FallAnimation':
        case 'IdleAnimation':
        case 'JumpAnimation':
        case 'RunAnimation':
        case 'SwimAnimation':
        case 'WalkAnimation':
        case 'PoseAnimation':
        case 'EmoteAnimation': {
            //default
            break;
        }
    }

    //calculate camera cframe
    const part = rig.FindFirstChild(partName);

    if (part) {
        const partCF = (part.Prop('CFrame') as CFrame).clone();
        partCF.Orientation = [0, 0, 0];
        const partSize = part.Prop('Size') as Vector3;
        const distance =
            Math.max(partSize.X, partSize.Y, partSize.Z) *
            zOffset *
            cameraMultiplier;
        const xOffset = partSize.X * xOffsetMultiplier;
        const rotationRadians = (rotation * Math.PI) / 180;
        const rotatedX =
            xOffset * Math.cos(rotationRadians) -
            -distance * Math.sin(rotationRadians);
        const rotatedZ =
            xOffset * Math.sin(rotationRadians) +
            -distance * Math.cos(rotationRadians);

        const targetPosition: Vec3 = [
            partCF.Position[0],
            partCF.Position[1] + partSize.Y * yOffsetMultiplier,
            partCF.Position[2],
        ];
        const cameraPosition: Vec3 = [
            targetPosition[0] + rotatedX,
            targetPosition[1],
            targetPosition[2] + rotatedZ,
        ];
        const cameraCF = CFrame.lookAt(cameraPosition, targetPosition);

        RBXRenderer.setCameraCFrame(cameraCF, renderScene);
    }
}

//loads users original avatar
async function loadOgAvatar() {
    //get avatar data for the user
    if (!ogAvatarDataLoaded) {
        const avatarData = await API.Avatar.GetAvatarModel();
        if (!(avatarData instanceof Response)) {
            ogAvatarData = avatarData
            ogAvatarData.outfit.playerAvatarType = avatarData.outfit.playerAvatarType;
        }
    }
    ogAvatarDataLoaded = true;
}

//adds item to outfit
async function addItem(outfitModel: OutfitModel, itemId: any, itemType: string, typee: any) {
    const outfit = outfitModel.outfit

    if (itemType === 'Bundle') {
        if (!(await outfit.addBundleId(itemId))) return;
    } else if (itemType === 'Asset') {
        if (!typee) {
            if (!(await outfit.addAssetId(itemId, new Authentication())))
                return;
        } else {
            outfit.removeAssetType(typee);
            outfit.addAsset(itemId, typee, '');
        }

        for (const asset of outfit.assets) {
            if (asset.assetType.name == "AvatarBackground") {
                outfitModel.background = asset
            }
        }
    } else if (itemType === 'Look') {
        const lookResult = await API.Looks.GetLook(itemId);
        console.log(lookResult);
        if (lookResult instanceof Response) return;
        const newOutfit = new Outfit();
        const success = newOutfit.fromLook(
            lookResult.look,
            new Authentication(),
        );
        if (!success) return;
        outfit.assets = newOutfit.assets;
        outfit.scale = newOutfit.scale;
        if (!selectedRigType) {
            selectedRigType = newOutfit.playerAvatarType;
            updateRigButtonText();
        }
        outfit.playerAvatarType = selectedRigType;
        outfit.bodyColors = newOutfit.bodyColors;
    }
}

//adds item to outfit based on item link
async function addItemFromLink(outfit: OutfitModel, itemLink: string, typee?: any) {
    const itemId = getPlaceIdFromUrl(itemLink);
    let itemType = itemLink.includes('bundles/') ? 'Bundle' : 'Asset';
    if (itemLink.includes('looks/')) {
        itemType = 'Look';
    }
    await addItem(outfit, itemId, itemType, typee);
}

//adds item you are hovering over to outfitRenderer outfit
function loadCurrentHoveredItem() {
    const originalCurrentHoveredItemElement = currentHoveredItemElement;
    const targetLink = currentHoveredItemLink;
    if (!targetLink) return;
    const targetType = currentHoveredItemType;

    const buildHoverOutfit = ogAvatarData.clone();
    if (!itemHoverOutfitRenderer) return;
    itemHoverOutfitRenderer.setOutfitModel(buildHoverOutfit);
    itemHoverOutfitRenderer.setMainAnimation('idle');

    currentHoveredItemLoading = true;

    const originalIdleAnimation = buildHoverOutfit.outfit.assets.filter((v) => {return v.assetType.name === "IdleAnimation"})[0]?.id
    itemHoverShouldAutoSwitchAnim = false;
    itemHoverAutoSwitchAnimTimePassed = 0;

    addItemFromLink(buildHoverOutfit, targetLink, targetType).then(() => {
        if (
            currentHoveredItemElement !== originalCurrentHoveredItemElement ||
            currentHoveredItemLink !== targetLink
        )
            return;
        const newIdleAnimation = buildHoverOutfit.outfit.assets.filter((v) => {return v.assetType.name === "IdleAnimation"})[0]?.id
        if (originalIdleAnimation !== newIdleAnimation) itemHoverShouldAutoSwitchAnim = true;

        currentHoveredItemLoading = false;
        itemHoverOutfit = buildHoverOutfit;
        if (itemHoverOutfitRenderer) {
            itemHoverOutfitRenderer.setOutfitModel(itemHoverOutfit);
            playAppropriateAnim(itemHoverOutfit, itemHoverOutfitRenderer);
        }
    });
}

//plays emote if outfit contains emote, otherwise default
function playAppropriateAnim(outfitModel: OutfitModel, outfitRenderer: OutfitRenderer) {
    const outfit = outfitModel.outfit;

    if (outfit.containsAssetType('EmoteAnimation')) {
        for (const asset of outfit.assets) {
            if (asset.assetType.name === 'EmoteAnimation') {
                outfitRenderer.setMainAnimation(`emote.${asset.id}`);
            }
        }
    } else {
        if (outfitRenderer === mainOutfitRenderer) {
            outfitRenderer.setMainAnimation(selectedAnimName);
        } else {
            outfitRenderer.setMainAnimation('idle');
        }
    }
}

//setup roavater renderer
async function startRenderer() {
    if (startedRenderer) return true;
    startedRenderer = true;

    //flags (these are set to true since the avatar is frequently changed)
    FLAGS.ENABLE_API_MESH_CACHE = true;
    FLAGS.ENABLE_API_RBX_CACHE = true;

    //cache limits (i doubt this actually does much at all, maybe we save like 10mb...)
    RENDERER_CACHE.Mesh.maxEntries = 150;
    RENDERER_CACHE.AssetBuffer.maxEntries = 150;
    RENDERER_CACHE.IsLayered.maxEntries = 100;
    RENDERER_CACHE.ItemDetails.maxEntries = 50;
    RENDERER_CACHE.ItemOwned.maxEntries = 50;

    const success = await RBXRenderer.fullSetup(true, true, false);
    if (!success) return false;

    if (RBXRenderer.loadingIcon) RBXRenderer.loadingIcon.style.zIndex = "2";
    noLoadingIconPos();

    //main
    RBXRenderer.setupControls(mainScene);
    RBXRenderer.setupScene(undefined, undefined, mainScene);
    mainOutfitRenderer = new OutfitRenderer(
        new Authentication(),
        mainOutfit,
        mainScene,
    );
    mainOutfitRenderer.backgroundRenderer.affectSceneAppearance = false
    mainOutfitRenderer.startAnimating();
    mainOutfitRenderer.setMainAnimation(selectedAnimName);

    //itemHover
    RBXRenderer.setupScene(undefined, undefined, itemHoverScene);
    itemHoverOutfitRenderer = new OutfitRenderer(
        new Authentication(),
        itemHoverOutfit,
        itemHoverScene,
    );
    itemHoverOutfitRenderer.backgroundRenderer.affectSceneAppearance = false
    itemHoverOutfitRenderer.startAnimating();
    itemHoverOutfitRenderer.setMainAnimation('idle');

    //add renderer element in such a way that allows us to render anywhere on screen
    const rendererElement = RBXRenderer.getRendererElement();
    rendererElement.style.position = 'fixed';
    rendererElement.style.left = '0px';
    rendererElement.style.top = '0px';
    rendererElement.style.zIndex = "1";
    document.body.appendChild(rendererElement);
    createHoverRotateButton();
    document.body.addEventListener('mousemove', updateMousePos);
    document.body.addEventListener('pointerup', stopItemHoverCameraRotation);

    mainScene.wellLitDirectionalLightIntensity *=
        DEFAULT_ITEM_RENDER_LIGHTING_MULTIPLIER;
    itemHoverScene.wellLitDirectionalLightIntensity *=
        DEFAULT_ITEM_RENDER_LIGHTING_MULTIPLIER;

    //update theme
    if (!isDarkMode()) {
        RBXRenderer.setBackgroundColor(0xdbdbdc);
    }

    captureMainSceneDefaults();
    applyItemRenderEnvironmentMode();

    return true;
}

//update main renderer outfit for item
async function updateMainRenderer() {
    const targetUrl = window.location.href;

    needsMainOutfitRenderer =
        targetUrl.includes('/catalog') ||
        targetUrl.includes('/bundles') ||
        targetUrl.includes('/looks');

    //set main renderer's outfit back to original
    await loadOgAvatar();

    if (window.location.href !== targetUrl) return;

    if (needsMainOutfitRenderer) {
        const buildOutfit = ogAvatarData.clone();
        if (selectedRigType) {
            buildOutfit.outfit.playerAvatarType = selectedRigType;
        }

        //remove accessories if theyre disabled
        if (accessoriesEnabled === false) {
            const assetsToRemove = [];

            for (const asset of buildOutfit.outfit.assets) {
                if (
                    asset.assetType.name.includes('Accessory') ||
                    asset.assetType.name === 'Hat'
                ) {
                    assetsToRemove.push(asset.id);
                }
            }

            for (const assetToRemove of assetsToRemove) {
                buildOutfit.outfit.removeAsset(assetToRemove);
            }
        }

        //add item to main renderer's outfit
        await addItemFromLink(buildOutfit, targetUrl);

        if (window.location.href !== targetUrl) return;

        mainOutfit = buildOutfit;

        if (mainOutfitRenderer) {
            mainOutfitRenderer.setOutfitModel(mainOutfit);
            playAppropriateAnim(mainOutfit, mainOutfitRenderer);
            pendingAnimationUpdate = true;

            updateRigButtonText();
            updateAnimationDropdown();
        }
    }
}

let lastFrameTime = Date.now() / 1000;
//runs every frame
function customAnimate() {
    const deltaTime = Date.now() / 1000 - lastFrameTime;

    //SPA support
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (mainRendererEnabled) {
            updateMainRenderer();
        }
    }

    if (pendingAnimationUpdate && mainOutfitRenderer) {
        if (
            !mainOutfitRenderer.currentlyChangingRig &&
            !mainOutfitRenderer.currentlyUpdating &&
            !currentlyLoadingAssets
        ) {
            playAppropriateAnim(mainOutfit, mainOutfitRenderer);
            pendingAnimationUpdate = false;
        }
    }

    //renderer size
    const newSize: Vec2 = [window.innerWidth, window.innerHeight];
    if (
        RBXRenderer.resolution[0] !== newSize[0] ||
        RBXRenderer.resolution[1] !== newSize[1]
    ) {
        RBXRenderer.setRendererSize(...newSize);
    }

    noLoadingIconPos();

    //main scene and renderer element
    let mouseWithin = false;

    const rendererElement = RBXRenderer.getRendererElement();
    if (mainSceneContainer) {
        const mainSceneBounds = mainSceneContainer.getBoundingClientRect();
        if (!currentHoveredItemElement && mainRendererEnabled) {
            resetLoadingIconPos();
            if (RBXRenderer.loadingIcon) {
                RBXRenderer.loadingIcon.style.left =
                    mainSceneBounds.left + 12 + 'px';
                RBXRenderer.loadingIcon.style.top = mainSceneBounds.top + 12 + 'px';
            }
        }

        mainScene.setRect(mainSceneBounds);

        //only make it interactive if mouse is within frame
        mouseWithin =
            mousePos[0] > mainSceneBounds.left &&
            mousePos[0] < mainSceneBounds.right &&
            mousePos[1] > mainSceneBounds.top &&
            mousePos[1] < mainSceneBounds.bottom;
    }

    rendererElement.style.pointerEvents = mouseWithin ? 'auto' : 'none';

    //plane position to avoid z fighting with background
    mainScene.plane?.position.set(0,-0.1,0)
    mainScene.shadowPlane?.position.set(0,-0.1,0)
    itemHoverScene.plane?.position.set(0,-0.1,0)
    itemHoverScene.shadowPlane?.position.set(0,-0.1,0)

    //disable main renderer
    if (!mainRendererEnabled) {
        mainScene.noRect();
        rendererElement.style.pointerEvents = 'none';
    }

    //current hovered item logic
    if (
        hoverPreviewEnabled &&
        currentHoveredItemElement &&
        currentHoveredItemThumbElement &&
        !currentlyLoadingAssets &&
        !currentHoveredItemLoading &&
        currentHoveredItemFrames > HOVER_FRAME_TIME + 1
    ) {
        const itemHoverBounds =
            currentHoveredItemThumbElement.getBoundingClientRect();
        itemHoverScene.setRect(itemHoverBounds);
        updateHoverRotateButton(itemHoverBounds);
    } else {
        itemHoverScene.noRect();
        updateHoverRotateButton();
    }

    if (currentHoveredItemElement !== lastCurrentHoveredItemElement) {
        currentHoveredItemFrames = 0;
        lastCurrentHoveredItemElement = currentHoveredItemElement;
    }

    if (
        hoverPreviewEnabled &&
        currentHoveredItemElement &&
        currentHoveredItemFrames === HOVER_FRAME_TIME
    ) {
        loadCurrentHoveredItem();
    }

    if (hoverPreviewEnabled && currentHoveredItemElement) {
        currentHoveredItemFrames += 1;
    }

    if (itemHoverCameraRotating) {
        itemHoverCameraRotation =
            (itemHoverCameraRotation + HOVER_CAMERA_ROTATION_SPEED * deltaTime) % 360;
    }

    //update item hover camera
    if (itemHoverOutfitRenderer)
    assetTypeToCamera(
        itemHoverScene,
        itemHoverOutfitRenderer,
        currentHoveredItemType!,
        itemHoverCameraRotation,
    );

    //update item hover animation (for animation packs)
    itemHoverAutoSwitchAnimTimePassed += deltaTime;
    if (itemHoverAutoSwitchAnimTimePassed >= HOVER_AUTO_SWITCH_ANIM_TIME && itemHoverShouldAutoSwitchAnim) {
        itemHoverAutoSwitchAnimTimePassed = 0;

        const animationNames = itemHoverOutfit.outfit.playerAvatarType === "R15" ? R15_ANIMATION_NAMES : R6_ANIMATION_NAMES;
        const currentIndex = animationNames.indexOf(itemHoverOutfitRenderer?.animatorW?.data?.currentAnimation || "");
        if (currentIndex > -1) {
            const nextIndex = (currentIndex + 1) % animationNames.length;
            itemHoverOutfitRenderer?.setMainAnimation(animationNames[nextIndex]);
        }
    }

    //loading icon
    if (
        hoverPreviewEnabled &&
        currentHoveredItemElement &&
        currentHoveredItemFrames >= HOVER_FRAME_TIME &&
        (currentlyLoadingAssets || currentHoveredItemLoading)
    ) {
        if (currentHoveredItemThumbElement && RBXRenderer.loadingIcon) {
            const itemHoverBounds =
                currentHoveredItemThumbElement.getBoundingClientRect();
            resetLoadingIconPos();
            RBXRenderer.loadingIcon.style.left = itemHoverBounds.left + 12 + 'px';
            RBXRenderer.loadingIcon.style.top = itemHoverBounds.top + 12 + 'px';
        }
    }

    //render
    RBXRenderer.animateAll(false);

    lastFrameTime = Date.now() / 1000;
    window.requestAnimationFrame(customAnimate);
}

function removeCurrentHoveredItemData() {
    currentHoveredItemElement = undefined;
    currentHoveredItemThumbElement = undefined;
    currentHoveredItemLink = undefined;
    currentHoveredItemType = undefined;
    currentHoveredItemFrames = 0;
    itemHoverCameraRotating = false;
    itemHoverCameraRotation = 0;
    updateHoverRotateButton();
}

function createHoverRotateButton() {
    if (itemHoverRotateButton) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rovalra-hover-rotate-button';
    button.setAttribute('aria-label', 'Rotate preview');
    button.innerHTML = `
        <svg focusable="false" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6m6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26"></path>
        </svg>
    `;

    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        itemHoverCameraRotating = true;
        button.setPointerCapture?.(e.pointerId);
    });
    button.addEventListener('pointerup', stopItemHoverCameraRotation);
    button.addEventListener('pointercancel', stopItemHoverCameraRotation);
    button.addEventListener('lostpointercapture', stopItemHoverCameraRotation);
    button.addEventListener('mouseleave', () => {
        stopItemHoverCameraRotation();
        if (
            currentHoveredItemThumbElement &&
            !currentHoveredItemThumbElement.matches(':hover')
        ) {
            removeCurrentHoveredItemData();
        }
    });

    itemHoverRotateButton = button;
    document.body.appendChild(button);
}

function updateHoveredItemTypeFromThumbnail(itemThumbnailImageContainer: HTMLElement) {
    if (itemThumbnailImageContainer) {
        const itemThumbnailImage = itemThumbnailImageContainer.children[0];
        if (itemThumbnailImage && itemThumbnailImage instanceof HTMLImageElement && itemThumbnailImage.src) {
            const potentialAssetType = itemThumbnailImage.src.split('/')[6];
            if (AssetTypes.includes(potentialAssetType)) {
                currentHoveredItemType = potentialAssetType;
            }
        }
    }
}

async function asyncInit() {
    await new Promise((resolve) => {
        chrome.storage.local.get(
            {
                marketplace3DRenderEnvironment: selectedRenderEnvironmentMode,
                marketplace3DRenderHoverPreviewDisabled: false,
            },
            (data) => {
                const modeExists = renderEnvironmentModeValues.has(
                    data.marketplace3DRenderEnvironment,
                );
                selectedRenderEnvironmentMode = modeExists
                    ? data.marketplace3DRenderEnvironment
                    : 'default';
                hoverPreviewEnabled =
                    !data.marketplace3DRenderHoverPreviewDisabled;
                resolve(null);
            },
        );
    });

    const success = await startRenderer();
    if (!success) return;
    await updateMainRenderer();

    //update main renderer
    observeElement('.thumbnail-holder', (element: HTMLElement) => {
        const url = window.location.href;
        if (
            !url.includes('/catalog') &&
            !url.includes('/bundles') &&
            !url.includes('/looks')
        )
            return;

        mainSceneContainer = element;

        updateMainRenderer();
    });

    //buttons for main thumbnail
    observeElement('.thumbnail-button-container', (element: HTMLElement) => {
        const url = window.location.href;
        if (
            !url.includes('/catalog') &&
            !url.includes('/bundles') &&
            !url.includes('/looks')
        )
            return;

        mainButtonContainer = element;

        toggleDefaultButtons(mainRendererEnabled);

        //create 3d toggle button
        if (!buttonFor3d) {
            buttonFor3d = document.createElement('button');
            buttonFor3d.className =
                'enable-three-dee btn-control button-placement btn-control-md btn--width';
            buttonFor3d.dataset.rovalraItemRendererControl = 'true';
            buttonFor3d.style.zIndex = "2";

            const buttonFor3dIcon = document.createElement('img');
            buttonFor3dIcon.src = applyIconTheme(
                mainRendererEnabled ? assets.closeIcon : assets.viewInArIcon,
            );

            buttonFor3d.appendChild(buttonFor3dIcon);

            buttonFor3d.addEventListener('click', (e) => {
                e.preventDefault();
                mainRendererEnabled = !mainRendererEnabled;
                chrome.storage.local.set({
                    marketplace3DRenderActive: mainRendererEnabled,
                });

                if (mainRendererEnabled) updateMainRenderer();

                //switch out default buttons with custom
                buttonFor3dIcon.src = applyIconTheme(
                    mainRendererEnabled
                        ? assets.closeIcon
                        : assets.viewInArIcon,
                );
                updateAnimationDropdown();
                updateRenderEnvironmentDropdown();
                if (toggleAccessories)
                    toggleAccessories.style.display = mainRendererEnabled
                        ? ''
                        : 'none';
                if (buttonForRig)
                    buttonForRig.style.display = mainRendererEnabled
                        ? ''
                        : 'none';
                toggleDefaultButtons(mainRendererEnabled);
            });
        }
        const b3dIcon = buttonFor3d.querySelector('img');
        if (b3dIcon) {
            b3dIcon.src = applyIconTheme(
                mainRendererEnabled ? assets.closeIcon : assets.viewInArIcon,
            );
        }

        //create accessories toggle button
        if (!toggleAccessories) {
            toggleAccessories = document.createElement('button');
            toggleAccessories.className =
                'enable-three-dee btn-control button-placement btn-control-md btn--width';
            toggleAccessories.dataset.rovalraItemRendererControl = 'true';
            toggleAccessories.style.zIndex = "2";
            toggleAccessories.style.display = mainRendererEnabled ? '' : 'none';

            const toggleAccessoriesIcon = document.createElement('img');
            toggleAccessoriesIcon.src = getApparelIcon();

            toggleAccessories.appendChild(toggleAccessoriesIcon);

            toggleAccessories.addEventListener('click', () => {
                accessoriesEnabled = !accessoriesEnabled;
                updateMainRenderer();
                toggleAccessoriesIcon.src = getApparelIcon();
            });
        }
        toggleAccessories.style.display = mainRendererEnabled ? '' : 'none';
        const toggleAccessoriesIcon = toggleAccessories.querySelector('img');
        if (toggleAccessoriesIcon) toggleAccessoriesIcon.src = getApparelIcon();

        if (!buttonForRig) {
            buttonForRig = document.createElement('button');
            buttonForRig.className =
                'enable-three-dee btn-control button-placement btn-control-md btn--width';
            buttonForRig.dataset.rovalraItemRendererControl = 'true';
            buttonForRig.style.zIndex = "2";
            buttonForRig.style.display = mainRendererEnabled ? '' : 'none';
            buttonForRig.style.color = 'var(--rovalra-main-text-color)';
            buttonForRig.style.fontSize = '12px';
            buttonForRig.style.fontWeight = 'bold';

            buttonForRig.addEventListener('click', async () => {
                const currentType =
                    selectedRigType || ogAvatarData.outfit.playerAvatarType;
                selectedRigType = currentType === 'R6' ? 'R15' : 'R6';
                updateRigButtonText();
                await updateMainRenderer();
                updateAnimationDropdown();
            });
        }
        buttonForRig.style.display = mainRendererEnabled ? '' : 'none';
        updateRigButtonText();

        updateAnimationDropdown();
        updateRenderEnvironmentDropdown();

        if (renderEnvironmentMenu) element.appendChild(renderEnvironmentMenu.wrapper);
        element.appendChild(buttonForRig);
        element.appendChild(toggleAccessories);
        element.appendChild(buttonFor3d);
        observeChildren(element, () =>
            toggleDefaultButtons(mainRendererEnabled),
        );
        toggleDefaultButtons(mainRendererEnabled);
    });

    //item cards linking to catalog or bundles
    observeElement(
        'div.item-card-container',
        (element: HTMLElement) => {
            const itemLinkElement = element.querySelector('a.item-card-link') as HTMLAnchorElement;
            if (!itemLinkElement) return;
            if (
                !itemLinkElement.href.includes('/catalog') &&
                !itemLinkElement.href.includes('/bundles') &&
                !itemLinkElement.href.includes('/looks')
            )
                return;

            const itemThumbContainer = element.querySelector(
                'div.item-card-thumb-container',
            ) as HTMLDivElement;
            const itemThumbnailImageContainer = element.querySelector(
                '.thumbnail-2d-container',
            ) as HTMLElement;

            if (itemLinkElement && itemThumbContainer) {
                itemThumbContainer.addEventListener('mouseenter', () => {
                    if (!hoverPreviewEnabled) return;

                    currentHoveredItemElement = element;
                    currentHoveredItemThumbElement = itemThumbContainer;
                    currentHoveredItemLink = itemLinkElement.href;
                    currentHoveredItemType = undefined;

                    setSceneColor(itemHoverScene, getItemCardColor(itemThumbContainer))

                    updateHoveredItemTypeFromThumbnail(
                        itemThumbnailImageContainer,
                    );
                });
                itemThumbContainer.addEventListener('mouseleave', (e) => {
                    if (itemHoverRotateButton?.contains(e.relatedTarget as HTMLElement)) {
                        return;
                    }

                    if (currentHoveredItemElement === element) {
                        removeCurrentHoveredItemData();
                    }
                });
            }
        },
        { multiple: true },
    );

    //item cards outside marketplace
    observeElement(
        '.list-item.item-card',
        (element: HTMLElement) => {
            const itemLinkElement = element.querySelector(
                'a.item-card-container',
            ) as HTMLAnchorElement;
            if (!itemLinkElement) return;
            if (
                !itemLinkElement.href.includes('/catalog') &&
                !itemLinkElement.href.includes('/bundles') &&
                !itemLinkElement.href.includes('/looks')
            )
                return;

            const itemThumbContainerContainer = element.querySelector(
                '.item-card-thumb-container',
            ) as HTMLElement;
            const itemThumbContainer =
                element.querySelector('.item-card-thumb') as HTMLElement;
            const itemThumbnailImageContainer = element.querySelector(
                '.thumbnail-2d-container',
            ) as HTMLElement;

            if (
                itemThumbContainerContainer &&
                itemLinkElement &&
                itemThumbContainer
            ) {
                itemThumbContainerContainer.addEventListener(
                    'mouseenter',
                    () => {
                        if (!hoverPreviewEnabled) return;

                        currentHoveredItemElement = element;
                        currentHoveredItemThumbElement =
                            itemThumbContainerContainer;
                        currentHoveredItemLink = itemLinkElement.href;
                        currentHoveredItemType = undefined;

                        setSceneColor(itemHoverScene, getItemCardColor(itemThumbContainerContainer))

                        updateHoveredItemTypeFromThumbnail(
                            itemThumbnailImageContainer,
                        );
                    },
                );
                itemThumbContainerContainer.addEventListener(
                    'mouseleave',
                    (e) => {
                        if (itemHoverRotateButton?.contains(e.relatedTarget as HTMLElement)) {
                            return;
                        }

                        if (currentHoveredItemElement === element) {
                            removeCurrentHoveredItemData();
                        }
                    },
                );
            }
        },
        { multiple: true },
    );

    //animate renderer
    customAnimate();
}

export function init() {
    chrome.storage.onChanged.addListener((changes: any, areaName: any) => {
        if (
            areaName !== 'local' ||
            !changes.marketplace3DRenderHoverPreviewDisabled
        ) {
            return;
        }

        hoverPreviewEnabled =
            !changes.marketplace3DRenderHoverPreviewDisabled.newValue;
        if (!hoverPreviewEnabled) {
            removeCurrentHoveredItemData();
            itemHoverScene.noRect();
        }
    });

    //disable main renderer on pages that dont use it
    if (
        !window.location.href.includes('/catalog') &&
        !window.location.href.includes('/bundles') &&
        !window.location.href.includes('/looks')
    ) {
        needsMainOutfitRenderer = false;
    }

    //run feature if enabled
    chrome.storage.local.remove('marketplace3DRenderEnabled', () => {
        chrome.storage.local.get(
            {
                marketplace3DRenderEnabledV2: true,
                marketplace3DRenderActive: false,
            },
            (result) => {
                if (result.marketplace3DRenderEnabledV2) {
                    mainRendererEnabled = result.marketplace3DRenderActive;
                    asyncInit();
                }
            },
        );
    });

    //update z-index for elements so theyre above renderer canvas
    const styleString = 'style'; //supress warning because i think a css file just for setting z-index is unnecessary
    const customStyle = document.createElement(styleString);
    customStyle.innerText = `
    .add-to-cart-btn-container {
        z-index: 2;
    }
    .timed-options-container {
        z-index: 2;
    }
    .restriction-icon {
        z-index: 2;
    }
    .rovalra-hover-rotate-button {
        align-items: center;
        background: rgba(25, 27, 31, 0.78);
        border: 0;
        border-radius: 50%;
        color: #fff;
        cursor: pointer;
        display: none;
        height: 32px;
        justify-content: center;
        padding: 0;
        position: fixed;
        transition:
            background-color 120ms ease,
            transform 120ms ease;
        width: 32px;
        z-index: 3;
    }
    .rovalra-hover-rotate-button svg {
        fill: currentColor;
        height: 20px;
        width: 20px;
    }
    .rovalra-hover-rotate-button:hover,
    .rovalra-hover-rotate-button:active {
        background: rgba(0, 0, 0, 0.88);
        transform: scale(1.04);
    }
    `;
    document.body.appendChild(customStyle);
}
