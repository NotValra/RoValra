/// <reference types="chrome" />

import { key } from "p5";

declare global {
    var console: Console;
}


// -- Logging Patches --

const oldConsole = console;

function InitPatchLogging() {
    globalThis.console = {
        log: (fmt, ...msg) => oldConsole.log(`(RoValra:Log) ${fmt}`, ...msg),
        debug: (fmt, ...msg) => oldConsole.debug(`(RoValra:Debug) ${fmt}`, ...msg),
        info: (fmt, ...msg) => oldConsole.info(`(RoValra:Info) ${fmt}`, ...msg),
        warn: (fmt, ...msg) => oldConsole.warn(`(RoValra:Warn) ${fmt}`, ...msg),
        error: (fmt, ...msg) => oldConsole.error(`(RoValra:Error) ${fmt}`, ...msg),
    } as Console;

    window.addEventListener("error", (event) => {
        event.preventDefault();
        console.error("Uncaught error:", event.error);
    });

    window.addEventListener("unhandledrejection", (event) => {
        event.preventDefault();
        console.error("Uncaught async error:", event.reason);
    });
}

// -- --



// -- Verbose Debug Logging --

let verbose = false;

export const Level = Object.freeze({
    Debug:   0,
    Info:    1,
    Warning: 2,
});

export function debugVerbose(fmt: string, ...args: any[]) {
    debugVerboseLevel(Level.Debug, fmt, ...args);
}

export function debugVerboseLevel(level: number, fmt: string, ...args: any[]) {
    if (!verbose)
        return;

    switch (level) {
        case Level.Debug:
            console.debug(fmt, ...args);
            break;

        case Level.Info:
            console.info(fmt, ...args);
            break;

        case Level.Warning:
            console.warn(fmt, ...args);
            break;

        default:
            console.debug(fmt, ...args);
    }
}

async function InitVerboseDebugging() {
    verbose = (await chrome.storage.local.get({verboseDebug: false})).verboseDebug;  // believe me, I would *love* to use the new settings API here, but that deadlocks
}

// -- --



// -- Verbose Debug HTMLElement Stack Traces --

let RoValraElements: Array<[Element, string[]]> = [];

function GetStackTrace(): string[] {
    const err = new Error();
    const stackTraceStr = err.stack;
    return stackTraceStr?.split("\n").filter(Boolean).splice(1).map((s) => s.trimStart()) ?? [];
}

function InitVerboseDebug_HTMLElementStackTraceLogging() {  // Note: I know, long and complex name
    if (!verbose) return;  // This will create tons of DOM elements (880 at the time of writing this comment), so only run this if the Verbose Debugging setting is enabled

    const createElementUnpatched = document.createElement.bind(document);

    document.createElement = function<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions | undefined): HTMLElementTagNameMap[K] {
        const element = createElementUnpatched(tagName, options);
        RoValraElements.push([element, GetStackTrace().slice(3)]);

        return element;
    }

    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type !== "childList") continue;

            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue;

                const match = RoValraElements.find(([element]) => element === node);

                if (!match) continue;

                const [targetNode, stackTrace] = match;

                const toProcess = [node];
                for (const descendant of node.querySelectorAll("*")) {
                    toProcess.push(descendant);
                }
                for (const processingNode of toProcess) {
                    const childMatch = RoValraElements.find(([element]) => element === processingNode) ?? [undefined, stackTrace];
                    
                    const [, childStackTrace] = childMatch;

                    const meta = createElementUnpatched("rovalra-metadata-stacktrace");
                    meta.setAttribute('size', String(childStackTrace.length));

                    let i = 0;
                    for (const sti of childStackTrace) {
                        i++;
                        const stiElement = createElementUnpatched("rovalra-stacktrace-element");
                        stiElement.textContent = `[${i}] ${sti}`;
                        meta.appendChild(stiElement);
                    }

                    processingNode.appendChild(meta);
                }
            }

            for (const node of record.removedNodes) {
                const match = RoValraElements.find(([element]) => element === node);

                if (!(node instanceof Element)) continue;

                const toRemove: Element[] = [];
                if (match && !node.isConnected) toRemove.push(node);

                for (const descendant of node.querySelectorAll("*")) {
                    if (RoValraElements.find((([element]) => element === descendant)) && !descendant.isConnected) {
                        toRemove.push(descendant);
                    }
                }

                RoValraElements = RoValraElements.filter(([element]) => !toRemove.find((k) => k === element));
            }
        }
    });

    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
    });
}

// -- --



async function init() {
    await InitVerboseDebugging();
    InitVerboseDebug_HTMLElementStackTraceLogging();
    InitPatchLogging();
}

init();
