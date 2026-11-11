
/**
 * get props of an element!
 * @param {string} - the selector u would like to use!
 * @returns {Promise<Object>} - returns promise of props with no functions only plain items
 */
export async function getProps(selector) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getReactProps', selector }, (response) => {
            if (chrome.runtime.lastError)
                return reject(new Error(JSON.stringify(chrome.runtime.lastError)));

            if (response?.error)
                return reject(new Error(response.error));

            resolve(response.data);
        });
    });
}


/**
 * get fiber of an element!
 * @param {string} - the selector u would like to use!
 * @returns {Promise<Object>} - returns promise of fiber with no functions only plain items
 */
export async function getFiber(selector) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getReactFiber', selector }, (response) => {
            if (chrome.runtime.lastError)
                return reject(new Error(JSON.stringify(chrome.runtime.lastError)));

            if (response?.error)
                return reject(new Error(response.error));

            resolve(response.data);
        });
    });
}

/**
 * get key of an element!
 * @param {string} - the selector u would like to use!
 * @returns {Promise<any>} - returns promise of key
 */
export async function getKey(selector) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getReactKey', selector }, (response) => {
            if (chrome.runtime.lastError)
                return reject(new Error(JSON.stringify(chrome.runtime.lastError)));

            if (response?.error)
                return reject(new Error(response.error));

            resolve(response.data);
        });
    });
}
