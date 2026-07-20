import { createButton } from '../../core/ui/buttons.js';
import { sanitizeSettings } from '../utils/sanitize.js';
import { SETTINGS_CONFIG } from './settingConfig.js';
import { getCurrentUserTier } from './handlesettings.js';
import { findSettingConfig } from './generateSettings.js';
import { showSystemAlert } from '../ui/roblox/alert.js';

const ROVALRA_SETTINGS_UUID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
const PROFILE_NOTES_EXPORT_UUID = 'rovalra-notes';
const PROFILE_NOTES_LEGACY_EXPORT_UUIDS = new Set(['rovalra-profile-notes-v1']);
const PROFILE_NOTES_SETTING_NAME = 'profileNotesEnabled';
const PROFILE_NOTES_STORAGE_KEY = 'rovalra_profile_notes';
const PROFILE_NOTES_MAX_LENGTH = 256;
const PROFILE_NOTES_MAX_FILE_SIZE = 1024 * 1024;
const PROFILE_NOTES_MAX_COUNT = 10000;

function normalizeProfileNotes(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const normalized = {};
    for (const [userId, rawNote] of Object.entries(value).slice(
        0,
        PROFILE_NOTES_MAX_COUNT,
    )) {
        if (!/^\d{1,20}$/.test(userId) || typeof rawNote !== 'string') {
            continue;
        }

        const note = rawNote
            .replace(/\r\n?/g, '\n')
            .trim()
            .slice(0, PROFILE_NOTES_MAX_LENGTH);
        if (note) normalized[userId] = note;
    }

    return normalized;
}

async function profileNotesAreEnabled() {
    const settings = await chrome.storage.local.get({
        [PROFILE_NOTES_SETTING_NAME]: true,
    });
    return settings[PROFILE_NOTES_SETTING_NAME] === true;
}

async function requireProfileNotesEnabled() {
    if (await profileNotesAreEnabled()) return true;

    showSystemAlert(
        'Enable Profile Notes before importing or exporting notes.',
        'warning',
    );
    return false;
}

function downloadJsonFile(fileName, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportProfileNotes() {
    try {
        if (!(await requireProfileNotesEnabled())) return;

        const stored = await chrome.storage.local.get({
            [PROFILE_NOTES_STORAGE_KEY]: {},
        });
        const notes = normalizeProfileNotes(stored[PROFILE_NOTES_STORAGE_KEY]);

        downloadJsonFile('RoValraProfileNotes.json', {
            rovalra_uuid: PROFILE_NOTES_EXPORT_UUID,
            version: 1,
            exported_at: new Date().toISOString(),
            notes,
        });

        const count = Object.keys(notes).length;
        showSystemAlert(
            `Exported ${count} profile ${count === 1 ? 'note' : 'notes'}.`,
            'success',
        );
    } catch (error) {
        console.error('RoValra: Failed to export profile notes.', error);
        showSystemAlert('Profile notes could not be exported.', 'warning');
    }
}

export async function importProfileNotes() {
    try {
        if (!(await requireProfileNotesEnabled())) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.addEventListener(
            'change',
            async () => {
                const file = input.files?.[0];
                if (!file) return;

                if (file.size > PROFILE_NOTES_MAX_FILE_SIZE) {
                    showSystemAlert(
                        'The profile notes backup is too large.',
                        'warning',
                    );
                    return;
                }

                try {
                    const importedData = JSON.parse(await file.text());
                    if (
                        (importedData?.rovalra_uuid !==
                            PROFILE_NOTES_EXPORT_UUID &&
                            !PROFILE_NOTES_LEGACY_EXPORT_UUIDS.has(
                                importedData?.rovalra_uuid,
                            )) ||
                        !importedData.notes ||
                        typeof importedData.notes !== 'object' ||
                        Array.isArray(importedData.notes)
                    ) {
                        showSystemAlert(
                            'This is not a valid RoValra profile notes backup.',
                            'warning',
                        );
                        return;
                    }

                    const importedNotes = normalizeProfileNotes(
                        importedData.notes,
                    );
                    const stored = await chrome.storage.local.get({
                        [PROFILE_NOTES_STORAGE_KEY]: {},
                    });
                    const existingNotes = normalizeProfileNotes(
                        stored[PROFILE_NOTES_STORAGE_KEY],
                    );

                    await chrome.storage.local.set({
                        [PROFILE_NOTES_STORAGE_KEY]: {
                            ...existingNotes,
                            ...importedNotes,
                        },
                    });

                    const count = Object.keys(importedNotes).length;
                    showSystemAlert(
                        `Imported ${count} profile ${count === 1 ? 'note' : 'notes'}.`,
                        'success',
                    );
                } catch (error) {
                    console.error(
                        'RoValra: Failed to import profile notes.',
                        error,
                    );
                    showSystemAlert(
                        'The profile notes backup could not be read.',
                        'warning',
                    );
                }
            },
            { once: true },
        );

        input.click();
    } catch (error) {
        console.error('RoValra: Failed to import profile notes.', error);
        showSystemAlert('Profile notes could not be imported.', 'warning');
    }
}

export async function exportSettings() {
    try {
        chrome.storage.local.get('rovalra_settings', (result) => {
            if (chrome.runtime.lastError) {
                console.error(
                    'Failed to export settings:',
                    chrome.runtime.lastError,
                );
                alert(
                    'Error exporting settings. Check the console for details.',
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
                console.error('Failed to sanitize settings for export:', error);
                alert(
                    'Error sanitizing settings for export. Check the console for details.',
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
        console.error('Error in exportSettings:', error);
        alert('An unexpected error occurred during export.');
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
                        alert(
                            'This does not appear to be a valid RoValra settings file.',
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
                            console.error(
                                'Failed to sanitize imported settings:',
                                error,
                            );
                            alert(
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
                                console.error(
                                    'Failed to import settings:',
                                    chrome.runtime.lastError,
                                );
                                alert(
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
                        alert('The settings file is malformed.');
                    }
                } catch (error) {
                    console.error(
                        'Error parsing or processing settings file:',
                        error,
                    );
                    alert(
                        'Could not read the settings file. It might be corrupted or in the wrong format.',
                    );
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
