export const KeyNotFound = Symbol("KeyNotFound");

/**
 * Get an item from a Record by period-separated key.
 * Example: "test.abc" will return data['test']['abc']
 * @param data The data to retrieve a value from
 * @param key The period-separated key.
 */
export function getKey<T = any>(data: Record<string, any>, key: string): Record<string, any> | T {
    let value: any = data;
    for (const subString of key.split(".")) {
        if (typeof value === 'object' && value !== null) {
            if (Object.keys(value).includes(subString))
                value = value[subString];
            else {
                value = KeyNotFound;
                return value;
            }
        } else {
            return value;
        }
    }
    return value;
}

/**
 * Set an item from a Record by period-separated key.
 * @param data The data to set a value for
 * @param key The period-separated key.
 * @param v The value to set
 */
export function setKey(data: Record<string, any>, key: string, v: any) {  // I apologise for this code
    let value: any = data;
    const split = key.split(".");

    for (const subString of split.slice(0, split.length - 1)) {
        let value2 = value[subString];
        if (typeof value2 !== 'object' || value2 === null)
            value[subString] = {};
        
        value = value2;
    }

    value[split[split.length - 1]] = v;
}
