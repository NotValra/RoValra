import { observeElement, observeText } from '../../../core/observer.js';
import { callRobloxApiJson } from '../../../core/api.js';
import { settings } from '../../../core/settings/getSettings.js';
import { ts } from '../../../core/locale/i18n.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { createPillToggle } from '../../../core/ui/general/pillToggle.js';
import { addTooltip } from '../../../core/ui/tooltip.js';
import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { showSystemAlert } from '../../../core/ui/roblox/alert.js';
import { getBatchThumbnails } from '../../../core/thumbnail/thumbnails.js';
import {
    getMultiProfileInsights,
    INSIGHT_CASES,
    RANKING_STRATEGIES,
} from '../../../core/apis/users.js';

const HEADER_SELECTOR = '.request-tab-header';
const HEADER_BATCH_SIZE = 25;
const INSIGHTS_BATCH_SIZE = 100;
const MAX_CONCURRENT_BATCHES = 4;
const PAGE_SIZE = 36;
const COUNT_API_CAP = 500;

const BADGE_FILTERS = ['premium', 'plus', 'verified', 'admin'];
const RANGE_FILTERS = ['mutuals', 'friends', 'followers', 'followings'];

const ORIGIN_KEYS = {
    InGame: 'originInGame',
    UserProfile: 'originProfile',
    PlayerSearch: 'originSearch',
    UserSearch: 'originSearch',
    QrCode: 'originQrCode',
    ProfileShare: 'originProfileShare',
    PhoneContactImporter: 'originPhoneContacts',
    FriendRecommendations: 'originPeopleYouMayKnow',
};

const userDataCache = new Map();
let filters = createEmptyFilters();
let renderedMatches = [];
let renderedCount = 0;
let applyToken = 0;
let requestsPromise = null;
let cachedRequests = null;
let loadProgressListener = null;
let limitsPromise = null;

function createEmptyFilters() {
    return {
        badges: Object.fromEntries(BADGE_FILTERS.map((key) => [key, 'any'])),
        ranges: Object.fromEntries(
            RANGE_FILTERS.map((key) => [key, { min: null, max: null }]),
        ),
        joined: { from: null, to: null },
    };
}

function hasActiveFilters(current) {
    return (
        BADGE_FILTERS.some((key) => current.badges[key] !== 'any') ||
        RANGE_FILTERS.some(
            (key) =>
                current.ranges[key].min !== null ||
                current.ranges[key].max !== null,
        ) ||
        current.joined.from !== null ||
        current.joined.to !== null
    );
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

async function fetchAllRequests(onProgress) {
    const requests = [];
    let cursor = null;

    do {
        const response = await callRobloxApiJson({
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
    const response = await callRobloxApiJson({
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
            premium: header.isPremium === true,
            plus: header.isRobloxPlus === true,
            verified: header.isVerified === true,
            admin: header.isRobloxAdmin === true,
            friends: header.counts?.friendsCount ?? null,
            followers: header.counts?.followersCount ?? null,
            followings: header.counts?.followingsCount ?? null,
        });
    }
}

async function fetchJoinedBatch(userIds) {
    const response = await getMultiProfileInsights(
        userIds,
        RANKING_STRATEGIES.TC_INFO_BOOST,
    );
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

async function enrichUsers(userIds, current, onProgress) {
    const needsJoined =
        current.joined.from !== null || current.joined.to !== null;

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

function getFooterText(request) {
    const mutuals = request.mutualFriendsList?.length || 0;
    if (mutuals > 0) {
        return ts('friendRequestFilters.mutualFriends', { count: mutuals });
    }
    const originKey = ORIGIN_KEYS[request.friendRequest?.originSourceType];
    if (!originKey) return '';
    return `${ts('friendsSince.originFrom')} ${ts(`friendsSince.${originKey}`)}`;
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
        updateStatus(
            ts('friendRequestFilters.showing', {
                count: renderedMatches.length,
            }),
        );
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

    const footer = document.createElement('div');
    footer.className = 'avatar-card-footer avatar-card-label';
    footer.textContent = getFooterText(request);
    caption.append(nameWrapper, footer);

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

async function applyFilters(current) {
    const token = ++applyToken;

    if (!hasActiveFilters(current)) {
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
        );
        if (token !== applyToken) return;

        const matches = requests.filter((request) =>
            matchesFilters(request, current),
        );
        renderMatches(matches);
        updateStatus(
            ts('friendRequestFilters.showingOf', {
                count: matches.length,
                total: requests.length,
            }),
        );
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
        premium: 'premium',
        plus: 'roblox-plus',
        admin: 'tilt',
    }[key];
    return icon;
}

function createBadgeSelector(draft) {
    const selector = document.createElement('div');
    selector.className = 'rovalra-request-filters-badges';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className =
        'rovalra-dropdown-trigger relative clip group/interactable focus-visible:outline-focus disabled:outline-none flex items-center justify-between width-full bg-none stroke-standard radius-medium height-1000 padding-x-medium text-body-medium stroke-default content-default';
    trigger.setAttribute('aria-expanded', 'false');

    const presentation = document.createElement('div');
    presentation.setAttribute('role', 'presentation');
    /* eslint-disable rovalra/check-css-vars -- These are Roblox class names, not RoValra CSS references. */
    presentation.className =
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';
    /* eslint-enable rovalra/check-css-vars */

    const summary = document.createElement('span');
    summary.className = 'rovalra-request-filters-badge-summary';

    const chevron = document.createElement('span');
    chevron.className =
        'rovalra-dropdown-chevron size-500 icon icon-regular-chevron-large-down content-default';

    trigger.append(presentation, summary, chevron);

    const updateSummary = () => {
        summary.replaceChildren();
        const active = BADGE_FILTERS.filter(
            (key) => draft.badges[key] !== 'any',
        );
        if (!active.length) {
            summary.textContent = ts('friendRequestFilters.any');
            return;
        }
        for (const key of active) {
            const icon = createBadgeIcon(key);
            if (draft.badges[key] === 'hasNot') {
                icon.classList.add('rovalra-badge-excluded');
            }
            summary.appendChild(icon);
        }
    };

    const menu = document.createElement('div');
    menu.className =
        'rovalra-request-filters-badge-menu bg-surface-200 radius-medium';
    menu.hidden = true;

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
                updateSummary();
            },
        });

        row.append(label, toggle);
        menu.appendChild(row);
    }

    trigger.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        trigger.setAttribute('aria-expanded', String(!menu.hidden));
        chevron.classList.toggle('rovalra-open', !menu.hidden);
    });

    updateSummary();
    selector.append(trigger, menu);
    return selector;
}

