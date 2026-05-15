import { observeElement } from "../../core/observer"
import {
    RBXRenderer,
    Outfit,
    FLAGS,
    Authentication,
    OutfitRenderer,
    API,
    AssetTypes,
} from 'roavatar-renderer';
import { callRobloxApiJson } from "../../core/api";
import { getAuthenticatedUserId } from "../../core/user";
import { getPlaceIdFromUrl } from "../../core/idExtractor";
import { createDropdown } from '../../core/ui/dropdown'

const icon_view_in_ar = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224px%22%20fill%3D%22%23FFFFFF%22%3E%3Cpath%20d%3D%22M440-181%20240-296q-19-11-29.5-29T200-365v-230q0-22%2010.5-40t29.5-29l200-115q19-11%2040-11t40%2011l200%20115q19%2011%2029.5%2029t10.5%2040v230q0%2022-10.5%2040T720-296L520-181q-19%2011-40%2011t-40-11Zm0-92v-184l-160-93v185l160%2092Zm80%200%20160-92v-185l-160%2093v184ZM80-680v-120q0-33%2023.5-56.5T160-880h120v80H160v120H80ZM280-80H160q-33%200-56.5-23.5T80-160v-120h80v120h120v80Zm400%200v-80h120v-120h80v120q0%2033-23.5%2056.5T800-80H680Zm120-600v-120H680v-80h120q33%200%2056.5%2023.5T880-800v120h-80ZM480-526l158-93-158-91-158%2091%20158%2093Zm0%2045Zm0-45Zm40%2069Zm-80%200Z%22%2F%3E%3C%2Fsvg%3E"
const icon_close = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20viewBox%3D%220%20-960%20960%20960%22%20width%3D%2224px%22%20fill%3D%22%23FFFFFF%22%3E%3Cpath%20d%3D%22m256-200-56-56%20224-224-224-224%2056-56%20224%20224%20224-224%2056%2056-224%20224%20224%20224-56%2056-224-224-224%20224Z%22%2F%3E%3C%2Fsvg%3E"

//RENDERER FLAGS
FLAGS.ENABLE_API_MESH_CACHE = true;
FLAGS.ENABLE_API_RBX_CACHE = false;
FLAGS.USE_WORKERS = false;
FLAGS.ONLINE_ASSETS = true;

const HOVER_FRAME_TIME = 5

//outfit data
let ogAvatarDataLoaded = false
let ogAvatarData = new Outfit()

let mainOutfit = new Outfit()
let itemHoverOutfit = new Outfit()

//rendering data
const mainScene = RBXRenderer.addScene()
const itemHoverScene = RBXRenderer.addScene()
RBXRenderer.firstScene.noRect()
mainScene.noRect()
itemHoverScene.noRect()

let needsMainOutfitRenderer = true

let mainOutfitRenderer = null
let itemHoverOutfitRenderer = null

let startedRenderer = false

let mainRendererEnabled = false

let selectedAnimName = "idle"

let currentlyLoadingAssets = false

API.Events.OnLoadingAssets.Connect((newValue) => {
    currentlyLoadingAssets = newValue
})

//dom info
let mainSceneContainer = undefined
let mousePos = [0,0]
let buttonFor3d = undefined
let animationDropdown = undefined

let lastCurrentHoveredItemElement = undefined
let currentHoveredItemFrames = 0
let currentHoveredItemElement = undefined
let currentHoveredItemLink = undefined
let currentHoveredItemThumbElement = undefined
let currentHoveredItemLoading = false
let currentHoveredItemType = undefined

function updateMousePos(e) {
    mousePos = [e.clientX, e.clientY]
}

