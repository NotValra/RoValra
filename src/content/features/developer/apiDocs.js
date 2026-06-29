import { observeElement } from '../../core/observer.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { settings } from '../../core/settings/getSettings.js';

const DOCS_INDEX_ENDPOINT = '/v1/roblox-docs';
const DOCS_BASE_URL = 'https://apis.rovalra.com';
const SWAGGER_STYLE_ID = 'rovalra-swagger-ui-style';
const SWAGGER_THEME_STYLE_ID = 'rovalra-swagger-theme-style';
const SWAGGER_BRIDGE_HEADER = 'x-rovalra-swagger-request';
const OLD_CAPTURED_APIS_STORAGE_KEY = 'rovalra_captured_apis';
const OLD_API_DOCS_STORAGE_KEY = 'EnableRobloxApiDocs';
let swaggerFetchBridgeInstalled = false;
let swaggerUiBundlePromise = null;

async function getSwaggerUiBundle() {
    if (!swaggerUiBundlePromise) {
        swaggerUiBundlePromise = import(
            'swagger-ui-dist/swagger-ui-bundle.js'
        ).then((module) => module.default || module);
    }

    return await swaggerUiBundlePromise;
}

function cleanupOldCapturedApisStorage() {
    chrome.storage.local.get(OLD_CAPTURED_APIS_STORAGE_KEY, (result) => {
        if (
            !Object.prototype.hasOwnProperty.call(
                result,
                OLD_CAPTURED_APIS_STORAGE_KEY,
            )
        ) {
            return;
        }

        chrome.storage.local.remove(OLD_CAPTURED_APIS_STORAGE_KEY);
    });
}

function cleanupOldApiDocsStorage() {
    chrome.storage.local.get(
        [OLD_API_DOCS_STORAGE_KEY, 'rovalra_settings'],
        (result) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    result,
                    OLD_API_DOCS_STORAGE_KEY,
                )
            ) {
                chrome.storage.local.remove(OLD_API_DOCS_STORAGE_KEY);
            }

            const settingsData = result.rovalra_settings;
            if (
                !settingsData ||
                !Object.prototype.hasOwnProperty.call(
                    settingsData,
                    OLD_API_DOCS_STORAGE_KEY,
                )
            ) {
                return;
            }

            const nextSettingsData = { ...settingsData };
            delete nextSettingsData[OLD_API_DOCS_STORAGE_KEY];
            chrome.storage.local.set({ rovalra_settings: nextSettingsData });
        },
    );
}

function removeHomeElement() {
    const homeElementToRemove = document.querySelector(
        'li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home',
    );
    if (homeElementToRemove) homeElementToRemove.remove();
}

function loadSwaggerStyles() {
    if (!document.getElementById(SWAGGER_STYLE_ID)) {
        const link = document.createElement('link');
        link.id = SWAGGER_STYLE_ID;
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('css/swagger-ui.css');
        document.head.appendChild(link);
    }

    if (!document.getElementById(SWAGGER_THEME_STYLE_ID)) {
        const link = document.createElement('link');
        link.id = SWAGGER_THEME_STYLE_ID;
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('css/swagger-theme.css');
        document.head.appendChild(link);
    }
}

function getDocsUrl(documentInfo) {
    if (!documentInfo?.docs_url) return '';
    try {
        return new URL(documentInfo.docs_url, DOCS_BASE_URL).toString();
    } catch {
        return '';
    }
}

function getDocumentLabel(documentInfo) {
    return documentInfo?.slug || documentInfo?.docs_url || 'Untitled API';
}

