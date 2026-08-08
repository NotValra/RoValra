export function isCallable(fn: unknown): boolean {
    if (typeof fn === "undefined")
        return false;
    if (fn === null)
        return false;
    if (typeof fn !== 'function')
        return false;
    return true;
}
