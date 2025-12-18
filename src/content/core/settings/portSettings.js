import { createButton } from '../../core/ui/buttons.js';
import { sanitizeSettings } from '../utils/sanitize.js';
import { SETTINGS_CONFIG } from './settingConfig.js';

const ROVALRA_SETTINGS_UUID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';


export async function exportSettings() {
    try {
        chrome.storage.local.get('rovalra_settings', (result) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to export settings:', chrome.runtime.lastError);
                alert('Error exporting settings. Check the console for details.');
                return;
            }

            const allSettings = result.rovalra_settings || {};

            let sanitizedSettings;
            try {
                sanitizedSettings = sanitizeSettings(allSettings, SETTINGS_CONFIG);
            } catch (error) {
                console.error('Failed to sanitize settings for export:', error);
                alert('Error sanitizing settings for export. Check the console for details.');
                return;
            }

            const settingsToExport = {
                rovalra_uuid: ROVALRA_SETTINGS_UUID,
                settings: sanitizedSettings
            };

            const blob = new Blob([JSON.stringify(settingsToExport, null, 2)], { type: 'application/json' });
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
        console.error('Error in exportSettings:', error);
        alert('An unexpected error occurred during export.');
    }
}


export async function importSettings() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = readerEvent => {
                try {
                    const content = readerEvent.target.result;
                    const importedData = JSON.parse(content);

                    if (importedData.rovalra_uuid !== ROVALRA_SETTINGS_UUID) {
                        alert('This does not appear to be a valid RoValra settings file.');
                        return;
                    }

                    if (importedData.settings && typeof importedData.settings === 'object') {
                        let sanitizedSettings;
                        try {
                            sanitizedSettings = sanitizeSettings(importedData.settings, SETTINGS_CONFIG);
                        } catch (error) {
                            console.error('Failed to sanitize imported settings:', error);
                            alert('Error: The imported settings file contains invalid or potentially dangerous data.');
                            return;
                        }

                        const settingsSize = JSON.stringify(sanitizedSettings).length;
                        if (settingsSize > 1024 * 1024) { 
                            alert('Error: Settings file is too large. Maximum size is 1MB.');
                            return;
                        }

                        chrome.storage.local.set(sanitizedSettings, () => {
                            if (chrome.runtime.lastError) {
                                console.error('Failed to import settings:', chrome.runtime.lastError);
                                alert('Error importing settings. Check the console for details.');
                            } else {
                                chrome.storage.local.set({ rovalra_settings: sanitizedSettings }, () => {
                                    location.reload(); 
                                });
                            }
                        });
                    } else {
                        alert('The settings file is malformed.');
                    }
                } catch (error) {
                    console.error('Error parsing or processing settings file:', error);
                    alert('Could not read the settings file. It might be corrupted or in the wrong format.');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    } catch (error) {
        console.error('Error in importSettings:', error);
        alert('An unexpected error occurred during import.');
    }
}


export function createExportImportButtons() {
    const exportButton = createButton('Export Settings', 'secondary', {
        id: 'export-rovalra-settings'
    });

    const importButton = createButton('Import Settings', 'secondary', {
        id: 'import-rovalra-settings'
    });

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 10px;'; 
    container.appendChild(exportButton);
    container.appendChild(importButton);
    return container;
}