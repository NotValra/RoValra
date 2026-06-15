import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { loadAssetTree, canAccessAsset } from '../../core/utils/assetStreamer.js';
import { observeElement } from '../../core/observer.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { getAssets } from '../../core/assets.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { isDarkMode } from '../../core/theme.js';
import { CLASS_ORDER } from '../../core/utils/vendor/classOrder.js';
import { PROP_CATEGORY } from '../../core/utils/vendor/propGroups.js';

// Sorts instances like the Studio Explorer: by class order (Workspace, Players,
// Lighting... first), then alphabetically. Unknown classes sink to the bottom.
function sortInstances(instances) {
    return [...instances].sort((a, b) => {
        const ao = CLASS_ORDER[a.ClassName] ?? Number.MAX_SAFE_INTEGER;
        const bo = CLASS_ORDER[b.ClassName] ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        const an = getInstanceName(a);
        const bn = getInstanceName(b);
        return an < bn ? -1 : an > bn ? 1 : 0;
    });
}

// Roblox Studio class icons, vendored as individual PNGs named by class. The
// dark variant is light-coloured (for dark UI) and vice versa, so pick the set
// that matches the current theme / overlay background.
function classIconUrl(className) {
    const folder = isDarkMode() ? 'class_icons_dark' : 'class_icons_light';
    return chrome.runtime.getURL(`public/Assets/${folder}/${className}.png`);
}

function applyMaskIcon(el, url) {
    const mask = `url("${url}") no-repeat center / contain`;
    el.style.webkitMask = mask;
    el.style.mask = mask;
}

function getInstanceName(instance) {
    const name = instance.Properties?.Name;
    if (typeof name === 'string' && name.length > 0) return name;
    return instance.ClassName || 'Instance';
}

function fixNum(v) {
    return Math.round(v * 1e3) / 1e3;
}

function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(fixNum(value));
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
        return `${value.length} keypoint${value.length === 1 ? '' : 's'}`;
    }

    if (typeof value === 'object') {
        if ('x' in value && 'y' in value) {
            return 'z' in value
                ? `${fixNum(value.x)}, ${fixNum(value.y)}, ${fixNum(value.z)}`
                : `${fixNum(value.x)}, ${fixNum(value.y)}`;
        }
        if ('r' in value && 'g' in value && 'b' in value) {
            const to255 = (c) => (c <= 1 ? Math.round(c * 255) : Math.round(c));
            return `${to255(value.r)}, ${to255(value.g)}, ${to255(value.b)}`;
        }
        if ('Scale' in value && 'Offset' in value) {
            return `{${fixNum(value.Scale)}, ${value.Offset}}`;
        }
        if (value.X && value.Y && 'Scale' in value.X) {
            return `{${fixNum(value.X.Scale)}, ${value.X.Offset}}, {${fixNum(value.Y.Scale)}, ${value.Y.Offset}}`;
        }
        if (value.Origin && value.Direction) {
            return `${formatValue(value.Origin)} → ${formatValue(value.Direction)}`;
        }
        if ('Min' in value && 'Max' in value) {
            return `${formatValue(value.Min)} .. ${formatValue(value.Max)}`;
        }
        if ('Family' in value) return value.Family;
        if ('Density' in value) return 'Custom';
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    return String(value);
}

const GROUP_PRIORITY = [
    'Appearance', 'Data', 'Behavior', 'Transform', 'Pivot', 'Part', 'Collision',
    'Physics', 'Surface Inputs', 'Surface', 'Camera', 'Goals', 'Image', 'Text',
    'Assembly', 'Scale',
];

function propGroup(name) {
    return PROP_CATEGORY[name] || 'Data';
}

// Properties Studio doesn't surface (internal, always zero, etc.).
const HIDDEN_PROPS = new Set(['HistoryId', 'SourceAssetId']);

function groupSortKey(group) {
    // Attributes and Tags are their own sections at the very bottom, like Studio.
    if (group === 'Attributes') return 1e6;
    if (group === 'Tags') return 1e6 + 1;
    const index = GROUP_PRIORITY.indexOf(group);
    return index === -1 ? GROUP_PRIORITY.length : index;
}

