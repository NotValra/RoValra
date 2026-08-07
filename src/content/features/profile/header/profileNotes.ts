import { getUserIdFromUrl } from '../../../core/idExtractor.js';
import { observeElement } from '../../../core/observer.js';
import { getAuthenticatedUserId } from '../../../core/user.js';
import { createStyledInput } from '../../../core/ui/catalog/input.js';
import { ts } from '../../../core/locale/i18n.js';
import { CreateIndexedDB, CreateObjectStore, LoadObjectStore, WithIndexDB } from '../../../core/indexeddb/getdb.js';

type Notes = Map<bigint, string>;

const PROFILE_NOTES_SETTING_NAME = 'profileNotesEnabled';
const PROFILE_NOTES_STORAGE_KEY = 'RoValra:ProfileNotes';
const IDB_OBJECT_STORE = 'pf-notes';
const OBJSTORE_CONFIG = {
    persistence: "relaxed" as IDBTransactionDurability ,
    primaryKey: "uid"
}
const PROFILE_ACTION_BUTTON_SELECTOR =
    '#user-profile-header-contextual-menu-button';
const MAX_NOTE_LENGTH = 256;
const MAX_NOTE_ROWS = 2;

let actionButtonObserver = null;
let activeController = null;
let activeProfileUserId: bigint = 0n;
let initGeneration = 0;
let storageListenerStarted = false;

function normalizeNote(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE_LENGTH);
}

function normalizeNotesMap(value: unknown): Notes {
    return value instanceof Map
        ? value
        : new Map<bigint, string>();
}

async function loadNotesFromStorage(): Promise<Notes> {
    type RawStored = Array<{note: string, uid: string}>;
    const rows: RawStored = await WithIndexDB(PROFILE_NOTES_STORAGE_KEY, async (db) => {
        const objstore = LoadObjectStore(db, IDB_OBJECT_STORE);
        return await objstore.ReadStore();
    });
    let map = new Map();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        map.set(BigInt(row.uid), String(row.note ?? ""));
    }
    return map;
}

async function getStoredNotes(): Promise<Notes> {
    const stored = await loadNotesFromStorage();
    return normalizeNotesMap(stored);
}

async function getStoredNote(userId: bigint | string) {
    userId = BigInt(userId);
    const notes = await getStoredNotes();
    return normalizeNote(notes.get(userId));
}

async function saveStoredNote(userId: bigint | string, note: string) {
    const key = String(userId);
    const normalizedNote = normalizeNote(note);

    await WithIndexDB(PROFILE_NOTES_STORAGE_KEY, async (db) => {
        const objstore = LoadObjectStore(db, IDB_OBJECT_STORE);
        objstore.Configure(OBJSTORE_CONFIG);
        if (normalizedNote) {
            if (await objstore.ReadRow(key)) {
                await objstore.MutateRow({ note: normalizedNote }, key);
            } else {
                await objstore.AddDataRaw(
                    {
                        note: normalizedNote,
                        uid: key
                    }
                );
            }
        } else {
            await objstore.DeleteRow(key);
        }
    });

    onEdit();  // let this run in the background

    return normalizedNote;
}

function createProfileNoteLayoutController(card, host) {
    const baseOffset = 14;
    const collisionGap = 10;
    const observedElements = new Set();
    let animationFrame = null;

    const overlay =
        host.closest('.profile-header-overlay') ||
        document.querySelector('.profile-header-overlay');

    function scheduleLayout() {
        if (animationFrame !== null) return;
        animationFrame = requestAnimationFrame(updateLayout);
    }

    const resizeObserver =
        typeof ResizeObserver === 'function'
            ? new ResizeObserver(scheduleLayout)
            : null;

    function observeForResize(element) {
        if (!resizeObserver || !element || observedElements.has(element)) {
            return;
        }
        observedElements.add(element);
        resizeObserver.observe(element);
    }

    function updateLayout() {
        animationFrame = null;
        if (!card.isConnected || !host.isConnected) return;

        const hostRect = host.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const candidateRoot = overlay?.isConnected ? overlay : document;
        let requiredOffset = baseOffset;

        candidateRoot
            .querySelectorAll(
                '.content-action-utility, .rovalra-last-online-pill, .rovalra-last-played-pill',
            )
            .forEach((candidate) => {
                if (
                    candidate === card ||
                    host.contains(candidate) ||
                    card.contains(candidate) ||
                    candidate.contains(host)
                ) {
                    return;
                }

                observeForResize(candidate);
                const candidateRect = candidate.getBoundingClientRect();
                if (
                    candidateRect.width === 0 ||
                    candidateRect.height === 0 ||
                    candidateRect.bottom <= hostRect.bottom + 1 ||
                    candidateRect.top > hostRect.bottom + 96
                ) {
                    return;
                }

                const overlapsHorizontally =
                    cardRect.left < candidateRect.right + 4 &&
                    cardRect.right > candidateRect.left - 4;
                if (!overlapsHorizontally) return;

                requiredOffset = Math.max(
                    requiredOffset,
                    Math.ceil(
                        candidateRect.bottom - hostRect.bottom + collisionGap,
                    ),
                );
            });

        card.style.setProperty(
            '--rovalra-profile-note-offset',
            `${requiredOffset}px`,
        );
    }

    observeForResize(host);
    observeForResize(card);

    const mutationObserver = overlay
        ? new MutationObserver(scheduleLayout)
        : null;
    mutationObserver?.observe(overlay, {
        childList: true,
        subtree: true,
    });

    window.addEventListener('resize', scheduleLayout, { passive: true });
    scheduleLayout();

    return {
        destroy() {
            if (animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            mutationObserver?.disconnect();
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleLayout);
        },
    };
}

