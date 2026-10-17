const MB = 1024 * 1024;
const FRAME_WINDOW = 240;
const LAG_WINDOW = 50;
const LAG_INTERVAL_MS = 100;
const JANK_FRAME_MS = 50;
const MAX_TRACKED_CANVASES = 64;

const frameTimes = [];
const lagSamples = [];
const observers = [];
const glCanvases = [];
const glCanvasSet = new WeakSet();

const perf = {
    jankFrames: 0,
    longTasks: 0,
    lastLongTask: 0,
    blocking: 0,
    loaf: 0,
    worstLoaf: 0,
    fcp: NaN,
    lcp: NaN,
    lcpTag: '',
    cls: 0,
    inp: NaN,
    interactions: 0,
};

const res = {
    total: 0,
    transferred: 0,
    cached: 0,
    byType: {},
    apiCalls: 0,
    slowest: null,
    largest: null,
};

const net = {
    inFlight: 0,
    total: 0,
    failed: 0,
    totalMs: 0,
    last: '-',
    lastError: '-',
};

const errors = {
    js: 0,
    rejections: 0,
    consoleErrors: 0,
    consoleWarns: 0,
    last: '-',
};

const asyncInfo = {
    storage: '-',
    extStorage: '-',
};

let cur = { frame: {}, nav: null, lag: {} };
let originalFetch = null;
let wrappedFetch = null;
let originalGetContext = null;
let originalConsole = null;
let lagTimer = null;
let lagLast = 0;
let startedAt = 0;
let errorHandler = null;
let rejectionHandler = null;

export const fmt = (value, digits = 1) =>
    Number.isFinite(value) ? value.toFixed(digits) : '-';
const fmtMs = (value, digits = 0) =>
    Number.isFinite(value) ? `${value.toFixed(digits)} ms` : '-';
const fmtBytes = (bytes) =>
    !Number.isFinite(bytes)
        ? '-'
        : bytes >= MB
          ? `${(bytes / MB).toFixed(1)} MB`
          : `${(bytes / 1024).toFixed(0)} KB`;
const shortName = (name) =>
    (name.split('/').pop().split('?')[0] || name).slice(0, 28);
const trim = (text, length = 90) => String(text).slice(0, length);

const levelOf = (value, goodLimit, warnLimit, higherIsBetter = false) => {
    if (!Number.isFinite(value)) return '';
    const sign = higherIsBetter ? 1 : -1;
    if (sign * value >= sign * goodLimit) return 'good';
    return sign * value >= sign * warnLimit ? 'warn' : 'bad';
};

function percentile(values, fraction) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
    ];
}

function average(values) {
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : NaN;
}

function addEntry(type, handler, options = {}) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;

    try {
        const observer = new PerformanceObserver((list) =>
            list.getEntries().forEach(handler),
        );
        observer.observe({ type, buffered: true, ...options });
        observers.push(observer);
    } catch {
        return;
    }
}

function recordResource(entry) {
    res.total++;
    res.transferred += entry.transferSize || 0;
    if (entry.transferSize === 0 && entry.decodedBodySize > 0) res.cached++;

    const type = entry.initiatorType || 'other';
    const bucket = (res.byType[type] ??= { count: 0, bytes: 0 });
    bucket.count++;
    bucket.bytes += entry.transferSize || 0;

    if (['fetch', 'xmlhttprequest'].includes(type)) res.apiCalls++;
    if (!res.slowest || entry.duration > res.slowest.duration)
        res.slowest = entry;
    if (!res.largest || entry.transferSize > res.largest.transferSize)
        res.largest = entry;
}

function startObservers() {
    addEntry('longtask', (entry) => {
        perf.longTasks++;
        perf.lastLongTask = entry.duration;
        perf.blocking += Math.max(0, entry.duration - 50);
    });
    addEntry('long-animation-frame', (entry) => {
        perf.loaf++;
        perf.worstLoaf = Math.max(perf.worstLoaf, entry.duration);
    });
    addEntry('paint', (entry) => {
        if (entry.name === 'first-contentful-paint') perf.fcp = entry.startTime;
    });
    addEntry('largest-contentful-paint', (entry) => {
        perf.lcp = entry.startTime;
        perf.lcpTag = entry.element?.tagName?.toLowerCase() ?? '';
    });
    addEntry('layout-shift', (entry) => {
        if (!entry.hadRecentInput) perf.cls += entry.value;
    });
    addEntry(
        'event',
        (entry) => {
            if (!entry.interactionId) return;
            perf.interactions++;
            perf.inp = Number.isFinite(perf.inp)
                ? Math.max(perf.inp, entry.duration)
                : entry.duration;
        },
        { durationThreshold: 40 },
    );
    addEntry('resource', recordResource);
}

