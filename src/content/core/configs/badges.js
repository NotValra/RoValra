

import { getAssets } from '../assets.js';
import { CREATOR_USER_ID, CONTRIBUTOR_USER_IDS, RAT_BADGE_USER_ID, BLAHAJ_BADGE_USER_ID, CAM_BADGE_USER_ID } from './userIds.js';

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
    },
    blahaj: {
        type: 'badge',
        userIds: [BLAHAJ_BADGE_USER_ID],
        icon: assets.blahaj,
        name: 'BLAHAJ :3',
        tooltip: 'BLAHAJ :3',
        confetti: assets.blahaj
    },
    cam: {
        type: 'header',
        userIds: [CAM_BADGE_USER_ID],
        icon: assets.blahaj,
        name: 'BLAHAJ :3',
        tooltip: 'BLAHAJ :3',
        confetti: assets.blahaj
    },
    camEasterEgg: {
        type: 'badge',
        userIds: [CAM_BADGE_USER_ID],
        icon: assets.blahaj,
        name: 'BLAHAJ :3',
        tooltip: 'BLAHAJ :3',
        confetti: assets.blahaj
    },
    legacy_donator: {
        type: 'header',
        userIds: [],
        icon: assets.rovalraIcon,
        tooltip: 'Legacy Donator. Earned by donating to RoValra before donator badges were a thing.',
        confetti: assets.rovalraIcon,
        style: { filter: 'sepia(100%) saturate(600%) brightness(90%) hue-rotate(5deg)' }
    },
    donator_1: {
        type: 'header',
        userIds: [],
        icon: assets.rovalraIcon,
        tooltip: 'Donated any amount of Robux to help Support RoValra\'s development.',
        url: 'https://www.roblox.com/games/store-section/9452973012',
        style: { filter: 'sepia(1) saturate(1.8) hue-rotate(-35deg) brightness(0.8) contrast(1.2)' }
    },
    donator_2: {
        type: 'header',
        userIds: [],
        icon: assets.rovalraIcon,
        tooltip: 'Donated 200 or more Robux to help Support RoValra\'s development.',
        url: 'https://www.roblox.com/games/store-section/9452973012',
        style: { filter: 'grayscale(1) brightness(1.3) contrast(1.2)' }
    },
    donator_3: {
        type: 'header',
        userIds: [],
        icon: assets.rovalraIcon,
        tooltip: 'Donated 500 or more Robux to help Support RoValra\'s development.',
        url: 'https://www.roblox.com/games/store-section/9452973012',
        style: { filter: 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.1)' }
    }
};