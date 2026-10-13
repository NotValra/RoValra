import { getLanguage } from '../../core/locale/i18n.js';

const fontWeights = {
    'Builder Sans': [100, 300, 400, 500, 600, 700, 800],
    'Builder Extended': [300, 400, 600, 700, 800],
};

function fontFace(family, weight, style, url) {
    return `
        @font-face {
            font-family: '${family}';
            src: url('${url}') format('woff2');
            font-weight: ${weight};
            font-style: ${style};
            font-display: swap;
            unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
        }
    `;
}

export async function init() {
    if (document.getElementById('rovalra-cyrillic-font')) return;

    const lang = await getLanguage();
    if (lang !== 'ru') return;

    const regular = chrome.runtime.getURL(
        'public/Assets/fonts/Inter-Cyrillic.woff2',
    );
    const italic = chrome.runtime.getURL(
        'public/Assets/fonts/Inter-Cyrillic-Italic.woff2',
    );

    let css = '';
    for (const family in fontWeights) {
        for (const weight of fontWeights[family]) {
            css += fontFace(family, weight, 'normal', regular);
            css += fontFace(family, weight, 'italic', italic);
        }
    }

    const style = document.createElement('style');
    style.id = 'rovalra-cyrillic-font';
    style.textContent = css;
    document.documentElement.appendChild(style);
}
