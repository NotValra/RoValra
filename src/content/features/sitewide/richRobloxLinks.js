import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getUniversesDetails } from '../../core/apis/games.js';
import { getBatchThumbnails } from '../../core/thumbnail/thumbnails.js';
import { getAssets } from '../../core/assets.js';
import { createRobuxIcon } from '../../core/ui/robuxIcon.js';
import { createPill } from '../../core/ui/general/pill.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';

const LINK_PATTERN =
    /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(groups|communities|users|games|catalog|bundles)\/(\d+)/i;
const TYPE_BY_PATH = {
    groups: 'group',
    communities: 'group',
    users: 'user',
    games: 'place',
    catalog: 'asset',
    bundles: 'bundle',
};
const THUMB_TYPE = {
    group: 'GroupIcon',
    user: 'AvatarHeadshot',
    place: 'PlaceIcon',
    asset: 'Asset',
    bundle: 'BundleThumbnail',
};
const BATCH_DELAY = 30;
const BATCH_SIZE = 50;
const HOVER_DELAY = 250;

const resolved = new Map();
const pending = new Map();
let flushTimer = null;

const details = new Map();
let card = null;
let hoverTimer = null;

function parseLink(anchor) {
    const text = anchor.textContent.trim();
    if (!text || (text !== anchor.href && text !== anchor.getAttribute('href')))
        return null;

    let url;
    try {
        url = new URL(anchor.href);
    } catch {
        return null;
    }
    if (url.hostname !== 'roblox.com' && !url.hostname.endsWith('.roblox.com'))
        return null;

    const match = url.pathname.match(LINK_PATTERN);
    if (!match) return null;
    return { type: TYPE_BY_PATH[match[1].toLowerCase()], id: match[2] };
}

function chunk(list) {
    const chunks = [];
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
        chunks.push(list.slice(i, i + BATCH_SIZE));
    }
    return chunks;
}

async function fetchGroups(ids) {
    const json = await callRobloxApiJson({
        subdomain: 'groups',
        endpoint: `/v2/groups?groupIds=${ids.join(',')}`,
    });
    return (json?.data || []).map((g) => ({
        id: g.id,
        name: g.name,
        verified: g.hasVerifiedBadge,
    }));
}

async function fetchUsers(ids) {
    const json = await callRobloxApiJson({
        subdomain: 'users',
        endpoint: '/v1/users',
        method: 'POST',
        body: { userIds: ids.map(Number), excludeBannedUsers: false },
    });
    return (json?.data || []).map((u) => ({
        id: u.id,
        name: u.displayName,
        username: u.name,
        verified: u.hasVerifiedBadge,
    }));
}

async function fetchPlaces(ids) {
    const universeIds = await Promise.all(
        ids.map((id) =>
            callRobloxApiJson({
                subdomain: 'apis',
                endpoint: `/universes/v1/places/${id}/universe`,
            })
                .then((r) => r?.universeId)
                .catch(() => null),
        ),
    );
    const games = await getUniversesDetails(universeIds.filter(Boolean));
    const byUniverse = new Map(games.map((g) => [g.id, g]));

    return ids.flatMap((id, index) => {
        const game = byUniverse.get(universeIds[index]);
        if (!game) return [];
        return [
            {
                id,
                name: game.name,
                creatorVerified: game.creator?.hasVerifiedBadge,
                creator: game.creator?.name,
                playing: game.playing,
                visits: game.visits,
                description: game.description,
            },
        ];
    });
}

function fetchCatalog(itemType) {
    return async (ids) => {
        const json = await callRobloxApiJson({
            subdomain: 'catalog',
            endpoint: '/v1/catalog/items/details',
            method: 'POST',
            body: { items: ids.map((id) => ({ itemType, id: Number(id) })) },
        });
        return (json?.data || []).map((item) => ({
            id: item.id,
            name: item.name,
            creatorVerified: item.creatorHasVerifiedBadge,
            creator: item.creatorName,
            price: item.lowestPrice ?? item.price,
        }));
    };
}

const FETCHERS = {
    group: fetchGroups,
    user: fetchUsers,
    place: fetchPlaces,
    asset: fetchCatalog('Asset'),
    bundle: fetchCatalog('Bundle'),
};

