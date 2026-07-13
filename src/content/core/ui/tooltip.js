// used to create Robloxs tooltip with an attempted fix for the arrow that didnt exactly work out that well
import DOMPurify from 'dompurify';

let activeTooltipCleanup = null;
let activeTooltipOwner = null;
const tooltipShells = new WeakMap();

function getTooltipShell(container) {
    let shell = tooltipShells.get(container);
    if (shell?.tooltipElement?.isConnected) return shell;

    const tooltipElement = document.createElement('div');
    tooltipElement.style.position = 'absolute';
    tooltipElement.style.pointerEvents = 'none';
    tooltipElement.style.display = 'none';
    tooltipElement.setAttribute('role', 'tooltip');
    tooltipElement.setAttribute('data-rovalra-observer-ignore', 'true');

    const arrow = document.createElement('div');
    arrow.className = 'tooltip-arrow';

    const inner = document.createElement('div');
    inner.className = 'tooltip-inner';

    tooltipElement.appendChild(arrow);
    tooltipElement.appendChild(inner);
    container.appendChild(tooltipElement);

    shell = { tooltipElement, arrow, inner };
    tooltipShells.set(container, shell);
    return shell;
}

export function addTooltip(parent, text, options = {}) {
    const {
        position = 'bottom',
        container = document.body,
        showArrow = true,
        shouldShow = () => true,
    } = options;
    let tooltipElement = null;
    let arrow = null;
    let isUpdateScheduled = false;
    let scrollListenerRef = null;
    let animationFrame = null;
    const owner = Symbol('rovalra-tooltip-owner');

    const getPosition = () =>
        typeof position === 'function' ? position(parent) : position;
    const getText = () => (typeof text === 'function' ? text(parent) : text);

    const showTooltip = () => {
        if (!shouldShow(parent)) return;

        if (activeTooltipCleanup) {
            activeTooltipCleanup();
        }

        const initialPosition = getPosition();
        const shell = getTooltipShell(container);
        tooltipElement = shell.tooltipElement;
        arrow = shell.arrow;
        tooltipElement.className = `tooltip fade ${initialPosition} in`;
        shell.inner.innerHTML = DOMPurify.sanitize(getText());
        arrow.style.display = showArrow ? '' : 'none';
        activeTooltipOwner = owner;

        const updatePosition = () => {
            if (!tooltipElement || !parent.isConnected) {
                hideTooltip();
                return;
            }

            const currentPosition = getPosition();
            tooltipElement.className = `tooltip fade ${currentPosition} in`;

            const parentRect = parent.getBoundingClientRect();
            const tooltipWidth = tooltipElement.offsetWidth;
            const tooltipHeight = tooltipElement.offsetHeight;
            const arrowSize = 0;

            let targetTop, targetLeft;

            switch (currentPosition) {
                case 'top':
                    targetTop = parentRect.top - tooltipHeight;
                    targetLeft =
                        parentRect.left +
                        parentRect.width / 2 -
                        tooltipWidth / 2;
                    break;
                case 'left':
                    targetTop =
                        parentRect.top +
                        parentRect.height / 2 -
                        tooltipHeight / 2;
                    targetLeft = parentRect.left - tooltipWidth - arrowSize;
                    break;
                case 'right':
                    targetTop =
                        parentRect.top +
                        parentRect.height / 2 -
                        tooltipHeight / 2;
                    targetLeft = parentRect.right + arrowSize;
                    break;
                default:
                    targetTop = parentRect.bottom + arrowSize;
                    targetLeft =
                        parentRect.left +
                        parentRect.width / 2 -
                        tooltipWidth / 2;
                    break;
            }

            let finalLeft = Math.max(
                5,
                Math.min(targetLeft, window.innerWidth - tooltipWidth - 5),
            );
            let finalTop = Math.max(
                5,
                Math.min(targetTop, window.innerHeight - tooltipHeight - 5),
            );

            const finalTopAbs = finalTop + window.scrollY;
            const finalLeftAbs = finalLeft + window.scrollX;

            tooltipElement.style.top = `${finalTopAbs}px`;
            tooltipElement.style.left = `${finalLeftAbs}px`;

            if (!showArrow) {
                isUpdateScheduled = false;
            } else if (
                currentPosition === 'top' ||
                currentPosition === 'bottom'
            ) {
                const parentCenterX =
                    parentRect.left + window.scrollX + parentRect.width / 2;
                const arrowLeft = parentCenterX - finalLeftAbs;
                arrow.style.top = 'auto';
                arrow.style.left = `${arrowLeft}px`;
                if (currentPosition === 'top') {
                    arrow.style.transform = 'translateY(-100%) rotate(180deg)';
                    arrow.style.top = '100%';
                } else {
                    arrow.style.transform = 'none';
                }
            } else if (
                currentPosition === 'left' ||
                currentPosition === 'right'
            ) {
                const parentCenterY =
                    parentRect.top + window.scrollY + parentRect.height / 2;
                const arrowTop = parentCenterY - finalTopAbs;
                arrow.style.left = 'auto';
                arrow.style.top = `${arrowTop}px`;
                arrow.style.transform = `translateY(-50%) rotate(${currentPosition === 'left' ? 90 : -90}deg)`;
            }

            isUpdateScheduled = false;
            tooltipElement.style.opacity = '1';
            tooltipElement.style.visibility = 'visible';
            animationFrame = null;
        };

        const onScrollOrResize = () => {
            if (!isUpdateScheduled) {
                isUpdateScheduled = true;
                animationFrame = requestAnimationFrame(updatePosition);
            }
        };

        scrollListenerRef = onScrollOrResize;

        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });

        tooltipElement.style.display = 'block';
        tooltipElement.style.opacity = '0';
        tooltipElement.style.visibility = 'hidden';

        isUpdateScheduled = true;
        animationFrame = requestAnimationFrame(updatePosition);

        activeTooltipCleanup = hideTooltip;
    };

    const hideTooltip = () => {
        if (activeTooltipOwner !== owner) return;

        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
            isUpdateScheduled = false;
        }
        if (tooltipElement) {
            tooltipElement.style.display = 'none';
            tooltipElement.style.opacity = '0';
            tooltipElement.style.visibility = 'hidden';
        }
        if (scrollListenerRef) {
            window.removeEventListener('scroll', scrollListenerRef);
            window.removeEventListener('resize', scrollListenerRef);
            scrollListenerRef = null;
        }
        if (activeTooltipCleanup === hideTooltip) {
            activeTooltipCleanup = null;
            activeTooltipOwner = null;
        }
    };

    parent.addEventListener('mouseenter', showTooltip);
    parent.addEventListener('mouseleave', hideTooltip);
    parent.addEventListener('click', hideTooltip);
}
