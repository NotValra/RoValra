import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const sourcePath = path.resolve(
    'src/content/core/utils/trackers/friendslist.js',
);
const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'rovalra-friends-test-'),
);
const bundlePath = path.join(temporaryDirectory, 'friendslist.mjs');

const mockModules = {
    '../../api': `export const callRobloxApiJson = (...args) => globalThis.__friendsTest.callApi(...args);`,
    '../../user': `export const getAuthenticatedUserId = async () => 7;`,
    '../../locale/i18n.js': `export const ts = (key) => key;`,
    '../../settings/getSettings.js': `export const settings = { unfriendDetectorEnabled: false };`,
    './unfriendDetector.js': `export const reportDetectedUnfriends = async () => {};`,
    '../../apis/users.js': `
        export const getMultiProfileInsights = async () => ({ userInsights: [] });
        export const getUserProfileData = async (ids) => globalThis.__friendsTest.getProfiles(ids);
        export const INSIGHT_CASES = {};
        export const RANKING_STRATEGIES = { TC_INFO_BOOST: 'tc_info_boost', PROFILE_INFO_BOOST: 'profile_info_boost' };
    `,
};

await build({
    entryPoints: [sourcePath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [
        {
            name: 'friendslist-test-mocks',
            setup(buildApi) {
                buildApi.onResolve({ filter: /.*/ }, (args) => {
                    if (Object.hasOwn(mockModules, args.path)) {
                        return { path: args.path, namespace: 'friendslist-test' };
                    }
                    return undefined;
                });
                buildApi.onLoad(
                    { filter: /.*/, namespace: 'friendslist-test' },
                    (args) => ({ contents: mockModules[args.path], loader: 'js' }),
                );
            },
        },
    ],
});

const { fetchAllTrustedFriends, updateFriendsList } = await import(
    `${pathToFileURL(bundlePath).href}?test=${Date.now()}`
);

function makeFriend(id) {
    return { id };
}

function makeProfiles(ids) {
    return {
        profileDetails: ids.map((userId) => ({
            userId,
            names: {
                username: `user${userId}`,
                displayName: `User ${userId}`,
                combinedName: `User ${userId} (@user${userId})`,
            },
            isDeleted: false,
            isVerified: false,
            hasRobloxSubscription: false,
        })),
    };
}

function setup({
    pages,
    count,
    profiles,
    trustedPages,
    existingFriends = [{ id: 99 }],
}) {
    const storage = {
        rovalra_friends_data: {
            7: { friendsList: existingFriends, friendsCount: existingFriends.length },
        },
    };
    const requests = [];
    let profileCalls = [];
    globalThis.chrome = {
        storage: {
            local: {
                get(keys, callback) {
                    const result = {};
                    for (const key of keys) {
                        if (key in storage) result[key] = structuredClone(storage[key]);
                    }
                    callback(result);
                },
                set(values, callback) {
                    Object.assign(storage, structuredClone(values));
                    callback?.();
                },
            },
        },
    };
    globalThis.__friendsTest = {
        requests,
        getProfiles(ids) {
            profileCalls.push([...ids]);
            return profiles ? profiles(ids) : makeProfiles(ids);
        },
        async callApi({ subdomain, endpoint }) {
            requests.push({ subdomain, endpoint });
            if (subdomain === 'friends' && endpoint.endsWith('/friends/count')) {
                return { count };
            }
            if (subdomain === 'friends' && endpoint.endsWith('/friends/online')) {
                return { data: [] };
            }
            if (subdomain === 'apis' && endpoint.includes('get-user-conversations')) {
                return { conversations: [] };
            }
            if (subdomain === 'friends' && endpoint.includes('/friends/find')) {
                if (endpoint.includes('findFriendsType=FindTrustedFriends')) {
                    const query = new URLSearchParams(endpoint.split('?')[1]);
                    const cursor = query.get('cursor');
                    const trustedPage = trustedPages?.[cursor ?? 'first'];
                    if (trustedPage instanceof Error) throw trustedPage;
                    return trustedPage ?? { PageItems: [], NextCursor: null };
                }
                const query = new URLSearchParams(endpoint.split('?')[1]);
                const cursor = query.get('cursor');
                const page = pages[cursor ?? 'first'];
                if (page instanceof Error) throw page;
                return page;
            }
            throw new Error(`Unexpected mock API request: ${subdomain} ${endpoint}`);
        },
    };
    return { storage, requests, getProfileCalls: () => profileCalls };
}

test('follows valid cursors through multiple pages and stores all unique friends', async () => {
    const harness = setup({
        count: 2,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'next/1' },
            'next/1': { PageItems: [makeFriend(2)], NextCursor: null },
        },
        existingFriends: [],
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result.map((friend) => friend.id), [1, 2]);
    assert.ok(
        harness.requests.some((request) =>
            request.endpoint.includes('cursor=next%2F1'),
        ),
    );
});

