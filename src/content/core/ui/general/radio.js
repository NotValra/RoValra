// Recreates robloxs radio button or more commonly known as a none sliding toggle button / checkbox

export function createRadioButton({ id, checked = false, onChange } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'checkbox'); 
    if (id) button.id = id;

    Object.assign(button.style, {
        background: 'none', border: 'none', padding: '0',
        cursor: 'pointer', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        width: '24px', height: '24px' 
    });

    const icon = document.createElement('span');

    const setChecked = (isChecked) => {
        button.setAttribute('aria-checked', String(isChecked));
        icon.className = isChecked ? 'icon-radio-check-circle-filled' : 'icon-radio-check-circle';
    };

    button.addEventListener('click', (e) => {
        e.stopPropagation(); 
        const newState = button.getAttribute('aria-checked') !== 'true';
        setChecked(newState);
        if (onChange) {
            onChange(newState);
        }
    });

    button.appendChild(icon);
    setChecked(checked);
    button.setChecked = setChecked; 

    return button;
}