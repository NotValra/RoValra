import { observeElement } from '../../core/observer.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { ts } from '../../core/locale/i18n.js';
import { settings } from '../../core/settings/getSettings.js';
import { createInteractiveTimestamp } from '../../core/ui/time/time.js';
import { getAvatarInventoryItem } from '../../core/utils/trackers/avatarInventory.js';

const LAST_EQUIPPED_ROW_CLASS = 'rovalra-last-equipped-row';
let isInitialized = false;
let isEnabled = true;

function createRow(lastEquipTime) {
    const row = document.createElement('div');
    row.className = `clearfix item-info-row-container ${LAST_EQUIPPED_ROW_CLASS}`;

    const label = document.createElement('div');
    label.className =
        'font-header-1 text-subheader text-label text-overflow row-label';
    label.textContent = ts('lastEquipped.label');

    const body = document.createElement('div');
    body.className = 'font-body text wait-for-i18n-format-render';

    const timestampContainer = document.createElement('span');
    timestampContainer.appendChild(createInteractiveTimestamp(lastEquipTime));
    body.appendChild(timestampContainer);

    row.append(label, body);

    return row;
}

async function updateLastEquippedRow(priceRow) {
    if (!priceRow?.parentNode) return;

    const itemId = getPlaceIdFromUrl();
    if (!itemId) return;

    const parent = priceRow.parentNode;
    const existingRow = parent.querySelector(`.${LAST_EQUIPPED_ROW_CLASS}`);

    if (!isEnabled) {
        existingRow?.remove();
        return;
    }

    const item = await getAvatarInventoryItem(itemId);
    if (!priceRow.isConnected || String(getPlaceIdFromUrl()) !== String(itemId))
        return;

    const lastEquipTime = item?.lastEquipTime;

    if (!lastEquipTime) {
        existingRow?.remove();
        return;
    }

    if (existingRow?.dataset.rovalraLastEquippedTime === lastEquipTime) return;

    const row = createRow(lastEquipTime);
    row.dataset.rovalraLastEquippedItemId = String(itemId);
    row.dataset.rovalraLastEquippedTime = lastEquipTime;

    if (existingRow) {
        existingRow.replaceWith(row);
    } else if (priceRow.nextSibling) {
        parent.insertBefore(row, priceRow.nextSibling);
    } else {
        parent.appendChild(row);
    }
}

function updateCurrentItemPage() {
    const priceRow = document.querySelector('#item-details .price-row-container');
    if (priceRow) updateLastEquippedRow(priceRow);
}

export async function init() {
    if (isInitialized) return;
    isInitialized = true;
    isEnabled = (await settings.lastEquippedEnabled) !== false;

    observeElement(
        '#item-details .price-row-container',
        (priceRow) => {
            updateLastEquippedRow(priceRow);
        },
        { multiple: true },
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes.lastEquippedEnabled) {
            isEnabled = changes.lastEquippedEnabled.newValue !== false;
            updateCurrentItemPage();
            return;
        }

        if (!changes.rovalra_avatar_inventory_v1)
            return;

        updateCurrentItemPage();
    });
}
