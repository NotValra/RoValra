// Recreates robloxs carousel controls.


export function createScrollButtons({ onLeftClick, onRightClick }) {
    const createArrow = (direction) => {
        const button = document.createElement('div');
        button.setAttribute('data-testid', 'carousel-scroll-arrow');
        button.className = `scroll-arrow ${direction}`;
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        
        button.style.cursor = 'pointer';

        const icon = document.createElement('span');
        icon.className = `icon-chevron-heavy-${direction}`;
        icon.setAttribute('data-testid', 'carousel-scroll-arrow-icon');

        button.appendChild(icon);
        return button;
    };

    const leftButton = createArrow('left');
    const rightButton = createArrow('right');

    if (onLeftClick) leftButton.addEventListener('click', onLeftClick);
    if (onRightClick) rightButton.addEventListener('click', onRightClick);

    return { leftButton, rightButton };
}