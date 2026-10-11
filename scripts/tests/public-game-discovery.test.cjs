// Build the extension, then run with node; PLAYWRIGHT_MODULE can point to an existing installation.
// Screenshots use a mocked Roblox page and responses, not an authenticated account.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '../..');
const output = path.join(tmpdir(), 'rovalra-public-game-discovery');
const game = (id, name, maturity) => ({
    universeId: id,
    rootPlaceId: id + 1000,
    name,
    contentMaturity: maturity,
    playerCount: 350,
    totalUpVotes: 90,
    totalDownVotes: 10,
});
const results = [
    game(3, 'Cart Ride <img src=x onerror=alert(1)>', 'mild'),
    game(4, 'Moderate Cart Ride', 'moderate'),
];
const searchResponse = (games, nextPageToken = '') => ({
    searchResults: [{ contentGroupType: 'Game', contents: games }],
    nextPageToken,
});

async function run() {
    const locale = JSON.parse(
        await fs.readFile(
            path.join(root, 'public/Assets/locales/en.json'),
            'utf8',
        ),
    );
    const mocks = {
        'api.js': `export const callRobloxApiJson = options => window.__request(options);
            export const callRobloxApi = () => { throw new Error('Unexpected card API request'); };`,
        'getSettings.js':
            'export const settings = new Proxy({}, {get: () => window.__enabled});',
        'i18n.js': `const locale = ${JSON.stringify(locale)};
            export function ts(key, values = {}) {
                const value = key.split('.').reduce((result, part) => result?.[part], locale);
                if (typeof value !== 'string') throw new Error('Missing translation: ' + key);
                return value.replace(/{{(.*?)}}/g, (_, name) => String(values[name] ?? ''));
            }
            export const t = async (...args) => ts(...args);`,
        'thumbnails.js': `export async function fetchThumbnails(items, type, size) {
                window.__thumbnailRequests.push({ids: items.map(item => item.id), type, size});
                return new Map(items.map(({id}) => [id, { imageUrl: window.__thumbnail }]));
            }
            export function createThumbnailElement(data, name, className) {
                const image = document.createElement('img');
                image.src = data?.imageUrl || window.__thumbnail;
                image.alt = name; image.className = className;
                return image;
            }`,
        'friendListOverlay.js':
            'export const showFriendListOverlay = () => { throw new Error("Unexpected friend overlay"); };',
        'friendslist.js': 'export const getCachedFriendsList = async () => [];',
        'toast.js': 'export const createAssetIcon = () => null;',
    };
    const bundle = await esbuild.build({
        stdin: {
            contents: `import { init } from './src/content/features/search/publicGameDiscovery.js'; window.__init = init;`,
            resolveDir: root,
        },
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        plugins: [
            {
                name: 'mock-boundaries',
                setup(build) {
                    build.onResolve(
                        {
                            filter: /(?:api|getSettings|i18n|thumbnails|friendListOverlay|friendslist|toast)\.js$/,
                        },
                        (args) => {
                            const name = path.basename(args.path);
                            return mocks[name]
                                ? { path: name, namespace: 'mock' }
                                : undefined;
                        },
                    );
                    build.onLoad(
                        { filter: /.*/, namespace: 'mock' },
                        (args) => ({ contents: mocks[args.path] }),
                    );
                },
            },
        ],
    });
    const css = (
        await Promise.all(
            ['rovalra', 'sitewide'].map((name) =>
                fs.readFile(path.join(root, `dist/css/${name}.css`), 'utf8'),
            ),
        )
    ).join('\n');
    const scaffold = `<!doctype html><html><head><meta charset="utf-8"></head><body class="dark-theme">
        <header>ROBLOX <span>Charts &nbsp; Marketplace &nbsp; Create &nbsp; Robux</span><input id="navbar-search-input" aria-label="Search" value="cart ride"></header>
        <aside>Home<br><br>Profile<br><br>Friends<br><br>Avatar<br><br>Inventory</aside>
        <main id="content"><div id="game-search-web-app"><div id="games-search-page">
            <div class="native-games"><a href="/games/1001/">Normal Roblox search results</a></div>
        </div></div></main><footer>Mocked integration preview · account access remains enforced by Roblox</footer>
        </body></html>`;
    const previewCss = `*{box-sizing:border-box}body{margin:0;background:#111216;color:#f7f7f8;font:16px Arial}
        :root{--color-surface-100:#272930;--color-content-emphasis:#f7f7f8;--rovalra-main-text-color:#f7f7f8;--rovalra-secondary-text-color:#b7bcc5;--rovalra-container-background-color:#353943;--rovalra-border-color:#686d78;--rovalra-playbutton-color:#335fff}
        header{height:55px;padding:15px 24px;background:#1b1c21;font-weight:bold;font-size:23px}header span{font-size:15px;margin-left:40px}header input{width:180px;margin-left:20px}
        aside{position:absolute;padding:35px 24px;width:180px;line-height:1.6}main{margin-left:180px;padding:25px 30px}h1{margin-top:0}
        button,input{font:inherit;color:inherit}button{cursor:pointer;border:1px solid #686d78;background:#353943;border-radius:8px;padding:9px 16px}
        button:disabled{opacity:.5}.native-games{height:300px;border:1px solid #353943;border-radius:10px;padding:30px;color:#b7bcc5}
        .btn-toggle{width:42px;height:24px;padding:0;border-radius:12px;background:#686d78}.btn-toggle.on{background:#335fff}
        .game-card-info{position:relative;top:-6px;bottom:6px}
        footer{padding:12px;background:#1b1c21;color:#b7bcc5;font-size:13px}
        .rovalra-dropdown-content-panel{background:#272930;color:#f7f7f8;border:1px solid #686d78}.relative{position:relative}.absolute{position:absolute}.flex{display:flex}`;
    const index = await fs.readFile(
        path.join(root, 'src/content/index.js'),
        'utf8',
    );
    const watcherStart = index.indexOf('async function handleUrlChange()');
    const watcherEnd = index.indexOf('\ninitializePage();', watcherStart);
    assert(watcherStart >= 0 && watcherEnd > watcherStart);
    const urlWatcher = `let lastPath = location.pathname.toLowerCase();
        let lastSearch = location.search;
        function runFeaturesForPage() {}
        function normalizeGamePageHash() {}
        ${index.slice(watcherStart, watcherEnd)}
        setupUrlChangeListeners();`;
    const browser = await chromium.launch({ headless: true });
    await fs.mkdir(output, { recursive: true });
    try {
        const page = await browser.newPage({
            viewport: { width: 1280, height: 850 },
        });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) =>
            route.fulfill({ contentType: 'text/html', body: scaffold }),
        );
        await page.goto(
            'https://www.roblox.com/pt/discover/?keyword=cart%20ride',
        );
        await page.addStyleTag({ content: previewCss + css });
        await page.evaluate(
            ({ results }) => {
                window.__enabled = false;
                window.__requests = [];
                window.__thumbnailRequests = [];
                window.__results = results;
                window.__pending = new Map();
                window.__thumbnail =
                    'data:image/svg+xml,' +
                    encodeURIComponent(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#28567a"/><path d="M0 125L55 55l95 90" fill="none" stroke="#f4cd58" stroke-width="14"/><circle cx="108" cy="35" r="16" fill="#78b7ca"/></svg>',
                    );
                window.__request = async (options) => {
                    window.__requests.push(options);
                    const url = new URL(
                        options.endpoint,
                        'https://apis.roblox.com',
                    );
                    const query = url.searchParams.get('searchQuery');
                    if (url.searchParams.get('pageToken') && window.__failMore)
                        throw new Error('Fixture pagination failure');
                    if (query === 'slow' || query === 'close') {
                        return new Promise((resolve) =>
                            window.__pending.set(query, resolve),
                        );
                    }
                    if (query === 'error' && !window.__retry)
                        throw new Error('Fixture network failure');
                    if (query === 'empty')
                        return { searchResults: [], nextPageToken: '' };
                    if (query === 'unknown')
                        return {
                            searchResults: [
                                {
                                    contentGroupType: 'Game',
                                    contents: [
                                        {
                                            ...window.__results[0],
                                            name: 'Unrated Cart Ride',
                                            contentMaturity: 'new-label',
                                        },
                                        {
                                            ...window.__results[1],
                                            name: 'Invalid game',
                                            rootPlaceId: -1,
                                        },
                                    ],
                                },
                            ],
                            nextPageToken: '',
                        };
                    if (query)
                        return {
                            searchResults: [
                                {
                                    contentGroupType: 'Game',
                                    contents: url.searchParams.get('pageToken')
                                        ? [
                                              window.__results[1],
                                              {
                                                  ...window.__results[0],
                                                  universeId: 5,
                                                  rootPlaceId: 1005,
                                                  name: 'More Cart Rides',
                                              },
                                          ]
                                        : window.__results,
                                },
                            ],
                            nextPageToken: url.searchParams.get('pageToken')
                                ? ''
                                : 'page-two',
                        };
                    throw new Error('Search query required');
                };
            },
            { results },
        );
        await page.addScriptTag({ content: urlWatcher });
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(() => window.__init());
        assert.equal(
            await page.locator('#rovalra-public-game-discovery').count(),
            0,
        );
        assert.equal(await page.evaluate(() => window.__requests.length), 0);
        await page.screenshot({ path: path.join(output, 'before.png') });
        await page.evaluate(() =>
            document.dispatchEvent(
                new CustomEvent('rovalra:settingSaved', {
                    detail: { name: 'publicGameDiscoveryEnabled', value: true },
                }),
            ),
        );
        const section = page.locator('#rovalra-public-game-discovery');
        const native = page.locator('#game-search-web-app');
        const toggle = page.getByRole('switch', { name: 'Public results' });
        await section.waitFor();
        assert.equal(await native.isVisible(), true);
        assert.equal(await toggle.getAttribute('aria-checked'), 'false');
        assert.equal(await page.evaluate(() => window.__requests.length), 0);
        assert.equal(await section.locator('input').count(), 0);
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.screenshot({ path: path.join(output, 'after.png') });
        await toggle.click();
        const cards = page.locator(
            '.rovalra-public-game-grid .rovalra-game-card',
        );
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 2,
        );
        assert.match(
            await page.getByRole('status').textContent(),
            /Public search results/,
        );
        assert.equal(await native.isVisible(), false);
        assert.deepEqual(
            await page.evaluate(() => window.__thumbnailRequests),
            [{ ids: [1003, 1004], type: 'GameThumbnail', size: '480x270' }],
        );
        assert.equal(
            await cards.evaluateAll((elements) =>
                elements.every((card) => {
                    const name = card
                        .querySelector('.game-card-name')
                        .getBoundingClientRect();
                    const stats = card
                        .querySelector('.game-card-info')
                        .getBoundingClientRect();
                    const maturity = card
                        .querySelector('.rovalra-public-game-maturity')
                        .getBoundingClientRect();
                    return (
                        name.bottom <= stats.top + 1 &&
                        stats.bottom <= maturity.top + 1
                    );
                }),
            ),
            true,
            'Native card styles must not overlap the title, stats, or maturity',
        );
        await toggle.focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(
            await page
                .locator('#navbar-search-input')
                .evaluate((element) => element === document.activeElement),
            true,
            'Inline public results must keep normal page keyboard navigation',
        );
        await page.keyboard.press('Tab');
        assert.equal(
            await toggle.evaluate((e) => e === document.activeElement),
            true,
        );
        await page.screenshot({ path: path.join(output, 'browser.png') });
        await page.getByRole('combobox', { name: 'Maturity' }).click();
        await page
            .getByRole('option', { name: 'Moderate', exact: true })
            .focus();
        await page.keyboard.press('Enter');
        assert.equal(
            await page
                .getByRole('combobox', { name: 'Maturity' })
                .evaluate((e) => e === document.activeElement),
            true,
        );
        assert.equal(await cards.count(), 1);
        assert.match(await cards.textContent(), /Moderate Cart Ride/);
        const search = async (value) => {
            await page.evaluate((value) => {
                history.pushState(
                    {},
                    '',
                    '/pt/discover/?' + new URLSearchParams({ keyword: value }),
                );
            }, value);
        };
        await search('cart ride');
        await page.waitForFunction(
            () =>
                document.querySelector('[role="status"]').textContent ===
                'Public search results',
        );
        assert.match(await cards.textContent(), /Moderate Cart Ride/);
        await page.getByRole('combobox', { name: 'Maturity' }).click();
        await page
            .getByRole('option', { name: 'All maturities', exact: true })
            .click();
        assert.equal(await cards.count(), 2);
        assert.equal(await cards.locator('.game-card-name img').count(), 0);
        assert.match(
            await cards.first().textContent(),
            /<img src=x onerror=alert\(1\)>/,
        );
        await page.evaluate(() => {
            window.__failMore = true;
        });
        await page
            .getByRole('button', { name: 'Load more', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Try again', exact: true })
            .waitFor();
        assert.equal(
            await cards.count(),
            2,
            'Pagination errors must preserve loaded results',
        );
        await page.evaluate(() => {
            window.__failMore = false;
        });
        await page
            .getByRole('button', { name: 'Try again', exact: true })
            .click();
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 3,
        );
        assert.equal(
            await page
                .getByRole('button', { name: 'Load more', exact: true })
                .isVisible(),
            false,
        );
        const links = await cards
            .locator('a')
            .evaluateAll((elements) => elements.map((element) => element.href));
        assert(
            links.every((href) =>
                /^https:\/\/www\.roblox\.com\/games\/\d+\//.test(href),
            ),
        );
        const requests = await page.evaluate(() =>
            window.__requests.map((request) => ({
                ...request,
                signal: undefined,
            })),
        );
        assert(
            requests.every(
                (request) =>
                    request.credentials === 'omit' &&
                    request.subdomain === 'apis' &&
                    request.endpoint.startsWith('/search-api/omni-search?'),
            ),
        );
        assert(
            requests.every(
                (request) =>
                    !/gamejoin|playability|user-settings|guac/.test(
                        request.endpoint,
                    ),
            ),
        );
        assert(
            requests.some(
                (request) =>
                    new URL(
                        request.endpoint,
                        'https://apis.roblox.com',
                    ).searchParams.get('pageToken') === 'page-two',
            ),
        );
        await search('empty');
        await page.waitForFunction(() =>
            document
                .querySelector('[role="status"]')
                .textContent.startsWith('No games match'),
        );
        assert.equal(await cards.count(), 0);
        await search('unknown');
        await page.waitForFunction(
            () =>
                document.querySelector('[role="status"]').textContent ===
                'Public search results',
        );
        assert.equal(await cards.count(), 1);
        assert.match(await cards.textContent(), /Maturity: Unrated/);
        assert.equal(
            await page.getByText('Invalid game', { exact: true }).count(),
            0,
        );
        await search('error');
        await page.waitForFunction(() =>
            document
                .querySelector('[role="status"]')
                .textContent.startsWith('Games could not'),
        );
        await page.evaluate(() => {
            window.__retry = true;
        });
        await page
            .getByRole('button', { name: 'Try again', exact: true })
            .click();
        await page.waitForFunction(
            () =>
                document.querySelector('[role="status"]').textContent ===
                'Public search results',
        );
        await search('slow');
        await page.waitForFunction(() => window.__pending.has('slow'));
        await search('cart ride');
        await page.waitForFunction(
            () =>
                document.querySelector('[role="status"]').textContent ===
                'Public search results',
        );
        await page.evaluate(
            (response) => window.__pending.get('slow')(response),
            searchResponse([game(9, 'Stale result', 'minimal')]),
        );
        await page.waitForTimeout(50);
        assert.equal(
            await page.getByText('Stale result', { exact: true }).count(),
            0,
        );
        await search('close');
        await page.waitForFunction(() => window.__pending.has('close'));
        await toggle.click();
        assert.equal(await native.isVisible(), true);
        assert.equal(
            await page.locator('#rovalra-public-game-results').isVisible(),
            false,
        );
        assert.equal(
            await page.evaluate(() => window.__requests.at(-1).signal.aborted),
            true,
        );
        await page.evaluate(
            (response) => window.__pending.get('close')(response),
            searchResponse([game(9, 'Cancelled result', 'minimal')]),
        );
        await search('cart ride');
        await toggle.click();
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 2,
        );
        await page.evaluate(() =>
            document.querySelector('#game-search-web-app').remove(),
        );
        await page.waitForFunction(
            () =>
                !document.querySelector('#rovalra-public-game-discovery') &&
                !document.querySelector('[role="dialog"]'),
        );
        await page.evaluate(() => {
            const root = document.createElement('div');
            root.id = 'game-search-web-app';
            root.innerHTML =
                '<a href="/games/1001/">Restored native results</a>';
            document.querySelector('main').append(root);
        });
        await section.waitFor();
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 2,
        );
        assert.equal(await section.count(), 1);
        assert.equal(await native.isVisible(), false);
        assert.equal(
            await page.getByText('Cancelled result', { exact: true }).count(),
            0,
        );

        await page.setViewportSize({ width: 390, height: 844 });
        await page.addStyleTag({
            content:
                '@media(max-width:767px){header{height:auto;padding:10px}header span{display:none}header input{margin-left:10px;width:160px}aside{display:none}main{margin:0;padding:20px 0}}',
        });
        assert.equal(
            await cards.evaluateAll(
                (es) =>
                    es[0].getBoundingClientRect().top ===
                    es[1].getBoundingClientRect().top,
            ),
            true,
        );
        assert.equal(
            await section.evaluate(
                (e) => e.getBoundingClientRect().right <= window.innerWidth,
            ),
            true,
        );
        await page.screenshot({ path: path.join(output, 'mobile.png') });

        await search('slow');
        await page.waitForFunction(() =>
            window.__requests.at(-1).endpoint.includes('searchQuery=slow'),
        );
        await page.evaluate(() =>
            document.dispatchEvent(
                new CustomEvent('rovalra:settingSaved', {
                    detail: {
                        name: 'publicGameDiscoveryEnabled',
                        value: false,
                    },
                }),
            ),
        );
        assert.equal(await section.count(), 0);
        assert.equal(await native.isVisible(), true);
        assert.equal(
            await page.evaluate(() => window.__requests.at(-1).signal.aborted),
            true,
        );
        assert.equal(
            await page.locator('.rovalra-dropdown-content-panel').count(),
            0,
        );
        await page.evaluate(() =>
            document.dispatchEvent(
                new CustomEvent('rovalra:settingSaved', {
                    detail: { name: 'publicGameDiscoveryEnabled', value: true },
                }),
            ),
        );
        await section.waitFor();
        assert.equal(await toggle.getAttribute('aria-checked'), 'false');
        await search('cart ride');
        await toggle.click();
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 2,
        );
        await search('empty');
        await page.waitForFunction(() =>
            document
                .querySelector('[role="status"]')
                .textContent.startsWith('No games match'),
        );
        await page.goBack();
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 2,
        );
        assert.equal(await toggle.getAttribute('aria-checked'), 'true');

        await page.evaluate(() =>
            history.pushState({}, '', '/pt/charts?keyword=cart'),
        );
        assert.equal(await section.count(), 0, 'Charts must remain untouched');
        assert.equal(await native.isVisible(), true);
        await page.evaluate(() => history.pushState({}, '', '/pt/discover/'));
        assert.equal(
            await section.count(),
            0,
            'Discovery without a keyword must remain untouched',
        );
        await page.evaluate(() =>
            history.replaceState({}, '', '/pt/discover/?keyword=cart%20ride'),
        );
        await section.waitFor();
        assert.equal(await toggle.getAttribute('aria-checked'), 'false');
        assert.equal(await native.isVisible(), true);
        assert.deepEqual(errors, []);
        console.log(
            'Public game discovery browser checks passed. Mocked preview screenshots: ' +
                output,
        );
    } finally {
        await browser.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
