class Contribution {
    userId: string;
    contributionDescription: string;
    relevantPR?: string;

    constructor(userId: BigInt | number | string, contributionDescription: string, relevantPR?: string) {
        this.userId = String(userId);
        this.contributionDescription = "settings.credits.otherContributions." + contributionDescription;
        this.relevantPR = relevantPR;
    }
}

type ContributionsType = {
    [featureName: string]: {
        label: string,
        contributors: Contribution[]
    }
};

export const OTHER_CONTRIBUTIONS: ContributionsType = {
    Badges: {
        label: "Badges",
        contributors: [
            new Contribution(1564574922, "badges.translatorAndNate", "https://github.com/NotValra/RoValra/pull/48"),  // @BossBoss2021
            new Contribution(650766686, "badges.nateGilbertFix", "https://github.com/NotValra/RoValra/pull/126"),  // @auggeeo
        ],
    },
    Caching: {
        label: "Caching System",
        contributors: [
            new Contribution(1564574922, "caching.hashmap", "https://github.com/NotValra/RoValra/pull/52"),  // @BossBoss2021
        ],
    },
    Sidebar: {
        label: "Roblox Sidebar",
        contributors: [
            new Contribution(48255812, "sidebar.rblxUpdateFix", "https://github.com/NotValra/RoValra/pull/55"),  // @aliceeenight
        ],
    },
    RbxmParser: {
        label: "RoValra .rbxm Parser",
        contributors: [
            new Contribution(48255812, "rbxm.fixDesyncCframe", "https://github.com/NotValra/RoValra/pull/69"),  // @aliceeenight
        ],
    },
    Markdown: {
        label: "Markdown Parser",
        contributors: [
            new Contribution(1564574922, "markdown.untrustedMd", "https://github.com/NotValra/RoValra/pull/75"), // @BossBoss2021
        ],
    },
    SettingsHandler: {
        label: "RoValra Settings Handler",
        contributors: [
            new Contribution(1564574922, "settingsHandler.unifiedApi", "https://github.com/NotValra/RoValra/pull/85"), // @BossBoss2021
        ],
    },
    ContributorList: {
        label: "RoValra Contributor List",
        contributors: [
            new Contribution(546872490, "contributorList.creditsImprovement", "https://github.com/NotValra/RoValra/pull/117"),  // @kanibal_dev
            new Contribution(1564574922, "contributorList.nonSettingCredits"),  // @BossBoss2021
        ],
    },
    DonatorTierPage: {
        label: "RoValra Donator Tier Page",
        contributors: [
            new Contribution(650766686, "donatorTierPage.newIndicators", "https://github.com/NotValra/RoValra/pull/123"),  // @auggeeo
        ],
    },
    IconElement: {
        label: "Icon Element + Builder, Material, and RoValra Icons",
        contributors: [
            new Contribution(650766686, "iconElement.addIcons", "https://github.com/NotValra/RoValra/pull/168"),  // @auggeeo
            new Contribution(650766686, "iconElement.makeRoValraIcons", "https://github.com/NotValra/RoValra-Website/pull/4"),  // @auggeeo
            new Contribution(650766686, "iconElement.addBuilderIconsWOFF", "https://github.com/NotValra/RoValra-Website/pull/5"),  // @auggeeo
            new Contribution(1564574922, "iconElement.addElement", "https://github.com/NotValra/RoValra/pull/168"),  // @BossBoss2021
        ],
    },
    displayAppThemeUserProfile: {
        label: "App Themes On User Profiles",
        contributors: [
            new Contribution(650766686, "displayAppThemeUserProfile.addedToWebsite", "https://github.com/NotValra/RoValra-Website/pull/7"),  // @auggeeo
        ]
    },
};
