import { ts } from '../../core/locale/i18n.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { getValidAccessToken } from '../../core/oauth/oauth.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createButton } from '../../core/ui/buttons.js';
import { createPill } from '../../core/ui/general/pill.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createRadioButton } from '../../core/ui/general/radio.js';
import { createSpinnerContainer } from '../../core/ui/spinner.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { Icon } from '../../core/ui/buildericon.js';
import { showConfirmationPrompt } from '../../core/ui/confirmationPrompt.js';
import { initSidebarLink } from '../../core/ui/sidebarLink.js';
import { settings } from '../../core/settings/getSettings.js';

const PAGE_PATH = '/rovalra-api-docs';
const SPEC_ENDPOINT = '/private/openapi.json';
const API_BASE_URL = 'https://apis.rovalra.com';
const STYLE_ID = 'rovalra-private-api-docs-style';
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const METHOD_COLORS = {
    get: '97, 175, 254',
    post: '73, 204, 144',
    put: '252, 161, 48',
    patch: '80, 227, 194',
    delete: '249, 62, 62',
    head: '144, 18, 254',
    options: '13, 90, 167',
};
const DEPRECATED_COLOR = '125, 132, 146';

let observerActive = false;

const STYLES = `
.rovalra-papi-shell { padding: 24px 20px 60px; max-width: 1460px; margin: 0 auto; color: var(--rovalra-main-text-color); }
.rovalra-papi-shell code, .rovalra-papi-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.rovalra-papi-info { display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px; }
.rovalra-papi-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0; font-size: 36px; font-weight: 800; color: var(--rovalra-main-text-color); }
.rovalra-papi-title .rovalra-pill { align-self: center; }
.rovalra-papi-base-url { font-size: 13px; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-info-desc { margin: 0; font-size: 15px; line-height: 1.5; color: var(--rovalra-main-text-color); }
.rovalra-papi-inline-code { padding: 1px 5px; border-radius: 4px; background: var(--rovalra-button-background-color); font-size: 0.92em; }

.rovalra-papi-scheme { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 0 0 24px; padding: 16px 20px; border-radius: 8px; background: var(--rovalra-button-background-color); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15); }
.rovalra-papi-scheme-group { display: flex; flex-direction: column; gap: 4px; }
.rovalra-papi-scheme-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-scheme-value { font-size: 14px; font-weight: 600; }
.rovalra-papi-scheme-auth { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.rovalra-papi-radio-row { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 14px; color: var(--rovalra-main-text-color); }

.rovalra-papi-body { display: grid; grid-template-columns: minmax(220px, 270px) minmax(0, 1fr); gap: 24px; align-items: start; }
.rovalra-papi-sidebar { position: sticky; top: 76px; max-height: calc(100vh - 96px); display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--rovalra-border-color); border-radius: 8px; background: var(--rovalra-container-background-color); overflow: hidden; }
.rovalra-papi-nav { overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.rovalra-papi-nav-item { display: flex; align-items: center; justify-content: flex-start; gap: 10px; width: 100%; min-height: 36px; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; }
.rovalra-papi-nav-item:hover { background: var(--rovalra-button-background-color); }
.rovalra-papi-nav-item .content-emphasis { position: relative; z-index: 1; font-size: 14px; font-weight: 600; }
.rovalra-papi-nav-item .content-emphasis { color: var(--rovalra-main-text-color); }
.rovalra-papi-nav-item .rovalra-papi-nav-count { margin-left: auto; position: relative; z-index: 1; }
.rovalra-papi-nav-empty { padding: 12px 4px; text-align: center; color: var(--rovalra-secondary-text-color); }

.rovalra-papi-main { min-width: 0; display: flex; flex-direction: column; gap: 8px; }

.rovalra-papi-tag-header { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 6px; border: 0; border-bottom: 1px solid var(--rovalra-border-color); background: transparent; color: var(--rovalra-main-text-color); font: inherit; text-align: left; cursor: pointer; transition: background-color 0.15s; border-radius: 6px 6px 0 0; }
.rovalra-papi-tag-header:hover { background: var(--rovalra-button-background-color); }
.rovalra-papi-tag-name { font-size: 22px; font-weight: 700; }
.rovalra-papi-tag-desc { flex: 1; min-width: 0; font-size: 14px; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-chevron { margin-left: auto; color: var(--rovalra-secondary-text-color); transition: transform 0.2s; }
.rovalra-papi-collapsed > * > .rovalra-papi-chevron, .rovalra-papi-collapsed > .rovalra-papi-chevron { transform: rotate(-90deg); }
.rovalra-papi-tag-ops { display: flex; flex-direction: column; gap: 12px; padding: 14px 0 20px; }
.rovalra-papi-tag.rovalra-papi-collapsed .rovalra-papi-tag-ops { display: none; }

.rovalra-papi-op { --rovalra-papi-rgb: 125, 132, 146; border: 1px solid rgb(var(--rovalra-papi-rgb)); border-radius: 6px; background: rgba(var(--rovalra-papi-rgb), 0.1); overflow: hidden; }
.rovalra-papi-op.is-deprecated { --rovalra-papi-rgb: ${DEPRECATED_COLOR} !important; opacity: 0.75; }
.rovalra-papi-summary { display: flex; align-items: center; gap: 12px; width: 100%; padding: 6px 10px 6px 6px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.rovalra-papi-op:not(.rovalra-papi-collapsed) .rovalra-papi-summary { border-bottom: 1px solid rgb(var(--rovalra-papi-rgb)); }
.rovalra-papi-method { flex: 0 0 auto; min-width: 76px; padding: 7px 0; border-radius: 4px; background: rgb(var(--rovalra-papi-rgb)); color: #fff; font-size: 14px; font-weight: 700; text-align: center; text-transform: uppercase; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.1); }
.rovalra-papi-path { flex: 0 1 auto; font-size: 15px; font-weight: 700; word-break: break-all; color: var(--rovalra-main-text-color); }
.rovalra-papi-path-param { color: rgb(var(--rovalra-papi-rgb)); }
.rovalra-papi-op.is-deprecated .rovalra-papi-path { text-decoration: line-through; }
.rovalra-papi-op-summary { flex: 1 1 auto; min-width: 0; font-size: 13px; color: var(--rovalra-secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rovalra-papi-op-pills { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; }
.rovalra-papi-op-pills .rovalra-pill { align-self: center; padding: 2px 8px; font-size: 11px; }
.rovalra-papi-lock { color: var(--rovalra-secondary-text-color); display: inline-flex; }
.rovalra-papi-op .rovalra-papi-chevron { margin-left: 0; }

.rovalra-pill.rovalra-papi-pill-extension { background: #ffb800; color: #000; }
.rovalra-pill.rovalra-papi-pill-neutral { background: var(--rovalra-button-background-color); color: var(--rovalra-main-text-color); }
.rovalra-pill.rovalra-papi-pill-version { background: #7d8492; color: #fff; }
.rovalra-pill.rovalra-papi-pill-oas { background: #89bf04; color: #fff; }

.rovalra-papi-op-body { display: flex; flex-direction: column; }
.rovalra-papi-op.rovalra-papi-collapsed .rovalra-papi-op-body { display: none; }
.rovalra-papi-op-desc { margin: 0; padding: 14px 20px 4px; font-size: 14px; line-height: 1.55; color: var(--rovalra-main-text-color); }
.rovalra-papi-op-meta { display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 20px 14px; }

.rovalra-papi-section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 50px; padding: 8px 20px; background: rgba(var(--rovalra-papi-rgb), 0.08); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
.rovalra-papi-section-header h4 { margin: 0; font-size: 14px; font-weight: 700; color: var(--rovalra-main-text-color); }
.rovalra-papi-section-header .rovalra-papi-required-label { margin-left: 8px; }
.rovalra-papi-section { padding: 16px 20px; }
.rovalra-papi-empty { font-size: 13px; font-style: italic; color: var(--rovalra-secondary-text-color); }

.rovalra-papi-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rovalra-papi-table th { padding: 10px 0; border-bottom: 1px solid var(--rovalra-border-color); text-align: left; font-size: 12px; font-weight: 700; color: var(--rovalra-main-text-color); }
.rovalra-papi-table td { padding: 12px 10px 12px 0; border-bottom: 1px solid var(--rovalra-border-color); vertical-align: top; color: var(--rovalra-main-text-color); }
.rovalra-papi-table tr:last-child td { border-bottom: 0; }
.rovalra-papi-col-name { width: 28%; min-width: 150px; }
.rovalra-papi-col-code { width: 90px; }
.rovalra-papi-param-name { font-size: 15px; font-weight: 600; word-break: break-all; }
.rovalra-papi-required-label { font-size: 10px; font-weight: 700; color: #f93e3e; vertical-align: super; margin-left: 3px; }
.rovalra-papi-param-type { margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--rovalra-main-text-color); }
.rovalra-papi-param-in { margin-top: 2px; font-size: 12px; font-style: italic; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-param-desc { display: flex; flex-direction: column; gap: 6px; }
.rovalra-papi-param-extra { font-size: 12px; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-param-input { max-width: 340px; margin-top: 4px; }

.rovalra-papi-content-type { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-body-view { display: flex; flex-direction: column; gap: 10px; }
.rovalra-papi-textarea { width: 100%; min-height: 160px; padding: 12px; border: 1px solid var(--rovalra-border-color); border-radius: 6px; background: #1e2025; color: #f0f0f0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; resize: vertical; box-sizing: border-box; outline: none; }
.rovalra-papi-textarea:focus { border-color: rgb(var(--rovalra-papi-rgb)); }

.rovalra-papi-code-wrap { position: relative; }
.rovalra-papi-code { margin: 0; padding: 12px 44px 12px 12px; max-height: 420px; overflow: auto; border-radius: 6px; background: #1e2025; color: #f0f0f0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.rovalra-papi-copy { position: absolute; top: 6px; right: 6px; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 6px; background: rgba(255, 255, 255, 0.08); color: #f0f0f0; cursor: pointer; }
.rovalra-papi-copy:hover { background: rgba(255, 255, 255, 0.18); }

.rovalra-papi-model { padding: 12px; border-radius: 6px; background: rgba(0, 0, 0, 0.08); font-size: 12.5px; line-height: 1.6; }
.rovalra-papi-model-brace { color: var(--rovalra-secondary-text-color); font-weight: 700; }
.rovalra-papi-model-props { padding-left: 18px; display: grid; grid-template-columns: max-content 1fr; column-gap: 18px; row-gap: 2px; }
.rovalra-papi-model-name { font-weight: 600; }
.rovalra-papi-model-type { color: rgb(var(--rovalra-papi-rgb)); font-weight: 600; }
.rovalra-papi-model-note { margin-left: 8px; color: var(--rovalra-secondary-text-color); font-weight: 400; }

.rovalra-papi-actions { display: flex; gap: 10px; padding: 0 20px 16px; }
.rovalra-papi-actions > button { flex: 1; }
.rovalra-papi-error { padding: 0 20px 12px; font-size: 13px; color: #f93e3e; }
.rovalra-papi-result { display: flex; flex-direction: column; gap: 14px; }
.rovalra-papi-result-label { margin: 0 0 6px; font-size: 13px; font-weight: 700; color: var(--rovalra-main-text-color); }
.rovalra-papi-status-code { font-size: 15px; font-weight: 700; }
.rovalra-papi-status-code.is-ok { color: #49cc90; }
.rovalra-papi-status-code.is-redirect { color: #fca130; }
.rovalra-papi-status-code.is-error { color: #f93e3e; }
.rovalra-papi-result-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.rovalra-papi-result img { max-width: 256px; border-radius: 6px; background: rgba(0, 0, 0, 0.15); }

.rovalra-papi-message { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; text-align: center; color: var(--rovalra-secondary-text-color); }
.rovalra-papi-message.is-error { color: #f93e3e; }

@media (max-width: 900px) {
    .rovalra-papi-body { grid-template-columns: 1fr; }
    .rovalra-papi-sidebar { position: static; max-height: 320px; }
    .rovalra-papi-op-summary { display: none; }
}
`;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
}