function assetTypeToCamera(renderScene, outfitRenderer, assetType) {
    const rig = outfitRenderer.currentRig
    if (!rig) return

    let isR6 = false
    if (rig.FindFirstChild("Torso")) {
        isR6 = true
    }

    let partName = isR6 ? "Torso" : "UpperTorso"
    let cameraMultiplier = 1
    let yOffsetMultiplier = 0
    let xOffsetMultiplier = 0
    let yRotAdd = 0
    let zOffset = 3

    switch (assetType) {
        //head overview
        case "Hat":
        case "HairAccessory":
        case "Head":
        case "DynamicHead":
        case "EarAccessory":
        case "EyeAccessory":
            {
                cameraMultiplier = 1
                partName = "Head"
                break
            }
        //face close up
        case "FaceAccessory":
        case "Face":
        case "FaceMakeup":
        case "LipMakeup":
        case "EyeMakeup":
        case "EyebrowAccessory":
        case "EyelashAccessory":
            {
                cameraMultiplier = 0.75
                partName = "Head"
                break
            }
        //neck close up
        case "NeckAccessory":
            {
                cameraMultiplier = 0.75
                partName = "Head"
                yOffsetMultiplier = -0.5
                break
            }
        //shoulder view
        case "ShoulderAccessory":
            {
                cameraMultiplier = 1
                partName = "Head"
                yOffsetMultiplier = -0.5
                break
            }
        //back view
        case "BackAccessory":
            {
                cameraMultiplier = -cameraMultiplier
                partName = isR6 ? "Torso" : "UpperTorso"
                yRotAdd = 180
                break
            }
        //waist view
        case "WaistAccessory":
            {
                cameraMultiplier = 0.6
                partName = isR6 ? "Torso" : "UpperTorso"
                yOffsetMultiplier = -0.75
                break
            }
        //torso view
        case "TShirt":
        case "Shirt":
        case "TShirtAccessory":
        case "ShirtAccessory":
        case "JacketAccessory":
        case "SweaterAccessory":
        case "FrontAccessory":
        case "Torso":
            {
                cameraMultiplier = 0.8
                partName = isR6 ? "Torso" : "UpperTorso"
                break
            }
        //legs view
        case "Pants":
        case "PantsAccessory":
        case "ShortsAccessory":
        case "DressSkirtAccessory":
        case "LeftShoeAccessory":
        case "RightShoeAccessory":
        case "LeftLeg":
        case "RightLeg":
            {
                cameraMultiplier = 0.5
                partName = isR6 ? "Torso" : "UpperTorso"
                yOffsetMultiplier = -1.1
                break
            }
        case "RightArm":
            {
                cameraMultiplier = 0.5
                partName = isR6 ? "Torso" : "UpperTorso"
                xOffsetMultiplier = 0.5
                break
            }
        case "LeftArm":
            {
                cameraMultiplier = 0.5
                partName = isR6 ? "Torso" : "UpperTorso"
                xOffsetMultiplier = -0.5
                break
            }
        case "Gear":
        case "Animation":
        case "MoodAnimation":
        case "ClimbAnimation":
        case "DeathAnimation":
        case "FallAnimation":
        case "IdleAnimation":
        case "JumpAnimation":
        case "RunAnimation":
        case "SwimAnimation":
        case "WalkAnimation":
        case "PoseAnimation":
        case "EmoteAnimation":
            {
                break
            }
    }

    const part = rig.FindFirstChild(partName)

    if (part) {
        const partCF = part.Prop("CFrame").clone()
        partCF.Orientation = [0,0,0]
        const partSize = part.Prop("Size")
        partCF.Position[2] -= Math.max(partSize.X, partSize.Y, partSize.Z) * zOffset * cameraMultiplier
        partCF.Position[1] += partSize.Y * yOffsetMultiplier
        partCF.Position[0] += partSize.X * xOffsetMultiplier
        partCF.Orientation[1] = 180 + yRotAdd
        //zoomExtents(headCenterCF, headCF, headExtents[1].minus(headExtents[0]), 70, 1)

        RBXRenderer.setCameraCFrame(partCF, renderScene)
    }
}

async function startRenderer() {
    if (startedRenderer) return true
    startedRenderer = true

    const success = await RBXRenderer.fullSetup(true, true, false)
    if (!success) return false

    RBXRenderer.loadingIcon.style.zIndex = 2

    //main
    RBXRenderer.setupControls(mainScene)
    RBXRenderer.setupScene(undefined, undefined, mainScene)
    if (needsMainOutfitRenderer) {
        mainOutfitRenderer = new OutfitRenderer(new Authentication(), mainOutfit, mainScene)
        mainOutfitRenderer.startAnimating()
        mainOutfitRenderer.setMainAnimation(selectedAnimName)
    }

    //itemHover
    RBXRenderer.setupScene(undefined, undefined, itemHoverScene)
    itemHoverOutfitRenderer = new OutfitRenderer(new Authentication(), itemHoverOutfit, itemHoverScene)
    itemHoverOutfitRenderer.startAnimating()
    itemHoverOutfitRenderer.setMainAnimation("idle")

    //add renderer element in such a way that allows us to render anywhere on screen
    const rendererElement = RBXRenderer.getRendererElement()
    rendererElement.style.position = "fixed"
    rendererElement.style.left = "0px"
    rendererElement.style.top = "0px"
    rendererElement.style.zIndex = 1
    document.body.appendChild(rendererElement)
    document.body.addEventListener("mousemove", updateMousePos)

    return true
}