// CollectionService tags are stored as a NUL-separated string.
function parseTags(value) {
    if (value instanceof Uint8Array) value = new TextDecoder().decode(value);
    if (typeof value !== 'string') return [];
    return value.split('\0').filter((t) => t.length > 0);
}

// Decodes the AttributesSerialize binary blob (see dom.rojo.space/attributes).
function parseAttributes(bytes) {
    const result = {};
    if (!(bytes instanceof Uint8Array) || bytes.length < 4) return result;

    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const u8 = () => bytes[o++];
    const u16 = () => ((o += 2), dv.getUint16(o - 2, true));
    const u32 = () => ((o += 4), dv.getUint32(o - 4, true));
    const i32 = () => ((o += 4), dv.getInt32(o - 4, true));
    const f32 = () => ((o += 4), dv.getFloat32(o - 4, true));
    const f64 = () => ((o += 8), dv.getFloat64(o - 8, true));
    const str = () => {
        const len = u32();
        const s = new TextDecoder().decode(bytes.subarray(o, o + len));
        o += len;
        return s;
    };

    try {
        const count = u32();
        for (let n = 0; n < count; n++) {
            const name = str();
            const type = u8();
            let value;
            switch (type) {
                case 0x02: value = str(); break;
                case 0x03: value = u8() !== 0; break;
                case 0x04: value = i32(); break;
                case 0x05: value = f32(); break;
                case 0x06: value = f64(); break;
                case 0x09: value = { Scale: f32(), Offset: i32() }; break;
                case 0x0a:
                    value = {
                        X: { Scale: f32(), Offset: i32() },
                        Y: { Scale: f32(), Offset: i32() },
                    };
                    break;
                case 0x0e: value = u32(); break;
                case 0x0f: value = { r: f32(), g: f32(), b: f32() }; break;
                case 0x10: value = { x: f32(), y: f32() }; break;
                case 0x11: value = { x: f32(), y: f32(), z: f32() }; break;
                case 0x14: {
                    const x = f32(), y = f32(), z = f32();
                    if (u8() === 0) for (let k = 0; k < 9; k++) f32();
                    value = `${x}, ${y}, ${z}`;
                    break;
                }
                case 0x15: {
                    const enumName = str();
                    value = `${enumName}.${u32()}`;
                    break;
                }
                case 0x17: {
                    const kc = u32();
                    const arr = [];
                    for (let k = 0; k < kc; k++)
                        arr.push({ Time: f32(), Value: f32(), Envelope: f32() });
                    value = arr;
                    break;
                }
                case 0x19: {
                    const kc = u32();
                    const arr = [];
                    for (let k = 0; k < kc; k++) {
                        const envelope = f32();
                        const time = f32();
                        arr.push({
                            Time: time,
                            Value: { r: f32(), g: f32(), b: f32() },
                            Envelope: envelope,
                        });
                    }
                    value = arr;
                    break;
                }
                case 0x1b: value = { Min: f32(), Max: f32() }; break;
                case 0x1c:
                    value = {
                        Min: { x: f32(), y: f32() },
                        Max: { x: f32(), y: f32() },
                    };
                    break;
                case 0x21: {
                    const weight = u16();
                    const style = u8();
                    const family = str();
                    str(); // cached face id
                    value = { Family: family, Weight: weight, Style: style };
                    break;
                }
                default:
                    // Unknown type — stop rather than emit garbage.
                    return result;
            }
            result[name] = value;
        }
    } catch {
        /* return whatever parsed cleanly */
    }
    return result;
}

const LUAU_KEYWORDS = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true',
    'until', 'while', 'continue', 'export', 'type', 'self',
]);

