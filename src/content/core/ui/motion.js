const closingPopups = new WeakMap();

export function getMotionOptions(group) {
    const root = document.documentElement;
    if (
        root.getAttribute(`data-rovalra-animate-${group}`) !== 'true' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        return null;
    }

    const style = getComputedStyle(root);
    const durationValue = style
        .getPropertyValue('--rovalra-motion-duration')
        .trim();
    const match = durationValue.match(/^(\d*\.?\d+)(ms|s)$/);
    const duration = match
        ? Number(match[1]) * (match[2] === 's' ? 1000 : 1)
        : 220;
    if (!duration) return null;

    return {
        duration,
        easing:
            style.getPropertyValue('--rovalra-motion-ease').trim() ||
            'cubic-bezier(0.16, 1, 0.3, 1)',
    };
}

export function cancelPopupClose(element) {
    closingPopups.get(element)?.cancel();
}

export function closePopupWithMotion(element, group, onFinish) {
    if (closingPopups.has(element)) return;

    const options = getMotionOptions(group);
    if (!options || !element.isConnected || !element.animate) {
        onFinish();
        return;
    }

    const style = getComputedStyle(element);
    const appearance = {
        opacity: style.opacity,
        visibility: style.visibility,
        transform: style.transform,
    };
    const wasInert = element.inert;
    const pointerEvents = element.style.pointerEvents;
    const transition = element.style.transition;
    element.inert = true;
    element.style.pointerEvents = 'none';
    element.style.transition = 'none';

    let animation;
    let active = true;
    const cleanup = () => {
        active = false;
        closingPopups.delete(element);
        document.removeEventListener('rovalra:motionChanged', handleChange);
        element.inert = wasInert;
        element.style.pointerEvents = pointerEvents;
        element.style.transition = transition;
        animation?.cancel();
    };
    const finish = () => {
        if (!active) return;
        cleanup();
        onFinish();
    };
    const handleChange = () => {
        if (!getMotionOptions(group)) finish();
    };

    closingPopups.set(element, { cancel: cleanup });
    document.addEventListener('rovalra:motionChanged', handleChange);

    try {
        // Preserve placement and visibility if the owner changes its open state.
        animation = element.animate(
            [appearance, { ...appearance, opacity: 0 }],
            { ...options, fill: 'forwards' },
        );
        animation.finished.then(finish, finish);
    } catch {
        finish();
    }
}
