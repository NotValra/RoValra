import { safeHtml } from '../../packages/dompurify';

export function createStyledInput({ id, label = '', placeholder = ' ' }) {
    const container = document.createElement('div');
    container.className = 'rovalra-catalog-input-wrapper';

    const inputBase = document.createElement('div');
    inputBase.className = 'rovalra-catalog-input-base';

    const input = document.createElement('input');

    input.type = 'text';
    input.id = id;

    input.name = id;

    input.className = 'rovalra-catalog-input-field';
    input.placeholder = placeholder;
    // THIS IS SO FUN!
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');

    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-1p-ignore', 'true');
    input.setAttribute('data-bwignore', 'true');
    input.setAttribute('data-form-type', 'other');

    const labelElement = document.createElement('label');
    labelElement.htmlFor = id;
    labelElement.className = 'rovalra-catalog-input-label';
    labelElement.textContent = label;

    const fieldset = document.createElement('fieldset');
    fieldset.setAttribute('aria-hidden', 'true');
    fieldset.className = 'rovalra-catalog-input-fieldset';

    const legend = document.createElement('legend');
    legend.className = 'rovalra-catalog-input-legend';
    legend.innerHTML = safeHtml`<span>${label || '&#8203;'}</span>`;
    fieldset.appendChild(legend);

    const checkShrink = () => {
        if (input.value || input.classList.contains('Mui-focused')) {
            labelElement.classList.add('MuiInputLabel-shrink');
        } else {
            labelElement.classList.remove('MuiInputLabel-shrink');
        }
    };

    input.addEventListener('focus', () => {
        labelElement.classList.add('Mui-focused');
        inputBase.classList.add('Mui-focused');
        container.classList.add('Mui-focused');
        input.classList.add('Mui-focused');
        checkShrink();
    });

    input.addEventListener('blur', () => {
        labelElement.classList.remove('Mui-focused');
        container.classList.remove('Mui-focused');
        inputBase.classList.remove('Mui-focused');
        input.classList.remove('Mui-focused');
        checkShrink();
    });

    input.addEventListener('input', checkShrink);

    inputBase.append(input, fieldset);
    container.append(labelElement, inputBase);
    checkShrink();

    return { container, input, label: labelElement };
}
