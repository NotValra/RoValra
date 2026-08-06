export function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

export async function awaitSafe<T>(fn: (...args: any[]) => Promise<T>, ...args: any[]): Promise<T | undefined> {
    try {
        return await fn(...args);
    } catch (e) {
        console.error(e);
        return undefined;
    }
}

export function isCallable(fn: unknown): boolean {
    if (typeof fn === "undefined")
        return false;
    if ([undefined, null].includes(fn))
        return false;
    if (typeof fn !== 'function')
        return false;
    return true;
}
