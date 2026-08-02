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
        contributors: Contribution[]
    }
};

export const OTHER_CONTRIBUTIONS: ContributionsType = {
    Badges: {
        contributors: [
            new Contribution(1564574922, "badges.translatorAndNate", "https://github.com/NotValra/RoValra/pull/48"),  // @BossBoss2021
            new Contribution(650766686, "badges.nateGilbertFix", "https://github.com/NotValra/RoValra/pull/126")  // @auggeeo
        ]
    },
    Caching: {
        contributors: [
            new Contribution(1564574922, "caching.hashmap", "https://github.com/NotValra/RoValra/pull/52")  // @BossBoss2021
        ]
    },
    Sidebar: {
        contributors: [
            new Contribution(48255812, "sidebar.rblxUpdateFix", "https://github.com/NotValra/RoValra/pull/55")  // @aliceeenight
        ]
    },
    RbxmParser: {
        contributors: [
            new Contribution(48255812, "rbxm.fixDesyncCframe", "https://github.com/NotValra/RoValra/pull/69")  // @aliceeenight
        ]
    },
    Markdown: {
        contributors: [
            new Contribution(1564574922, "markdown.untrustedMd", "https://github.com/NotValra/RoValra/pull/75") // @BossBoss2021
        ]
    },
    SettingsHandler: {
        contributors: [
            new Contribution(1564574922, "settingsHandler.unifiedApi", "https://github.com/NotValra/RoValra/pull/85") // @BossBoss2021
        ]
    },
    ContributorList: {
        contributors: [
            new Contribution(546872490, "contributorList.creditsImprovement", "https://github.com/NotValra/RoValra/pull/117"),  // @kanibal_dev
            new Contribution(1564574922, "contributorList.nonSettingCredits")  // @BossBoss2021
        ]
    },
    DonatorTierPage: {
        contributors: [
            new Contribution(650766686, "donatorTierPage.newIndicators", "https://github.com/NotValra/RoValra/pull/123")  // @auggeeo
        ]
    }
};
