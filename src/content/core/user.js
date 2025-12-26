// Gets the user id of the authed user

export function getAuthenticatedUserId() {
    const userDataMeta = document.querySelector('meta[name="user-data"]');
    if (userDataMeta) {
        const userId = userDataMeta.getAttribute('data-userid');
        if (userId) {
            return parseInt(userId, 10);
        }
    }
    return null;
}