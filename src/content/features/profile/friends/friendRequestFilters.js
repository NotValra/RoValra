import {
    observeAttributes,
    observeElement,
    observeText,
} from '../../../core/observer.js';
import { callRobloxApi, callRobloxApiJson } from '../../../core/api.js';
import { settings } from '../../../core/settings/getSettings.js';
import { ts } from '../../../core/locale/i18n.js';
import { createDropdown } from '../../../core/ui/dropdown.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { createPillToggle } from '../../../core/ui/general/pillToggle.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { getBatchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import { getAssets } from '../../../core/assets.js';
import { createInteractiveTimestamp } from '../../../core/ui/time/time.js';
import { INSIGHT_CASES, RANKING_STRATEGIES } from '../../../core/apis/users.js';

const HEADER_SELECTOR = '.request-tab-header';
const NATIVE_CAPTION_SELECTOR =
    '.friends-content .avatar-card:not(.rovalra-filtered-request-card) .avatar-card-caption';
const HEADER_BATCH_SIZE = 25;
const INSIGHTS_BATCH_SIZE = 100;
const MAX_CONCURRENT_BATCHES = 2;
const MAX_ATTEMPTS = 4;
const RATE_LIMIT_BUFFER_MS = 500;
const FALLBACK_RETRY_MS = 5000;
const PAGE_SIZE = 36;
const COUNT_API_CAP = 500;

// Premium is left out, Roblox hides it for other users in every batched API
const BADGE_FILTERS = ['plus', 'verified', 'admin'];
const RANGE_FILTERS = ['mutuals', 'friends', 'followers', 'followings'];
const SORT_KEYS = [
    'sent',
    'mutuals',
    'friends',
    'followers',
    'followings',
    'joined',
];

const userDataCache = new Map();
let filters = createEmptyFilters();
let sort = { key: 'sent', descending: true };
let renderedMatches = [];
let renderedCount = 0;
let applyToken = 0;
let requestsPromise = null;
let cachedRequests = null;
let loadProgressListener = null;
let limitsPromise = null;
let limitsReady = false;

function createEmptyFilters() {
    return {
        badges: Object.fromEntries(BADGE_FILTERS.map((key) => [key, 'any'])),
        ranges: Object.fromEntries(
            RANGE_FILTERS.map((key) => [key, { min: null, max: null }]),
        ),
        joined: { from: null, to: null },
    };
}

function countActiveFilters(current) {
    const badges = BADGE_FILTERS.filter(
        (key) => current.badges[key] !== 'any',
    ).length;
    const ranges = RANGE_FILTERS.filter(
        (key) =>
            current.ranges[key].min !== null ||
            current.ranges[key].max !== null,
    ).length;
    const joined =
        current.joined.from !== null || current.joined.to !== null ? 1 : 0;
    return badges + ranges + joined;
}

function hasActiveFilters(current) {
    return countActiveFilters(current) > 0;
}

// The API already returns requests newest first
function isDefaultSort(current) {
    return current.key === 'sent' && current.descending;
}

function parseNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function parseDate(value, endOfDay = false) {
    if (!value) return null;
    const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

const rateLimitResets = new Map();

function getRateLimitKey(options) {
    return `${options.subdomain}${options.endpoint.split('?')[0]}`;
}

function getResetDelay(response) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (!Number.isFinite(reset) || reset <= 0) return 0;
    return (
        (reset > 1e9 ? Math.max(0, reset * 1000 - Date.now()) : reset * 1000) +
        RATE_LIMIT_BUFFER_MS
    );
}

async function waitForRateLimit(key) {
    const delay = (rateLimitResets.get(key) || 0) - Date.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
}

async function fetchRateLimited(options) {
    const key = getRateLimitKey(options);

    for (let attempt = 0; ; attempt++) {
        await waitForRateLimit(key);
        const response = await callRobloxApi(options);

        const remaining = Number(response.headers.get('x-ratelimit-remaining'));
        if (
            response.status === 429 ||
            (Number.isFinite(remaining) && remaining <= 0)
        ) {
            const resetDelay =
                getResetDelay(response) ||
                (response.status === 429 ? FALLBACK_RETRY_MS : 0);
            rateLimitResets.set(
                key,
                Math.max(
                    rateLimitResets.get(key) || 0,
                    Date.now() + resetDelay,
                ),
            );
        }

        if (response.ok) return response.json();

        const isTransient = response.status === 429 || response.status >= 500;
        if (!isTransient || attempt + 1 >= MAX_ATTEMPTS) {
            const error = new Error(
                `API request failed with status ${response.status}`,
            );
            error.status = response.status;
            throw error;
        }
        if (response.status !== 429) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
    }
}

async function fetchAllRequests(onProgress) {
    const requests = [];
    let cursor = null;

    do {
        const response = await fetchRateLimited({
            subdomain: 'friends',
            endpoint: `/v1/my/friends/requests?limit=100&sortOrder=Desc${
                cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
            }`,
        });
        requests.push(...(response?.data || []));
        cursor = response?.nextPageCursor || null;
        onProgress?.(requests.length);
    } while (cursor);

    return requests;
}

function loadRequests() {
    if (!requestsPromise) {
        requestsPromise = fetchAllRequests((count) =>
            loadProgressListener?.(count),
        )
            .then((requests) => {
                cachedRequests = requests;
                updateRequestCount();
                return requests;
            })
            .catch((err) => {
                requestsPromise = null;
                throw err;
            });
    }
    return requestsPromise;
}

function removeCachedRequest(userId) {
    if (!cachedRequests) return;
    const index = cachedRequests.findIndex(
        (request) => String(request.id) === String(userId),
    );
    if (index !== -1) cachedRequests.splice(index, 1);
    updateRequestCount();
}

function updateRequestCount() {
    const title = document.querySelector(`${HEADER_SELECTOR} h2`);
    if (!title || !cachedRequests) return;

    // The count API caps at 500, so only the capped "(500+)" label is replaced
    for (const node of title.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const next = node.data.replace(
            /\(\d+\+\)/,
            `(${cachedRequests.length.toLocaleString()})`,
        );
        if (next !== node.data) node.data = next;
    }
}

async function initRequestCount(header) {
    const title = header.querySelector('h2');
    if (!title) return;

    const response = await callRobloxApiJson({
        subdomain: 'friends',
        endpoint: '/v1/user/friend-requests/count',
    }).catch(() => null);
    if (!response || response.count < COUNT_API_CAP) return;

    observeText(title, updateRequestCount);
    await loadRequests().catch(() => null);
}

function getCachedUser(userId) {
    const key = String(userId);
    if (!userDataCache.has(key)) userDataCache.set(key, {});
    return userDataCache.get(key);
}

async function fetchHeaderBatch(userIds) {
    const response = await fetchRateLimited({
        subdomain: 'apis',
        endpoint: '/profile-platform-api/v1/profiles/batch/get',
        method: 'POST',
        body: {
            profileType: 'User',
            profileIds: userIds,
            components: [{ component: 'UserProfileHeader' }],
        },
    }).catch(() => null);

    for (const userId of userIds) {
        const header =
            response?.profiles?.[userId]?.components?.UserProfileHeader;
        if (!header) continue;
        Object.assign(getCachedUser(userId), {
            hasHeader: true,
            username: header.names?.username || '',
            displayName:
                header.names?.displayName || header.names?.username || '',
            plus: header.isRobloxPlus === true,
            verified: header.isVerified === true,
            admin: header.isRobloxAdmin === true,
            // Hidden counts come back as 0, so they are treated as unknown
            friends:
                header.counts?.isFriendsCountEnabled === false
                    ? null
                    : (header.counts?.friendsCount ?? null),
            followers:
                header.counts?.isFollowersCountEnabled === false
                    ? null
                    : (header.counts?.followersCount ?? null),
            followings:
                header.counts?.isFollowingsCountEnabled === false
                    ? null
                    : (header.counts?.followingsCount ?? null),
        });
    }
}

async function fetchJoinedBatch(userIds) {
    const response = await fetchRateLimited({
        subdomain: 'apis',
        endpoint: '/profile-insights-api/v1/multiProfileInsights',
        method: 'POST',
        useBackground: true,
        body: {
            userIds: userIds.map((id) => id.toString()),
            rankingStrategy: RANKING_STRATEGIES.TC_INFO_BOOST,
        },
    }).catch(() => null);
    for (const user of response?.userInsights || []) {
        const insight = (user.profileInsights || []).find(
            (item) => item.insightCase === INSIGHT_CASES.ACCOUNT_CREATION_DATE,
        );
        const seconds =
            insight?.accountCreationDateInsight?.accountCreatedDateTime
                ?.seconds;
        getCachedUser(user.targetUser).joined = seconds ? seconds * 1000 : null;
    }
}

function chunk(ids, size) {
    const chunks = [];
    for (let i = 0; i < ids.length; i += size) {
        chunks.push(ids.slice(i, i + size));
    }
    return chunks;
}

async function runBatches(batches, onBatchDone) {
    let next = 0;
    const worker = async () => {
        while (next < batches.length) {
            await batches[next++]();
            onBatchDone();
        }
    };
    await Promise.all(
        Array.from(
            { length: Math.min(MAX_CONCURRENT_BATCHES, batches.length) },
            worker,
        ),
    );
}

async function enrichUsers(userIds, current, onProgress, sortKey) {
    const needsJoined =
        current.joined.from !== null ||
        current.joined.to !== null ||
        sortKey === 'joined';

    const missingHeader = userIds.filter((id) => !getCachedUser(id).hasHeader);
    const missingJoined = needsJoined
        ? userIds.filter((id) => getCachedUser(id).joined === undefined)
        : [];

    const batches = [
        ...chunk(missingHeader, HEADER_BATCH_SIZE).map(
            (ids) => () => fetchHeaderBatch(ids),
        ),
        ...chunk(missingJoined, INSIGHTS_BATCH_SIZE).map(
            (ids) => () => fetchJoinedBatch(ids),
        ),
    ];
    let done = 0;
    await runBatches(batches, () => onProgress?.(++done, batches.length));
}

function matchesFilters(request, current) {
    const user = getCachedUser(request.id);
    const values = { ...user, mutuals: request.mutualFriendsList?.length ?? 0 };

    for (const key of BADGE_FILTERS) {
        const mode = current.badges[key];
        if (mode === 'any') continue;
        if (typeof values[key] !== 'boolean') return false;
        if (values[key] !== (mode === 'has')) return false;
    }

    for (const key of RANGE_FILTERS) {
        const { min, max } = current.ranges[key];
        if (min === null && max === null) continue;
        if (typeof values[key] !== 'number') return false;
        if (min !== null && values[key] < min) return false;
        if (max !== null && values[key] > max) return false;
    }

    const { from, to } = current.joined;
    if (from !== null || to !== null) {
        if (typeof values.joined !== 'number') return false;
        if (from !== null && values.joined < from) return false;
        if (to !== null && values.joined > to) return false;
    }

    return true;
}

function getSortValue(request, key) {
    if (key === 'sent') return Date.parse(request.friendRequest?.sentAt);
    if (key === 'mutuals') return request.mutualFriendsList?.length ?? 0;
    return getCachedUser(request.id)[key];
}

function sortRequests(requests, current) {
    if (isDefaultSort(current)) return requests;
    const direction = current.descending ? -1 : 1;

    return requests
        .map((request, index) => ({
            request,
            index,
            value: getSortValue(request, current.key),
        }))
        .sort((a, b) => {
            const aKnown = Number.isFinite(a.value);
            const bKnown = Number.isFinite(b.value);
            // Unknown values always go last, whatever the direction
            if (aKnown !== bKnown) return aKnown ? -1 : 1;
            if (!aKnown || a.value === b.value) return a.index - b.index;
            return (a.value - b.value) * direction;
        })
        .map(({ request }) => request);
}

// Shows the value the list is sorted by, the sent date is always in the footer
function createSortValueLabel(request) {
    const key = sort.key;
    if (key === 'sent') return null;

    const label = document.createElement('div');
    label.className = 'avatar-card-label rovalra-request-sort-value';

    if (key === 'joined') {
        const joined = getCachedUser(request.id).joined;
        if (!joined) {
            label.textContent = ts('friendRequestFilters.footer.unknown');
            return label;
        }
        label.classList.add('rovalra-request-date');
        label.append(
            document.createTextNode(ts('friendRequestFilters.footer.joined')),
            createInteractiveTimestamp(joined),
        );
        return label;
    }

    const value = getSortValue(request, key);
    label.textContent = Number.isFinite(value)
        ? ts(`friendRequestFilters.footer.${key}`, {
              count: value.toLocaleString(),
          })
        : ts('friendRequestFilters.footer.unknown');
    return label;
}

async function respondToRequest(userId, accept, card) {
    const buttons = card.querySelectorAll('button');
    buttons.forEach((button) => (button.disabled = true));

    try {
        await callRobloxApiJson({
            subdomain: 'friends',
            endpoint: `/v1/users/${userId}/${
                accept ? 'accept-friend-request' : 'decline-friend-request'
            }`,
            method: 'POST',
        });
        card.remove();
        removeCachedRequest(userId);
        renderedMatches = renderedMatches.filter(
            (request) => String(request.id) !== String(userId),
        );
        renderedCount = Math.max(0, renderedCount - 1);
    } catch (err) {
        console.error('RoValra: Failed to respond to friend request.', err);
        showSystemAlert(ts('friendRequestFilters.actionFailed'), 'warning');
        buttons.forEach((button) => (button.disabled = false));
    }
}

function createRequestCard(request, thumbnailUrl) {
    const user = getCachedUser(request.id);
    const profileUrl = `https://www.roblox.com/users/${request.id}/profile`;

    const card = document.createElement('li');
    card.className = 'list-item avatar-card rovalra-filtered-request-card';

    const container = document.createElement('div');
    container.className = 'avatar-card-container';

    const content = document.createElement('div');
    content.className = 'avatar-card-content';

    const avatar = document.createElement('div');
    avatar.className = 'avatar avatar-card-fullbody';
    const avatarLink = document.createElement('a');
    avatarLink.className = 'avatar-card-link';
    avatarLink.href = profileUrl;
    const thumbnail = document.createElement('span');
    thumbnail.className = 'thumbnail-2d-container avatar-card-image';
    if (thumbnailUrl) {
        const image = document.createElement('img');
        image.src = thumbnailUrl;
        image.alt = user.displayName || '';
        thumbnail.appendChild(image);
    }
    avatarLink.appendChild(thumbnail);
    avatar.appendChild(avatarLink);

    const caption = document.createElement('div');
    caption.className = 'avatar-card-caption';
    const nameWrapper = document.createElement('span');
    const nameContainer = document.createElement('div');
    nameContainer.className = 'avatar-name-container';
    const nameLink = document.createElement('a');
    nameLink.className = 'text-overflow avatar-name';
    nameLink.href = profileUrl;
    nameLink.textContent = user.displayName || String(request.id);
    nameContainer.appendChild(nameLink);
    const usernameLabel = document.createElement('div');
    usernameLabel.className = 'avatar-card-label';
    usernameLabel.textContent = user.username ? `@${user.username}` : '';
    nameWrapper.append(nameContainer, usernameLabel);
    const sortValueLabel = createSortValueLabel(request);
    if (sortValueLabel) nameWrapper.appendChild(sortValueLabel);

    caption.appendChild(nameWrapper);
    if (request.friendRequest?.sentAt) {
        caption.appendChild(createSentLabel(request.friendRequest.sentAt));
    }

    content.append(avatar, caption);

    const buttons = document.createElement('div');
    buttons.className = 'avatar-card-btns';
    const ignoreButton = document.createElement('button');
    ignoreButton.type = 'button';
    ignoreButton.className = 'ignore-friend btn-secondary-md btn-min-width';
    ignoreButton.textContent = ts('friendRequestFilters.ignore');
    ignoreButton.addEventListener('click', () =>
        respondToRequest(request.id, false, card),
    );
    const acceptButton = document.createElement('button');
    acceptButton.type = 'button';
    acceptButton.className = 'accept-friend btn-cta-md btn-min-width';
    acceptButton.textContent = ts('friendRequestFilters.accept');
    acceptButton.addEventListener('click', () =>
        respondToRequest(request.id, true, card),
    );
    buttons.append(ignoreButton, acceptButton);

    container.append(content, buttons);
    card.appendChild(container);
    return card;
}

function getSection() {
    return document.querySelector(HEADER_SELECTOR)?.closest('.friends-content');
}

function updateStatus(text) {
    const section = getSection();
    if (!section) return;
    let status = section.querySelector('.rovalra-request-filter-status');
    if (!text) {
        status?.remove();
        return;
    }
    if (!status) {
        status = document.createElement('div');
        status.className = 'rovalra-request-filter-status text-secondary';
        section.querySelector(HEADER_SELECTOR)?.after(status);
    }
    status.textContent = text;
}

function restoreNativeList() {
    const section = getSection();
    section?.classList.remove('rovalra-requests-filtered');
    section?.parentElement?.classList.remove(
        'rovalra-requests-filtered-parent',
    );
    section?.querySelector('.rovalra-filtered-requests')?.remove();
    section?.querySelector('.rovalra-filtered-requests-more')?.remove();
    renderedMatches = [];
    renderedCount = 0;
    updateStatus(null);
}

async function renderNextPage() {
    const section = getSection();
    const list = section?.querySelector('.rovalra-filtered-requests');
    if (!list) return;

    const page = renderedMatches.slice(
        renderedCount,
        renderedCount + PAGE_SIZE,
    );
    renderedCount += page.length;

    const thumbnails = await getBatchThumbnails(
        page.map((request) => request.id),
        'AvatarHeadshot',
    ).catch(() => []);

    page.forEach((request, index) => {
        list.appendChild(
            createRequestCard(request, thumbnails[index]?.imageUrl || ''),
        );
    });

    const moreButton = section.querySelector('.rovalra-filtered-requests-more');
    if (moreButton) {
        moreButton.style.display =
            renderedCount < renderedMatches.length ? '' : 'none';
    }
}

function renderMatches(matches) {
    const section = getSection();
    if (!section) return;

    section.querySelector('.rovalra-filtered-requests')?.remove();
    section.querySelector('.rovalra-filtered-requests-more')?.remove();
    section.classList.add('rovalra-requests-filtered');
    section.parentElement?.classList.add('rovalra-requests-filtered-parent');

    renderedMatches = matches;
    renderedCount = 0;

    const list = document.createElement('ul');
    list.className = 'hlist avatar-cards rovalra-filtered-requests';
    section.appendChild(list);

    const moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = 'btn-control-md rovalra-filtered-requests-more';
    moreButton.textContent = ts('friendRequestFilters.loadMore');
    moreButton.addEventListener('click', renderNextPage);
    section.appendChild(moreButton);

    renderNextPage();
}

async function applyView() {
    const token = ++applyToken;
    const current = filters;
    const currentSort = sort;

    if (!hasActiveFilters(current) && isDefaultSort(currentSort)) {
        restoreNativeList();
        return;
    }

    try {
        updateStatus(ts('friendRequestFilters.loadingRequests', { count: 0 }));
        loadProgressListener = (count) => {
            if (token === applyToken) {
                updateStatus(
                    ts('friendRequestFilters.loadingRequests', { count }),
                );
            }
        };
        const requests = [...(await loadRequests())];
        loadProgressListener = null;
        if (token !== applyToken) return;

        if (limitsPromise) {
            updateStatus(
                ts('friendRequestFilters.checkingRequests', { progress: 0 }),
            );
            await limitsPromise;
            if (token !== applyToken) return;
        }

        await enrichUsers(
            requests.map((request) => String(request.id)),
            current,
            (done, total) => {
                if (token === applyToken) {
                    updateStatus(
                        ts('friendRequestFilters.checkingRequests', {
                            progress: Math.round((done / total) * 100),
                        }),
                    );
                }
            },
            currentSort.key,
        );
        if (token !== applyToken) return;

        const matches = sortRequests(
            requests.filter((request) => matchesFilters(request, current)),
            currentSort,
        );
        renderMatches(matches);
        updateStatus(null);
    } catch (err) {
        console.error('RoValra: Failed to filter friend requests.', err);
        if (token === applyToken) {
            updateStatus(null);
            showSystemAlert(ts('friendRequestFilters.loadFailed'), 'warning');
        }
    }
}

function createSectionTitle(text) {
    const title = document.createElement('div');
    title.className = 'text-heading-small content-emphasis';
    title.textContent = text;
    return title;
}

function createBadgeIcon(key) {
    if (key === 'verified') {
        const wrapper = document.createElement('span');
        wrapper.className = 'rovalra-request-filters-badge-icon';
        const backplate = document.createElement('icon');
        backplate.setAttribute('filled', '');
        backplate.setAttribute('size', 'small');
        backplate.className = 'content-system-emphasis';
        backplate.textContent = 'verified-backplate';
        const check = document.createElement('icon');
        check.setAttribute('filled', '');
        check.setAttribute('size', 'small');
        check.className = 'rovalra-request-filters-verified-check';
        check.textContent = 'verified-check';
        wrapper.append(backplate, check);
        return wrapper;
    }

    const icon = document.createElement('icon');
    icon.setAttribute('size', 'small');
    icon.className = 'rovalra-request-filters-badge-icon';
    icon.textContent = {
        plus: 'roblox-plus',
        admin: 'tilt',
    }[key];
    return icon;
}

function createBadgeSelector(draft) {
    const list = document.createElement('div');
    list.className = 'rovalra-request-filters-badges';

    for (const key of BADGE_FILTERS) {
        const row = document.createElement('div');
        row.className = 'rovalra-request-filters-badge-row';

        const label = document.createElement('span');
        label.className =
            'rovalra-request-filters-badge-label text-body-medium content-default';
        const labelText = document.createElement('span');
        labelText.textContent = ts(`friendRequestFilters.badges.${key}`);
        label.append(createBadgeIcon(key), labelText);

        const toggle = createPillToggle({
            options: [
                { text: ts('friendRequestFilters.any'), value: 'any' },
                { text: ts('friendRequestFilters.has'), value: 'has' },
                { text: ts('friendRequestFilters.hasNot'), value: 'hasNot' },
            ],
            initialValue: draft.badges[key],
            onChange: (value) => {
                draft.badges[key] = value;
            },
        });

        row.append(label, toggle);
        list.appendChild(row);
    }

    return list;
}

function getAvailableRange(key) {
    if (!cachedRequests?.length) return null;
    // Counts other than mutuals are only known once every request is checked
    if (key !== 'mutuals' && !limitsReady) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const request of cachedRequests) {
        const value =
            key === 'mutuals'
                ? (request.mutualFriendsList?.length ?? 0)
                : getCachedUser(request.id)[key];
        if (typeof value !== 'number') continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    return Number.isFinite(min) ? { min, max } : null;
}

function getRangeError(key, { min, max }) {
    if (min !== null && max !== null && min > max) {
        return {
            fields: ['min', 'max'],
            message: ts('friendRequestFilters.minAboveMax'),
        };
    }
    const available = getAvailableRange(key);
    if (!available) return null;
    if (min !== null && min > available.max) {
        return {
            fields: ['min'],
            message: ts('friendRequestFilters.limitMax', {
                max: available.max.toLocaleString(),
            }),
        };
    }
    if (max !== null && max < available.min) {
        return {
            fields: ['max'],
            message: ts('friendRequestFilters.limitMin', {
                min: available.min.toLocaleString(),
            }),
        };
    }
    return null;
}

function createNumberInput(id, labelText, value, onInput) {
    const { container, input } = createStyledInput({
        id,
        label: labelText,
        value: value ?? '',
    });
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.addEventListener('keydown', (e) => {
        if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
    });
    input.addEventListener('input', () => onInput(parseNumber(input.value)));

    addTooltip(container, () => container.dataset.rovalraError || '', {
        position: 'top',
        shouldShow: () => Boolean(container.dataset.rovalraError),
    });

    return { container, input };
}

function setInputError(container, message) {
    container.classList.toggle('rovalra-input-error', Boolean(message));
    if (message) {
        container.dataset.rovalraError = message;
    } else {
        delete container.dataset.rovalraError;
    }
}

function createRangeRow(key, draft, onChange) {
    const group = document.createElement('div');
    group.className = 'rovalra-request-filters-range';

    const label = document.createElement('span');
    label.className = 'text-body-medium content-default';
    label.textContent = ts(`friendRequestFilters.ranges.${key}`);

    const inputs = document.createElement('div');
    inputs.className = 'rovalra-request-filters-inputs';
    const containers = {};
    for (const field of ['min', 'max']) {
        const { container } = createNumberInput(
            `rovalra-request-filter-${key}-${field}`,
            ts(`friendRequestFilters.${field}`),
            draft.ranges[key][field],
            (value) => {
                draft.ranges[key][field] = value;
                onChange();
            },
        );
        containers[field] = container;
        inputs.appendChild(container);
    }
    group.append(label, inputs);

    const validate = () => {
        const error = getRangeError(key, draft.ranges[key]);
        for (const field of ['min', 'max']) {
            setInputError(
                containers[field],
                error?.fields.includes(field) ? error.message : null,
            );
        }
        return !error;
    };

    return { row: group, validate };
}

function toDateInputValue(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function createDateInput(id, labelText, value, onInput) {
    const { container, input, label } = createStyledInput({
        id,
        label: labelText,
    });
    input.type = 'date';
    if (value !== null) input.value = toDateInputValue(value);

    // Date inputs always show their own placeholder, so the label has to stay raised.
    // The styled input lowers it on blur when empty, these listeners run right after.
    const keepLabelRaised = () => label.classList.add('MuiInputLabel-shrink');
    keepLabelRaised();
    for (const event of ['focus', 'blur', 'input']) {
        input.addEventListener(event, keepLabelRaised);
    }

    input.addEventListener('input', () => onInput(input.value));
    return container;
}

async function prefetchLimits(onReady) {
    const requests = await loadRequests().catch(() => null);
    if (!requests) return;
    onReady();
    limitsPromise ??= enrichUsers(
        requests.map((request) => String(request.id)),
        createEmptyFilters(),
    )
        .then(() => {
            limitsReady = true;
        })
        .catch(() => {
            limitsPromise = null;
        });
    await limitsPromise;
    onReady();
}

function getDirectionLabels(key) {
    const isDate = key === 'sent' || key === 'joined';
    return {
        desc: ts(
            isDate
                ? 'friendRequestFilters.newestFirst'
                : 'friendRequestFilters.descending',
        ),
        asc: ts(
            isDate
                ? 'friendRequestFilters.oldestFirst'
                : 'friendRequestFilters.ascending',
        ),
    };
}

function createSortSection(draftSort) {
    const section = document.createElement('div');
    section.className = 'rovalra-request-filters-sort';

    const directionSlot = document.createElement('div');
    const renderDirection = () => {
        const labels = getDirectionLabels(draftSort.key);
        directionSlot.replaceChildren(
            createPillToggle({
                options: [
                    { text: labels.desc, value: 'desc' },
                    { text: labels.asc, value: 'asc' },
                ],
                initialValue: draftSort.descending ? 'desc' : 'asc',
                onChange: (value) => {
                    draftSort.descending = value === 'desc';
                },
            }),
        );
    };

    const dropdown = createDropdown({
        items: SORT_KEYS.map((key) => ({
            value: key,
            label: ts(`friendRequestFilters.sort.${key}`),
        })),
        initialValue: draftSort.key,
        onValueChange: (value) => {
            draftSort.key = value;
            renderDirection();
        },
    });
    dropdown.element.classList.add('rovalra-request-filters-sort-select');

    renderDirection();
    section.append(dropdown.element, directionSlot);
    return { section, destroy: dropdown.destroy };
}

function createFiltersPanel(onApply) {
    let draft = structuredClone(filters);
    let draftSort = { ...sort };
    let destroySort = null;
    let validators = [];

    const panel = document.createElement('div');
    panel.className =
        'rovalra-request-filters-panel foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    panel.addEventListener('click', (e) => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'rovalra-request-filters-header';
    const logo = document.createElement('img');
    logo.src = getAssets().rovalraIcon;
    logo.dataset.rovalraAsset = 'rovalraIcon';
    logo.alt = '';
    logo.width = 24;
    logo.height = 24;
    const title = document.createElement('span');
    title.className = 'text-heading-small content-emphasis';
    title.textContent = ts('friendRequestFilters.title');
    header.append(logo, title);

    const body = document.createElement('div');
    body.className = 'rovalra-request-filters-body';

    const actions = document.createElement('div');
    actions.className = 'rovalra-request-filters-actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn-secondary-md btn-min-width';
    resetButton.textContent = ts('friendRequestFilters.reset');
    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'btn-cta-md btn-min-width';
    applyButton.textContent = ts('friendRequestFilters.apply');
    actions.append(resetButton, applyButton);

    const validateAll = () => {
        const valid = validators.map((validate) => validate()).every(Boolean);
        applyButton.disabled = !valid;
    };

    const renderBody = () => {
        validators = [];
        destroySort?.();
        const sortSection = createSortSection(draftSort);
        destroySort = sortSection.destroy;

        const left = document.createElement('div');
        left.className = 'rovalra-request-filters-column';
        left.append(
            createSectionTitle(ts('friendRequestFilters.sortTitle')),
            sortSection.section,
            createSectionTitle(ts('friendRequestFilters.badgesTitle')),
            createBadgeSelector(draft),
        );

        const right = document.createElement('div');
        right.className = 'rovalra-request-filters-column';
        right.appendChild(
            createSectionTitle(ts('friendRequestFilters.countsTitle')),
        );
        for (const key of RANGE_FILTERS) {
            const { row, validate } = createRangeRow(key, draft, validateAll);
            validators.push(validate);
            right.appendChild(row);
        }

        const dates = document.createElement('div');
        dates.className = 'rovalra-request-filters-inputs';
        dates.append(
            createDateInput(
                'rovalra-request-filter-joined-from',
                ts('friendRequestFilters.from'),
                draft.joined.from,
                (value) => (draft.joined.from = parseDate(value)),
            ),
            createDateInput(
                'rovalra-request-filter-joined-to',
                ts('friendRequestFilters.to'),
                draft.joined.to,
                (value) => (draft.joined.to = parseDate(value, true)),
            ),
        );
        right.append(
            createSectionTitle(ts('friendRequestFilters.joinedTitle')),
            dates,
        );

        body.replaceChildren(left, right);
        validateAll();
    };

    resetButton.addEventListener('click', () => {
        draft = createEmptyFilters();
        draftSort = { key: 'sent', descending: true };
        renderBody();
    });
    applyButton.addEventListener('click', () => {
        if (!applyButton.disabled) {
            onApply(structuredClone(draft), { ...draftSort });
        }
    });

    renderBody();
    prefetchLimits(() => {
        if (panel.isConnected) validateAll();
    });

    panel.append(header, body, actions);
    panel.rovalraDestroy = () => destroySort?.();
    return panel;
}

function attachFilters(header) {
    if (header.dataset.rovalraRequestFilters) return;
    header.dataset.rovalraRequestFilters = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-request-filters';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className =
        'see-all-link btn-control-xs btn-min-width rovalra-request-filters-toggle';

    const toggleIcon = document.createElement('icon');
    toggleIcon.setAttribute('material', '');
    toggleIcon.setAttribute('size', '16px');
    toggleIcon.textContent = 'filter_list';
    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = ts('friendRequestFilters.filters');
    const toggleCount = document.createElement('span');
    toggleCount.className = 'rovalra-request-filters-count';
    toggleButton.append(toggleIcon, toggleLabel, toggleCount);

    const updateToggle = () => {
        const count =
            countActiveFilters(filters) + (isDefaultSort(sort) ? 0 : 1);
        toggleButton.classList.toggle('rovalra-active', count > 0);
        toggleCount.hidden = count === 0;
        toggleCount.textContent = String(count);
        toggleButton.setAttribute(
            'aria-label',
            count > 0
                ? ts('friendRequestFilters.filtersActive', { count })
                : ts('friendRequestFilters.filters'),
        );
    };
    updateToggle();

    let panel = null;
    const closePanel = () => {
        panel?.rovalraDestroy?.();
        panel?.remove();
        panel = null;
        toggleButton.setAttribute('aria-expanded', 'false');
    };

    toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (panel) {
            closePanel();
            return;
        }
        panel = createFiltersPanel((nextFilters, nextSort) => {
            filters = nextFilters;
            sort = nextSort;
            updateToggle();
            closePanel();
            applyView();
        });
        toggleButton.setAttribute('aria-expanded', 'true');
        wrapper.appendChild(panel);
    });

    const handleDocumentClick = (e) => {
        if (!wrapper.isConnected) {
            document.removeEventListener('click', handleDocumentClick);
            return;
        }
        if (panel && !wrapper.contains(e.target)) closePanel();
    };
    document.addEventListener('click', handleDocumentClick);

    wrapper.appendChild(toggleButton);

    const ignoreAllButton = header.querySelector('.ignore-button');
    if (ignoreAllButton) {
        ignoreAllButton.before(wrapper);
    } else {
        header.appendChild(wrapper);
    }

    initRequestCount(header);
    if (hasActiveFilters(filters) || !isDefaultSort(sort)) applyView();
}

