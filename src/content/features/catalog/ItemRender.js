import { observeChildren, observeElement } from '../../core/observer';
import {
    RBXRenderer,
    Outfit,
    FLAGS,
    Authentication,
    OutfitRenderer,
    API,
    AssetTypes,
    CFrame,
} from 'roavatar-renderer';
import { callRobloxApiJson } from '../../core/api';
import { getAuthenticatedUserId } from '../../core/user';
import { getPlaceIdFromUrl } from '../../core/idExtractor';
import { createDropdown } from '../../core/ui/dropdown';
import { getAssets } from '../../core/assets';
import { isDarkMode } from '../../core/theme';
import { ts } from '../../core/locale/i18n.js';

const assets = getAssets();

//RENDERER FLAGS
FLAGS.ENABLE_API_MESH_CACHE = true;
FLAGS.ENABLE_API_RBX_CACHE = false;
FLAGS.USE_WORKERS = true;
FLAGS.ONLINE_ASSETS = true;

const HOVER_FRAME_TIME = 5;
const HOVER_CAMERA_ROTATION_SPEED = 0.75;

//outfit data
let ogAvatarDataLoaded = false;
let ogAvatarData = new Outfit();

let mainOutfit = new Outfit();
let itemHoverOutfit = new Outfit();

//rendering data
const mainScene = RBXRenderer.addScene();
const itemHoverScene = RBXRenderer.addScene();
RBXRenderer.firstScene.noRect();
mainScene.noRect();
itemHoverScene.noRect();

let needsMainOutfitRenderer = true;

let mainOutfitRenderer = null;
let itemHoverOutfitRenderer = null;

let startedRenderer = false;

let mainRendererEnabled = false;

let selectedAnimName = 'idle';
let accessoriesEnabled = true;

let currentlyLoadingAssets = false;
let pendingAnimationUpdate = false;

API.Events.OnLoadingAssets.Connect((newValue) => {
    currentlyLoadingAssets = newValue;
});

//dom info
let mainSceneContainer = undefined;
let mainButtonContainer = undefined;
let mousePos = [0, 0];
let buttonFor3d = undefined;
let animationDropdown = undefined;
let toggleAccessories = undefined;
let buttonForRig = undefined;
let selectedRigType = undefined;

let lastUrl = window.location.href;
let lastCurrentHoveredItemElement = undefined;
let currentHoveredItemFrames = 0;
let currentHoveredItemElement = undefined;
let currentHoveredItemLink = undefined;
let currentHoveredItemThumbElement = undefined;
let currentHoveredItemLoading = false;
let currentHoveredItemType = undefined;
let itemHoverCameraRotation = 0;
let itemHoverCameraRotating = false;
let itemHoverRotateButton = undefined;

const toggleDefaultButtons = (enabled) => {
    if (!mainButtonContainer) return;
    for (const child of mainButtonContainer.children) {
        if (child.dataset.rovalraItemRendererControl) continue;
        child.style.display = enabled ? 'none' : '';
    }
};

const updateRigButtonText = () => {
    if (!buttonForRig) return;
    buttonForRig.textContent =
        selectedRigType || ogAvatarData.playerAvatarType || 'R15';
};

const updateAnimationDropdown = () => {
    if (!mainButtonContainer) return;
    if (animationDropdown) {
        animationDropdown.remove();
        animationDropdown = undefined;
    }

    if (
        !mainRendererEnabled ||
        mainOutfit.containsAssetType('EmoteAnimation')
    ) {
        return;
    }

    selectedAnimName = 'idle';
    const currentType =
        selectedRigType || ogAvatarData.playerAvatarType || 'R15';
    const isR6 = currentType === 'R6';
    const items = isR6
        ? ['idle', 'walk', 'jump', 'fall', 'climb']
        : ['idle', 'walk', 'run', 'jump', 'fall', 'climb', 'swim'];

    const trueItems = items.map((v) => {
        return { label: ts(`animations.${v}`), value: v };
    });

    const { element: dropdownElement } = createDropdown({
        items: trueItems,
        initialValue: 'idle',
        onValueChange: (value) => {
            selectedAnimName = value;
            mainOutfitRenderer.setMainAnimation(selectedAnimName);
        },
    });
    animationDropdown = dropdownElement;
    animationDropdown.dataset.rovalraItemRendererControl = 'true';
    animationDropdown.style.zIndex = 2;
    animationDropdown.style.width = '110px';

    mainButtonContainer.prepend(animationDropdown);
    toggleDefaultButtons(mainRendererEnabled);
};