function removeHomeElement() {
    const homeElementToRemove = document.querySelector(
        'li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home',
    );
    if (homeElementToRemove) homeElementToRemove.remove();
}

function tr(key, options) {
    return ts(`privateApiDocs.${key}`, options);
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

function createChevron() {
    return Icon({
        material: true,
        icon: 'expand_more',
        size: '24px',
        classes: 'rovalra-papi-chevron',
    });
}

function createTypedPill(text, type, tooltip) {
    return createPill(text, tooltip || text, { type });
}

function renderInlineText(container, text) {
    String(text || '')
        .split('`')
        .forEach((part, index) => {
            if (!part) return;
            container.appendChild(
                index % 2 === 1
                    ? el('code', 'rovalra-papi-inline-code', part)
                    : document.createTextNode(part),
            );
        });
    return container;
}

function renderMessage(
    container,
    message,
    { isError = false, loading = false } = {},
) {
    container.replaceChildren();
    const wrapper = el(
        'div',
        `rovalra-papi-message${isError ? ' is-error' : ''}`,
    );
    if (loading) wrapper.appendChild(createSpinnerContainer({ size: '32px' }));
    wrapper.appendChild(el('div', null, message));
    container.appendChild(wrapper);
}

function createCopyIcon(icon) {
    return Icon({ material: true, icon, size: '16px' });
}

function createCodeBlock(text) {
    const wrapper = el('div', 'rovalra-papi-code-wrap');
    const pre = el('pre', 'rovalra-papi-code', text);
    const copyBtn = el('button', 'rovalra-papi-copy');
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', tr('copy'));
    copyBtn.appendChild(createCopyIcon('content_copy'));
    addTooltip(copyBtn, tr('copy'), { position: 'top' });
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(pre.textContent);
            copyBtn.replaceChildren(createCopyIcon('check'));
            setTimeout(() => {
                copyBtn.replaceChildren(createCopyIcon('content_copy'));
            }, 1500);
        } catch {}
    });
    wrapper.append(pre, copyBtn);
    return wrapper;
}

