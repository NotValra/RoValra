import { callRobloxApiJson } from '../api.js';

export const REMOTE_SETTING_LOCKS_KEY = 'rovalra_remote_setting_locks';

export const REMOTE_SETTINGS_CONFIG_CACHE_KEY =
    'rovalra_remote_settings_config_cache';

export const REMOTE_SETTING_LOCK_REASON =
    'Disabled remotely, likely because of issues. It will be back soon.';

const REMOTE_SETTINGS_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

const getStorage = (keys) => chrome.storage.local.get(keys);

const setStorage = (items) => chrome.storage.local.set(items);

const removeStorage = (keys) => chrome.storage.local.remove(keys);

export const REMOTE_SETTING_OVERRIDE_KEY =
    'overwriteRemoteSettingLocks';

const isRemoteSettingOverrideEnabled = async () => {
    const result = await getStorage({ [REMOTE_SETTING_OVERRIDE_KEY]: false });
    return result[REMOTE_SETTING_OVERRIDE_KEY] === true;
};

const fetchRemoteSettingsConfig = () =>
    callRobloxApiJson({
        isRovalraApi: true,
        subdomain: 'www',
        endpoint: '/RoValra/Settings/config.json',
        method: 'GET',
    });

const getCachedRemoteSettingsConfig = async () => {
    const result = await getStorage({
        [REMOTE_SETTINGS_CONFIG_CACHE_KEY]: null,
    });
    const cache = result[REMOTE_SETTINGS_CONFIG_CACHE_KEY];
    if (!cache || typeof cache !== 'object') return null;

    return cache;
};

const getRemoteSettingsConfig = async () => {
    const cachedConfig = await getCachedRemoteSettingsConfig();
    const now = Date.now();
    const isCacheFresh =
        cachedConfig &&
        cachedConfig.timestamp &&
        now - cachedConfig.timestamp < REMOTE_SETTINGS_CONFIG_CACHE_TTL_MS;

    if (isCacheFresh) {
        return cachedConfig.data || {};
    }

    try {
        const config = await fetchRemoteSettingsConfig();
        await setStorage({
            [REMOTE_SETTINGS_CONFIG_CACHE_KEY]: {
                data: config || {},
                timestamp: now,
            },
        });
        return config || {};
    } catch (error) {
        if (cachedConfig?.data) {
            console.warn(
                'RoValra: Failed to refresh remote settings config. Using cached config.',
                error,
            );
            return cachedConfig.data;
        }
        throw error;
    }
};

const getRemoteDisabledKeys = async () => {
    const config = await getRemoteSettingsConfig();
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return [];
    }

    return Object.keys(config).filter((key) => typeof key === 'string' && key);
};

export const getRemoteSettingLocks = async () => {
    const result = await getStorage({ [REMOTE_SETTING_LOCKS_KEY]: {} });
    const locks = result[REMOTE_SETTING_LOCKS_KEY];
    return locks && typeof locks === 'object' && !Array.isArray(locks)
        ? locks
        : {};
};

export const refreshRemoteSettingLocks = async () => {
    const disabledKeys = await getRemoteDisabledKeys();
    const allowRemoteOverrides = await isRemoteSettingOverrideEnabled();
    const disabledKeySet = new Set(disabledKeys);
    const storage = await getStorage(null);
    const currentLocks =
        storage[REMOTE_SETTING_LOCKS_KEY] &&
        typeof storage[REMOTE_SETTING_LOCKS_KEY] === 'object' &&
        !Array.isArray(storage[REMOTE_SETTING_LOCKS_KEY])
            ? storage[REMOTE_SETTING_LOCKS_KEY]
            : {};
    const bundledSettings =
        storage.rovalra_settings &&
        typeof storage.rovalra_settings === 'object' &&
        !Array.isArray(storage.rovalra_settings)
            ? { ...storage.rovalra_settings }
            : {};

    const nextLocks = {};
    const updates = {};
    const removals = [];
    let bundledChanged = false;

    for (const key of disabledKeys) {
        const existingLock = currentLocks[key];
        const currentValue = Object.prototype.hasOwnProperty.call(storage, key)
            ? storage[key]
            : bundledSettings[key];

        nextLocks[key] = existingLock || {
            previousValue: currentValue,
            lockedAt: Date.now(),
            reason: REMOTE_SETTING_LOCK_REASON,
        };

        if (allowRemoteOverrides) {
            if (
                Object.prototype.hasOwnProperty.call(
                    nextLocks[key],
                    'previousValue',
                ) &&
                nextLocks[key].previousValue !== undefined
            ) {
                updates[key] = nextLocks[key].previousValue;
                if (bundledSettings[key] !== nextLocks[key].previousValue) {
                    bundledSettings[key] = nextLocks[key].previousValue;
                    bundledChanged = true;
                }
            }
        } else {
            if (storage[key] !== false) updates[key] = false;

            if (bundledSettings[key] !== false) {
                bundledSettings[key] = false;
                bundledChanged = true;
            }
        }
    }

    for (const [key, lock] of Object.entries(currentLocks)) {
        if (disabledKeySet.has(key)) continue;

        if (Object.prototype.hasOwnProperty.call(lock, 'previousValue')) {
            if (lock.previousValue === undefined) {
                removals.push(key);
                if (
                    Object.prototype.hasOwnProperty.call(bundledSettings, key)
                ) {
                    delete bundledSettings[key];
                    bundledChanged = true;
                }
            } else {
                updates[key] = lock.previousValue;
                if (bundledSettings[key] !== lock.previousValue) {
                    bundledSettings[key] = lock.previousValue;
                    bundledChanged = true;
                }
            }
        } else {
            removals.push(key);
            if (Object.prototype.hasOwnProperty.call(bundledSettings, key)) {
                delete bundledSettings[key];
                bundledChanged = true;
            }
        }
    }

    updates[REMOTE_SETTING_LOCKS_KEY] = nextLocks;
    if (bundledChanged) updates.rovalra_settings = bundledSettings;

    await setStorage(updates);
    if (removals.length > 0) {
        await removeStorage(removals);
    }

    return {
        locked: disabledKeys,
        restored: Object.keys(currentLocks).filter(
            (key) => !disabledKeySet.has(key),
        ),
    };
};