// Lightweight Luau highlighter — builds coloured token spans via the DOM (no
// innerHTML), so it's safe to feed untrusted source.
function highlightLuau(source) {
    const code = document.createElement('code');
    code.className = 'rovalra-explorer-code';

    const re = /(--\[\[[\s\S]*?\]\]|--[^\n]*)|(\[\[[\s\S]*?\]\]|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\s+)|(.)/g;

    let m;
    while ((m = re.exec(source))) {
        let cls = null;
        if (m[1]) cls = 'tok-comment';
        else if (m[2]) cls = 'tok-string';
        else if (m[3]) cls = 'tok-number';
        else if (m[4]) cls = LUAU_KEYWORDS.has(m[4]) ? 'tok-keyword' : null;
        else if (m[5]) cls = null;
        else cls = 'tok-op';

        if (cls) {
            const span = document.createElement('span');
            span.className = cls;
            span.textContent = m[0];
            code.appendChild(span);
        } else {
            code.appendChild(document.createTextNode(m[0]));
        }
    }
    return code;
}

function asColorSwatch(value) {
    if (
        value &&
        typeof value === 'object' &&
        'r' in value &&
        'g' in value &&
        'b' in value
    ) {
        const to255 = (c) => (c <= 1 ? Math.round(c * 255) : Math.round(c));
        return `rgb(${to255(value.r)}, ${to255(value.g)}, ${to255(value.b)})`;
    }
    return null;
}