function createRadioRow(label, checked, onChange) {
    const row = el('label', 'rovalra-papi-radio-row');
    const radio = createRadioButton({ checked, onChange });
    row.append(radio, el('span', null, label));
    row.addEventListener('click', (event) => {
        if (event.target.closest('button') === radio) return;
        event.preventDefault();
        radio.click();
    });
    return row;
}

function getSchemaTypeLabel(schema) {
    if (!schema) return 'any';
    if (schema.type === 'array') {
        return `array[${getSchemaTypeLabel(schema.items)}]`;
    }
    const type = schema.type || 'any';
    return schema.format ? `${type}($${schema.format})` : type;
}

function getSchemaNotes(schema) {
    if (!schema) return [];
    const notes = [];
    [
        'minimum',
        'maximum',
        'minLength',
        'maxLength',
        'minItems',
        'maxItems',
        'default',
        'example',
    ].forEach((keyword) => {
        if (schema[keyword] !== undefined) {
            notes.push(`${keyword}: ${JSON.stringify(schema[keyword])}`);
        }
    });
    return notes;
}

function buildExample(schema, depth = 0) {
    if (!schema || depth > 6) return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

    switch (schema.type) {
        case 'object': {
            const result = {};
            Object.entries(schema.properties || {}).forEach(([key, value]) => {
                result[key] = buildExample(value, depth + 1);
            });
            return result;
        }
        case 'array':
            return [buildExample(schema.items, depth + 1)];
        case 'integer':
        case 'number':
            return schema.minimum ?? 0;
        case 'boolean':
            return true;
        case 'string':
            if (schema.format === 'uuid') {
                return '00000000-0000-0000-0000-000000000000';
            }
            if (schema.format === 'ipv4') return '0.0.0.0';
            return 'string';
        default:
            return null;
    }
}

function renderModel(schema, depth = 0) {
    const wrapper = el(
        'div',
        depth === 0 ? 'rovalra-papi-model rovalra-papi-mono' : null,
    );
    const objectSchema = schema?.type === 'array' ? schema.items : schema;

    if (
        objectSchema?.type !== 'object' ||
        !objectSchema.properties ||
        depth > 5
    ) {
        wrapper.appendChild(
            el('span', 'rovalra-papi-model-type', getSchemaTypeLabel(schema)),
        );
        const notes = getSchemaNotes(schema);
        if (Array.isArray(schema?.enum)) {
            notes.unshift(`enum: [${schema.enum.join(', ')}]`);
        }
        if (notes.length) {
            wrapper.appendChild(
                el('span', 'rovalra-papi-model-note', notes.join(' · ')),
            );
        }
        return wrapper;
    }

    const isArray = schema.type === 'array';
    wrapper.appendChild(
        el('div', 'rovalra-papi-model-brace', isArray ? '[{' : '{'),
    );
    const props = el('div', 'rovalra-papi-model-props');
    const required = new Set(objectSchema.required || []);

    Object.entries(objectSchema.properties).forEach(([name, propSchema]) => {
        const nameEl = el('span', 'rovalra-papi-model-name', name);
        if (required.has(name)) {
            nameEl.appendChild(el('span', 'rovalra-papi-required-label', '*'));
        }

        const valueEl = el('div');
        const nested =
            propSchema?.type === 'object' ||
            propSchema?.items?.type === 'object';
        if (nested) {
            valueEl.appendChild(renderModel(propSchema, depth + 1));
        } else {
            valueEl.appendChild(
                el(
                    'span',
                    'rovalra-papi-model-type',
                    getSchemaTypeLabel(propSchema),
                ),
            );
            const notes = [];
            if (propSchema?.description) notes.push(propSchema.description);
            if (Array.isArray(propSchema?.enum)) {
                notes.push(`enum: [${propSchema.enum.join(', ')}]`);
            }
            notes.push(...getSchemaNotes(propSchema));
            if (notes.length) {
                valueEl.appendChild(
                    el('span', 'rovalra-papi-model-note', notes.join(' · ')),
                );
            }
        }
        props.append(nameEl, valueEl);
    });

    wrapper.appendChild(props);
    wrapper.appendChild(
        el('div', 'rovalra-papi-model-brace', isArray ? '}]' : '}'),
    );
    if (isArray && schema.maxItems !== undefined) {
        wrapper.appendChild(
            el(
                'span',
                'rovalra-papi-model-note',
                `maxItems: ${schema.maxItems}`,
            ),
        );
    }
    return wrapper;
}

