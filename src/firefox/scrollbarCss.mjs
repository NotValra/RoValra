// Firefox ignores ::-webkit-scrollbar rules, so scrollbars hidden or styled that way in
// Chrome show up as default scrollbars in Firefox (e.g. an extra vertical scrollbar on
// horizontal carousels). This converts those rules into Firefox's standard equivalents:
//   X::-webkit-scrollbar { display: none | width: 0 }  ->  X { scrollbar-width: none }
//   X::-webkit-scrollbar { width: 8px }                ->  X { scrollbar-width: thin }
//   X::-webkit-scrollbar-thumb / -track { background } ->  X { scrollbar-color: thumb track }
//
// Used by scripts/build-firefox.js for the extension CSS files and by
// src/content/core/firefoxCompat.js for <style> elements injected at runtime.

const RULE_REGEX = /([^{}]+)\{([^{}]*)\}/g;
const PSEUDO_REGEX = /::-webkit-scrollbar(-thumb|-track)?$/;

function getDeclaration(declarations, property) {
    const match = declarations.match(
        new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'),
    );
    return match ? match[1].trim() : null;
}

function getColor(declarations) {
    const value =
        getDeclaration(declarations, 'background-color') ||
        getDeclaration(declarations, 'background');
    if (!value || /url\(|gradient\(/i.test(value)) return null;
    return value.replace(/\s*!important\s*$/i, '');
}

function isZeroOrHidden(declarations) {
    if (/(?:^|;)\s*display\s*:\s*none/i.test(declarations)) return true;
    const width = getDeclaration(declarations, 'width');
    const height = getDeclaration(declarations, 'height');
    const isZero = (value) => value && /^0(px)?\b/.test(value);
    return isZero(width) || isZero(height);
}

export function convertWebkitScrollbarCss(cssText) {
    if (!cssText || !cssText.includes('::-webkit-scrollbar')) return '';

    const scrollbars = new Map();
    const getEntry = (selector) => {
        if (!scrollbars.has(selector)) scrollbars.set(selector, {});
        return scrollbars.get(selector);
    };

    for (const [, selectorText, declarations] of cssText.matchAll(RULE_REGEX)) {
        if (!selectorText.includes('::-webkit-scrollbar')) continue;

        for (const rawSelector of selectorText.split(',')) {
            const selector = rawSelector.trim();
            const match = selector.match(PSEUDO_REGEX);
            if (!match) continue;

            const base = selector.slice(0, match.index).trim() || '*';
            const entry = getEntry(base);
            const important = /!important/i.test(declarations);
            if (important) entry.important = true;

            if (!match[1]) {
                if (isZeroOrHidden(declarations)) entry.width = 'none';
                else if (
                    getDeclaration(declarations, 'width') ||
                    getDeclaration(declarations, 'height')
                ) {
                    entry.width ??= 'thin';
                }
            } else if (match[1] === '-thumb') {
                entry.thumb = getColor(declarations) ?? entry.thumb;
            } else if (match[1] === '-track') {
                entry.track = getColor(declarations) ?? entry.track;
            }
        }
    }

    let output = '';
    for (const [selector, entry] of scrollbars) {
        const important = entry.important ? ' !important' : '';
        const declarations = [];
        if (entry.width) {
            declarations.push(`scrollbar-width: ${entry.width}${important}`);
        }
        if (entry.thumb && entry.width !== 'none') {
            declarations.push(
                `scrollbar-color: ${entry.thumb} ${entry.track || 'transparent'}${important}`,
            );
        }
        if (declarations.length) {
            output += `${selector} { ${declarations.join('; ')}; }\n`;
        }
    }
    return output;
}
