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
const popular = [
    game(1, 'Mountain Cart Ride', 'minimal'),
    game(2, 'Forest Adventure', 'moderate'),
];
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
        'thumbnails.js': `export async function fetchThumbnails(items) {
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
            contents: `import { init } from './src/content/features/charts/publicGameDiscovery.js'; window.__init = init;`,
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
        <header>ROBLOX <span>Charts &nbsp; Marketplace &nbsp; Create &nbsp; Robux</span></header>
        <aside>Home<br><br>Profile<br><br>Friends<br><br>Avatar<br><br>Inventory</aside>
        <main><h1>Charts</h1><div id="game-carousel-web-app">
            <div class="native-filters">Computer &nbsp; United States &nbsp; All maturities</div>
            <h2>Top Playing Now</h2><div class="native-games">Public Roblox Charts</div>
        </div></main><footer>Mocked integration preview · account access remains enforced by Roblox</footer>
        </body></html>`;
    const previewCss = `*{box-sizing:border-box}body{margin:0;background:#111216;color:#f7f7f8;font:16px Arial}
        :root{--color-surface-100:#272930;--color-content-emphasis:#f7f7f8;--rovalra-main-text-color:#f7f7f8;--rovalra-secondary-text-color:#b7bcc5;--rovalra-container-background-color:#353943;--rovalra-border-color:#686d78;--rovalra-playbutton-color:#335fff}
        header{height:55px;padding:15px 24px;background:#1b1c21;font-weight:bold;font-size:23px}header span{font-size:15px;margin-left:40px}
        aside{position:absolute;padding:35px 24px;width:180px;line-height:1.6}main{margin-left:180px;padding:25px 30px}h1{margin-top:0}
        button,input{font:inherit;color:inherit}button{cursor:pointer;border:1px solid #686d78;background:#353943;border-radius:8px;padding:9px 16px}
        button:disabled{opacity:.5}.native-filters{background:#272930;border-radius:20px;padding:12px}.native-games{height:300px;border:1px solid #353943;border-radius:10px;padding:30px;color:#b7bcc5}
        .game-card-info{position:relative;top:-6px;bottom:6px}
        footer{position:fixed;bottom:0;width:100%;padding:12px;background:#1b1c21;color:#b7bcc5;font-size:13px}.rovalra-overlay-close .icon:before{content:'×';font-size:22px}
        .rovalra-dropdown-content-panel{background:#272930;color:#f7f7f8;border:1px solid #686d78}.relative{position:relative}.absolute{position:absolute}.flex{display:flex}`;
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
        await page.goto('https://www.roblox.com/pt/charts');
        await page.addStyleTag({ content: previewCss + css });
        await page.evaluate(
            ({ popular, results }) => {
                window.__enabled = false;
                window.__requests = [];
                window.__popular = popular;
                window.__results = results;
                window.__pending = new Map();
                window.__thumbnail =
                    'data:image/svg+xml,' +
                    encodeURIComponent(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#28567a"/><path d="M0 125L55 55l95 90" fill="none" stroke="#f4cd58" stroke-width="14"/><circle cx="108" cy="35" r="16" fill="#78b7ca"/></svg>',
                    );
                window.__request = async (options) => {
                    window.__requests.push({ ...options, signal: undefined });
                    const url = new URL(
                        options.endpoint,
                        'https://apis.roblox.com',
                    );
                    const query = url.searchParams.get('searchQuery');
                    if (query === 'slow' || query === 'close') {
                        return new Promise((resolve) =>
                            window.__pending.set(query, resolve),
                        );
                    }
                    if (query === 'error' && !window.__retry)
                        throw new Error('Fixture network failure');
                    if (query === 'empty')
                        return { searchResults: [], nextPageToken: '' };
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
                    return { games: window.__popular };
                };
            },
            { popular, results },
        );
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
        const trigger = page.locator('#rovalra-public-game-discovery');
        await trigger.waitFor();
        await page.screenshot({ path: path.join(output, 'after.png') });
        await trigger.click();
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
            /Popular public games/,
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
        await page.getByRole('button', { name: 'Close', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(
            await page
                .locator('#rovalra-public-game-query')
                .evaluate((element) => element === document.activeElement),
            true,
        );
        await page.keyboard.press('Shift+Tab');
        assert.equal(
            await page
                .getByRole('button', { name: 'Close', exact: true })
                .evaluate((element) => element === document.activeElement),
            true,
        );
        await page.screenshot({ path: path.join(output, 'browser.png') });
        await page.getByRole('combobox', { name: 'Maturity' }).click();
        await page.getByRole('button', { name: 'Close', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(
            await page.evaluate(() =>
                Boolean(
                    document.activeElement.closest(
                        '[role="dialog"], .rovalra-dropdown-content-panel',
                    ),
                ),
            ),
            true,
            'Open dropdown must keep keyboard focus in the modal',
        );
        await page.getByRole('combobox', { name: 'Maturity' }).focus();
        await page.keyboard.press('Tab');
        assert.equal(
            await page
                .getByRole('option', { name: 'All maturities', exact: true })
                .evaluate((element) => element === document.activeElement),
            true,
        );
        await page.getByRole('button', { name: 'Close', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(
            await page
                .locator('#rovalra-public-game-query')
                .evaluate((element) => element === document.activeElement),
            true,
        );
        await page.keyboard.press('Shift+Tab');
        assert.equal(
            await page
                .getByRole('button', { name: 'Close', exact: true })
                .evaluate((element) => element === document.activeElement),
            true,
        );
        await page
            .getByRole('option', { name: 'Moderate', exact: true })
            .click();
        assert.equal(await cards.count(), 1);
        assert.match(await cards.textContent(), /Forest Adventure/);
        const search = async (value) => {
            await page.locator('#rovalra-public-game-query').fill(value);
            await page.locator('#rovalra-public-game-query').press('Enter');
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
        await page
            .getByRole('button', { name: 'Load more', exact: true })
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
        const requests = await page.evaluate(() => window.__requests);
        assert(
            requests.every(
                (request) =>
                    request.credentials === 'omit' &&
                    request.subdomain === 'apis',
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
        await search('error');
        await page.waitForFunction(() =>
            document
                .querySelector('[role="status"]')
                .textContent.startsWith('Games could not'),
        );
        await page.evaluate(() => {
            window.__retry = true;
        });
        await search('error');
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
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').count(), 0);
        assert.equal(
            await trigger.evaluate(
                (element) => element === document.activeElement,
            ),
            true,
        );
        await page.evaluate(
            (response) => window.__pending.get('close')(response),
            searchResponse(popular),
        );
        await trigger.click();
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '.rovalra-public-game-grid .rovalra-game-card',
                ).length === 2,
        );
        await page.evaluate(() =>
            document.querySelector('#game-carousel-web-app').remove(),
        );
        await page.waitForFunction(
            () =>
                !document.querySelector('#rovalra-public-game-discovery') &&
                !document.querySelector('[role="dialog"]'),
        );
        await page.evaluate(() => {
            history.pushState({}, '', '/discover');
            const root = document.createElement('div');
            root.id = 'game-carousel-web-app';
            document.querySelector('main').append(root);
        });
        await trigger.waitFor();
        assert.equal(await trigger.count(), 1);
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
        assert.equal(await trigger.count(), 0);
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
