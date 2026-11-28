import { callRobloxApi } from '../api.js';
import { getUserIdFromUrl } from '../idExtractor.js';

const MAX_ATTEMPTS = 4;
const RATE_LIMIT_BUFFER_MS = 500;
const FALLBACK_RETRY_MS = 5000;

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

export async function fetchRateLimited(options) {
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

const INTERCEPT_WAIT_MS = 1000;

const loadedRequests = [];
const knownRequests = new Map();
const changeListeners = new Set();
let chainStarted = false;
let nextCursor = null;
let allPagesLoaded = false;
let pagePromise = null;
let allRequestsPromise = null;
let progressListener = null;
let trackingResponses = false;
let resolveFirstPage;
const firstPageSeen = new Promise((resolve) => {
    resolveFirstPage = resolve;
});

function notifyChanged() {
    changeListeners.forEach((listener) => listener());
}

function rememberRequests(requests) {
    for (const request of requests) {
        if (request?.id != null) knownRequests.set(String(request.id), request);
    }
}

function addPage(cursor, response) {
    const requests = response?.data || [];
    rememberRequests(requests);
    resolveFirstPage();

    const isNext = chainStarted ? cursor === nextCursor : cursor === null;
    if (!isNext || allPagesLoaded) return false;

    const loadedIds = new Set(loadedRequests.map((r) => String(r.id)));
    loadedRequests.push(
        ...requests.filter((request) => !loadedIds.has(String(request.id))),
    );
    chainStarted = true;
    nextCursor = response?.nextPageCursor || null;
    allPagesLoaded = !nextCursor;
    progressListener?.(loadedRequests.length);
    return true;
}

document.addEventListener('rovalra-friend-requests-response', (e) => {
    const { cursor, data } = e.detail || {};
    if (!Array.isArray(data?.data)) return;
    addPage(cursor ?? null, data);
    if (allPagesLoaded) notifyChanged();
});

function fetchNextPage() {
    if (allPagesLoaded) return Promise.resolve();
    if (!pagePromise) {
        const cursor = chainStarted ? nextCursor : null;
        pagePromise = fetchRateLimited({
            subdomain: 'friends',
            endpoint: `/v1/my/friends/requests?limit=100&sortOrder=Desc${
                cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
            }`,
        })
            .then((response) => {
                addPage(cursor, response);
            })
            .finally(() => {
                pagePromise = null;
            });
    }
    return pagePromise;
}

export function loadAllRequests() {
    if (!allRequestsPromise) {
        allRequestsPromise = (async () => {
            while (!allPagesLoaded) await fetchNextPage();
            notifyChanged();
            return loadedRequests;
        })().catch((err) => {
            allRequestsPromise = null;
            throw err;
        });
    }
    return allRequestsPromise;
}

export async function findRequest(userId) {
    const key = String(userId);
    if (!knownRequests.has(key) && !chainStarted) {
        await Promise.race([
            firstPageSeen,
            new Promise((r) => setTimeout(r, INTERCEPT_WAIT_MS)),
        ]);
    }
    for (;;) {
        if (knownRequests.has(key)) return knownRequests.get(key);
        if (allPagesLoaded) return null;
        await fetchNextPage();
    }
}

export function getAllRequests() {
    return allPagesLoaded ? loadedRequests : null;
}

export function setLoadProgressListener(listener) {
    progressListener = listener;
}

export function onRequestsChanged(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
}

export function removeRequest(userId) {
    const index = loadedRequests.findIndex(
        (request) => String(request.id) === String(userId),
    );
    if (index !== -1) loadedRequests.splice(index, 1);
    knownRequests.delete(String(userId));
    notifyChanged();
}

function handleNativeResponse(e) {
    const button = e.target.closest('.accept-friend, .ignore-friend');
    if (!button || button.closest('.rovalra-filtered-requests')) return;
    const link = button.closest('.avatar-card')?.querySelector('a[href]');
    const userId = link ? getUserIdFromUrl(link.href) : null;
    if (userId) removeRequest(userId);
}

export function trackNativeResponses() {
    if (trackingResponses) return;
    trackingResponses = true;
    document.addEventListener('click', handleNativeResponse, true);
}
