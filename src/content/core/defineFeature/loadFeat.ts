import { getAllFeatures } from "./defFeat";
import { debugVerbose } from "../debug";
import * as _featList from "./featList";

type Feature = {paths: Array<string>, name: string, feat: any | unknown};

let features: Array<Feature> = [];

function prepare() {
    for (const feat of getAllFeatures()) {
        const instance = new feat.cl();
        features.push({
            paths: feat.paths,
            name: feat.name,
            feat: instance
        });
    }
}

async function initFeatures() {
    _featList;
    const promises = [];

    for (const featureData of features) {
        // Check if the feature should be run on this page
        const path = window.location.pathname.toLowerCase();
        const normalizedPath = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');

        if (!featureData.paths.some((p) => {  // the opposite of the condition below (are we NOT on this page, or a subpage?)
            const lowerP = p.toLowerCase();
            return (lowerP === '*' || path.startsWith(lowerP) || normalizedPath.startsWith(lowerP));  // are we on this page, or a subpage?
        })) {
            continue;  // not on this page
        }

        promises.push((async () => {
            debugVerbose(`[loadFeat] initFeatures: ${featureData.name}: Initialising`);
            const p = featureData.feat.init(normalizedPath);  // initialise it
            if (p && typeof p.then === 'function')
                await p;  // if the initialiser is async, await it

            // Install hooks
            if (typeof featureData.feat.onDOMLoaded === 'function')
                window.addEventListener('DOMContentLoaded', (...args: unknown[]) => featureData.feat.onDOMLoaded(...args));

            if (typeof featureData.feat.onPageLoaded === 'function')
                window.addEventListener('load', (...args: unknown[]) => featureData.feat.onPageLoaded(...args));
        })());
    }

    await Promise.all(promises);  // Wait for all features to finish initialising
}

export async function init() {
    prepare();
    await initFeatures();
}
