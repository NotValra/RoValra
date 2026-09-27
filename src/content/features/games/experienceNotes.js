import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { observeElement } from '../../core/observer.js';
import { callRobloxApiJson } from '../../core/api.js';
import { createStyledInput } from '../../core/ui/catalog/input.js';
import { ts } from '../../core/locale/i18n.js';

const SETTING_NAME = 'experienceNotesEnabled';
const STORAGE_KEY = 'rovalra_experience_notes';
const MAX_NOTE_LENGTH = 256;
const MAX_NOTE_ROWS = 2;
const CARD_CLASS = 'rovalra-experience-note-card';

let activeUniverseId = null;
let activeCard = null;
let storageListenerStarted = false;

function normalizeNote(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE_LENGTH);
}

function normalizeNotesMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}

async function getStoredNotes() {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
    return normalizeNotesMap(stored[STORAGE_KEY]);
}

async function saveStoredNote(universeId, note) {
    const notes = { ...(await getStoredNotes()) };
    const normalizedNote = normalizeNote(note);
    if (normalizedNote) {
        notes[universeId] = normalizedNote;
    } else {
        delete notes[universeId];
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: notes });
    return normalizedNote;
}

// Notes are keyed by universe so one note covers every place of the game.
async function getUniverseId() {
    const fromPage = document.querySelector('#game-detail-meta-data')?.dataset
        ?.universeId;
    if (fromPage) return String(fromPage);

    const placeId = getPlaceIdFromUrl();
    if (!placeId) return null;
    const data = await callRobloxApiJson({
        subdomain: 'apis',
        endpoint: `/universes/v1/places/${placeId}/universe`,
    });
    return data?.universeId ? String(data.universeId) : null;
}

// Same markup and inner classes as Profile Notes, so both look identical.
function createNoteCard(universeId, initialNote) {
    const card = document.createElement('section');
    card.className = CARD_CLASS;
    card.setAttribute('aria-label', ts('experienceNotes.ariaLabel'));

    const heading = document.createElement('div');
    heading.className = 'rovalra-profile-note-heading';
    heading.textContent = ts('profileNotes.heading');
    heading.title = ts('profileNotes.headingTooltip');

    const editorHost = document.createElement('div');
    editorHost.className = 'rovalra-profile-note-editor-host';
    card.append(heading, editorHost);

    let currentNote = normalizeNote(initialNote);
    let editing = false;

    const renderDisplay = () => {
        const display = document.createElement('button');
        display.type = 'button';
        display.className = 'rovalra-profile-note-display';
        display.classList.toggle(
            'rovalra-profile-note-placeholder',
            !currentNote,
        );
        display.textContent = currentNote || ts('profileNotes.addNote');
        display.setAttribute(
            'aria-label',
            currentNote
                ? ts('experienceNotes.editAriaLabel')
                : ts('experienceNotes.addAriaLabel'),
        );
        display.title = ts('profileNotes.displayTooltip');
        display.addEventListener('click', startEditing);
        editorHost.replaceChildren(display);
    };

    const finishEditing = async (textarea, shouldSave) => {
        if (!editing) return;
        editing = false;

        const previousNote = currentNote;
        const nextNote = normalizeNote(textarea.value);
        if (!shouldSave || nextNote === previousNote) {
            renderDisplay();
            return;
        }

        currentNote = nextNote;
        renderDisplay();
        try {
            currentNote = await saveStoredNote(universeId, nextNote);
        } catch (error) {
            currentNote = previousNote;
            console.warn('RoValra: Failed to save the experience note.', error);
        }
        if (card.isConnected) renderDisplay();
    };

    function startEditing() {
        if (editing || !card.isConnected) return;
        editing = true;

        const { container, input: textarea } = createStyledInput({
            id: `rovalra-experience-note-${universeId}`,
            label: ts('experienceNotes.ariaLabel'),
            placeholder: ts('profileNotes.inputPlaceholder'),
            value: currentNote,
            multiline: true,
        });
        textarea.maxLength = MAX_NOTE_LENGTH;
        textarea.rows = MAX_NOTE_ROWS;
        textarea.classList.add('rovalra-profile-note-input');
        textarea.title = ts('profileNotes.inputTooltip');

        let shouldSave = true;
        textarea.addEventListener(
            'blur',
            () => finishEditing(textarea, shouldSave),
            { once: true },
        );
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                shouldSave = false;
                textarea.blur();
            } else if (
                event.key === 'Enter' &&
                (event.ctrlKey || event.metaKey)
            ) {
                event.preventDefault();
                textarea.blur();
            }
        });

        editorHost.replaceChildren(container);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(
                textarea.value.length,
                textarea.value.length,
            );
        });
    }

    renderDisplay();

    return {
        card,
        setNote(note) {
            currentNote = normalizeNote(note);
            if (!editing) renderDisplay();
        },
    };
}

function startStorageListener() {
    if (storageListenerStarted) return;
    storageListenerStarted = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !activeUniverseId) return;
        if (changes[SETTING_NAME]?.newValue === false) {
            activeCard?.card.remove();
            activeCard = null;
            return;
        }
        if (!changes[STORAGE_KEY]) return;
        const notes = normalizeNotesMap(changes[STORAGE_KEY].newValue);
        activeCard?.setNote(notes[activeUniverseId]);
    });
}

async function initExperienceNotes() {
    const settings = await chrome.storage.local.get({ [SETTING_NAME]: true });
    if (settings[SETTING_NAME] !== true) return;

    const universeId = await getUniverseId();
    if (!universeId) return;
    activeUniverseId = universeId;

    const notes = await getStoredNotes();
    activeCard = createNoteCard(universeId, notes[universeId]);
    startStorageListener();

    // The card sits in the right-hand column, after Play and the
    // favorite, notify and vote row, like the note under Add Friend on
    // profiles.
    observeElement(
        '.game-calls-to-action > .game-buttons-container',
        (buttons) => {
            if (activeCard.card.previousElementSibling === buttons) return;
            buttons.after(activeCard.card);
        },
        { multiple: true },
    );
}

export function init() {
    initExperienceNotes().catch((error) =>
        console.warn('RoValra: Failed to start experience notes.', error),
    );
}
