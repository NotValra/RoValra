// What's New: shows what changed in an experience since you last looked at it.
// New badges, new Game Passes and published updates come from their timestamps,
// renames, description edits and Game Pass price changes come from a small snapshot
// RoValra keeps locally (IndexedDB) of the experience from your previous visit.

import { observeElement } from '../../../core/observer.js';
import { callRobloxApiJson } from '../../../core/api.js';
import {
    getUniverseIdFromPlaceId,
    getUniversesDetails,
} from '../../../core/apis/games.js';
import { getPlaceIdFromUrl } from '../../../core/idExtractor.js';
import { settings } from '../../../core/settings/getSettings.js';
import { ts } from '../../../core/locale/i18n.js';
import * as indexedDb from '../../../core/storage/indexedDb.js';
import { createPillToggle } from '../../../core/ui/general/pillToggle.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { createRobuxIcon } from '../../../core/ui/robuxIcon.js';
import {
    createThumbnailElement,
    getQueuedThumbnail,
} from '../../../core/thumbnail/thumbnails.js';
import { createSpinner } from '../../../core/ui/spinner.js';
import { createButton } from '../../../core/ui/buttons.js';
import { diffWords } from '../../../core/utils/textDiff.js';

export const WHATS_NEW_STORE = 'whatsNew';

const DAY_MS = 24 * 60 * 60 * 1000;
// Page loads closer together than this count as the same visit, so refreshing
// the page doesn't wipe what you haven't looked at yet.
const VISIT_GAP_MS = 30 * 60 * 1000;
const RANGE_DAYS = { week: 7, month: 30, quarter: 90 };
const MAX_BADGE_PAGES = 5;
const MAX_PASS_PAGES = 10;
const INITIAL_VISIBLE_ITEMS = 6;
const DESCRIPTION_CONTEXT_CHARS = 80;
const DATE_PLACEHOLDER = '⁣date⁣';

const SECTION_ATTR = 'data-rovalra-whats-new';
const dataPromises = new Map();

function toTime(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
}

async function getCurrentUniverseId() {
    const metaData = document.getElementById('game-detail-meta-data');
    const metaUniverseId = Number(metaData?.dataset?.universeId);
    if (Number.isSafeInteger(metaUniverseId) && metaUniverseId > 0) {
        return metaUniverseId;
    }

    const placeId = getPlaceIdFromUrl();
    if (!placeId) return null;
    const universeId = Number(await getUniverseIdFromPlaceId(placeId));
    return Number.isSafeInteger(universeId) && universeId > 0
        ? universeId
        : null;
}

// Data fetching

async function fetchUniverseDetails(universeId) {
    const [details] = await getUniversesDetails([universeId]);
    if (!details) throw new Error('No universe details');
    return details;
}

async function fetchRecentBadges(universeId, sinceTime) {
    const badges = [];
    let cursor = '';
    for (let page = 0; page < MAX_BADGE_PAGES; page++) {
        const data = await callRobloxApiJson({
            subdomain: 'badges',
            endpoint:
                `/v1/universes/${universeId}/badges?limit=100&sortOrder=Desc` +
                (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''),
            method: 'GET',
        });
        const pageBadges = Array.isArray(data?.data) ? data.data : [];
        badges.push(...pageBadges);

        // Badges come newest first, stop once we're past the oldest date we need.
        const oldest = toTime(pageBadges[pageBadges.length - 1]?.created);
        cursor = data?.nextPageCursor || '';
        if (!cursor || (oldest !== null && oldest < sinceTime)) break;
    }
    return badges.filter((badge) => badge?.enabled !== false);
}

async function fetchAllGamePasses(universeId) {
    const passes = [];
    const seenTokens = new Set();
    let pageToken = '';
    for (let page = 0; page < MAX_PASS_PAGES; page++) {
        const data = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint:
                `/game-passes/v1/universes/${universeId}/game-passes?pageSize=100&passView=Full` +
                (pageToken
                    ? `&pageToken=${encodeURIComponent(pageToken)}`
                    : ''),
            method: 'GET',
        });
        if (Array.isArray(data?.gamePasses)) passes.push(...data.gamePasses);

        const next = data?.nextPageToken || '';
        if (!next || seenTokens.has(next)) return passes;
        seenTokens.add(next);
        pageToken = next;
    }
    // Hit the page cap, the list is incomplete so it can't be used for diffs.
    throw new Error('Too many Game Passes to compare');
}

