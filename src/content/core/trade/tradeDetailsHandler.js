import { callRobloxApi } from '../api';
import { getCachedRolimonsItem, queueRolimonsFetch } from './itemHandler.js';

export const TRADE_DETAILS_RESPONSE_EVENT = 'rovalra-trade-details-response';

const tradeDetailsCache = new Map();
let latestTradeDetailsId = null;

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function getTradeId(data) {
    if (!data || data.tradeId === undefined || data.tradeId === null) {
        return null;
    }

    return String(data.tradeId);
}

function getDemandValue(demandStr) {
    const map = {
        None: 0,
        Terrible: 1,
        Low: 2,
        Normal: 3,
        High: 4,
        Amazing: 5,
    };
    return map[demandStr] !== undefined ? map[demandStr] : -1;
}

function getRolimonsValue(rolimonsItem, fallbackRap) {
    if (
        rolimonsItem &&
        rolimonsItem.default_price !== undefined &&
        rolimonsItem.default_price !== null
    ) {
        return toNumber(rolimonsItem.default_price);
    }

    return fallbackRap;
}

function normalizeApiItem(item) {
    const assetId = item?.itemTarget?.targetId
        ? String(item.itemTarget.targetId)
        : null;
    const rolimonsItem = assetId ? getCachedRolimonsItem(assetId) : null;
    const rap = rolimonsItem?.rap
        ? toNumber(rolimonsItem.rap)
        : toNumber(item?.recentAveragePrice);
    const value = getRolimonsValue(rolimonsItem, rap);
    const demand =
        rolimonsItem?.demand !== undefined
            ? getDemandValue(rolimonsItem.demand)
            : -1;

    return {
        assetId,
        itemType: item?.itemTarget?.itemType || 'Asset',
        collectibleItemInstanceId: item?.collectibleItemInstanceId || null,
        name: item?.itemName || rolimonsItem?.name || '',
        acronym: rolimonsItem?.acronym || '',
        serial: item?.serialNumber ?? null,
        stock: item?.assetStock ?? null,
        rap,
        value,
        demand,
        isProjected: Boolean(rolimonsItem?.is_projected),
        isRare: Boolean(rolimonsItem?.is_rare),
        raw: item,
    };
}

function calculateOfferStats(items, robux) {
    const itemCount = items.length;
    const rap = items.reduce((sum, item) => sum + toNumber(item.rap), 0);
    const value = items.reduce((sum, item) => sum + toNumber(item.value), 0);
    const totalDemand = items.reduce(
        (sum, item) => sum + toNumber(item.demand ?? -1),
        0,
    );
    const offeredRobux = toNumber(robux);
    const receivedRobux = Math.floor(offeredRobux * 0.7);

    return {
        rap,
        value,
        totalDemand,
        itemCount,
        robux: offeredRobux,
        offeredRobux,
        receivedRobux,
        rapWithOfferedRobux: rap + offeredRobux,
        valueWithOfferedRobux: value + offeredRobux,
        rapWithReceivedRobux: rap + receivedRobux,
        valueWithReceivedRobux: value + receivedRobux,
        averageDemand: itemCount > 0 ? totalDemand / itemCount : -1,
    };
}

function normalizeOffer(offer, side) {
    const items = Array.isArray(offer?.items)
        ? offer.items.map(normalizeApiItem).filter(Boolean)
        : [];

    return {
        side,
        user: offer?.user || null,
        robux: toNumber(offer?.robux),
        items,
        stats: calculateOfferStats(items, offer?.robux),
        raw: offer,
    };
}

function createAnalysisFromNormalizedOffers(
    tradeId,
    participantA,
    participantB,
    options = {},
) {
    const myUserId = options.myUserId ? String(options.myUserId) : null;

    let myOffer = participantA;
    let partnerOffer = participantB;
    if (myUserId && String(participantB.user?.id) === myUserId) {
        myOffer = participantB;
        partnerOffer = participantA;
    }

    const myRap = myOffer.stats.rapWithOfferedRobux;
    const myValue = myOffer.stats.valueWithOfferedRobux;
    const partnerRap = partnerOffer.stats.rapWithReceivedRobux;
    const partnerValue = partnerOffer.stats.valueWithReceivedRobux;

    return {
        tradeId: tradeId ? String(tradeId) : null,
        participantA,
        participantB,
        myOffer,
        partnerOffer,
        assetIds: [
            ...participantA.items.map((item) => item.assetId),
            ...participantB.items.map((item) => item.assetId),
        ].filter(Boolean),
        comparison: {
            myRap,
            myValue,
            partnerRap,
            partnerValue,
            rapDiff: partnerRap - myRap,
            valueDiff: partnerValue - myValue,
        },
    };
}

function createAnalysisFromOffers(
    tradeId,
    participantAOffer,
    participantBOffer,
    options = {},
) {
    return createAnalysisFromNormalizedOffers(
        tradeId,
        normalizeOffer(participantAOffer, 'participantA'),
        normalizeOffer(participantBOffer, 'participantB'),
        options,
    );
}

export function cacheTradeDetailsResponse(data) {
    const tradeId = getTradeId(data);
    if (!tradeId) return;
    tradeDetailsCache.set(tradeId, data);
    latestTradeDetailsId = tradeId;
}

document.addEventListener(TRADE_DETAILS_RESPONSE_EVENT, (event) => {
    cacheTradeDetailsResponse(event.detail);
});

export function getCachedTradeDetails(tradeId) {
    return tradeDetailsCache.get(String(tradeId));
}

export function getLatestTradeDetailsId() {
    return latestTradeDetailsId;
}

export async function fetchTradeDetails(tradeId) {
    const cached = getCachedTradeDetails(tradeId);
    if (cached) return cached;

    const response = await callRobloxApi({
        subdomain: 'trades',
        endpoint: `/v2/trades/${tradeId}`,
        method: 'GET',
    });

    if (!response.ok) return null;

    const data = await response.json();
    cacheTradeDetailsResponse(data);
    return data;
}

export async function analyzeTradeDetails(data, options = {}) {
    if (!data) return null;

    cacheTradeDetailsResponse(data);

    const assetIds = [
        ...(data.participantAOffer?.items || []),
        ...(data.participantBOffer?.items || []),
    ]
        .map((item) => item?.itemTarget?.targetId)
        .filter(Boolean);

    if (assetIds.length > 0) {
        await queueRolimonsFetch(assetIds);
    }

    return createAnalysisFromOffers(
        data.tradeId,
        data.participantAOffer,
        data.participantBOffer,
        options,
    );
}

export async function getTradeAnalysis(tradeId, options = {}) {
    const data =
        options.fetchIfMissing === false
            ? getCachedTradeDetails(tradeId)
            : await fetchTradeDetails(tradeId);

    return analyzeTradeDetails(data, options);
}
