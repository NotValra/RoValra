const CHECK_INTERVAL = 60 * 1000;
const STATE_KEY = 'rovalra_notifications_state';
const PINNED_KEY = 'rovalra_pinned_friends';
const ICON_URL = 'public/Assets/icon-128.png';
const ROLIMONS_URL = 'https://apis.rovalra.com/v1/rolimons/limiteds';
const ROLIMONS_TTL = 10 * 60 * 1000;
const SESSIONS_ENDPOINT = '/token-metadata-service/v1/sessions?desiredLimit=25';
const MAX_SESSION_PAGES = 8;
const SECURITY_URL = 'https://www.roblox.com/my/account#!/security';
const SETTING_DEFAULTS = {
    browserNotificationsEnabled: false,
    tradeNotificationsEnabled: true,
    friendNotificationsEnabled: true,
    loginNotificationsEnabled: true,
};

let api;
let interval = null;
let rolimons = { items: null, fetchedAt: 0 };

async function hasPermission() {
    return chrome.permissions.contains({ permissions: ['notifications'] });
}

async function getEnabled() {
    const settings = await chrome.storage.local.get(SETTING_DEFAULTS);
    const on = settings.browserNotificationsEnabled && (await hasPermission());
    return {
        trades: on && settings.tradeNotificationsEnabled,
        friends: on && settings.friendNotificationsEnabled,
        logins: on && settings.loginNotificationsEnabled,
    };
}

async function getStrings() {
    const { rovalraLanguage, rovalra_autolang } =
        await chrome.storage.local.get(['rovalraLanguage', 'rovalra_autolang']);
    const lang =
        rovalraLanguage === 'auto' ? rovalra_autolang : rovalraLanguage;
    const load = async (code) => {
        const res = await fetch(
            chrome.runtime.getURL(`public/Assets/locales/${code}.json`),
        );
        return (await res.json()).notifications || {};
    };
    const en = await load('en');
    if (!lang || lang === 'en') return en;
    return { ...en, ...(await load(lang).catch(() => ({}))) };
}

function format(text, values) {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');
}

function notify(id, title, message, extra = {}) {
    chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title,
        message,
        ...extra,
    });
}

async function getJson(options) {
    const res = await api(options);
    return res.ok ? res.json() : null;
}

async function getRolimonsItems() {
    if (Date.now() - rolimons.fetchedAt > ROLIMONS_TTL) {
        const res = await fetch(ROLIMONS_URL, { credentials: 'omit' }).catch(
            () => null,
        );
        const json = res?.ok ? await res.json() : null;
        if (json?.items)
            rolimons = { items: json.items, fetchedAt: Date.now() };
    }
    return rolimons.items || {};
}

function getOfferTotals(offer, items, robux) {
    return (offer?.items || []).reduce(
        (totals, item) => {
            const data = items[item.itemTarget?.targetId];
            const rap = Number(data?.rap || item.recentAveragePrice) || 0;
            totals.rap += rap;
            totals.value += Number(data?.default_price ?? rap) || 0;
            return totals;
        },
        { value: robux, rap: robux },
    );
}

async function getTradeDiff(tradeId, partnerId) {
    const trade = await getJson({
        subdomain: 'trades',
        endpoint: `/v2/trades/${tradeId}`,
    });
    if (!trade) return null;
    const items = await getRolimonsItems();
    const partnerIsA =
        String(trade.participantAOffer?.user?.id) === String(partnerId);
    const mine = partnerIsA ? trade.participantBOffer : trade.participantAOffer;
    const theirs = partnerIsA
        ? trade.participantAOffer
        : trade.participantBOffer;
    const give = getOfferTotals(mine, items, Number(mine?.robux) || 0);
    const get = getOfferTotals(
        theirs,
        items,
        Math.floor((Number(theirs?.robux) || 0) * 0.7),
    );
    return { value: get.value - give.value, rap: get.rap - give.rap };
}

function signed(number) {
    return `${number < 0 ? '-' : '+'}${Math.abs(number).toLocaleString('en-US')}`;
}

