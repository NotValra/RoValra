import { observeElement } from '../observer.js';

const ROBUX_ICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M15.0762 7.29574C15.6479 6.96571 16.3521 6.96571 16.9238 7.29574L23.0762 10.8479C23.6479 11.1779 24 11.7878 24 12.4479V19.5521C24 20.2122 23.6479 20.8221 23.0762 21.1521L16.9238 24.7043C16.3521 25.0343 15.6479 25.0343 15.0762 24.7043L8.92376 21.1521C8.35214 20.8221 8 20.2122 8 19.5521V12.4479C8 11.7878 8.35214 11.1779 8.92376 10.8479L15.0762 7.29574ZM11.9998 13V19C11.9998 19.5523 12.4475 20 12.9998 20H18.9998C19.5521 20 19.9998 19.5523 19.9998 19V13C19.9998 12.4477 19.5521 12 18.9998 12H12.9998C12.4475 12 11.9998 12.4477 11.9998 13Z'/><path d='M13.8556 2.56068C15.1825 1.81311 16.8175 1.81311 18.1444 2.56068L26.8556 7.46819C28.1825 8.21577 29 9.59734 29 11.0925V20.9075C29 22.4027 28.1825 23.7842 26.8556 24.5318L18.1444 29.4393C16.8175 30.1869 15.1825 30.1869 13.8556 29.4393L5.14444 24.5318C3.81746 23.7842 3 22.4027 3 20.9075V11.0925C3 9.59734 3.81746 8.21577 5.14444 7.46819L13.8556 2.56068ZM17.1628 4.30319C16.4452 3.89894 15.5548 3.89894 14.8372 4.30319L6.12611 9.2107C5.41362 9.61209 5 10.336 5 11.0925V20.9075C5 21.664 5.41362 22.3879 6.12611 22.7893L14.8372 27.6968C15.5548 28.1011 16.4452 28.1011 17.1628 27.6968L25.8739 22.7893C26.5864 22.3879 27 21.664 27 20.9075V11.0925C27 10.336 26.5864 9.61209 25.8739 9.2107L17.1628 4.30319Z'/></svg>`;

const ROBUX_ICON_MASK_URI = `data:image/svg+xml,${encodeURIComponent(ROBUX_ICON_SVG)}`;

const DEFAULT_SIZE = '16px';
const DEFAULT_COLOR = 'currentColor';

export function applyRobuxIcon(element, options = {}) {
    if (!(element instanceof HTMLElement)) {
        console.warn('RoValra: applyRobuxIcon requires an HTMLElement');
        return;
    }

    const {
        size = DEFAULT_SIZE,
        color = DEFAULT_COLOR,
        verticalAlign = 'middle',
    } = options;

    element.style.width = size;
    element.style.height = size;
    element.style.backgroundColor = color;
    element.style.verticalAlign = verticalAlign;
    element.style.maskImage = `url("${ROBUX_ICON_MASK_URI}")`;
    element.style.webkitMaskImage = `url("${ROBUX_ICON_MASK_URI}")`;
    element.style.maskSize = 'contain';
    element.style.webkitMaskSize = 'contain';
    element.style.maskRepeat = 'no-repeat';
    element.style.webkitMaskRepeat = 'no-repeat';
    element.style.maskPosition = 'center';
    element.style.webkitMaskPosition = 'center';
    element.style.maskMode = 'alpha';
    element.style.webkitMaskMode = 'alpha';
    element.style.display = 'inline-block';

    return element;
}

export function createRobuxIcon(options = {}) {
    const {
        size = DEFAULT_SIZE,
        color = DEFAULT_COLOR,
        verticalAlign = 'middle',
        className = '',
        id = '',
    } = options;

    const icon = document.createElement('span');

    if (id) icon.id = id;

    const classes = ['rovalra-robux-icon'];
    if (className) classes.push(className);
    icon.className = classes.join(' ');

    applyRobuxIcon(icon, { size, color, verticalAlign });

    return icon;
}

export function processRobuxIcons(container = document, defaultOptions = {}) {
    const elements = container.querySelectorAll('.rovalra-robux-icon');
    const processed = [];

    elements.forEach((element) => {
        const size =
            element.dataset.size || defaultOptions.size || DEFAULT_SIZE;
        const color =
            element.dataset.color || defaultOptions.color || DEFAULT_COLOR;
        const verticalAlign =
            element.dataset.verticalAlign ||
            defaultOptions.verticalAlign ||
            'middle';

        applyRobuxIcon(element, { size, color, verticalAlign });
        processed.push(element);
    });

    return processed;
}

export function init() {
    observeElement(
        '.rovalra-robux-icon',
        (element) => {
            if (!element.dataset.rovalraProcessed) {
                applyRobuxIcon(element);
                element.dataset.rovalraProcessed = 'true';
            }
        },
        { multiple: true },
    );

    return {
        apply: applyRobuxIcon,
        create: createRobuxIcon,
        process: () => processRobuxIcons(),
    };
}
