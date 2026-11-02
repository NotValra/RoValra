import { API, RBX } from 'roavatar-renderer';
import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getCatalogItemDetails } from '../../core/apis/catalog.js';
import { backgroundRendererRequests } from '../../core/utils/renderer.js';

backgroundRendererRequests();

const ATTRIBUTES_ROW_CLASS = 'rovalra-improved-attributes-row';
const ATTRIBUTES_EXTRA_CLASS = 'rovalra-improved-attributes-extra';

const ATTRIBUTE_KEYS = [
    'CantBeSoldInGames',
    'Includes_PBR',
    'Includes_Emissive',
    'Includes_Transparency',
    'Includes_Particles',
    'Includes_Script',
    'Includes_Fire',
    'Includes_Sparkles',
    'Includes_Smoke',
    'Includes_Sound',
    'Includes_LightSource',
    'Includes_Beam',
    'Includes_Trail',
];

const RENDER_PROPERTY_EQUIVALENTS = {
    AdvancedMaterials: 'Includes_PBR',
    Emissive: 'Includes_Emissive',
    Transparency: 'Includes_Transparency',
};

const CLASS_ATTRIBUTES = {
    ParticleEmitter: 'Includes_Particles',
    Script: 'Includes_Script',
    LocalScript: 'Includes_Script',
    ModuleScript: 'Includes_Script',
    Fire: 'Includes_Fire',
    Sparkles: 'Includes_Sparkles',
    Smoke: 'Includes_Smoke',
    Sound: 'Includes_Sound',
    PointLight: 'Includes_LightSource',
    SpotLight: 'Includes_LightSource',
    SurfaceLight: 'Includes_LightSource',
    Beam: 'Includes_Beam',
    Trail: 'Includes_Trail',
};

const BASE_PART_CLASSES = new Set(['Part', 'MeshPart', 'UnionOperation']);

const SCANNABLE_ASSET_TYPES = new Set([
    8, 17, 18, 19, 27, 28, 29, 30, 31, 41, 42, 43, 44, 45, 46, 47, 57, 58, 64,
    65, 66, 67, 68, 69, 70, 71, 72, 76, 77, 79,
]);
const LAYERED_ASSET_TYPES = new Set([64, 65, 66, 67, 68, 69, 70, 71, 72]);
const HEAD_ASSET_TYPES = new Set([17, 79]);

const ALPHA_MODE_TRANSPARENCY = 1;

let isInitialized = false;
let isEnabled = true;
const attributeCache = new Map();

function avatarFormatFor(assetTypeId) {
    if (HEAD_ASSET_TYPES.has(assetTypeId)) return 'avatar_meshpart_head';
    if (!LAYERED_ASSET_TYPES.has(assetTypeId))
        return 'avatar_meshpart_accessory';
    return null;
}

function contentUri(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && typeof value.uri === 'string')
        return value.uri;
    return '';
}

function hasContent(instance, prop) {
    return contentUri(instance.PropOrDefault(prop, '')).length > 0;
}

async function loadModel(assetId, assetTypeId) {
    const url = `rbxassetid://${assetId}`;
    const format = avatarFormatFor(assetTypeId);

    let rbx = format
        ? await API.Asset.GetRBX(url, { 'Roblox-AssetFormat': format })
        : null;
    if (!(rbx instanceof RBX)) rbx = await API.Asset.GetRBX(url);
    if (!(rbx instanceof RBX)) return null;

    return rbx.generateTree();
}

function scanInstances(root, found) {
    for (const instance of root.GetDescendants()) {
        const className = instance.className;

        const classAttribute = CLASS_ATTRIBUTES[className];
        if (classAttribute) found.add(classAttribute);

        if (className === 'SurfaceAppearance') {
            if (
                hasContent(instance, 'NormalMap') ||
                hasContent(instance, 'RoughnessMap') ||
                hasContent(instance, 'MetalnessMap')
            ) {
                found.add('Includes_PBR');
            }
            if (
                hasContent(instance, 'EmissiveMaskContent') &&
                instance.PropOrDefault('EmissiveStrength', 0) > 0
            ) {
                found.add('Includes_Emissive');
            }
            if (
                instance.PropOrDefault('AlphaMode', 0) ===
                ALPHA_MODE_TRANSPARENCY
            ) {
                found.add('Includes_Transparency');
            }
        } else if (BASE_PART_CLASSES.has(className)) {
            const transparency = instance.PropOrDefault('Transparency', 0);
            if (transparency > 0.01 && transparency < 1) {
                found.add('Includes_Transparency');
            }
        }
    }
}

