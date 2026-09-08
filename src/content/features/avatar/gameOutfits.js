import { observeChildren, observeElement } from '../../core/observer.js';
import { settings } from '../../core/settings/getSettings.js';
import { getAuthenticatedUserId } from '../../core/user.js';
import {
    applyOutfit,
    getCurrentAvatar,
    getOutfitDetails,
    getUserOutfits,
} from '../../core/apis/avatar.js';
import { getPlaceIdFromUrl } from '../../core/idExtractor.js';
import { setPreLaunchHook } from '../../core/utils/launcher.js';
import {
    getPlacesDetails,
    getUniversesDetails,
} from '../../core/apis/games.js';
import { createOverlay } from '../../core/ui/overlay.js';
import { createPillToggle } from '../../core/ui/general/pillToggle.js';
import { createSpinnerContainer } from '../../core/ui/spinner.js';
import { addTooltip } from '../../core/ui/tooltip.js';
import { createAssetIcon } from '../../core/ui/general/toast.js';
import {
    getBatchThumbnails,
    createThumbnailElement,
} from '../../core/thumbnail/thumbnails.js';
import { t, ts } from '../../core/locale/i18n.js';

const STORAGE_KEY = 'rovalra_game_outfits';
const EDITOR_BUTTON_CLASS = 'rovalra-game-outfits-btn';
const GAME_BUTTON_CLASS = 'rovalra-game-outfits-game-btn';
const EQUIP_TIMEOUT_MS = 1500;
const REPEAT_GUARD_MS = 5000;
const AVATAR_TYPE_TTL_MS = 30000;
const TYPE_LOOKUP_BATCH = 6;
const LAUNCH_TIMEOUT_MS = 2000;
const PLAY_BUTTON_SELECTOR =
    'button[data-testid="play-button"], .rovalra-region-button';

const SLOT_BY_AVATAR_TYPE = {
    MorphToR6: 'R6',
    MorphToR15: 'R15',
};

function loadMapping() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ [STORAGE_KEY]: {} }, (data) => {
            const stored = data?.[STORAGE_KEY];
            resolve({
                R6: stored?.R6 || null,
                R15: stored?.R15 || null,
                games:
                    stored?.games && typeof stored.games === 'object'
                        ? { ...stored.games }
                        : {},
            });
        });
    });
}

// The settings reader resolves the account first, which is slower than the play
// row appears, so storage is read straight for the first gate. The reader is
// still consulted after, in case the setting is locked.
function readEnabledFast() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ gameOutfitsEnabled: false }, (data) =>
            resolve(Boolean(data?.gameOutfitsEnabled)),
        );
    });
}

function saveMapping(mapping) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: mapping }, resolve);
    });
}

const targetCache = new Map();
let lastApplied = { outfitId: null, at: 0 };
let currentAvatarType = null;
let avatarTypeCheckedAt = 0;

function rememberAvatarType(type) {
    currentAvatarType = type || null;
    avatarTypeCheckedAt = Date.now();
}

// Trusted briefly only: the type can be changed by hand in the editor, and a
// stale value would apply the outfit against the wrong body.
function knownAvatarType() {
    return Date.now() - avatarTypeCheckedAt < AVATAR_TYPE_TTL_MS
        ? currentAvatarType
        : null;
}

// Launches can reach here twice, so the same outfit is not written twice.
async function equipOnce(outfitId) {
    if (
        lastApplied.outfitId === outfitId &&
        Date.now() - lastApplied.at < REPEAT_GUARD_MS
    ) {
        return;
    }

    lastApplied = { outfitId, at: Date.now() };

    await Promise.race([
        applyOutfit(outfitId, knownAvatarType()),
        new Promise((resolve) => setTimeout(resolve, EQUIP_TIMEOUT_MS)),
    ]);

    const details = await getOutfitDetails(outfitId).catch(() => null);
    if (details?.playerAvatarType) rememberAvatarType(details.playerAvatarType);
}

