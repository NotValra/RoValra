import { callRobloxApiJson } from '../../api';

const presenceQueue = {
    pendingIds: new Set(),
    promises: new Map(),
    timer: null,
    BATCH_DELAY: 50,
};

function flushPresenceQueue() {
    const userIds = Array.from(presenceQueue.pendingIds);
    presenceQueue.pendingIds.clear();
    presenceQueue.timer = null;

    if (userIds.length === 0) return;

    callRobloxApiJson({
        subdomain: 'presence',
        endpoint: '/v1/presence/users',
        method: 'POST',
        body: { userIds },
    })
        .then((res) => {
            const presenceMap = new Map(
                (res?.userPresences || []).map((p) => [p.userId, p]),
            );
            for (const userId of userIds) {
                const presence = presenceMap.get(userId) || null;
                const resolvers = presenceQueue.promises.get(userId) || [];
                presenceQueue.promises.delete(userId);
                for (const resolve of resolvers) {
                    resolve(presence);
                }
            }
        })
        .catch(() => {
            for (const userId of userIds) {
                const resolvers = presenceQueue.promises.get(userId) || [];
                presenceQueue.promises.delete(userId);
                for (const resolve of resolvers) {
                    resolve(null);
                }
            }
        });
}

export function fetchPresenceBatched(userId) {
    return new Promise((resolve) => {
        presenceQueue.pendingIds.add(userId);
        if (!presenceQueue.promises.has(userId)) {
            presenceQueue.promises.set(userId, []);
        }
        presenceQueue.promises.get(userId).push(resolve);

        if (!presenceQueue.timer) {
            presenceQueue.timer = setTimeout(
                flushPresenceQueue,
                presenceQueue.BATCH_DELAY,
            );
        }
    });
}

const subplaceNameCache = new Map();

export const ROBLOX_PRESENCE_LABEL_FONT = 'inherit';
export const ROBLOX_PRESENCE_LABEL_SIZE = '12px';
export const ROBLOX_PRESENCE_LABEL_WIDTH = '90px';

function normalizePresenceName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getPresencePlaceId(presence) {
    return String(
        presence?.placeId ??
            presence?.PlaceId ??
            presence?.rootPlaceId ??
            presence?.RootPlaceId ??
            '',
    );
}

function getPresenceRootPlaceId(presence) {
    return String(presence?.rootPlaceId ?? presence?.RootPlaceId ?? '');
}

function getPresenceUniverseId(presence) {
    return String(presence?.universeId ?? presence?.UniverseId ?? '');
}

function getCloudPlaceName(placeInfo) {
    return (
        placeInfo?.displayName ||
        placeInfo?.name ||
        placeInfo?.place?.displayName ||
        placeInfo?.place?.name ||
        placeInfo?.localizedName ||
        null
    );
}

function getCloudPlaceRootId(placeInfo) {
    return String(
        placeInfo?.rootPlaceId ??
            placeInfo?.rootPlace?.placeId ??
            placeInfo?.rootPlace?.id ??
            placeInfo?.universe?.rootPlaceId ??
            '',
    );
}

