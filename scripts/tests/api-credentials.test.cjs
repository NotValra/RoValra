const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const requests = [];
let userLookups = 0;
let batGenerations = 0;
const dependencies = {
    './utils.js': { getCsrfToken: async () => null },
    './user.js': {
        getAuthenticatedUserId: async () => {
            userLookups++;
            return 123;
        },
    },
    'roblox-bat': {
        HBAClient: class {
            async generateBaseHeaders() {
                batGenerations++;
                return { 'x-bound-auth-token': 'account-token' };
            }
        },
    },
    './oauth/oauth.js': { getValidAccessToken: async () => null },
    './utils/trackers/apiKey.js': {},
    './ui/roblox/alert.js': {},
    './utils/location.js': {},
};
const apiModule = { exports: {} };
const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/content/core/api.js'),
    'utf8',
);
vm.runInNewContext(transformSync(source, { format: 'cjs' }).code, {
    module: apiModule,
    require: (name) => {
        assert.ok(
            Object.hasOwn(dependencies, name),
            `Unexpected import: ${name}`,
        );
        return dependencies[name];
    },
    Headers,
    Response,
    URL,
    FormData,
    setTimeout,
    clearTimeout,
    console,
    navigator: { userAgent: 'Chrome/1' },
    chrome: {
        runtime: { getManifest: () => ({ version: 'test' }) },
        storage: { local: { get: (keys, callback) => callback({}) } },
    },
    fetch: async (url, options) => {
        const request = {
            url,
            credentials: options.credentials,
            headers: Object.fromEntries(options.headers),
        };
        requests.push(request);
        // Keep concurrent requests in flight long enough to exercise deduplication.
        await new Promise((resolve) => setImmediate(resolve));
        return Response.json({ credentials: request.credentials });
    },
});

async function test() {
    const { callRobloxApi } = apiModule.exports;
    const headers = Object.freeze({ 'X-Feature': 'public-discovery' });
    const publicOptions = Object.freeze({
        endpoint: '/discovery-api/test-public',
        credentials: 'omit',
        headers,
    });
    await callRobloxApi(publicOptions);
    assert.equal(userLookups, 0);
    assert.equal(batGenerations, 0);
    assert.equal(requests[0].credentials, 'omit');
    assert.equal(requests[0].headers['x-bound-auth-token'], undefined);
    assert.equal(requests[0].headers['x-feature'], 'public-discovery');
    assert.deepEqual(publicOptions.headers, {
        'X-Feature': 'public-discovery',
    });

    await callRobloxApi({ endpoint: '/discovery-api/test-default' });
    assert.equal(userLookups, 1);
    assert.equal(batGenerations, 1);
    assert.equal(requests[1].credentials, 'include');
    assert.equal(requests[1].headers['x-bound-auth-token'], 'account-token');

    const requestCount = requests.length;
    const responses = await Promise.all([
        callRobloxApi({
            endpoint: '/discovery-api/test-isolation',
            credentials: 'omit',
        }),
        callRobloxApi({
            endpoint: '/discovery-api/test-isolation',
            credentials: 'include',
        }),
    ]);
    assert.equal(requests.length, requestCount + 2);
    assert.deepEqual(
        await Promise.all(responses.map((response) => response.json())),
        [{ credentials: 'omit' }, { credentials: 'include' }],
    );

    const beforeDefaults = requests.length;
    await Promise.all([
        callRobloxApi({ endpoint: '/discovery-api/test-equivalent-defaults' }),
        callRobloxApi({
            endpoint: '/discovery-api/test-equivalent-defaults',
            credentials: 'include',
        }),
        callRobloxApi({
            endpoint: '/discovery-api/test-equivalent-defaults',
            credentials: null,
        }),
    ]);
    assert.equal(requests.length, beforeDefaults + 1);

    const rovalraOptions = {
        isRovalraApi: true,
        subdomain: 'apis',
        endpoint: '/v1/users/123/badges',
        skipAutoAuth: true,
    };
    const beforeRovalra = requests.length;
    await Promise.all([
        callRobloxApi(rovalraOptions),
        callRobloxApi({ ...rovalraOptions, credentials: 'omit' }),
        callRobloxApi({ ...rovalraOptions, credentials: 'include' }),
    ]);
    assert.equal(requests.length, beforeRovalra + 2);
    assert.equal(requests[beforeRovalra].credentials, 'omit');
    assert.equal(requests[beforeRovalra + 1].credentials, 'include');
    console.log('API credential isolation checks passed.');
}

test().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