async function resolveTarget(placeId, userId) {
    const cached = targetCache.get(String(placeId));
    if (cached) return cached;

    const places = await getPlacesDetails([placeId]);
    const universeId = places?.[0]?.universeId;
    if (!universeId) return null;

    const universes = await getUniversesDetails([universeId]);
    let slot = SLOT_BY_AVATAR_TYPE[universes?.[0]?.universeAvatarType];

    // Experiences that let you pick come back without a type, and the account's
    // own setting is that pick.
    if (!slot) {
        const avatar = await getCurrentAvatar(userId);
        slot = SLOT_BY_AVATAR_TYPE[`MorphTo${avatar?.playerAvatarType}`];
    }

    const target = { universeId: String(universeId), slot: slot || null };
    targetCache.set(String(placeId), target);
    return target;
}

async function resolveOutfitForPlace(placeId, userId) {
    // Read first: with nothing set up there is no reason to ask Roblox anything.
    const mapping = await loadMapping();
    if (!mapping.R6 && !mapping.R15 && !Object.keys(mapping.games).length) {
        return null;
    }

    const target = await resolveTarget(placeId, userId);
    if (!target) return null;

    return (
        mapping.games[target.universeId] ||
        (target.slot ? mapping[target.slot] : null)
    );
}

function createOutfitCard(outfit, thumbnailData, selected, type, onPick) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'rovalra-game-outfits-card';
    if (selected) card.classList.add('rovalra-game-outfits-selected');

    const thumb = document.createElement('div');
    thumb.className = 'rovalra-game-outfits-thumb';
    if (thumbnailData) {
        thumb.appendChild(
            createThumbnailElement(thumbnailData, outfit.name, '', {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
            }),
        );
    }

    if (type) {
        const badge = document.createElement('span');
        badge.className = 'rovalra-game-outfits-badge';
        badge.textContent = type;
        thumb.appendChild(badge);
    }

    const name = document.createElement('span');
    name.className = 'rovalra-game-outfits-name';
    name.textContent = outfit.name;

    card.append(thumb, name);
    card.addEventListener('click', () => onPick(outfit.id));
    return card;
}

async function openPicker(userId, universeId) {
    const perGame = Boolean(universeId);

    const body = document.createElement('div');
    body.className = 'rovalra-game-outfits-body';

    const spinner = createSpinnerContainer();
    body.appendChild(spinner);

    createOverlay({
        title: await t(
            perGame
                ? 'avatar.gameOutfits.gameTitle'
                : 'avatar.gameOutfits.title',
        ),
        bodyContent: body,
        maxWidth: '640px',
        showLogo: true,
    });

    let mapping = await loadMapping();
    let slot = 'R6';

    const hint = document.createElement('p');
    hint.className = 'rovalra-game-outfits-hint';
    hint.textContent = await t(
        perGame ? 'avatar.gameOutfits.gameHint' : 'avatar.gameOutfits.hint',
    );

    const grid = document.createElement('div');
    grid.className = 'rovalra-game-outfits-grid';

    let outfits = [];
    let thumbnails = null;
    const typeById = new Map();
    const noneLabel = await t(
        perGame ? 'avatar.gameOutfits.useGlobal' : 'avatar.gameOutfits.none',
    );

    const selectedId = () =>
        perGame ? mapping.games[universeId] || null : mapping[slot];

    const pick = async (outfitId) => {
        if (perGame) {
            const games = { ...mapping.games };
            if (outfitId) games[universeId] = outfitId;
            else delete games[universeId];
            mapping = { ...mapping, games };
        } else {
            mapping = { ...mapping, [slot]: outfitId };
        }

        await saveMapping(mapping);
        render();
    };

    const render = () => {
        grid.replaceChildren();

        grid.appendChild(
            createOutfitCard(
                { id: null, name: noneLabel },
                null,
                !selectedId(),
                null,
                () => pick(null),
            ),
        );

        // getBatchThumbnails answers in the order it was asked, not as a map.
        outfits.forEach((outfit, index) => {
            grid.appendChild(
                createOutfitCard(
                    outfit,
                    thumbnails?.[index],
                    selectedId() === outfit.id,
                    typeById.get(outfit.id),
                    pick,
                ),
            );
        });
    };

    try {
        outfits = await getUserOutfits(userId);
        if (outfits.length > 0) {
            thumbnails = await getBatchThumbnails(
                outfits.map((outfit) => outfit.id),
                'Outfit',
                '150x150',
            ).catch(() => null);
        }
    } catch (error) {
        console.error('RoValra: Failed to load outfits', error);
    }

    // Names repeat and say nothing about the body an outfit was saved on, so the
    // type is labelled. Loaded behind the grid and reused when one is worn.
    (async () => {
        for (let i = 0; i < outfits.length; i += TYPE_LOOKUP_BATCH) {
            const batch = outfits.slice(i, i + TYPE_LOOKUP_BATCH);

            await Promise.all(
                batch.map(async (outfit) => {
                    const details = await getOutfitDetails(outfit.id).catch(
                        () => null,
                    );
                    if (details?.playerAvatarType) {
                        typeById.set(outfit.id, details.playerAvatarType);
                    }
                }),
            );

            if (!grid.isConnected) return;
            render();
        }
    })();

    spinner.remove();
    body.appendChild(hint);

    if (!perGame) {
        body.appendChild(
            createPillToggle({
                options: [
                    { text: ts('avatar.gameOutfits.r6'), value: 'R6' },
                    { text: ts('avatar.gameOutfits.r15'), value: 'R15' },
                ],
                initialValue: slot,
                onChange: (value) => {
                    slot = value;
                    render();
                },
            }),
        );
    }

    body.appendChild(grid);
    render();
}

