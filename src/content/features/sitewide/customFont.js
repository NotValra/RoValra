export function init() {
    chrome.storage.local.get(['Customfont', 'Customfontlink'], (result) => {
        if (!result.Customfont) return;

        const fontLink = result.Customfontlink;
        if (!fontLink || fontLink.trim() === '') return;

        applyCustomFont(fontLink.trim());
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.Customfont || changes.Customfontlink) {
            chrome.storage.local.get(['Customfont', 'Customfontlink'], (updated) => {
                if (!updated.Customfont) {
                    removeCustomFont();
                } else if (updated.Customfontlink) {
                    applyCustomFont(updated.Customfontlink.trim());
                }
            });
        }
    });
}

function resolveGoogleFont(input) {
    input = input.trim();

    // @import url('...')
    const importMatch = input.match(/@import\s+url\(['"]?(https?:\/\/fonts\.googleapis\.com\/[^'")\s]+)['"]?\)/);
    if (importMatch) {
        const importUrl = importMatch[1];
        const familyMatch = importUrl.match(/family=([^&:;]+)/);
        const fontFamily = familyMatch
            ? decodeURIComponent(familyMatch[1]).replace(/\+/g, ' ')
            : null;
        return { importUrl, fontFamily };
    }

    // Raw googleapis URL
    if (input.startsWith('https://fonts.googleapis.com/')) {
        const familyMatch = input.match(/family=([^&:;]+)/);
        const fontFamily = familyMatch
            ? decodeURIComponent(familyMatch[1]).replace(/\+/g, ' ')
            : null;
        return { importUrl: input, fontFamily };
    }

    // fonts.google.com specimen page
    const specimenMatch = input.match(/fonts\.google\.com\/specimen\/([^?&#]+)/);
    if (specimenMatch) {
        const fontFamily = decodeURIComponent(specimenMatch[1]).replace(/\+/g, ' ');
        const encodedFamily = fontFamily.replace(/ /g, '+');
        const importUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`;
        return { importUrl, fontFamily };
    }

    return null;
}

function applyCustomFont(input) {
    removeCustomFont();

    const resolved = resolveGoogleFont(input);
    if (!resolved) {
        console.warn('[RoValra] customFont: Could not parse font input:', input);
        return;
    }

    const { importUrl, fontFamily } = resolved;

    const style = document.createElement('style');
    style.id = 'rovalra-custom-font';
    style.textContent = `
        @import url('${importUrl}');

        * {
            font-family: '${fontFamily}', sans-serif !important;
        }
    `;

    document.head.appendChild(style);
}

function removeCustomFont() {
    const existing = document.getElementById('rovalra-custom-font');
    if (existing) existing.remove();
}