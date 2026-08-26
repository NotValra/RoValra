import { callRobloxApiJson } from '../api.js';
import * as THREE from 'three';
import {
    FLAGS,
    RBXRendererScene,
    Vec3,
    Vec4,
} from 'roavatar-renderer';

/**
 * Sends roavatar-renderer assetdelivery requests to background to avoid CORS issues
 */
export function backgroundRendererRequests() {
    /**
     * 
     * @param {Request | URL} resource 
     * @param {RequestInit | null | undefined} options 
     */
    FLAGS.FETCH_FUNC = (resource: URL | RequestInfo, options?: RequestInit) => {
        let url = undefined;
        if (resource instanceof Request) {
            url = resource.url;
        } else {
            url = resource.toString();
        }

        //make sure the request has the prefix
        if (url.startsWith(FLAGS.API_REQUEST_PREFIX)) {
            const realUrl = url.substring(FLAGS.API_REQUEST_PREFIX.length);
            const realUrlObj = new URL(realUrl);

            //make sure it is a request we actually want to intercept
            if (realUrlObj.protocol === "https:" && realUrlObj.hostname.includes("assetdelivery.roblox.com")) {
                const subdomain = realUrlObj.hostname.replace('.roblox.com', '');
                const endpoint = realUrlObj.pathname + realUrlObj.search;

                //return a promise that resolves with a Response but does so through the background
                return new Promise<Response>((resolve, reject) => {
                    let result: undefined | any = undefined;
                    let isOk = true;

                    callRobloxApiJson({
                        subdomain,
                        endpoint,
                        useBackground: true,
                        ...options,
                    }).then((trueResult) => {
                        result = trueResult;
                    }).catch(() => {
                        isOk = false;
                    }).finally(() => {
                        const fakeResponse = {
                            status: isOk ? 200 : 500,
                            ok: isOk,
                            json: () => {
                                return result;
                            }
                        }
                        if (isOk) {
                            resolve(fakeResponse as Response);
                        } else {
                            reject(fakeResponse);
                        }
                    })
                })
            } else {
                return fetch(realUrl, options);
            }
        } else {
            return fetch(resource, options);
        }
    }
}

//get css color value from :root
function getCSSColor(propertyName: string): string | undefined {
    const root = document.getElementById("content");
    if (root) {
        const computedStyles = window.getComputedStyle(root);
        const color = computedStyles.getPropertyValue(propertyName).trim();
        if (color.length > 1) return color;
    }
}

//Source: https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
function hexToRgb(hex: string): Vec3 | undefined {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
     ] : undefined;
}

/**
 * @returns Color in 0-255 range
 */
function rgbaFromCSSColor(color: string | undefined): Vec4 | undefined {
    if (!color) return undefined
    if (color.startsWith("rgb")) { //rgb/rgba
        const startParenthesis = color.indexOf("(");
        color = color.substring(startParenthesis + 1);
        color = color.substring(0, color.length - 1);

        const strValues = color.split(",");
        const numValues = strValues.map(v => {return Number(v)});
        const [r,g,b,a] = numValues;
        return [r,g,b,a !== undefined ? a : 1];
    } else if (color.startsWith("#")) { //hex
        const result = hexToRgb(color);
        if (result) return [...result, 1];
    } else if (color === "transparent") { //transparent
        return [0,0,0,0];
    }
}

//**Switch color from 0-255 range to 0-1 range */
function floatColor<T extends number[]>(color: T) {
    return color.map((v, i) => {
        return i === 3 ? v : v/255
    }) as T
}

/**
 * Takes in color in 0-1 range
 * @returns color in 0-1 range
 */
function blendColors(backColor: Vec4 | Vec3, frontColor: Vec4): Vec3 {
    const [br, bg, bb] = backColor;
    const [fr, fg, fb, a] = frontColor;

    return [
        fr * a + (br * (1 - a)),
        fg * a + (bg * (1 - a)),
        fb * a + (bb * (1 - a)),
    ];
}

/**Gets color of main item renderer background */
export function getMainColor(): Vec3 | undefined {
    const backgroundColor = rgbaFromCSSColor(getCSSColor("--color-surface-0"));
    const foregroundColor = rgbaFromCSSColor(getCSSColor("--color-shift-200"));

    if (backgroundColor && foregroundColor) {
        return blendColors(floatColor(backgroundColor), floatColor(foregroundColor));
    }
}

