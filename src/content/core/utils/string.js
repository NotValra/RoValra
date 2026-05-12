export const asyncReplaceAll = async (string, regexp, callback) => {
    const matches = string.matchAll(regexp);
    
    for (const match of matches) {
        const full = match[0];
        const captureGroups = match.slice(1, match.length);
        string = string.replace(full, await callback(full, ...captureGroups));
    }

    return string;
}
