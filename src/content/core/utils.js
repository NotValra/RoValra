// TODO get rid of this script
export const getCsrfToken = (() => {
    let csrfToken = null;
    let pendingPromise = null;

    const fetchToken = async () => {
        try {
            const metaTag = document.querySelector('meta[name="csrf-token"]');
            if (metaTag?.dataset?.token) {
                csrfToken = metaTag.dataset.token;
                return csrfToken;
            }
            
            const response = await fetch('https://auth.roblox.com/v1/logout', { method: 'POST', credentials: 'include' });
            const token = response.headers.get('x-csrf-token');
            if (!token) throw new Error('CSRF token not found in response header');
            csrfToken = token;
            return token;
        } catch (error) {
            console.error("RoValra (Utils): Failed to get CSRF token.", error);
            pendingPromise = null; 
            return null;
        }
    };

    const getToken = () => {
        if (csrfToken) return Promise.resolve(csrfToken);
        if (pendingPromise) return pendingPromise;
        return (pendingPromise = fetchToken());
    };

    getToken.setToken = (newToken) => {
        csrfToken = newToken;
        pendingPromise = null; 
    };

    return getToken;
})();


export function getUserIdFromUrl() {
    const match = window.location.href.match(/\/users\/(\d+)\/profile/);
    return match ? match[1] : null;
}

export function getUsernameFromPageData() {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
        if (script.textContent.includes('Roblox.ProfileHeaderData')) {
            const match = script.textContent.match(/"profileusername":"([^"]+)"/);
            if (match && match[1]) {
                return match[1];
            }
        }
    }
    console.error('RoValra (Utils): Could not find profileusername within any script tags.');
    return null;
}
