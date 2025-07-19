// Browser compatibility layer for Firefox support
// This file provides a unified API that works with both Chrome and Firefox

(function() {
    'use strict';

    // Detect if we're in Firefox or Chrome
    const isFirefox = typeof browser !== 'undefined' && browser.runtime;
    const isChrome = typeof chrome !== 'undefined' && chrome.runtime;

    // Create a unified API object
    const unifiedAPI = {};

    if (isFirefox) {
        // Firefox implementation using browser API
        unifiedAPI.runtime = {
            getURL: (path) => browser.runtime.getURL(path),
            sendMessage: (message, callback) => {
                if (callback) {
                    browser.runtime.sendMessage(message).then(callback).catch((error) => {
                        if (callback) callback({ error: error.message });
                    });
                } else {
                    return browser.runtime.sendMessage(message);
                }
            },
            onMessage: {
                addListener: (callback) => {
                    // Firefox message listener needs to return a Promise or true for async handling
                    return browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
                        const result = callback(message, sender, sendResponse);
                        if (result === true) {
                            // Chrome-style async response
                            return true;
                        } else if (result instanceof Promise) {
                            // Firefox-style Promise response
                            return result;
                        }
                        return result;
                    });
                }
            },
            getManifest: () => browser.runtime.getManifest(),
            onInstalled: browser.runtime.onInstalled,
            onStartup: browser.runtime.onStartup,
            lastError: null
        };

        // Handle chrome.runtime.lastError for Firefox
        Object.defineProperty(unifiedAPI.runtime, 'lastError', {
            get: function() {
                return null; // Firefox doesn't have lastError, so we return null
            },
            set: function(value) {
                // Do nothing, Firefox doesn't use lastError
            }
        });

        unifiedAPI.storage = {
            local: {
                get: (keys, callback) => {
                    if (callback) {
                        browser.storage.local.get(keys).then(callback).catch((error) => {
                            if (callback) callback({ error: error.message });
                        });
                    } else {
                        return browser.storage.local.get(keys);
                    }
                },
                set: (items, callback) => {
                    if (callback) {
                        browser.storage.local.set(items).then(callback).catch((error) => {
                            if (callback) callback({ error: error.message });
                        });
                    } else {
                        return browser.storage.local.set(items);
                    }
                },
                remove: (keys, callback) => {
                    if (callback) {
                        browser.storage.local.remove(keys).then(callback).catch((error) => {
                            if (callback) callback({ error: error.message });
                        });
                    } else {
                        return browser.storage.local.remove(keys);
                    }
                }
            }
        };

        unifiedAPI.scripting = {
            executeScript: (options) => browser.scripting.executeScript(options)
        };

        unifiedAPI.declarativeNetRequest = {
            updateEnabledRulesets: (options) => browser.declarativeNetRequest.updateEnabledRulesets(options)
        };

        unifiedAPI.tabs = {
            query: (queryInfo, callback) => {
                if (callback) {
                    browser.tabs.query(queryInfo).then(callback).catch((error) => {
                        if (callback) callback({ error: error.message });
                    });
                } else {
                    return browser.tabs.query(queryInfo);
                }
            },
            sendMessage: (tabId, message, callback) => {
                if (callback) {
                    browser.tabs.sendMessage(tabId, message).then(callback).catch((error) => {
                        if (callback) callback({ error: error.message });
                    });
                } else {
                    return browser.tabs.sendMessage(tabId, message);
                }
            },
            create: (createProperties) => browser.tabs.create(createProperties),
            onUpdated: browser.tabs.onUpdated
        };

        unifiedAPI.action = {
            onClicked: browser.action.onClicked
        };

    } else if (isChrome) {
        // Chrome implementation (pass-through)
        unifiedAPI.runtime = chrome.runtime;
        unifiedAPI.storage = chrome.storage;
        unifiedAPI.scripting = chrome.scripting;
        unifiedAPI.declarativeNetRequest = chrome.declarativeNetRequest;
        unifiedAPI.tabs = chrome.tabs;
        unifiedAPI.action = chrome.action;
        
        // Ensure lastError is available in Chrome context
        if (!unifiedAPI.runtime.lastError) {
            unifiedAPI.runtime.lastError = null;
        }
    } else {
        // Fallback for unsupported browsers
        console.warn('Browser extension APIs not available');
        unifiedAPI.runtime = {
            getURL: () => '',
            sendMessage: () => Promise.reject(new Error('Not supported')),
            onMessage: { addListener: () => {} },
            getManifest: () => ({}),
            onInstalled: { addListener: () => {} },
            onStartup: { addListener: () => {} },
            lastError: null
        };
        unifiedAPI.storage = {
            local: {
                get: () => Promise.resolve({}),
                set: () => Promise.resolve(),
                remove: () => Promise.resolve()
            }
        };
        unifiedAPI.scripting = {
            executeScript: () => Promise.reject(new Error('Not supported'))
        };
        unifiedAPI.declarativeNetRequest = {
            updateEnabledRulesets: () => Promise.reject(new Error('Not supported'))
        };
        unifiedAPI.tabs = {
            query: () => Promise.resolve([]),
            sendMessage: () => Promise.reject(new Error('Not supported')),
            create: () => Promise.reject(new Error('Not supported')),
            onUpdated: { addListener: () => {} }
        };
        unifiedAPI.action = {
            onClicked: { addListener: () => {} }
        };
    }

    // Expose the unified API globally
    if (typeof window !== 'undefined') {
        window.unifiedAPI = unifiedAPI;
    }
    if (typeof global !== 'undefined') {
        global.unifiedAPI = unifiedAPI;
    }
    if (typeof self !== 'undefined') {
        self.unifiedAPI = unifiedAPI;
    }

    // Also expose it as 'chrome' for backward compatibility
    if (typeof window !== 'undefined' && !window.chrome) {
        window.chrome = unifiedAPI;
    }
    if (typeof global !== 'undefined' && !global.chrome) {
        global.chrome = unifiedAPI;
    }
    if (typeof self !== 'undefined' && !self.chrome) {
        self.chrome = unifiedAPI;
    }

})(); 