function buildExplorer(roots, expandAll) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-explorer';

    const treePane = document.createElement('div');
    treePane.className = 'rovalra-explorer-tree';

    const propsPane = document.createElement('div');
    propsPane.className = 'rovalra-explorer-props';

    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'rovalra-explorer-props-empty';
    emptyMsg.textContent = ts('createRoblox.explorer.selectInstance');
    propsPane.appendChild(emptyMsg);

    wrapper.appendChild(treePane);
    wrapper.appendChild(propsPane);

    let selectedRow = null;

    function selectInstance(instance, rowEl) {
        if (selectedRow) selectedRow.classList.remove('selected');
        selectedRow = rowEl;
        if (rowEl) rowEl.classList.add('selected');
        renderProps(instance);
    }

    function renderProps(instance) {
        propsPane.replaceChildren();

        const props = instance.Properties || {};
        const keys = Object.keys(props);

        const header = document.createElement('div');
        header.className = 'rovalra-explorer-props-header';
        const headerLabel = document.createElement('span');
        headerLabel.textContent = `${getInstanceName(instance)} (${instance.ClassName})`;
        header.appendChild(headerLabel);

        const headerActions = document.createElement('div');
        headerActions.className = 'rovalra-explorer-props-actions';
        header.appendChild(headerActions);

        if (typeof props.Source === 'string' && props.Source.trim().length > 0) {
            const sourceBtn = document.createElement('button');
            sourceBtn.type = 'button';
            sourceBtn.className = 'rovalra-explorer-source-btn';
            sourceBtn.textContent = ts('createRoblox.explorer.viewSource');
            sourceBtn.addEventListener('click', () => {
                openSource(`${getInstanceName(instance)}.Source`, props.Source);
            });
            headerActions.appendChild(sourceBtn);
        }

        propsPane.appendChild(header);

        if (keys.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'rovalra-explorer-props-empty';
            empty.textContent = ts('createRoblox.explorer.noProperties');
            propsPane.appendChild(empty);
            return;
        }

        // group -> [{ label, value }]. Tags and AttributesSerialize are pulled
        // out into their own sections (decoded), like Studio.
        const grouped = {};
        for (const key of keys) {
            if (key === 'Tags' || key === 'AttributesSerialize') continue;
            if (HIDDEN_PROPS.has(key)) continue;
            (grouped[propGroup(key)] ||= []).push({ label: key, value: props[key] });
        }

        const attributes = parseAttributes(props.AttributesSerialize);
        for (const [name, value] of Object.entries(attributes)) {
            (grouped.Attributes ||= []).push({ label: name, value });
        }

        const tags = parseTags(props.Tags);
        for (const tag of tags) {
            (grouped.Tags ||= []).push({ label: tag, value: '' });
        }

        const table = document.createElement('div');
        table.className = 'rovalra-explorer-props-table';

        const makeRow = (label, rawValue) => {
            const row = document.createElement('div');
            row.className = 'rovalra-explorer-prop-row';

            const nameCell = document.createElement('div');
            nameCell.className = 'rovalra-explorer-prop-name';
            nameCell.textContent = label;
            nameCell.title = label;

            const valueCell = document.createElement('div');
            valueCell.className = 'rovalra-explorer-prop-value';

            let swatch = asColorSwatch(rawValue);
            let displayText = formatValue(rawValue);

            // Colour stored as a packed number (e.g. Color3uint8 from XML) →
            // show it as a swatch + r, g, b instead of a raw integer.
            if (
                !swatch &&
                typeof rawValue === 'number' &&
                /colou?r/i.test(label) &&
                !/brick/i.test(label)
            ) {
                const r = (rawValue >>> 16) & 255;
                const g = (rawValue >>> 8) & 255;
                const b = rawValue & 255;
                swatch = `rgb(${r}, ${g}, ${b})`;
                displayText = `${r}, ${g}, ${b}`;
            }

            if (swatch) {
                const dot = document.createElement('span');
                dot.className = 'rovalra-explorer-color-swatch';
                dot.style.background = swatch;
                valueCell.appendChild(dot);
            }

            const valueText = document.createElement('span');
            valueText.textContent = displayText;
            valueText.title = valueText.textContent;
            valueCell.appendChild(valueText);

            // link to that asset's page.
            let assetLinkId = null;
            if (typeof rawValue === 'string') {
                const m = rawValue.match(
                    /(?:rbxassetid:\/\/|\/asset\/?\?id=|assetid=|[?&]id=)(\d+)/i,
                );
                if (m) {
                    assetLinkId = m[1];
                } else if (
                    /^\d{4,}$/.test(rawValue.trim()) &&
                    /(id|texture|mesh|image|sound|decal)$/i.test(label)
                ) {
                    assetLinkId = rawValue.trim();
                }
            }
            if (assetLinkId) {
                const link = document.createElement('a');
                link.className = 'rovalra-explorer-asset-link';
                link.href = `https://create.roblox.com/store/asset/${assetLinkId}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.title = `https://create.roblox.com/store/asset/${assetLinkId}`;
                const linkIcon = document.createElement('span');
                linkIcon.className = 'rovalra-explorer-asset-link-icon';
                applyMaskIcon(linkIcon, getAssets().launchIcon);
                link.appendChild(linkIcon);
                link.addEventListener('click', (e) => e.stopPropagation());
                valueCell.appendChild(link);
            }

            valueCell.classList.add('rovalra-explorer-copyable');
            valueCell.addEventListener('click', () => {
                const range = document.createRange();
                range.selectNodeContents(valueText);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });

            row.appendChild(nameCell);
            row.appendChild(valueCell);
            return row;
        };

        const groups = Object.keys(grouped).sort((a, b) => {
            const ka = groupSortKey(a);
            const kb = groupSortKey(b);
            return ka !== kb ? ka - kb : a.localeCompare(b);
        });

        for (const group of groups) {
            const groupKeys = grouped[group];
            groupKeys.sort((a, b) => a.label.localeCompare(b.label));

            const groupBody = document.createElement('div');
            groupBody.className = 'rovalra-explorer-prop-group-body';

            const groupHeader = document.createElement('div');
            groupHeader.className = 'rovalra-explorer-prop-group open';
            const arrow = document.createElement('span');
            arrow.className = 'rovalra-explorer-prop-group-arrow';
            arrow.textContent = '▾';
            const groupLabel = document.createElement('span');
            groupLabel.textContent = group;
            groupHeader.appendChild(arrow);
            groupHeader.appendChild(groupLabel);

            groupHeader.addEventListener('click', () => {
                const open = groupHeader.classList.toggle('open');
                arrow.textContent = open ? '▾' : '▸';
                groupBody.style.display = open ? '' : 'none';
            });

            for (const entry of groupKeys) {
                groupBody.appendChild(makeRow(entry.label, entry.value));
            }

            table.appendChild(groupHeader);
            table.appendChild(groupBody);
        }

        propsPane.appendChild(table);
    }

    // places don't build their entire DOM up front.
    function createNode(instance, depth) {
        const node = document.createElement('div');
        node.className = 'rovalra-explorer-node';

        const row = document.createElement('div');
        row.className = 'rovalra-explorer-row';
        row.style.paddingLeft = `${depth * 16 + 4}px`;

        const hasChildren = instance.Children && instance.Children.length > 0;

        const toggle = document.createElement('span');
        toggle.className = 'rovalra-explorer-toggle';
        toggle.textContent = hasChildren ? '▸' : '';

        const icon = document.createElement('img');
        icon.className = 'rovalra-explorer-icon';
        icon.src = classIconUrl(instance.ClassName);
        icon.onerror = () => {
            // Value subclasses (StringValue, IntValue, …) share the "Value" icon
            // in Studio; otherwise just hide the missing icon.
            if (/Value$/.test(instance.ClassName)) {
                icon.onerror = () => {
                    icon.onerror = null;
                    icon.style.visibility = 'hidden';
                };
                icon.src = classIconUrl('Value');
            } else {
                icon.onerror = null;
                icon.style.visibility = 'hidden';
            }
        };

        const label = document.createElement('span');
        label.className = 'rovalra-explorer-label';
        label.textContent = getInstanceName(instance);
        label.title = `${getInstanceName(instance)} — ${instance.ClassName}`;

        row.appendChild(toggle);
        row.appendChild(icon);
        row.appendChild(label);

        if (hasChildren) {
            const count = document.createElement('span');
            count.className = 'rovalra-explorer-count';
            count.textContent = instance.Children.length;
            row.appendChild(count);
        }

        node.appendChild(row);

        const childContainer = document.createElement('div');
        childContainer.className = 'rovalra-explorer-children';
        childContainer.style.display = 'none';
        node.appendChild(childContainer);

        let expanded = false;
        let built = false;

        const expand = () => {
            if (!hasChildren) return;
            expanded = !expanded;
            toggle.textContent = expanded ? '▾' : '▸';
            childContainer.style.display = expanded ? 'block' : 'none';

            if (expanded && !built) {
                built = true;
                const frag = document.createDocumentFragment();
                for (const child of sortInstances(instance.Children)) {
                    frag.appendChild(createNode(child, depth + 1));
                }
                childContainer.appendChild(frag);
            }
        };

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            expand();
        });

        const source = instance.Properties?.Source;
        const isScript = typeof source === 'string' && source.trim().length > 0;

        row.addEventListener('click', () => {
            selectInstance(instance, row);
        });

        row.addEventListener('dblclick', () => {
            if (isScript) {
                openSource(`${getInstanceName(instance)}.Source`, source);
            } else {
                expand();
            }
        });

        // Marketplace assets are small — open the whole tree up front.
        if (expandAll && hasChildren) {
            expand();
        }

        return node;
    }

    // Hide non-browsable services at the root (AssetService and the like) — the
    // same internal classes Studio's Explorer doesn't show. They have no
    // ExplorerOrder; every real top-level class does. Children are never filtered.
    const sortedRoots = sortInstances(roots);
    let visibleRoots = sortedRoots.filter(
        (r) => CLASS_ORDER[r.ClassName] !== undefined,
    );
    if (visibleRoots.length === 0) visibleRoots = sortedRoots;

    const frag = document.createDocumentFragment();
    for (const root of visibleRoots) {
        frag.appendChild(createNode(root, 0));
    }
    treePane.appendChild(frag);

    return wrapper;
}

