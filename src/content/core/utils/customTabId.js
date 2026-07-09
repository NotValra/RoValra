const TABID_KEY = "rovalra-tab-id";

export function getTabIdentifier() {
    if (globalThis.sessionStorage === undefined)
        return undefined;

    let id = sessionStorage.getItem(TABID_KEY);

    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(TABID_KEY, id);
    }

    chrome.runtime.sendMessage({
        type: "RoValra-Register-TabID",
        id,
    });

    return id;
}