function isTokenScheme(scheme) {
    if (!scheme) return false;
    if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
        return true;
    }
    return scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer';
}

function getSecurityInfo(operation, spec) {
    const requirements = operation.security ?? spec.security ?? [];
    const definitions = spec.components?.securitySchemes || {};
    const names = new Set();
    let optional = requirements.length === 0;

    requirements.forEach((requirement) => {
        const keys = Object.keys(requirement || {});
        if (!keys.length) optional = true;
        keys.forEach((key) => names.add(key));
    });

    const schemes = Array.from(names).map((name) => ({
        name,
        definition: definitions[name],
    }));

    return {
        names: Array.from(names),
        optional,
        usesToken: schemes.some(({ definition }) => isTokenScheme(definition)),
        unsentSchemes: schemes.filter(
            ({ definition }) => !isTokenScheme(definition),
        ),
    };
}

function getExtensions(operation) {
    return Object.entries(operation)
        .filter(
            ([key, value]) =>
                key.startsWith('x-') && value !== null && value !== undefined,
        )
        .map(([key, value]) => {
            const words = key.slice(2).replace(/[-_]+/g, ' ').trim();
            return {
                label: words.charAt(0).toUpperCase() + words.slice(1),
                value:
                    typeof value === 'object' ? JSON.stringify(value) : value,
            };
        });
}

function collectOperations(spec) {
    const operations = [];
    Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
        METHODS.forEach((method) => {
            const operation = pathItem?.[method];
            if (!operation) return;
            operations.push({
                path,
                method,
                operation,
                parameters: [
                    ...(pathItem.parameters || []),
                    ...(operation.parameters || []),
                ],
                tags: operation.tags?.length ? operation.tags : ['default'],
                id: operation.operationId || `${method}-${path}`,
            });
        });
    });
    return operations;
}

