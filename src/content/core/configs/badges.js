

import { getAssets } from '../assets.js';
import { CREATOR_USER_ID, CONTRIBUTOR_USER_IDS, RAT_BADGE_USER_ID } from './userIds.js';

const assets = getAssets();

export const BADGE_CONFIG = {
    creator: {
        type: 'header',
        userIds: [CREATOR_USER_ID],
        icon: assets.rovalraIcon,
        tooltip: 'Creator of RoValra',
        confetti: assets.rovalraIcon,
        style: {},
        alwaysShow: true
    },
    contributor: {
        type: 'header',
        userIds: CONTRIBUTOR_USER_IDS,
        icon: assets.rovalraIcon,
        tooltip: 'RoValra Contributor',
        confetti: assets.rovalraIcon,
        style: { filter: 'sepia(80%) saturate(300%) brightness(90%) hue-rotate(-20deg)' }
    },
    gilbert: {
        type: 'badge',
        userIds: [CREATOR_USER_ID],
        icon: assets.rovalraIcon,
        name: 'Gilbert',
        tooltip: 'Creator of RoValra',
        confetti: assets.rovalraIcon,
        alwaysShow: true
    },
    rat: {
        type: 'badge',
        userIds: [RAT_BADGE_USER_ID],
        icon: assets.ratBadgeIcon,
        name: 'I make rats',
        tooltip: 'I make rats',
        confetti: assets.fishConfetti
    }
};