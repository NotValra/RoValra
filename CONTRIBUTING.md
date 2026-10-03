# Contributing to RoValra

This is a guide on how to contribute to RoValra

## Getting Started

1.  **Fork the repository** and clone it locally.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and ensure they work as expected.
4.  Submit a Pull Request (PR) following the [Pull Request Guidelines](#pull-request-guidelines) below.

## Pull Request Guidelines

Every PR needs a clear description of what it does. Depending on the type of PR, please also include the following:

### New features

- **Include screenshots** (or a short video/GIF for anything interactive) showing the feature in action.
- If the feature changes existing UI, include a before and after screenshot.
- Briefly explain what the feature does and why it is useful.

### Bug fixes

Describe the fix in detail. Please include:

- **What the bug was:** what was happening and what should have happened instead.
- **How to reproduce it:** the steps, page, or settings needed to trigger the bug.
- **What caused it:** the root cause of the bug.
- **How it was fixed:** what you changed and why that fixes it.
- A link to the related issue if there is one.
- Screenshots of before and after are appreciated if the bug is visual.

PRs without screenshots for new features, or without a proper description for bug fixes, may take longer to review or be closed.

## Adding Translations

RoValra uses [i18next](https://www.i18next.com/) for translations. All translations are community made.

**Files:**

- `public/Assets/locales/<language>.json` - All the text used by RoValra's features.
- `_locales/<language>/messages.json` - The extension name and description shown in the browser/extension store.
- `src/content/core/locale/i18n.js` - Exports the `t` and `ts` functions used to get translated text.

### Using translations in your feature

Never hardcode user facing text. Instead, add your text to `public/Assets/locales/en.json` and use it through `i18n.js`.

1. Add your strings to `en.json` under a key named after your feature (or reuse an existing one from `common` if it already exists):

```json
"yourFeatureName": {
    "title": "My Feature",
    "playingGame": "Playing {{gameName}}"
}
```

2. Import and use the translation functions:

```javascript
import { t, ts } from '../../core/locale/i18n.js';

// Preferred, waits for translations to load before returning
const title = await t('yourFeatureName.title');

// Synchronous, returns the key itself if translations haven't loaded yet
const status = ts('yourFeatureName.playingGame', { gameName: 'Some Game' });
```

Variables are written as `{{variableName}}` in the JSON and passed in as an object.

You only need to add new strings to `en.json`. English is the fallback, so any key missing from another language will show in English until someone translates it.

### Translating into an existing language

1. Open `public/Assets/locales/<language>.json` (e.g. `fr.json`).
2. Compare it with `en.json` and add or translate any missing keys. Keep the exact same key structure as `en.json`, only the values should be translated.
3. Do not translate anything inside `{{ }}`, those are variables filled in by the code. You can move them around in the sentence though.
4. Keep the file valid JSON (watch for missing commas and unescaped quotes).

The translation percentage shown next to each language in the settings is calculated automatically by comparing the file with `en.json`.

### Adding a new language

1. Copy `public/Assets/locales/en.json` to `public/Assets/locales/<language>.json` and translate the values. Use the same language code Roblox uses in its URLs (e.g. `roblox.com/fr/...`) so auto detection works.
2. Create `_locales/<language>/messages.json` with the translated extension name and description (use `_locales/en/messages.json` as a template).
3. Add the language to the `rovalraLanguage` options in `src/content/core/settings/settingConfig.js`:

```javascript
{
    label: languageLabel('German (Deutsch)', 'de'),
    value: 'de',
},
```

The list of supported languages is generated automatically by `build.js` from the files in `public/Assets/locales`, so no other changes are needed.

Please only submit translations for languages you are fluent in, and avoid pure machine translations.

## Adding New Settings

If you are developing a new feature that requires user configuration (like a toggle), you must register it in the settings configuration file.

**File:** `src/content/core/settings/settingConfig.js`

Settings are organized by categories (e.g., `Marketplace`, `Games`, `Profile`). You can add your setting to an existing category or create a new one if necessary.

### Setting Template

Use the following format to add a new setting:

```javascript
YourFeatureName: {
    label: "Feature Label",
    description: [
        "A clear description of what this feature does.",
        "You can use multiple lines for better readability.",
        "**Markdown** is supported here."
    ],
    type: "checkbox", // Common types: "checkbox", "input", "select"
    default: true,    // Set the default state, only features that are likely to be useful to everyone should be on by default.
    storageKey: ["What Ever Storage Key Your Feature Uses", "In case of multiple keys"] // Add this if your feature stores stuff for its functionality. So a user is able to clear the storage
    contributors: ["YOUR USER ID HERE"] // This adds your user as a contributor under a setting, which should be added if you contributed to an existing setting or created an entirely new one.
    // Optional properties that adds a pill beside the title with a tooltip explaining why its there
    // experimental: "reason why its experimental",
    // deprecated: "Reason if the feature is no longer supported",
    // beta: "Reason for it being a beta",
    // Any feature that is, experimental, a beta or deprecated should not be on by default.
    // childSettings: { ... } // If this setting has sub-settings
    // locked: 'Reason for locked', This is used to forcefully disable a feature, e.i if it broke.
    // isPermanent: true, tells the script if its locked permanently
    // exclusiveWith: ['settingName'], will set other settings listed to false when turned true
    // dependsOn: ['settingName'], will set other settings listed to true when turned true
    // dependedBy: ['settingName'], will set other settings listed to false when turned false
}
```

### Using your setting

To retrieve the value of a setting, import the `settings` API from `./src/content/core/settings/getSettings.js`, and use it as: `await settings.YourFeatureName`, which returns the value.

## Donator perks

If you plan on making donator perks please let me know before hand so I can help update this api `https://apis.rovalra.com/v1/users/447170745/settings` accordingly.

To access the user settings api we use `settingHandler.js`

## Contributor Badge

Contributors to the project are eligible for a special **Contributor Badge** displayed on your Roblox profile for anyone with the extension.

To claim your badge, you need to add your Roblox User ID to the configuration file included in your Pull Request.

**File:** `src/content/core/configs/userIds.js`

Simply add your User ID as a string to the `CONTRIBUTOR_USER_IDS` array:

```javascript
export const CONTRIBUTOR_USER_IDS = [
    '123',
    '1234',
    'YOUR_USER_ID_HERE', // Add your Roblox User ID here, with your github user as a comment so we know who is who
];
```

The badge is completely optional.

## Using Icons

### Using Icons with the Icon Component

You can use the `Icon` Function to create a new icon
it's located in [src/content/core/ui/buildericon.ts](src/content/core/ui/buildericon.ts)

Example:

```javascript
import { Icon } from 'yournearestpathto/buildericon.ts';

function woah() {
    let robloxTilt = Icon({
        icon: 'tilt',
        filled: false,
        size: 'medium',
        classes: ['woah-very-cool-class'],
        material: false,
        rovalra: false,
    });
    document.appendChild(robloxTilt);
}

woah();
```

When using DOMPurify, make sure to import `CUSTOM_ADDED_TAGS` and use the config in [src/content/core/utils/purifyCfg.js](src/content/core/utils/purifyCfg.js)
If you want to see an example on how you use it look in [src/content/core/utils/markdown.js](./src/content/core/utils/markdown.js)

### Using Icons with HTML

```html
<icon>tilt</icon>
<!-- Normal/Regular Icon -->
<icon filled>tilt</icon>
<!-- Filled Icon -->
```

You can also use Unicode private use areas as well

```html
<icon></icon>
<!-- This is the tilt icon (U+2300) -->
```

To use sizes, simply use the size attribute like so

```html
<icon size="small">tilt</icon> <icon size="20px">tilt</icon>
```

You can use preset sizes like `x-small`, `small`, `medium`, `large`, `x-large`, and `xx-large`
And you can use specific sizing too!
You can also use material icons by adding the attribute material.
There are also RoValra Icons you can view them [here](https://github.com/NotValra/RoValra-Website/tree/main/font)

If you need information about what Builder Icons exist, you can visit the [Builder Icons Viewer](https://kaan650.github.io/builder-icons/) by [@kann650](https://github.com/kann650)
If you need information about Material Icons, visit [Material Icons Library](https://fonts.google.com/icons?preview.script=Latn&icon.size=24&icon.color=%23e3e3e3&icon.set=Material%20Icons)

When using DOMPurify, make sure to import `CUSTOM_ADDED_TAGS` and use the config in [src/content/core/utils/purifyCfg.js](src/content/core/utils/purifyCfg.js)
If you want to see an example on how you use it look in [src/content/core/utils/markdown.js](./src/content/core/utils/markdown.js)

## Code Guidelines

- We may deny a PR if it doesn't match the vision of the extension.
- Keep code clean and readable.
- Follow the existing coding style of the project.
- Test your changes before submitting.
- For safety reasons, all `innerHTML` should be purified with `DOMPurify`, or preferably using `safeHtml`.
    - **Note:** sanitising with safeHtml prevents everything including styling, while using DOMPurify doesn't (by default).
- Generally follow how other scripts do things and how they import other scripts to implement functionality.
- All api requests should go through `api.js`
- Never use third party apis that isn't RoValra.com, Roblox.com or rbxcdn.com in your PRS. You can however use a third party API as a proof of concept in your PR so we know how to make an official API that works for your PR.
- Make additions to the site look as close to Roblox as possible.
- Never update host permissions or permissions of the extension.
- Never look at text to figure out where to add stuff on the site, as this wont work with different language settings.
- Make sure your changes has locale support via `i18n.js`
- Make sure you never create a new observer and only use `observer.js`
- Make sure you use `IdExtractor.js` for getting ids from url.
- For new features create a new script in side a sub folder of features matching the feature your making and import it via `index.js` Never add you feature into an existing script unless it is a child setting of the main feature of the file.
- For svgs always add them in `assets.js` with a proper name so it can be reused. RoValra mostly uses Material Icons since they look the most like Robloxs, but feel free to use others if you think they match Robloxs svgs more.
- Please keep the PRs simple, single feature focused avoid big over hauls or giant features.
