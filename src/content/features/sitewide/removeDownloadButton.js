import { observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';

export async function init() {
    if (!(await settings.removeDownloadButton)) return;
    observeElement(
        '.navbar-download-app-item',
        (el) => {
            el.remove();
        },
        { multiple: false },
    );
}