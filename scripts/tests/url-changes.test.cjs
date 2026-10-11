const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/content/index.js'),
    'utf8',
);
const declarationsStart = source.indexOf('let lastPath =');
const declarationsEnd = source.indexOf(
    'const initializedPersistentFeatures',
    declarationsStart,
);
const watcherStart = source.indexOf('async function handleUrlChange()');
const watcherEnd = source.indexOf('\ninitializePage();', watcherStart);
assert.ok(declarationsStart >= 0 && declarationsEnd > declarationsStart);
assert.ok(watcherStart >= 0 && watcherEnd > watcherStart);

let url = new URL('https://www.roblox.com/discover/?keyword=cart');
const entries = [url];
let entryIndex = 0;
const window = new EventTarget();
Object.defineProperty(window, 'location', { get: () => url });
const history = {
    pushState(_state, _title, nextUrl) {
        url = new URL(nextUrl, url);
        entries.splice(++entryIndex, entries.length, url);
    },
    replaceState(_state, _title, nextUrl) {
        url = new URL(nextUrl, url);
        entries[entryIndex] = url;
    },
    back() {
        url = entries[--entryIndex];
        window.dispatchEvent(new Event('popstate'));
    },
    forward() {
        url = entries[++entryIndex];
        window.dispatchEvent(new Event('popstate'));
    },
};
window.history = history;
let urlEvents = 0;
let routeRuns = 0;
let poll;
window.addEventListener('rovalra:urlChanged', () => urlEvents++);

// Run the production watcher without initializing unrelated extension features.
vm.runInNewContext(
    source.slice(declarationsStart, declarationsEnd) +
        source.slice(watcherStart, watcherEnd) +
        '\nsetupUrlChangeListeners();',
    {
        window,
        history,
        CustomEvent,
        normalizeGamePageHash() {},
        runFeaturesForPage() {
            routeRuns++;
        },
        setInterval(callback, delay) {
            assert.equal(delay, 500);
            assert.equal(poll, undefined);
            poll = callback;
        },
        console: { log() {} },
    },
);
const check = (events, routes) =>
    assert.deepEqual(
        { urlEvents, routeRuns },
        { urlEvents: events, routeRuns: routes },
    );
check(0, 0);

// The native search changes its keyword without changing its pathname.
history.pushState({}, '', '?keyword=test');
check(1, 0);
history.replaceState({}, '', '?keyword=forest');
check(2, 0);
history.back();
check(3, 0);
history.forward();
check(4, 0);
history.replaceState({}, '', '?keyword=forest');
poll();
check(4, 0);

// Hash changes preserve existing behavior; keyword values remain case sensitive.
history.pushState({}, '', '#results');
window.dispatchEvent(new Event('hashchange'));
poll();
check(4, 0);
history.replaceState({}, '', '?keyword=Forest#results');
check(5, 0);

// Polling catches changes made outside the wrapped history methods exactly once.
url = new URL('?keyword=lake', url);
poll();
check(6, 0);
poll();
check(6, 0);

history.pushState({}, '', '/pt/charts');
check(7, 1);
history.replaceState({}, '', '/pt/charts?sort=popular');
check(8, 1);
url = new URL('/pt/discover/?keyword=cart', url);
poll();
check(9, 2);
poll();
check(9, 2);

console.log('URL change watcher checks passed.');
