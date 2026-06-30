import { callRobloxApi } from '../../api.js';
import { getAuthenticatedUserId } from '../../user.js';

const STORAGE_KEY = 'rovalra_birthday_tracker';
const CACHE_TTL = 6 * 60 * 60 * 1000;

let activeTrackerPromise = null;

async function readAllTrackedUsers() {
    try {
        const storage = await chrome.storage.local.get(STORAGE_KEY);
        return storage[STORAGE_KEY] || {};
    } catch (error) {
        console.warn('RoValra: Failed to read birthday tracker cache', error);
        return {};
    }
}

async function writeAllTrackedUsers(data) {
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (error) {
        console.warn('RoValra: Failed to write birthday tracker cache', error);
    }
}

function calculateAge(birthday) {
    const birthYear = Number(birthday?.birthYear);
    const birthMonth = Number(birthday?.birthMonth);
    const birthDay = Number(birthday?.birthDay);

    if (!birthYear || !birthMonth || !birthDay) return null;

    const today = new Date();
    let age = today.getFullYear() - birthYear;
    const monthDelta = today.getMonth() + 1 - birthMonth;

    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDay)) {
        age--;
    }

    return age;
}

async function fetchBirthday() {
    const response = await callRobloxApi({
        subdomain: 'users',
        endpoint: '/v1/birthdate',
        method: 'GET',
        noCache: true,
    });

    if (!response.ok) return null;
    return await response.json();
}

async function fetchAgeGroup() {
    const response = await callRobloxApi({
        subdomain: 'apis',
        endpoint: '/user-settings-api/v1/account-insights/age-group',
        method: 'GET',
        noCache: true,
    });

    if (!response.ok) return null;
    return await response.json();
}

async function fetchVerifiedAge() {
    const response = await callRobloxApi({
        subdomain: 'apis',
        endpoint: '/age-verification-service/v1/age-verification/verified-age',
        method: 'GET',
        noCache: true,
    });

    if (!response.ok) return null;
    return await response.json();
}

function buildTrackedData(userId, birthday, ageGroup, verifiedAge) {
    const age = calculateAge(birthday);
    const verifiedAgeValue = Number(verifiedAge?.verifiedAge);
    const isVerifiedAgeChecked =
        Number.isFinite(verifiedAgeValue) && verifiedAgeValue > 0;
    const isAgeChecked =
        ageGroup?.isChecked === true && isVerifiedAgeChecked === true;
    const isBelow13 = !isAgeChecked || age === null || age < 13;

    return {
        userId: String(userId),
        birthday: birthday
            ? {
                  birthMonth: birthday.birthMonth,
                  birthDay: birthday.birthDay,
                  birthYear: birthday.birthYear,
              }
            : null,
        age,
        ageGroup: ageGroup
            ? {
                  ageGroupTranslationKey: ageGroup.ageGroupTranslationKey,
                  isChecked: ageGroup.isChecked === true,
                  ageVerificationDeadline: ageGroup.ageVerificationDeadline,
                  isPendingWithUnknownDeadline:
                      ageGroup.isPendingWithUnknownDeadline === true,
                  estimatedAgeGroupTranslationKey:
                      ageGroup.estimatedAgeGroupTranslationKey,
                  estimatedAge: ageGroup.estimatedAge,
              }
            : null,
        verifiedAge: verifiedAge
            ? {
                  isVerified: verifiedAge.isVerified === true,
                  verifiedAge: Number.isFinite(verifiedAgeValue)
                      ? verifiedAgeValue
                      : null,
                  isSeventeenPlus: verifiedAge.isSeventeenPlus === true,
              }
            : null,
        isAgeChecked,
        isVerifiedAgeChecked,
        isBelow13,
        is13PlusAndAgeChecked: isAgeChecked && !isBelow13,
        updatedAt: Date.now(),
    };
}

export async function updateBirthdayTracker(forceRefresh = false) {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;

    const allTrackedUsers = await readAllTrackedUsers();
    const cachedData = allTrackedUsers[userId];

    if (
        !forceRefresh &&
        cachedData &&
        Date.now() - (cachedData.updatedAt || 0) < CACHE_TTL
    ) {
        return cachedData;
    }

    if (activeTrackerPromise) return activeTrackerPromise;

    activeTrackerPromise = (async () => {
        try {
            const [birthday, ageGroup, verifiedAge] = await Promise.all([
                fetchBirthday().catch((error) => {
                    console.warn(
                        'RoValra: Failed to fetch authenticated user birthday',
                        error,
                    );
                    return null;
                }),
                fetchAgeGroup().catch((error) => {
                    console.warn(
                        'RoValra: Failed to fetch authenticated user age group',
                        error,
                    );
                    return null;
                }),
                fetchVerifiedAge().catch((error) => {
                    console.warn(
                        'RoValra: Failed to fetch authenticated user verified age',
                        error,
                    );
                    return null;
                }),
            ]);

            const trackedData = buildTrackedData(
                userId,
                birthday,
                ageGroup,
                verifiedAge,
            );
            const latestTrackedUsers = await readAllTrackedUsers();
            latestTrackedUsers[userId] = trackedData;
            await writeAllTrackedUsers(latestTrackedUsers);

            return trackedData;
        } finally {
            activeTrackerPromise = null;
        }
    })();

    return activeTrackerPromise;
}

export async function getBirthdayTrackerData(forceRefresh = false) {
    return await updateBirthdayTracker(forceRefresh);
}

export async function isAuthenticatedUser13PlusAndAgeChecked(
    forceRefresh = false,
) {
    const trackedData = await updateBirthdayTracker(forceRefresh);
    return trackedData?.is13PlusAndAgeChecked === true;
}

export async function isAuthenticatedUserBelow13(forceRefresh = false) {
    const trackedData = await updateBirthdayTracker(forceRefresh);
    return trackedData?.isBelow13 !== false;
}

export async function isAuthenticatedUserUnder16OrNotAgeChecked(
    forceRefresh = false,
) {
    const trackedData = await updateBirthdayTracker(forceRefresh);
    return (
        trackedData?.isAgeChecked !== true ||
        trackedData?.age === null ||
        trackedData?.age === undefined ||
        trackedData.age < 16
    );
}

export async function init() {
    await updateBirthdayTracker();
}
