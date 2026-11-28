const GAP = 6;
const EDGE_PADDING = 5;

let activeMenu = null;

export function createMenuButton({
    anchor,
    buildContent,
    cacheContent = false,
    className = '',
    buttonClassName = '',
    ariaLabel = '',
}) {
    const button = document.createElement('span');
    button.className =
        `icon-down-16x16 rovalra-menu-btn ${buttonClassName}`.trim();
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);

    const popover = document.createElement('div');
    popover.className =
        `rovalra-tooltip rovalra-tooltip-bottom rovalra-menu-popover ${className}`.trim();
    popover.setAttribute('role', 'dialog');

    const arrow = document.createElement('div');
    arrow.className = 'rovalra-tooltip-arrow';

    const body = document.createElement('div');
    body.className = 'rovalra-tooltip-inner rovalra-menu-popover-body';

    popover.append(arrow, body);

    let isOpen = false;
    let hasBuilt = false;
    let frame = null;

    const reposition = () => {
        frame = null;
        if (!isOpen) return;
        if (!anchor.isConnected) {
            close();
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const width = popover.offsetWidth;
        const height = popover.offsetHeight;

        const targetLeft = rect.left + rect.width / 2 - width / 2;
        const left = Math.max(
            EDGE_PADDING,
            Math.min(targetLeft, window.innerWidth - width - EDGE_PADDING),
        );
        const top = Math.max(
            EDGE_PADDING,
            Math.min(
                rect.bottom + GAP,
                window.innerHeight - height - EDGE_PADDING,
            ),
        );

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        arrow.style.left = `${rect.left + rect.width / 2 - left}px`;
    };

    const scheduleReposition = () => {
        if (frame === null) frame = requestAnimationFrame(reposition);
    };

    const onDocumentPointerDown = (e) => {
        if (popover.contains(e.target) || anchor.contains(e.target)) return;
        close();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') close();
    };

    async function open() {
        if (isOpen) return;
        if (activeMenu && activeMenu !== api) activeMenu.close();
        activeMenu = api;
        isOpen = true;

        if (!popover.isConnected) document.body.appendChild(popover);
        popover.classList.add('rovalra-menu-popover-open');
        button.classList.add('rovalra-menu-btn-open');
        button.setAttribute('aria-expanded', 'true');

        window.addEventListener('scroll', scheduleReposition, {
            passive: true,
            capture: true,
        });
        window.addEventListener('resize', scheduleReposition, {
            passive: true,
        });
        document.addEventListener('pointerdown', onDocumentPointerDown, true);
        document.addEventListener('keydown', onKeyDown);

        reposition();

        if (!hasBuilt || !cacheContent) {
            hasBuilt = true;
            body.replaceChildren();
            const result = buildContent?.(body);
            scheduleReposition();
            if (result instanceof Promise) {
                await result.catch((err) =>
                    console.warn('RoValra: menu content failed', err),
                );
                scheduleReposition();
            }
        }
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        if (activeMenu === api) activeMenu = null;

        popover.classList.remove('rovalra-menu-popover-open');
        button.classList.remove('rovalra-menu-btn-open');
        button.setAttribute('aria-expanded', 'false');

        window.removeEventListener('scroll', scheduleReposition, {
            capture: true,
        });
        window.removeEventListener('resize', scheduleReposition);
        document.removeEventListener(
            'pointerdown',
            onDocumentPointerDown,
            true,
        );
        document.removeEventListener('keydown', onKeyDown);
        if (frame !== null) {
            cancelAnimationFrame(frame);
            frame = null;
        }
    }

    const toggle = () => (isOpen ? close() : open());

    const onAnchorClick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
    };
    const onButtonKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    };

    anchor.addEventListener('click', onAnchorClick, true);
    button.addEventListener('keydown', onButtonKeyDown);
    anchor.classList.add('rovalra-menu-anchor');

    const api = {
        button,
        popover,
        body,
        open,
        close,
        toggle,
        isOpen: () => isOpen,
        invalidate: () => {
            hasBuilt = false;
        },
        destroy: () => {
            close();
            anchor.removeEventListener('click', onAnchorClick, true);
            anchor.classList.remove('rovalra-menu-anchor');
            button.removeEventListener('keydown', onButtonKeyDown);
            button.remove();
            popover.remove();
        },
    };

    return api;
}
