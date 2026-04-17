import * as CacheHandler from '../storage/cacheHandler.js';
export {
    DEVEX_USD_RATE,
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
        changes.robuxFiatRateMode
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
    const base = String(baseCurrency || 'USD').toUpperCase();
    const target = String(targetCurrency || 'USD').toUpperCase();

    if (base === target) return 1;

    const cacheKey = `${base}_${target}`;
    const cachedRate = await CacheHandler.get(
        'currency_conversion_rates',
        cacheKey,
        'local',
    );
    if (typeof cachedRate === 'number' && Number.isFinite(cachedRate)) {
        return cachedRate;
    }

    const rate = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'fetchCurrencyRate', base, target },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!response) {
                    reject(new Error('No response from background worker'));
                    return;
                }
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                resolve(Number(response.rate));
            },
        );
    });

    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`Invalid conversion rate for ${base}/${target}`);
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
