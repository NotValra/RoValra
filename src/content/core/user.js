// Gets the user id of the authed user

function waitForDom() {
    return new Promise((resolve) => {
        if (document.readyState !== 'loading') {
            resolve();
        } else {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        }
    });
}

export async function getAuthenticatedUserId() {
    await waitForDom();
    const userDataMeta = document.querySelector('meta[name="user-data"]');
    if (userDataMeta) {
        const userId = userDataMeta.getAttribute('data-userid');
        if (userId) {
            return parseInt(userId, 10);
        }
    }
    return null;
}
export async function getAuthenticatedUsername() {
    await waitForDom();
    const userDataMeta = document.querySelector('meta[name="user-data"]');
    if (userDataMeta) {
        const username = userDataMeta.getAttribute('data-name');
        if (username) {
            return username;
        }
    }
    return null;
}