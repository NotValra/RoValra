import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import { getCatalogItemDetailField } from '../../core/apis/catalog.js';
import {
    TRADE_DETAILS_RESPONSE_EVENT,
    fetchTradeDetails,
    getLatestTradeDetailsId,
} from '../../core/trade/tradeDetailsHandler.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { getUserIdFromUrl } from '../../core/idExtractor.js';

const TRADE_COMPLETED_DATES_STORAGE_KEY = 'rovalra_trade_completed_dates';

const TRADES_LIST_EVENT = 'rovalra-trades-list-response';
const HEADER_SELECTOR = '.trades-list-detail h2.trades-header-nowrap';
const ROW_SELECTOR = '.trade-row';
const STATUS_SELECTOR =
    '.trade-row-details div.text-date-hint:not(.trade-sent-date)';
const LINE_CLASS = 'rovalra-trade-completed-date';
const ROW_LINE_CLASS = 'rovalra-trade-row-completed';
const MAX_INVENTORY_PAGES = 5;
const MAX_MESSAGE_PAGES = 50;
const MESSAGE_PAGE_BATCH = 5;
const MESSAGE_MATCH_WINDOW = 2 * 60 * 1000;
const TRADE_LIFETIME = 5 * 24 * 60 * 60 * 1000 + MESSAGE_MATCH_WINDOW;
const ROBLOX_SENDER_ID = 1;
const COMPLETED_SUBJECT = /^Trade with (.+) completed!$/;
const REQUEST_SUBJECT = /^You have a Trade request from (.+)\.$/;

let tradeList = [];
const results = new Map();
const inventoryPages = new Map();
const inboxPages = new Map();
let inboxTotalPages = null;
const robuxTrades = [];
let robuxCursor = '';
let robuxDone = false;
let robuxLoading = Promise.resolve();
let storedResults = null;
let headerObserver = null;
let rowObserver = null;
let summaryObserver = null;

function loadStoredResults() {
    storedResults ??= new Promise((resolve) => {
        chrome.storage.local.get(
            { [TRADE_COMPLETED_DATES_STORAGE_KEY]: {} },
            (data) => resolve(data[TRADE_COMPLETED_DATES_STORAGE_KEY] || {}),
        );
    });
    return storedResults;
}

async function storeResult(tradeId, result) {
    const stored = await loadStoredResults();
    stored[tradeId] = result;
    chrome.storage.local.set({ [TRADE_COMPLETED_DATES_STORAGE_KEY]: stored });
}

function isWithinTrade(date, created) {
    const elapsed = new Date(date) - created;
    return elapsed >= 0 && elapsed <= TRADE_LIFETIME;
}

function getInboxPage(page) {
    if (!inboxPages.has(page)) {
        inboxPages.set(
            page,
            callRobloxApiJson({
                subdomain: 'privatemessages',
                endpoint: `/v1/messages?messageTab=inbox&pageNumber=${page}&pageSize=20`,
            })
                .then((data) => {
                    inboxTotalPages = data?.totalPages ?? inboxTotalPages;
                    return data?.collection || [];
                })
                .catch(() => []),
        );
    }
    return inboxPages.get(page);
}

async function getInboxMessagesUntil(date) {
    const messages = [];
    let page = 0;
    while (
        page < MAX_MESSAGE_PAGES &&
        (inboxTotalPages === null || page < inboxTotalPages)
    ) {
        const count =
            inboxTotalPages === null
                ? 1
                : Math.min(
                      MESSAGE_PAGE_BATCH,
                      inboxTotalPages - page,
                      MAX_MESSAGE_PAGES - page,
                  );
        const pages = await Promise.all(
            Array.from({ length: count }, (_, i) => getInboxPage(page + i)),
        );
        page += count;
        pages.forEach((entries) => messages.push(...entries));
        const oldest = messages.at(-1)?.created;
        if (!oldest || new Date(oldest) < date) break;
    }
    return messages;
}

async function getMessageResult(trade, created) {
    const messages = (
        await getInboxMessagesUntil(
            new Date(created.getTime() - MESSAGE_MATCH_WINDOW),
        )
    ).filter((message) => message.sender?.id === ROBLOX_SENDER_ID);
    const completed = messages
        .filter(
            (message) =>
                message.subject?.match(COMPLETED_SUBJECT)?.[1] ===
                    trade.user.name && isWithinTrade(message.created, created),
        )
        .at(-1);
    if (!completed) return null;
    const received = messages.some(
        (message) =>
            message.subject?.match(REQUEST_SUBJECT)?.[1] === trade.user.name &&
            Math.abs(new Date(message.created) - created) <=
                MESSAGE_MATCH_WINDOW,
    );
    return {
        completed: completed.created,
        direction: received ? 'received' : 'sent',
    };
}