async function loadOgAvatar() {
    const userId = await getAuthenticatedUserId()

    //get avatar data for the user
    if (!ogAvatarDataLoaded) {
        const avatarData = await callRobloxApiJson({
            subdomain: 'avatar',
            endpoint: `/v2/avatar/users/${userId}/avatar`,
        })
        ogAvatarData.fromJson(avatarData)
    }
    ogAvatarDataLoaded = true
}

async function addItem(outfit, itemId, itemType, typee) {
    if (itemType === "Bundle") {
        if (!await outfit.addBundleId(itemId)) return
    } else if (itemType === "Asset") {
        if (!typee) {
            if (!await outfit.addAssetId(itemId, new Authentication())) return
        } else  {
            outfit.removeAssetType(typee)
            outfit.addAsset(itemId, typee, "")
        }
    }
}

async function addItemFromLink(outfit, itemLink, typee) {
    const itemId = getPlaceIdFromUrl(itemLink)
    const itemType = itemLink.includes("bundles/") ? "Bundle" : "Asset"
    await addItem(outfit, itemId, itemType, typee)
}

function loadCurrentHoveredItem() {
    const originalCurrentHoveredItemElement = currentHoveredItemElement
    itemHoverOutfit = ogAvatarData.clone()
    itemHoverOutfitRenderer.setOutfit(itemHoverOutfit)
    itemHoverOutfitRenderer.setMainAnimation("idle")
    
    //add item to main renderer's outfit
    currentHoveredItemLoading = true

    const newItemHoverOutfit = itemHoverOutfit.clone()
    addItemFromLink(newItemHoverOutfit, currentHoveredItemLink, currentHoveredItemType).then(() => {
        if (currentHoveredItemElement !== originalCurrentHoveredItemElement) return
        currentHoveredItemLoading = false
        playAppropriateAnim(newItemHoverOutfit, itemHoverOutfitRenderer)
        if (itemHoverOutfitRenderer) {
            itemHoverOutfitRenderer.setOutfit(newItemHoverOutfit)
            itemHoverOutfit = newItemHoverOutfit
        }
    })
}

function playAppropriateAnim(outfit, outfitRenderer) {
    if (outfit.containsAssetType("EmoteAnimation")) {
        for (const asset of outfit.assets) {
            if (asset.assetType.name === "EmoteAnimation") {
                outfitRenderer.setMainAnimation(`emote.${asset.id}`)
            }
        }
    } else {
        if (outfitRenderer === mainOutfitRenderer) {
            outfitRenderer.setMainAnimation(selectedAnimName)
        } else {
            outfitRenderer.setMainAnimation("idle")
        }
    }
}

function resetLoadingIconPos() {
    if (RBXRenderer.loadingIcon) {
        RBXRenderer.loadingIcon.style.position = "fixed"
        RBXRenderer.loadingIcon.style.left = ""
        RBXRenderer.loadingIcon.style.top = ""
        RBXRenderer.loadingIcon.style.bottom = ""
        RBXRenderer.loadingIcon.style.right = ""
    }
}

function noLoadingIconPos() {
    if (RBXRenderer.loadingIcon) {
        RBXRenderer.loadingIcon.style.position = "fixed"
        RBXRenderer.loadingIcon.style.left = "-100000px"
    }
}

async function updateMainRenderer() {
    //set main renderer's outfit back to original
    await loadOgAvatar()

    if (needsMainOutfitRenderer) {
        mainOutfit = ogAvatarData.clone()
        mainOutfitRenderer.setOutfit(mainOutfit)
        mainOutfitRenderer.setMainAnimation(selectedAnimName)
        
        //add item to main renderer's outfit
        await addItemFromLink(mainOutfit, window.location.href)
        playAppropriateAnim(mainOutfit, mainOutfitRenderer)

        if (mainOutfitRenderer) {
            mainOutfitRenderer.setOutfit(mainOutfit)
        }
    }
}

