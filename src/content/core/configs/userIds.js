export const CREATOR_USER_ID = '447170745';

export const CONTRIBUTOR_USER_IDS = [
    '1337447242',
    '109176680',
    '795922138',
    '8345351117', //Zed128
    '546872490', //Kanibal02
    '48255812', //aliceenight
    '7982684834', //qborder
    '126448532', //steinann
    '1564574922', //cornusandu
    '587159802', //zoinbase
    '193520242', //tigodev1
    '2615068449', //lolct
];

export const TESTER_USER_IDS = [
    '1163412141', //Tino
];

export const TRANSLATOR_USER_IDS = [];

export const ARTIST_BADGE_USER_ID = '1337447242';
export const RAT_BADGE_USER_ID = '477516666'; // rat
export const BLAHAJ_BADGE_USER_ID = '96786935'; // BLAHAJ
export const CAM_BADGE_USER_ID = '4866259395';
export const alice_badge_user_id = '48255812';
export const GILBERT_USER_ID = '146089324'; // WoozyNate
export const Robux = '1163412141';

export const TRUSTED_USER_IDS = new Set(
    [
        CREATOR_USER_ID,
        ...CONTRIBUTOR_USER_IDS,
        ...TESTER_USER_IDS,
        ...TRANSLATOR_USER_IDS,
        ARTIST_BADGE_USER_ID,
        RAT_BADGE_USER_ID,
        BLAHAJ_BADGE_USER_ID,
        CAM_BADGE_USER_ID,
        alice_badge_user_id,
        GILBERT_USER_ID,
        '1996279003', // Bloodraven (stinky)
        '129425241', // sky (jailbreak tester *blushes slightly*)
    ].map((id) => String(id)),
);