function createProfileNoteController(host, userId, initialNote) {
    const card = document.createElement('section');
    card.className = 'rovalra-profile-note-card';
    card.dataset.profileUserId = String(userId);
    card.setAttribute('aria-label', ts('profileNotes.ariaLabel'));

    const heading = document.createElement('div');
    heading.className = 'rovalra-profile-note-heading';
    heading.textContent = ts('profileNotes.heading');
    heading.title = ts('profileNotes.headingTooltip');

    const editorHost = document.createElement('div');
    editorHost.className = 'rovalra-profile-note-editor-host';

    card.append(heading, editorHost);
    host.classList.add('rovalra-profile-note-host');
    host.appendChild(card);
    const layoutController = createProfileNoteLayoutController(card, host);

    let currentNote = normalizeNote(initialNote);
    let editing = false;

    const renderDisplay = () => {
        editorHost.replaceChildren();

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
                ? ts('profileNotes.editAriaLabel')
                : ts('profileNotes.addAriaLabel'),
        );
        display.title = ts('profileNotes.displayTooltip');
        display.addEventListener('click', startEditing);

        editorHost.appendChild(display);
    };

    const finishEditing = async (textarea, shouldSave) => {
        if (!editing) return;
        editing = false;
        card.classList.remove('rovalra-profile-note-editing');

        const previousNote = currentNote;
        const nextNote = normalizeNote(textarea.value);

        if (!shouldSave || nextNote === previousNote) {
            renderDisplay();
            return;
        }

        currentNote = nextNote;
        renderDisplay();

        try {
            currentNote = await saveStoredNote(userId, nextNote);
            if (card.isConnected) renderDisplay();
        } catch (error) {
            currentNote = previousNote;
            if (card.isConnected) renderDisplay();
            console.warn(
                'RoValra: Failed to save the private profile note.',
                error,
            );
        }
    };

    function startEditing() {
        if (editing || !card.isConnected) return;
        editing = true;
        card.classList.add('rovalra-profile-note-editing');

        const { container: inputContainer, input: textarea } =
            createStyledInput({
                id: `rovalra-profile-note-${userId}`,
                label: ts('profileNotes.ariaLabel'),
                placeholder: ts('profileNotes.inputPlaceholder'),
                value: currentNote,
                multiline: true,
            });
        textarea.maxLength = MAX_NOTE_LENGTH;
        textarea.rows = MAX_NOTE_ROWS;
        textarea.classList.add('rovalra-profile-note-input');
        textarea.setAttribute('aria-label', ts('profileNotes.ariaLabel'));
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
                return;
            }

            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                textarea.blur();
            }
        });

        editorHost.replaceChildren(inputContainer);
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
            if (!editing && card.isConnected) renderDisplay();
        },
        destroy() {
            layoutController.destroy();
            card.remove();
            if (!host.querySelector(':scope > .rovalra-profile-note-card')) {
                host.classList.remove('rovalra-profile-note-host');
            }
        },
    };
}

function removeActiveNote() {
    activeController?.destroy();
    activeController = null;

    document
        .querySelectorAll('.rovalra-profile-note-card')
        .forEach((card) => card.remove());
    document
        .querySelectorAll('.rovalra-profile-note-host')
        .forEach((host) => host.classList.remove('rovalra-profile-note-host'));
}

async function mountProfileNote(actionButton, userId, generation) {
    const host = actionButton?.parentElement;
    if (!host) return;

    const note = await getStoredNote(userId);
    if (
        generation !== initGeneration ||
        activeProfileUserId !== BigInt(userId) ||
        String(getUserIdFromUrl()) !== String(userId) ||
        !host.isConnected
    ) {
        return;
    }

    if (
        activeController?.card?.isConnected &&
        activeController.card.parentElement === host
    ) {
        activeController.setNote(note);
        return;
    }

    removeActiveNote();
    activeController = createProfileNoteController(host, userId, note);
}

async function initProfileNotes() {
    const generation = ++initGeneration;
    actionButtonObserver?.disconnect();
    actionButtonObserver = null;
    removeActiveNote();

    const userId = Number(getUserIdFromUrl());
    activeProfileUserId = userId ? BigInt(userId) : 0n;
    if (!userId) return;

    const [settings, authenticatedUserId] = await Promise.all([
        chrome.storage.local.get({
            [PROFILE_NOTES_SETTING_NAME]: true,
        }),
        getAuthenticatedUserId(),
    ]);
    if (
        generation !== initGeneration ||
        settings[PROFILE_NOTES_SETTING_NAME] !== true ||
        String(authenticatedUserId) === String(userId)
    ) {
        return;
    }

    actionButtonObserver = observeElement(
        PROFILE_ACTION_BUTTON_SELECTOR,
        (button) => mountProfileNote(button, userId, generation),
    );
}

async function onEdit() {
    const notes = await getStoredNotes();
    activeController?.setNote(notes.get(activeProfileUserId));
}

function startStorageListener() {
    if (storageListenerStarted) return;
    storageListenerStarted = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
        (async () => {
            if (areaName !== 'local') return;

            if (changes[PROFILE_NOTES_SETTING_NAME]) {
                initProfileNotes();
                return;
            }
        })();
    });
}

async function initdb() {
    await CreateIndexedDB(PROFILE_NOTES_STORAGE_KEY, 2, {
        onUpgrade: (request: IDBOpenDBRequest, event) => { }
    })
}

export async function init() {
    await initdb();
    startStorageListener();
    initProfileNotes();
}