function loadRobuxTradesUntil(userId, date) {
    robuxLoading = robuxLoading.then(async () => {
        while (!robuxDone && !(new Date(robuxTrades.at(-1)?.created) < date)) {
            const data = await callRobloxApiJson({
                subdomain: 'economy',
                endpoint: `/v2/users/${userId}/transactions?transactionType=TradeRobux&limit=100${robuxCursor ? `&cursor=${robuxCursor}` : ''}`,
            }).catch(() => null);
            robuxTrades.push(...(data?.data || []));
            robuxCursor = data?.nextPageCursor;
            if (!robuxCursor) robuxDone = true;
        }
    });
    return robuxLoading;
}

async function getRobuxResult(myUserId, trade, created) {
    await loadRobuxTradesUntil(myUserId, created);
    const transaction = robuxTrades
        .filter(
            (entry) =>
                String(entry.agent?.id) === String(trade.user.id) &&
                isWithinTrade(entry.created, created),
        )
        .at(-1);
    return transaction ? { completed: transaction.created } : null;
}

function getInventoryPage(userId, assetType, cursor) {
    const key = `${userId}|${assetType}|${cursor}`;
    if (!inventoryPages.has(key)) {
        inventoryPages.set(
            key,
            callRobloxApiJson({
                subdomain: 'inventory',
                endpoint: `/v2/users/${userId}/inventory/${assetType}?limit=100&sortOrder=Desc${cursor ? `&cursor=${cursor}` : ''}`,
            }).catch(() => null),
        );
    }
    return inventoryPages.get(key);
}

async function findInstanceUpdate(ownerId, item) {
    if (
        item?.itemTarget?.itemType !== 'Asset' ||
        !item.collectibleItemInstanceId
    )
        return null;
    const assetType = await getCatalogItemDetailField(
        item.itemTarget.targetId,
        'Asset',
        'assetType',
    );
    if (!assetType) return null;

    let cursor = '';
    for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
        const data = await getInventoryPage(ownerId, assetType, cursor);
        const match = data?.data?.find(
            (entry) =>
                entry.collectibleItemInstanceId ===
                item.collectibleItemInstanceId,
        );
        if (match) return match.updated;
        cursor = data?.nextPageCursor;
        if (!cursor) return null;
    }
    return null;
}

async function getInventoryResult(myUserId, trade, created) {
    const details = await fetchTradeDetails(trade.id);
    const offers = [details?.participantAOffer, details?.participantBOffer];
    const mine = offers.find((offer) => String(offer?.user?.id) === myUserId);
    const theirs = offers.find((offer) => offer && offer !== mine);
    if (!mine || !theirs) return null;

    const candidates = [
        ...(theirs.items || []).map((item) => [myUserId, item]),
        ...(mine.items || []).map((item) => [theirs.user.id, item]),
    ];
    for (const [ownerId, item] of candidates) {
        const updated = await findInstanceUpdate(ownerId, item);
        if (updated && isWithinTrade(updated, created)) {
            return { completed: updated };
        }
    }
    return null;
}

async function findResult(trade) {
    const stored = (await loadStoredResults())[trade.id];
    if (stored) return stored;

    const created = new Date(trade.created);
    if (Number.isNaN(created.getTime())) return null;
    const myUserId = String(await getAuthenticatedUserId());

    const result =
        (await getMessageResult(trade, created)) ||
        (await getRobuxResult(myUserId, trade, created)) ||
        (await getInventoryResult(myUserId, trade, created));
    if (result) storeResult(trade.id, result);
    return result;
}

function getResult(trade) {
    const tradeId = String(trade.id);
    if (!results.has(tradeId)) {
        results.set(
            tradeId,
            findResult(trade).catch(() => null),
        );
    }
    return results.get(tradeId);
}

function getTrade(tradeId) {
    return tradeList.find((trade) => String(trade.id) === String(tradeId));
}

function createDateLine(label, value, created) {
    const line = document.createElement('div');
    line.append(`${ts(label)} `);
    if (value === undefined) {
        line.append('…');
    } else if (value === null) {
        line.append(ts('tradeCompletedDate.notFound'));
    } else {
        const timeOnly =
            value !== created &&
            new Date(value).toDateString() === new Date(created).toDateString();
        line.append(
            createInteractiveTimestamp(value, { compact: true, timeOnly }),
        );
    }
    return line;
}

function fillRowDates(dates, trade, result) {
    const label = result?.direction
        ? `tradeCompletedDate.${result.direction}`
        : 'tradeCompletedDate.created';
    dates.replaceChildren(
        createDateLine(label, trade.created, trade.created),
        createDateLine(
            'tradeCompletedDate.completed',
            result === undefined ? undefined : (result?.completed ?? null),
            trade.created,
        ),
    );
}

