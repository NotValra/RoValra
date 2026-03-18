export const logLevel = Object.freeze({
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    CRITICAL: 4
});

const logLevelStr = {
    [logLevel.DEBUG]: 'DEBUG',
    [logLevel.INFO]: 'INFO',
    [logLevel.WARNING]: 'WARNING',
    [logLevel.ERROR]: 'ERROR',
    [logLevel.CRITICAL]: 'CRITICAL'
};

const maxLogLevelLength = 8;

// Minimum Log Level
const minLogLevel = logLevel.DEBUG;

// Whether to call alert() on logLevel.CRITICAL
const criticalAsAlert = true;

// Logging functions
const logfn = {
    [logLevel.DEBUG]:   () => console.debug,
    [logLevel.INFO]:    () => console.info,
    [logLevel.WARNING]: () => console.warn,
    [logLevel.ERROR]:   () => console.error,
    [logLevel.CRITICAL]:() => (criticalAsAlert ? formatAndAlert : console.error)
};


function format(msg, ...args) {
    let i = 0;

    const str = String(msg).replace(/%[sdihf%]/g, token => {
        if (token === "%%") return "%";
        const arg = args[i++];

        switch (token) {
            case "%s": return String(arg);
            case "%d":
            case "%i": return Number.parseInt(arg, 10);
            case "%h": return "0x" + Number.parseInt(arg, 10).toString(16);
            case "%f": return Number.parseFloat(arg);
            default:
                return token;
        }
    });

    if (i < args.length) {
        return str + " " + args.slice(i).join(" ");  // concatenate remaining arguments to the formatted string (if any; seperated by spaces)
    }

    return str;
}

function formatAndAlert(msg, ...args) {
    const formatted = format(msg, ...args);
    log(logLevel.ERROR, msg, ...args);  // for debugging purposes
    alert(formatted);
}

function timestamp() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:` +
           `${String(now.getMinutes()).padStart(2,'0')}:` +
           `${String(now.getSeconds()).padStart(2,'0')}.` +
           `${String(now.getMilliseconds()).padStart(3,'0')}`;
}

function padLevel(msg) {
    return msg.padEnd(maxLogLevelLength);
}

export function log(level, message, ...args) {
    if (level < minLogLevel) {
        return;
    }

    const msg = `(RoValra)  ${timestamp()}  [${padLevel(logLevelStr[level])}]    ${String(message)}`;
    logfn[level]()(msg, ...args);
}

const debug = (message, ...args) => log(logLevel.DEBUG, message, ...args);
const info  = (message, ...args) => log(logLevel.INFO, message, ...args);
const warn  = (message, ...args) => log(logLevel.WARNING, message, ...args);
const error = (message, ...args) => log(logLevel.ERROR, message, ...args);
const critical = (message, ...a) => log(logLevel.CRITICAL, message, ...a);

export const logger = Object.freeze({
    debug: debug,
    info: info,
    warn: warn,
    error: error,
    critical: critical
});