function buildEditor(userIdPromise, register) {
    // The breadcrumb is rerendered as the editor loads, dropping anything put in
    // it. Only writes when something is missing, so it cannot loop.
    const ensure = (container) => {
        let item = container.querySelector('.rovalra-game-outfits-item');

        if (!item) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn-secondary-xs ${EDITOR_BUTTON_CLASS}`;
            button.textContent = ts('avatar.gameOutfits.button');
            button.addEventListener('click', async () => {
                const userId = await userIdPromise;
                if (userId) openPicker(userId, null);
            });

            item = document.createElement('li');
            item.className = 'rovalra-game-outfits-item';
            item.appendChild(button);
            container.appendChild(item);
        }

        // Keeps the rotator ahead of it, and only moves when out of order.
        const rotator = container
            .querySelector('.rovalra-avatar-rotator-btn')
            ?.closest('li');

        if (rotator && rotator.nextElementSibling !== item) {
            rotator.after(item);
        }
    };

    register(
        observeElement('.breadcrumb-container', (container) => {
            ensure(container);
            register(observeChildren(container, () => ensure(container)));
        }),
    );
}

async function buildGamePage(userIdPromise, register, isCurrent) {
    const placeId = getPlaceIdFromUrl();
    if (!placeId) return;

    // Not waited on, so the button lands beside the site's play button rather
    // than after the account and experience lookups.
    const targetPromise = userIdPromise
        .then((userId) => (userId ? resolveTarget(placeId, userId) : null))
        .catch((error) => {
            console.error('RoValra: Failed to read experience details', error);
            return null;
        });

    let target = null;
    let outfitId = null;
    let passthrough = false;

    const ensureButton = (container) => {
        // The row starts empty, so this waits for the play button instead of
        // sitting there alone.
        if (!container.querySelector('button[data-testid="play-button"]')) {
            return;
        }
        if (container.querySelector(`.${GAME_BUTTON_CLASS}`)) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = GAME_BUTTON_CLASS;

        const icon = createAssetIcon({
            assetName: 'outfitIcon',
            altText: '',
            width: '24px',
            height: '24px',
        });
        if (icon) button.appendChild(icon);

        addTooltip(button, ts('avatar.gameOutfits.gameTitle'));
        button.addEventListener('click', async () => {
            const [userId, resolved] = await Promise.all([
                userIdPromise,
                targetPromise,
            ]);
            if (userId && resolved) openPicker(userId, resolved.universeId);
        });

        container.appendChild(button);
    };

    // Bound to the play row, not the document, so a recommended card is not
    // handed this one's outfit. The click is given back so the site's own age
    // checks and paid access still run.
    const onClick = (event) => {
        const button = event.target.closest(PLAY_BUTTON_SELECTOR);
        if (!button || !outfitId) return;

        if (passthrough) {
            passthrough = false;
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const wanted = outfitId;

        (async () => {
            try {
                await equipOnce(wanted);
            } catch (error) {
                console.error('RoValra: Failed to equip outfit', error);
            }

            passthrough = true;
            button.click();
        })();
    };

    // Watches for the play button at any depth, as it can arrive nested.
    register(
        observeElement(
            '#game-details-play-button-container button[data-testid="play-button"]',
            (playButton) => {
                const container = playButton.closest(
                    '#game-details-play-button-container',
                );
                if (container) ensureButton(container);
            },
            { multiple: true },
        ),
    );

    register(
        observeElement(
            '#game-details-play-button-container',
            (container) => {
                ensureButton(container);
                register(
                    observeChildren(container, () => ensureButton(container)),
                );

                if (container.dataset.rovalraGameOutfits) return;
                container.dataset.rovalraGameOutfits = 'true';
                container.addEventListener('click', onClick, true);

                register({
                    disconnect: () => {
                        container.removeEventListener('click', onClick, true);
                        delete container.dataset.rovalraGameOutfits;
                    },
                });
            },
            { multiple: true },
        ),
    );

    target = await targetPromise;
    if (!target || !isCurrent()) return;

    const refreshOutfit = async () => {
        const mapping = await loadMapping();
        outfitId =
            mapping.games[target.universeId] ||
            (target.slot ? mapping[target.slot] : null);
    };

    await refreshOutfit();
    if (!isCurrent()) return;

    const onStorage = (changes, namespace) => {
        if (namespace === 'local' && changes[STORAGE_KEY]) refreshOutfit();
    };
    chrome.storage.onChanged.addListener(onStorage);
    register({
        disconnect: () => chrome.storage.onChanged.removeListener(onStorage),
    });
}

// Every launch RoValra starts goes through the launcher: experience cards,
// quick search and the rest. The site's play button is handled above.
function buildLauncherHook(userId) {
    setPreLaunchHook(async (placeId) => {
        if (!placeId) return;

        await Promise.race([
            (async () => {
                const outfitId = await resolveOutfitForPlace(placeId, userId);
                if (outfitId) await equipOnce(outfitId);
            })(),
            new Promise((resolve) => setTimeout(resolve, LAUNCH_TIMEOUT_MS)),
        ]);
    });
}

// Read ahead so a launch only pays for the writes, and the known type lets the
// R6/R15 write be skipped when it already matches.
async function warmUp(userId) {
    try {
        const avatar = await getCurrentAvatar(userId);
        rememberAvatarType(avatar?.playerAvatarType);

        const mapping = await loadMapping();
        for (const outfitId of [mapping.R6, mapping.R15]) {
            if (outfitId) getOutfitDetails(outfitId).catch(() => null);
        }
    } catch (error) {
        console.error('RoValra: Failed to prepare outfits', error);
    }
}

export function init() {
    let running = false;
    let disposers = [];

    // Bumped on stop and start so work already in flight can tell it is no
    // longer current and drop out.
    let generation = 0;

    const register = (disposer) => {
        if (disposer) disposers.push(disposer);
    };

    const stop = () => {
        if (!running) return;
        running = false;
        generation += 1;

        setPreLaunchHook(null);
        disposers.forEach((disposer) => disposer.disconnect?.());
        disposers = [];

        document
            .querySelectorAll(`.${EDITOR_BUTTON_CLASS}, .${GAME_BUTTON_CLASS}`)
            .forEach((element) =>
                (
                    element.closest('.rovalra-game-outfits-item') || element
                ).remove(),
            );
    };

    const start = async () => {
        if (running) return;
        running = true;

        const mine = (generation += 1);
        const isCurrent = () => generation === mine;

        if (!(await readEnabledFast()) || !isCurrent()) {
            if (isCurrent()) running = false;
            return;
        }

        const userIdPromise = getAuthenticatedUserId();

        const path = window.location.pathname;
        if (path.includes('/my/avatar')) buildEditor(userIdPromise, register);
        else if (path.includes('/games/')) {
            buildGamePage(userIdPromise, register, isCurrent);
        }

        const userId = await userIdPromise;
        if (!userId || !isCurrent()) {
            if (isCurrent()) running = false;
            return;
        }

        // Second look, this time through the reader that honours a lock.
        if (!(await settings.gameOutfitsEnabled)) {
            if (isCurrent()) stop();
            return;
        }
        if (!isCurrent()) return;

        buildLauncherHook(userId);
        warmUp(userId);
    };

    start();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !changes.gameOutfitsEnabled) return;
        if (changes.gameOutfitsEnabled.newValue === false) stop();
        else start();
    });
}
