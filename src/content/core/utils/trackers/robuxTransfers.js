import { callRobloxApiJson } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

export const ROBUX_TRANSFER_DATA_KEY = 'rovalra_robux_transfer_limits_v1';
export const ROBUX_TRANSFER_CHANGED_EVENT =
    'rovalra:robux-transfer-limits-changed';
export const ROBUX_TRANSFER_DAILY_LIMIT = 5000;
export const ROBUX_TRANSFER_MONTHLY_LIMIT = 10000;
export const ROBUX_TRANSFER_REFRESH_MS = 5 * 60 * 1000;

const SUBSCRIPTION_CACHE_TTL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let activeUpdatePromise = null;
let trackingInitialized = false;
let refreshIntervalId = null;

function clampRemaining(limit, sent) {
    return Math.max(0, limit - Math.max(0, sent));
}

function addMonths(timestamp, months) {
    const date = new Date(timestamp);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const daysInTargetMonth = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, daysInTargetMonth));
    return date.getTime();
}

function subtractSubscriptionPeriod(timestamp, subscription) {
    const periodCount = Number(subscription?.productInfo?.periodCount) || 1;
    const periodType =
        subscription?.periodType || subscription?.productInfo?.periodType;

    if (periodType === 'Year') {
        return addMonths(timestamp, -12 * periodCount);
    }

    if (periodType === 'Week') {
        return timestamp - 7 * DAY_MS * periodCount;
    }

    return addMonths(timestamp, -periodCount);
}

function getSubscriptionWindow(subscription, now = Date.now()) {
    if (!subscription) return null;

    const activation = Number(subscription.activationTimestampMs);
    const expiration = Number(subscription.expirationTimestampMs);
    const renewal = Number(subscription.nextRenewalTimestampMs);
    const end =
        Number.isFinite(renewal) && renewal > now
            ? renewal
            : Number.isFinite(expiration) && expiration > now
              ? expiration
              : null;

    if (!end) return null;

    let start = subtractSubscriptionPeriod(end, subscription);
    if (Number.isFinite(activation) && start < activation) {
        start = activation;
    }

    return {
        start,
        end,
        activation: Number.isFinite(activation) ? activation : null,
        expiration: Number.isFinite(expiration) ? expiration : null,
        nextRenewal: Number.isFinite(renewal) ? renewal : null,
    };
}

async function readAllTransferData() {
    try {
        const storage = await chrome.storage.local.get(ROBUX_TRANSFER_DATA_KEY);
        return storage[ROBUX_TRANSFER_DATA_KEY] || {};
    } catch (error) {
        console.warn('RoValra: Failed to read Robux transfer tracker', error);
        return {};
    }
}

async function writeAllTransferData(data) {
    try {
        await chrome.storage.local.set({ [ROBUX_TRANSFER_DATA_KEY]: data });
    } catch (error) {
        console.warn('RoValra: Failed to write Robux transfer tracker', error);
    }
}

function emitTransferDataChange(userId, transferData) {
    document.dispatchEvent(
        new CustomEvent(ROBUX_TRANSFER_CHANGED_EVENT, {
            detail: {
                userId: String(userId),
                transferData,
            },
        }),
    );
}

async function fetchRobloxPlusSubscription() {
    const response = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/subscriptions/v2/user/subscriptions?ProductType=Blackbird&ExpirationTimestampMsStart=${Date.now()}&ResultsPerPage=100`,
        method: 'GET',
        noCache: true,
    });

    return Array.isArray(response?.subscriptions)
        ? response.subscriptions[0] || null
        : null;
}

async function fetchCurrencyTransfers(userId) {
    const response = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/transaction-records/v1/users/${userId}/transactions?cursor=&limit=100&transactionType=CurrencyTransfer&itemPricingType=PaidAndLimited`,
        method: 'GET',
        noCache: true,
    });

    return Array.isArray(response?.data) ? response.data : [];
}

