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

    if (options.disabled) {
        button.disabled = true;
    }

    return button;
}