// Opens a script's source in a read-only code view with line numbers and
function openSource(title, source) {
    const wrap = document.createElement('div');
    wrap.className = 'rovalra-explorer-source';

    const lineCount = source.split('\n').length;
    const gutter = document.createElement('div');
    gutter.className = 'rovalra-explorer-source-gutter';
    let nums = '';
    for (let i = 1; i <= lineCount; i++) nums += `${i}\n`;
    gutter.textContent = nums;

    wrap.appendChild(gutter);
    wrap.appendChild(highlightLuau(source));

    createOverlay({
        title,
        bodyContent: wrap,
        maxWidth: '900px',
        showLogo: true,
    });
}

async function openExplorer(assetId, name, expandAll) {
    const loading = document.createElement('div');
    loading.className = 'rovalra-explorer-loading';
    loading.textContent = ts('createRoblox.explorer.loading');

    createOverlay({
        title: `${ts('createRoblox.explorer.title')} — ${name || assetId}`,
        bodyContent: loading,
        maxWidth: '900px',
        showLogo: true,
    });

    try {
        const asset = await loadAssetTree(parseInt(assetId, 10));

        console.log('[RoValra Explorer] result', {
            assetId,
            isValid: asset?.isValid,
            format: asset?.format,
            roots: asset?.root?.length,
        });

        if (!asset || !asset.isValid || !asset.root || asset.root.length === 0) {
            loading.textContent = ts('createRoblox.explorer.loadError');
            return;
        }

        const explorer = buildExplorer(asset.root, expandAll);
        loading.replaceWith(explorer);
    } catch (e) {
        console.error('[RoValra Explorer] Failed:', e);
        loading.textContent = ts('createRoblox.explorer.loadError');
    }
}

