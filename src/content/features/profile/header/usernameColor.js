import { observeElement, observeChildren } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';

async function addUsernameColor(username) {
    if (!username || username === '') return;
    username = username.slice(1); // remove the "@" symbol from username

    const colors = [
        // Comments taken from roseal just to make it clearer https://github.com/RoSeal-Extension/RoSeal/blob/main/src/ts/utils/fun/usernameColors.ts
        '#fd2943', // Bright red
        '#01a2ff', // Bright blue
        '#02b857', // Earth green
        '#6b327c', // Bright violet
        '#da8541', // Bright orange
        '#f5cd30', // Bright yellow
        '#e8bac8', // Light reddish violet
        '#d7c59a', // Brick yellow
    ];

    let ComputeNameValue = (username) => {
        let value = 0;
        for (let index = 0; index <= username.length - 1; index++) {
            let cVal = username.substring(index, index + 1);
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
    };

    const cmv = ComputeNameValue(username);
    const value = cmv - Math.floor(cmv / colors.length) * colors.length;

    const nameEl = document.querySelector(
        '#profile-header-title-container-name',
    );
    if (nameEl) nameEl.style.color = colors[value];
}

export async function init() {
    if (!(await settings.usernameColor)) return;
    observeElement(
        '.stylistic-alts-username',
        (el) => {
            const runUpdate = () => {
                if (el.innerText.trim() !== '') {
                    addUsernameColor(el.innerText);
                    return true;
                }
                return false;
            };

            if (!runUpdate()) {
                const { disconnect } = observeChildren(el, () => {
                    if (runUpdate()) disconnect();
                });
            }
        },
        { multiple: true },
    );
}
