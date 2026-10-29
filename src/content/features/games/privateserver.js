import { observeElement, observeAttributes } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { createButton } from '../../core/ui/buttons.js';
import { callRobloxApi, callRobloxApiJson } from '../../core/api.js';
import { enhanceServer } from '../../core/games/servers/serverdetails.js';
import { loadDatacenterMap, serverIpMap } from '../../core/regions.js';
import { t, ts } from '../../core/locale/i18n.js';
import DOMPurify from 'dompurify';
import { createToggle } from '../../core/ui/general/toggle.js';
import { createDropdown } from '../../core/ui/dropdown.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { getAssets } from '../../core/assets.js';
import { getUserProfileData } from '../../core/apis/users.js';

const privateServerContext = {
    serverLocations: {},
    serverUptimes: {},
    serverPerformanceCache: {},
    vipStatusCache: {},
    uptimeBatch: new Set(),
    serverIpMap: {},
    processUptimeBatch: async () => {},
};

const vipServerDetailsCache = new Map();
let showFriendsAllowedToggle = true;

export async function getVipServerDetails(vipServerId) {
    if (vipServerDetailsCache.has(vipServerId))
        return vipServerDetailsCache.get(vipServerId);
    try {
        const res = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${vipServerId}`,
        });
        const data = res.ok ? await res.json() : null;
        vipServerDetailsCache.set(vipServerId, data);
        return data;
    } catch {
        vipServerDetailsCache.set(vipServerId, null);
        return null;
    }
}

const PRIVATE_SECTION_SELECTOR = '[data-rovalra-section-type="private"]';
const PRIVATE_ROW_SELECTOR =
    '.flex.items-center.justify-between.padding-y-medium';
const SORT_KEYS = ['default', 'players', 'name', 'owner'];
const PLAYER_FILTERS = ['any', 'hasPlayers', 'empty'];
const OWNER_FILTERS = ['any', 'mine', 'others'];

let sort = { key: 'default', descending: true };
let filters = { players: 'any', owner: 'any' };
let servers = new Map();
let serversPlaceId = null;
let loadToken = 0;
let loadPromise = null;
const pendingSections = new Set();

function isDefaultView() {
    return (
        sort.key === 'default' &&
        filters.players === 'any' &&
        filters.owner === 'any'
    );
}

function countActive() {
    return (
        (sort.key === 'default' ? 0 : 1) +
        (filters.players === 'any' ? 0 : 1) +
        (filters.owner === 'any' ? 0 : 1)
    );
}

function ensureServersLoaded(placeId) {
    if (serversPlaceId === placeId && servers.size) return Promise.resolve();
    if (!loadPromise || loadPromise.placeId !== placeId) {
        loadPromise = loadServers(placeId).finally(() => {
            if (loadPromise?.placeId === placeId) loadPromise = null;
        });
        loadPromise.placeId = placeId;
    }
    return loadPromise;
}

function scheduleApplyView(section) {
    if (isDefaultView() || pendingSections.has(section)) return;
    pendingSections.add(section);
    queueMicrotask(() => {
        pendingSections.delete(section);
        applyView(section);
    });
}

async function loadServers(placeId) {
    const token = ++loadToken;
    const next = new Map();
    let cursor = '';
    do {
        const data = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/${placeId}/private-servers?limit=100${cursor ? `&cursor=${cursor}` : ''}`,
        }).catch(() => null);
        (data?.data || []).forEach((server) =>
            next.set(String(server.vipServerId), server),
        );
        cursor = data?.nextPageCursor;
    } while (cursor);
    if (token === loadToken) {
        servers = next;
        serversPlaceId = placeId;
    }
    return servers;
}

function getSortValue(server, key) {
    if (key === 'players') return server.playing || 0;
    if (key === 'name') return (server.name || '').toLowerCase();
    if (key === 'owner') return (server.owner?.name || '').toLowerCase();
    return 0;
}

function matchesFilters(server, row, myUserId) {
    if (server) {
        if (filters.players === 'hasPlayers' && !(server.playing > 0))
            return false;
        if (filters.players === 'empty' && server.playing > 0) return false;
    }
    const ownerAttr = row.getAttribute('data-rovalra-is-owner');
    const isMine = server
        ? String(server.owner?.id) === String(myUserId)
        : ownerAttr === 'true';
    if (!server && ownerAttr === null) return true;
    if (filters.owner === 'mine' && !isMine) return false;
    if (filters.owner === 'others' && isMine) return false;
    return true;
}

