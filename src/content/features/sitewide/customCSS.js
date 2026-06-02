export function init() {
    chrome.storage.local.get(['Customcss', 'Customcsslink'], (result) => {
        if (!result.Customcss) return;

        const cssLink = result.Customcsslink;
        if (!cssLink || cssLink.trim() === '') return;

        applyCustomCSS(cssLink.trim());
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.Customcss || changes.Customcsslink) {
            chrome.storage.local.get(['Customcss', 'Customcsslink'], (updated) => {
                if (!updated.Customcss) {
                    removeCustomCSS();
                } else if (updated.Customcsslink) {
                    applyCustomCSS(updated.Customcsslink.trim());
                }
            });
        }
    });
}

function applyCustomCSS(input) {
    removeCustomCSS();

    // Ensure the URL is valid
    let importUrl;

    try {
        importUrl = new URL(input).href;
    } catch {
        console.warn('[RoValra] customFont: Invalid CSS URL:', input);
        return;
    }

    const style = document.createElement('style');
    style.id = 'rovalra-custom-css';
    style.textContent = `
        @import url('${importUrl}');
    `;

    document.head.appendChild(style);
}

// this is changed customFont.js as it already had what i needed -teeenoob
// to-do:
// - make settings use type:list so people can use more links
// - 
function removeCustomCSS() {
    const existing = document.getElementById('rovalra-custom-css');
    if (existing) existing.remove();
}