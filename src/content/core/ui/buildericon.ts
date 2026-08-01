import DOMPurify, { safeHtml } from "../packages/dompurify";

type CSSLength = `${number}${'%'|'cap'|'ch'|'cm'|'deg'|'dpcm'|'dpi'|'dppx'|'dvb'|'dvh'|'dvi'|'dvmax'|'dvmin'|'dvw'|'em'|'ex'|'grad'|'Hz'|'ic'|'in'|'kHz'|'lh'|'lvb'|'lvh'|'lvi'|'lvmax'|'lvmin'|'lvw'|'mm'|'ms'|'pc'|'pt'|'px'|'Q'|'rad'|'rcap'|'rch'|'rem'|'rex'|'ric'|'rlh'|'s'|'svb'|'svh'|'svi'|'svmax'|'svmin'|'svw'|'turn'|'vb'|'vh'|'vi'|'vmax'|'vmin'|'vw'|'x'|'fr'|'cqb'|'cqh'|'cqi'|'cqmax'|'cqmin'|'cqw'}`;

type PresetSizes =
    'x-small'
    | 'small'
    | 'medium'
    | 'large'
    | 'x-large'
    | 'xx-large';

type PresetSizeAlias =
    'xsmall'
    | 'xs'
    | 's'
    | 'med'
    | 'm'
    | 'l'
    | 'xl'
    | 'xlarge'
    | 'xxl'
    | 'xxlarge'

type Sizes = PresetSizes | CSSLength;

interface Icon {
    icon: string,
    filled: boolean,
    size: Sizes,
}

type IconInfo =  {
    isIcon: boolean,
} & Icon;

type IconOptions = {
    filled?: boolean,
    size?: Sizes,
    classes?: string | string[]
} & Icon;

function convertAlias(alias: Sizes | PresetSizeAlias): Sizes {
    switch (alias) {
        case 'xsmall':
        case 'xs':
            return 'x-small';
        case 's':
            return 'small';
        case 'med':
        case 'm':
            return 'medium';
        case 'l':
            return 'large';
        case 'xl':
        case 'xlarge':
            return 'x-large';
        case 'xxl':
        case 'xxlarge':
            return 'xx-large';
        default:
         return alias
    }
}

export function Icon({
    icon,
    filled,
    size,
    classes,
}: IconOptions): HTMLElement {
    const iconElement = document.createElement('icon');

    if (filled)
        iconElement.toggleAttribute('filled');

    if (typeof (classes) == 'string')
        iconElement.className = classes;
    else if (typeof (classes) == 'object')
        iconElement.classList.add(...classes);

    iconElement.setAttribute('size', size ?? '1em');

    iconElement.innerHTML = DOMPurify.sanitize(icon);

    return iconElement;
}

export function GetIconInfo(icon: HTMLElement, shouldAlwaysReturnCSSLength = false): Readonly<IconInfo> {

    return {
        icon: icon.textContent,
        filled: icon.hasAttribute('filled'),
        size: shouldAlwaysReturnCSSLength ? `${icon.scrollHeight}px` : convertAlias((icon.getAttribute('size') || '1em') as PresetSizeAlias | Sizes),
        isIcon: icon.nodeName.toLowerCase() == 'icon',
    }
}
