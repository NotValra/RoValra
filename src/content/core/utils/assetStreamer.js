
import { parseRbxm } from './rbxm.js';
import { callRobloxApi } from '../api.js';

const RBXM_SIGNATURE_BYTES = [60, 114, 111, 98, 108, 111, 120, 33]; 

function isBinaryFormat(buffer) {
    if (buffer.byteLength < 8) return false;
    const signatureBytes = new Uint8Array(buffer, 0, 8);
    for (let i = 0; i < RBXM_SIGNATURE_BYTES.length; i++) {
        if (signatureBytes[i] !== RBXM_SIGNATURE_BYTES[i]) return false;
    }
    return true;
}


function parseRobloxXml(textContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(textContent, "text/xml");
    const robloxNode = xmlDoc.getElementsByTagName('roblox')[0];
    
    if (!robloxNode) return [];

    const resultTree = [];

    const cleanNum = (n) =>
        Math.abs(n) < 1e-5 ? 0 : Math.round(n * 1e5) / 1e5;
    const childText = (el, tag) => {
        const c = [...el.children].find((x) => x.tagName === tag);
        return c ? c.textContent.trim() : null;
    };
    const childNum = (el, tag) => {
        const t = childText(el, tag);
        return t == null ? 0 : Number(t);
    };

    // Parses one XML property element into the same shapes the binary parser
    // produces, so the explorer renders both formats identically.
    const parseProp = (prop) => {
        const tag = prop.tagName;
        const text = prop.textContent.trim();

        switch (tag) {
            case 'string':
            case 'ProtectedString':
            case 'BinaryString':
            case 'SharedString':
                return prop.textContent;
            case 'Content':
            case 'ContentId':
                return childText(prop, 'url') ?? childText(prop, 'uri') ?? text;
            case 'float':
            case 'double':
            case 'int':
            case 'int64':
            case 'token':
                return Number(text);
            case 'bool':
                return text === 'true';
            case 'Color3':
                return {
                    r: childNum(prop, 'R'),
                    g: childNum(prop, 'G'),
                    b: childNum(prop, 'B'),
                };
            case 'Color3uint8': {
                const v = Number(text) >>> 0;
                return { r: (v >>> 16) & 255, g: (v >>> 8) & 255, b: v & 255 };
            }
            case 'Vector2':
            case 'Vector2int16':
                return { x: childNum(prop, 'X'), y: childNum(prop, 'Y') };
            case 'Vector3':
            case 'Vector3int16':
                return {
                    x: childNum(prop, 'X'),
                    y: childNum(prop, 'Y'),
                    z: childNum(prop, 'Z'),
                };
            case 'UDim':
                return { Scale: childNum(prop, 'S'), Offset: childNum(prop, 'O') };
            case 'UDim2':
                return {
                    X: { Scale: childNum(prop, 'XS'), Offset: childNum(prop, 'XO') },
                    Y: { Scale: childNum(prop, 'YS'), Offset: childNum(prop, 'YO') },
                };
            case 'NumberRange': {
                const p = text.split(/\s+/).map(Number);
                return { Min: p[0], Max: p[1] };
            }
            case 'CoordinateFrame':
            case 'OptionalCoordinateFrame': {
                const cf = tag === 'OptionalCoordinateFrame'
                    ? [...prop.children].find((x) => x.tagName === 'CFrame')
                    : prop;
                if (!cf) return null;
                const keys = ['X','Y','Z','R00','R01','R02','R10','R11','R12','R20','R21','R22'];
                return keys.map((k) => cleanNum(childNum(cf, k))).join(', ');
            }
            default:
                return prop.textContent;
        }
    };

    const parseItem = (node) => {
        const instance = {
            ClassName: node.getAttribute('class'),
            Reference: node.getAttribute('referent') || node.getAttribute('refer'),
            Properties: {},
            Children: [],
        };

        for (const child of node.children) {
            if (child.tagName === 'Properties') {
                for (const prop of child.children) {
                    const propName = prop.getAttribute('name');
                    if (!propName) continue;
                    instance.Properties[propName] = parseProp(prop);
                }
            } else if (child.tagName === 'Item') {
                instance.Children.push(parseItem(child));
            }
        }
        return instance;
    };

    for (const child of robloxNode.children) {
        if (child.tagName === 'Item') {
            resultTree.push(parseItem(child));
        }
    }

    return resultTree;
}


