// This script will VERY likely get removed at full release as it is only used in the 40% method currently and i dont see any other use cases after i rework the 40% method
export async function corsFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'corsFetch',
                url: url,
                options: options
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response.success) {
                    const corsResponse = {
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                        data: response.data,
                        json: async () => {
                            if (typeof response.data === 'string') {
                                return JSON.parse(response.data);
                            }
                            return response.data;
                        },
                        text: async () => {
                            if (typeof response.data === 'object') {
                                return JSON.stringify(response.data);
                            }
                            return response.data;
                        }
                    };
                    resolve(corsResponse);
                } else {
                    reject(new Error(response.error || 'CORS fetch failed'));
                }
            }
        );
    });
}


export async function corsGetJson(url, headers = {}) {
    const response = await corsFetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            ...headers
        }
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}


export async function corsPostJson(url, data, headers = {}) {
    const response = await corsFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...headers
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}


export async function corsCheck(url) {
    try {
        const response = await corsFetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.warn(`CORS check failed for ${url}:`, error);
        return false;
    }
}
