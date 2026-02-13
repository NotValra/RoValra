# Contributing to RoValra

This is a guide on how to contribute to RoValra

## Getting Started

1.  **Fork the repository** and clone it locally.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and ensure they work as expected.
4.  Submit a Pull Request (PR) with a clear description of your changes.

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
    default: true,    // Set the default state
    storageKey: ["What Ever Storage Key Your Feature Uses", "In case of multiple keys"] // Add this if your feature stores stuff for its functionality. So a user is able to clear the storage
    // Optional properties that adds a pill beside the title with a tooltip explaining why its there
    // experimental: "reason why its experimental",
    // deprecated: "Reason if the feature is no longer supported",
    // beta: "Reason for it being a beta",
    // Any feature that is, experimental, a beta or deprecated should not be on by default.
    // childSettings: { ... } // If this setting has sub-settings
}
```

You must add your setting to `src/background/background.js` in ```function getDefaultSettings()```
And the value must match the default value of the setting

## Contributor Badge

Contributors to the project are eligible for a special **Contributor Badge** displayed on your Roblox profile for anyone with the extension.

To claim your badge, you need to add your Roblox User ID to the configuration file included in your Pull Request.

**File:** `src/content/core/configs/userIds.js`

Simply add your User ID as a string to the `CONTRIBUTOR_USER_IDS` array:

```javascript
export const CONTRIBUTOR_USER_IDS = [
    '123',
    '1234',
    'YOUR_USER_ID_HERE' // Add your Roblox User ID here, with your github user as a comment so we know who is who
];
```
The badge is completely optional.

## Code Guidelines

*   Keep code clean and readable.
*   Follow the existing coding style of the project.
*   Test your changes before submitting.
*   For safety reasons, all `innerHTML` should be purified with `DOMPurify`, even if it's static.
*   Generally follow how other scripts do things and how they import other scripts to implement functionality.