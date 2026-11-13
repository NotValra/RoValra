import { settings } from "../../core/settings/getSettings";
import { isAprilFools } from "../../core/utils/aprilFools";

const SETTINGS = {
    tiltElements: null as null | boolean,
    renameRobloxPlus: null as null | boolean,
    renameFriendsTab: null as null | boolean
};

const _tilt_elements_values = new Map();
const _rename_rblx_plus_values: Map<Node, string | null> = new Map();

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

async function tiltElements() {
    if (SETTINGS.tiltElements) {
        document.querySelectorAll("main *").forEach(element => {
            const angle = secureRandom() - 0.5;
            if (!(element instanceof HTMLElement)) {
                return
            }
            if (!_tilt_elements_values.has(element))
                _tilt_elements_values.set(element, element.style.rotate);
            element.style.rotate = `${angle}deg`;
        });
    } else {
        document.querySelectorAll("main *").forEach(element => {
            if (!(element instanceof HTMLElement)) {
                return
            }
            element.style.rotate = _tilt_elements_values.get(element) ?? element.style.rotate;
            _tilt_elements_values.delete(element);
        });
    }
}

async function renameRobloxPlus() {
    if (SETTINGS.renameRobloxPlus) {
        document.querySelectorAll("body *:not(#rovalra-ui-container, #rovalra-ui-container *)").forEach(element => {
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (!_rename_rblx_plus_values.has(node))
                        _rename_rblx_plus_values.set(node, node.textContent);
                    node.textContent = node.textContent?.replaceAll("Roblox Plus", '"Give us money"') ?? "";
                }
            });
        });
    } else {
        for (const node of _rename_rblx_plus_values.keys()) {
            node.textContent = _rename_rblx_plus_values.get(node) ?? null;
        }
    }
}

const _rename_friends_tab_nodes: Map<Node, string | null> = new Map();

async function renameFriendsTab() {
    if (SETTINGS.renameFriendsTab) {
        document.querySelectorAll("div.react-friends-carousel-container h2:has(span.friends-count)").forEach(element => {
            element.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    if (!_rename_friends_tab_nodes.has(node))
                        _rename_friends_tab_nodes.set(node, node.textContent);
                    node.textContent = node.textContent?.replaceAll("Friends", "Who are these people?") ?? "";
                }
            })
        });
        if (window.location.pathname.replace(/\/$/, "") === "/users/friends") {
            document.querySelectorAll("div.friends-subtitle > h2").forEach(element => {
                element.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (!_rename_friends_tab_nodes.has(node))
                            _rename_friends_tab_nodes.set(node, node.textContent);
                        node.textContent = node.textContent?.replaceAll("Friends", "Who are these people?") ?? "";
                    }
                })
            });
            document.querySelectorAll("h1.friends-title").forEach(element => {
                element.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (!_rename_friends_tab_nodes.has(node))
                            _rename_friends_tab_nodes.set(node, node.textContent);
                        node.textContent = node.textContent?.replaceAll("My Friends", "Randoms") ?? "";
                    }
                })
            });
        }
    } else {
        for (const node of _rename_friends_tab_nodes.keys()) {
            node.textContent = _rename_friends_tab_nodes.get(node) ?? null;
        }
    }
}

async function _init() {
    const s = await settings.aprilFoolsSettings;

    if (!s) {
        console.debug(`disabling aprilFools.ts`);
    }

    function parse_setting(value: "on" | "auto" | "off"): boolean {
        if (value === "auto")
            return isAprilFools();

        return value === "on";
    }

    SETTINGS.tiltElements = parse_setting(await settings.aprilFools_tiltElements);
    SETTINGS.renameRobloxPlus = parse_setting(await settings.aprilFools_renameRobloxPlus);
    SETTINGS.renameFriendsTab = parse_setting(await settings.aprilFools_renameFriendsTab);

    await tiltElements();
    await renameRobloxPlus();
    await renameFriendsTab();
}

export async function init() {
    await _init();

    chrome.storage.onChanged.addListener(_init);
}
