/**
 * Injects a CSS file into the document's head as a <link> tag.
 * Ensures the stylesheet is only added once.
 * @param {string} cssPath - The path to the CSS file relative to the extension's root.
 * @param {string} id - A unique ID for the <link> element to prevent duplicates.
 */
export function injectStylesheet(cssPath, id) {
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL(cssPath);
    document.head.appendChild(link);
}

/**
 * Removes a stylesheet from the document by its ID.
 * @param {string} id The ID of the stylesheet link element to remove.
 */
export function removeStylesheet(id) {
    const stylesheet = document.getElementById(id);
    if (stylesheet) {
        stylesheet.remove();
    }
}