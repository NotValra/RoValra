import { createPill } from './pill.js';

/**
 * Creates a pill toggle component, which is a set of options where only one can be active.
 * It looks like a single pill containing multiple segments.
 * @param {object} config
 * @param {Array<{text: string, value: any, tooltip?: string}>} config.options - The options for the toggle.
 * @param {any} [config.initialValue] - The initially selected value.
 * @param {(value: any) => void} [config.onChange] - Callback when the selected value changes.
 * @returns {HTMLElement} The pill toggle container element.
 */
export function createPillToggle({ options, initialValue, onChange }) {
    const container = document.createElement('div');
    container.className = 'rovalra-pill-toggle bg-shift-300 radius-circle flex items-center';
    container.style.display = 'inline-flex';
    container.style.gap = 'var(--padding-xsmall)';
    container.style.padding = '2px';

    let selectedValue = initialValue;
    const buttons = new Map();

    options.forEach(option => {
        const pillButton = createPill(option.text, option.tooltip, { isButton: true });
        pillButton.dataset.value = option.value;

        pillButton.classList.remove('bg-shift-300');
        pillButton.style.backgroundColor = 'transparent';

        const content = pillButton.querySelector('span');
        if (content) {
            content.style.position = 'relative';
            content.style.zIndex = '2';
        }

        container.appendChild(pillButton);
        buttons.set(option.value, pillButton);

        pillButton.addEventListener('click', () => {
            if (pillButton.classList.contains('disabled') || String(selectedValue) === String(option.value)) {
                return;
            }
            
            selectedValue = option.value;
            updateSelected();
            
            if (onChange) {
                onChange(selectedValue);
            }
        });
    });

    function updateSelected() {
        for (const [value, button] of buttons.entries()) {
            const presentation = button.querySelector('div[role="presentation"]');
            if (String(value) === String(selectedValue)) {
                button.classList.replace('content-action-utility', 'content-default');
                presentation.style.backgroundColor = 'var(--color-surface-100)';
            } else {
                button.classList.replace('content-default', 'content-action-utility');
                presentation.style.backgroundColor = 'transparent';
            }
        }
    }

    if (selectedValue === undefined && options.length > 0) {
        selectedValue = options[0].value;
    }
    
    if (selectedValue !== undefined) {
        updateSelected();
    }

    return container;
}