function getDocumentSearchText(documentInfo) {
    return [
        documentInfo?.label,
        documentInfo?.slug,
        documentInfo?.docs_url,
        documentInfo?.docsUrl,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function getDocumentGroup(documentInfo) {
    const slug = documentInfo?.slug || '';
    const [groupName, childName] = slug.split('/');
    if (!groupName || !childName) return null;
    return groupName;
}

async function fetchDocsIndex() {
    const data = await callRobloxApiJson({
        endpoint: DOCS_INDEX_ENDPOINT,
        isRovalraApi: true,
        skipAutoAuth: true,
        noCache: true,
    });

    if (data?.status !== 'ok' || !Array.isArray(data.documents)) {
        throw new Error('The docs index returned an unexpected response.');
    }

    return data.documents
        .map((documentInfo) => ({
            ...documentInfo,
            docsUrl: getDocsUrl(documentInfo),
            label: getDocumentLabel(documentInfo),
        }))
        .filter((documentInfo) => documentInfo.docsUrl);
}

async function fetchOpenApiSpec(documentInfo) {
    const url = new URL(documentInfo.docsUrl);
    return await callRobloxApiJson({
        endpoint: `${url.pathname}${url.search}`,
        isRovalraApi: true,
        skipAutoAuth: true,
        noCache: true,
    });
}

function renderStatus(container, message, tone = 'muted') {
    const color =
        tone === 'error' ? '#f93e3e' : 'var(--rovalra-secondary-text-color)';
    container.textContent = '';

    const status = document.createElement('div');
    status.style.padding = '40px';
    status.style.textAlign = 'center';
    status.style.color = color;
    status.textContent = message;

    container.appendChild(status);
}

function showWarning() {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary-md';
    confirmBtn.textContent = 'I Understand';

    const { close } = createOverlay({
        title: 'Warning: Advanced Feature',
        bodyContent: `
            <div class="flex flex-col gap-medium">
                <p>This page allows you to inspect and execute documented API requests.</p>
                <p><strong>Only execute requests if you understand what they do.</strong></p>
                <p>Misuse of this feature could lead to unwanted changes to your account.</p>
            </div>
        `,
        actions: [confirmBtn],
        preventBackdropClose: true,
    });

    confirmBtn.onclick = () => {
        close();
    };
}

function getRequestHeaderValue(headers, name) {
    if (!headers) return null;
    if (headers instanceof Headers) return headers.get(name);
    return headers[name] || headers[name.toLowerCase()] || null;
}

function removeRequestHeader(headers, name) {
    const normalizedName = name.toLowerCase();

    if (headers instanceof Headers) {
        const nextHeaders = new Headers(headers);
        nextHeaders.delete(name);
        return Object.fromEntries(nextHeaders.entries());
    }

    if (Array.isArray(headers)) {
        return headers.filter(
            ([key]) => String(key).toLowerCase() !== normalizedName,
        );
    }

    const nextHeaders = { ...(headers || {}) };
    Object.keys(nextHeaders).forEach((key) => {
        if (key.toLowerCase() === normalizedName) delete nextHeaders[key];
    });
    return nextHeaders;
}

async function getSwaggerRequestBody(input, init) {
    if (init?.body !== undefined) return init.body;
    if (input instanceof Request) {
        const clonedRequest = input.clone();
        return await clonedRequest.text();
    }
    return null;
}

function getRovalraSubdomain(hostname) {
    if (hostname === 'rovalra.com') return 'www';
    return hostname.replace('.rovalra.com', '') || 'apis';
}

async function callSwaggerRequestThroughApi(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input || '');
    const parsedUrl = new URL(url);
    const requestHeaders = request ? request.headers : init.headers;
    const headers = removeRequestHeader(requestHeaders, SWAGGER_BRIDGE_HEADER);
    const method = init.method || request?.method || 'GET';
    const isRovalraApi = parsedUrl.hostname.endsWith('rovalra.com');

    return await callRobloxApi({
        fullUrl: url,
        endpoint: `${parsedUrl.pathname}${parsedUrl.search}`,
        subdomain: isRovalraApi
            ? getRovalraSubdomain(parsedUrl.hostname)
            : parsedUrl.hostname.endsWith('.roblox.com')
              ? parsedUrl.hostname.replace('.roblox.com', '')
              : 'apis',
        method,
        isRovalraApi,
        headers,
        body: await getSwaggerRequestBody(input, init),
        credentials:
            init.credentials ||
            request?.credentials ||
            (isRovalraApi ? 'omit' : 'include'),
        noCache: true,
    });
}

function installSwaggerFetchBridge() {
    if (swaggerFetchBridgeInstalled) return;
    swaggerFetchBridgeInstalled = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        const requestHeaders =
            input instanceof Request ? input.headers : init.headers;
        if (getRequestHeaderValue(requestHeaders, SWAGGER_BRIDGE_HEADER)) {
            return await callSwaggerRequestThroughApi(input, init);
        }
        return await originalFetch(input, init);
    };
}

