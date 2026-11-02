import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';

export async function init() {
    if (!(await settings.removeDownloadButton)) return;
    observeElement(
        '.download-app-nav-item',
        (el) => {
            el.remove();
        },
        { multiple: false },
    );
}