function recordFetch(status, ok, start, url, error) {
    net.inFlight--;
    net.totalMs += performance.now() - start;
    if (!ok) net.failed++;

    let path = String(url);
    try {
        path = new URL(url, window.location.href).pathname;
    } catch {
        path = trim(path, 40);
    }
    net.last = `${status || 'ERR'} ${trim(path, 48)}`;
    if (!ok) net.lastError = error ? trim(error.message ?? error) : net.last;
}

function patchFetch() {
    if (originalFetch) return;

    originalFetch = window.fetch;
    wrappedFetch = function (...args) {
        const start = performance.now();
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        net.inFlight++;
        net.total++;

        return originalFetch.apply(this, args).then(
            (response) => {
                recordFetch(response.status, response.ok, start, url);
                return response;
            },
            (error) => {
                recordFetch(0, false, start, url, error);
                throw error;
            },
        );
    };
    window.fetch = wrappedFetch;
}

function patchGetContext() {
    if (originalGetContext) return;

    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const context = originalGetContext.call(this, type, ...rest);
        if (
            context &&
            /webgl/i.test(String(type)) &&
            !glCanvasSet.has(this) &&
            glCanvases.length < MAX_TRACKED_CANVASES
        ) {
            glCanvasSet.add(this);
            glCanvases.push(new WeakRef(this));
        }
        return context;
    };
}

function patchConsole() {
    if (originalConsole) return;

    originalConsole = { error: console.error, warn: console.warn };
    console.error = (...args) => {
        errors.consoleErrors++;
        errors.last = trim(args.map(String).join(' '));
        originalConsole.error.apply(console, args);
    };
    console.warn = (...args) => {
        errors.consoleWarns++;
        originalConsole.warn.apply(console, args);
    };
}

function listenForErrors() {
    errorHandler = (event) => {
        errors.js++;
        errors.last = trim(event.message || event.type);
    };
    rejectionHandler = (event) => {
        errors.rejections++;
        errors.last = trim(event.reason?.message ?? event.reason);
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
}

function sampleLag() {
    const now = performance.now();
    if (!document.hidden && lagLast) {
        lagSamples.push(Math.max(0, now - lagLast - LAG_INTERVAL_MS));
        if (lagSamples.length > LAG_WINDOW) lagSamples.shift();
    }
    lagLast = now;
}

export function recordFrame(delta) {
    frameTimes.push(delta);
    if (frameTimes.length > FRAME_WINDOW) frameTimes.shift();
    if (delta > JANK_FRAME_MS) perf.jankFrames++;
}

export function resetFrames() {
    frameTimes.length = 0;
}

export function startCollectors() {
    startedAt = performance.now();
    patchGetContext();
    patchFetch();
    patchConsole();
    listenForErrors();
    startObservers();
    lagTimer = setInterval(sampleLag, LAG_INTERVAL_MS);
}

export function stopCollectors() {
    observers.splice(0).forEach((observer) => observer.disconnect());
    clearInterval(lagTimer);
    lagTimer = null;
    lagLast = 0;

    if (originalFetch && window.fetch === wrappedFetch) {
        window.fetch = originalFetch;
    }
    originalFetch = null;
    wrappedFetch = null;

    if (originalGetContext) {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        originalGetContext = null;
    }
    if (originalConsole) {
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        originalConsole = null;
    }

    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
}

export function collect() {
    const avg = average(frameTimes);
    const p99 = percentile(frameTimes, 0.99);
    const median = percentile(frameTimes, 0.5);

    cur = {
        frame: {
            fps: 1000 / avg,
            avg,
            max: frameTimes.length ? Math.max(...frameTimes) : NaN,
            low: 1000 / p99,
            refresh: 1000 / median,
        },
        nav: performance.getEntriesByType('navigation')[0] ?? null,
        lag: {
            avg: average(lagSamples),
            max: lagSamples.length ? Math.max(...lagSamples) : NaN,
        },
    };
}

export async function refreshAsync() {
    const tasks = [
        navigator.storage?.estimate?.().then((estimate) => {
            asyncInfo.storage = `${fmtBytes(estimate.usage)} / ${fmtBytes(estimate.quota)}`;
        }),
        chrome.storage.local.getBytesInUse(null).then(async (bytes) => {
            const items = await chrome.storage.local.get(null);
            asyncInfo.extStorage = `${Object.keys(items).length} keys, ${fmtBytes(bytes)}`;
        }),
    ].filter(Boolean);

    await Promise.allSettled(tasks);
}

function getNav(field) {
    return cur.nav?.[field];
}

function getTiming(from, to) {
    const start = getNav(from);
    const end = getNav(to);
    return Number.isFinite(start) && Number.isFinite(end) && end > 0
        ? end - start
        : NaN;
}

function getType(type) {
    return res.byType[type] ?? { count: 0, bytes: 0 };
}

const describeType = (type) => {
    const { count, bytes } = getType(type);
    return `${count} (${fmtBytes(bytes)})`;
};

function getLiveCanvases() {
    return glCanvases
        .map((reference) => reference.deref())
        .filter((canvas) => canvas?.isConnected);
}

function getStorageSize(storage) {
    let bytes = 0;
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        bytes += (key.length + (storage.getItem(key) ?? '').length) * 2;
    }
    return `${storage.length} keys, ${fmtBytes(bytes)}`;
}

