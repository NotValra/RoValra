/// <reference types="chrome" />
/** @jsx createJSXElement */

import { getTabIdentifier } from "./utils/customTabId";
import { createJSXElement } from "./jsx-runtime";

declare global {
    var console: Console;
}


// -- Logging Patches --

const oldConsole = console;

function InitPatchLogging() {
    globalThis.console = {
        log: (fmt, ...msg)   => { writeToExcessLogs(Level.Info, fmt, ...msg); return oldConsole.log(`(RoValra:Log) ${fmt}`, ...msg) },
        debug: (fmt, ...msg) => { writeToExcessLogs(Level.Debug, fmt, ...msg); return oldConsole.debug(`(RoValra:Debug) ${fmt}`, ...msg) },
        info: (fmt, ...msg)  => { writeToExcessLogs(Level.Info, fmt, ...msg); return oldConsole.info(`(RoValra:Info) ${fmt}`, ...msg) },
        warn: (fmt, ...msg)  => { writeToExcessLogs(Level.Warning, fmt, ...msg); return oldConsole.warn(`(RoValra:Warn) ${fmt}`, ...msg) },
        error: (fmt, ...msg) => { writeToExcessLogs(Level.Error, fmt, ...msg); return oldConsole.error(`(RoValra:Error) ${fmt}`, ...msg) },
    } as Console;

    if (globalThis.window) {
        window.addEventListener("error", (event) => {
            event.preventDefault();
            console.error("Uncaught error:", event.error);
        });

        window.addEventListener("unhandledrejection", (event) => {
            event.preventDefault();
            console.error("Uncaught async error:", event.reason);
        });
    }
}

// -- --



// -- Verbose Debug Logging --

let verbose = false;

export const Level = Object.freeze({
    Debug:   0,
    Info:    1,
    Warning: 2,
    Error:   3,
});

export function debugVerbose(fmt: string, ...args: any[]) {
    debugVerboseLevel(Level.Debug, fmt, ...args);
}

export function writeToExcessLogs(level: number, fmt: string, ...args: any[]) {
    const key = computeExtraVerboseDebugKey();
    if (key !== undefined) {
        chrome.storage.session.get( { [key]: [] }, async (items) => {
            (items[key] as Array<[number, string, ...string[]]>).push([level, fmt, ...args]);
            chrome.storage.session.set( { [key]: items[key] } );
        });
    }
}

