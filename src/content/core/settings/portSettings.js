import { createButton } from '../../core/ui/buttons.js';
import { sanitizeSettings } from '../utils/sanitize.js';
import { SETTINGS_CONFIG } from './settingConfig.js';
import { log, logLevel } from '../../core/logging.js';
import { getCurrentUserTier } from './handlesettings.js';
import { findSettingConfig } from './generateSettings.js';

const ROVALRA_SETTINGS_UUID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

export async function exportSettings() {
    try {
        chrome.storage.local.get('rovalra_settings', (result) => {
            if (chrome.runtime.lastError) {
                log(logLevel.ERROR,
                    'Failed to export settings:',
                    chrome.runtime.lastError
                );
                log(logLevel.CRITICAL,
                    'Error exporting settings. Check the console for details.'
                );
                return;
            }

            const allSettings = result.rovalra_settings || {};

            let sanitizedSettings;
            try {
                sanitizedSettings = sanitizeSettings(
                    allSettings,
                    SETTINGS_CONFIG,
                );
            } catch (error) {
                log(logLevel.ERROR,
                    'Failed to sanitize settings for export:',
                    error
                );
                log(logLevel.CRITICAL,
                    'Error sanitizing settings for export. Check the console for details.'
                );
                return;
            }

            const settingsToExport = {
                rovalra_uuid: ROVALRA_SETTINGS_UUID,
                settings: sanitizedSettings,
            };

            const blob = new Blob([JSON.stringify(settingsToExport, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'RoValraExportedSettings.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    } catch (error) {
        log(logLevel.ERROR, 'Error in exportSettings:', error);
        log(logLevel.CRITICAL, 'An unexpected error occurred during export.');
    }
}

export async function importSettings() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                try {
                    const content = readerEvent.target.result;
                    const importedData = JSON.parse(content);

                    if (importedData.rovalra_uuid !== ROVALRA_SETTINGS_UUID) {
                        log(logLevel.CRITICAL,
                            'This does not appear to be a valid RoValra settings file.'
                        );
                        return;
                    }

                    if (
                        importedData.settings &&
                        typeof importedData.settings === 'object'
                    ) {
                        let sanitizedSettings;
                        try {
                            sanitizedSettings = sanitizeSettings(
                                importedData.settings,
                                SETTINGS_CONFIG,
                            );
                        } catch (error) {
                            log(logLevel.ERROR,
                                'Failed to sanitize imported settings:',
                                error,
                            );
                            log(logLevel.CRITICAL,
                                'Error: The imported settings file contains invalid or potentially dangerous data.',
                            );
                            return;
                        }

                        const userTier = getCurrentUserTier();
                        for (const key in sanitizedSettings) {
                            const config = findSettingConfig(key);
                            if (config) {
                                const isDonatorLocked =
                                    config.donatorTier &&
                                    userTier < config.donatorTier;
                                if (
                                    (isDonatorLocked || config.locked) &&
                                    sanitizedSettings[key] === true
                                ) {
                                    sanitizedSettings[key] =
                                        config.default ?? false;
                                }
                            }
                        }

                        const settingsSize =
                            JSON.stringify(sanitizedSettings).length;
                        if (settingsSize > 1024 * 1024) {
                            alert(
                                'Error: Settings file is too large. Maximum size is 1MB.',
                            );
                            return;
                        }

                        chrome.storage.local.set(sanitizedSettings, () => {
                            if (chrome.runtime.lastError) {
                                log(logLevel.ERROR,
                                    'Failed to import settings:',
                                    chrome.runtime.lastError,
                                );
                                log(logLevel.CRITICAL,
                                    'Error importing settings. Check the console for details.',
                                );
                            } else {
                                chrome.storage.local.set(
                                    { rovalra_settings: sanitizedSettings },
                                    () => {
                                        location.reload();
                                    },
                                );
                            }
                        });
                    } else {
                        log(logLevel.CRITICAL, 'The settings file is malformed.');
                    }
                } catch (error) {
                    log(logLevel.ERROR,
                        'Error parsing or processing settings file:',
                        error,
                    );
                    log(logLevel.CRITICAL,
                        'Could not read the settings file. It might be corrupted or in the wrong format.',
                    );
                }
            };
            reader.readAsText(file);
        };

        input.click();
    } catch (error) {
        log(logLevel.ERROR, 'Error in importSettings:', error);
        log(logLevel.CRITICAL, 'An unexpected error occurred during import.');
    }
}

export function createExportImportButtons() {
    const exportButton = createButton('Export Settings', 'secondary', {
        id: 'export-rovalra-settings',
    });

    const importButton = createButton('Import Settings', 'secondary', {
        id: 'import-rovalra-settings',
    });

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 10px;'; //Verified
    container.appendChild(exportButton);
    container.appendChild(importButton);
    return container;
}