function customAnimate() {
    //renderer size
    const newSize = [window.innerWidth, window.innerHeight]
    if (RBXRenderer.resolution[0] !== newSize[0] || RBXRenderer.resolution[1] !== newSize[1]) {
        RBXRenderer.setRendererSize(...newSize)
    }

    noLoadingIconPos()

    //main scene and renderer element
    const rendererElement = RBXRenderer.getRendererElement()
    if (mainSceneContainer) {
        const mainSceneBounds = mainSceneContainer.getBoundingClientRect()
        if (!currentHoveredItemElement && mainRendererEnabled) {
            resetLoadingIconPos()
            RBXRenderer.loadingIcon.style.left = (mainSceneBounds.left + 12) + "px"
            RBXRenderer.loadingIcon.style.top = (mainSceneBounds.top + 12) + "px"
        }

        mainScene.setRect(mainSceneBounds)
        
        const mouseWithin = mousePos[0] > mainSceneBounds.left && mousePos[0] < mainSceneBounds.right &&
                            mousePos[1] > mainSceneBounds.top && mousePos[1] < mainSceneBounds.bottom
        if (mouseWithin) {
            rendererElement.style.pointerEvents = "auto"
        } else {
            rendererElement.style.pointerEvents = "none"
        }
    } else {
        rendererElement.style.pointerEvents = "none"
    }

    if (!mainRendererEnabled) {
        mainScene.noRect()
        rendererElement.style.pointerEvents = "none"
    }

    //current hovered item
    if (currentHoveredItemElement && currentHoveredItemThumbElement && !currentlyLoadingAssets && !currentHoveredItemLoading && currentHoveredItemFrames > HOVER_FRAME_TIME) {
        const itemHoverBounds = currentHoveredItemThumbElement.getBoundingClientRect()
        itemHoverScene.setRect(itemHoverBounds)
    } else {
        itemHoverScene.noRect()
    }

    if (currentHoveredItemElement !== lastCurrentHoveredItemElement) {
        currentHoveredItemFrames = 0
        lastCurrentHoveredItemElement = currentHoveredItemElement
    }

    if (currentHoveredItemElement && currentHoveredItemFrames === HOVER_FRAME_TIME) {
        loadCurrentHoveredItem()
    }

    if (currentHoveredItemElement) {
        currentHoveredItemFrames += 1
    }

    assetTypeToCamera(itemHoverScene, itemHoverOutfitRenderer, currentHoveredItemType)

    //loading icon
    if (currentHoveredItemElement && currentHoveredItemFrames >= HOVER_FRAME_TIME && (currentlyLoadingAssets || currentHoveredItemLoading)) {
        const itemHoverBounds = currentHoveredItemThumbElement.getBoundingClientRect()
        resetLoadingIconPos()
        RBXRenderer.loadingIcon.style.left = (itemHoverBounds.left + 12) + "px"
        RBXRenderer.loadingIcon.style.top = (itemHoverBounds.top + 12) + "px"
    }

    //render
    RBXRenderer.animateAll(false)
    
    window.requestAnimationFrame(customAnimate)
}