function getRows(section) {
    return [
        ...section.querySelectorAll(
            `${PRIVATE_ROW_SELECTOR}[data-private-server-id]`,
        ),
    ];
}

async function applyView(section) {
    const rows = getRows(section);
    if (isDefaultView()) {
        rows.forEach((row) => {
            row.style.removeProperty('--rovalra-private-server-order');
            delete row.dataset.rovalraPrivateServerHidden;
        });
        return;
    }

    const placeId = getPlaceIdFromUrl();
    await ensureServersLoaded(placeId);
    const myUserId = await getAuthenticatedUserId();
    if (isDefaultView()) return;

    const entries = rows.map((row, index) => ({
        row,
        index,
        server: servers.get(row.getAttribute('data-private-server-id')),
    }));
    const sorted =
        sort.key === 'default'
            ? entries
            : [...entries].sort((a, b) => {
                  if (!a.server || !b.server) return a.index - b.index;
                  const first = getSortValue(a.server, sort.key);
                  const second = getSortValue(b.server, sort.key);
                  const result =
                      typeof first === 'string'
                          ? first.localeCompare(second)
                          : first - second;
                  return (
                      (sort.descending ? -result : result) || a.index - b.index
                  );
              });

    sorted.forEach(({ row, server }, order) => {
        row.style.setProperty('--rovalra-private-server-order', String(order));
        if (!matchesFilters(server, row, myUserId)) {
            row.dataset.rovalraPrivateServerHidden = 'true';
        } else {
            delete row.dataset.rovalraPrivateServerHidden;
        }
    });
}

function createFiltersSectionTitle(text) {
    const title = document.createElement('div');
    title.className = 'text-heading-small content-emphasis';
    title.textContent = text;
    return title;
}

function createChoice(options, value, onChange) {
    return createPillToggle({
        options: options.map((option) => ({
            text: ts(`privateServer.filters.${option.label}`),
            value: option.value,
        })),
        initialValue: value,
        onChange,
    });
}

function createFiltersPanel(onApply) {
    let draftSort = { ...sort };
    let draftFilters = { ...filters };
    let destroyDropdown = null;

    const panel = document.createElement('div');
    panel.className =
        'rovalra-private-server-filters-panel foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    panel.addEventListener('click', (event) => event.stopPropagation());

    const header = document.createElement('div');
    header.className = 'rovalra-private-server-filters-header';
    const logo = document.createElement('img');
    logo.src = getAssets().rovalraIcon;
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.alt = '';
    logo.width = 24;
    logo.height = 24;
    const title = document.createElement('span');
    title.className = 'text-heading-small content-emphasis';
    title.textContent = ts('privateServer.filters.title');
    header.append(logo, title);

    const body = document.createElement('div');
    body.className = 'rovalra-private-server-filters-body';

    const renderBody = () => {
        destroyDropdown?.();
        const directionSlot = document.createElement('div');
        const renderDirection = () => {
            directionSlot.replaceChildren(
                createChoice(
                    [
                        { label: 'descending', value: 'desc' },
                        { label: 'ascending', value: 'asc' },
                    ],
                    draftSort.descending ? 'desc' : 'asc',
                    (value) => (draftSort.descending = value === 'desc'),
                ),
            );
            directionSlot.hidden = draftSort.key === 'default';
        };
        const dropdown = createDropdown({
            items: SORT_KEYS.map((key) => ({
                value: key,
                label: ts(`privateServer.filters.sort.${key}`),
            })),
            initialValue: draftSort.key,
            onValueChange: (value) => {
                draftSort.key = value;
                renderDirection();
            },
        });
        destroyDropdown = dropdown.destroy;
        renderDirection();

        body.replaceChildren(
            createFiltersSectionTitle(ts('privateServer.filters.sortTitle')),
            dropdown.element,
            directionSlot,
            createFiltersSectionTitle(ts('privateServer.filters.playersTitle')),
            createChoice(
                PLAYER_FILTERS.map((value) => ({ label: value, value })),
                draftFilters.players,
                (value) => (draftFilters.players = value),
            ),
            createFiltersSectionTitle(ts('privateServer.filters.ownerTitle')),
            createChoice(
                OWNER_FILTERS.map((value) => ({
                    label: value === 'any' ? 'anyone' : value,
                    value,
                })),
                draftFilters.owner,
                (value) => (draftFilters.owner = value),
            ),
        );
    };

    const actions = document.createElement('div');
    actions.className = 'rovalra-private-server-filters-actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn-secondary-md btn-min-width';
    resetButton.textContent = ts('privateServer.filters.reset');
    resetButton.addEventListener('click', () => {
        draftSort = { key: 'default', descending: true };
        draftFilters = { players: 'any', owner: 'any' };
        renderBody();
    });
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'btn-cta-md btn-min-width';
    applyButton.textContent = ts('privateServer.filters.apply');
    applyButton.addEventListener('click', () =>
        onApply({ ...draftSort }, { ...draftFilters }),
    );
    actions.append(resetButton, applyButton);

    renderBody();
    panel.append(header, body, actions);
    panel.rovalraDestroy = () => destroyDropdown?.();
    return panel;
}