async function fetchUpdateHistory(rootPlaceId) {
    const data = await callRobloxApiJson({
        isRovalraApi: true,
        endpoint: `/v1/games/history?place_id=${rootPlaceId}`,
        method: 'GET',
    });
    return Array.isArray(data?.history) ? data.history : [];
}

// Snapshots and visits

function buildPassSnapshot(passes) {
    const snapshot = {};
    for (const pass of passes) {
        if (!pass?.id) continue;
        snapshot[pass.id] = {
            n: pass.displayName || pass.name || '',
            p: typeof pass.price === 'number' ? pass.price : null,
            s: pass.isForSale === true,
            i: pass.displayIconImageAssetId || null,
        };
    }
    return snapshot;
}

function buildSnapshot(details, passes, fallback) {
    const snapshot = { ...(fallback || {}) };
    if (details) {
        snapshot.name = details.name ?? '';
        snapshot.description = details.description ?? '';
        snapshot.maxPlayers = details.maxPlayers ?? null;
        snapshot.price = details.price ?? null;
    }
    if (passes) snapshot.passes = buildPassSnapshot(passes);
    return snapshot;
}

function diffSnapshots(before, details, passes) {
    const changes = {
        renamed: null,
        description: null,
        settings: [],
        passes: [],
    };
    if (!before) return changes;

    if (details && typeof before.name === 'string') {
        if (before.name !== (details.name ?? '')) {
            changes.renamed = { from: before.name, to: details.name ?? '' };
        }
        if (
            typeof before.description === 'string' &&
            before.description !== (details.description ?? '')
        ) {
            changes.description = {
                from: before.description,
                to: details.description ?? '',
            };
        }
        if (
            before.maxPlayers != null &&
            details.maxPlayers != null &&
            before.maxPlayers !== details.maxPlayers
        ) {
            changes.settings.push({
                type: 'maxPlayers',
                from: before.maxPlayers,
                to: details.maxPlayers,
            });
        }
        // Roblox uses both null and 0 for "no paid access".
        const beforePrice = before.price || null;
        const currentPrice = details.price || null;
        if ('price' in before && beforePrice !== currentPrice) {
            changes.settings.push({
                type: 'paidAccess',
                from: beforePrice,
                to: currentPrice,
            });
        }
    }

    if (passes && before.passes) {
        const current = buildPassSnapshot(passes);
        for (const [id, now] of Object.entries(current)) {
            const old = before.passes[id];
            if (!old) continue; // New passes are shown from their created date.
            if (old.s !== now.s) {
                changes.passes.push({
                    id,
                    name: now.n,
                    icon: now.i,
                    type: now.s ? 'onSale' : 'offSale',
                    from: old.p,
                    to: now.p,
                });
            } else if (
                now.s &&
                old.p !== null &&
                now.p !== null &&
                old.p !== now.p
            ) {
                changes.passes.push({
                    id,
                    name: now.n,
                    icon: now.i,
                    type: 'price',
                    from: old.p,
                    to: now.p,
                });
            }
        }
        for (const [id, old] of Object.entries(before.passes)) {
            if (!current[id]) {
                changes.passes.push({
                    id,
                    name: old.n,
                    icon: old.i,
                    type: 'removed',
                    from: old.p,
                    to: null,
                });
            }
        }
    }

    return changes;
}

async function readVisitRecord(universeId) {
    try {
        return await indexedDb.get(WHATS_NEW_STORE, universeId);
    } catch (error) {
        console.warn('RoValra: Whats New could not read visit history', error);
        return null;
    }
}

