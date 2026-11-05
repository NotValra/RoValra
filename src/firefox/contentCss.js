(() => {
    const files = globalThis.ROVALRA_FIREFOX_CONTENT_CSS || [];
    if (!files.length) return;

    const root = document.documentElement;
    if (!root || root.querySelector(':scope > link[data-rovalra-content-css]'))
        return;

    const anchor = root.firstChild;
    for (const file of files) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL(file);
        link.dataset.rovalraContentCss = file;
        root.insertBefore(link, anchor);
    }
})();