function getAvailableRange(key) {
    if (!cachedRequests?.length) return null;
    const values = [];
    for (const request of cachedRequests) {
        const value =
            key === 'mutuals'
                ? (request.mutualFriendsList?.length ?? 0)
                : getCachedUser(request.id)[key];
        if (typeof value === 'number') values.push(value);
    }
    // Counts other than mutuals are only known once every request is checked
    if (values.length < cachedRequests.length) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
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
    const { container, input } = createStyledInput({ id, label: labelText });
    input.type = 'date';
    if (value !== null) input.value = toDateInputValue(value);
    container.querySelector('label')?.classList.add('MuiInputLabel-shrink');
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
    ).catch(() => {
        limitsPromise = null;
    });
    await limitsPromise;
    onReady();
}

function createFiltersPanel(onApply) {
    let draft = structuredClone(filters);
    let validators = [];

    const panel = document.createElement('div');
    panel.className =
        'rovalra-request-filters-panel foundation-web-menu bg-surface-100 stroke-standard stroke-default shadow-transient-high radius-large';
    panel.addEventListener('click', (e) => e.stopPropagation());

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
        body.replaceChildren(
            createSectionTitle(ts('friendRequestFilters.badgesTitle')),
            createBadgeSelector(draft),
            createSectionTitle(ts('friendRequestFilters.countsTitle')),
        );
        for (const key of RANGE_FILTERS) {
            const { row, validate } = createRangeRow(key, draft, validateAll);
            validators.push(validate);
            body.appendChild(row);
        }

        body.appendChild(
            createSectionTitle(ts('friendRequestFilters.joinedTitle')),
        );
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
        body.appendChild(dates);
        validateAll();
    };

    resetButton.addEventListener('click', () => {
        draft = createEmptyFilters();
        renderBody();
    });
    applyButton.addEventListener('click', () => {
        if (!applyButton.disabled) onApply(structuredClone(draft));
    });

    renderBody();
    prefetchLimits(() => {
        if (panel.isConnected) validateAll();
    });

    panel.append(body, actions);
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
    toggleButton.append(toggleIcon, toggleLabel);

    const updateToggle = () => {
        toggleButton.classList.toggle(
            'rovalra-active',
            hasActiveFilters(filters),
        );
    };
    updateToggle();

    let panel = null;
    const closePanel = () => {
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
        panel = createFiltersPanel((nextFilters) => {
            filters = nextFilters;
            updateToggle();
            closePanel();
            applyFilters(filters);
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
    if (hasActiveFilters(filters)) applyFilters(filters);
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
    observeElement(HEADER_SELECTOR, attachFilters, {
        onRemove: () => {
            applyToken++;
            renderedMatches = [];
            renderedCount = 0;
        },
    });
}
