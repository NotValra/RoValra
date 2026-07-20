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
