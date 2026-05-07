import DOMPurify from '../../packages/dompurify';
import {
    createThumbnailElement,
    getBatchThumbnails,
} from '../../thumbnail/thumbnails';
import { callRobloxApiJson } from '../../api';
import { getAssets } from '../../assets';

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

const PRESENCE_MAP = {
    0: { class: 'offline icon-offline', title: 'Offline' },
    1: { class: 'online icon-online', title: 'Website' },
    2: { class: 'game icon-game', title: 'Playing' },
    3: { class: 'studio icon-studio', title: 'Studio' },
};

const subplaceNameCache = new Map();
const universePlacesCache = new Map();

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

async function fetchUniversePlaces(universeId) {
    const key = String(universeId || '');
    if (!key) return [];
    if (universePlacesCache.has(key)) return universePlacesCache.get(key);

    const promise = (async () => {
        const places = [];
        let cursor = '';
        let guard = 0;

        do {
            const endpoint = cursor
                ? `/v2/universes/${encodeURIComponent(key)}/places?limit=100&cursor=${encodeURIComponent(cursor)}`
                : `/v2/universes/${encodeURIComponent(key)}/places?limit=100`;

            const res = await callRobloxApiJson({
                subdomain: 'develop',
                endpoint,
                method: 'GET',
            }).catch(() => null);

            if (Array.isArray(res?.data)) {
                places.push(...res.data);
            }

            cursor = res?.nextPageCursor || '';
            guard += 1;
        } while (cursor && guard < 10);

        return places;
    })();

    universePlacesCache.set(key, promise);
    const result = await promise.catch(() => []);
    universePlacesCache.set(key, result);
    return result;
}

async function findSubplaceByServerId(rootPlaceId, universeId, serverId) {
    const universeKey = String(universeId || '');
    const serverKey = String(serverId || '');
    const rootKey = String(rootPlaceId || '');
    if (!universeKey || !serverKey) return null;

    const cacheKey = `server:${universeKey}:${serverKey}`;
    if (subplaceNameCache.has(cacheKey)) return subplaceNameCache.get(cacheKey);

    const promise = (async () => {
        const candidates = (await fetchUniversePlaces(universeKey))
            .map((place) => ({
                id: String(place?.id ?? place?.placeId ?? ''),
                name: place?.name || place?.Name || '',
            }))
            .filter((place) => place.id && place.id !== rootKey);

        for (const place of candidates.slice(0, 25)) {
            let cursor = '';
            let guard = 0;

            do {
                const endpoint = cursor
                    ? `/v1/games/${encodeURIComponent(place.id)}/servers/Public?limit=100&cursor=${encodeURIComponent(cursor)}`
                    : `/v1/games/${encodeURIComponent(place.id)}/servers/Public?limit=100`;

                const res = await callRobloxApiJson({
                    subdomain: 'games',
                    endpoint,
                    method: 'GET',
                }).catch(() => null);

                if (
                    Array.isArray(res?.data) &&
                    res.data.some((server) => String(server?.id || '') === serverKey)
                ) {
                    return place.name || null;
                }

                cursor = res?.nextPageCursor || '';
                guard += 1;
            } while (cursor && guard < 2);
        }

        return null;
    })();

    subplaceNameCache.set(cacheKey, promise);
    const result = await promise.catch(() => null);
    subplaceNameCache.set(cacheKey, result);
    return result;
}