function getVisibleSwaggerSelects(swaggerContainer) {
    return Array.from(swaggerContainer.querySelectorAll('select')).filter(
        (select) => {
            if (select.dataset.rovalraDropdownEnhanced === 'true') return false;
            if (select.closest('.rovalra-dropdown-container')) return false;

            const rect = select.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },
    );
}

function enhanceSwaggerSelect(select) {
    if (select.dataset.rovalraDropdownEnhanced === 'true') return;
    if (select.closest('.rovalra-dropdown-container')) return;

    const selectRect = select.getBoundingClientRect();
    if (selectRect.width === 0 || selectRect.height === 0) return;

    const items = Array.from(select.options).map((option) => ({
        label: option.textContent?.trim() || option.value,
        value: option.value,
    }));

    if (!items.length) return;

    let isSyncingSelect = false;
    const dropdown = createDropdown({
        items,
        initialValue: select.value,
        placeholder: 'Select...',
        onValueChange: (value) => {
            isSyncingSelect = true;
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            isSyncingSelect = false;
        },
    });

    dropdown.element.classList.add('rovalra-swagger-dropdown');
    select.dataset.rovalraDropdownEnhanced = 'true';
    select.style.display = 'none';
    select.insertAdjacentElement('afterend', dropdown.element);

    select.addEventListener('change', () => {
        if (isSyncingSelect) return;
        isSyncingSelect = true;
        dropdown.setValue(select.value);
        isSyncingSelect = false;
    });
}

function enhanceSwaggerControls(swaggerContainer) {
    getVisibleSwaggerSelects(swaggerContainer).forEach(enhanceSwaggerSelect);
}

function watchSwaggerControls(swaggerContainer) {
    const selectObserver = observeElement('select', enhanceSwaggerSelect, {
        root: swaggerContainer,
        multiple: true,
    });

    requestAnimationFrame(() => {
        enhanceSwaggerControls(swaggerContainer);
    });

    return () => {
        selectObserver.disconnect();
    };
}

async function renderSwagger(swaggerContainer, spec) {
    const SwaggerUIBundle = await getSwaggerUiBundle();

    installSwaggerFetchBridge();
    swaggerContainer.innerHTML = '';
    swaggerContainer._rovalraStopSwaggerControlWatcher?.();
    swaggerContainer._rovalraStopSwaggerControlWatcher = null;

    SwaggerUIBundle({
        domNode: swaggerContainer,
        spec,
        deepLinking: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        displayRequestDuration: true,
        filter: true,
        persistAuthorization: false,
        tryItOutEnabled: false,
        validatorUrl: null,
        withCredentials: true,
        requestInterceptor: (request) => {
            const url = String(request.url || '');
            request.headers = request.headers || {};
            request.headers[SWAGGER_BRIDGE_HEADER] = 'true';

            if (url.includes('rovalra.com')) {
                request.credentials = 'omit';
            } else if (url.includes('roblox.com')) {
                request.credentials = 'include';
            }
            return request;
        },
        onComplete: () => {
            swaggerContainer._rovalraStopSwaggerControlWatcher =
                watchSwaggerControls(swaggerContainer);
        },
    });
}

