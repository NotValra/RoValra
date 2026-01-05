
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

    const parseItem = (node) => {
        const className = node.getAttribute('class');
        const reference = node.getAttribute('refer');
        
        const instance = {
            ClassName: className,
            Reference: reference,
            Properties: {},
            Children: []
        };

        for (const child of node.children) {
            if (child.tagName === 'Properties') {
                for (const prop of child.children) {
                    const propName = prop.getAttribute('name');
                    if (prop.tagName === 'string' || prop.tagName === 'ProtectedString' || prop.tagName === 'BinaryString') {
                        instance.Properties[propName] = prop.textContent;
                    } else if (prop.tagName === 'float' || prop.tagName === 'double' || prop.tagName === 'int' || prop.tagName === 'int64') {
                        instance.Properties[propName] = Number(prop.textContent);
                    } else if (prop.tagName === 'bool') {
                        instance.Properties[propName] = prop.textContent === 'true';
                    } else {
                        instance.Properties[propName] = prop.textContent; 
                    }
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