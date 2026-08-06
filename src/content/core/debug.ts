/// <reference types="chrome" />

let verbose = false;

async function init() {
    verbose = (await chrome.storage.local.get({verboseDebug: false})).verboseDebug;  // believe me, I would *love* to use the new settings API here, but that deadlocks
}

init();

export function debugVerbose(fmt: string, ...args: any[]) {
    if (toFlush.length >= 500) {
        flush();
    }
    if (verbose) {
        console.debug(fmt, ...args);
    }
}

/**
 * @deprecated Does nothing.
 */
export function flush() {}
