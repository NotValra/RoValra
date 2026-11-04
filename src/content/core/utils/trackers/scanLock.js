export async function runExclusiveScan(name, scan) {
    if (!navigator.locks) return scan();

    return navigator.locks.request(name, { ifAvailable: true }, (lock) =>
        lock ? scan() : null,
    );
}