async function resolveType(type, ids) {
    const settle = (id, value) => {
        const key = `${type}:${id}`;
        resolved.get(key)?.resolve(value);
    };

    await Promise.all(
        chunk(ids).map(async (batch) => {
            try {
                const [items, thumbs] = await Promise.all([
                    FETCHERS[type](batch),
                    getBatchThumbnails(batch, THUMB_TYPE[type]).catch(() => []),
                ]);
                const icons = new Map(
                    thumbs.map((t) => [String(t.targetId), t.imageUrl]),
                );
                const byId = new Map(items.map((i) => [String(i.id), i]));
                batch.forEach((id) => {
                    const item = byId.get(id);
                    settle(id, item ? { ...item, icon: icons.get(id) } : null);
                });
            } catch {
                batch.forEach((id) => settle(id, null));
            }
        }),
    );
}

function flush() {
    flushTimer = null;
    const batches = [...pending];
    pending.clear();
    batches.forEach(([type, ids]) => resolveType(type, [...ids]));
}

function lookup(type, id) {
    const key = `${type}:${id}`;
    if (!resolved.has(key)) {
        let resolve;
        const promise = new Promise((r) => (resolve = r));
        resolved.set(key, { promise, resolve });

        if (!pending.has(type)) pending.set(type, new Set());
        pending.get(type).add(id);
        flushTimer ??= setTimeout(flush, BATCH_DELAY);
    }
    return resolved.get(key).promise;
}

function createVerifiedIcon() {
    const icon = document.createElement('img');
    icon.className = 'rovalra-rich-link-verified';
    icon.src = getAssets().verifiedBadge;
    icon.alt = '';
    return icon;
}

function createIcon(type, src, className) {
    const icon = document.createElement('img');
    icon.className =
        `${className} ${type === 'user' ? 'rovalra-rich-round' : ''}`.trim();
    icon.alt = '';
    if (src) icon.src = src;
    return icon;
}

async function enhanceLink(anchor) {
    if (anchor.dataset.rovalraRichLink) return;
    const link = parseLink(anchor);
    if (!link) return;
    anchor.dataset.rovalraRichLink = 'pending';

    const data = await lookup(link.type, link.id);
    if (!data || !anchor.isConnected) {
        anchor.dataset.rovalraRichLink = 'failed';
        return;
    }

    const pill = document.createElement('span');
    pill.className = 'rovalra-rich-link';
    pill.append(createIcon(link.type, data.icon, 'rovalra-rich-link-icon'));

    const name = document.createElement('span');
    name.className = 'rovalra-rich-link-name';
    name.textContent = data.name;
    pill.append(name);
    if (data.verified) pill.append(createVerifiedIcon());

    anchor.dataset.rovalraRichLink = 'done';
    anchor.classList.add('rovalra-rich-link-anchor');
    anchor.replaceChildren(pill);

    anchor.addEventListener('mouseenter', () =>
        scheduleCard(anchor, link, data),
    );
    anchor.addEventListener('mouseleave', hideCard);
}

async function loadDetails(link, data) {
    const key = `${link.type}:${link.id}`;
    if (details.has(key)) return details.get(key);

    const load = async () => {
        if (link.type === 'group') {
            const g = await callRobloxApiJson({
                subdomain: 'groups',
                endpoint: `/v1/groups/${link.id}`,
            });
            return {
                subtitle: g.owner
                    ? ts('richLinks.by', { name: g.owner.displayName })
                    : null,
                subtitleVerified: g.owner?.hasVerifiedBadge,
                stats: [
                    ts('richLinks.members', {
                        count: formatCount(g.memberCount),
                    }),
                ],
                description: g.description,
            };
        }
        if (link.type === 'user') {
            const u = await callRobloxApiJson({
                subdomain: 'users',
                endpoint: `/v1/users/${link.id}`,
            });
            return {
                subtitle: `@${u.name}`,
                stats: [],
                description: u.description,
            };
        }
        if (link.type === 'place') {
            return {
                subtitle: data.creator
                    ? ts('richLinks.by', { name: data.creator })
                    : null,
                subtitleVerified: data.creatorVerified,
                stats: [
                    ts('richLinks.playing', {
                        count: formatCount(data.playing),
                    }),
                    ts('richLinks.visits', { count: formatCount(data.visits) }),
                ],
                description: data.description,
            };
        }
        return {
            subtitle: data.creator
                ? ts('richLinks.by', { name: data.creator })
                : null,
            subtitleVerified: data.creatorVerified,
            stats: [],
            price: data.price,
            description: null,
        };
    };

    const promise = load().catch(() => null);
    details.set(key, promise);
    return promise;
}

