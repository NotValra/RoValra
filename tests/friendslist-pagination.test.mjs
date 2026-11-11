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
    '../../user': `export const getAuthenticatedUserId = async () => globalThis.__friendsTest?.authenticatedUserId ?? 7;`,
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
                        return {
                            path: args.path,
                            namespace: 'friendslist-test',
                        };
                    }
                    return undefined;
                });
                buildApi.onLoad(
                    { filter: /.*/, namespace: 'friendslist-test' },
                    (args) => ({
                        contents: mockModules[args.path],
                        loader: 'js',
                    }),
                );
            },
        },
    ],
});

const {
    fetchAllFriendsCustom,
    fetchAllTrustedFriends,
    fetchFriendsCustom,
    getFriendsList,
    updateFriendsList,
} = await import(`${pathToFileURL(bundlePath).href}?test=${Date.now()}`);

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
    conversationPages,
    authenticatedUserId = 7,
    existingFriends = [{ id: 99 }],
}) {
    const storage = {
        rovalra_friends_data: {
            7: {
                friendsList: existingFriends,
                friendsCount: existingFriends.length,
            },
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
                        if (key in storage)
                            result[key] = structuredClone(storage[key]);
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
        authenticatedUserId,
        getProfiles(ids) {
            profileCalls.push([...ids]);
            return profiles ? profiles(ids) : makeProfiles(ids);
        },
        async callApi({ subdomain, endpoint }) {
            requests.push({ subdomain, endpoint });
            if (
                subdomain === 'friends' &&
                endpoint.endsWith('/friends/count')
            ) {
                return { count };
            }
            if (
                subdomain === 'friends' &&
                endpoint.endsWith('/friends/online')
            ) {
                return { data: [] };
            }
            if (
                subdomain === 'apis' &&
                endpoint.includes('get-user-conversations')
            ) {
                const query = new URLSearchParams(endpoint.split('?')[1]);
                const cursor = query.get('cursor');
                const conversationPage = conversationPages?.[cursor ?? 'first'];
                if (conversationPage instanceof Error) throw conversationPage;
                return conversationPage ?? { conversations: [] };
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
            throw new Error(
                `Unexpected mock API request: ${subdomain} ${endpoint}`,
            );
        },
    };
    return { storage, requests, getProfileCalls: () => profileCalls };
}

test('follows valid cursors through multiple pages and stores all unique friends', async () => {
    const harness = setup({
        count: 2,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'next:/1' },
            'next:/1': { PageItems: [makeFriend(2)], NextCursor: null },
        },
        existingFriends: [],
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(
        result.map((friend) => friend.id),
        [1, 2],
    );
    const friendPageRequests = harness.requests.filter(
        (request) =>
            request.subdomain === 'friends' &&
            request.endpoint.includes('/friends/find') &&
            !request.endpoint.includes('findFriendsType='),
    );
    assert.equal(
        friendPageRequests[0].endpoint,
        '/v1/users/7/friends/find?limit=50',
    );
    const secondPageParams = new URLSearchParams(
        friendPageRequests[1].endpoint.split('?')[1],
    );
    assert.deepEqual(secondPageParams.getAll('cursor'), ['next:/1']);
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
    assert.deepEqual(
        result.map((friend) => friend.id),
        [1],
    );
});

test('terminates after a non-empty page when NextCursor is absent', async () => {
    setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)] } },
        existingFriends: [],
    });
    const result = await updateFriendsList(7);
    assert.deepEqual(
        result.map((friend) => friend.id),
        [1],
    );
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
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
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
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
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
    assert.deepEqual(
        result.map((friend) => friend.id),
        [1],
    );
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
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
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
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
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
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
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

test('rejects malformed trusted-friends cursors', async () => {
    const harness = setup({
        count: 0,
        pages: { first: { PageItems: [], NextCursor: null } },
        trustedPages: {
            first: {
                PageItems: [makeFriend(5)],
                NextCursor: { cursor: 'bad' },
            },
        },
    });

    assert.equal(await fetchAllTrustedFriends(7), null);
    const trustedRequests = harness.requests.filter((request) =>
        request.endpoint.includes('findFriendsType=FindTrustedFriends'),
    );
    assert.equal(trustedRequests.length, 1);
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
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
});

