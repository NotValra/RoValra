// Creates the very basic Roblox button 
export function createButton(text, type = 'secondary', options = {}) {
    const button = document.createElement('button'); 
    button.textContent = text;
    button.className = `btn-control-md rovalra-ui-btn rovalra-btn-${type}`;
    if (options.id) {
        button.id = options.id;
    }

    if (typeof options.onClick === 'function') {
        button.addEventListener('click', options.onClick);
    }

    if (options.disabled) {
        button.disabled = true;
    }

    return button;
}
