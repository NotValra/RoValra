/// <reference types="chrome" />

let verbose = false;

async function init() {
    verbose = (await chrome.storage.local.get({verboseDebug: false})).verboseDebug as boolean;  // believe me, I would *love* to use the new settings API here, but that deadlocks
}

init();

let toFlush: string = "";

export function debugVerbose(fmt: string, ...args: any[]) {
    if (verbose) {
        console.debug(fmt, ...args);
    }
}

/**
 * @deprecated This does nothing.
 */
export function flush() {}