function attachPrivateServerFilters(section) {
    const header = section?.firstElementChild;
    if (header?.firstElementChild?.tagName !== 'H3') return;
    if (header.querySelector('.rovalra-private-server-filters')) return;
    header.classList.add('rovalra-private-server-filters-host');

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-private-server-filters';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className =
        'foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer flex items-center justify-center stroke-none padding-y-none select-none radius-medium text-label-small height-800 padding-x-small bg-action-standard content-action-standard rovalra-private-server-filters-toggle';
    const hover = document.createElement('div');
    hover.setAttribute('role', 'presentation');
    hover.className =
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';
    const content = document.createElement('span');
    content.className = 'flex items-center min-width-0 gap-xsmall';
    const icon = document.createElement('icon');
    icon.setAttribute('material', '');
    icon.setAttribute('size', '16px');
    icon.textContent = 'filter_list';
    const label = document.createElement('span');
    label.className = 'padding-y-xsmall text-truncate-end text-no-wrap';
    label.textContent = ts('privateServer.filters.button');
    const count = document.createElement('span');
    count.className = 'rovalra-private-server-filters-count';
    content.append(icon, label, count);
    toggleButton.append(hover, content);

    const updateToggle = () => {
        const active = countActive();
        toggleButton.classList.toggle('rovalra-active', active > 0);
        count.hidden = active === 0;
        count.textContent = String(active);
    };
    updateToggle();

    let panel = null;
    const closePanel = () => {
        panel?.rovalraDestroy?.();
        panel?.remove();
        panel = null;
        toggleButton.setAttribute('aria-expanded', 'false');
    };

    toggleButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (panel) {
            closePanel();
            return;
        }
        panel = createFiltersPanel((nextSort, nextFilters) => {
            sort = nextSort;
            filters = nextFilters;
            servers = new Map();
            updateToggle();
            closePanel();
            applyView(section);
        });
        toggleButton.setAttribute('aria-expanded', 'true');
        wrapper.appendChild(panel);
    });

    const handleDocumentClick = (event) => {
        if (!wrapper.isConnected) {
            document.removeEventListener('click', handleDocumentClick);
            return;
        }
        if (panel && !wrapper.contains(event.target)) closePanel();
    };
    document.addEventListener('click', handleDocumentClick);

    wrapper.appendChild(toggleButton);
    header.appendChild(wrapper);
    if (!isDefaultView()) applyView(section);
}

let hasPlusPromise = null;
function hasRobloxPlus() {
    hasPlusPromise ??= getAuthenticatedUserId()
        .then((userId) => (userId ? getUserProfileData([userId]) : null))
        .then(
            (data) => data?.profileDetails?.[0]?.hasRobloxSubscription === true,
        )
        .catch(() => false);
    return hasPlusPromise;
}