export function setSceneColor(scene: RBXRendererScene, color: Vec3 | undefined) {
    if (color) {
        const threeColor = new THREE.Color(...color).convertSRGBToLinear();
        scene.scene.background = threeColor;
        if (scene.plane) (scene.plane.material as THREE.MeshBasicMaterial).color = threeColor;
    }
}

function blendCSSVariableColors(color0: string | Vec3 | undefined, color1: string | Vec4) {
    if (color0 === undefined) return

    const rgbaColor0 = typeof color0 === "string" ? rgbaFromCSSColor(getCSSColor(color0)) : color0;
    const rgbaColor1 = typeof color1 === "string" ? rgbaFromCSSColor(getCSSColor(color1)) : color1;

    if (rgbaColor0 && rgbaColor1) {
        const floatRbgaColor0 = typeof color0 === "string" ? floatColor(rgbaColor0) : color0;
        const floatRbgaColor1 = typeof color1 === "string" ? floatColor(rgbaColor1) : color1;

        return blendColors(floatRbgaColor0, floatColor(rgbaColor1));
    }
}

function isTransparentColor(color: Vec4) {
    return color[3] < 1;
}

/**Searches element parents until it finds one with an opaque background color */
function findBackgroundColor(element: HTMLElement | null) {
    while (element) {
        const computedStyle = window.getComputedStyle(element);
        const backgroundColor = computedStyle.backgroundColor;
        const rgbaColor = rgbaFromCSSColor(backgroundColor)
        
        if (rgbaColor && !isTransparentColor(rgbaColor)) return rgbaColor

        element = element.parentElement
    }
}

/**Searches element parents until it finds one that matches the query */
function traverseParentForQuery(element: HTMLElement | null, query: string): HTMLElement | undefined {
    while (element) {
        if (element.matches(query)) return element

        element = element.parentElement
    }

    return undefined
}

/**item-card-thumb-container should be the element */
export function getItemCardColorDynamic(element: HTMLElement) {
    const computedStyle = window.getComputedStyle(element);
    const elementColor = computedStyle.backgroundColor;
    const rgbaElementColor = rgbaFromCSSColor(elementColor);

    if (rgbaElementColor && !isTransparentColor(rgbaElementColor)) { //element is opaque
        return floatColor([rgbaElementColor[0], rgbaElementColor[1], rgbaElementColor[2]] as Vec3);
    } else if (rgbaElementColor) { //element is transparent
        const rgbaBackgroundColor = findBackgroundColor(element.parentElement);
        if (rgbaBackgroundColor) {
            return blendColors(floatColor(rgbaBackgroundColor), floatColor(rgbaElementColor));
        }
    }
}

type CardLookType = "default" | "recommendations" | "catalogResults" | "sponsored" | "group"
export function getItemCardColor(element: HTMLElement): Vec3 | undefined {
    let cardType: CardLookType | undefined = undefined;

    if (!cardType && traverseParentForQuery(element, "#item-list-container-recommendations")) cardType = "recommendations";
    if (!cardType && traverseParentForQuery(element, ".catalog-results")) cardType = "catalogResults";
    if (!cardType && traverseParentForQuery(element, ".sponsored-item-card")) cardType = "sponsored";
    if (!cardType && traverseParentForQuery(element, "group-store-item")) cardType = "group";

    switch (cardType) {
        case "catalogResults":
            return blendCSSVariableColors("--color-surface-100", "--color-shift-200");
        case "recommendations":
            return blendCSSVariableColors(blendCSSVariableColors(blendCSSVariableColors(
                "--color-surface-100", "--color-common-shimmer"), "--color-common-shimmer"),[0,0,0,0.1]);
        case "sponsored":
            return blendCSSVariableColors(blendCSSVariableColors(blendCSSVariableColors(
                "--color-surface-0", "--color-common-shimmer"), "--color-common-shimmer"),[0,0,0,0.1]);
        case "group":
            return blendColors(blendCSSVariableColors("--color-surface-300", "--color-surface-300") || [1,1,1], [0,0,0,0.1]);
        default:
            return getMainColor() || [43 / 255, 44 / 255, 51 / 255];
    }
}