async function fetchSubplaceName(placeId, universeId = '') {
    const key = String(placeId || '');
    const universeKey = String(universeId || '');
    if (!key) return null;

    const cacheKey = universeKey ? `${universeKey}:${key}` : key;
    if (subplaceNameCache.has(cacheKey)) return subplaceNameCache.get(cacheKey);

    const promise = (async () => {
        if (universeKey) {
            const match = (await fetchUniversePlaces(universeKey)).find(
                (place) => String(place?.id ?? place?.placeId ?? '') === key,
            );
            if (match?.name) return match.name;
        }

        const res = await callRobloxApiJson({
            subdomain: 'games',
            endpoint: `/v1/games/multiget-place-details?placeIds=${encodeURIComponent(key)}`,
            method: 'GET',
        }).catch(() => null);

        const item = Array.isArray(res) ? res[0] : null;
        return item?.name || item?.Name || null;
    })();

    subplaceNameCache.set(cacheKey, promise);
    const name = await promise.catch(() => null);
    subplaceNameCache.set(cacheKey, name);
    return name;
}

async function getPresenceDisplayGameName(presence) {
    if (!presence || presence.userPresenceType !== 2) return null;

    const baseName = presence.lastLocation || null;
    const placeId = getPresencePlaceId(presence);
    const rootPlaceId = getPresenceRootPlaceId(presence);
    const universeId = getPresenceUniverseId(presence);
    const serverId = String(presence?.gameId ?? presence?.GameId ?? '');
    let subplaceName = null;

    if (placeId && (!rootPlaceId || placeId !== rootPlaceId)) {
        subplaceName = await fetchSubplaceName(placeId, universeId);
    }

    if (!subplaceName && rootPlaceId && universeId && serverId) {
        subplaceName = await findSubplaceByServerId(
            rootPlaceId,
            universeId,
            serverId,
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

function getCompactPresenceLabel(gameName) {
    return getPresenceNameParts(gameName).baseName;
}

function getHoverPresenceLabel(gameName) {
    return getPresenceNameParts(gameName).subplaceName;
}

function setupPresenceHoverSwap(labelEl, hoverHost, defaultText, hoverText, fullTitle) {
    if (!(labelEl instanceof HTMLElement)) return;

    labelEl.dataset.rovalraPresenceDefaultText = defaultText || '';
    labelEl.dataset.rovalraPresenceHoverText = hoverText || '';
    labelEl.title = fullTitle || hoverText || defaultText || '';
    labelEl.textContent = defaultText || '';

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

    labelEl.addEventListener('mouseenter', enter);
    labelEl.addEventListener('mouseleave', leave);

    if (hoverHost instanceof HTMLElement && hoverHost !== labelEl) {
        hoverHost.addEventListener('mouseenter', enter);
        hoverHost.addEventListener('mouseleave', leave);
    }

    labelEl.dataset.rovalraPresenceHoverBound = 'true';
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
    const size =
        compactName.length > 34
            ? '8.75px'
            : compactName.length > 26
              ? '9.25px'
              : compactName.length > 18
                ? '9.75px'
                : '10.75px';

    target.classList.add('rovalra-subplace-presence-native-source-label');
    target.textContent = compactName;
    target.title = gameName;

    target.style.setProperty('display', 'block', 'important');
    target.style.setProperty('width', '90px', 'important');
    target.style.setProperty('max-width', '90px', 'important');
    target.style.setProperty('margin-left', 'auto', 'important');
    target.style.setProperty('margin-right', 'auto', 'important');
    target.style.setProperty('text-align', 'center', 'important');
    target.style.setProperty('white-space', 'nowrap', 'important');
    target.style.setProperty('overflow', 'hidden', 'important');
    target.style.setProperty('text-overflow', 'ellipsis', 'important');
    target.style.setProperty('line-height', '1.08', 'important');
    target.style.setProperty('font-size', size, 'important');
    target.style.setProperty('position', 'relative', 'important');
    target.style.setProperty('left', '0', 'important');
    target.style.setProperty('transform', 'none', 'important');
    target.style.setProperty('visibility', 'hidden', 'important');
    target.style.setProperty('pointer-events', 'none', 'important');
    target.style.removeProperty('-webkit-line-clamp');
    target.style.removeProperty('-webkit-box-orient');

    const parent = target.parentElement;
    if (parent instanceof HTMLElement) {
        parent.classList.add('rovalra-subplace-presence-native-wrap');
        parent.style.setProperty('position', 'relative', 'important');
        parent.style.setProperty('overflow', 'visible', 'important');
        parent.style.setProperty('text-align', 'center', 'important');

        let fullLabel = parent.querySelector(
            ':scope > .rovalra-subplace-presence-native-label',
        );

        if (!(fullLabel instanceof HTMLElement)) {
            fullLabel = document.createElement('div');
            fullLabel.className = 'rovalra-subplace-presence-native-label';
            target.insertAdjacentElement('afterend', fullLabel);
        }

        fullLabel.textContent = compactName;
        fullLabel.title = gameName;
        Object.assign(fullLabel.style, {
            display: 'block',
            width: '150px',
            maxWidth: '150px',
            textAlign: 'center',
            lineHeight: '1.08',
            fontSize: size,
            color: 'var(--rovalra-secondary-text-color, var(--color-text-secondary, #606770))',
            whiteSpace: 'normal',
            overflow: 'visible',
            textOverflow: 'clip',
            overflowWrap: 'normal',
            wordBreak: 'normal',
            position: 'absolute',
            left: '50%',
            top: '0',
            transform: 'translateX(-50%)',
            zIndex: '60',
            pointerEvents: 'auto',
        });

        fullLabel.style.setProperty('overflow', 'visible', 'important');
        fullLabel.style.setProperty('text-overflow', 'clip', 'important');
        fullLabel.style.setProperty('white-space', 'normal', 'important');

        const hoverHost =
            parent.closest(
                'li, .list-item, .avatar-card-container, .avatar-card, .friends-carousel-tile, .friend-tile, [class*="friend" i], [class*="avatar" i], [class*="popover" i]',
            ) || parent;

        setupPresenceHoverSwap(
            fullLabel,
            hoverHost,
            compactName,
            hoverLabel,
            gameName,
        );
    }

    let ancestor = target.parentElement;
    let depth = 0;

    while (ancestor instanceof HTMLElement && depth < 6) {
        ancestor.style.setProperty('overflow', 'visible', 'important');
        ancestor = ancestor.parentElement;
        depth += 1;
    }
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
                target.textContent = `Playing ${gameName}`;
                target.title = `Playing ${gameName}`;
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
        .forEach((node) => node.remove());

    container
        .querySelectorAll('.rovalra-subplace-presence-native-source-label')
        .forEach((node) => {
            if (node instanceof HTMLElement) {
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


export function updateUserCardPresence(card, presenceType, gameName) {
    const presence = PRESENCE_MAP[presenceType] || PRESENCE_MAP[0];
    const presenceTitle =
        presenceType === 2 && gameName ? gameName : presence.title;
    const icon = card.querySelector('[data-testid="presence-icon"]');

    if (icon) {
        icon.className = presence.class;
        icon.title = presenceTitle;
    }

    const sublabel = card.querySelector('.user-card-subname');
    if (sublabel && gameName) {
        const compactLabel = getCompactPresenceLabel(gameName);
        const hoverLabel = getHoverPresenceLabel(gameName);

        sublabel.classList.add('rovalra-subplace-presence-label');
        sublabel.style.fontSize =
            compactLabel.length > 22 ? '9.5px' : '10.75px';
        sublabel.style.lineHeight = '1.05';
        sublabel.style.whiteSpace = 'normal';
        sublabel.style.overflow = 'visible';
        sublabel.style.textOverflow = 'clip';
        sublabel.style.display = 'block';
        sublabel.style.webkitLineClamp = '';
        sublabel.style.webkitBoxOrient = '';
        sublabel.style.maxWidth = '150px';
        sublabel.style.width = '150px';
        sublabel.style.marginLeft = '0';
        sublabel.style.marginRight = '0';
        sublabel.style.position = 'absolute';
        sublabel.style.left = '50%';
        sublabel.style.top = '20px';
        sublabel.style.transform = 'translateX(-50%)';
        sublabel.style.boxSizing = 'border-box';
        sublabel.style.overflowWrap = 'break-word';
        sublabel.style.textAlign = 'center';

        const labels = sublabel.closest('.user-card-labels');
        if (labels) {
            labels.classList.add('rovalra-subplace-presence-labels');
            labels.style.maxWidth = '90px';
            labels.style.width = '90px';
            labels.style.marginLeft = '0';
            labels.style.marginRight = '0';
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
}

export async function updateFriendTilePresence(card, userId) {
    const presence = await fetchPresenceBatched(userId);
    if (!presence) return;
    const presenceType = presence.userPresenceType ?? 0;
    const gameName =
        presenceType === 2 ? await getPresenceDisplayGameName(presence) : null;
    updateUserCardPresence(card, presenceType, gameName);
}

export async function batchFetchPresence(userIds) {
    try {
        const res = await callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds },
        }).catch(() => null);
        return new Map((res?.userPresences || []).map((p) => [p.userId, p]));
    } catch (e) {
        return new Map();
    }
}

export function createUserCard({
    displayName,
    username,
    thumbData,
    href,
    showUsername = true,
    presenceInfo = 0,
    gameName,
    isVerified = false,
}) {
    const presence = PRESENCE_MAP[presenceInfo] || PRESENCE_MAP[0];
    const showSublabel = showUsername && gameName ? true : showUsername;
    const sublabelText = showUsername && gameName ? getCompactPresenceLabel(gameName) : username;
    const sublabelFontSize = gameName
        ? getCompactPresenceLabel(gameName).length > 22
            ? '9.5px'
            : '10.75px'
        : '12px';
    const sublabelWhiteSpace = gameName ? 'normal' : 'nowrap';
    const sublabelTitle = showUsername && gameName ? gameName : sublabelText;
    const presenceTitle =
        presenceInfo === 2 && gameName ? gameName : presence.title;
    const assets = getAssets();
    const verifiedSvg = isVerified
        ? `<img src="${assets.verifiedBadgeMono}" alt="" style="width: 14px; height: 14px; flex-shrink: 0; margin-left: 2px; vertical-align: middle; color: var(--rovalra-playbutton-color);">`
        : '';

    const tileContainer = document.createElement('div');
    tileContainer.className = gameName
        ? 'friends-carousel-tile rovalra-subplace-presence-card'
        : 'friends-carousel-tile';
    const innerHtml = `
        <div class="user-card user-card-content rovalra-user-card" style="width: 90px; position: relative; overflow: visible;">
            <div class="avatar avatar-card-fullbody avatar-card-image-container user-profile-header-details-avatar-container" style="width: 90px; height: 90px; position: relative;">
                ${href ? `<a href="${href}" class="avatar-card-link">` : ''}
                    <span class="thumbnail-2d-container avatar-card-image" style="width: 100%; height: 100%; display: block; overflow: hidden; border-radius: 50%; background: var(--rovalra-button-background-color);"></span>
                ${href ? `</a>` : ''}
                <div class="avatar-status"><span data-testid="presence-icon" title="${presenceTitle}" class="${presence.class}"></span></div>
            </div>
            ${
                showSublabel
                    ? `
            <div class="user-card-labels ${gameName ? 'rovalra-subplace-presence-labels' : ''}" style="display: block; margin-top: 8px; max-width: 90px; width: 90px; position: relative; box-sizing: border-box; text-align: center; pointer-events: auto;">
                <div class="user-card-name" style="overflow: hidden; line-height: 1.2;">
                    <span style="font-weight: 400; font-size: 12.8px; color: var(--rovalra-main-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; max-width: 90px; text-align: center; transition: text-decoration 0.2s ease;">${displayName}${verifiedSvg}</span>
                </div>
                <div class="user-card-subname ${gameName ? 'rovalra-subplace-presence-label' : ''}" title="${sublabelTitle}" style="overflow: visible; text-overflow: clip; white-space: ${sublabelWhiteSpace}; font-size: ${sublabelFontSize}; color: var(--rovalra-secondary-text-color); max-width: ${gameName ? '150px' : '90px'}; width: ${gameName ? '150px' : 'auto'}; position: ${gameName ? 'absolute' : 'static'}; left: ${gameName ? '50%' : 'auto'}; top: ${gameName ? '20px' : 'auto'}; transform: ${gameName ? 'translateX(-50%)' : 'none'}; box-sizing: border-box; display: block; text-align: center; transition: text-decoration 0.2s ease; line-height: 1.08; overflow-wrap: break-word;">${sublabelText}</div>
            </div>
            `
                    : `
            <div class="user-card-labels-no-username" style="margin-top: 8px; max-width: 90px; width: 90px; text-align: center;">
                <div class="user-card-name" style="overflow: hidden; line-height: 1.2;">
                    <span style="font-weight: 400; font-size: 12.8px; color: var(--rovalra-main-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; max-width: 90px; text-align: center; transition: text-decoration 0.2s ease;">${displayName}${verifiedSvg}</span>
                </div>
            </div>
            `
            }
        </div>
    `;
    tileContainer.innerHTML = DOMPurify.sanitize(
        `<div class="user-card-inner">${innerHtml}</div>`,
    );
    const thumbEl = createThumbnailElement(thumbData, displayName, '', {
        width: '90px',
        height: '90px',
    });
    tileContainer.querySelector('.avatar-card-image').appendChild(thumbEl);
    tileContainer.style.cursor = href ? 'pointer' : 'default';
    tileContainer.addEventListener('mouseenter', () => {
        const nameSpan = tileContainer.querySelector('.user-card-name span');
        if (nameSpan) nameSpan.style.textDecoration = 'underline';
        const subname = tileContainer.querySelector('.user-card-subname');
        if (subname) subname.style.textDecoration = 'underline';
    });
    tileContainer.addEventListener('mouseleave', () => {
        const nameSpan = tileContainer.querySelector('.user-card-name span');
        if (nameSpan) nameSpan.style.textDecoration = 'none';
        const subname = tileContainer.querySelector('.user-card-subname');
        if (subname) subname.style.textDecoration = 'none';
    });
    return tileContainer;
}

export function createFriendTile(
    item,
    thumbData,
    { displayName, username, isHidden, isVerified = false },
) {
    const href = isHidden
        ? ''
        : `https://www.roblox.com/users/${item.id}/profile`;
    const card = createUserCard({
        displayName: displayName || '',
        username: isHidden ? '' : username || '',
        thumbData: thumbData || { state: 'Error' },
        href,
        presenceInfo: 0,
        isVerified,
    });

    if (
        !isHidden &&
        (displayName === 'Account Deleted' ||
            username?.includes('Account Deleted'))
    ) {
        callRobloxApiJson({
            subdomain: 'users',
            endpoint: `/v1/users/${item.id}`,
            method: 'GET',
        })
            .then((user) => {
                if (user && user.name) {
                    const nameSpan = card.querySelector('.user-card-name span');
                    const subname = card.querySelector('.user-card-subname');
                    if (nameSpan) {
                        const textNode = Array.from(nameSpan.childNodes).find(
                            (n) => n.nodeType === Node.TEXT_NODE,
                        );
                        if (textNode) textNode.textContent = user.displayName;
                    }
                    if (subname) {
                        subname.textContent = `@${user.name}`;
                    }
                }
            })
            .catch(() => {});
    }

    if (!isHidden) {
        fetchPresenceBatched(item.id).then((presence) => {
            if (!presence) return;
            const presenceType = presence.userPresenceType ?? 0;
            getPresenceDisplayGameName(presence).then((gameName) => {
                updateUserCardPresence(card, presenceType, gameName);
            });
        });
    }

    return card;
}

export async function createFriendTiles(
    containerEl,
    items,
    thumbData,
    profiles,
) {
    const friendIds = items.filter((i) => i.id > 0).map((i) => i.id);
    const presenceMap = await batchFetchPresence(friendIds);

    for (const item of items) {
        const isHidden = item.id === -1;
        const profile = isHidden ? null : profiles.get(item.id);
        if (!isHidden && !profile) continue;

        const thumb = isHidden ? { state: 'Error' } : thumbData.get(item.id);
        let displayName = isHidden ? 'Hidden User' : profile.names.combinedName;
        let username = isHidden ? '' : profile.names.username;

        if (
            !isHidden &&
            (displayName === 'Account Deleted' ||
                username === 'Account Deleted')
        ) {
            const userRes = await callRobloxApiJson({
                subdomain: 'users',
                endpoint: `/v1/users/${item.id}`,
                method: 'GET',
            }).catch(() => null);

            if (userRes && userRes.name) {
                displayName = userRes.displayName;
                username = userRes.name;
            }
        }

        const presence = isHidden ? null : presenceMap.get(item.id);
        const presenceType = presence?.userPresenceType ?? 0;
        const gameName =
            presenceType === 2 ? await getPresenceDisplayGameName(presence) : null;

        const card = createUserCard({
            displayName,
            username: gameName || (username ? `@${username}` : ''),
            thumbData: thumb,
            href: isHidden
                ? ''
                : `https://www.roblox.com/users/${item.id}/profile`,
            presenceInfo: presenceType,
            gameName: isHidden || !gameName ? '' : gameName,
        });
        containerEl.appendChild(card);
    }
}

export async function createUserCardsFromIds(containerEl, ids, limit = 7) {
    const validIds = ids.filter((id) => id > 0).slice(0, limit);
    if (validIds.length === 0) return;

    const [profilesRes, thumbs, presenceRes] = await Promise.all([
        callRobloxApiJson({
            subdomain: 'apis',
            endpoint: '/user-profile-api/v1/user/profiles/get-profiles',
            method: 'POST',
            body: {
                userIds: validIds,
                fields: ['names.combinedName', 'isVerified', 'names.username'],
            },
        }),
        getBatchThumbnails(validIds, 'AvatarHeadshot', '150x150'),
        callRobloxApiJson({
            subdomain: 'presence',
            endpoint: '/v1/presence/users',
            method: 'POST',
            body: { userIds: validIds },
        }).catch(() => null),
    ]);

    const profileMap = new Map(
        (profilesRes?.profileDetails || []).map((p) => [p.userId, p]),
    );
    const thumbMap = new Map(thumbs.map((t) => [t.targetId, t]));
    const presenceMap = new Map(
        (presenceRes?.userPresences || []).map((p) => [p.userId, p]),
    );

    for (const id of validIds) {
        const profile = profileMap.get(id);
        if (!profile) continue;

        let displayName = profile.names.combinedName;
        let username = profile.names.username;

        if (
            displayName === 'Account Deleted' ||
            username === 'Account Deleted'
        ) {
            const userRes = await callRobloxApiJson({
                subdomain: 'users',
                endpoint: `/v1/users/${id}`,
                method: 'GET',
            }).catch(() => null);

            if (userRes && userRes.name) {
                displayName = userRes.displayName;
                username = userRes.name;
            }
        }

        const presence = presenceMap.get(id);
        const presenceType = presence?.userPresenceType ?? 0;
        const gameName =
            presenceType === 2 ? await getPresenceDisplayGameName(presence) : null;

        const card = createUserCard({
            displayName: displayName,
            username: `@${username}`,
            showUsername: true,
            isVerified: profile.names.isVerified || false,
            thumbData: thumbMap.get(id) || { state: 'Error' },
            href: `https://www.roblox.com/users/${id}/profile`,
            presenceInfo: presenceType,
            gameName,
        });
        containerEl.appendChild(card);
    }
}
