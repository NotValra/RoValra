// creates a roblox styled toggle switch.
export function createToggle({ id, checked = false, onChange }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-toggle';
    if (id) {
        button.id = id;
    }

    button.innerHTML = `
        <span class="toggle-flip"></span>
        <span class="toggle-on"></span>
        <span class="toggle-off"></span>
    `;

    const setChecked = (isChecked) => {
        button.classList.toggle('on', isChecked);
        button.setAttribute('aria-checked', isChecked);
    };

    button.addEventListener('click', () => {
        const newState = !button.classList.contains('on');
        setChecked(newState);
        if (onChange) {
            onChange(newState);
        }
    });

    setChecked(checked);
    return button;
}