// Creates the very basic Roblox button
export function createButton(text, type = 'secondary', options = {}) {
    const button = document.createElement('button');
    button.textContent = text;

    let baseClass = 'btn-control-md';
    if (type === 'primary') {
        baseClass = 'btn-primary-md';
    } else if (type === 'alert' || type === 'primary-destructive') {
        baseClass = 'btn-alert-md';
    }
    button.className = `${baseClass} rovalra-ui-btn rovalra-btn-${type}`;
    if (options.id) {
        button.id = options.id;
    }

    if (typeof options.onClick === 'function') {
        button.addEventListener('click', options.onClick);
    }
    if (options.classList && Array.isArray(options.classList)) {
        button.classList.add(...options.classList);
    }

    if (options.disabled) {
        button.disabled = true;
    }

    return button;
}

export function createFoundationButton(text, options = {}) {
    const variant = options.variant || 'standard';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer flex items-center justify-center stroke-none padding-y-none select-none radius-small text-label-small height-600 padding-x-small bg-action-${variant} content-action-${variant}`;
    button.style.textDecoration = 'none';

    const stateLayer = document.createElement('div');
    stateLayer.setAttribute('aria-hidden', 'true');
    stateLayer.className =
        'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

    const content = document.createElement('span');
    content.className = 'flex items-center min-width-0 gap-xsmall';

    const label = document.createElement('span');
    label.className = 'padding-y-xsmall text-truncate-end text-no-wrap';
    label.textContent = text;

    content.appendChild(label);
    button.append(stateLayer, content);

    if (options.id) {
        button.id = options.id;
    }

    if (typeof options.onClick === 'function') {
        button.addEventListener('click', options.onClick);
    }
    if (options.classList && Array.isArray(options.classList)) {
        button.classList.add(...options.classList);
    }

    if (options.disabled) {
        button.disabled = true;
    }

    return button;
}