// Catalog item pages: mirror BTRoblox — an icon button in the item header, to
// the left of the shopping-cart toolbar (the ".right" column).
function addCatalogButton(rightToolbar) {
    const assetId = getPlaceIdFromUrl();
    if (!assetId || document.getElementById('rovalra-explorer-btn')) return;

    const assets = getAssets();

    const container = document.createElement('div');
    container.className = 'rovalra-explorer-buttons';

    const button = document.createElement('button');
    button.id = 'rovalra-explorer-btn';
    button.type = 'button';
    button.className = 'rovalra-explorer-header-btn';
    button.title = ts('createRoblox.explorer.button');
    button.setAttribute('aria-label', ts('createRoblox.explorer.button'));

    const icon = document.createElement('span');
    icon.className = 'rovalra-explorer-header-icon';
    applyMaskIcon(icon, assets.explorerTreeIcon);
    button.appendChild(icon);

    button.addEventListener('click', (e) => {
        e.preventDefault();
        const name = document
            .querySelector('.item-details-name-row h1')
            ?.textContent?.trim();
        openExplorer(assetId, name, true);
    });

    container.appendChild(button);
    rightToolbar.parentElement.insertBefore(container, rightToolbar);
    console.log('%cRoValra Explorer: button added (catalog)', 'color:#FF4500');
}

// Experience pages: an icon + label entry in the Favorite/Follow/Share row,
// shown only when the place is accessible (i.e. it's yours / downloadable).
function addGameButton(actionList) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId || actionList.dataset.rovalraExplorerChecked) return;
    actionList.dataset.rovalraExplorerChecked = '1';

    canAccessAsset(parseInt(placeId, 10)).then((ok) => {
        if (!ok || document.getElementById('rovalra-explorer-btn')) return;

        const assets = getAssets();

        const li = document.createElement('li');
        li.className = 'rovalra-explorer-li';

        const button = document.createElement('button');
        button.id = 'rovalra-explorer-btn';
        button.type = 'button';
        button.className = 'rovalra-explorer-game-btn';
        button.title = ts('createRoblox.explorer.button');

        const icon = document.createElement('span');
        icon.className = 'rovalra-explorer-game-icon';
        applyMaskIcon(icon, assets.explorerTreeIcon);

        const label = document.createElement('div');
        label.className = 'icon-label';
        label.textContent = ts('createRoblox.explorer.button');

        button.appendChild(icon);
        button.appendChild(label);
        li.appendChild(button);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            const title = document.querySelector('h1.game-name');
            const name =
                title?.getAttribute('title') || title?.textContent?.trim();
            openExplorer(placeId, name);
        });

        actionList.appendChild(li);
        console.log('%cRoValra Explorer: button added (game)', 'color:#FF4500');
    });
}

export async function init() {
    const path = window.location.pathname;
    const onCatalog = /\/catalog\//.test(path);
    const onGame = /\/games\//.test(path);

    if (!onCatalog && !onGame) return;
    if (!(await settings.ExplorerEnabled)) return;

    if (onCatalog) {
        observeElement('.item-details-info-header .right', (el) =>
            addCatalogButton(el),
        );
    }
    if (onGame) {
        observeElement('ul.favorite-follow-vote-share', (el) =>
            addGameButton(el),
        );
    }
}
