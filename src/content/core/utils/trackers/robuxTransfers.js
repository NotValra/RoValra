import { callRobloxApiJson } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

export const ROBUX_TRANSFER_DATA_KEY = 'rovalra_robux_transfer_limits_v1';
export const ROBUX_TRANSFER_CHANGED_EVENT =
    'rovalra:robux-transfer-limits-changed';
export const ROBUX_TRANSFER_REFRESH_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_PERIOD_MS = 30 * DAY_MS;

let activeUpdatePromise = null;
let trackingInitialized = false;
let refreshIntervalId = null;

function clampRemaining(limit, sent) {
    return Math.max(0, limit - Math.max(0, sent));
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

async function fetchCurrencyTransfers(userId, now = Date.now()) {
    const cutoff = now - MONTH_PERIOD_MS;
    const transactions = [];
    let cursor = '';

    do {
        const response = await callRobloxApiJson({
            subdomain: 'apis',
            endpoint: `/transaction-records/v1/users/${userId}/transactions?cursor=${encodeURIComponent(cursor)}&limit=100&transactionType=CurrencyTransfer&itemPricingType=PaidAndLimited`,
            method: 'GET',
            noCache: true,
        });
        const page = Array.isArray(response?.data) ? response.data : [];
        transactions.push(...page);

        const oldestCreatedMs = Date.parse(page[page.length - 1]?.created);
        if (Number.isFinite(oldestCreatedMs) && oldestCreatedMs < cutoff) break;
        cursor = response?.nextPageCursor || '';
    } while (cursor);

    return transactions;
}

async function fetchRobloxTransferLimits() {
    const response = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: '/transfer/v1/robux-transfer/user-transfer-limit',
        method: 'GET',
        noCache: true,
    });

    const dailyLimit = Number(response?.dailyLimit);
    const monthlyLimit = Number(response?.monthlyLimit);
    if (!Number.isFinite(dailyLimit) || !Number.isFinite(monthlyLimit)) {
        throw new Error(
            'Roblox transfer-limit response did not include limits',
        );
    }

    return { dailyLimit, monthlyLimit };
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

function calculateDailyStats(transfers, dailyLimit, now = Date.now()) {
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
        if (runningTotal >= dailyLimit) {
            resetTimestampMs = transfer.createdMs + DAY_MS;
            break;
        }
    }

    return {
        sent,
        remaining: clampRemaining(dailyLimit, sent),
        limit: dailyLimit,
        resetTimestampMs,
        windowStartTimestampMs: resetTimestampMs
            ? resetTimestampMs - DAY_MS
            : windowStart,
        windowEndTimestampMs: resetTimestampMs || now,
    };
}

function calculateMonthlyStats(transfers, monthlyLimit, now = Date.now()) {
    const windowStart = now - MONTH_PERIOD_MS;
    const monthlyTransfers = transfers.filter(
        (transfer) => transfer.createdMs > windowStart,
    );
    const sent = monthlyTransfers.reduce(
        (total, transfer) => total + transfer.amount,
        0,
    );
    const releases = monthlyTransfers
        .map((transfer) => ({
            timestampMs: transfer.createdMs + MONTH_PERIOD_MS,
            amount: transfer.amount,
        }))
        .sort((a, b) => a.timestampMs - b.timestampMs);

    return {
        sent,
        remaining: clampRemaining(monthlyLimit, sent),
        limit: monthlyLimit,
        resetTimestampMs: releases[0]?.timestampMs || null,
        releases,
        windowStartTimestampMs: windowStart,
        windowEndTimestampMs: now,
    };
}

function buildTransferData(userId, transactions, limits, now = Date.now()) {
    const transfers = buildNetSentTransfers(transactions, userId);
    const daily = calculateDailyStats(transfers, limits.dailyLimit, now);
    const monthly = calculateMonthlyStats(transfers, limits.monthlyLimit, now);

    return {
        userId: String(userId),
        daily,
        monthly,
        sentToday: daily.sent,
        sentThisMonth: monthly.sent,
        remainingToday: daily.remaining,
        remainingThisMonth: monthly.remaining,
        dailyLimit: limits.dailyLimit,
        monthlyLimit: limits.monthlyLimit,
        source: {
            transactionCount: Array.isArray(transactions)
                ? transactions.length
                : 0,
            transferCount: transfers.length,
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
            const limits = await fetchRobloxTransferLimits().catch((error) => {
                console.warn(
                    'RoValra: Failed to fetch Roblox Robux transfer limits',
                    error,
                );

                const dailyLimit = Number(cachedData?.dailyLimit);
                const monthlyLimit = Number(cachedData?.monthlyLimit);
                if (
                    !Number.isFinite(dailyLimit) ||
                    !Number.isFinite(monthlyLimit)
                ) {
                    throw error;
                }

                return { dailyLimit, monthlyLimit };
            });
            const transactions = await fetchCurrencyTransfers(userId);
            const transferData = buildTransferData(
                userId,
                transactions,
                limits,
            );

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
        monthlyResetTimestampMs: data.monthly?.resetTimestampMs || null,
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