test('fetchFriendsCustom overrides a stale cursor without duplicating the parameter', async () => {
    const harness = setup({
        count: 0,
        pages: {
            'cursor:/two': {
                PageItems: [makeFriend(5)],
                NextCursor: null,
            },
        },
        existingFriends: [],
    });
    const params = new URLSearchParams({ userSort: '1', cursor: 'stale' });

    const response = await fetchFriendsCustom(7, params, 'cursor:/two');

    assert.deepEqual(response.PageItems, [makeFriend(5)]);
    const customRequest = harness.requests.find(
        (request) =>
            request.subdomain === 'friends' &&
            request.endpoint.includes('userSort=1'),
    );
    const query = new URLSearchParams(customRequest.endpoint.split('?')[1]);
    assert.deepEqual(query.getAll('cursor'), ['cursor:/two']);
});

test('fetchAllFriendsCustom follows every page and retains custom query parameters', async () => {
    const harness = setup({
        count: 0,
        pages: {
            first: { PageItems: [makeFriend(5)], NextCursor: 'custom:next' },
            'custom:next': { PageItems: [makeFriend(6)], NextCursor: null },
        },
        existingFriends: [],
    });

    const result = await fetchAllFriendsCustom(
        7,
        new URLSearchParams({ userSort: '1', cursor: 'stale' }),
    );

    assert.deepEqual(
        result.map((friend) => friend.id),
        [5, 6],
    );
    const customRequests = harness.requests.filter(
        (request) =>
            request.subdomain === 'friends' &&
            request.endpoint.includes('userSort=1'),
    );
    const firstPageParams = new URLSearchParams(
        customRequests[0].endpoint.split('?')[1],
    );
    const secondPageParams = new URLSearchParams(
        customRequests[1].endpoint.split('?')[1],
    );
    assert.deepEqual(firstPageParams.getAll('cursor'), []);
    assert.deepEqual(secondPageParams.getAll('cursor'), ['custom:next']);
});

test('fetchAllFriendsCustom rejects partial data after a later page failure', async () => {
    setup({
        count: 0,
        pages: {
            first: { PageItems: [makeFriend(5)], NextCursor: 'fail' },
            fail: new Error('custom page failed'),
        },
        existingFriends: [],
    });

    assert.equal(
        await fetchAllFriendsCustom(7, new URLSearchParams({ userSort: '1' })),
        null,
    );
});

test('fetchAllFriendsCustom terminates on repeated cursors', async () => {
    const harness = setup({
        count: 0,
        pages: {
            first: { PageItems: [makeFriend(5)], NextCursor: 'repeat' },
            repeat: { PageItems: [makeFriend(6)], NextCursor: 'repeat' },
        },
        existingFriends: [],
    });

    assert.equal(
        await fetchAllFriendsCustom(7, new URLSearchParams({ userSort: '1' })),
        null,
    );
    const customRequests = harness.requests.filter(
        (request) =>
            request.subdomain === 'friends' &&
            request.endpoint.includes('userSort=1'),
    );
    assert.equal(customRequests.length, 2);
});

test('trusted friends pagination follows cursors through completion', async () => {
    const harness = setup({
        count: 0,
        pages: { first: { PageItems: [], NextCursor: null } },
        trustedPages: {
            first: { PageItems: [makeFriend(2)], NextCursor: 'trusted:next' },
            'trusted:next': { PageItems: [makeFriend(3)], NextCursor: null },
        },
    });

    const result = await fetchAllTrustedFriends(7);

    assert.deepEqual([...result], [2, 3]);
    const trustedRequests = harness.requests.filter((request) =>
        request.endpoint.includes('findFriendsType=FindTrustedFriends'),
    );
    const secondPageParams = new URLSearchParams(
        trustedRequests[1].endpoint.split('?')[1],
    );
    assert.deepEqual(secondPageParams.getAll('cursor'), ['trusted:next']);
});

