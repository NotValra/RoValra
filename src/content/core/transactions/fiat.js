import * as CacheHandler from '../storage/cacheHandler.js';
import { callRobloxApiJson } from '../api.js';
export {
    DEVEX_USD_RATE,
    ROBUX_FIAT_ESTIMATE_DEFAULT_COLOR,
    ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT,
    ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT,
    ROBUX_FIAT_ESTIMATE_STYLE_MODE_SOLID,
    ROBUX_FIAT_ESTIMATE_STYLE_OPTIONS,
    ROBUX_FIAT_RATE_MODE_DEVEX,
    ROBUX_FIAT_RATE_MODE_NORMAL,
    ROBUX_FIAT_SETTINGS_DEFAULTS,
    TRANSACTION_FIAT_CURRENCY_OPTIONS,
    TRANSACTION_FIAT_RATE_OPTIONS,
} from './fiatConfig.js';
import {
    DEVEX_USD_RATE,
    ROBUX_FIAT_RATE_MODE_DEVEX,
    ROBUX_FIAT_RATE_MODE_NORMAL,
    ROBUX_FIAT_SETTINGS_DEFAULTS,
} from './fiatConfig.js';

let fiatSettingsPromise = null;

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (
        changes.robuxFiatEstimatesEnabled ||
        changes.robuxFiatDisplayCurrency ||
        changes.robuxFiatRateMode ||
        changes.robuxFiatEstimateColor ||
        changes.robuxFiatEstimateStyleMode ||
        changes.robuxFiatEstimateGradient ||
        changes.robuxFiatEstimateBold ||
        changes.robuxFiatEstimateItalic
    ) {
        fiatSettingsPromise = null;
    }
});

export async function getRobuxFiatSettings() {
    if (fiatSettingsPromise) return fiatSettingsPromise;

    fiatSettingsPromise = new Promise((resolve) => {
        chrome.storage.local.get(ROBUX_FIAT_SETTINGS_DEFAULTS, (settings) => {
            resolve({
                ...ROBUX_FIAT_SETTINGS_DEFAULTS,
                ...settings,
            });
        });
    }).catch((error) => {
        fiatSettingsPromise = null;
        throw error;
    });

    return fiatSettingsPromise;
}

export async function getCurrencyConversionRate(baseCurrency, targetCurrency) {
    const base = String(baseCurrency || 'USD').toLowerCase();
    const target = String(targetCurrency || 'USD').toLowerCase();

    if (base === target) return 1;

    const cacheKey = `${base.toUpperCase()}_${target.toUpperCase()}`;
    const cachedRate = await CacheHandler.get(
        'currency_conversion_rates',
        cacheKey,
        'local',
    );
    if (typeof cachedRate === 'number' && Number.isFinite(cachedRate)) {
        return cachedRate;
    }

    const endpoints = [
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${encodeURIComponent(base)}.json`,
        `https://latest.currency-api.pages.dev/v1/currencies/${encodeURIComponent(base)}.json`,
    ];

    let lastError = null;
    let rate = null;

    for (const url of endpoints) {
        try {
            const data = await callRobloxApiJson({
                fullUrl: url,
                credentials: 'omit',
            });
            const fetchedRate = Number(data?.[base]?.[target]);
            if (!Number.isFinite(fetchedRate) || fetchedRate <= 0) {
                lastError = new Error(
                    `Invalid conversion rate for ${base}/${target}`,
                );
                continue;
            }
            rate = fetchedRate;
            break;
        } catch (error) {
            lastError = error;
        }
    }

    if (rate === null) {
        console.error('RoValra: Currency rate fetch failed', lastError);
        throw (
            lastError ||
            new Error(`Failed to fetch conversion rate for ${base}/${target}`)
        );
    }

    await CacheHandler.set(
        'currency_conversion_rates',
        cacheKey,
        rate,
        'local',
    );

    return rate;
}

export async function convertCurrencyAmount(
    amount,
    baseCurrency,
    targetCurrency,
) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return null;

    const rate = await getCurrencyConversionRate(baseCurrency, targetCurrency);
    return numericAmount * rate;
}

export function formatDisplayCurrency(amount, currencyCode = 'USD') {
    const roundedValue = Math.round(amount * 100) / 100;

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(roundedValue);
}