function transactionBelongsToSender(transaction, userId) {
    const details = transaction?.details || {};
    return (
        String(details.senderTargetId) === String(userId) &&
        (details.transferRole === 'Sender' ||
            details.transferRole === 'SenderRefund')
    );
}

function buildNetSentTransfers(transactions, userId) {
    const grouped = new Map();

    for (const transaction of transactions) {
        if (!transactionBelongsToSender(transaction, userId)) continue;

        const amount = Number(transaction?.currency?.amount);
        const createdMs = Date.parse(transaction?.created);
        if (!Number.isFinite(amount) || !Number.isFinite(createdMs)) continue;

        const transferRequestId =
            transaction?.details?.transferRequestId ||
            transaction?.idHash ||
            `${transaction.created}:${amount}`;
        const current = grouped.get(transferRequestId) || {
            amount: 0,
            createdMs,
        };

        if (transaction.details.transferRole === 'Sender' && amount < 0) {
            current.amount += Math.abs(amount);
            current.createdMs = Math.min(current.createdMs, createdMs);
        } else if (
            transaction.details.transferRole === 'SenderRefund' &&
            amount > 0
        ) {
            current.amount -= amount;
        }

        grouped.set(transferRequestId, current);
    }

    return Array.from(grouped.values())
        .map((transfer) => ({
            ...transfer,
            amount: Math.max(0, transfer.amount),
        }))
        .filter((transfer) => transfer.amount > 0)
        .sort((a, b) => b.createdMs - a.createdMs);
}

function calculateDailyStats(transfers, now = Date.now()) {
    const windowStart = now - DAY_MS;
    const dailyTransfers = transfers.filter(
        (transfer) => transfer.createdMs >= windowStart,
    );
    const sent = dailyTransfers.reduce(
        (total, transfer) => total + transfer.amount,
        0,
    );

    let runningTotal = 0;
    let resetTimestampMs = null;
    for (const transfer of [...dailyTransfers].sort(
        (a, b) => a.createdMs - b.createdMs,
    )) {
        runningTotal += transfer.amount;
        if (runningTotal >= ROBUX_TRANSFER_DAILY_LIMIT) {
            resetTimestampMs = transfer.createdMs + DAY_MS;
            break;
        }
    }

    return {
        sent,
        remaining: clampRemaining(ROBUX_TRANSFER_DAILY_LIMIT, sent),
        limit: ROBUX_TRANSFER_DAILY_LIMIT,
        resetTimestampMs,
        windowStartTimestampMs: resetTimestampMs
            ? resetTimestampMs - DAY_MS
            : windowStart,
        windowEndTimestampMs: resetTimestampMs || now,
    };
}

function calculateMonthlyStats(transfers, subscriptionWindow) {
    const start = subscriptionWindow?.start;
    const end = subscriptionWindow?.end;
    const monthlyTransfers =
        Number.isFinite(start) && Number.isFinite(end)
            ? transfers.filter(
                  (transfer) =>
                      transfer.createdMs >= start && transfer.createdMs < end,
              )
            : [];
    const sent = monthlyTransfers.reduce(
        (total, transfer) => total + transfer.amount,
        0,
    );

    return {
        sent,
        remaining: clampRemaining(ROBUX_TRANSFER_MONTHLY_LIMIT, sent),
        limit: ROBUX_TRANSFER_MONTHLY_LIMIT,
        windowStartTimestampMs: start || null,
        windowEndTimestampMs: end || null,
    };
}

