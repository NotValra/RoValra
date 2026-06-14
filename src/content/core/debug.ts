/// <reference types="chrome" />

let verbose = false;

async function init() {
    verbose = (await chrome.storage.local.get({verboseDebug: false})).verboseDebug;  // believe me, I would *love* to use the new settings API here, but that deadlocks
}

init();

let toFlush: string = "";

export function debugVerbose(fmt: string, ...args: any[]) {
    if (toFlush.length >= 500) {
        flush();
    }
    if (verbose) {
        console.debug(fmt, ...args);
    } else {
        toFlush += fmt;
        toFlush += (args?.length || 0) >= 1 ? ` (${args.length} suppressed Objects)` : ``;
        toFlush += "\n";
    }
}

export function flush() {
    console.debug(toFlush);
    toFlush = "";
}
