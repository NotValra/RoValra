import { observeElement } from '../../core/observer.js';
import { callRobloxApi } from '../../core/api.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createOverlay } from '../../core/ui/overlay.js';
import DOMPurify from 'dompurify';

const CAPTURED_APIS_KEY = 'rovalra_captured_apis';

function removeHomeElement() {
    const homeElementToRemove = document.querySelector('li.cursor-pointer.btr-nav-node-header_home.btr-nav-header_home');
    if (homeElementToRemove) homeElementToRemove.remove();
}

function renderDocsPage(contentDiv, suppressWarning = false) {
    if (window.location.pathname.toLowerCase() !== '/docs') return;
    
    contentDiv.innerHTML = '';
    contentDiv.style.position = 'relative';
    contentDiv.style.backgroundColor = 'var(--rovalra-container-background-color)';
    contentDiv.style.minHeight = 'calc(100vh - 60px)';
    
    if (!suppressWarning) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn-primary-md';
        confirmBtn.textContent = 'I Understand';

        const { close } = createOverlay({
            title: 'Warning: Advanced Feature',
            bodyContent: `
                <div class="flex flex-col gap-medium">
                    <p>This page allows you to execute API requests.</p>
                    <p><strong>These requests are performed using your account credentials.</strong></p>
                    <p>Do not execute any requests if you do not understand what they do. Misuse of this feature could lead to unwanted changes to your account.</p>
                </div>
            `,
            actions: [confirmBtn],
            preventBackdropClose: true
        });

        confirmBtn.onclick = () => {
            close();
        };
    }

    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.maxWidth = '1200px';
    container.style.margin = '0 auto';
    
    const header = document.createElement('div');
    header.style.marginBottom = '30px';
    header.style.borderBottom = '1px solid var(--rovalra-secondary-text-color)';
    header.style.paddingBottom = '20px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const titleGroup = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.textContent = 'RoValra API Documentation';
    h1.style.fontWeight = '800';
    h1.style.fontSize = '2.5em';
    h1.style.margin = '0 0 10px 0';
    h1.style.color = 'var(--rovalra-main-text-color)';
    
    const p = document.createElement('p');
    p.textContent = 'Captured API requests from your current session.';
    p.style.color = 'var(--rovalra-secondary-text-color)';
    p.style.margin = '0';
    
    titleGroup.appendChild(h1);
    titleGroup.appendChild(p);
    
    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '15px';

    const dataSize = document.createElement('span');
    dataSize.style.color = 'var(--rovalra-secondary-text-color)';
    dataSize.style.fontSize = '14px';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Data';
    clearBtn.className = 'btn-secondary-md';
    clearBtn.style.padding = '8px 16px';
    clearBtn.style.cursor = 'pointer';
    clearBtn.onclick = () => {
        chrome.storage.local.remove(CAPTURED_APIS_KEY, () => {
            renderDocsPage(contentDiv, true);
        });
    };
    
    headerRight.appendChild(dataSize);
    headerRight.appendChild(clearBtn);

    header.appendChild(titleGroup);
    header.appendChild(headerRight);
    container.appendChild(header);
    contentDiv.appendChild(container);

    chrome.storage.local.get(CAPTURED_APIS_KEY, (result) => {
        const data = result[CAPTURED_APIS_KEY] || {};
        
        const size = JSON.stringify(data).length;
        let formattedSize = '0 B';
        if (size > 0) {
            const i = Math.floor(Math.log(size) / Math.log(1024));
            formattedSize = (size / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
        }
        dataSize.textContent = formattedSize;

        const subdomains = Object.keys(data).sort();

        if (subdomains.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.style.textAlign = 'center';
            emptyState.style.padding = '40px';
            emptyState.style.color = 'var(--rovalra-secondary-text-color)';
            emptyState.innerHTML = '<h3>No API calls captured yet</h3><p>Browse Roblox to populate this list.</p>';
            container.appendChild(emptyState);
            removeHomeElement();
            return;
        }


        const controlsContainer = document.createElement('div');
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '15px';
        controlsContainer.style.marginBottom = '20px';
        controlsContainer.style.alignItems = 'center';
        controlsContainer.style.flexWrap = 'wrap';
        let activeSubdomain = subdomains[0];
        let searchTerm = '';

        const endpointsContainer = document.createElement('div');

        const renderEndpoints = (subdomain, filter = '') => {
            endpointsContainer.innerHTML = '';
            const rawEndpoints = data[subdomain];
            const endpoints = {};

            Object.keys(rawEndpoints).forEach(rawPath => {
                const normalizedPath = rawPath
                    .split('?')[0]
                    .split('/')
                    .map(segment => {
                        if (/^\d+$/.test(segment)) return '{id}';
                        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return '{uuid}';
                        return segment;
                    })
                    .join('/');

                if (!endpoints[normalizedPath]) {
                    endpoints[normalizedPath] = {};
                }

                const methods = rawEndpoints[rawPath];
                Object.keys(methods).forEach(method => {
                    if (!endpoints[normalizedPath][method]) {
                        endpoints[normalizedPath][method] = {
                            ...methods[method],
                            exampleEndpoint: rawPath
                        };
                    }
                });
            });

            let endpointKeys = Object.keys(endpoints).sort();
            if (filter) {
                const lowerFilter = filter.toLowerCase();
                endpointKeys = endpointKeys.filter(key => key.toLowerCase().includes(lowerFilter));
            }

            if (endpointKeys.length === 0) {
                endpointsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--rovalra-secondary-text-color);">No endpoints found matching filter.</div>';
                return;
            }

            const groups = {};
            endpointKeys.forEach(endpoint => {
                const parts = endpoint.split('/');
                const groupName = parts.length > 1 && parts[1] ? parts[1] : 'General';
                if (!groups[groupName]) groups[groupName] = [];
                groups[groupName].push(endpoint);
            });

            Object.keys(groups).sort().forEach(groupName => {
                const groupEndpoints = groups[groupName];
                
                const section = document.createElement('div');
                section.style.marginBottom = '20px';

                const header = document.createElement('div');
                header.style.padding = '10px 15px';
                header.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
                header.style.borderRadius = '6px';
                header.style.cursor = 'pointer';
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';
                header.style.marginBottom = '10px';
                header.style.userSelect = 'none';

                const title = document.createElement('span');
                title.textContent = groupName;
                title.style.fontWeight = 'bold';
                title.style.fontSize = '18px';
                title.style.color = 'var(--rovalra-main-text-color)';

                const count = document.createElement('span');
                count.textContent = `${groupEndpoints.length} endpoints`;
                count.style.fontSize = '12px';
                count.style.color = 'var(--rovalra-secondary-text-color)';
                count.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
                count.style.padding = '2px 8px';
                count.style.borderRadius = '10px';

                const leftSide = document.createElement('div');
                leftSide.style.display = 'flex';
                leftSide.style.alignItems = 'center';
                leftSide.style.gap = '10px';
                leftSide.appendChild(title);
                leftSide.appendChild(count);

                const arrow = document.createElement('span');
                arrow.textContent = '▼';
                arrow.style.transition = 'transform 0.2s';
                
                header.appendChild(leftSide);
                header.appendChild(arrow);

                const content = document.createElement('div');
                content.style.display = 'block';

                header.onclick = () => {
                    const isCollapsed = content.style.display === 'none';
                    content.style.display = isCollapsed ? 'block' : 'none';
                    arrow.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
                };

                section.appendChild(header);
                section.appendChild(content);
                endpointsContainer.appendChild(section);

                groupEndpoints.forEach(endpoint => {
                const methods = endpoints[endpoint];
                Object.keys(methods).forEach(method => {
                    const details = methods[method];
                    const card = document.createElement('div');
                    card.style.marginBottom = '15px';
                    card.style.borderRadius = '4px';
                    card.style.overflow = 'hidden';
                    card.style.border = '1px solid';
                    
                    let color = '#888';
                    let bg = '#eee';
                    
                    switch(method) {
                        case 'GET': color = '#61affe'; bg = 'rgba(97, 175, 254, 0.1)'; break;
                        case 'POST': color = '#49cc90'; bg = 'rgba(73, 204, 144, 0.1)'; break;
                        case 'PUT': color = '#fca130'; bg = 'rgba(252, 161, 48, 0.1)'; break;
                        case 'DELETE': color = '#f93e3e'; bg = 'rgba(249, 62, 62, 0.1)'; break;
                        case 'PATCH': color = '#50e3c2'; bg = 'rgba(80, 227, 194, 0.1)'; break;
                    }
                    
                    card.style.borderColor = color;

                    const cardHeader = document.createElement('div');
                    cardHeader.style.backgroundColor = bg;
                    cardHeader.style.padding = '10px 15px';
                    cardHeader.style.display = 'flex';
                    cardHeader.style.alignItems = 'center';
                    cardHeader.style.cursor = 'pointer';
                    cardHeader.style.userSelect = 'none';
                    
                    const methodBadge = document.createElement('span');
                    methodBadge.textContent = method;
                    methodBadge.style.backgroundColor = color;
                    methodBadge.style.color = '#fff';
                    methodBadge.style.padding = '6px 15px';
                    methodBadge.style.borderRadius = '3px';
                    methodBadge.style.fontWeight = '700';
                    methodBadge.style.fontSize = '14px';
                    methodBadge.style.minWidth = '80px';
                    methodBadge.style.textAlign = 'center';
                    methodBadge.style.marginRight = '15px';
                    
                    const pathSpan = document.createElement('span');
                    pathSpan.textContent = endpoint;
                    pathSpan.style.fontFamily = 'monospace';
                    pathSpan.style.fontSize = '16px';
                    pathSpan.style.color = 'var(--rovalra-main-text-color)';
                    pathSpan.style.wordBreak = 'break-all';
                    
                    cardHeader.appendChild(methodBadge);
                    cardHeader.appendChild(pathSpan);
                    
                    const cardBody = document.createElement('div');
                    cardBody.style.display = 'none';
                    cardBody.style.padding = '20px';
                    cardBody.style.backgroundColor = 'var(--rovalra-container-background-color)';
                    cardBody.style.borderTop = `1px solid ${color}`;
                    
                    const tryItOutTitle = document.createElement('h4');
                    tryItOutTitle.textContent = 'Try it out';
                    tryItOutTitle.style.marginTop = '0';
                    cardBody.appendChild(tryItOutTitle);

                    const urlInput = document.createElement('input');
                    urlInput.type = 'text';
                    
                    const baseUrl = subdomain === 'rovalra.com' ? 'https://apis.rovalra.com' : `https://${subdomain}.roblox.com`;
                    urlInput.value = baseUrl + (details.exampleEndpoint || endpoint);
                    
                    urlInput.className = 'form-control input-field';
                    urlInput.style.width = '100%';
                    urlInput.style.marginBottom = '10px';
                    urlInput.style.fontFamily = 'monospace';
                    cardBody.appendChild(urlInput);

                    let bodyInput = null;
                    if (method !== 'GET' && method !== 'HEAD') {
                        const bodyLabel = document.createElement('div');
                        bodyLabel.textContent = 'Request Body (JSON):';
                        bodyLabel.style.marginBottom = '5px';
                        bodyLabel.style.fontWeight = 'bold';
                        cardBody.appendChild(bodyLabel);

                        bodyInput = document.createElement('textarea');
                        bodyInput.className = 'form-control input-field';
                        bodyInput.style.width = '100%';
                        bodyInput.style.minHeight = '100px';
                        bodyInput.style.fontFamily = 'monospace';
                        bodyInput.style.marginBottom = '10px';
                        if (details.exampleBody) {
                            bodyInput.value = typeof details.exampleBody === 'string' ? details.exampleBody : JSON.stringify(details.exampleBody, null, 2);
                        }
                        cardBody.appendChild(bodyInput);
                    }

                    const executeBtn = document.createElement('button');
                    executeBtn.textContent = 'Execute';
                    executeBtn.className = 'btn-primary-md';
                    executeBtn.style.marginRight = '10px'; 

                    if (subdomain === 'rovalra.com' && endpoint.includes('/process_servers')) {
                        executeBtn.disabled = true;
                        executeBtn.textContent = 'Execution Disabled';
                        executeBtn.className = 'btn-control-md'; 
                        executeBtn.style.opacity = '0.6';
                    }
                    
                    const responseContainer = document.createElement('div');
                    responseContainer.style.marginTop = '15px';
                    responseContainer.style.display = 'none';

                    executeBtn.onclick = async () => {
                        responseContainer.style.display = 'block';
                        responseContainer.innerHTML = 'Loading...';
                        
                        try {
                            let targetUrl = urlInput.value;
                            let targetEndpoint = targetUrl;
                            try {
                                const u = new URL(targetUrl);
                                targetEndpoint = u.pathname + u.search;
                            } catch(e) {}

                            const reqOptions = {
                                subdomain: subdomain === 'rovalra.com' ? 'apis' : subdomain,
                                endpoint: targetEndpoint,
                                method: method,
                                isRovalraApi: subdomain === 'rovalra.com'
                            };

                            if (bodyInput && bodyInput.value) {
                                try {
                                    reqOptions.body = JSON.parse(bodyInput.value);
                                } catch (e) {
                                    reqOptions.body = bodyInput.value;
                                }
                            }

                            const response = await callRobloxApi(reqOptions);
                            const statusColor = response.ok ? '#49cc90' : '#f93e3e';
                            
                            let responseText = '';
                            try {
                                const json = await response.json();
                                responseText = JSON.stringify(json, null, 2);
                            } catch (e) {
                                responseText = await response.text();
                            }

                            const safeStatusText = DOMPurify.sanitize(response.statusText);
                            const safeResponseText = DOMPurify.sanitize(responseText);

                            responseContainer.innerHTML = `
                                <div style="margin-bottom: 5px;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${response.status} ${safeStatusText}</span></div>
                                <pre style="background: rgba(0,0,0,0.1); padding: 10px; border-radius: 4px; overflow: auto; max-height: 400px;">${safeResponseText}</pre>
                            `;
                        } catch (err) {
                            responseContainer.innerHTML = `<div style="color: #f93e3e;">Error: ${err.message}</div>`;
                        }
                    };

                    cardBody.appendChild(executeBtn);
                    cardBody.appendChild(responseContainer);
                    
                    cardHeader.onclick = () => {
                        cardBody.style.display = cardBody.style.display === 'none' ? 'block' : 'none';
                    };
                    
                    card.appendChild(cardHeader);
                    card.appendChild(cardBody);
                    content.appendChild(card);
                });
            });
            });
        };

        const dropdownItems = subdomains.map(sub => ({
            label: sub === 'rovalra.com' ? 'apis.rovalra.com' : `${sub}.roblox.com`,
            value: sub
        }));

        const { element: dropdownElement } = createDropdown({
            items: dropdownItems,
            initialValue: activeSubdomain,
            onValueChange: (value) => {
                activeSubdomain = value;
                renderEndpoints(activeSubdomain, searchTerm);
            }
        });
        dropdownElement.style.minWidth = '250px';
        dropdownElement.style.zIndex = '10';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search endpoints...';
        searchInput.className = 'form-control input-field';
        searchInput.style.flex = '1';
        searchInput.style.minWidth = '200px';
        searchInput.style.padding = '8px 12px';
        searchInput.style.backgroundColor = 'var(--rovalra-container-background-color)';
        searchInput.style.border = '1px solid var(--rovalra-secondary-text-color)';
        searchInput.style.color = 'var(--rovalra-main-text-color)';
        searchInput.style.borderRadius = '8px';
        searchInput.style.height = '38px';

        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            renderEndpoints(activeSubdomain, searchTerm);
        });

        controlsContainer.appendChild(dropdownElement);
        controlsContainer.appendChild(searchInput);
        
        container.appendChild(controlsContainer);
        container.appendChild(endpointsContainer);

        renderEndpoints(activeSubdomain);
    });
    
    removeHomeElement();
}

export function init() {
    if (window.location.pathname.toLowerCase() !== '/docs') return;
    
    chrome.storage.local.get('EnableRobloxApiDocs', (result) => {
        if (!result.EnableRobloxApiDocs) return;

        const contentDiv = document.querySelector('.content#content');
        if (contentDiv) {
            renderDocsPage(contentDiv);
        } else {
            observeElement('.content#content', (cDiv) => {
                renderDocsPage(cDiv);
            });
        }
    });
}