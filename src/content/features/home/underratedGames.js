const UNDERRATED_GAME_CONTENT_IDS = [
    964540701,
    10090256806,
    13058,
    504035427,
];
const UNDERRATED_GAMES_CATEGORY = {
    topic: 'Underrated Games',
    subtitle: 'Underrated games hand picked by RoValra.',
    topicId: 10000013058,
    treatmentType: 'Carousel',
    recommendationList: UNDERRATED_GAME_CONTENT_IDS.slice(0, 4).map((id) => ({
        contentType: 'Game',
        contentId: id,
        contentStringId: '',
        contentMetadata: {
            Score: '1',
        },
        analyticsData: {},
    })),
    nextPageTokenForTopic: null,
    numberOfRows: 1,
    topicLayoutData: {
        componentType: 'EventTile',
        hideSeeAll: 'true',
        linkPath: '',
        CampaignKey: 'Experiment_SortPosition_Worldwide',
    },
    analyticsData: {},
    subId: 'rovalra-underrated-games',
};

let initialized = false;

export function init() {
    if (initialized) return;
    initialized = true;

    document.dispatchEvent(
        new CustomEvent('rovalra-home-extra-sorts', {
            detail: { sorts: [UNDERRATED_GAMES_CATEGORY] },
        }),
    );
}
