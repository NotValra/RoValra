import { type IconOptions } from "../../core/ui/buildericon";

/**
 * An option for a dropdown
 */
type DropdownOption = {
    /**
     * Translation key of displayed label on option
     */
    label: string,
    /**
     * Value of option thats passed to the value changed function
     */
    value: string,
    /**
     * If option should be disabled
     */
    disabled?: boolean,
    /**
     * If option should be selected by default
     */
    default?: boolean,
    /**
     * if option should be hidden from the user
     */
    hidden?: boolean,
};

/**
 * A Roblox Account User Setting!
 */
type AccountSettingInfo = {
    currentValue: string,
    options?: {
        option?: {
            optionValue?: string,
        },
        requirement?: string,
    }[],
}

/**
 * The Roblox account settings info
 */
type AccountSettingsResponse = Record<string, AccountSettingInfo>;

/**
 * Dropdown for Privacy Toggles
 */
type Dropdown = {
    /**
     * Translation key for title to show
     */
    title: string,
    /**
     * The name for other dropdowns to know you as.
     */
    name: string,
    /**
     * The RoValra setting attached to this dropdown
     */
    settingAttached: string,
    /**
     * The Icon to display before the title!
     */
    icon: IconOptions,
    /**
     * Set the initial options that the dropdown has
     */
    getInitialItems: (accountSettings: AccountSettingsResponse) => Promise<DropdownOption[]>,
    /**
     * Get notified when the dropdown option changes so you can do things!
     */
    valueChanged: (value: string) => Promise<void>,
    /**
     * Change your settings based on a different option that was changed. Return the new options btw!
     */
    changeSettingsBasedOtherSettings?: (currentSettings: DropdownOption[], otherSettingName: string, otherSettingValue: string) => Promise<DropdownOption[]>,

};


export declare const DROPDOWNS: Dropdown[];