function createDocsSidebar({ documents, activeDocument, onSelect }) {
    const sidebar = document.createElement('aside');
    sidebar.className = 'rovalra-api-docs-sidebar';

    const { container: searchContainer, input: searchInput } =
        createStyledInput({
            id: 'rovalra-api-docs-search',
            label: 'Search docs',
            placeholder: 'Search docs',
        });
    searchInput.type = 'search';
    searchContainer.classList.add('rovalra-api-docs-search');

    const list = document.createElement('div');
    list.className = 'rovalra-api-docs-list';

    let currentDocument = activeDocument;
    let searchTerm = '';
    const collapsedGroups = new Set();

    const createDocumentItem = (documentInfo, groupName = null) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className =
            'rovalra-api-docs-nav-item rovalra-dropdown-item relative clip group/interactable focus-visible:outline-focus disabled:outline-none foundation-web-menu-item flex items-center content-default text-truncate-split focus-visible:hover:outline-none cursor-pointer stroke-none bg-none text-align-x-left width-full text-body-medium padding-x-medium padding-y-small gap-x-medium radius-medium';
        item.dataset.value = documentInfo.docsUrl;
        item.setAttribute(
            'aria-pressed',
            String(documentInfo === currentDocument),
        );
        item.setAttribute(
            'data-selected',
            String(documentInfo === currentDocument),
        );

        const itemPresentationDiv = document.createElement('div');
        itemPresentationDiv.setAttribute('role', 'presentation');
        itemPresentationDiv.className =
            'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

        const itemTextWrapper = document.createElement('div');
        itemTextWrapper.className =
            'grow-1 text-truncate-split flex flex-col gap-y-xsmall';

        const itemText = document.createElement('span');
        itemText.className =
            'foundation-web-menu-item-title text-no-wrap text-truncate-split content-emphasis';
        itemText.textContent =
            groupName && documentInfo.slug?.startsWith(`${groupName}/`)
                ? documentInfo.slug.slice(groupName.length + 1)
                : documentInfo.label;
        itemTextWrapper.appendChild(itemText);

        if (documentInfo === currentDocument) {
            item.classList.add('is-active');
            item.classList.add('highlight-enabled');
        }

        item.append(itemPresentationDiv, itemTextWrapper);

        item.addEventListener('click', () => {
            currentDocument = documentInfo;
            renderList();
            onSelect(documentInfo);
        });

        return item;
    };

    const getGroupedDocuments = (visibleDocuments) => {
        const groups = new Map();
        const groupedDocuments = new Set();

        documents.forEach((documentInfo) => {
            const groupName = getDocumentGroup(documentInfo);
            if (!groupName) return;
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName).push(documentInfo);
        });

        const collapsibleGroups = Array.from(groups.entries())
            .filter(([, groupDocuments]) => groupDocuments.length >= 2)
            .map(([groupName, groupDocuments]) => {
                const visibleGroupDocuments = groupDocuments.filter(
                    (documentInfo) => visibleDocuments.includes(documentInfo),
                );

                visibleGroupDocuments.forEach((documentInfo) =>
                    groupedDocuments.add(documentInfo),
                );

                return {
                    groupName,
                    documents: visibleGroupDocuments,
                    total: groupDocuments.length,
                };
            })
            .filter((group) => group.documents.length > 0);

        return {
            collapsibleGroups,
            ungroupedDocuments: visibleDocuments.filter(
                (documentInfo) => !groupedDocuments.has(documentInfo),
            ),
        };
    };

    const createGroupSection = ({
        groupName,
        documents: groupDocuments,
        total,
    }) => {
        const section = document.createElement('div');
        section.className = 'rovalra-api-docs-group';

        const isCollapsed = !searchTerm && collapsedGroups.has(groupName);
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'rovalra-api-docs-group-header';
        header.setAttribute('aria-expanded', String(!isCollapsed));

        const label = document.createElement('span');
        label.className = 'rovalra-api-docs-group-label';
        label.textContent = groupName;

        const count = document.createElement('span');
        count.className = 'rovalra-api-docs-group-count';
        count.textContent = `${total}`;

        const arrow = document.createElement('span');
        arrow.className = 'rovalra-api-docs-group-arrow';
        arrow.textContent = isCollapsed ? '>' : 'v';

        header.append(label, count, arrow);
        header.addEventListener('click', () => {
            if (collapsedGroups.has(groupName)) {
                collapsedGroups.delete(groupName);
            } else {
                collapsedGroups.add(groupName);
            }
            renderList();
        });

        section.appendChild(header);

        if (!isCollapsed) {
            const children = document.createElement('div');
            children.className = 'rovalra-api-docs-group-children';
            groupDocuments.forEach((documentInfo) => {
                children.appendChild(
                    createDocumentItem(documentInfo, groupName),
                );
            });
            section.appendChild(children);
        }

        return section;
    };

    const renderList = () => {
        list.textContent = '';

        const visibleDocuments = documents.filter((documentInfo) =>
            getDocumentSearchText(documentInfo).includes(searchTerm),
        );

        if (!visibleDocuments.length) {
            const empty = document.createElement('div');
            empty.className = 'rovalra-api-docs-empty';
            empty.textContent = 'No docs found.';
            list.appendChild(empty);
            return;
        }

        const { collapsibleGroups, ungroupedDocuments } =
            getGroupedDocuments(visibleDocuments);

        collapsibleGroups.forEach((group) => {
            list.appendChild(createGroupSection(group));
        });

        ungroupedDocuments.forEach((documentInfo) => {
            list.appendChild(createDocumentItem(documentInfo));
        });
    };

    searchInput.addEventListener('input', () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        renderList();
    });

    renderList();
    sidebar.append(searchContainer, list);

    return {
        element: sidebar,
        setActiveDocument(documentInfo) {
            currentDocument = documentInfo;
            renderList();
        },
    };
}