async function computeAttributes(itemId) {
    const details = await getCatalogItemDetails(itemId);
    if (!details) return null;

    const found = new Set();

    if (details.saleLocationType === 'ShopOnly') {
        found.add('CantBeSoldInGames');
    }

    if (SCANNABLE_ASSET_TYPES.has(details.assetType)) {
        try {
            const root = await loadModel(itemId, details.assetType);
            if (root) {
                scanInstances(root, found);
                root.Destroy();
            }
        } catch (error) {
            console.warn('RoValra: Failed to scan item for attributes', error);
        }
    }

    for (const renderProperty of details.renderProperties || []) {
        const equivalent = RENDER_PROPERTY_EQUIVALENTS[renderProperty];
        if (equivalent) found.delete(equivalent);
    }

    return ATTRIBUTE_KEYS.filter((key) => found.has(key));
}

function getAttributes(itemId) {
    if (!attributeCache.has(itemId)) {
        attributeCache.set(
            itemId,
            computeAttributes(itemId).catch((error) => {
                attributeCache.delete(itemId);
                console.warn('RoValra: Failed to get item attributes', error);
                return null;
            }),
        );
    }
    return attributeCache.get(itemId);
}

function getAttributeText(attributes) {
    return attributes
        .map((key) => ts(`improvedAttributes.attributes.${key}`))
        .join(', ');
}

function findRobloxAttributesContent(itemDetails) {
    return itemDetails.querySelector(
        `.item-info-row-container:not(.${ATTRIBUTES_ROW_CLASS}) > span.item-hold-tooltip > span.font-body`,
    );
}

function createRow(text) {
    const row = document.createElement('div');
    row.className = `clearfix item-info-row-container ${ATTRIBUTES_ROW_CLASS}`;

    const label = document.createElement('div');
    label.className =
        'font-header-1 text-subheader text-label text-overflow row-label';
    label.textContent = ts('improvedAttributes.label');

    const body = document.createElement('span');
    body.className = 'font-body text';
    body.textContent = text;

    row.append(label, body);
    return row;
}

function removeInjected(itemDetails) {
    itemDetails
        .querySelectorAll(
            `.${ATTRIBUTES_ROW_CLASS}, .${ATTRIBUTES_EXTRA_CLASS}`,
        )
        .forEach((el) => el.remove());
}

async function updateAttributes() {
    const itemDetails = document.getElementById('item-details');
    if (!itemDetails) return;

    if (!isEnabled || window.location.pathname.includes('/bundles/')) {
        removeInjected(itemDetails);
        return;
    }

    const itemId = getPlaceIdFromUrl();
    if (!itemId) return;

    const attributes = await getAttributes(itemId);
    if (
        !itemDetails.isConnected ||
        String(getPlaceIdFromUrl()) !== String(itemId) ||
        !isEnabled
    )
        return;

    if (!attributes || attributes.length === 0) {
        removeInjected(itemDetails);
        return;
    }

    const text = getAttributeText(attributes);
    const robloxContent = findRobloxAttributesContent(itemDetails);

    if (robloxContent) {
        itemDetails
            .querySelectorAll(`.${ATTRIBUTES_ROW_CLASS}`)
            .forEach((el) => el.remove());

        let extra = robloxContent.querySelector(`.${ATTRIBUTES_EXTRA_CLASS}`);
        if (!extra) {
            extra = document.createElement('span');
            extra.className = ATTRIBUTES_EXTRA_CLASS;
            robloxContent.appendChild(extra);
        }
        const extraText = `, ${text}`;
        if (extra.textContent !== extraText) extra.textContent = extraText;
        return;
    }

    const existingRow = itemDetails.querySelector(`.${ATTRIBUTES_ROW_CLASS}`);
    if (existingRow) {
        const body = existingRow.querySelector('.font-body');
        if (body && body.textContent !== text) body.textContent = text;
        return;
    }

    const typeRows = itemDetails.querySelectorAll('#type-content');
    const anchorRow = typeRows[typeRows.length - 1]?.closest(
        '.item-info-row-container',
    );
    if (!anchorRow) return;

    anchorRow.parentNode.insertBefore(createRow(text), anchorRow.nextSibling);
}

export async function init() {
    if (isInitialized) return;
    isInitialized = true;
    isEnabled = (await settings.improvedAttributesEnabled) !== false;

    observeElement('#item-details #type-content', () => updateAttributes(), {
        multiple: true,
    });
    observeElement(
        '#item-details .item-info-row-container > span.item-hold-tooltip',
        () => updateAttributes(),
        { multiple: true },
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes.improvedAttributesEnabled) {
            isEnabled = changes.improvedAttributesEnabled.newValue !== false;
            updateAttributes();
        }
    });
}
