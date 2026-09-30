const oldConsole = console;

globalThis.console = {
    log: (fmt, ...msg) => oldConsole.log(`(RoValra:Log) ${fmt}`, ...msg),
    debug: (fmt, ...msg) => oldConsole.debug(`(RoValra:Debug) ${fmt}`, ...msg),
    info: (fmt, ...msg) => oldConsole.info(`(RoValra:Info) ${fmt}`, ...msg),
    warn: (fmt, ...msg) => oldConsole.warn(`(RoValra:Warn) ${fmt}`, ...msg),
    error: (fmt, ...msg) => oldConsole.error(`(RoValra:Error) ${fmt}`, ...msg),
}

window.addEventListener("error", (event) => {
    event.preventDefault();
    console.error("Uncaught error:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    console.error("Uncaught async error:", event.reason);
});