function getMeta(name, attribute) {
    return (
        document
            .querySelector(`meta[name="${name}"]`)
            ?.getAttribute(attribute) ?? '-'
    );
}

function getTheme() {
    return (
        [...document.body.classList].find((name) =>
            name.startsWith('theme-'),
        ) ?? '-'
    );
}

export const SECTIONS = [
    {
        id: 'performance',
        open: true,
        rows: [
            {
                id: 'fps',
                read: () => fmt(cur.frame.fps, 0),
                level: () => levelOf(cur.frame.fps, 55, 30, true),
            },
            {
                id: 'frameTime',
                read: () => `${fmt(cur.frame.avg)} / ${fmt(cur.frame.max)} ms`,
                level: () => levelOf(cur.frame.avg, 18, 33),
            },
            {
                id: 'frameLow',
                read: () => `${fmt(cur.frame.low, 0)} fps`,
                level: () => levelOf(cur.frame.low, 50, 25, true),
            },
            {
                id: 'jank',
                read: () => String(perf.jankFrames),
                level: () => levelOf(perf.jankFrames, 0, 10),
            },
            {
                id: 'loopLag',
                read: () => `${fmt(cur.lag.avg)} / ${fmt(cur.lag.max, 0)} ms`,
                level: () => levelOf(cur.lag.avg, 10, 50),
            },
            {
                id: 'longTasks',
                read: () =>
                    perf.longTasks
                        ? `${perf.longTasks} (${fmtMs(perf.lastLongTask)})`
                        : '0',
                level: () => levelOf(perf.longTasks, 0, 5),
            },
            {
                id: 'blocking',
                read: () => fmtMs(perf.blocking),
                level: () => levelOf(perf.blocking, 200, 600),
            },
            {
                id: 'longFrames',
                read: () =>
                    perf.loaf
                        ? `${perf.loaf} (worst ${fmtMs(perf.worstLoaf)})`
                        : '0',
            },
            {
                id: 'jsHeap',
                read: () =>
                    performance.memory
                        ? `${fmt(performance.memory.usedJSHeapSize / MB)} / ${fmt(performance.memory.totalJSHeapSize / MB)} / ${fmt(performance.memory.jsHeapSizeLimit / MB, 0)} MB`
                        : '-',
                level: () =>
                    performance.memory
                        ? levelOf(
                              (performance.memory.usedJSHeapSize /
                                  performance.memory.jsHeapSizeLimit) *
                                  100,
                              60,
                              85,
                          )
                        : '',
            },
            {
                id: 'domNodes',
                read: () => String(document.getElementsByTagName('*').length),
            },
            {
                id: 'uptime',
                read: () =>
                    `${fmt((performance.now() - startedAt) / 1000, 0)} s`,
            },
        ],
    },
    {
        id: 'vitals',
        open: true,
        rows: [
            {
                id: 'fcp',
                read: () => fmtMs(perf.fcp),
                level: () => levelOf(perf.fcp, 1800, 3000),
            },
            {
                id: 'lcp',
                read: () =>
                    `${fmtMs(perf.lcp)}${perf.lcpTag ? ` <${perf.lcpTag}>` : ''}`,
                level: () => levelOf(perf.lcp, 2500, 4000),
            },
            {
                id: 'cls',
                read: () => fmt(perf.cls, 3),
                level: () => levelOf(perf.cls, 0.1, 0.25),
            },
            {
                id: 'inp',
                read: () =>
                    perf.interactions
                        ? `${fmtMs(perf.inp)} (${perf.interactions})`
                        : '-',
                level: () => levelOf(perf.inp, 200, 500),
            },
        ],
    },
    {
        id: 'loading',
        open: true,
        rows: [
            { id: 'readyState', read: () => document.readyState },
            { id: 'navType', read: () => getNav('type') ?? '-' },
            { id: 'protocol', read: () => getNav('nextHopProtocol') || '-' },
            {
                id: 'redirect',
                read: () => fmtMs(getTiming('redirectStart', 'redirectEnd')),
            },
            {
                id: 'dns',
                read: () =>
                    fmtMs(getTiming('domainLookupStart', 'domainLookupEnd')),
            },
            {
                id: 'connect',
                read: () => fmtMs(getTiming('connectStart', 'connectEnd')),
            },
            {
                id: 'ttfb',
                read: () => fmtMs(getNav('responseStart')),
                level: () => levelOf(getNav('responseStart'), 800, 1800),
            },
            {
                id: 'download',
                read: () => fmtMs(getTiming('responseStart', 'responseEnd')),
            },
            {
                id: 'domInteractive',
                read: () => fmtMs(getNav('domInteractive')),
            },
            {
                id: 'domContentLoaded',
                read: () => fmtMs(getNav('domContentLoadedEventEnd')),
            },
            { id: 'load', read: () => fmtMs(getNav('loadEventEnd')) },
            {
                id: 'documentSize',
                read: () =>
                    `${fmtBytes(getNav('transferSize'))} / ${fmtBytes(getNav('decodedBodySize'))}`,
            },
            {
                id: 'pageWeight',
                read: () =>
                    fmtBytes(res.transferred + (getNav('transferSize') || 0)),
            },
            { id: 'requests', read: () => String(res.total) },
            {
                id: 'cacheHit',
                read: () =>
                    res.total
                        ? `${fmt((res.cached / res.total) * 100, 0)}% (${res.cached})`
                        : '-',
            },
            {
                id: 'slowest',
                read: () =>
                    res.slowest
                        ? `${fmtMs(res.slowest.duration)} ${shortName(res.slowest.name)}`
                        : '-',
            },
            {
                id: 'largest',
                read: () =>
                    res.largest
                        ? `${fmtBytes(res.largest.transferSize)} ${shortName(res.largest.name)}`
                        : '-',
            },
        ],
    },
    {
        id: 'resources',
        open: false,
        rows: [
            { id: 'scripts', read: () => describeType('script') },
            {
                id: 'styles',
                read: () => {
                    const css = getType('css');
                    const link = getType('link');
                    return `${css.count + link.count} (${fmtBytes(css.bytes + link.bytes)})`;
                },
            },
            { id: 'images', read: () => describeType('img') },
            {
                id: 'fetchXhr',
                read: () => {
                    const fetched = getType('fetch');
                    const xhr = getType('xmlhttprequest');
                    return `${fetched.count + xhr.count} (${fmtBytes(fetched.bytes + xhr.bytes)})`;
                },
            },
            {
                id: 'iframes',
                read: () =>
                    String(document.getElementsByTagName('iframe').length),
            },
            { id: 'other', read: () => describeType('other') },
        ],
    },
    {
        id: 'requests',
        open: true,
        rows: [
            { id: 'inFlight', read: () => String(net.inFlight) },
            { id: 'total', read: () => String(net.total) },
            {
                id: 'failed',
                read: () => String(net.failed),
                level: () => levelOf(net.failed, 0, 3),
            },
            {
                id: 'avgLatency',
                read: () =>
                    net.total - net.inFlight
                        ? fmtMs(net.totalMs / (net.total - net.inFlight))
                        : '-',
            },
            { id: 'lastRequest', read: () => net.last },
            { id: 'lastFailure', read: () => net.lastError },
        ],
    },
    {
        id: 'graphics',
        open: true,
        rows: [
            {
                id: 'glContexts',
                read: () =>
                    `${getLiveCanvases().length} / ${glCanvases.length}`,
            },
            {
                id: 'glSizes',
                read: () =>
                    getLiveCanvases()
                        .slice(0, 3)
                        .map((canvas) => `${canvas.width}x${canvas.height}`)
                        .join(', ') || '-',
            },
            {
                id: 'glPixels',
                read: () =>
                    `${fmt(getLiveCanvases().reduce((sum, canvas) => sum + canvas.width * canvas.height, 0) / 1e6, 2)} MP`,
            },
            {
                id: 'canvases',
                read: () =>
                    String(document.getElementsByTagName('canvas').length),
            },
            {
                id: 'videos',
                read: () =>
                    String(document.getElementsByTagName('video').length),
            },
            { id: 'imageElements', read: () => String(document.images.length) },
            {
                id: 'svgs',
                read: () => String(document.getElementsByTagName('svg').length),
            },
        ],
    },
    {
        id: 'display',
        open: false,
        rows: [
            {
                id: 'viewport',
                read: () => `${window.innerWidth} x ${window.innerHeight}`,
            },
            { id: 'pixelRatio', read: () => fmt(window.devicePixelRatio, 2) },
            {
                id: 'scroll',
                read: () =>
                    `${Math.round(window.scrollX)}, ${Math.round(window.scrollY)} / ${document.documentElement.scrollHeight}`,
            },
        ],
    },
    {
        id: 'storage',
        open: false,
        rows: [
            { id: 'origin', read: () => asyncInfo.storage },
            {
                id: 'localStorage',
                read: () => getStorageSize(window.localStorage),
            },
            {
                id: 'sessionStorage',
                read: () => getStorageSize(window.sessionStorage),
            },
            {
                id: 'cookies',
                read: () =>
                    `${document.cookie ? document.cookie.split(';').length : 0} (${fmtBytes(document.cookie.length)})`,
            },
            { id: 'extStorage', read: () => asyncInfo.extStorage },
        ],
    },
    {
        id: 'errors',
        open: false,
        rows: [
            {
                id: 'jsErrors',
                read: () => String(errors.js),
                level: () => levelOf(errors.js, 0, 3),
            },
            {
                id: 'rejections',
                read: () => String(errors.rejections),
                level: () => levelOf(errors.rejections, 0, 3),
            },
            { id: 'consoleErrors', read: () => String(errors.consoleErrors) },
            { id: 'consoleWarns', read: () => String(errors.consoleWarns) },
            { id: 'lastError', read: () => errors.last },
        ],
    },
    {
        id: 'page',
        open: false,
        rows: [
            { id: 'url', read: () => window.location.href },
            { id: 'pageTitle', read: () => document.title },
            { id: 'referrer', read: () => document.referrer || '-' },
            { id: 'charset', read: () => document.characterSet },
            { id: 'visibility', read: () => document.visibilityState },
            { id: 'focus', read: () => String(document.hasFocus()) },
            { id: 'compat', read: () => document.compatMode },
            { id: 'lang', read: () => document.documentElement.lang || '-' },
            { id: 'theme', read: () => getTheme() },
            { id: 'userId', read: () => getMeta('user-data', 'data-userid') },
            {
                id: 'csrf',
                read: () => String(getMeta('csrf-token', 'data-token') !== '-'),
            },
        ],
    },
    {
        id: 'rovalra',
        open: true,
        rows: [
            { id: 'version', read: () => chrome.runtime.getManifest().version },
            { id: 'extensionId', read: () => chrome.runtime.id },
            {
                id: 'manifest',
                read: () =>
                    `MV${chrome.runtime.getManifest().manifest_version}`,
            },
            { id: 'path', read: () => window.location.pathname },
        ],
    },
];