async function addPlusIcon(row) {
    if (!row.querySelector('.icon-filled-person-play')) return;
    if (!row.closest(PRIVATE_SECTION_SELECTOR)) return;
    const subtitle = row.querySelector('.content-muted');
    if (!subtitle || subtitle.dataset.rovalraPlusIncluded) return;
    if (!(await hasRobloxPlus())) return;

    subtitle.dataset.rovalraPlusIncluded = 'true';
    const plusIcon = document.createElement('span');
    plusIcon.setAttribute('role', 'presentation');
    plusIcon.className =
        'icon icon-regular-roblox-plus size-[var(--icon-size-small)] rovalra-private-server-plus-icon';
    subtitle.replaceChildren(
        `${ts('privateServer.filters.includedWith')} `,
        plusIcon,
        ` ${ts('privateServer.filters.plus')}`,
    );
}

function onPrivateServerRowAdded(row) {
    const section = row.closest(PRIVATE_SECTION_SELECTOR);
    if (section?.querySelector(PRIVATE_SECTION_SELECTOR)) return;
    if (!section) return;
    addPlusIcon(row);
    if (row.hasAttribute('data-private-server-id')) scheduleApplyView(section);
}

function onPrivateServerIdReady(row) {
    const section = row.closest(PRIVATE_SECTION_SELECTOR);
    if (section) scheduleApplyView(section);
}

export async function init() {
    const userId = await getAuthenticatedUserId();
    if (!userId) return;

    try {
        await loadDatacenterMap();
        privateServerContext.serverIpMap = serverIpMap;
    } catch (e) {}

    chrome.storage.local.get(
        {
            PrivateQuickLinkCopy: true,
            ServerlistmodificationsEnabled: true,
            privateServerFriendsToggleEnabled: true,
        },
        (settings) => {
            const enableControls = settings.PrivateQuickLinkCopy;
            const enableDetails = settings.ServerlistmodificationsEnabled;
            showFriendsAllowedToggle =
                settings.privateServerFriendsToggleEnabled;

            observeElement(
                '.rbx-private-game-server-item',
                (serverItem) => {
                    if (serverItem.dataset.rovalraPrivateEnhanced) return;
                    serverItem.dataset.rovalraPrivateEnhanced = 'true';
                    const detailsDiv = serverItem.querySelector(
                        '.rbx-private-game-server-details',
                    );

                    const ownerLink = serverItem.querySelector(
                        '.rbx-private-owner .avatar-card-fullbody',
                    );
                    if (!ownerLink) return;

                    if (enableDetails) {
                        enhanceServer(serverItem, privateServerContext);
                    }

                    const href = ownerLink.getAttribute('href');
                    if (!href) return;

                    const match = href.match(/users\/(\d+)\/profile/);
                    if (!match) return;

                    const ownerId = parseInt(match[1], 10);

                    if (ownerId === userId && enableControls) {
                        if (serverItem.dataset.privateServerId) {
                            addOwnerControls(
                                serverItem,
                                serverItem.dataset.privateServerId,
                            );
                        } else {
                            const observer =
                                observeAttributes(serverItem, () => {
                                    if (serverItem.dataset.privateServerId) {
                                        observer.disconnect();
                                        addOwnerControls(
                                            serverItem,
                                            serverItem.dataset.privateServerId,
                                        );
                                    }
                                }, ['data-private-server-id']);
                        }
                    }
                },
                { multiple: true },
            );

            if (enableDetails) {
                observeElement(
                    PRIVATE_SECTION_SELECTOR,
                    attachPrivateServerFilters,
                    { multiple: true },
                );
                observeElement(
                    `${PRIVATE_SECTION_SELECTOR} > div > h3:first-child`,
                    (title) =>
                        attachPrivateServerFilters(
                            title.closest(PRIVATE_SECTION_SELECTOR),
                        ),
                    { multiple: true },
                );
                observeElement(
                    `${PRIVATE_SECTION_SELECTOR} ${PRIVATE_ROW_SELECTOR}`,
                    onPrivateServerRowAdded,
                    { multiple: true },
                );
            }

            observeElement(
                '.flex.items-center.justify-between.padding-y-medium.width-full',
                (el) => {
                    const section = el.closest(
                        '[data-rovalra-section-type="private"]',
                    );
                    if (!section || el.dataset.rovalraPrivateEnhanced) return;
                    el.dataset.rovalraPrivateEnhanced = 'true';

                    const check = () => {
                        const isOwner =
                            el.getAttribute('data-rovalra-is-owner') === 'true';
                        const privateServerId = el.getAttribute(
                            'data-private-server-id',
                        );
                        if (privateServerId) {
                            onPrivateServerIdReady(el);
                            if (isOwner && enableControls) {
                                const btnContainer =
                                    el.querySelector(
                                        '.flex.items-center.gap-small.grow-0.shrink-0.basis-auto',
                                    ) ||
                                    el.querySelector(
                                        '.flex.flex-col.items-center.gap-xsmall.grow-0.shrink-0.basis-auto',
                                    );
                                if (btnContainer)
                                    addModernPrivateServerControls(
                                        el,
                                        btnContainer,
                                    );
                            }
                            return true;
                        }
                        return false;
                    };

                    if (!check()) {
                        const observer = observeAttributes(el, () => {
                            if (check()) observer.disconnect();
                        }, ['data-rovalra-is-owner', 'data-private-server-id']);
                    }
                },
                { multiple: true },
            );
        },
    );
}