function createSentLabel(sentAt) {
    const label = document.createElement('div');
    label.className =
        'avatar-card-footer avatar-card-label rovalra-request-sent rovalra-request-date';
    label.append(
        document.createTextNode(ts('friendRequestFilters.footer.sent')),
        createInteractiveTimestamp(sentAt),
    );
    return label;
}

// Roblox reuses its request cards between pages, so the label follows the card's profile link
function renderNativeSentDate(caption) {
    if (!caption.closest('.friends-content')?.querySelector(HEADER_SELECTOR)) {
        return;
    }
    const link = caption.querySelector('a.avatar-name[href]');
    if (!link) return;

    const update = async () => {
        const userId = getUserIdFromUrl(link.href);
        const existing = caption.querySelector(
            ':scope > .rovalra-request-sent',
        );
        if (existing?.dataset.userId === String(userId)) return;

        const requests = userId ? await loadRequests().catch(() => null) : null;
        if (getUserIdFromUrl(link.href) !== userId) return;
        const sentAt = requests?.find(
            (request) => String(request.id) === String(userId),
        )?.friendRequest?.sentAt;

        caption.querySelector(':scope > .rovalra-request-sent')?.remove();
        caption.classList.toggle('rovalra-has-sent-date', Boolean(sentAt));
        if (!sentAt) return;

        const label = createSentLabel(sentAt);
        label.dataset.userId = String(userId);
        caption.appendChild(label);
    };

    update();
    observeAttributes(link, update, ['href']);
}

function trackNativeResponses(e) {
    const button = e.target.closest('.accept-friend, .ignore-friend');
    if (!button || button.closest('.rovalra-filtered-requests')) return;
    const link = button.closest('.avatar-card')?.querySelector('a[href]');
    const userId = link ? getUserIdFromUrl(link.href) : null;
    if (userId) removeCachedRequest(userId);
}

export async function init() {
    if ((await settings.friendRequestFiltersEnabled) === false) return;

    document.addEventListener('click', trackNativeResponses, true);
    observeElement(NATIVE_CAPTION_SELECTOR, renderNativeSentDate, {
        multiple: true,
    });
    observeElement(HEADER_SELECTOR, attachFilters, {
        onRemove: () => {
            applyToken++;
            renderedMatches = [];
            renderedCount = 0;
        },
    });
}