async function checkTrades(seen, strings) {
    const data = await getJson({
        subdomain: 'trades',
        endpoint: '/v1/trades/Inbound?limit=10&sortOrder=Desc',
    });
    if (!data?.data) return seen;
    const ids = data.data.map((trade) => trade.id);
    if (seen) {
        for (const trade of data.data) {
            if (seen.includes(trade.id)) continue;
            const from = format(strings.tradeFrom, {
                name: trade.user.displayName || trade.user.name,
            });
            const diff = await getTradeDiff(trade.id, trade.user.id).catch(
                () => null,
            );
            const stats = diff
                ? format(strings.tradeStats, {
                      value: signed(diff.value),
                      rap: signed(diff.rap),
                  })
                : '';
            notify(
                `rovalra-trade-${trade.id}`,
                strings.newTrade,
                stats ? `${from}\n${stats}` : from,
            );
        }
    }
    return [...new Set([...ids, ...(seen || [])])].slice(0, 50);
}

async function checkFriends(previous, strings) {
    const { [PINNED_KEY]: pinned = [] } =
        await chrome.storage.local.get(PINNED_KEY);
    if (!pinned.length) return {};
    const data = await getJson({
        subdomain: 'presence',
        endpoint: '/v1/presence/users',
        method: 'POST',
        body: { userIds: pinned.map(Number) },
    });
    if (!data?.userPresences) return previous;

    const playing = {};
    const joined = [];
    for (const presence of data.userPresences) {
        if (presence.userPresenceType !== 2 || !presence.rootPlaceId) continue;
        playing[presence.userId] = presence.rootPlaceId;
        if (previous && previous[presence.userId] !== presence.rootPlaceId)
            joined.push(presence);
    }
    if (!joined.length) return playing;

    const users = await getJson({
        subdomain: 'users',
        endpoint: '/v1/users',
        method: 'POST',
        body: {
            userIds: joined.map((p) => p.userId),
            excludeBannedUsers: false,
        },
    });
    const names = Object.fromEntries(
        (users?.data || []).map((u) => [u.id, u.displayName || u.name]),
    );
    for (const presence of joined) {
        notify(
            `rovalra-game-${presence.rootPlaceId}-${presence.userId}`,
            format(strings.friendPlaying, {
                name: names[presence.userId] || presence.userId,
            }),
            presence.lastLocation || strings.unknownGame,
        );
    }
    return playing;
}

async function getSessions() {
    const sessions = [];
    let cursor = '';
    for (let page = 0; page < MAX_SESSION_PAGES; page++) {
        const data = await getJson({
            subdomain: 'apis',
            endpoint: cursor
                ? `${SESSIONS_ENDPOINT}&nextCursor=${encodeURIComponent(cursor)}`
                : SESSIONS_ENDPOINT,
        });
        if (!Array.isArray(data?.sessions)) return null;
        sessions.push(...data.sessions);
        if (!data.hasMore || !data.nextCursor)
            return { sessions, complete: true };
        cursor = data.nextCursor;
    }
    return { sessions, complete: false };
}

// Roblox signs sessions out by their token, so only a hash of it gets stored.
async function hashToken(token) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(token),
    );
    return [...new Uint8Array(digest)]
        .slice(0, 12)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

// City is left out on purpose, mobile data and ISPs hop between nearby cities.
function regionOf(session) {
    const { country, subdivision } = session.location || {};
    return country ? `${country}|${subdivision || ''}` : null;
}

function describeSession(session, strings, hidePlace) {
    const { type, value, os } = session.agent || {};
    // Browsers come with a name, the Roblox app and Studio only have a type.
    const name =
        value || { App: strings.robloxApp, Studio: strings.robloxStudio }[type];
    const device = [name, os].filter(Boolean).join(' · ');
    const { city, subdivision, country } = session.location || {};
    const place = hidePlace
        ? ''
        : [city, subdivision, country].filter(Boolean).join(', ');
    return [device || strings.unknownDevice, place].filter(Boolean).join(' · ');
}

