import { createPill } from '../../ui/general/pill.js';
import { getAssets } from '../../assets.js';

const COLORS = {
    POSITIVE: '#00b06f',
    NEGATIVE: '#d43f3a',
    NEUTRAL: '',
    TEXT_WHITE: '#fff',
    TEXT_DEFAULT: '',
};

function getDiffData(diff, baseValue) {
    let percentText = '';
    if (baseValue && baseValue > 0) {
        const percent = (diff / baseValue) * 100;
        const sign = diff > 0 ? '+' : '';
        percentText = ` (${sign}${percent.toFixed(2)}%)`;
    }

    const text = (diff > 0 ? '+' : '') + diff.toLocaleString() + percentText;
    const bgColor =
        diff > 0
            ? COLORS.POSITIVE
            : diff < 0
              ? COLORS.NEGATIVE
              : COLORS.NEUTRAL;
    const textColor = diff === 0 ? COLORS.TEXT_DEFAULT : COLORS.TEXT_WHITE;
    return { text, bgColor, textColor };
}

export function createRapDiffPill(
    diff,
    baseValue,
    styles = {},
    iconStyles = {},
) {
    const { text, bgColor, textColor } = getDiffData(diff, baseValue);
    const pill = createPill(text, 'RAP Difference');

    Object.assign(pill.style, {
        backgroundColor: bgColor,
        color: textColor,
        fontWeight: '700',
        border: 'none',
        margin: '0',
        ...styles,
    });

    const span = pill.querySelector('span');
    if (span) {
        span.style.display = 'flex';
        span.style.alignItems = 'center';

        const icon = document.createElement('span');
        icon.className = 'icon-robux-16x16';
        icon.style.marginRight = '4px';
        icon.style.filter = 'brightness(0) invert(1)';

        Object.assign(icon.style, iconStyles);

        span.prepend(icon);
    }
    return pill;
}

export function createValueDiffPill(
    diff,
    baseValue,
    styles = {},
    iconStyles = {},
) {
    const { text, bgColor, textColor } = getDiffData(diff, baseValue);
    const pill = createPill(text, 'Value Difference');
    const assets = getAssets();

    Object.assign(pill.style, {
        backgroundColor: bgColor,
        color: textColor,
        fontWeight: '700',
        border: 'none',
        margin: '0',
        ...styles,
    });

    const span = pill.querySelector('span');
    if (span) {
        span.style.display = 'flex';
        span.style.alignItems = 'center';

        const img = document.createElement('img');
        img.src = assets.rolimonsIcon;
        img.style.width = '16px';
        img.style.height = '16px';
        img.style.marginRight = '4px';

        Object.assign(img.style, iconStyles);

        span.prepend(img);
    }
    return pill;
}
