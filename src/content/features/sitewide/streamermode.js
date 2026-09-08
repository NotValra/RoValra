import { observeChildren, observeElement } from '../../core/observer.js';

const ROBUX_SELECTORS =
    '#nav-robux-amount, #nav-robux-balance, .rovalra-streamer-robux-value';
const ROBUX_HIDDEN_ATTRIBUTE = 'data-rovalra-robux-hidden';
const ROBUX_REAL_VALUE_CLASS = 'rovalra-robux-real-value';
const ROBUX_HIDDEN_LABEL_CLASS = 'rovalra-robux-hidden-label';
const ROBUX_HIDDEN_TEXT = 'Hidden';
const ROBUX_REVEAL_HINT = 'Click to reveal your Robux';
const ROBUX_VISIBILITY_EVENT = 'rovalra-streamer-robux-visibility';

export function init() {
    let isHideRobuxEnabled = false;
    let isRevealOnClickEnabled = false;
    let isRobuxRevealed = false;
    let isSettingsPageInfoEnabled = false;

    const managedRobuxElements = new Set();
    const watchedRobuxElements = new WeakSet();

    function isRobuxCurrentlyHidden() {
        return isHideRobuxEnabled && !isRobuxRevealed;
    }

    function notifyRobuxVisibility() {
        document.dispatchEvent(
            new CustomEvent(ROBUX_VISIBILITY_EVENT, {
                detail: {
                    enabled: isHideRobuxEnabled,
                    revealed: isRobuxRevealed,
                    revealOnClick: isRevealOnClickEnabled,
                    hidden: isRobuxCurrentlyHidden(),
                },
            }),
        );
    }

    function getRobuxChild(element, className) {
        const child = element.querySelector(`:scope > .${className}`);
        return child instanceof HTMLElement ? child : null;
    }

    function isNestedRobuxElement(element) {
        if (element.querySelector(ROBUX_SELECTORS)) return true;

        const parent = element.parentElement;
        return Boolean(parent?.closest(`[${ROBUX_HIDDEN_ATTRIBUTE}="true"]`));
    }

    function applyRevealAffordance(element, label) {
        if (isRevealOnClickEnabled) {
            element.style.cursor = 'pointer';
            label.title = ROBUX_REVEAL_HINT;
            label.setAttribute('role', 'button');
            label.setAttribute('tabindex', '0');
            return;
        }

        element.style.removeProperty('cursor');
        label.removeAttribute('title');
        label.removeAttribute('role');
        label.removeAttribute('tabindex');
    }

    function hideRobuxElement(element) {
        try {
            let realValue = getRobuxChild(element, ROBUX_REAL_VALUE_CLASS);
            if (!realValue) {
                realValue = document.createElement('span');
                realValue.className = ROBUX_REAL_VALUE_CLASS;
                element.insertBefore(realValue, element.firstChild);
            }

            let label = getRobuxChild(element, ROBUX_HIDDEN_LABEL_CLASS);
            if (!label) {
                label = document.createElement('span');
                label.className = ROBUX_HIDDEN_LABEL_CLASS;
                label.textContent = ROBUX_HIDDEN_TEXT;
                element.appendChild(label);
            }

            Array.from(element.childNodes).forEach((node) => {
                if (node === realValue || node === label) return;
                realValue.appendChild(node);
            });

            realValue
                .querySelectorAll('.rovalra-usd-estimate')
                .forEach((estimate) => estimate.remove());

            realValue.style.display = 'none';
            label.style.display = '';
            element.setAttribute(ROBUX_HIDDEN_ATTRIBUTE, 'true');
            applyRevealAffordance(element, label);
        } catch (error) {
            if (element.textContent !== ROBUX_HIDDEN_TEXT) {
                element.textContent = ROBUX_HIDDEN_TEXT;
            }
            element.setAttribute(ROBUX_HIDDEN_ATTRIBUTE, 'true');
        }
    }

    function unwrapRobuxElement(element) {
        const realValue = getRobuxChild(element, ROBUX_REAL_VALUE_CLASS);
        const label = getRobuxChild(element, ROBUX_HIDDEN_LABEL_CLASS);

        if (realValue) {
            realValue.style.display = '';
            while (realValue.firstChild) {
                element.insertBefore(realValue.firstChild, realValue);
            }
            realValue.remove();
        }

        label?.remove();
    }

    function revealRobuxElement(element) {
        unwrapRobuxElement(element);
        element.setAttribute(ROBUX_HIDDEN_ATTRIBUTE, 'false');
        element.style.cursor = 'pointer';
    }

    function releaseRobuxElement(element) {
        unwrapRobuxElement(element);
        element.removeAttribute(ROBUX_HIDDEN_ATTRIBUTE);
        element.style.removeProperty('cursor');
    }

    function processRobuxElement(element) {
        if (!(element instanceof HTMLElement)) return;
        if (!element.isConnected) return;
        if (isNestedRobuxElement(element)) return;

        if (isRobuxCurrentlyHidden()) {
            hideRobuxElement(element);
            managedRobuxElements.add(element);
            return;
        }

        if (isRevealOnClickEnabled) {
            revealRobuxElement(element);
            managedRobuxElements.add(element);
            return;
        }

        if (!managedRobuxElements.has(element)) return;

        releaseRobuxElement(element);
        managedRobuxElements.delete(element);
    }

    function updateRobuxElements() {
        managedRobuxElements.forEach((element) => {
            if (!element.isConnected) managedRobuxElements.delete(element);
        });

        document.querySelectorAll(ROBUX_SELECTORS).forEach(processRobuxElement);
    }

    function watchRobuxElement(element) {
        if (watchedRobuxElements.has(element)) return;
        watchedRobuxElements.add(element);

        observeChildren(element, () => {
            if (!isRobuxCurrentlyHidden()) return;
            processRobuxElement(element);
        });
    }

    function setRobuxRevealed(revealed) {
        if (isRobuxRevealed === revealed) return;

        isRobuxRevealed = revealed;
        updateRobuxElements();
        notifyRobuxVisibility();
    }

    function getToggleTarget(eventTarget) {
        const element =
            eventTarget instanceof HTMLElement
                ? eventTarget
                : eventTarget?.parentElement;

        return element instanceof HTMLElement
            ? element.closest(`[${ROBUX_HIDDEN_ATTRIBUTE}]`)
            : null;
    }

    function handleRobuxToggleEvent(event) {
        if (!isRevealOnClickEnabled || !isHideRobuxEnabled) return;
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) {
            return;
        }
        if (!getToggleTarget(event.target)) return;

        event.preventDefault();
        event.stopPropagation();
        setRobuxRevealed(!isRobuxRevealed);
    }

    function applyStreamerModeToSettingsField(element) {
        if (!isSettingsPageInfoEnabled) return;
        if (!window.location.href.includes('/my/account')) return;

        const valueSpan = element.querySelector('.settings-text-span-visible');
        if (
            valueSpan &&
            valueSpan.textContent !== 'RoValra Streamer Mode Enabled'
        ) {
            valueSpan.textContent = 'RoValra Streamer Mode Enabled';
        }
    }

    function isSensitiveAccountSettingsField(container) {
        if (container.id === 'account-field-phone') return true;

        if (container.id) return false;

        const phoneField = document.getElementById('account-field-phone');
        let sibling = phoneField?.nextElementSibling;

        while (sibling) {
            if (sibling.classList.contains('settings-text-field-container')) {
                return sibling === container;
            }

            sibling = sibling.nextElementSibling;
        }

        return false;
    }

    function updateSettingsPage() {
        if (!isSettingsPageInfoEnabled) return;
        if (!window.location.href.includes('/my/account')) return;

        document
            .querySelectorAll('.settings-text-field-container')
            .forEach((container) => {
                if (isSensitiveAccountSettingsField(container)) {
                    applyStreamerModeToSettingsField(container);
                }
            });
    }

    function updateStreamerMode() {
        chrome.storage.local.get(
            [
                'streamermode',
                'settingsPageInfo',
                'hideRobux',
                'hideRobuxRevealOnClick',
            ],
            (data) => {
                try {
                    if (data.streamermode) {
                        sessionStorage.setItem('rovalra_streamermode', 'true');
                        sessionStorage.setItem(
                            'rovalra_settingsPageInfo',
                            data.settingsPageInfo !== false ? 'true' : 'false',
                        );
                        sessionStorage.setItem(
                            'rovalra_hideRobux',
                            data.hideRobux === true ? 'true' : 'false',
                        );
                    } else {
                        sessionStorage.removeItem('rovalra_streamermode');
                    }
                } catch (e) {}

                isHideRobuxEnabled =
                    Boolean(data.streamermode) && data.hideRobux === true;
                isRevealOnClickEnabled =
                    isHideRobuxEnabled && data.hideRobuxRevealOnClick === true;
                isSettingsPageInfoEnabled =
                    Boolean(data.streamermode) &&
                    data.settingsPageInfo !== false;

                if (!isRevealOnClickEnabled) {
                    isRobuxRevealed = false;
                }

                updateRobuxElements();
                updateSettingsPage();

                document.dispatchEvent(
                    new CustomEvent('rovalra-streamer-mode', {
                        detail: {
                            enabled: data.streamermode,
                            settingsPageInfo: data.settingsPageInfo !== false,
                            hideRobux: data.hideRobux === true,
                            hideRobuxRevealOnClick: isRevealOnClickEnabled,
                        },
                    }),
                );

                notifyRobuxVisibility();
            },
        );
    }

    updateStreamerMode();

    document.addEventListener('click', handleRobuxToggleEvent, true);
    document.addEventListener('keydown', handleRobuxToggleEvent, true);

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (
            namespace === 'local' &&
            (changes.streamermode ||
                changes.settingsPageInfo ||
                changes.hideRobux ||
                changes.hideRobuxRevealOnClick)
        ) {
            updateStreamerMode();
        }
    });

    observeElement(
        ROBUX_SELECTORS,
        (element) => {
            watchRobuxElement(element);
            processRobuxElement(element);

            const outer = element.parentElement?.closest(ROBUX_SELECTORS);
            if (
                outer instanceof HTMLElement &&
                managedRobuxElements.has(outer)
            ) {
                releaseRobuxElement(outer);
                managedRobuxElements.delete(outer);
                processRobuxElement(element);
            }
        },
        { multiple: true },
    );

    observeElement(
        '.settings-text-field-container',
        (element) => {
            if (isSensitiveAccountSettingsField(element)) {
                applyStreamerModeToSettingsField(element);
            }
        },
        { multiple: true },
    );
}