function createFriendsAllowedToggle(privateServerId, friendsAllowed) {
    const toggle = createToggle({
        checked: friendsAllowed === true,
        onChange: async (newState) => {
            try {
                const response = await callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/vip-servers/${privateServerId}/permissions`,
                    method: 'PATCH',
                    body: { friendsAllowed: newState },
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                vipServerDetailsCache.delete(privateServerId);
            } catch (error) {
                console.error('Error toggling friends allowed:', error);
                toggle.setChecked(!newState);
            }
        },
    });

    return toggle;
}

async function addOwnerControls(serverItem, privateServerId) {
    const detailsDiv = serverItem.querySelector(
        '.rbx-private-game-server-details',
    );
    if (
        !detailsDiv ||
        detailsDiv.querySelector('.rovalra-private-server-controls')
    )
        return;

    if (
        serverItem.querySelector('.rbx-private-game-server-copy-link') ||
        serverItem.querySelector('.rbx-private-game-server-regenerate-link')
    )
        return;

    let initialData = null;
    try {
        const res = await callRobloxApi({
            subdomain: 'games',
            endpoint: `/v1/vip-servers/${privateServerId}`,
            method: 'GET',
        });
        if (res.ok) {
            initialData = await res.json();
        }
    } catch (e) {
        console.warn(e);
    }

    if (initialData?.subscription?.expired) return;

    const container = document.createElement('div');
    container.className = 'rovalra-private-server-controls';
    container.style.marginTop = '5px';
    container.style.display = 'flex';
    container.style.gap = '5px';

    const copyLinkBtn = createButton(
        await t('quickPlay.copyLink'),
        'secondary',
    );
    copyLinkBtn.classList.add('btn-control-xs');
    copyLinkBtn.style.flex = '1';
    copyLinkBtn.style.fontSize = '11px';
    copyLinkBtn.style.minWidth = '0';

    const generateLinkBtn = createButton(
        await t('privateServerPage.regenerateLink'),
        'secondary',
    );
    generateLinkBtn.classList.add('btn-control-xs');
    generateLinkBtn.style.flex = '1';
    generateLinkBtn.style.fontSize = '11px';
    generateLinkBtn.style.minWidth = '0';

    container.appendChild(copyLinkBtn);
    container.appendChild(generateLinkBtn);

    const joinBtnSpan = detailsDiv.querySelector('span[data-placeid]');
    if (joinBtnSpan) {
        joinBtnSpan.after(container);
    } else {
        detailsDiv.appendChild(container);
    }

    if (initialData) {
        copyLinkBtn.disabled = !initialData.link;
        copyLinkBtn.style.opacity = copyLinkBtn.disabled ? '0.5' : '1';
        if (initialData.active === false) {
            generateLinkBtn.disabled = true;
        }
    }

    const checkLink = async () => {
        try {
            const res = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${privateServerId}`,
                method: 'GET',
            });
            if (res.ok) {
                const data = await res.json();
                copyLinkBtn.disabled = !data.link;
                copyLinkBtn.style.opacity = copyLinkBtn.disabled ? '0.5' : '1';
                if (data.active === false) {
                    generateLinkBtn.disabled = true;
                }
                return data.link;
            }
        } catch (e) {
            console.warn(e);
        }
        return null;
    };

    copyLinkBtn.onclick = async () => {
        if (copyLinkBtn.disabled) return;
        const originalText = copyLinkBtn.textContent;

        const link = await checkLink();
        if (link) {
            navigator.clipboard.writeText(link);
            copyLinkBtn.textContent = await t('quickPlay.copied');
        } else {
            copyLinkBtn.textContent = await t('quickPlay.error');
        }
        setTimeout(() => (copyLinkBtn.textContent = originalText), 1500);
    };

    generateLinkBtn.onclick = async () => {
        const originalText = generateLinkBtn.textContent;
        generateLinkBtn.disabled = true;

        try {
            const res = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${privateServerId}`,
                method: 'PATCH',
                body: { newJoinCode: true },
            });

            if (res.ok) {
                generateLinkBtn.textContent = await t(
                    'privateServerPage.regenerated',
                );
                copyLinkBtn.disabled = false;
                copyLinkBtn.style.opacity = '1';
            } else {
                generateLinkBtn.textContent = await t('quickPlay.error');
            }
        } catch (e) {
            generateLinkBtn.textContent = await t('quickPlay.error');
        }

        setTimeout(() => {
            generateLinkBtn.textContent = originalText;
            generateLinkBtn.disabled = false;
        }, 1500);
    };

    const toggleRow = document.createElement('div');
    toggleRow.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;margin-top:5px;padding:0 2px;';

    const toggleLabel = document.createElement('span');
    toggleLabel.style.cssText =
        'font-size:12px;color:var(--color-text-secondary);';
    toggleLabel.textContent = await t('privateServer.allowJoining', {
        defaultValue: 'Allow Joining',
    });

    const toggle = createToggle({
        checked: initialData?.active !== false,
        onChange: async (newState) => {
            try {
                const res = await callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/vip-servers/${privateServerId}`,
                    method: 'PATCH',
                    body: { active: newState },
                });

                if (res.ok) {
                    vipServerDetailsCache.delete(privateServerId);

                    if (newState) {
                        generateLinkBtn.disabled = false;
                        generateLinkBtn.style.opacity = '1';
                    } else {
                        generateLinkBtn.disabled = true;
                        generateLinkBtn.style.opacity = '0.5';
                    }

                    copyLinkBtn.disabled = false;
                    copyLinkBtn.style.opacity = '1';
                } else {
                    toggle.setChecked(!newState);
                }
            } catch (e) {
                toggle.setChecked(!newState);
            }
        },
    });

    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggle);
    container.appendChild(toggleRow);

    if (showFriendsAllowedToggle) {
        const friendsRow = toggleRow.cloneNode(false);
        const friendsLabel = toggleLabel.cloneNode(false);
        friendsLabel.textContent = await t('privateServer.friendsAllowed', {
            defaultValue: 'Friends Allowed',
        });

        friendsRow.append(
            friendsLabel,
            createFriendsAllowedToggle(
                privateServerId,
                initialData?.permissions?.friendsAllowed,
            ),
        );
        container.appendChild(friendsRow);
    }
}