async function asyncInit() {
    const success = await startRenderer()
    if (!success) return
    await updateMainRenderer()

    //update main renderer
    observeElement(".thumbnail-holder", (element) => {
        mainSceneContainer = element

        //element.innerHTML = ""

        updateMainRenderer()
    })

    //buttons for main thumbnail
    observeElement(".thumbnail-button-container", (element) => {
        if (!buttonFor3d) {
            buttonFor3d = document.createElement("button")
            buttonFor3d.className = "enable-three-dee btn-control button-placement btn-control-md btn--width"
            buttonFor3d.style.zIndex = 2
            
            const buttonFor3dIcon = document.createElement("img")
            buttonFor3dIcon.src = icon_view_in_ar
            buttonFor3d.appendChild(buttonFor3dIcon)

            buttonFor3d.addEventListener("click", (e) => {
                e.preventDefault()
                mainRendererEnabled = !mainRendererEnabled

                buttonFor3dIcon.src = mainRendererEnabled ? icon_close : icon_view_in_ar
                if (animationDropdown) {
                    animationDropdown.style.display = mainRendererEnabled ? "" : "none"
                }
            })
        }

        if (!animationDropdown) {
            const { element: dropdownElement } = createDropdown({
                items: [
                    { label: 'Idle', value: 'idle' },
                    { label: 'Walk', value: 'walk'},
                    { label: 'Run', value: 'run'},
                    { label: 'Jump', value: 'jump'},
                    { label: 'Fall', value: 'fall'},
                    { label: 'Climb', value: 'climb'},
                    { label: 'Swim', value: 'swim'},],
                initialValue: 'idle',
                onValueChange: (value) => {
                    selectedAnimName = value
                    mainOutfitRenderer.setMainAnimation(selectedAnimName)
                },
            });
            animationDropdown = dropdownElement
            animationDropdown.style.zIndex = 2
            animationDropdown.style.width = "110px"
            animationDropdown.style.display = mainRendererEnabled ? "" : "none"
        }

        element.appendChild(animationDropdown)

        element.appendChild(buttonFor3d)
    })

    //item cards in marketplace
    observeElement("div.item-card-container", (element) => {
        const itemLinkElement = element.querySelector("a.item-card-link")
        const itemThumbContainer = element.querySelector("div.item-card-thumb-container")
        const itemThumbnailImageContainer = element.querySelector(".thumbnail-2d-container")

        if (itemLinkElement && itemThumbContainer) {
            itemThumbContainer.addEventListener("mouseenter", () => {
                currentHoveredItemElement = element
                currentHoveredItemThumbElement = itemThumbContainer
                currentHoveredItemLink = itemLinkElement.href
                currentHoveredItemType = undefined

                if (itemThumbnailImageContainer) {
                    const itemThumbnailImage = itemThumbnailImageContainer.children[0]
                    if (itemThumbnailImage && itemThumbnailImage.src) {
                        const potentialAssetType = itemThumbnailImage.src.split("/")[6]
                        if (AssetTypes.includes(potentialAssetType)) {
                            currentHoveredItemType = potentialAssetType
                        }
                    }
                }
            })
            itemThumbContainer.addEventListener("mouseleave", () => {
                if (currentHoveredItemElement === element) {
                    currentHoveredItemElement = undefined
                    currentHoveredItemThumbElement = undefined
                    currentHoveredItemLink = undefined
                    currentHoveredItemType = undefined
                }
            })
        }
    }, {multiple: true})

    //item cards outside marketplace
    observeElement(".list-item.item-card", (element) => {
        const itemLinkElement = element.querySelector("a.item-card-container")
        const itemThumbContainerContainer = element.querySelector(".item-card-thumb-container")
        const itemThumbContainer = element.querySelector(".item-card-thumb")
        const itemThumbnailImageContainer = element.querySelector(".thumbnail-2d-container")

        if (itemThumbContainerContainer && itemLinkElement && itemThumbContainer) {
            itemThumbContainerContainer.addEventListener("mouseenter", () => {
                currentHoveredItemElement = element
                currentHoveredItemThumbElement = itemThumbContainerContainer
                currentHoveredItemLink = itemLinkElement.href
                currentHoveredItemType = undefined

                if (itemThumbnailImageContainer) {
                    const itemThumbnailImage = itemThumbnailImageContainer.children[0]
                    if (itemThumbnailImage && itemThumbnailImage.src) {
                        const potentialAssetType = itemThumbnailImage.src.split("/")[6]
                        if (AssetTypes.includes(potentialAssetType)) {
                            currentHoveredItemType = potentialAssetType
                        }
                    }
                }
            })
            itemThumbContainerContainer.addEventListener("mouseleave", () => {
                if (currentHoveredItemElement === element) {
                    currentHoveredItemElement = undefined
                    currentHoveredItemThumbElement = undefined
                    currentHoveredItemLink = undefined
                    currentHoveredItemType = undefined
                }
            })
        }
    }, {multiple: true})

    //animate renderer
    customAnimate()
}

export function init() {
    if (!window.location.href.includes("/catalog") && !window.location.href.includes("/bundles")) {
        needsMainOutfitRenderer = false
    }

    chrome.storage.local.get(
    { marketplace3DRenderEnabled: true }, (result) => {
        if (result.marketplace3DRenderEnabled) {
            asyncInit()
        }
    })
    const styleString = "style"
    const customStyle = document.createElement(styleString)
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
    `
    document.body.appendChild(customStyle)
}