function formatCount(value) {
    return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(
        value || 0,
    );
}

function positionCard(anchor) {
    const rect = anchor.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const margin = 8;

    let top = rect.bottom + margin;
    if (top + cardRect.height > window.innerHeight - margin) {
        top = rect.top - cardRect.height - margin;
    }
    const left = Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - cardRect.width - margin,
    );
    card.style.top = `${Math.max(margin, top)}px`;
    card.style.left = `${left}px`;
}

function renderCard(link, data, extra) {
    const header = document.createElement('div');
    header.className = 'rovalra-rich-card-header';
    header.append(createIcon(link.type, data.icon, 'rovalra-rich-card-icon'));

    const text = document.createElement('div');
    text.className = 'rovalra-rich-card-text';

    const title = document.createElement('div');
    title.className = 'rovalra-rich-card-title text-label-large';
    const titleName = document.createElement('span');
    titleName.textContent = data.name;
    title.append(titleName);
    if (data.verified) title.append(createVerifiedIcon());
    text.append(title);

    if (extra?.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.className = 'rovalra-rich-card-subtitle text-caption-medium';
        const subtitleText = document.createElement('span');
        subtitleText.textContent = extra.subtitle;
        subtitle.append(subtitleText);
        if (extra.subtitleVerified) subtitle.append(createVerifiedIcon());
        text.append(subtitle);
    }
    header.append(text);

    const parts = [header];
    const pills = [...(extra?.stats || []).map((stat) => createPill(stat))];
    if (extra && 'price' in extra)
        pills.push(createPill(createPrice(extra.price)));
    if (pills.length) {
        const stats = document.createElement('div');
        stats.className = 'rovalra-rich-card-pills';
        stats.append(...pills);
        parts.push(stats);
    }
    if (extra?.description) {
        const description = document.createElement('div');
        description.className = 'rovalra-rich-card-description text-body-small';
        description.textContent = extra.description;
        parts.push(description);
    }
    if (!extra) {
        const loading = document.createElement('div');
        loading.className = 'rovalra-rich-card-stats text-caption-medium';
        loading.textContent = ts('richLinks.loading');
        parts.push(loading);
    }
    card.replaceChildren(...parts);
}

function createPrice(price) {
    if (typeof price !== 'number') return ts('richLinks.offSale');
    if (price === 0) return ts('richLinks.free');

    const content = document.createElement('span');
    content.className = 'rovalra-rich-card-price';
    const amount = document.createElement('span');
    amount.textContent = price.toLocaleString();
    content.append(createRobuxIcon({ size: '16px' }), amount);
    return content;
}

function scheduleCard(anchor, link, data) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(async () => {
        if (!card) {
            card = document.createElement('div');
            card.className = 'rovalra-rich-card';
            card.dataset.rovalraObserverIgnore = 'true';
            document.body.append(card);
        }
        card.dataset.owner = `${link.type}:${link.id}`;
        renderCard(link, data, null);
        card.classList.add('is-visible');
        positionCard(anchor);

        const extra = await loadDetails(link, data);
        if (card.dataset.owner !== `${link.type}:${link.id}`) return;
        if (!card.classList.contains('is-visible')) return;
        renderCard(link, data, extra || { stats: [] });
        positionCard(anchor);
    }, HOVER_DELAY);
}

function hideCard() {
    clearTimeout(hoverTimer);
    if (!card) return;
    card.classList.remove('is-visible');
    card.dataset.owner = '';
}

export async function init() {
    if (!(await settings.richRobloxLinksEnabled)) return;

    window.addEventListener('scroll', hideCard, {
        capture: true,
        passive: true,
    });
    observeElement('a.text-link', enhanceLink, { multiple: true });
}