export function debugVerboseLevel(level: number, fmt: string, ...args: any[]) {
    writeToExcessLogs(level, fmt, ...args);

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

function computeExtraVerboseDebugKey() {
    return getTabIdentifier() !== undefined ? `verbosedebug-log-tab-${getTabIdentifier()}` : "verbosedebug-log-tab-serviceworker";
}

async function InitVerboseDebugging() {
    verbose = (await chrome.storage.local.get({verboseDebug: false})).verboseDebug as boolean;  // believe me, I would *love* to use the new settings API here, but that deadlocks
    let key = computeExtraVerboseDebugKey();
    if (key)
        await chrome.storage.local.set({ [key]: [] });
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
    if (globalThis.document === undefined) return;  // Ignore background.js

    const createElementUnpatched = document.createElement.bind(document);

    document.createElement = function<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions | undefined): HTMLElementTagNameMap[K] {
        if ([
            "html",
            "head",
            "body",
            "style",
            "script",
            "select",
            "option",
            "optgroup",
            "input",
            "textarea",
            "img",
            "br",
            "hr",
            "meta",
            "link",
            "rovalra-metadata-stacktrace",
            "rovalra-stacktrace-element",
        ].includes(tagName)) {
            return createElementUnpatched(tagName, options);
        }
        const element = createElementUnpatched(tagName, options);
        if (element.closest('select'))
            return element;

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



// -- Verbose Debug Excess Logs --

// This page can be used to see all RoValra logs across all open tabs (they persist refresh, and get cleared on tab close) and all logs of background.js.
// It also includes all VerboseDebug logs (even if the feature is disabled), acting as a unified place to view all logs, for debugging purposes.
async function InitVerboseDebug_ExcessLogsPage() {
    if (globalThis.document === undefined) return;  // Ignore background.js

    if (window.location.pathname.toLowerCase() !== '/debugverbose/logs') return;

    const color: {[k: number]: string} = {
        [Level.Debug]: "#72deff8f",
        [Level.Info]: "#15ff00",
        [Level.Warning]: "#ff8800",
        [Level.Error]: "#ff0000"
    }

    // Clear the page so we can add our own HTML
    document.body.replaceChildren();

    // Use session storage to avoid wasting disk space.
    // Session storage stores data in memory.
    const allData = await chrome.storage.session.get(null);

    // Keep only Excess Logs data, filtering by prefix
    const allRelatedData = Object.fromEntries(
        Object.entries(allData).filter(([key]) => {
            return key.startsWith("verbosedebug-log-tab-");
        })
    );

    // All tab IDs (note, these are the UUIDs assigned by customTabId.js, not the tab IDs that background.js would see)
    // This excludes the current tab
    const tabIds = Object.keys(allRelatedData).map((k) => k.slice("verbosedebug-log-tab-".length)).filter((k) => k !== getTabIdentifier());

    const heading = (
        <style>
            {`rovalra-metadata-stacktrace {
                display: none;
            }

            .logList > span {
                color: var(--log-color) !important;
            }
            
            span * {
                color: inherit !important;
            }
            `}
        </style>
    );
    
    async function renderLogList(tabId: string) {
        // Read all logs for that tab ID, if any
        const logs: Array<[number, ...string[]]> = allRelatedData[`verbosedebug-log-tab-${tabId}`] as any ?? [];

        const container = <div class="logList"></div>

        for (const log of logs) {
            // --color-content-default is being overwritten here because its also defined in other RoValra CSS, and we don't want that.
            container.appendChild(<span style={`--log-color: ${color[log[0]] ?? "#fff"}; --color-content-default: var(--log-color);`}>
                {
                    `[${Object.entries(Level).find(([,value]) => value === log[0])?.[0]}] ${JSON.stringify(log[1]) ?? String(log[1])}`
                }
            </span>);

            if (log.length >= 2) {  // aka. if there are any other strings or objects
                for (const str of log.slice(2).map((k) => JSON.stringify(k, null, 2).split("\n").join("<br>&emsp;&nbsp;|&nbsp;&nbsp;") ?? String(k))) {  // Stringify every other object. If JSON.stringify(object) covers multiple lines, apply the same
                                                                                                                                                         // indentation prefix to each line
                    // Here, the indentation prefix is `&emsp;&nbsp;|&nbsp;&nbsp;${str}`, effectively `\t |  {str}`
                    container.appendChild(<span style={`--log-color: ${color[log[0]] ?? "#fff"}; --color-content-default: var(--log-color);`}>
                        {`&emsp;&nbsp;|&nbsp;&nbsp;${str}`}
                    </span>);
                }
            }
            container.appendChild(<br/>);  // Add a new line between logs
        }

        body.querySelector("div.logList")?.remove();  // Remove old logs
        body.appendChild(container);                  // Add new logs
    }

    const body = <div>
        <label for="log-tab">Target Tab:</label>

        <select id="log-tab" name="log-tab"
            onchange={(event: Event) => {
                const select = event.currentTarget as HTMLSelectElement;
                renderLogList(select.value);
            }}
        >
            {tabIds.map((tabId) => <option value={tabId}>{tabId}</option>)}
        </select>

        <div style="height: 8em"></div>

        <div class="logList">

        </div>
    </div>;

    document.head.appendChild(heading);
    document.body.appendChild(body);

    await renderLogList(tabIds[0]);  // Default selected tab ID
}

// --



async function init() {
    await InitVerboseDebugging();
    InitVerboseDebug_HTMLElementStackTraceLogging();
    InitPatchLogging();
    if (globalThis.document)
        document.addEventListener('DOMContentLoaded', InitVerboseDebug_ExcessLogsPage);
}

init();