async function loadExperienceChanges(universeId) {
    const now = Date.now();
    const record = await readVisitRecord(universeId);

    // A new visit starts when the last page load was a while ago, the visit before
    // that then becomes the one we compare against.
    let previous = record?.previous || null;
    if (record?.current && now - record.current.seenAt > VISIT_GAP_MS) {
        previous = record.current;
    }

    const earliest = Math.min(
        now - RANGE_DAYS.quarter * DAY_MS,
        previous?.seenAt ?? Infinity,
    );

    // Badges and passes don't depend on the details, so start them right away.
    const badgesPromise = fetchRecentBadges(universeId, earliest);
    const passesPromise = fetchAllGamePasses(universeId);
    badgesPromise.catch(() => {});
    passesPromise.catch(() => {});

    let details = null;
    try {
        details = await fetchUniverseDetails(universeId);
    } catch (error) {
        console.warn(
            'RoValra: Whats New could not load experience details',
            error,
        );
    }

    const [badgesResult, passesResult, historyResult] =
        await Promise.allSettled([
            badgesPromise,
            passesPromise,
            details?.rootPlaceId
                ? fetchUpdateHistory(details.rootPlaceId)
                : Promise.reject(new Error('No root place')),
        ]);

    const badges =
        badgesResult.status === 'fulfilled' ? badgesResult.value : null;
    const passes =
        passesResult.status === 'fulfilled' ? passesResult.value : null;
    const history =
        historyResult.status === 'fulfilled' ? historyResult.value : null;

    if (!details && !badges && !passes && !history) {
        throw new Error('Every request failed');
    }

    const snapshotChanges = diffSnapshots(previous?.snapshot, details, passes);

    try {
        await indexedDb.set(WHATS_NEW_STORE, universeId, {
            version: 1,
            previous,
            current: {
                seenAt: now,
                snapshot: buildSnapshot(
                    details,
                    passes,
                    record?.current?.snapshot,
                ),
            },
        });
    } catch (error) {
        console.warn('RoValra: Whats New could not save visit', error);
    }

    return {
        now,
        previousVisit: previous?.seenAt ?? null,
        badges,
        passes,
        history,
        snapshotChanges,
        partial: !details || !badges || !passes || !history,
    };
}

// Filtering by the selected range

function getRangeStart(data, range) {
    if (range === 'lastVisit' && data.previousVisit) return data.previousVisit;
    return data.now - (RANGE_DAYS[range] || RANGE_DAYS.month) * DAY_MS;
}

function collectChanges(data, range) {
    const start = getRangeStart(data, range);
    const isAfterStart = (value) => (toTime(value) ?? -Infinity) >= start;

    const updates = (data.history || [])
        .filter((entry) => isAfterStart(entry.first_seen))
        .sort(
            (a, b) =>
                (Number(b.place_version) || 0) - (Number(a.place_version) || 0),
        );
    const badges = (data.badges || [])
        .filter((badge) => isAfterStart(badge.created))
        .sort((a, b) => toTime(b.created) - toTime(a.created));
    const passes = (data.passes || [])
        .filter((pass) => isAfterStart(pass.created))
        .sort((a, b) => toTime(b.created) - toTime(a.created));

    // Snapshot changes happened sometime after the previous visit, so they only
    // belong in ranges that fully include that visit.
    const snapshotApplies =
        data.previousVisit !== null && data.previousVisit >= start;
    const snapshot = snapshotApplies
        ? data.snapshotChanges
        : { renamed: null, description: null, settings: [], passes: [] };

    return {
        start,
        updates,
        badges,
        passes,
        renamed: snapshot.renamed,
        description: snapshot.description,
        settings: snapshot.settings,
        passChanges: snapshot.passes,
    };
}

// Rendering helpers

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

// Puts an interactive timestamp where {{date}} is in a translated string,
// so translators can still move the date around in the sentence.
function textWithDate(key, date, options = {}) {
    const wrapper = el('span');
    const text = ts(key, { ...options, date: DATE_PLACEHOLDER });
    const [before, after = ''] = text.split(DATE_PLACEHOLDER);
    wrapper.append(
        before,
        createInteractiveTimestamp(date, { compact: true }),
        after,
    );
    return wrapper;
}

function createPrice(price) {
    const wrapper = el('span', 'rovalra-whats-new-price');
    if (price === null || price === undefined) {
        wrapper.textContent = ts('common.offSale');
        return wrapper;
    }
    if (price === 0) {
        wrapper.textContent = ts('whatsNew.priceFree');
        return wrapper;
    }
    wrapper.append(
        createRobuxIcon({ size: '14px' }),
        el('span', '', price.toLocaleString()),
    );
    return wrapper;
}