test('an empty first page with count zero replaces the old cache', async () => {
    const harness = setup({
        count: 0,
        pages: { first: { PageItems: [], NextCursor: null } },
        existingFriends: [{ id: 99 }],
    });

    const result = await updateFriendsList(7);

    assert.deepEqual(result, []);
    assert.deepEqual(harness.storage.rovalra_friends_data[7].friendsList, []);
    assert.equal(harness.storage.rovalra_friends_data[7].friendsCount, 0);
});

test('an empty response without a verified count preserves non-empty cache', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: undefined,
        pages: { first: { PageItems: [], NextCursor: null } },
        existingFriends: previous,
    });

    const result = await updateFriendsList(7);

    assert.deepEqual(result, previous);
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
});

test('invalid friend entries preserve the previous cache', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 1,
        pages: {
            first: {
                PageItems: [{ username: 'missing-id' }],
                NextCursor: null,
            },
        },
        existingFriends: previous,
    });

    const result = await updateFriendsList(7);

    assert.deepEqual(result, previous);
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
});

test('invalid cursor values preserve the previous cache', async () => {
    const previous = [{ id: 99 }];
    const harness = setup({
        count: 1,
        pages: {
            first: {
                PageItems: [makeFriend(1)],
                NextCursor: { cursor: 'bad' },
            },
        },
        existingFriends: previous,
    });

    const result = await updateFriendsList(7);

    assert.deepEqual(result, previous);
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        previous,
    );
});

test('conversation pagination stops on a repeated cursor and preserves cached analysis', async () => {
    const previous = [{ id: 1, canChat: false, hasAgeChecked: false }];
    const harness = setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)], NextCursor: null } },
        conversationPages: {
            first: {
                conversations: [
                    {
                        participant_user_ids: [7, 1],
                        messages: [],
                    },
                ],
                next_cursor: 'repeat',
            },
            repeat: {
                conversations: [],
                next_cursor: 'repeat',
            },
        },
        existingFriends: previous,
    });

    const result = await updateFriendsList(7);

    assert.equal(result.length, 1);
    assert.equal(result[0].canChat, false);
    assert.equal(result[0].hasAgeChecked, false);
    assert.equal(
        harness.requests.filter((request) =>
            request.endpoint.includes('get-user-conversations'),
        ).length,
        2,
    );
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList,
        result,
    );
});

test('a complete empty conversation response clears stale chat analysis', async () => {
    setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)], NextCursor: null } },
        conversationPages: { first: { conversations: [], next_cursor: null } },
        existingFriends: [{ id: 1, canChat: false, hasAgeChecked: false }],
    });

    const result = await updateFriendsList(7);

    assert.equal(result[0].canChat, null);
    assert.equal(result[0].hasAgeChecked, null);
});

test('getFriendsList fetches the authenticated user rather than a profile target', async () => {
    const harness = setup({
        count: 1,
        pages: { first: { PageItems: [makeFriend(1)], NextCursor: null } },
        authenticatedUserId: 7,
        existingFriends: [],
    });

    const result = await getFriendsList();

    assert.deepEqual(
        result.map((friend) => friend.id),
        [1],
    );
    const friendRequests = harness.requests.filter(
        (request) =>
            request.subdomain === 'friends' &&
            request.endpoint.includes('/friends/find') &&
            !request.endpoint.includes('findFriendsType='),
    );
    assert.equal(
        friendRequests[0].endpoint,
        '/v1/users/7/friends/find?limit=50',
    );
});

test('successful refresh replaces old cache contents', async () => {
    const harness = setup({
        count: 2,
        pages: {
            first: { PageItems: [makeFriend(1)], NextCursor: 'next' },
            next: { PageItems: [makeFriend(2)], NextCursor: null },
        },
        existingFriends: [{ id: 99 }],
    });

    const result = await updateFriendsList(7);

    assert.deepEqual(
        result.map((friend) => friend.id),
        [1, 2],
    );
    assert.deepEqual(
        harness.storage.rovalra_friends_data[7].friendsList.map(
            (friend) => friend.id,
        ),
        [1, 2],
    );
    assert.equal(harness.storage.rovalra_friends_data[7].friendsCount, 2);
});

test.after(async () => {
    delete globalThis.chrome;
    delete globalThis.__friendsTest;
    await rm(temporaryDirectory, { recursive: true, force: true });
});
