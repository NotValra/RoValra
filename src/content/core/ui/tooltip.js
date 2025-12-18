// used to create Robloxs tooltip with an attempted fix for the arrow that didnt exactly work out that well
export function addTooltip(parent, text, options = {}) {
    const { position = 'bottom', container = document.body } = options;
    let tooltipElement = null;
    let isUpdateScheduled = false; let scrollListenerRef = null;

    const showTooltip = () => {
        tooltipElement = document.createElement('div');
        tooltipElement.style.position = 'absolute';
        tooltipElement.style.pointerEvents = 'none';
        tooltipElement.className = `tooltip fade bottom in`;
        tooltipElement.setAttribute('role', 'tooltip');
        
        const arrow = document.createElement('div');
        arrow.className = 'tooltip-arrow';

        const inner = document.createElement('div');
        inner.className = 'tooltip-inner';
        inner.innerHTML = text; 


        tooltipElement.append(arrow, inner);
        container.appendChild(tooltipElement);

        const updatePosition = () => {
            if (!tooltipElement || !parent.isConnected) {
                hideTooltip();
                return;
            }

            const parentRect = parent.getBoundingClientRect();
            const tooltipWidth = tooltipElement.offsetWidth;
            const tooltipHeight = tooltipElement.offsetHeight;
            const arrowSize = 0; 

            let targetTop, targetLeft;

            switch (position) {
                case 'top':
                    targetTop = parentRect.top - tooltipHeight;
                    targetLeft = parentRect.left + (parentRect.width / 2) - (tooltipWidth / 2);
                    break;
                case 'left':
                    targetTop = parentRect.top + (parentRect.height / 2) - (tooltipHeight / 2);
                    targetLeft = parentRect.left - tooltipWidth - arrowSize;
                    break;
                case 'right':
                    targetTop = parentRect.top + (parentRect.height / 2) - (tooltipHeight / 2);
                    targetLeft = parentRect.right + arrowSize;
                    break;
                default: 
                    targetTop = parentRect.bottom + arrowSize;
                    targetLeft = parentRect.left + (parentRect.width / 2) - (tooltipWidth / 2);
                    break;
            }

            let finalLeft = Math.max(5, Math.min(targetLeft, window.innerWidth - tooltipWidth - 5));
            let finalTop = Math.max(5, Math.min(targetTop, window.innerHeight - tooltipHeight - 5));

            const finalTopAbs = finalTop + window.scrollY;
            const finalLeftAbs = finalLeft + window.scrollX;

            tooltipElement.style.top = `${finalTopAbs}px`;
            tooltipElement.style.left = `${finalLeftAbs}px`;

            if (position === 'top' || position === 'bottom') {
                const parentCenterX = parentRect.left + window.scrollX + (parentRect.width / 2);
                const arrowLeft = parentCenterX - finalLeftAbs;
                arrow.style.top = 'auto'; 
                arrow.style.left = `${arrowLeft}px`;
                if (position === 'top') {
                    arrow.style.transform = 'translateY(-100%) rotate(180deg)';
                    arrow.style.top = '100%'; 
                } else {
                    arrow.style.transform = 'none';
                }
            } else if (position === 'left' || position === 'right') {
                const parentCenterY = parentRect.top + window.scrollY + (parentRect.height / 2);
                const arrowTop = parentCenterY - finalTopAbs;
                arrow.style.left = 'auto'; 
                arrow.style.top = `${arrowTop}px`;
                arrow.style.transform = `translateY(-50%) rotate(${position === 'left' ? 90 : -90}deg)`;
            }

            isUpdateScheduled = false;
        };

        const onScrollOrResize = () => {
            if (!isUpdateScheduled) {
                isUpdateScheduled = true;
                requestAnimationFrame(updatePosition);
            }
        };

        updatePosition(); 
        scrollListenerRef = onScrollOrResize; 

        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });
        
        tooltipElement.style.display = 'block'; 
        tooltipElement.style.opacity = '1'; 
        tooltipElement.style.visibility = 'visible'; 
    };

    const hideTooltip = () => {
        if (tooltipElement) {
            tooltipElement.remove();
            tooltipElement = null;
        }
        if (scrollListenerRef) {
            window.removeEventListener('scroll', scrollListenerRef);
            window.removeEventListener('resize', scrollListenerRef);
            scrollListenerRef = null;
        }
    };

    parent.addEventListener('mouseenter', showTooltip); 
    parent.addEventListener('mouseleave', hideTooltip);
    parent.addEventListener('click', hideTooltip); 
}