function createThumb(id, type, alt) {
    const holder = el('div', 'rovalra-whats-new-thumb');
    const placeholder = createThumbnailElement(
        { state: 'Pending', thumbnailType: type },
        alt,
        'rovalra-whats-new-thumb-image',
    );
    holder.appendChild(placeholder);
    getQueuedThumbnail(id, type, '150x150')
        .then((data) => {
            placeholder.replaceWith(
                createThumbnailElement(
                    data,
                    alt,
                    'rovalra-whats-new-thumb-image',
                ),
            );
        })
        .catch(() => {
            placeholder.replaceWith(
                createThumbnailElement(
                    null,
                    alt,
                    'rovalra-whats-new-thumb-image',
                ),
            );
        });
    return holder;
}

function slugify(name) {
    return (
        encodeURIComponent(
            String(name || '')
                .replace(/[^\w\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-'),
        ) || 'item'
    );
}

function createItemCard({ href, thumb, name, meta }) {
    const card = el('a', 'rovalra-whats-new-card');
    card.href = href;
    card.append(thumb);
    const info = el('div', 'rovalra-whats-new-card-info');
    info.append(el('div', 'rovalra-whats-new-card-name text-emphasis', name));
    for (const line of meta) {
        const metaLine = el(
            'div',
            'rovalra-whats-new-card-meta text-secondary',
        );
        metaLine.append(line);
        info.append(metaLine);
    }
    card.append(info);
    return card;
}

function createLimitedGrid(items, renderItem) {
    const wrapper = el('div');
    const grid = el('div', 'rovalra-whats-new-grid');
    wrapper.append(grid);

    const renderRange = (from, to) => {
        items.slice(from, to).forEach((item) => grid.append(renderItem(item)));
    };
    renderRange(0, INITIAL_VISIBLE_ITEMS);

    const remaining = items.length - INITIAL_VISIBLE_ITEMS;
    if (remaining > 0) {
        const button = createButton(
            ts('whatsNew.showMore', { count: remaining }),
            'secondary',
            { classList: ['rovalra-whats-new-more'] },
        );
        button.addEventListener('click', () => {
            renderRange(INITIAL_VISIBLE_ITEMS, items.length);
            button.remove();
        });
        wrapper.append(button);
    }
    return wrapper;
}

// Cuts unchanged text down to roughly `length` characters on a word boundary.
function headText(text, length) {
    const cut = text.slice(0, length);
    const lastSpace = cut.search(/\s\S*$/);
    return lastSpace > length / 2 ? cut.slice(0, lastSpace) : cut;
}

function tailText(text, length) {
    const cut = text.slice(-length);
    const firstSpace = cut.search(/\s/);
    return firstSpace !== -1 && firstSpace < length / 2
        ? cut.slice(firstSpace + 1)
        : cut;
}

function createDescriptionDiff(from, to) {
    const block = el('div', 'rovalra-whats-new-diff');
    const segments = diffWords(from, to);
    segments.forEach((segment, index) => {
        if (segment.type === 'added') {
            const ins = el('ins', 'rovalra-whats-new-added', segment.text);
            ins.title = ts('whatsNew.added');
            block.append(ins);
            return;
        }
        if (segment.type === 'removed') {
            const del = el('del', 'rovalra-whats-new-removed', segment.text);
            del.title = ts('whatsNew.removedText');
            block.append(del);
            return;
        }

        // Shorten long unchanged parts and keep a bit of context around the edits.
        const text = segment.text;
        const isFirst = index === 0;
        const isLast = index === segments.length - 1;
        const keep = DESCRIPTION_CONTEXT_CHARS;
        if (text.length <= keep * 2 + 20) {
            block.append(text);
        } else if (isFirst) {
            block.append(el('span', 'rovalra-whats-new-ellipsis', '… '));
            block.append(tailText(text, keep));
        } else if (isLast) {
            block.append(headText(text, keep));
            block.append(el('span', 'rovalra-whats-new-ellipsis', ' …'));
        } else {
            block.append(headText(text, keep));
            block.append(el('span', 'rovalra-whats-new-ellipsis', ' … '));
            block.append(tailText(text, keep));
        }
    });
    return block;
}

function createPassChangeRow(change) {
    const row = el('a', 'rovalra-whats-new-change-row');
    row.href = `/game-pass/${change.id}/${slugify(change.name)}`;
    row.append(
        change.icon
            ? createThumb(change.icon, 'Asset', change.name)
            : createThumb(change.id, 'GamePass', change.name),
    );
    row.append(
        el('span', 'rovalra-whats-new-change-name text-emphasis', change.name),
    );

    const detail = el('span', 'rovalra-whats-new-change-detail');
    if (change.type === 'price') {
        const old = createPrice(change.from);
        old.classList.add('rovalra-whats-new-old-price');
        const direction = change.to > change.from ? 'bad' : 'good';
        const arrow = el(
            'span',
            `rovalra-whats-new-arrow rovalra-whats-new-${direction}`,
            direction === 'bad' ? '▲' : '▼',
        );
        detail.append(
            old,
            el('span', 'text-secondary', '→'),
            createPrice(change.to),
            arrow,
        );
    } else if (change.type === 'onSale') {
        detail.append(
            el(
                'span',
                'rovalra-whats-new-tag rovalra-whats-new-good',
                ts('whatsNew.nowOnSale'),
            ),
            createPrice(change.to),
        );
    } else if (change.type === 'offSale') {
        detail.append(
            el(
                'span',
                'rovalra-whats-new-tag rovalra-whats-new-bad',
                ts('whatsNew.nowOffSale'),
            ),
        );
    } else {
        detail.append(
            el(
                'span',
                'rovalra-whats-new-tag text-secondary',
                ts('whatsNew.removed'),
            ),
        );
    }
    row.append(detail);
    return row;
}

function formatPaidAccess(price) {
    if (!price) return ts('whatsNew.paidAccessNone');
    return ts('whatsNew.robuxAmount', {
        amount: Number(price).toLocaleString(),
    });
}

// Main rendering

function buildSections(changes) {
    const sections = [];

    if (changes.updates.length) {
        const body = el('div');
        body.append(
            textWithDate(
                'whatsNew.updatesSummary',
                changes.updates.reduce((latest, entry) =>
                    toTime(entry.first_seen) > toTime(latest.first_seen)
                        ? entry
                        : latest,
                ).first_seen,
                { count: changes.updates.length },
            ),
        );
        const versions = el('div', 'rovalra-whats-new-versions');
        changes.updates.slice(0, 12).forEach((entry) => {
            const pill = el(
                'span',
                'rovalra-whats-new-version text-caption-medium',
            );
            pill.append(
                el(
                    'span',
                    'text-emphasis',
                    ts('whatsNew.version', { version: entry.place_version }),
                ),
                createInteractiveTimestamp(entry.first_seen, {
                    compact: true,
                }),
            );
            versions.append(pill);
        });
        body.append(versions);
        body.append(
            el(
                'div',
                'rovalra-whats-new-footnote text-secondary',
                ts('whatsNew.updatesTrackingNote'),
            ),
        );
        sections.push({
            key: 'updates',
            accent: 'updates',
            chip: ts('whatsNew.chips.updates', {
                count: changes.updates.length,
            }),
            title: ts('whatsNew.sections.updates'),
            body,
        });
    }

    if (changes.badges.length) {
        sections.push({
            key: 'badges',
            accent: 'badges',
            chip: ts('whatsNew.chips.badges', { count: changes.badges.length }),
            title: ts('whatsNew.sections.badges'),
            body: createLimitedGrid(changes.badges, (badge) => {
                const name = badge.displayName || badge.name;
                const meta = [textWithDate('whatsNew.created', badge.created)];
                const winRate = badge.statistics?.winRatePercentage;
                if (typeof winRate === 'number') {
                    meta.push(
                        ts('whatsNew.winRate', {
                            percent: `${(winRate * 100).toFixed(winRate < 0.01 ? 2 : 1)}%`,
                        }),
                    );
                }
                return createItemCard({
                    href: `/badges/${badge.id}/${slugify(name)}`,
                    thumb: createThumb(badge.id, 'BadgeIcon', name),
                    name,
                    meta,
                });
            }),
        });
    }

    if (changes.passes.length) {
        sections.push({
            key: 'passes',
            accent: 'passes',
            chip: ts('whatsNew.chips.passes', { count: changes.passes.length }),
            title: ts('whatsNew.sections.passes'),
            body: createLimitedGrid(changes.passes, (pass) => {
                const name = pass.displayName || pass.name;
                return createItemCard({
                    href: `/game-pass/${pass.id}/${slugify(name)}`,
                    thumb: pass.displayIconImageAssetId
                        ? createThumb(
                              pass.displayIconImageAssetId,
                              'Asset',
                              name,
                          )
                        : createThumb(pass.id, 'GamePass', name),
                    name,
                    meta: [
                        createPrice(pass.isForSale ? pass.price : null),
                        textWithDate('whatsNew.created', pass.created),
                    ],
                });
            }),
        });
    }

    if (changes.passChanges.length) {
        const list = el('div', 'rovalra-whats-new-change-list');
        changes.passChanges.forEach((change) =>
            list.append(createPassChangeRow(change)),
        );
        sections.push({
            key: 'prices',
            accent: 'prices',
            chip: ts('whatsNew.chips.prices', {
                count: changes.passChanges.length,
            }),
            title: ts('whatsNew.sections.prices'),
            body: list,
        });
    }

    if (changes.renamed) {
        const body = el('div', 'rovalra-whats-new-rename');
        body.append(
            el('del', 'rovalra-whats-new-removed', changes.renamed.from),
            el('span', 'text-secondary', '→'),
            el('ins', 'rovalra-whats-new-added', changes.renamed.to),
        );
        sections.push({
            key: 'renamed',
            accent: 'edits',
            chip: ts('whatsNew.chips.renamed'),
            title: ts('whatsNew.sections.renamed'),
            body,
        });
    }

    if (changes.description) {
        sections.push({
            key: 'description',
            accent: 'edits',
            chip: ts('whatsNew.chips.description'),
            title: ts('whatsNew.sections.description'),
            body: createDescriptionDiff(
                changes.description.from,
                changes.description.to,
            ),
        });
    }

    if (changes.settings.length) {
        const list = el('ul', 'rovalra-whats-new-settings');
        changes.settings.forEach((change) => {
            const text =
                change.type === 'maxPlayers'
                    ? ts('whatsNew.maxPlayers', {
                          from: change.from,
                          to: change.to,
                      })
                    : ts('whatsNew.paidAccess', {
                          from: formatPaidAccess(change.from),
                          to: formatPaidAccess(change.to),
                      });
            list.append(el('li', '', text));
        });
        sections.push({
            key: 'settings',
            accent: 'edits',
            chip: ts('whatsNew.chips.settings', {
                count: changes.settings.length,
            }),
            title: ts('whatsNew.sections.settings'),
            body: list,
        });
    }

    return sections;
}

function renderChanges(content, subtitle, data, range) {
    const changes = collectChanges(data, range);

    subtitle.replaceChildren(
        range === 'lastVisit'
            ? textWithDate('whatsNew.sinceLastVisit', changes.start)
            : textWithDate('whatsNew.since', changes.start),
    );

    const sections = buildSections(changes);
    content.replaceChildren();

    if (!sections.length) {
        content.append(
            el(
                'div',
                'rovalra-whats-new-empty text-secondary',
                ts('whatsNew.nothingNew'),
            ),
        );
    } else {
        const chips = el('div', 'rovalra-whats-new-chips');
        const details = el('div', 'rovalra-whats-new-details');
        details.hidden = true;

        const toggle = createButton(ts('whatsNew.showDetails'), 'secondary', {
            classList: ['rovalra-whats-new-toggle'],
        });
        const setExpanded = (expanded) => {
            details.hidden = !expanded;
            toggle.textContent = ts(
                expanded ? 'whatsNew.hideDetails' : 'whatsNew.showDetails',
            );
            toggle.setAttribute('aria-expanded', String(expanded));
        };
        toggle.addEventListener('click', () => setExpanded(details.hidden));

        sections.forEach((section) => {
            const sectionEl = el('div', 'rovalra-whats-new-section');
            sectionEl.dataset.section = section.key;
            const heading = el('div', 'rovalra-whats-new-section-title');
            heading.append(
                el(
                    'span',
                    `rovalra-whats-new-dot rovalra-whats-new-accent-${section.accent}`,
                ),
                el('span', 'text-emphasis', section.title),
            );
            sectionEl.append(heading, section.body);
            details.append(sectionEl);

            const chip = el(
                'button',
                'rovalra-whats-new-chip text-label-medium',
            );
            chip.type = 'button';
            chip.append(
                el(
                    'span',
                    `rovalra-whats-new-dot rovalra-whats-new-accent-${section.accent}`,
                ),
                el('span', '', section.chip),
            );
            chip.addEventListener('click', () => {
                setExpanded(true);
                sectionEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
                sectionEl.classList.remove('rovalra-whats-new-flash');
                void sectionEl.offsetWidth;
                sectionEl.classList.add('rovalra-whats-new-flash');
            });
            chips.append(chip);
        });

        chips.append(toggle);
        content.append(chips, details);
    }

    if (data.partial) {
        content.append(
            el(
                'div',
                'rovalra-whats-new-footnote text-secondary',
                ts('whatsNew.partialError'),
            ),
        );
    }
    if (data.previousVisit === null) {
        content.append(
            el(
                'div',
                'rovalra-whats-new-footnote text-secondary',
                ts('whatsNew.firstVisit'),
            ),
        );
    }
}

function getChanges(universeId, { retry = false } = {}) {
    if (retry || !dataPromises.has(universeId)) {
        const promise = loadExperienceChanges(universeId);
        promise.catch(() => dataPromises.delete(universeId));
        dataPromises.set(universeId, promise);
    }
    return dataPromises.get(universeId);
}

async function injectSection(descriptionContainer) {
    const aboutContainer = descriptionContainer.parentElement;
    if (!aboutContainer || aboutContainer.querySelector(`[${SECTION_ATTR}]`))
        return;

    const section = el('div', 'rovalra-whats-new');
    section.setAttribute(SECTION_ATTR, 'true');

    const header = el('div', 'rovalra-whats-new-header');
    const titleWrap = el('div', 'rovalra-whats-new-title-wrap');
    titleWrap.append(el('h2', '', ts('whatsNew.title')));
    const subtitle = el('div', 'rovalra-whats-new-subtitle text-secondary');
    titleWrap.append(subtitle);
    header.append(titleWrap);

    const content = el('div', 'rovalra-whats-new-content');
    section.append(header, content);
    // Sits right above the description, Roblox renders Events above that later.
    aboutContainer.insertBefore(section, descriptionContainer);

    const showLoading = () => {
        const loading = el('div', 'rovalra-whats-new-loading text-secondary');
        loading.append(
            createSpinner({ size: '18px' }),
            el('span', '', ts('whatsNew.loading')),
        );
        content.replaceChildren(loading);
    };
    showLoading();

    const universeId = await getCurrentUniverseId();
    if (!universeId) {
        section.remove();
        return;
    }

    const load = async (retry) => {
        showLoading();
        let data;
        try {
            data = await getChanges(universeId, { retry });
        } catch (error) {
            console.error('RoValra: Whats New failed to load', error);
            const errorBox = el(
                'div',
                'rovalra-whats-new-error text-secondary',
            );
            const retryButton = createButton(ts('whatsNew.retry'), 'secondary');
            retryButton.addEventListener('click', () => load(true));
            errorBox.append(
                el('span', '', ts('whatsNew.loadError')),
                retryButton,
            );
            content.replaceChildren(errorBox);
            return;
        }

        const options = [
            { text: ts('whatsNew.ranges.week'), value: 'week' },
            { text: ts('whatsNew.ranges.month'), value: 'month' },
            { text: ts('whatsNew.ranges.quarter'), value: 'quarter' },
        ];
        if (data.previousVisit !== null) {
            options.unshift({
                text: ts('whatsNew.ranges.lastVisit'),
                value: 'lastVisit',
            });
        }
        const initialRange =
            data.previousVisit !== null ? 'lastVisit' : 'month';

        header.querySelector('.rovalra-pill-toggle')?.remove();
        header.append(
            createPillToggle({
                options,
                initialValue: initialRange,
                onChange: (range) =>
                    renderChanges(content, subtitle, data, range),
            }),
        );
        renderChanges(content, subtitle, data, initialRange);
    };

    await load(false);
}

// Events can be added after us, keep the section directly above the description
// so the order is always Events, What's New, Description.
function keepAboveDescription(eventsContainer) {
    const aboutContainer = eventsContainer.parentElement;
    const section = aboutContainer?.querySelector(`:scope > [${SECTION_ATTR}]`);
    const description = aboutContainer?.querySelector(
        ':scope > .game-description-container',
    );
    if (section && description && section.nextElementSibling !== description) {
        aboutContainer.insertBefore(section, description);
    }
}

export async function init() {
    if ((await settings.whatsNewEnabled) === false) return;
    observeElement(
        '.game-about-tab-container > .game-description-container',
        injectSection,
    );
    observeElement(
        '.game-about-tab-container > .virtual-event-game-details-container',
        keepAboveDescription,
    );
}

export default init;