function createMenuItem(text, onClick) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className =
        'rovalra-private-server-menu-item text-body-medium content-default';
    item.textContent = text;
    item.addEventListener('click', async (e) => {
        e.stopPropagation();
        item.disabled = true;
        const result = await onClick().catch(() => false);
        item.textContent =
            result === false ? ts('quickPlay.error') : result || text;
        setTimeout(() => {
            item.textContent = text;
            item.disabled = false;
        }, 1000);
    });
    return item;
}

function createMenuToggle(text, toggle) {
    const row = document.createElement('label');
    row.className =
        'rovalra-private-server-menu-toggle text-body-medium content-default';
    const label = document.createElement('span');
    label.textContent = text;
    row.append(label, toggle);
    return row;
}

function createAllowJoiningToggle(privateServerId, active) {
    const toggle = createToggle({
        checked: active !== false,
        onChange: async (newState) => {
            try {
                const response = await callRobloxApi({
                    subdomain: 'games',
                    endpoint: `/v1/vip-servers/${privateServerId}`,
                    method: 'PATCH',
                    body: { active: newState },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                vipServerDetailsCache.delete(privateServerId);
            } catch (error) {
                console.error('Error toggling allow joining:', error);
                toggle.setChecked(!newState);
            }
        },
    });
    return toggle;
}

function createPrivateServerMenu(el, privateServerId, details) {
    const menu = document.createElement('div');
    menu.className =
        'rovalra-private-server-menu foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    menu.addEventListener('click', (e) => e.stopPropagation());

    const copyItem = createMenuItem(ts('quickPlay.copyLink'), async () => {
        const currentDetails = await getVipServerDetails(privateServerId);
        if (!currentDetails?.link) return false;
        await navigator.clipboard.writeText(currentDetails.link);
        return t('localizationFallbacks.serverCopied');
    });
    copyItem.disabled = !details.link;

    const regenerateItem = createMenuItem(
        ts('privateServerPage.regenerateLink'),
        async () => {
            const response = await callRobloxApi({
                subdomain: 'games',
                endpoint: `/v1/vip-servers/${privateServerId}`,
                method: 'PATCH',
                body: { newJoinCode: true },
            });
            if (!response.ok) return false;
            vipServerDetailsCache.delete(privateServerId);
            const newDetails = await getVipServerDetails(privateServerId);
            if (newDetails?.accessCode) {
                el.setAttribute('data-access-code', newDetails.accessCode);
            }
            copyItem.disabled = !newDetails?.link;
            return t('privateServerPage.regenerated');
        },
    );

    menu.append(
        copyItem,
        regenerateItem,
        createMenuToggle(
            ts('privateServer.allowJoining'),
            createAllowJoiningToggle(privateServerId, details.active),
        ),
    );
    if (showFriendsAllowedToggle) {
        menu.append(
            createMenuToggle(
                ts('privateServer.friendsAllowed'),
                createFriendsAllowedToggle(
                    privateServerId,
                    details.permissions?.friendsAllowed,
                ),
            ),
        );
    }
    return menu;
}

export async function addModernPrivateServerControls(el, btnContainer) {
    const privateServerId = el.getAttribute('data-private-server-id');
    if (!privateServerId) return;
    if (el.getAttribute('data-rovalra-is-owner') !== 'true') return;
    if (btnContainer.querySelector('.rovalra-private-server-more')) return;

    const details = await getVipServerDetails(privateServerId);
    if (!details || details.subscription?.expired) return;
    if (btnContainer.querySelector('.rovalra-private-server-more')) return;

    const nativeJoinBtn = btnContainer.querySelector('button');
    if (nativeJoinBtn) {
        nativeJoinBtn.setAttribute('data-rovalra-join-button', 'true');
    }
    const configureBtn = btnContainer.querySelector(
        'a.foundation-web-icon-button',
    );

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-private-server-more';

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = configureBtn
        ? configureBtn.className
        : 'foundation-web-icon-button relative clip group/interactable';
    moreBtn.setAttribute('aria-label', ts('privateServer.moreOptions'));
    moreBtn.setAttribute('aria-expanded', 'false');
    const hover = document.createElement('div');
    hover.setAttribute('role', 'presentation');
    hover.className =
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)]';
    const icon = document.createElement('icon');
    icon.setAttribute('material', '');
    icon.setAttribute('size', '20px');
    icon.className = 'content-action-standard';
    icon.textContent = 'more_horiz';
    moreBtn.append(hover, icon);
    wrapper.appendChild(moreBtn);

    let menu = null;
    const closeMenu = () => {
        menu?.remove();
        menu = null;
        moreBtn.setAttribute('aria-expanded', 'false');
    };
    moreBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (menu) {
            closeMenu();
            return;
        }
        const currentDetails =
            (await getVipServerDetails(privateServerId)) || details;
        menu = createPrivateServerMenu(el, privateServerId, currentDetails);
        moreBtn.setAttribute('aria-expanded', 'true');
        wrapper.appendChild(menu);
    });
    const handleDocumentClick = (e) => {
        if (!wrapper.isConnected) {
            document.removeEventListener('click', handleDocumentClick);
            return;
        }
        if (menu && !wrapper.contains(e.target)) closeMenu();
    };
    document.addEventListener('click', handleDocumentClick);

    if (configureBtn) {
        configureBtn.after(wrapper);
    } else {
        btnContainer.prepend(wrapper);
    }
}