test('accepts an empty final page with no NextCursor', async () => {
    setup({
        count: 1,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'last' },
            last: { PageItems: [] },
        },
        existingFriends: [],
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result.map((friend) => friend.id), [1]);
});

test('terminates after a non-empty page when NextCursor is absent', async () => {
    setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)] } },
        existingFriends: [],
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result.map((friend) => friend.id), [1]);
});

test('keeps the previous cache when a cursor repeats', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 2,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'repeat' },
            repeat: { PageItems: [makeFriend(2)], NextCursor: 'repeat' },
        },
        existingFriends: previous,
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result, previous);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, previous);
});

test('keeps the previous cache when a later page request fails', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 2,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'fail' },
            fail: new Error('mock request failed'),
        },
        existingFriends: previous,
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result, previous);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, previous);
});

test('deduplicates repeated friend IDs before profile processing', async () => {
    const harness = setup({
        count: 1,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'second' },
            second: { PageItems: [makeFriend('1')], NextCursor: null },
        },
        existingFriends: [],
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result.map((friend) => friend.id), [1]);
    assert.deepEqual(harness.getProfileCalls(), [[1]]);
});

test('keeps the previous cache if unique paginated IDs are fewer than the API count', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 2,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'second' },
            second: { PageItems: [makeFriend(1)], NextCursor: null },
        },
        existingFriends: previous,
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result, previous);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, previous);
});

test('keeps the previous cache if profile data omits a requested friend', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)], NextCursor: null } },
        profiles: async () => ({ profileDetails: [] }),
        existingFriends: previous,
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result, previous);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, previous);
});

test('returns cached records after an unexpected processing error', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)], NextCursor: null } },
        profiles: async () => {
            throw new Error('unexpected profile processing failure');
        },
        existingFriends: previous,
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result, previous);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, previous);
});

test('returns null rather than partial trusted IDs after a page failure', async () => {
    setup({
        count: 0,
        pages: { first: { PageItems: [], NextCursor: null } },
        trustedPages: { first: new Error('mock trusted-friends failure') },
    });
    assert.equal(await fetchAllTrustedFriends(7), null);
});

test('stops trusted-friends pagination when a cursor repeats', async () => {
    const harness = setup({
        count: 0,
        pages: { first: { PageItems: [], NextCursor: null } },
        trustedPages: {
            first: { PageItems: [{ id: 5 }], NextCursor: 'repeat' },
            repeat: { PageItems: [{ id: 6 }], NextCursor: 'repeat' },
        },
    });
    assert.equal(await fetchAllTrustedFriends(7), null);
    const trustedRequests = harness.requests.filter((request) =>
        request.endpoint.includes('findFriendsType=FindTrustedFriends'),
    );
    assert.equal(trustedRequests.length, 2);
});

test('preserves the friend cache when trusted-friends refresh is incomplete', async () => {
    const previous = [{ id: 99, isTrusted: true }];
    const harness = setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)], NextCursor: null } },
        trustedPages: { first: new Error('mock trusted-friends failure') },
        existingFriends: previous,
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(result, previous);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, previous);
});

test.after(async () => {
    delete globalThis.chrome;
    delete globalThis.__friendsTest;
    await rm(temporaryDirectory, { recursive: true, force: true });
});