function getOperationSearchText(entry) {
    return [
        entry.method,
        entry.path,
        entry.id,
        entry.operation.summary,
        entry.operation.description,
        ...entry.tags,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function renderPath(path) {
    const container = el('span', 'rovalra-papi-path rovalra-papi-mono');
    path.split(/(\{[^}]+\})/).forEach((part) => {
        if (!part) return;
        container.appendChild(
            part.startsWith('{')
                ? el('span', 'rovalra-papi-path-param', part)
                : document.createTextNode(part),
        );
    });
    return container;
}

function confirmRequest(method, path) {
    return new Promise((resolve) => {
        showConfirmationPrompt({
            title: tr('confirmTitle'),
            message: tr('confirmMessage', {
                method: method.toUpperCase(),
                path,
            }),
            confirmText: tr('send'),
            confirmType: 'primary-destructive',
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}

async function readResponseBody(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
        const blob = await response.blob();
        return { kind: 'image', url: URL.createObjectURL(blob), contentType };
    }

    const text = await response.text();
    try {
        return {
            kind: 'text',
            text: JSON.stringify(JSON.parse(text), null, 2),
            contentType,
        };
    } catch {
        return { kind: 'text', text, contentType };
    }
}

function buildCurl(method, url, headers, body) {
    const lines = [
        `curl -X '${method.toUpperCase()}'`,
        `  '${url}'`,
        `  -H 'accept: application/json'`,
    ];
    Object.entries(headers).forEach(([key, value]) => {
        lines.push(`  -H '${key}: ${value}'`);
    });
    if (body) lines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
    return lines.join(' \\\n');
}

function getStatusClass(status) {
    if (status >= 400 || status === 0) return 'is-error';
    if (status >= 300) return 'is-redirect';
    return 'is-ok';
}

function createSectionHeader(title, ...extra) {
    const header = el('div', 'rovalra-papi-section-header');
    const heading = el('h4', null, title);
    header.appendChild(heading);
    extra.filter(Boolean).forEach((node) => header.appendChild(node));
    return { header, heading };
}

function createTableHead(firstClass, ...labels) {
    const head = el('tr');
    labels.forEach((label, index) => {
        head.appendChild(el('th', index === 0 ? firstClass : null, label));
    });
    return head;
}

function createResultLabel(text) {
    return el('h5', 'rovalra-papi-result-label', text);
}

function renderServerResponse(
    container,
    { response, durationMs, body, url, curl },
) {
    container.replaceChildren();
    const result = el('div', 'rovalra-papi-result');

    const curlBlock = el('div');
    curlBlock.append(createResultLabel(tr('curl')), createCodeBlock(curl));

    const urlBlock = el('div');
    urlBlock.append(createResultLabel(tr('requestUrl')), createCodeBlock(url));

    const serverBlock = el('div');
    serverBlock.appendChild(createResultLabel(tr('serverResponse')));
    const table = el('table', 'rovalra-papi-table');
    const row = el('tr');
    const codeCell = el('td');
    codeCell.appendChild(
        el(
            'span',
            `rovalra-papi-status-code ${getStatusClass(response.status)}`,
            response.status,
        ),
    );

    const detailsCell = el('td');
    const meta = el('div', 'rovalra-papi-result-meta');
    if (response.statusText) {
        meta.appendChild(
            createTypedPill(response.statusText, 'rovalra-papi-pill-neutral'),
        );
    }
    meta.appendChild(
        createTypedPill(
            tr('duration', { ms: Math.round(durationMs) }),
            'rovalra-papi-pill-neutral',
            tr('durationTooltip'),
        ),
    );
    if (body.contentType) {
        meta.appendChild(
            createTypedPill(
                body.contentType,
                'rovalra-papi-pill-neutral',
                tr('contentType'),
            ),
        );
    }
    if (response.redirected && response.url) {
        meta.appendChild(
            createTypedPill(
                tr('redirected'),
                'rovalra-papi-pill-neutral',
                response.url,
            ),
        );
    }
    detailsCell.appendChild(meta);

    detailsCell.appendChild(createResultLabel(tr('responseBody')));
    if (body.kind === 'image') {
        const img = document.createElement('img');
        img.src = body.url;
        img.alt = tr('responseImage');
        detailsCell.appendChild(img);
    } else {
        detailsCell.appendChild(
            createCodeBlock(body.text || tr('emptyResponse')),
        );
    }

    const headers = Array.from(response.headers.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    if (headers) {
        const headersLabel = createResultLabel(tr('responseHeaders'));
        headersLabel.style.marginTop = '12px';
        detailsCell.append(headersLabel, createCodeBlock(headers));
    }

    row.append(codeCell, detailsCell);
    table.append(
        createTableHead('rovalra-papi-col-code', tr('code'), tr('details')),
        row,
    );
    serverBlock.appendChild(table);

    result.append(curlBlock, urlBlock, serverBlock);
    container.appendChild(result);
}

function createParamInput(param, idPrefix) {
    const schema = param.schema || {};

    if (Array.isArray(schema.enum)) {
        const items = schema.enum.map((value) => ({
            label: String(value),
            value: String(value),
        }));
        if (!param.required) items.unshift({ label: '--', value: '' });
        let value =
            schema.default !== undefined
                ? String(schema.default)
                : param.required
                  ? String(schema.enum[0])
                  : '';
        const dropdown = createDropdown({
            items,
            initialValue: value,
            onValueChange: (next) => {
                value = next;
            },
        });
        return { element: dropdown.element, getValue: () => value };
    }

    const { container, input } = createStyledInput({
        id: `${idPrefix}-${param.in}-${param.name}`.replace(
            /[^a-zA-Z0-9_-]/g,
            '_',
        ),
        label: param.name,
        placeholder:
            schema.example !== undefined
                ? String(schema.example)
                : param.description || param.name,
    });
    if (schema.default !== undefined) input.value = String(schema.default);
    if (schema.type === 'integer' || schema.type === 'number') {
        input.inputMode = 'numeric';
    }
    return { element: container, getValue: () => input.value.trim() };
}

function createParametersSection(entry, state) {
    const { parameters } = entry;
    const section = el('div', 'rovalra-papi-section');
    const inputs = new Map();

    const render = () => {
        section.replaceChildren();
        inputs.clear();

        if (!parameters.length) {
            section.appendChild(
                el('div', 'rovalra-papi-empty', tr('noParameters')),
            );
            return;
        }

        const table = el('table', 'rovalra-papi-table');
        table.appendChild(
            createTableHead(
                'rovalra-papi-col-name',
                tr('name'),
                tr('description'),
            ),
        );

        parameters.forEach((param) => {
            const row = el('tr');
            const nameCell = el('td', 'rovalra-papi-col-name');
            const nameEl = el('div', 'rovalra-papi-param-name', param.name);
            if (param.required) {
                nameEl.appendChild(
                    el(
                        'span',
                        'rovalra-papi-required-label',
                        `* ${tr('required')}`,
                    ),
                );
            }
            nameCell.append(
                nameEl,
                el(
                    'div',
                    'rovalra-papi-param-type rovalra-papi-mono',
                    getSchemaTypeLabel(param.schema),
                ),
                el('div', 'rovalra-papi-param-in', `(${param.in})`),
            );

            const descCell = el('td', 'rovalra-papi-param-desc');
            if (param.description) {
                descCell.appendChild(
                    renderInlineText(el('div'), param.description),
                );
            }
            if (Array.isArray(param.schema?.enum)) {
                descCell.appendChild(
                    el(
                        'div',
                        'rovalra-papi-param-extra',
                        tr('availableValues', {
                            values: param.schema.enum.join(', '),
                        }),
                    ),
                );
            }
            const notes = getSchemaNotes(param.schema);
            if (notes.length) {
                descCell.appendChild(
                    el('div', 'rovalra-papi-param-extra', notes.join(' · ')),
                );
            }

            if (state.tryItOut) {
                const input = createParamInput(
                    param,
                    `rovalra-papi-${entry.id}`,
                );
                const inputWrap = el('div', 'rovalra-papi-param-input');
                inputWrap.appendChild(input.element);
                descCell.appendChild(inputWrap);
                inputs.set(param, input);
            }

            row.append(nameCell, descCell);
            table.appendChild(row);
        });

        section.appendChild(table);
    };

    render();
    return {
        element: section,
        render,
        getValue: (param) => inputs.get(param)?.getValue() ?? '',
    };
}

function createRequestBodySection(entry, state) {
    const requestBody = entry.operation.requestBody;
    const media = requestBody?.content?.['application/json'];
    if (!media) return null;

    const section = el('div', 'rovalra-papi-section rovalra-papi-body-view');
    const exampleText = JSON.stringify(buildExample(media.schema), null, 2);
    let textarea = null;
    let view = 'example';

    const render = () => {
        section.replaceChildren();
        textarea = null;

        if (state.tryItOut) {
            textarea = el('textarea', 'rovalra-papi-textarea');
            textarea.spellcheck = false;
            textarea.value = state.bodyDraft ?? exampleText;
            textarea.addEventListener('input', () => {
                state.bodyDraft = textarea.value;
            });
            section.appendChild(textarea);
            return;
        }

        section.appendChild(
            createPillToggle({
                options: [
                    { text: tr('exampleValue'), value: 'example' },
                    { text: tr('schema'), value: 'schema' },
                ],
                initialValue: view,
                onChange: (next) => {
                    view = next;
                    render();
                },
            }),
        );
        section.appendChild(
            view === 'example'
                ? createCodeBlock(exampleText)
                : renderModel(media.schema),
        );
    };

    render();

    const contentType = el('span', 'rovalra-papi-content-type');
    contentType.appendChild(
        createTypedPill(
            'application/json',
            'rovalra-papi-pill-neutral',
            tr('requestContentType'),
        ),
    );

    const { header, heading } = createSectionHeader(
        tr('requestBody'),
        contentType,
    );
    if (requestBody.required) {
        heading.appendChild(
            el('span', 'rovalra-papi-required-label', tr('required')),
        );
    }

    return {
        header,
        element: section,
        render,
        getValue: () => (textarea ? textarea.value.trim() : ''),
    };
}

function createResponsesTable(operation) {
    const section = el('div', 'rovalra-papi-section');
    const responses = Object.entries(operation.responses || {});
    if (!responses.length) {
        section.appendChild(el('div', 'rovalra-papi-empty', tr('noResponses')));
        return section;
    }

    const table = el('table', 'rovalra-papi-table');
    table.appendChild(
        createTableHead('rovalra-papi-col-code', tr('code'), tr('description')),
    );

    responses.forEach(([code, response]) => {
        const row = el('tr');
        const codeCell = el('td');
        codeCell.appendChild(
            el(
                'span',
                `rovalra-papi-status-code ${getStatusClass(Number(code))}`,
                code,
            ),
        );
        const descCell = el('td', 'rovalra-papi-param-desc');
        descCell.appendChild(
            renderInlineText(el('div'), response.description || ''),
        );
        const schema = response.content?.['application/json']?.schema;
        if (schema) descCell.appendChild(renderModel(schema));
        row.append(codeCell, descCell);
        table.appendChild(row);
    });

    section.appendChild(table);
    return section;
}

function createOperationMeta(entry, security) {
    const meta = el('div', 'rovalra-papi-op-meta');
    meta.appendChild(
        createTypedPill(
            entry.id,
            'rovalra-papi-pill-neutral',
            tr('operationId'),
        ),
    );

    if (security.names.length) {
        const schemes = security.names.join(' / ');
        meta.appendChild(
            createTypedPill(
                security.optional
                    ? tr('securityOptional', { schemes })
                    : tr('security', { schemes }),
                'rovalra-papi-pill-neutral',
                tr('securityTooltip'),
            ),
        );
    }

    getExtensions(entry.operation).forEach(({ label, value }) => {
        meta.appendChild(
            createTypedPill(
                `${label}: ${value}`,
                'rovalra-papi-pill-extension',
                label,
            ),
        );
    });

    return meta;
}

function createOperationBody(entry, spec, authState) {
    const { method, path, operation, parameters } = entry;
    const body = el('div', 'rovalra-papi-op-body');
    const state = { tryItOut: false, bodyDraft: null };
    const security = getSecurityInfo(operation, spec);

    if (operation.description) {
        body.appendChild(
            renderInlineText(
                el('p', 'rovalra-papi-op-desc'),
                operation.description,
            ),
        );
    }
    body.appendChild(createOperationMeta(entry, security));

    const paramsSection = createParametersSection(entry, state);
    const bodySection = createRequestBodySection(entry, state);
    const errorEl = el('div', 'rovalra-papi-error');
    const actions = el('div', 'rovalra-papi-actions');
    const resultSection = el('div', 'rovalra-papi-section');
    resultSection.style.display = 'none';

    const clearResult = () => {
        errorEl.textContent = '';
        resultSection.replaceChildren();
        resultSection.style.display = 'none';
    };

    const tryBtn = createButton(tr('tryItOut'), 'secondary', {
        onClick: () => {
            state.tryItOut = !state.tryItOut;
            tryBtn.textContent = state.tryItOut
                ? ts('common.cancel')
                : tr('tryItOut');
            paramsSection.render();
            bodySection?.render();
            actions.style.display = state.tryItOut ? '' : 'none';
            if (!state.tryItOut) clearResult();
            errorEl.textContent = '';
        },
    });

    const { header: paramsHeader } = createSectionHeader(
        tr('parameters'),
        tryBtn,
    );
    body.append(paramsHeader, paramsSection.element);
    if (bodySection) body.append(bodySection.header, bodySection.element);

    const buildRequest = () => {
        let resolvedPath = path;
        const query = new URLSearchParams();
        const headers = {};
        const missing = [];

        parameters.forEach((param) => {
            const value = paramsSection.getValue(param);
            if (!value) {
                if (param.required) missing.push(param.name);
                return;
            }
            if (param.in === 'path') {
                resolvedPath = resolvedPath.replace(
                    `{${param.name}}`,
                    encodeURIComponent(value),
                );
            } else if (param.in === 'query') {
                query.set(param.name, value);
            } else if (param.in === 'header') {
                headers[param.name] = value;
            }
        });

        if (missing.length) {
            throw new Error(
                tr('missingParams', { params: missing.join(', ') }),
            );
        }

        let requestBody = null;
        if (bodySection) {
            const raw = bodySection.getValue();
            if (raw) {
                try {
                    requestBody = JSON.stringify(JSON.parse(raw));
                } catch (parseError) {
                    throw new Error(
                        tr('invalidJson', { error: parseError.message }),
                    );
                }
                headers['Content-Type'] = 'application/json';
            } else if (operation.requestBody?.required) {
                throw new Error(tr('bodyRequired'));
            }
        }

        const queryString = query.toString();
        const endpoint = `${resolvedPath}${queryString ? `?${queryString}` : ''}`;
        return {
            endpoint,
            url: `${API_BASE_URL}${endpoint}`,
            headers,
            body: requestBody,
            useToken: security.usesToken && authState.useToken,
        };
    };

    const executeBtn = createButton(tr('execute'), 'primary', {
        onClick: async () => {
            errorEl.textContent = '';
            let request;
            try {
                request = buildRequest();
            } catch (buildError) {
                errorEl.textContent = buildError.message;
                return;
            }

            if (method !== 'get' && method !== 'head') {
                const confirmed = await confirmRequest(
                    method,
                    request.endpoint,
                );
                if (!confirmed) return;
            }

            executeBtn.disabled = true;
            resultSection.style.display = '';
            renderMessage(resultSection, tr('sending'), { loading: true });
            const startedAt = performance.now();
            try {
                const headers = { ...request.headers };
                if (request.useToken) {
                    const token = await getValidAccessToken(false, false);
                    if (token) headers.Authorization = `Bearer ${token}`;
                }

                const response = await callRobloxApi({
                    endpoint: request.endpoint,
                    method: method.toUpperCase(),
                    isRovalraApi: true,
                    skipAutoAuth: true,
                    noCache: true,
                    headers,
                    body: request.body,
                });
                const durationMs = performance.now() - startedAt;
                const responseBody = await readResponseBody(response);
                const curlHeaders = { ...request.headers };
                if (headers.Authorization) {
                    curlHeaders.Authorization = 'Bearer <token>';
                }
                renderServerResponse(resultSection, {
                    response,
                    durationMs,
                    body: responseBody,
                    url: request.url,
                    curl: buildCurl(
                        method,
                        request.url,
                        curlHeaders,
                        request.body,
                    ),
                });
            } catch (requestError) {
                renderMessage(
                    resultSection,
                    tr('requestFailed', { error: requestError.message }),
                    { isError: true },
                );
            } finally {
                executeBtn.disabled = false;
            }
        },
    });

    const clearBtn = createButton(tr('clear'), 'secondary', {
        onClick: clearResult,
    });

    actions.append(executeBtn, clearBtn);
    actions.style.display = 'none';
    body.append(actions, errorEl);

    const { header: responsesHeader } = createSectionHeader(tr('responses'));
    body.append(
        responsesHeader,
        resultSection,
        createResponsesTable(operation),
    );

    return body;
}

function createOperationPills(operation, security) {
    const pills = el('span', 'rovalra-papi-op-pills');

    if (operation.deprecated) {
        pills.appendChild(
            createTypedPill(
                tr('deprecated'),
                'deprecated',
                tr('deprecatedTooltip'),
            ),
        );
    }

    security.unsentSchemes.forEach(({ name, definition }) => {
        pills.appendChild(
            createTypedPill(
                name,
                'rovalra-papi-pill-neutral',
                tr('schemeNotSent', {
                    name: definition?.name || name,
                }),
            ),
        );
    });

    if (security.names.length) {
        const lock = el('span', 'rovalra-papi-lock');
        lock.appendChild(
            Icon({
                material: true,
                icon: security.optional ? 'lock_open' : 'lock',
                size: '20px',
            }),
        );
        addTooltip(
            lock,
            security.optional ? tr('authOptional') : tr('authRequired'),
            { position: 'top' },
        );
        pills.appendChild(lock);
    }

    return pills;
}

function createOperation(entry, spec, authState) {
    const { method, path, operation } = entry;
    const wrapper = el('div', 'rovalra-papi-op rovalra-papi-collapsed');
    wrapper.id = `rovalra-papi-op-${entry.id}`;
    wrapper.style.setProperty(
        '--rovalra-papi-rgb',
        METHOD_COLORS[method] || DEPRECATED_COLOR,
    );
    if (operation.deprecated) wrapper.classList.add('is-deprecated');

    const summary = el('button', 'rovalra-papi-summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', 'false');
    summary.append(
        el('span', 'rovalra-papi-method', method),
        renderPath(path),
        el('span', 'rovalra-papi-op-summary', operation.summary || ''),
        createOperationPills(operation, getSecurityInfo(operation, spec)),
        createChevron(),
    );
    wrapper.appendChild(summary);

    let body = null;
    const setExpanded = (expanded) => {
        if (expanded && !body) {
            body = createOperationBody(entry, spec, authState);
            wrapper.appendChild(body);
        }
        wrapper.classList.toggle('rovalra-papi-collapsed', !expanded);
        summary.setAttribute('aria-expanded', String(expanded));
    };

    summary.addEventListener('click', () => {
        const expanded = wrapper.classList.contains('rovalra-papi-collapsed');
        setExpanded(expanded);
        if (expanded) {
            history.replaceState(
                history.state,
                '',
                `#${encodeURIComponent(entry.id)}`,
            );
        }
    });

    return { element: wrapper, setExpanded };
}

function createInfoSection(spec, authState) {
    const fragment = document.createDocumentFragment();

    const info = el('div', 'rovalra-papi-info');
    const title = el(
        'h1',
        'rovalra-papi-title',
        spec.info?.title || tr('title'),
    );
    if (spec.info?.version) {
        title.appendChild(
            createTypedPill(
                spec.info.version,
                'rovalra-papi-pill-version',
                tr('apiVersion'),
            ),
        );
    }
    if (spec.openapi) {
        title.appendChild(
            createTypedPill(
                `OAS ${spec.openapi}`,
                'rovalra-papi-pill-oas',
                tr('openApiVersion'),
            ),
        );
    }
    info.appendChild(title);
    info.appendChild(
        el(
            'div',
            'rovalra-papi-base-url rovalra-papi-mono',
            `[ ${tr('baseUrl', { url: API_BASE_URL })} ]`,
        ),
    );
    if (spec.info?.description) {
        info.appendChild(
            renderInlineText(
                el('p', 'rovalra-papi-info-desc'),
                spec.info.description,
            ),
        );
    }
    fragment.appendChild(info);

    const scheme = el('div', 'rovalra-papi-scheme');
    const serverGroup = el('div', 'rovalra-papi-scheme-group');
    serverGroup.append(
        el('span', 'rovalra-papi-scheme-label', tr('server')),
        el('span', 'rovalra-papi-scheme-value rovalra-papi-mono', API_BASE_URL),
    );

    const authGroup = el('div', 'rovalra-papi-scheme-auth');
    const hasTokenScheme = Object.values(
        spec.components?.securitySchemes || {},
    ).some(isTokenScheme);
    if (hasTokenScheme) {
        authGroup.appendChild(
            createRadioRow(tr('sendToken'), authState.useToken, (checked) => {
                authState.useToken = checked;
            }),
        );
    }
    scheme.append(serverGroup, authGroup);
    fragment.appendChild(scheme);

    return fragment;
}

function createNavItem(tag, count, onClick) {
    const item = el(
        'button',
        'rovalra-papi-nav-item relative clip group/interactable focus-visible:outline-focus foundation-web-menu-item flex items-center content-default cursor-pointer text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium',
    );
    item.type = 'button';

    const presentation = el(
        'div',
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)]',
    );
    presentation.setAttribute('role', 'presentation');

    const label = el(
        'span',
        'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis',
        tag,
    );
    const countPill = createPill(String(count), null, { size: 'small' });
    countPill.classList.add('rovalra-papi-nav-count');

    item.append(presentation, label, countPill);
    item.addEventListener('click', onClick);
    return item;
}

function createTagSection(tag, description, entries, spec, authState) {
    const section = el('section', 'rovalra-papi-tag');

    const header = el('button', 'rovalra-papi-tag-header');
    header.type = 'button';
    header.append(
        el('span', 'rovalra-papi-tag-name', tag),
        renderInlineText(el('span', 'rovalra-papi-tag-desc'), description),
        createChevron(),
    );
    header.addEventListener('click', () =>
        section.classList.toggle('rovalra-papi-collapsed'),
    );
    section.appendChild(header);

    const list = el('div', 'rovalra-papi-tag-ops');
    const items = entries.map((entry) => {
        const controller = createOperation(entry, spec, authState);
        list.appendChild(controller.element);
        return { entry, controller, searchText: getOperationSearchText(entry) };
    });
    section.appendChild(list);

    return { tag, section, items };
}

function renderSpec(container, spec, authState) {
    container.replaceChildren(createInfoSection(spec, authState));

    const operations = collectOperations(spec);
    const tagOrder = (spec.tags || []).map((tag) => tag.name);
    operations.forEach((entry) => {
        entry.tags.forEach((tag) => {
            if (!tagOrder.includes(tag)) tagOrder.push(tag);
        });
    });
    const tagDescriptions = new Map(
        (spec.tags || []).map((tag) => [tag.name, tag.description]),
    );

    const body = el('div', 'rovalra-papi-body');
    const sidebar = el('aside', 'rovalra-papi-sidebar');
    const main = el('div', 'rovalra-papi-main');

    const { container: searchContainer, input: searchInput } =
        createStyledInput({
            id: 'rovalra-papi-search',
            label: tr('filterLabel'),
            placeholder: tr('filterPlaceholder'),
        });
    searchInput.type = 'search';

    let hideDeprecated = false;
    const nav = el('div', 'rovalra-papi-nav');

    const operationControllers = new Map();
    const tagSections = tagOrder.map((tag) => {
        const tagSection = createTagSection(
            tag,
            tagDescriptions.get(tag),
            operations.filter((entry) => entry.tags.includes(tag)),
            spec,
            authState,
        );
        tagSection.items.forEach(({ entry, controller }) => {
            if (!operationControllers.has(entry.id)) {
                operationControllers.set(entry.id, {
                    ...controller,
                    section: tagSection.section,
                });
            }
        });
        main.appendChild(tagSection.section);
        return tagSection;
    });

    const applyFilter = () => {
        const term = searchInput.value.trim().toLowerCase();
        nav.replaceChildren();
        let totalVisible = 0;

        tagSections.forEach(({ tag, section, items }) => {
            let visibleCount = 0;
            items.forEach(({ entry, controller, searchText }) => {
                const visible =
                    (!term || searchText.includes(term)) &&
                    !(hideDeprecated && entry.operation.deprecated);
                controller.element.style.display = visible ? '' : 'none';
                if (visible) visibleCount++;
            });
            section.style.display = visibleCount ? '' : 'none';
            if (term && visibleCount) {
                section.classList.remove('rovalra-papi-collapsed');
            }
            totalVisible += visibleCount;
            if (!visibleCount) return;

            nav.appendChild(
                createNavItem(tag, visibleCount, () => {
                    section.classList.remove('rovalra-papi-collapsed');
                    section.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                }),
            );
        });

        if (!totalVisible) {
            nav.appendChild(
                el('div', 'rovalra-papi-nav-empty', tr('noEndpoints')),
            );
        }
    };

    sidebar.append(
        searchContainer,
        createRadioRow(tr('hideDeprecated'), false, (checked) => {
            hideDeprecated = checked;
            applyFilter();
        }),
        nav,
    );

    searchInput.addEventListener('input', applyFilter);
    applyFilter();

    body.append(sidebar, main);
    container.appendChild(body);

    const hashId = decodeURIComponent(window.location.hash.slice(1));
    const linked = hashId && operationControllers.get(hashId);
    if (linked) {
        linked.section.classList.remove('rovalra-papi-collapsed');
        linked.setExpanded(true);
        requestAnimationFrame(() =>
            linked.element.scrollIntoView({ block: 'start' }),
        );
    }
}

async function fetchSpec() {
    const token = await getValidAccessToken(false, false);
    const response = await callRobloxApi({
        endpoint: SPEC_ENDPOINT,
        isRovalraApi: true,
        skipAutoAuth: true,
        noCache: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (response.status === 401 || response.status === 403) {
        throw new Error(tr('noAccess'));
    }
    if (!response.ok) {
        throw new Error(tr('serverError', { status: response.status }));
    }

    const spec = await response.json();
    if (!spec?.paths) throw new Error(tr('invalidSpec'));
    return spec;
}

async function renderPage(contentDiv) {
    if (window.location.pathname.toLowerCase() !== PAGE_PATH) return;
    if (contentDiv.dataset.rovalraPrivateApiDocs === 'true') return;
    contentDiv.dataset.rovalraPrivateApiDocs = 'true';

    injectStyles();
    contentDiv.replaceChildren();
    contentDiv.style.position = 'relative';
    contentDiv.style.backgroundColor =
        'var(--rovalra-container-background-color)';
    contentDiv.style.minHeight = 'calc(100vh - 60px)';

    const shell = el('div', 'rovalra-papi-shell');
    contentDiv.appendChild(shell);
    renderMessage(shell, tr('loading'), { loading: true });
    removeHomeElement();

    try {
        const spec = await fetchSpec();
        renderSpec(shell, spec, { useToken: true });
    } catch (error) {
        renderMessage(shell, tr('loadFailed', { error: error.message }), {
            isError: true,
        });
    } finally {
        removeHomeElement();
    }
}

function createSidebarIcon() {
    return Icon({ material: true, size: 'medium', icon: 'text_snippet' });
}

export function init() {
    initSidebarLink({
        id: 'private-api-docs',
        path: PAGE_PATH,
        label: () => ts('navigation.rovalraApi'),
        createIcon: createSidebarIcon,
        settingKeys: [
            'privateApiDocsEnabled',
            'privateApiDocsSidebarLinkEnabled',
        ],
    });

    if (window.location.pathname.toLowerCase() !== PAGE_PATH) return;

    (async () => {
        if (!(await settings.privateApiDocsEnabled)) return;

        const contentDiv = document.querySelector('.content#content');
        if (contentDiv) renderPage(contentDiv);

        if (!observerActive) {
            observerActive = true;
            observeElement('.content#content', (cDiv) => {
                renderPage(cDiv);
            });
        }
    })().catch((error) => {
        console.error('RoValra: Failed to initialize private API docs.', error);
    });
}
