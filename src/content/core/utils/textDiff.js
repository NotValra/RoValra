// Small word-level text diff, used to show what changed between two versions of a text.
// Returns a list of { type: 'equal' | 'added' | 'removed', text } segments.

const MAX_TOKENS = 1500;

function tokenize(text) {
    return String(text ?? '').match(/\s+|[^\s]+/g) || [];
}

function mergeSegments(segments) {
    const merged = [];
    for (const segment of segments) {
        if (!segment.text) continue;
        const last = merged[merged.length - 1];
        if (last && last.type === segment.type) {
            last.text += segment.text;
        } else {
            merged.push({ ...segment });
        }
    }
    return merged;
}

export function diffWords(oldText, newText) {
    const a = tokenize(oldText);
    const b = tokenize(newText);

    // Trim the common prefix and suffix so the LCS table only covers the part that changed.
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
        start++;
    }
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }

    const prefix = a.slice(0, start).join('');
    const suffix = a.slice(endA).join('');
    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);

    const middle = [];
    if (midA.length > MAX_TOKENS || midB.length > MAX_TOKENS) {
        // Too large to diff cheaply, show it as a full replacement.
        middle.push({ type: 'removed', text: midA.join('') });
        middle.push({ type: 'added', text: midB.join('') });
    } else {
        const rows = midA.length + 1;
        const cols = midB.length + 1;
        const table = new Uint16Array(rows * cols);
        for (let i = midA.length - 1; i >= 0; i--) {
            for (let j = midB.length - 1; j >= 0; j--) {
                table[i * cols + j] =
                    midA[i] === midB[j]
                        ? table[(i + 1) * cols + j + 1] + 1
                        : Math.max(
                              table[(i + 1) * cols + j],
                              table[i * cols + j + 1],
                          );
            }
        }

        let i = 0;
        let j = 0;
        while (i < midA.length && j < midB.length) {
            if (midA[i] === midB[j]) {
                middle.push({ type: 'equal', text: midA[i] });
                i++;
                j++;
            } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
                middle.push({ type: 'removed', text: midA[i++] });
            } else {
                middle.push({ type: 'added', text: midB[j++] });
            }
        }
        while (i < midA.length)
            middle.push({ type: 'removed', text: midA[i++] });
        while (j < midB.length) middle.push({ type: 'added', text: midB[j++] });
    }

    return mergeSegments([
        { type: 'equal', text: prefix },
        ...middle,
        { type: 'equal', text: suffix },
    ]);
}
