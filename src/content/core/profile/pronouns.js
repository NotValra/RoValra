import {
    registerProfileEditCategory,
    registerProfileEditFeature,
} from './profileEditRegistry.js';
import { ts } from '../locale/i18n.js';

export const PROFILE_PRONOUNS_MAX_LENGTH = 15;

const NON_PRONOUN_CHARACTER_SEQUENCE =
    // Emoji modifiers, variation selectors, and joiners are intentionally
    // allowed together so a complete emoji is never treated as punctuation.
    // eslint-disable-next-line no-misleading-character-class
    /[^\p{L}\p{M}\p{N}\p{Zs}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0E\uFE0F\u{1F1E6}-\u{1F1FF}]+/gu;

const graphemeSegmenter =
    typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;

function getGraphemes(value) {
    if (graphemeSegmenter) {
        return Array.from(graphemeSegmenter.segment(value), (item) =>
            String(item.segment),
        );
    }
    return Array.from(value);
}

export function replacePronounSpecialCharacters(value) {
    if (typeof value !== 'string') return value;
    return value.replace(NON_PRONOUN_CHARACTER_SEQUENCE, '|');
}

export function truncateProfilePronouns(
    value,
    maxLength = PROFILE_PRONOUNS_MAX_LENGTH,
) {
    if (typeof value !== 'string') return value;
    return getGraphemes(value).slice(0, maxLength).join('');
}

export function getProfilePronounsLength(value) {
    if (typeof value !== 'string') return 0;
    return getGraphemes(value).length;
}

export function normalizeProfilePronouns(value) {
    if (value === null || value === undefined) return null;

    const normalized = truncateProfilePronouns(
        replacePronounSpecialCharacters(String(value).trim()),
    );
    return normalized || null;
}

registerProfileEditCategory({ id: 'rovalra', label: 'RoValra Features' });
registerProfileEditFeature('rovalra', {
    id: 'profilePronouns',
    label: ts('profileEdit.profilePronouns'),
    labelKey: 'profileEdit.profilePronouns',
    settingName: 'profilePronouns',
    getValue: async () => {
        const { loadSettings } = await import('../settings/handlesettings.js');
        const settings = await loadSettings();
        return settings?.profilePronouns;
    },
    onOpen: async () => {
        const [
            { loadSettings },
            { generateSingleSettingHTML },
            { SETTINGS_CONFIG },
        ] = await Promise.all([
            import('../settings/handlesettings.js'),
            import('../settings/generateSettings.js'),
            import('../settings/settingConfig.js'),
        ]);
        const body = document.createElement('div');
        body.style.cssText = 'color:var(--rovalra-main-text-color);';
        const setting = {
            label: ts('profileEdit.profilePronouns'),
            description:
                SETTINGS_CONFIG.Profile.settings.profilePronouns.description,
            type: 'input',
            placeholder: ts('profileEdit.pronounsPlaceholder'),
            maxLength: PROFILE_PRONOUNS_MAX_LENGTH,
            showCharacterCount: true,
            useGraphemeLength: true,
            trim: true,
            replaceSpecialCharactersWithPipe: true,
            agreementKey: 'rovalra_pronouns_guidelines_agreed',
            hideContributors: true,
        };
        const settingElement = generateSingleSettingHTML(
            'profilePronouns',
            setting,
        );
        settingElement.classList.add('rovalra-profile-pronouns-editor');
        body.appendChild(settingElement);
        const settings = await loadSettings().catch(() => null);
        const input = settingElement.querySelector('#profilePronouns');
        if (input) {
            input.value = settings?.profilePronouns || '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return {
            title: ts('profileEdit.featuresTitle'),
            bodyContent: body,
            showLogo: true,
            maxWidth: '600px',
            titleFontSize: '22px',
        };
    },
});
