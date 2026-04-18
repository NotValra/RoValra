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

    try {
        const data = await callRobloxApiJson({
            isRovalraApi: true,
            subdomain: 'apis',
            endpoint: '/v1/currency/rates',
        });

        const usdRates = data?.usd;
        if (!usdRates) {
            throw new Error('RoValra: Invalid currency API response structure');
        }

        const rateToBase = base === 'usd' ? 1 : Number(usdRates[base]);
        const rateToTarget = target === 'usd' ? 1 : Number(usdRates[target]);

        if (
            !Number.isFinite(rateToBase) ||
            rateToBase <= 0 ||
            !Number.isFinite(rateToTarget) ||
            rateToTarget <= 0
        ) {
            throw new Error(
                `RoValra: Invalid conversion data for ${base}/${target}`,
            );
        }

        const rate = rateToTarget / rateToBase;

        await CacheHandler.set(
            'currency_conversion_rates',
            cacheKey,
            rate,
            'local',
        );

        return rate;
    } catch (error) {
        console.error('RoValra: Currency rate fetch failed', error);
        throw error;
    }
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
