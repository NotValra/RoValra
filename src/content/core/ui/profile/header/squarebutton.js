// Creates a roblox button used in the profile header but no rounded corners!
export function createSquareButton({
    content,
    id,
    backgroundColor,
    textColor,
    hoverBackgroundColor,
    pressBackgroundColor,
    onClick,
    disabled = false,
    width = '100%',
    height = 'height-1000', 
    paddingX = 'padding-x-medium',
    paddingY = 'padding-y-none', 
    disableTextTruncation = false, 
    radius = 'radius-medium',
    fontSize
}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-disabled', String(disabled));
    if (id) button.id = id;

    let classNames = `foundation-web-button relative clip group/interactable focus-visible:outline-focus disabled:outline-none cursor-pointer flex items-center justify-center stroke-none select-none text-label-medium ${height} ${paddingX} ${paddingY} ${radius}`;

    if (backgroundColor) {
    } else {
        classNames += ' bg-action-standard content-action-standard'; 
    }
    
    button.className = classNames;

    Object.assign(button.style, {
        textDecoration: 'none',
        width: width,
        backgroundColor: backgroundColor || '',
        fontSize: fontSize || '', 
        color: textColor || '' 
    });

    button.disabled = disabled;

    const presentationDiv = document.createElement('div');
    presentationDiv.setAttribute('role', 'presentation');
    
    let presentationDivClass = 'absolute inset-[0] transition-colors';
    if (hoverBackgroundColor) {
        presentationDivClass += ` group-hover/interactable:bg-[${hoverBackgroundColor}]`;
    } else {
        presentationDivClass += ' group-hover/interactable:bg-[var(--color-state-hover)]';
    }
    if (pressBackgroundColor) {
        presentationDivClass += ` group-active/interactable:bg-[${pressBackgroundColor}]`;
    } else {
        presentationDivClass += ' group-active/interactable:bg-[var(--color-state-press)]';
    }
    presentationDivClass += ' group-disabled/interactable:bg-none';

    presentationDiv.className = presentationDivClass;

    const contentSpan = document.createElement('span');
    let contentSpanClass = 'padding-y-xsmall padding-x-xsmall';
    if (!disableTextTruncation) {
        contentSpanClass += ' text-truncate-end text-no-wrap';
    } else {
        contentSpanClass += ' text-no-wrap'; 
    }
    contentSpan.className = contentSpanClass;
    
    if (Array.isArray(content)) {
        content.forEach(item => {
            if (typeof item === 'string') {
                contentSpan.appendChild(document.createTextNode(item));
            } else if (item instanceof HTMLElement) {
                contentSpan.appendChild(item);
            }
        });
    } else if (typeof content === 'string') {
        contentSpan.textContent = content;
    } else if (content instanceof HTMLElement) {
        contentSpan.appendChild(content);
    }

    button.append(presentationDiv, contentSpan);

    if (onClick) {
        button.addEventListener('click', onClick);
    }

    return button;
}