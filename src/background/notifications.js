const ALARM_NAME = 'rovalra-notifications';
const STATE_KEY = 'rovalra_notifications_state';
const PINNED_KEY = 'rovalra_pinned_friends';
const ICON_URL = 'public/Assets/icon-128.png';
const ROLIMONS_URL = 'https://apis.rovalra.com/v1/rolimons/limiteds';
const ROLIMONS_TTL = 10 * 60 * 1000;
const SETTING_DEFAULTS = {
    browserNotificationsEnabled: false,
    tradeNotificationsEnabled: true,
    friendNotificationsEnabled: true,
};

let api;
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

function notify(id, title, message) {
    chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title,
        message,
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

    await chrome.storage.local.set({ [STATE_KEY]: state });
}

function onClicked(id) {
    const [, type, placeId] = id.split('-');
    const url =
        type === 'trade'
            ? 'https://www.roblox.com/trades'
            : `https://www.roblox.com/games/${placeId}`;
    chrome.tabs.create({ url });
    chrome.notifications.clear(id);
}

export async function syncNotifications() {
    const granted = await hasPermission();
    if (granted && !chrome.notifications.onClicked.hasListener(onClicked))
        chrome.notifications.onClicked.addListener(onClicked);

    const { trades, friends } = await getEnabled();
    const enabled = trades || friends;
    const alarm = await chrome.alarms.get(ALARM_NAME);
    if (enabled && !alarm) {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        check();
    } else if (!enabled && alarm) {
        chrome.alarms.clear(ALARM_NAME);
        chrome.storage.local.remove(STATE_KEY);
    }
}

export function setupNotifications(callApi) {
    api = callApi;
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) check().catch(() => {});
    });
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
