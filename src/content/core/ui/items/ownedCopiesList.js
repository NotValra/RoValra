import { ts } from '../../locale/i18n.js';
import { createInteractiveTimestamp } from '../time/time.js';

function createRow(label, addTime) {
    const row = document.createElement('div');
    row.className = 'rovalra-owned-since-row';

    const header = document.createElement('div');
    header.className = 'rovalra-owned-since-row-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'rovalra-owned-since-label';
    labelEl.textContent = label;

    const value = document.createElement('span');
    value.className = 'rovalra-owned-since-value';
    value.appendChild(createInteractiveTimestamp(addTime));

    header.append(labelEl, value);
    row.appendChild(header);
    return row;
}

export function createOwnedCopyRows(copies) {
    if (copies.length === 1) {
        return [createRow(ts('ownedSince.ownedSince'), copies[0].addTime)];
    }

    return copies.map((copy, index) =>
        createRow(
            ts('ownedSince.copyOf', {
                index: index + 1,
                count: copies.length,
            }),
            copy.addTime,
        ),
    );
}