export async function checkAssetsInBatch(assetIds) {
    if (assetIds.length === 0) return [];

    const createDefaultResult = (id) => ({ assetId: id, root: null, format: null, isValid: false });

    const requestBody = assetIds.map(id => ({
        assetId: id,
        requestId: id.toString()
    }));

    try {
        const batchApiResponse = await callRobloxApi({
            subdomain: 'assetdelivery',
            endpoint: '/v2/assets/batch',
            method: 'POST',
            body: requestBody,
            sanitize: false
        });

        if (!batchApiResponse.ok) {
            console.error(`[Rovalra Asset Parser] AssetDelivery batch API failed: ${batchApiResponse.status}`);
            return assetIds.map(id => createDefaultResult(id));
        }

        const batchData = await batchApiResponse.json();
        const assetUrlMap = new Map();
        batchData.forEach(item => {
            if (item.locations && item.locations[0] && item.locations[0].location) {
                assetUrlMap.set(parseInt(item.requestId, 10), item.locations[0].location);
            }
        });

        const processingPromises = assetIds.map(async (id) => {
            const assetUrl = assetUrlMap.get(id);
            if (!assetUrl) return createDefaultResult(id);

            try {
                const response = await fetch(assetUrl); // Verified
                if (!response.ok) return createDefaultResult(id);

                const buffer = await response.arrayBuffer();
                let parsedRoot = null;
                let format = null;

                if (isBinaryFormat(buffer)) {
                    format = 'RBXM';

                    parsedRoot = parseRbxm(buffer);
                } else {
                    format = 'XML';
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(buffer);
                    
                    if (text.includes('<roblox')) {
                        parsedRoot = parseRobloxXml(text);
                    }
                }

                if (!parsedRoot) return createDefaultResult(id);

                return { 
                    assetId: id, 
                    root: parsedRoot, 
                    format: format, 
                    isValid: true 
                };

            } catch (error) {
                console.error(`[Rovalra Asset Parser] Error parsing asset ${id}:`, error);
                return createDefaultResult(id);
            }
        });

        return Promise.all(processingPromises);

    } catch (error) {
        console.error('[Rovalra Asset Parser] Critical error:', error);
        return assetIds.map(id => createDefaultResult(id));
    }
}
// Accessory/head asset types — Roblox can serve a richer, avatar-processed
// model (with Handle, attachments, mesh) for these, the same one BTRoblox shows.
const ACCESSORY_TYPE_IDS = new Set([
    8, 41, 42, 43, 44, 45, 46, 47, 57, 58, 64, 65, 66, 67, 68, 69, 70, 71, 72,
]);
const HEAD_TYPE_IDS = new Set([17, 79]);

function avatarFormatFor(assetTypeId) {
    if (HEAD_TYPE_IDS.has(assetTypeId)) return 'avatar_meshpart_head';
    if (ACCESSORY_TYPE_IDS.has(assetTypeId)) return 'avatar_meshpart_accessory';
    return null;
}

async function resolveAssetLocation(assetId, format) {
    const headers = format ? { 'Roblox-AssetFormat': format } : {};
    const response = await callRobloxApi({
        subdomain: 'assetdelivery',
        endpoint: `/v2/asset/?id=${assetId}`,
        method: 'GET',
        headers,
        sanitize: false,
    });
    if (!response.ok) return null;

    const json = await response.json();
    return {
        location: json?.locations?.[0]?.location || null,
        assetTypeId: json?.assetTypeId,
    };
}

async function parseAssetLocation(location) {
    const response = await fetch(location); // Verified
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (isBinaryFormat(buffer)) {
        return { format: 'RBXM', root: parseRbxm(buffer) };
    }

    const text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('<roblox')) {
        return { format: 'XML', root: parseRobloxXml(text) };
    }
    return null;
}

// Whether the asset is downloadable for the current user (their place / an
// asset they can access). Used to decide if the explorer button should show.
export async function canAccessAsset(assetId) {
    try {
        const meta = await resolveAssetLocation(assetId, null);
        return !!meta?.location;
    } catch {
        return false;
    }
}

// Loads a single asset's instance tree. For accessories/heads it requests the
// avatar-processed model so the tree matches what Studio/BTRoblox show.
export async function loadAssetTree(assetId) {
    const invalid = { assetId, root: null, format: null, isValid: false };

    try {
        let meta = await resolveAssetLocation(assetId, null);
        if (!meta?.location) return invalid;

        const format = avatarFormatFor(meta.assetTypeId);
        if (format) {
            const rich = await resolveAssetLocation(assetId, format);
            if (rich?.location) meta = rich;
        }

        const parsed = await parseAssetLocation(meta.location);
        if (!parsed?.root || parsed.root.length === 0) return invalid;

        return {
            assetId,
            root: parsed.root,
            format: parsed.format,
            isValid: true,
        };
    } catch (error) {
        console.error('[Rovalra Explorer] loadAssetTree failed:', error);
        return invalid;
    }
}