async function checkLogins(previous, strings) {
    const result = await getSessions();
    if (!result) return previous;

    const { streamermode, hideLoginLocation } = await chrome.storage.local.get({
        streamermode: false,
        hideLoginLocation: true,
    });
    const hidePlace = streamermode && hideLoginLocation;
    const known = previous?.sessions;
    const current = new Map();
    for (const session of result.sessions) {
        if (session.token) current.set(await hashToken(session.token), session);
    }

    // Each session remembers the regions it has been used from.
    // If the list got cut short, keep the ones we didn't get to see.
    const sessions = result.complete ? {} : { ...known };
    const familiarRegions = new Set(Object.values(known || {}).flat());
    for (const [hash, session] of current) {
        const region = regionOf(session);
        const regions = known?.[hash] || [];
        sessions[hash] =
            region && !regions.includes(region)
                ? [...regions, region].slice(-5)
                : regions;

        // First check just learns which sessions already exist.
        if (!known) continue;

        const details = describeSession(session, strings, hidePlace);
        if (!(hash in known)) {
            // Opening Roblox or Studio from a session you already have spawns
            // a child session, those shouldn't count as a new login.
            const parent = session.parentSessionToken
                ? await hashToken(session.parentSessionToken)
                : null;
            const parentRegions = parent ? known[parent] : null;
            const spawnedByKnownSession =
                parentRegions &&
                (!region ||
                    !parentRegions.length ||
                    parentRegions.includes(region));
            // A brand new parent already gets its own notification.
            const spawnedByNewSession =
                parent && !parentRegions && current.has(parent);
            if (
                session.isCurrentSession ||
                spawnedByKnownSession ||
                spawnedByNewSession
            )
                continue;

            // Roblox only marks a device as trusted when it's confident it's
            // you, so those get a quiet heads up instead of an alarm. Someone
            // else on your own computer looks the same, so it still shows up.
            if (session.isTrustedSession && familiarRegions.has(region)) {
                notify(`rovalra-login-${hash}`, strings.trustedLogin, details, {
                    contextMessage: strings.trustedLoginHint,
                });
            } else {
                notify(`rovalra-login-${hash}`, strings.newLogin, details, {
                    contextMessage: strings.newLoginHint,
                    requireInteraction: true,
                    priority: 2,
                });
            }
        } else if (region && regions.length && !regions.includes(region)) {
            notify(
                `rovalra-location-${hash}-${regions.length}`,
                strings.newLocation,
                details,
                {
                    contextMessage: strings.newLocationHint,
                    requireInteraction: true,
                    priority: 2,
                },
            );
        }
    }
    return { sessions };
}

async function check() {
    const enabled = await getEnabled();
    const { [STATE_KEY]: state = {} } =
        await chrome.storage.local.get(STATE_KEY);
    const strings = await getStrings();

    if (enabled.trades) state.trades = await checkTrades(state.trades, strings);
    else delete state.trades;

    if (enabled.friends)
        state.friends = await checkFriends(state.friends, strings);
    else delete state.friends;

    if (enabled.logins) state.logins = await checkLogins(state.logins, strings);
    else delete state.logins;

    await chrome.storage.local.set({ [STATE_KEY]: state });
}

function onClicked(id) {
    const [, type, placeId] = id.split('-');
    const urls = {
        trade: 'https://www.roblox.com/trades',
        login: SECURITY_URL,
        location: SECURITY_URL,
    };
    chrome.tabs.create({
        url: urls[type] || `https://www.roblox.com/games/${placeId}`,
    });
    chrome.notifications.clear(id);
}

export async function syncNotifications() {
    const granted = await hasPermission();
    if (granted && !chrome.notifications.onClicked.hasListener(onClicked))
        chrome.notifications.onClicked.addListener(onClicked);

    const { trades, friends, logins } = await getEnabled();
    const enabled = trades || friends || logins;
    if (enabled && !interval) {
        interval = setInterval(() => check().catch(() => {}), CHECK_INTERVAL);
        check().catch(() => {});
    } else if (!enabled && interval) {
        clearInterval(interval);
        interval = null;
        chrome.storage.local.remove(STATE_KEY);
    }
}

export function setupNotifications(callApi) {
    api = callApi;
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (
            namespace === 'local' &&
            Object.keys(SETTING_DEFAULTS).some((key) => key in changes)
        )
            syncNotifications();
    });
    chrome.permissions.onAdded.addListener(syncNotifications);
    chrome.permissions.onRemoved.addListener(syncNotifications);
    syncNotifications();
}
