import { observeElement, observeChildren } from '../../../core/observer.js';
import { settings } from '../../../core/settings/getSettings.js';

const LOG_PREFIX = '[usernameColor]';

async function addUsernameColor(username, el) {
    if (!username || username === '') {
        console.log(
            LOG_PREFIX,
            'addUsernameColor called with empty username, skipping',
            el,
        );
        return;
    }
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

    console.log(LOG_PREFIX, `coloring "${username}" ->`, colors[value], el);

    if (el) el.style.color = colors[value];
}

export async function init() {
    if (!(await settings.usernameColor)) {
        console.log(LOG_PREFIX, 'setting disabled, aborting init');
        return;
    }

    console.log(LOG_PREFIX, 'init running');

    // run on script start
    const targetEls = document.querySelectorAll(
        '.stylistic-alts-username, .deleted-user-container .user-name',
    );

    console.log(
        LOG_PREFIX,
        `initial querySelectorAll found ${targetEls.length} element(s)`,
        targetEls,
    );

    for (const targetEl of targetEls) {
        console.log(
            LOG_PREFIX,
            'checking element innerText:',
            JSON.stringify(targetEl.innerText),
            targetEl,
        );
        if (targetEl.innerText.trim() !== '') {
            addUsernameColor(targetEl.innerText, targetEl);
        } else {
            console.log(
                LOG_PREFIX,
                'element had empty innerText at init time, relying on observer',
                targetEl,
            );
        }
    }

    // observe element for changes
    observeElement(
        '.stylistic-alts-username, .deleted-user-container .user-name',
        (el) => {
            console.log(LOG_PREFIX, 'observeElement callback fired for', el);

            const runUpdate = () => {
                console.log(
                    LOG_PREFIX,
                    'runUpdate checking innerText:',
                    JSON.stringify(el.innerText),
                );
                if (el.innerText.trim() !== '') {
                    addUsernameColor(el.innerText, el);
                    return true;
                }
                return false;
            };

            if (!runUpdate()) {
                console.log(
                    LOG_PREFIX,
                    'innerText empty on first check, setting up observeChildren',
                    el,
                );
                const { disconnect } = observeChildren(el, () => {
                    console.log(
                        LOG_PREFIX,
                        'observeChildren mutation fired for',
                        el,
                    );
                    if (runUpdate()) {
                        console.log(
                            LOG_PREFIX,
                            'runUpdate succeeded, disconnecting observeChildren',
                            el,
                        );
                        disconnect();
                    }
                });
            }
        },
        { multiple: true },
    );

    console.log(LOG_PREFIX, 'init finished, observeElement registered');
}