function clearRow(row) {
    delete row.dataset.rovalraTradeDated;
    row.querySelectorAll(`.${ROW_LINE_CLASS}`).forEach((line) => line.remove());
    const status = row.querySelector(STATUS_SELECTOR);
    if (status) delete status.dataset.rovalraTradeDated;
    delete row.dataset.rovalraDatesFor;
}

function renderRow(row) {
    const index = [...document.querySelectorAll(ROW_SELECTOR)].indexOf(row);
    const trade = tradeList[index];
    const status = row.querySelector(STATUS_SELECTOR);
    const partnerId = getUserIdFromUrl(
        row.querySelector('a.avatar-card-link')?.href || '',
    );
    if (
        !trade ||
        !status ||
        trade.status !== 'Completed' ||
        String(trade.user?.id) !== String(partnerId)
    ) {
        clearRow(row);
        return;
    }
    const tradeId = String(trade.id);
    if (row.dataset.rovalraDatesFor === tradeId) return;
    clearRow(row);
    row.dataset.rovalraDatesFor = tradeId;

    const dates = document.createElement('span');
    dates.className = ROW_LINE_CLASS;
    fillRowDates(dates, trade, undefined);
    status.dataset.rovalraTradeDated = 'true';
    row.dataset.rovalraTradeDated = 'true';
    status.append(dates);
    fitRow(row);

    getResult(trade).then((result) => {
        if (row.dataset.rovalraDatesFor === tradeId) {
            fillRowDates(dates, trade, result);
        }
    });
}

function fitRow(row) {
    const content = row.querySelector('.trade-row-details > div:first-child');
    const summary = row.querySelector('.rovalra-trade-summary');
    if (content && summary && summary.parentElement !== content) {
        content.prepend(summary);
    }
    const lead = row.querySelector('.text-lead');
    const name = [...(lead?.childNodes || [])].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
    if (name) {
        const wrapper = document.createElement('span');
        wrapper.className = 'rovalra-trade-row-name';
        name.before(wrapper);
        wrapper.append(name);
    }
}

function renderRows() {
    document.querySelectorAll(ROW_SELECTOR).forEach(renderRow);
}

function onTradesList(event) {
    const trades = event.detail?.data;
    if (!Array.isArray(trades)) return;
    if (event.detail.previousPageCursor) {
        const known = new Set(tradeList.map((trade) => trade.id));
        tradeList = [
            ...tradeList,
            ...trades.filter((trade) => !known.has(trade.id)),
        ];
    } else {
        tradeList = trades;
    }
    trades
        .filter((trade) => trade.status === 'Completed')
        .forEach((trade) => getResult(trade));
    requestAnimationFrame(renderRows);
    setTimeout(renderRows, 300);
}

async function renderHeader() {
    const header = document.querySelector(HEADER_SELECTOR);
    if (!header) return;

    const tradeId = getLatestTradeDetailsId();
    const trade = getTrade(tradeId);
    const existing = header.parentElement.querySelector(`.${LINE_CLASS}`);
    if (existing?.dataset.tradeId === tradeId) return;
    existing?.remove();
    if (trade?.status !== 'Completed') return;

    const line = document.createElement('div');
    line.className = `${LINE_CLASS} text-secondary`;
    line.dataset.tradeId = tradeId;
    header.after(line);

    const result = await getResult(trade);
    if (!line.isConnected) return;
    line.append(
        `${ts('tradeCompletedDate.completedOn')} `,
        result?.completed
            ? createInteractiveTimestamp(result.completed)
            : ts('tradeCompletedDate.notFound'),
    );
}

const onTradeDetails = () => requestAnimationFrame(renderHeader);

export async function init() {
    if (headerObserver) headerObserver.active = false;
    if (rowObserver) rowObserver.active = false;
    if (summaryObserver) summaryObserver.active = false;
    headerObserver = null;
    rowObserver = null;
    summaryObserver = null;
    document.removeEventListener(TRADE_DETAILS_RESPONSE_EVENT, onTradeDetails);
    document.removeEventListener(TRADES_LIST_EVENT, onTradesList);
    if (!window.location.pathname.startsWith('/trades')) return;
    if (!(await settings.tradeCompletedDateEnabled)) return;

    loadStoredResults();
    document.addEventListener(TRADE_DETAILS_RESPONSE_EVENT, onTradeDetails);
    document.addEventListener(TRADES_LIST_EVENT, onTradesList);
    headerObserver = observeElement(HEADER_SELECTOR, renderHeader, {
        multiple: true,
    });
    rowObserver = observeElement(ROW_SELECTOR, renderRow, { multiple: true });
    summaryObserver = observeElement(
        `${ROW_SELECTOR}[data-rovalra-trade-dated] .rovalra-trade-summary`,
        (summary) => fitRow(summary.closest(ROW_SELECTOR)),
        { multiple: true },
    );
}