async function fetchCloudPlaceDetails(placeId, universeId) {
    const placeKey = String(placeId || '');
    const universeKey = String(universeId || '');
    if (!placeKey || !universeKey) return null;

    return await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/cloud/v2/universes/${encodeURIComponent(
            universeKey,
        )}/places/${encodeURIComponent(placeKey)}`,
        method: 'GET',
        useApiKey: true,
        useBackground: true,
    }).catch(() => null);
}

async function fetchLegacyPlaceName(placeId) {
    const key = String(placeId || '');
    if (!key) return null;

    const res = await callRobloxApiJson({
        subdomain: 'games',
        endpoint: `/v1/games/multiget-place-details?placeIds=${encodeURIComponent(key)}`,
        method: 'GET',
    }).catch(() => null);

    const item = Array.isArray(res) ? res[0] : null;
    return item?.name || item?.Name || null;
}

async function fetchSubplaceName(placeId, universeId = '', rootPlaceId = '') {
    const key = String(placeId || '');
    const universeKey = String(universeId || '');
    const rootKey = String(rootPlaceId || '');
    if (!key) return null;

    const cacheKey = universeKey ? `${universeKey}:${key}` : key;
    if (subplaceNameCache.has(cacheKey)) return subplaceNameCache.get(cacheKey);

    const promise = (async () => {
        if (universeKey) {
            const cloudPlace = await fetchCloudPlaceDetails(key, universeKey);
            const cloudName = getCloudPlaceName(cloudPlace);
            const cloudRootId = getCloudPlaceRootId(cloudPlace);
            const isRootPlace =
                cloudPlace?.isRootPlace === true ||
                (cloudRootId && cloudRootId === key) ||
                (rootKey && rootKey === key);

            if (cloudName && !isRootPlace) return cloudName;
            if (isRootPlace) return null;
        }

        if (rootKey && rootKey === key) return null;

        return await fetchLegacyPlaceName(key);
    })();

    subplaceNameCache.set(cacheKey, promise);
    const name = await promise.catch(() => null);
    subplaceNameCache.set(cacheKey, name);
    return name;
}

export async function getPresenceDisplayGameName(presence) {
    if (!presence || presence.userPresenceType !== 2) return null;

    const baseName = presence.lastLocation || null;
    const placeId = getPresencePlaceId(presence);
    const rootPlaceId = getPresenceRootPlaceId(presence);
    const universeId = getPresenceUniverseId(presence);
    let subplaceName = null;

    if (placeId && (!rootPlaceId || placeId !== rootPlaceId)) {
        subplaceName = await fetchSubplaceName(
            placeId,
            universeId,
            rootPlaceId,
        );
    }

    if (!subplaceName) return baseName;

    if (!baseName || normalizePresenceName(baseName) === normalizePresenceName(subplaceName)) {
        return subplaceName;
    }

    return `${baseName} • ${subplaceName}`;
}

function getPresenceNameParts(gameName) {
    const fullName = String(gameName || '').trim();
    if (!fullName) {
        return {
            baseName: '',
            subplaceName: '',
            fullName: '',
        };
    }

    const splitBy = (separator) =>
        fullName
            .split(separator)
            .map((part) => part.trim())
            .filter(Boolean);

    const bulletParts = splitBy(' • ');
    if (bulletParts.length > 1) {
        return {
            baseName: bulletParts[0],
            subplaceName: bulletParts.slice(1).join(' • '),
            fullName,
        };
    }

    const dotParts = splitBy(' . ');
    if (dotParts.length > 1) {
        return {
            baseName: dotParts[0],
            subplaceName: dotParts.slice(1).join(' . '),
            fullName,
        };
    }

    const middleDotParts = splitBy(' · ');
    if (middleDotParts.length > 1) {
        return {
            baseName: middleDotParts[0],
            subplaceName: middleDotParts.slice(1).join(' · '),
            fullName,
        };
    }

    return {
        baseName: fullName,
        subplaceName: '',
        fullName,
    };
}

export function getCompactPresenceLabel(gameName) {
    return getPresenceNameParts(gameName).baseName;
}

export function getHoverPresenceLabel(gameName) {
    return getPresenceNameParts(gameName).subplaceName;
}

function truncatePresenceBaseLabel(text) {
    const value = String(text || '').trim();
    const maxLength = 16;

    if (!value || value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function setupPresenceHoverSwap(
    labelEl,
    hoverHost,
    defaultText,
    hoverText,
    fullTitle,
) {
    if (!(labelEl instanceof HTMLElement)) return;

    const truncatedDefaultText = truncatePresenceBaseLabel(defaultText);
    const truncatedHoverText = truncatePresenceBaseLabel(hoverText);

    labelEl.dataset.rovalraPresenceDefaultText = truncatedDefaultText || '';
    labelEl.dataset.rovalraPresenceHoverText = truncatedHoverText || '';
    labelEl.title = fullTitle || hoverText || defaultText || '';
    labelEl.textContent = truncatedDefaultText || '';

    if (labelEl.dataset.rovalraPresenceHoverBound === 'true') return;

    const animateTextChange = (nextText) => {
        if (labelEl.textContent === nextText) return;

        labelEl.classList.remove('rovalra-subplace-presence-animate');
        void labelEl.offsetWidth;
        labelEl.textContent = nextText;
        labelEl.classList.add('rovalra-subplace-presence-animate');
    };

    const update = (hovered) => {
        const baseText = labelEl.dataset.rovalraPresenceDefaultText || '';
        const hoverTextValue = labelEl.dataset.rovalraPresenceHoverText || '';
        const nextText =
            hovered && hoverTextValue ? hoverTextValue : baseText;

        animateTextChange(nextText);
    };

    const enter = () => update(true);
    const leave = () => update(false);
    const hoverTargets = new Set([
        labelEl,
        hoverHost instanceof HTMLElement ? hoverHost : null,
        labelEl.parentElement,
        labelEl.closest(
            '.user-card-name, .friends-carousel-tile, .friend-tile, .avatar-card-container, .avatar-card, li, [class*="friend" i], [class*="avatar" i]',
        ),
        hoverHost instanceof HTMLElement
            ? hoverHost.closest(
                  '.friends-carousel-tile, .friend-tile, .avatar-card-container, .avatar-card, li, [class*="friend" i], [class*="avatar" i]',
              )
            : null,
    ]);

    for (const target of hoverTargets) {
        if (!(target instanceof HTMLElement)) continue;
        target.addEventListener('mouseenter', enter);
        target.addEventListener('mouseleave', leave);
    }

    labelEl.dataset.rovalraPresenceHoverBound = 'true';
}

export function applySubplacePresenceToUserCard(card, gameName) {
    if (!(card instanceof HTMLElement) || !gameName) return;

    const sublabel = card.querySelector('.user-card-subname');
    if (!(sublabel instanceof HTMLElement)) return;

    const compactLabel = getCompactPresenceLabel(gameName);
    const hoverLabel = getHoverPresenceLabel(gameName);

    sublabel.classList.add('rovalra-subplace-presence-label');
    sublabel.style.fontFamily = ROBLOX_PRESENCE_LABEL_FONT;
    sublabel.style.fontSize = ROBLOX_PRESENCE_LABEL_SIZE;
    sublabel.style.fontWeight = '400';
    sublabel.style.lineHeight = '1.2';
    sublabel.style.whiteSpace = 'nowrap';
    sublabel.style.overflow = 'hidden';
    sublabel.style.textOverflow = 'ellipsis';
    sublabel.style.display = 'block';
    sublabel.style.webkitLineClamp = '';
    sublabel.style.webkitBoxOrient = '';
    sublabel.style.maxWidth = ROBLOX_PRESENCE_LABEL_WIDTH;
    sublabel.style.width = ROBLOX_PRESENCE_LABEL_WIDTH;
    sublabel.style.marginLeft = 'auto';
    sublabel.style.marginRight = 'auto';
    sublabel.style.position = 'static';
    sublabel.style.left = 'auto';
    sublabel.style.top = 'auto';
    sublabel.style.transform = 'none';
    sublabel.style.boxSizing = 'border-box';
    sublabel.style.overflowWrap = 'normal';
    sublabel.style.wordBreak = 'normal';
    sublabel.style.textAlign = 'center';

    const labels = sublabel.closest('.user-card-labels');
    if (labels instanceof HTMLElement) {
        labels.classList.add('rovalra-subplace-presence-labels');
        labels.style.maxWidth = '90px';
        labels.style.width = '90px';
        labels.style.marginLeft = 'auto';
        labels.style.marginRight = 'auto';
        labels.style.position = 'relative';
        labels.style.left = 'auto';
        labels.style.top = 'auto';
        labels.style.transform = 'none';
        labels.style.boxSizing = 'border-box';
        labels.style.pointerEvents = 'auto';
        labels.style.textAlign = 'center';
    }

    const tile = sublabel.closest(
        '.friends-carousel-tile, .user-card, .user-card-inner',
    );
    if (tile instanceof HTMLElement) {
        tile.classList.add('rovalra-subplace-presence-card');
        tile.style.overflow = 'visible';
    }

    setupPresenceHoverSwap(
        sublabel,
        tile,
        compactLabel,
        hoverLabel,
        gameName,
    );
}

function getUserIdFromElement(element) {
    const href =
        (
            element?.matches?.('a[href*="/users/"]')
                ? element
                : element?.querySelector?.('a[href*="/users/"]')
        )?.getAttribute?.('href') || '';

    const match = href.match(/\/users\/(\d+)\//);
    return match ? Number(match[1]) : null;
}

function findPresenceTextTargets(root) {
    const targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = root.nodeType === Node.ELEMENT_NODE ? root : walker.nextNode();

    while (node) {
        if (node instanceof HTMLElement) {
            const text = (node.textContent || '').trim();
            const hasOwnText = Array.from(node.childNodes).some(
                (child) =>
                    child.nodeType === Node.TEXT_NODE &&
                    child.textContent.trim(),
            );

            if (hasOwnText && text && text.length <= 80) {
                targets.push(node);
            }
        }

        node = walker.nextNode();
    }

    return targets;
}

function forceNativeSubplaceLabelLayout(target, compactName, gameName) {
    if (!(target instanceof HTMLElement)) return;

    const hoverLabel = getHoverPresenceLabel(gameName);
    const parent = target.parentElement;
    const hoverHost =
        parent?.closest?.(
            'li, .list-item, .avatar-card-container, .avatar-card, .friends-carousel-tile, .friend-tile, [class*="friend" i], [class*="avatar" i], [class*="popover" i]',
        ) || parent || target;

    target.classList.remove('rovalra-subplace-presence-native-source-label');
    target.classList.add('rovalra-subplace-presence-native-label');
    target.textContent = compactName;
    target.title = gameName;

    [
        '--rovalra-subplace-native-width',
        'width',
        'max-width',
        'margin-left',
        'margin-right',
        'text-align',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'color',
        'position',
        'left',
        'top',
        'transform',
        'visibility',
        'pointer-events',
        'overflow-wrap',
        'word-break',
        'box-sizing',
    ].forEach((property) => target.style.removeProperty(property));

    target.style.setProperty('white-space', 'nowrap', 'important');
    target.style.setProperty('overflow', 'hidden', 'important');
    target.style.setProperty('text-overflow', 'ellipsis', 'important');
    target.style.setProperty('min-width', '0', 'important');
    target.style.removeProperty('display');
    target.style.removeProperty('max-width');
    target.style.removeProperty('-webkit-line-clamp');
    target.style.removeProperty('-webkit-box-orient');

    if (parent instanceof HTMLElement) {
        parent.classList.remove('rovalra-subplace-presence-native-wrap');
        parent.style.removeProperty('text-align');
        parent
            .querySelectorAll(':scope > .rovalra-subplace-presence-native-label')
            .forEach((node) => {
                if (node !== target && node instanceof HTMLElement) {
                    node.classList.remove('rovalra-subplace-presence-native-label');
                }
            });
    }

    setupPresenceHoverSwap(
        target,
        hoverHost,
        compactName,
        hoverLabel,
        gameName,
    );
}

function normalizeVisiblePresenceText(value) {
    return normalizePresenceName(value)
        .replace(/^playing\s+/i, '')
        .replace(/[\u2026]/g, '')
        .replace(/\.{2,}$/g, '')
        .trim();
}

function presenceTextLooksLikeGame(current, baseName, compactName) {
    const currentNorm = normalizeVisiblePresenceText(current);
    const baseNorm = normalizeVisiblePresenceText(baseName);
    const compactNorm = normalizeVisiblePresenceText(compactName);

    if (!currentNorm) return false;
    if (currentNorm === baseNorm || currentNorm === compactNorm) return true;

    if (currentNorm.length >= 6) {
        if (baseNorm.startsWith(currentNorm) || compactNorm.startsWith(currentNorm)) {
            return true;
        }

        if (currentNorm.startsWith(baseNorm) || currentNorm.startsWith(compactNorm)) {
            return true;
        }
    }

    return false;
}

async function updateNativePresenceContainer(container) {
    if (!container || container.dataset.rovalraSubplacePresenceUpdating === 'true') {
        return;
    }

    if (!(await isHomeSubplaceHoverEnabled())) {
        clearNativeSubplacePresence(container);
        return;
    }

    const userId = getUserIdFromElement(container);
    if (!userId) return;

    container.dataset.rovalraSubplacePresenceUpdating = 'true';

    const presence = await fetchPresenceBatched(userId);
    const gameName = await getPresenceDisplayGameName(presence);

    container.dataset.rovalraSubplacePresenceUpdating = 'false';

    const compactName = getCompactPresenceLabel(gameName);
    const hoverName = getHoverPresenceLabel(gameName);
    const doneKey = gameName || 'none';

    if (container.dataset.rovalraSubplacePresenceDoneKey === doneKey) {
        return;
    }

    if (!gameName || !hoverName) {
        container.dataset.rovalraSubplacePresenceDoneKey = doneKey;
        return;
    }

    const baseName = getCompactPresenceLabel(presence?.lastLocation || gameName);
    let updated = false;
    let fallbackTarget = null;

    for (const target of findPresenceTextTargets(container)) {
        if (updated) break;

        const current = (target.textContent || '').trim();
        if (!current) continue;

        const currentHoverName = getHoverPresenceLabel(current);
        if (currentHoverName) {
            forceNativeSubplaceLabelLayout(
                target,
                getCompactPresenceLabel(current),
                current,
            );
            updated = true;
            continue;
        }

        if (/^Playing\s+/i.test(current)) {
            const currentGame = current.replace(/^Playing\s+/i, '').trim();
            if (
                !currentGame ||
                presenceTextLooksLikeGame(currentGame, baseName, compactName)
            ) {
                target.textContent = `Playing ${compactName}`;
                target.title = `Playing ${gameName}`;
                target.classList.add('rovalra-subplace-presence-native-label');
                target.style.setProperty('white-space', 'nowrap', 'important');
                target.style.setProperty('overflow', 'hidden', 'important');
                target.style.setProperty('text-overflow', 'ellipsis', 'important');
                target.style.setProperty('min-width', '0', 'important');
                target.style.removeProperty('display');
                target.style.removeProperty('max-width');
                setupPresenceHoverSwap(
                    target,
                    target.parentElement,
                    `Playing ${compactName}`,
                    hoverName ? `Playing ${hoverName}` : '',
                    `Playing ${gameName}`,
                );
                updated = true;
            }
            continue;
        }

        if (presenceTextLooksLikeGame(current, baseName, compactName)) {
            forceNativeSubplaceLabelLayout(target, compactName, gameName);
            updated = true;
            continue;
        }

        if (
            !fallbackTarget &&
            current.length > 4 &&
            !target.closest('button') &&
            !/^add friends$/i.test(current)
        ) {
            fallbackTarget = target;
        }
    }

    if (!updated && fallbackTarget) {
        forceNativeSubplaceLabelLayout(fallbackTarget, compactName, gameName);
        updated = true;
    }

    if (updated) {
        container.dataset.rovalraSubplacePresenceDoneKey = doneKey;
    } else {
        delete container.dataset.rovalraSubplacePresenceDoneKey;
    }
}

function scanNativePresenceLabels(root = document) {
    const candidates = new Set();

    root.querySelectorAll?.('a[href*="/users/"][href*="/profile"], a[href*="/users/"]').forEach(
        (link) => {
            const container = link.closest(
                'li, .list-item, .avatar-card-container, .avatar-card, .friends-carousel-tile, .friend-tile, [class*="friend" i], [class*="avatar" i], [class*="popover" i]',
            );

            if (container) candidates.add(container);
        },
    );

    for (const candidate of candidates) {
        updateNativePresenceContainer(candidate);
    }
}

function getBooleanSetting(settingName, defaultValue = true) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [settingName]: defaultValue }, (result) => {
            if (chrome.runtime.lastError) {
                resolve(defaultValue);
                return;
            }

            resolve(result[settingName] !== false);
        });
    });
}

async function isSubplacePresenceEnabled() {
    return getBooleanSetting('subplacePresenceEnabled', true);
}

async function isHomeSubplaceHoverEnabled() {
    const [presenceEnabled, homeHoverEnabled] = await Promise.all([
        getBooleanSetting('subplacePresenceEnabled', true),
        getBooleanSetting('homeSubplaceHoverEnabled', true),
    ]);

    return presenceEnabled && homeHoverEnabled;
}

function clearNativeSubplacePresence(container) {
    if (!(container instanceof HTMLElement)) return;

    container
        .querySelectorAll('.rovalra-subplace-presence-native-label')
        .forEach((node) => {
            if (node instanceof HTMLElement) {
                node.classList.remove('rovalra-subplace-presence-native-label');
                node.style.removeProperty('display');
                node.style.removeProperty('white-space');
                node.style.removeProperty('overflow');
                node.style.removeProperty('text-overflow');
                node.style.removeProperty('min-width');
                node.style.removeProperty('display');
                node.style.removeProperty('max-width');
            }
        });

    container
        .querySelectorAll('.rovalra-subplace-presence-native-source-label')
        .forEach((node) => {
            if (node instanceof HTMLElement) {
                node.classList.remove('rovalra-subplace-presence-native-source-label');
                node.style.removeProperty('visibility');
                node.style.removeProperty('pointer-events');
            }
        });

    delete container.dataset.rovalraSubplacePresenceDoneKey;
}

function getProfileUserIdFromPage() {
    const match = location.pathname.match(/\/users\/(\d+)\/(?:profile)?/i);
    if (match) return Number(match[1]);

    const meta = document.querySelector('meta[name="user-data"]');
    const id = Number(meta?.dataset?.userid || 0);
    return id || null;
}

function findProfileHandleElement() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node instanceof HTMLElement)) continue;

        const text = (node.textContent || '').trim();
        if (/^@[A-Za-z0-9_]{3,20}$/.test(text)) return node;
    }

    return null;
}

let profilePresenceUpdateToken = 0;

async function updateProfileHeaderSubplacePresence() {
    if (!/\/users\/\d+\/(?:profile)?/i.test(location.pathname)) return;

    if (!(await isSubplacePresenceEnabled())) {
        document
            .querySelectorAll(
                '#rovalra-profile-subplace-presence, [data-rovalra-profile-subplace-presence="true"]',
            )
            .forEach((node) => node.remove());
        window.__rovalraProfileSubplacePresenceRenderedFor = '';
        return;
    }

    const userId = getProfileUserIdFromPage();
    if (!userId) return;

    const renderKey = `${location.pathname}:${userId}`;
    if (window.__rovalraProfileSubplacePresenceRenderedFor === renderKey) return;

    const initialHandleEl = findProfileHandleElement();
    if (!initialHandleEl) return;

    const updateToken = ++profilePresenceUpdateToken;
    const presence = await fetchPresenceBatched(userId);
    const gameName = await getPresenceDisplayGameName(presence);

    if (updateToken !== profilePresenceUpdateToken) return;

    const handleEl = findProfileHandleElement();
    if (!handleEl) return;

    document
        .querySelectorAll(
            '#rovalra-profile-subplace-presence, [data-rovalra-profile-subplace-presence="true"]',
        )
        .forEach((node) => node.remove());

    window.__rovalraProfileSubplacePresenceRenderedFor = renderKey;

    if (!gameName) return;

    const label = `Playing ${gameName}`;

    const line = document.createElement('div');
    line.id = 'rovalra-profile-subplace-presence';
    line.dataset.rovalraProfileSubplacePresence = 'true';
    line.className = 'rovalra-profile-subplace-presence-label';
    line.textContent = label;
    line.title = label;

    Object.assign(line.style, {
        marginTop: '4px',
        fontSize: '14px',
        lineHeight: '1.25',
        fontWeight: '500',
        color: 'var(--rovalra-secondary-text-color, var(--color-text-secondary, #b8b8b8))',
        maxWidth: '720px',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
    });

    handleEl.insertAdjacentElement('afterend', line);
}

export function initSubplacePresenceLabels() {
    if (window.__rovalraSubplacePresenceLabelsInit) return;
    window.__rovalraSubplacePresenceLabelsInit = true;

    const runInitialScan = () => {
        scanNativePresenceLabels(document);
        updateProfileHeaderSubplacePresence();
    };

    runInitialScan();
    setTimeout(runInitialScan, 1200);
    setTimeout(runInitialScan, 3000);

    let lastProfilePresencePath = location.pathname;

    new MutationObserver((mutations) => {
        if (location.pathname !== lastProfilePresencePath) {
            lastProfilePresencePath = location.pathname;
            window.__rovalraProfileSubplacePresenceRenderedFor = '';
            runInitialScan();
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) {
                    scanNativePresenceLabels(node);
                    updateProfileHeaderSubplacePresence();
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
}

export function getUserCardPresenceLabel({ showUsername = true, gameName, username }) {
    if (showUsername && gameName) {
        const text = getCompactPresenceLabel(gameName);
        return {
            shouldShow: true,
            text,
            title: gameName,
        };
    }

    return {
        shouldShow: showUsername,
        text: username || '',
        title: username || '',
    };
}