function updateMousePos(e) {
    mousePos = [e.clientX, e.clientY];
}

function stopItemHoverCameraRotation() {
    itemHoverCameraRotating = false;
}

function updateHoverRotateButton(bounds) {
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

function applyIconTheme(icon) {
    if (!isDarkMode()) {
        //eww! (i dont know how to do this in a better way)
        return icon.replace('fill%3D%22%23FFFFFF', 'fill%3D%22%23202227');
    }
    return icon;
}

function getApparelIcon() {
    let icon = accessoriesEnabled ? assets.apparelFillIcon : assets.apparelIcon;
    return applyIconTheme(icon);
}

//Updates camera for outfitRenderer based on added assetType
function assetTypeToCamera(
    renderScene,
    outfitRenderer,
    assetType,
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
        const partCF = part.Prop('CFrame').clone();
        partCF.Orientation = [0, 0, 0];
        const partSize = part.Prop('Size');
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

        const targetPosition = [
            partCF.Position[0],
            partCF.Position[1] + partSize.Y * yOffsetMultiplier,
            partCF.Position[2],
        ];
        const cameraPosition = [
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
    const userId = await getAuthenticatedUserId();

    //get avatar data for the user
    if (!ogAvatarDataLoaded) {
        const avatarData = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v2/avatar/users/${userId}/avatar`,
        });
        ogAvatarData.fromJson(avatarData);
        ogAvatarData.playerAvatarType = avatarData.playerAvatarType;
    }
    ogAvatarDataLoaded = true;
}

//adds item to outfit
async function addItem(outfit, itemId, itemType, typee) {
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
    }
}

//adds item to outfit based on item link
async function addItemFromLink(outfit, itemLink, typee) {
    const itemId = getPlaceIdFromUrl(itemLink);
    const itemType = itemLink.includes('bundles/') ? 'Bundle' : 'Asset';
    await addItem(outfit, itemId, itemType, typee);
}

//adds item you are hovering over to outfitRenderer outfit
function loadCurrentHoveredItem() {
    const originalCurrentHoveredItemElement = currentHoveredItemElement;
    const targetLink = currentHoveredItemLink;
    const targetType = currentHoveredItemType;

    const buildHoverOutfit = ogAvatarData.clone();
    itemHoverOutfitRenderer.setOutfit(buildHoverOutfit);
    itemHoverOutfitRenderer.setMainAnimation('idle');

    currentHoveredItemLoading = true;

    addItemFromLink(buildHoverOutfit, targetLink, targetType).then(() => {
        if (
            currentHoveredItemElement !== originalCurrentHoveredItemElement ||
            currentHoveredItemLink !== targetLink
        )
            return;
        currentHoveredItemLoading = false;
        itemHoverOutfit = buildHoverOutfit;
        itemHoverOutfitRenderer.setOutfit(itemHoverOutfit);
        playAppropriateAnim(itemHoverOutfit, itemHoverOutfitRenderer);
    });
}

//plays emote if outfit contains emote, otherwise default
function playAppropriateAnim(outfit, outfitRenderer) {
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

    const success = await RBXRenderer.fullSetup(true, true, false);
    if (!success) return false;

    RBXRenderer.loadingIcon.style.zIndex = 2;
    noLoadingIconPos();

    //main
    RBXRenderer.setupControls(mainScene);
    RBXRenderer.setupScene(undefined, undefined, mainScene);
    mainOutfitRenderer = new OutfitRenderer(
        new Authentication(),
        mainOutfit,
        mainScene,
    );
    mainOutfitRenderer.startAnimating();
    mainOutfitRenderer.setMainAnimation(selectedAnimName);

    //itemHover
    RBXRenderer.setupScene(undefined, undefined, itemHoverScene);
    itemHoverOutfitRenderer = new OutfitRenderer(
        new Authentication(),
        itemHoverOutfit,
        itemHoverScene,
    );
    itemHoverOutfitRenderer.startAnimating();
    itemHoverOutfitRenderer.setMainAnimation('idle');

    //add renderer element in such a way that allows us to render anywhere on screen
    const rendererElement = RBXRenderer.getRendererElement();
    rendererElement.style.position = 'fixed';
    rendererElement.style.left = '0px';
    rendererElement.style.top = '0px';
    rendererElement.style.zIndex = 1;
    document.body.appendChild(rendererElement);
    createHoverRotateButton();
    document.body.addEventListener('mousemove', updateMousePos);
    document.body.addEventListener('pointerup', stopItemHoverCameraRotation);

    //update theme
    if (!isDarkMode()) {
        mainScene.wellLitDirectionalLightIntensity *= 2.25;
        itemHoverScene.wellLitDirectionalLightIntensity *= 2.25;
        RBXRenderer.setBackgroundColor(0xdbdbdc);
    }

    return true;
}

//update main renderer outfit for item
async function updateMainRenderer() {
    const targetUrl = window.location.href;

    needsMainOutfitRenderer =
        targetUrl.includes('/catalog') || targetUrl.includes('/bundles');

    //set main renderer's outfit back to original
    await loadOgAvatar();

    if (window.location.href !== targetUrl) return;

    if (needsMainOutfitRenderer) {
        const buildOutfit = ogAvatarData.clone();
        if (selectedRigType) {
            buildOutfit.playerAvatarType = selectedRigType;
        }

        //remove accessories if theyre disabled
        if (accessoriesEnabled === false) {
            const assetsToRemove = [];

            for (const asset of buildOutfit.assets) {
                if (
                    asset.assetType.name.includes('Accessory') ||
                    asset.assetType.name === 'Hat'
                ) {
                    assetsToRemove.push(asset.id);
                }
            }

            for (const assetToRemove of assetsToRemove) {
                buildOutfit.removeAsset(assetToRemove);
            }
        }

        //add item to main renderer's outfit
        await addItemFromLink(buildOutfit, targetUrl);

        if (window.location.href !== targetUrl) return;

        mainOutfit = buildOutfit;

        if (mainOutfitRenderer) {
            mainOutfitRenderer.setOutfit(mainOutfit);
            playAppropriateAnim(mainOutfit, mainOutfitRenderer);
            pendingAnimationUpdate = true;

            updateRigButtonText();
            updateAnimationDropdown();
        }
    }
}

//runs every frame
function customAnimate() {
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
    const newSize = [window.innerWidth, window.innerHeight];
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
            RBXRenderer.loadingIcon.style.left =
                mainSceneBounds.left + 12 + 'px';
            RBXRenderer.loadingIcon.style.top = mainSceneBounds.top + 12 + 'px';
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

    //disable main renderer
    if (!mainRendererEnabled) {
        mainScene.noRect();
        rendererElement.style.pointerEvents = 'none';
    }

    //current hovered item logic
    if (
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
        currentHoveredItemElement &&
        currentHoveredItemFrames === HOVER_FRAME_TIME
    ) {
        loadCurrentHoveredItem();
    }

    if (currentHoveredItemElement) {
        currentHoveredItemFrames += 1;
    }

    if (itemHoverCameraRotating) {
        itemHoverCameraRotation =
            (itemHoverCameraRotation + HOVER_CAMERA_ROTATION_SPEED) % 360;
    }

    assetTypeToCamera(
        itemHoverScene,
        itemHoverOutfitRenderer,
        currentHoveredItemType,
        itemHoverCameraRotation,
    );

    //loading icon
    if (
        currentHoveredItemElement &&
        currentHoveredItemFrames >= HOVER_FRAME_TIME &&
        (currentlyLoadingAssets || currentHoveredItemLoading)
    ) {
        const itemHoverBounds =
            currentHoveredItemThumbElement.getBoundingClientRect();
        resetLoadingIconPos();
        RBXRenderer.loadingIcon.style.left = itemHoverBounds.left + 12 + 'px';
        RBXRenderer.loadingIcon.style.top = itemHoverBounds.top + 12 + 'px';
    }

    //render
    RBXRenderer.animateAll(false);

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

function updateHoveredItemTypeFromThumbnail(itemThumbnailImageContainer) {
    if (itemThumbnailImageContainer) {
        const itemThumbnailImage = itemThumbnailImageContainer.children[0];
        if (itemThumbnailImage && itemThumbnailImage.src) {
            const potentialAssetType = itemThumbnailImage.src.split('/')[6];
            if (AssetTypes.includes(potentialAssetType)) {
                currentHoveredItemType = potentialAssetType;
            }
        }
    }
}

async function asyncInit() {
    const success = await startRenderer();
    if (!success) return;
    await updateMainRenderer();

    //update main renderer
    observeElement('.thumbnail-holder', (element) => {
        const url = window.location.href;
        if (!url.includes('/catalog') && !url.includes('/bundles')) return;

        mainSceneContainer = element;

        updateMainRenderer();
    });

    //buttons for main thumbnail
    observeElement('.thumbnail-button-container', (element) => {
        const url = window.location.href;
        if (!url.includes('/catalog') && !url.includes('/bundles')) return;

        mainButtonContainer = element;

        toggleDefaultButtons(mainRendererEnabled);

        //create 3d toggle button
        if (!buttonFor3d) {
            buttonFor3d = document.createElement('button');
            buttonFor3d.className =
                'enable-three-dee btn-control button-placement btn-control-md btn--width';
            buttonFor3d.dataset.rovalraItemRendererControl = 'true';
            buttonFor3d.style.zIndex = 2;

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
            toggleAccessories.style.zIndex = 2;
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
            buttonForRig.style.zIndex = 2;
            buttonForRig.style.display = mainRendererEnabled ? '' : 'none';
            buttonForRig.style.color = 'var(--rovalra-main-text-color)';
            buttonForRig.style.fontSize = '12px';
            buttonForRig.style.fontWeight = 'bold';

            buttonForRig.addEventListener('click', async () => {
                const currentType =
                    selectedRigType || ogAvatarData.playerAvatarType;
                selectedRigType = currentType === 'R6' ? 'R15' : 'R6';
                updateRigButtonText();
                await updateMainRenderer();
                updateAnimationDropdown();
            });
        }
        buttonForRig.style.display = mainRendererEnabled ? '' : 'none';
        updateRigButtonText();

        updateAnimationDropdown();

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
        (element) => {
            const itemLinkElement = element.querySelector('a.item-card-link');
            if (!itemLinkElement) return;
            if (
                !itemLinkElement.href.includes('/catalog') &&
                !itemLinkElement.href.includes('/bundles')
            )
                return;

            const itemThumbContainer = element.querySelector(
                'div.item-card-thumb-container',
            );
            const itemThumbnailImageContainer = element.querySelector(
                '.thumbnail-2d-container',
            );

            if (itemLinkElement && itemThumbContainer) {
                itemThumbContainer.addEventListener('mouseenter', () => {
                    currentHoveredItemElement = element;
                    currentHoveredItemThumbElement = itemThumbContainer;
                    currentHoveredItemLink = itemLinkElement.href;
                    currentHoveredItemType = undefined;

                    updateHoveredItemTypeFromThumbnail(
                        itemThumbnailImageContainer,
                    );
                });
                itemThumbContainer.addEventListener('mouseleave', (e) => {
                    if (itemHoverRotateButton?.contains(e.relatedTarget)) {
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
        (element) => {
            const itemLinkElement = element.querySelector(
                'a.item-card-container',
            );
            if (!itemLinkElement) return;
            if (
                !itemLinkElement.href.includes('/catalog') &&
                !itemLinkElement.href.includes('/bundles')
            )
                return;

            const itemThumbContainerContainer = element.querySelector(
                '.item-card-thumb-container',
            );
            const itemThumbContainer =
                element.querySelector('.item-card-thumb');
            const itemThumbnailImageContainer = element.querySelector(
                '.thumbnail-2d-container',
            );

            if (
                itemThumbContainerContainer &&
                itemLinkElement &&
                itemThumbContainer
            ) {
                itemThumbContainerContainer.addEventListener(
                    'mouseenter',
                    () => {
                        currentHoveredItemElement = element;
                        currentHoveredItemThumbElement =
                            itemThumbContainerContainer;
                        currentHoveredItemLink = itemLinkElement.href;
                        currentHoveredItemType = undefined;

                        updateHoveredItemTypeFromThumbnail(
                            itemThumbnailImageContainer,
                        );
                    },
                );
                itemThumbContainerContainer.addEventListener(
                    'mouseleave',
                    (e) => {
                        if (itemHoverRotateButton?.contains(e.relatedTarget)) {
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
    //disable main renderer on pages that dont use it
    if (
        !window.location.href.includes('/catalog') &&
        !window.location.href.includes('/bundles')
    ) {
        needsMainOutfitRenderer = false;
    }

    //run feature if enabled
    chrome.storage.local.get(
        { marketplace3DRenderEnabled: true, marketplace3DRenderActive: false },
        (result) => {
            if (result.marketplace3DRenderEnabled) {
                mainRendererEnabled = result.marketplace3DRenderActive;
                asyncInit();
            }
        },
    );

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
