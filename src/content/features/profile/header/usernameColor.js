import { observeElement } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';

function watchName(el) {
    if (!el) return;

    const observer = new MutationObserver(() => {
        if (el.innerText !== "") { // ensure valid username
            addUsernameColor(el.innerText);
            observer.disconnect(); // no need for it to continue observing after it got the correct info.
        }
    });

    observer.observe(el, {
        childList: true,
        //subtree: true,
        characterData: true 
    }); // watch element text
}

async function addUsernameColor(username) {
    username = username.slice(1); // remove the "@" symbol from username

    const colors = [
        '#fd2943',
        '#01a2ff',
        '#02b857',
        '#b480ff',
        '#da8541',
        '#f5cd30',
        '#e8bac8',
        '#d7c59a',
    ];

    let ComputeNameValue = (username) => {
        let value = 0;
        for (let index = 0; index <= username.length - 1; index++) {
            let cVal = username.substring(index, index + 1)
            let cValue = cVal.charCodeAt(0);
            let reverseIndex = username.length - index;
            if (username.length % 2 === 1) {
                reverseIndex -= 1;
            }
            if (reverseIndex % 4 >= 2) {
                cValue = -cValue;
            }
            value += cValue;
        }
        return value;
    }

    const cmv = ComputeNameValue(username);
    const value = cmv - Math.floor(cmv / colors.length) * colors.length;
    
    const nameEl = document.querySelector("#profile-header-title-container-name");
    if (nameEl) nameEl.style.color = colors[value];
}

export async function init() {
    if (!(await settings.usernameColor)) return;
    observeElement(".stylistic-alts-username", watchName);
}