async function renderDocsPage(contentDiv, suppressWarning = false) {
    if (window.location.pathname.toLowerCase() !== '/docs') return;

    loadSwaggerStyles();

    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';
    contentDiv.style.backgroundColor =
        'var(--rovalra-container-background-color)';
    contentDiv.style.minHeight = 'calc(100vh - 60px)';

    if (!suppressWarning) showWarning();

    const container = document.createElement('div');
    container.className = 'rovalra-api-docs-shell';
    container.style.padding = '20px';
    container.style.maxWidth = '1440px';
    container.style.margin = '0 auto';

    const header = document.createElement('div');
    header.style.marginBottom = '24px';
    header.style.borderBottom = '1px solid var(--rovalra-secondary-text-color)';
    header.style.paddingBottom = '20px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.gap = '20px';
    header.style.flexWrap = 'wrap';

    const titleGroup = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.textContent = 'RoValra API Documentation';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2.5em';
    h1.style.margin = '0 0 10px 0';
    h1.style.color = 'var(--rovalra-main-text-color)';

    const p = document.createElement('p');
    p.textContent = 'OpenAPI documentation loaded from apis.rovalra.com.';
    p.style.color = 'var(--rovalra-secondary-text-color)';
    p.style.margin = '0';

    titleGroup.appendChild(h1);
    titleGroup.appendChild(p);

    const swaggerContainer = document.createElement('div');
    swaggerContainer.className = 'rovalra-api-docs-swagger';
    swaggerContainer.style.minHeight = '420px';

    const docsBody = document.createElement('div');
    docsBody.className = 'rovalra-api-docs-body';

    header.appendChild(titleGroup);
    container.appendChild(header);
    container.appendChild(docsBody);
    contentDiv.appendChild(container);

    renderStatus(swaggerContainer, 'Loading API documentation...');

    try {
        const documents = await fetchDocsIndex();
        if (!documents.length) {
            renderStatus(swaggerContainer, 'No API documents are available.');
            return;
        }

        let activeDocument = documents[0];
        let sidebarController = null;
        const renderDocument = async (documentInfo) => {
            activeDocument = documentInfo;
            sidebarController?.setActiveDocument(activeDocument);
            renderStatus(swaggerContainer, 'Loading API document...');
            try {
                const spec = await fetchOpenApiSpec(activeDocument);
                await renderSwagger(swaggerContainer, spec);
            } catch (error) {
                renderStatus(
                    swaggerContainer,
                    `Failed to load ${activeDocument.label}: ${error.message}`,
                    'error',
                );
            }
        };

        sidebarController = createDocsSidebar({
            documents,
            activeDocument,
            onSelect: renderDocument,
        });
        docsBody.append(sidebarController.element, swaggerContainer);

        await renderDocument(activeDocument);
    } catch (error) {
        renderStatus(
            swaggerContainer,
            `Failed to load API documentation: ${error.message}`,
            'error',
        );
    } finally {
        removeHomeElement();
    }
}

export function init() {
    cleanupOldCapturedApisStorage();
    cleanupOldApiDocsStorage();

    if (window.location.pathname.toLowerCase() !== '/docs') return;

    (async () => {
        const docsEnabled = await settings.EnableRobloxApiDocsv2;
        const sidebarLinkEnabled = await settings.apiDocsSidebarLinkEnabled;
        if (!docsEnabled && !sidebarLinkEnabled) return;

        const contentDiv = document.querySelector('.content#content');
        if (contentDiv) {
            renderDocsPage(contentDiv);
        } else {
            observeElement('.content#content', (cDiv) => {
                renderDocsPage(cDiv);
            });
        }
    })().catch((error) => {
        console.error('RoValra: Failed to initialize API docs.', error);
    });
}
