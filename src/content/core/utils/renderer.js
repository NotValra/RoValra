import { callRobloxApiJson } from '../api.js';
import {
    FLAGS,
} from 'roavatar-renderer';

/**
 * Sends roavatar-renderer assetdelivery requests to background to avoid CORS issues
 */
export function backgroundRendererRequests() {
    //make all roavatar requests have a prefix
    FLAGS.API_REQUEST_PREFIX = '*^~roavatar-intercept~^*';
    const originalFetch = window.fetch;
    /**
     * 
     * @param {Request | URL} resource 
     * @param {RequestInit | null | undefined} options 
     */
    window.fetch = (resource, options) => {
        let url = undefined;
        if (resource instanceof Request) {
            url = resource.url;
        } else {
            url = resource.toString();
        }

        //make sure the request has the prefix
        if (url.startsWith(FLAGS.API_REQUEST_PREFIX)) {
            const realUrl = url.substring(FLAGS.API_REQUEST_PREFIX.length);
            const realUrlObj = new URL(realUrl);

            //make sure it is a request we actually want to intercept
            if (realUrlObj.protocol === "https:" && realUrlObj.hostname.includes("assetdelivery.roblox.com")) {
                const subdomain = realUrlObj.hostname.replace('.roblox.com', '');
                const endpoint = realUrlObj.pathname + realUrlObj.search

                //return a promise that resolves with a Response but does so through the background
                return new Promise((resolve, reject) => {
                    let result = undefined
                    let isOk = true

                    callRobloxApiJson({
                        subdomain,
                        endpoint,
                        useBackground: true,
                        ...options,
                    }).then((trueResult) => {
                        result = trueResult
                    }).catch(() => {
                        isOk = false
                    }).finally(() => {
                        const fakeResponse = {
                            status: isOk ? 200 : 500,
                            ok: isOk,
                            json: () => {
                                return result
                            }
                        }
                        if (isOk) {
                            resolve(fakeResponse)
                        } else {
                            reject(fakeResponse)
                        }
                    })
                })
            } else {
                return originalFetch(realUrl, options);
            }
        } else {
            return originalFetch(resource, options);
        }
    }
}