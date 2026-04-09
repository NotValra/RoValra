const existenceCache = new Map();
const prefixCache = new Map();

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return hashHex;
}

export async function checkUserExistence(userId, callRobloxApi) {
    if (existenceCache.has(userId)) {
        return existenceCache.get(userId);
    }

    try {
        const userIdHash = await sha256(userId.toString());
        const prefix = userIdHash.substring(0, 5);

        let matches = prefixCache.get(prefix);

        if (!matches) {
            const response = await callRobloxApi({
                isRovalraApi: true,
                subdomain: 'apis',
                endpoint: `/v1/auth/existence/${prefix}`,
                method: 'GET',
                skipAutoAuth: true,
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success' && Array.isArray(data.matches)) {
                    matches = data.matches;
                    prefixCache.set(prefix, matches);
                }
            }
        }

        if (matches) {
            const exists = matches.includes(userIdHash);
            existenceCache.set(userId, exists);
            return exists;
        }
    } catch (error) {
        console.error('RoValra: Error checking user existence', error);
    }
    return false;
}

export function clearExistenceCache() {
    existenceCache.clear();
    prefixCache.clear();
}
