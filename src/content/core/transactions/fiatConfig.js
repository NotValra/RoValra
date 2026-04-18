export const ROBUX_FIAT_RATE_MODE_NORMAL = 'normal';
export const ROBUX_FIAT_RATE_MODE_DEVEX = 'devex';
export const DEVEX_USD_RATE = 0.0038;

export const ROBUX_FIAT_ESTIMATE_DEFAULT_COLOR = '#7a7d81';

export const ROBUX_FIAT_ESTIMATE_STYLE_MODE_SOLID = 'solid';
export const ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT = 'gradient';

export const ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT = {
    enabled: true,
    color1: '#5fa8ff',
    color2: '#d05bff',
    angle: 90,
    fade: 100,
};

export const ROBUX_FIAT_SETTINGS_DEFAULTS = {
    robuxFiatEstimatesEnabled: false,
    robuxFiatDisplayCurrency: 'USD',
    robuxFiatRateMode: ROBUX_FIAT_RATE_MODE_NORMAL,
    robuxFiatEstimateColor: ROBUX_FIAT_ESTIMATE_DEFAULT_COLOR,
    robuxFiatEstimateStyleMode: ROBUX_FIAT_ESTIMATE_STYLE_MODE_SOLID,
    robuxFiatEstimateGradient: ROBUX_FIAT_ESTIMATE_DEFAULT_GRADIENT,
    robuxFiatEstimateBold: false,
    robuxFiatEstimateItalic: false,
};

export const ROBUX_FIAT_ESTIMATE_STYLE_OPTIONS = [
    {
        value: ROBUX_FIAT_ESTIMATE_STYLE_MODE_SOLID,
        label: 'Solid Color',
    },
    {
        value: ROBUX_FIAT_ESTIMATE_STYLE_MODE_GRADIENT,
        label: 'Gradient',
    },
];

export const TRANSACTION_FIAT_CURRENCY_OPTIONS = [
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'CAD', label: 'CAD - Canadian Dollar' },
    { value: 'AUD', label: 'AUD - Australian Dollar' },
    { value: 'NZD', label: 'NZD - New Zealand Dollar' },
    { value: 'JPY', label: 'JPY - Japanese Yen' },
    { value: 'CNY', label: 'CNY - Chinese Yuan' },
    { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
    { value: 'SGD', label: 'SGD - Singapore Dollar' },
    { value: 'KRW', label: 'KRW - South Korean Won' },
    { value: 'TWD', label: 'TWD - Taiwan Dollar' },
    { value: 'INR', label: 'INR - Indian Rupee' },
    { value: 'PKR', label: 'PKR - Pakistani Rupee' },
    { value: 'BDT', label: 'BDT - Bangladeshi Taka' },
    { value: 'IDR', label: 'IDR - Indonesian Rupiah' },
    { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
    { value: 'PHP', label: 'PHP - Philippine Peso' },
    { value: 'THB', label: 'THB - Thai Baht' },
    { value: 'VND', label: 'VND - Vietnamese Dong' },
    { value: 'AED', label: 'AED - UAE Dirham' },
    { value: 'SAR', label: 'SAR - Saudi Riyal' },
    { value: 'QAR', label: 'QAR - Qatari Riyal' },
    { value: 'KWD', label: 'KWD - Kuwaiti Dinar' },
    { value: 'BHD', label: 'BHD - Bahraini Dinar' },
    { value: 'OMR', label: 'OMR - Omani Rial' },
    { value: 'ILS', label: 'ILS - Israeli New Shekel' },
    { value: 'EGP', label: 'EGP - Egyptian Pound' },
    { value: 'NGN', label: 'NGN - Nigerian Naira' },
    { value: 'KES', label: 'KES - Kenyan Shilling' },
    { value: 'MAD', label: 'MAD - Moroccan Dirham' },
    { value: 'ZAR', label: 'ZAR - South African Rand' },
    { value: 'CHF', label: 'CHF - Swiss Franc' },
    { value: 'SEK', label: 'SEK - Swedish Krona' },
    { value: 'NOK', label: 'NOK - Norwegian Krone' },
    { value: 'DKK', label: 'DKK - Danish Krone' },
    { value: 'ISK', label: 'ISK - Icelandic Krona' },
    { value: 'PLN', label: 'PLN - Polish Zloty' },
    { value: 'CZK', label: 'CZK - Czech Koruna' },
    { value: 'HUF', label: 'HUF - Hungarian Forint' },
    { value: 'RON', label: 'RON - Romanian Leu' },
    { value: 'BGN', label: 'BGN - Bulgarian Lev' },
    { value: 'HRK', label: 'HRK - Croatian Kuna' },
    { value: 'RSD', label: 'RSD - Serbian Dinar' },
    { value: 'UAH', label: 'UAH - Ukrainian Hryvnia' },
    { value: 'RUB', label: 'RUB - Russian Ruble' },
    { value: 'KZT', label: 'KZT - Kazakhstani Tenge' },
    { value: 'TRY', label: 'TRY - Turkish Lira' },
    { value: 'BRL', label: 'BRL - Brazilian Real' },
    { value: 'MXN', label: 'MXN - Mexican Peso' },
    { value: 'ARS', label: 'ARS - Argentine Peso' },
    { value: 'CLP', label: 'CLP - Chilean Peso' },
    { value: 'COP', label: 'COP - Colombian Peso' },
    { value: 'PEN', label: 'PEN - Peruvian Sol' },
    { value: 'UYU', label: 'UYU - Uruguayan Peso' },
    { value: 'VES', label: 'VES - Venezuelan Bolivar' },
];

export const TRANSACTION_FIAT_RATE_OPTIONS = [
    {
        value: ROBUX_FIAT_RATE_MODE_NORMAL,
        label: 'Normal Purchase Rate',
    },
    {
        value: ROBUX_FIAT_RATE_MODE_DEVEX,
        label: 'DevEx Cash-Out Rate',
    },
];
