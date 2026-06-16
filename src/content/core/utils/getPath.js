/**
 * Get the current path/URL
 * @returns {[string, string]} A tuple, where the first element is the full path, and the second element is the normalized path
 */
export default function getPath() {
    const path = window.location.pathname.toLowerCase();
    const normalizedPath = normalizePath(path);  // "www.roblox.com/home" -> "/home"

    return [path, normalizedPath];
}

/**
 * Normalize the path
 * Example:  "www.roblox.com/home" -> "/home"
 * @param {string} path 
 * @returns {string}
 */
export function normalizePath(path) {
    return path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');
}
