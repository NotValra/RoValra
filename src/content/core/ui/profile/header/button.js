// Creates the more cool and profile header button used by roblox with rounded corners!
export function createProfileHeaderButton({ content, id, onClick, disabled = false, backgroundColor }) {
    const button = document.createElement('button');
    button.type = 'button';

    let classNames = 'relative clip group/interactable focus-visible:outline-focus disabled:outline-none flex justify-center items-center radius-circle stroke-none padding-left-medium padding-right-medium height-800 text-label-medium content-action-utility';
    if (!backgroundColor) {
        classNames += ' bg-shift-300';
    }
    button.className = classNames;

    if (id) button.id = id;
    button.disabled = disabled;
    if (backgroundColor) button.style.backgroundColor = backgroundColor;

    const presentationDiv = document.createElement('div');
    presentationDiv.setAttribute('role', 'presentation');
    presentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

    const contentSpan = document.createElement('span');
    contentSpan.className = 'text-no-wrap text-truncate-end flex items-center'; 
    contentSpan.append(...(Array.isArray(content) ? content : [content]));

    button.append(presentationDiv, contentSpan);
    if (onClick) button.addEventListener('click', onClick);
    return button;
}