function buildTransferData(
    userId,
    transactions,
    subscription,
    now = Date.now(),
) {
    const subscriptionWindow = getSubscriptionWindow(subscription, now);
    const transfers = buildNetSentTransfers(transactions, userId);
    const daily = calculateDailyStats(transfers, now);
    const monthly = calculateMonthlyStats(transfers, subscriptionWindow);

    return {
        userId: String(userId),
        daily,
        monthly,
        sentToday: daily.sent,
        sentThisMonth: monthly.sent,
        remainingToday: daily.remaining,
        remainingThisMonth: monthly.remaining,
        dailyLimit: ROBUX_TRANSFER_DAILY_LIMIT,
        monthlyLimit: ROBUX_TRANSFER_MONTHLY_LIMIT,
        subscription: subscriptionWindow,
        source: {
            transactionCount: Array.isArray(transactions)
                ? transactions.length
                : 0,
            transferCount: transfers.length,
            hasMoreTransactionsThanFetched: transactions.length >= 100,
            fetchedAt: now,
        },
        updatedAt: now,
    };
}

export async function getCachedRobuxTransferData(userId = null) {
    const targetId = userId || (await getAuthenticatedUserId());
    if (!targetId) return null;

    const allTransferData = await readAllTransferData();
    return allTransferData[targetId] || null;
}

export async function updateRobuxTransferData(forceRefresh = false) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const allTransferData = await readAllTransferData();
    const cachedData = allTransferData[userId];

    if (
        !forceRefresh &&
        cachedData &&
        Date.now() - (cachedData.updatedAt || 0) < ROBUX_TRANSFER_REFRESH_MS
    ) {
        return cachedData;
    }

    if (activeUpdatePromise) return activeUpdatePromise;

    activeUpdatePromise = (async () => {
        try {
            const shouldRefreshSubscription =
                forceRefresh ||
                !cachedData?.subscription ||
                Date.now() - (cachedData.subscriptionFetchedAt || 0) >
                    SUBSCRIPTION_CACHE_TTL_MS;
            const subscription = shouldRefreshSubscription
                ? await fetchRobloxPlusSubscription().catch((error) => {
                      console.warn(
                          'RoValra: Failed to fetch Roblox Plus subscription for transfer tracker',
                          error,
                      );
                      return cachedData?.subscriptionRaw || null;
                  })
                : cachedData.subscriptionRaw || null;
            const transactions = await fetchCurrencyTransfers(userId);
            const transferData = buildTransferData(
                userId,
                transactions,
                subscription,
            );

            transferData.subscriptionRaw = subscription;
            transferData.subscriptionFetchedAt = shouldRefreshSubscription
                ? Date.now()
                : cachedData.subscriptionFetchedAt;

            const latestTransferData = await readAllTransferData();
            latestTransferData[userId] = transferData;
            await writeAllTransferData(latestTransferData);
            emitTransferDataChange(userId, transferData);

            return transferData;
        } catch (error) {
            console.warn(
                'RoValra: Failed to update Robux transfer tracker',
                error,
            );
            return cachedData || null;
        } finally {
            activeUpdatePromise = null;
        }
    })();

    return activeUpdatePromise;
}

export async function getRobuxTransferData(forceRefresh = false) {
    return await updateRobuxTransferData(forceRefresh);
}

export async function getRobuxTransferRemaining(forceRefresh = false) {
    const data = await updateRobuxTransferData(forceRefresh);
    if (!data) return null;

    return {
        daily: data.remainingToday,
        monthly: data.remainingThisMonth,
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
        dailySent: data.sentToday,
        monthlySent: data.sentThisMonth,
        dailyResetTimestampMs: data.daily?.resetTimestampMs || null,
        monthlyResetTimestampMs:
            data.monthly?.windowEndTimestampMs ||
            data.subscription?.end ||
            null,
        updatedAt: data.updatedAt,
    };
}

export function initRobuxTransferTracking() {
    if (trackingInitialized) return;
    trackingInitialized = true;

    updateRobuxTransferData();
    refreshIntervalId = setInterval(
        () => updateRobuxTransferData(),
        ROBUX_TRANSFER_REFRESH_MS,
    );
}

export function stopRobuxTransferTracking() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
    }
    trackingInitialized = false;
}
