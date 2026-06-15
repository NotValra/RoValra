import { getAllFeatures } from "./defFeat";
import { debugVerbose } from "../debug";
import * as _featList from "./featList";
import { t } from "../locale/i18n";

type Feature = {paths: Array<string>, name: string, feat: any | unknown};

let features: Array<Feature> = [];

let prepared = false;
function prepare() {
    if (prepared) return;
    prepared = true;
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
        const normalizedPath = path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?\//, '/');  // "www.roblox.com/home" -> "/home"

        if (!featureData.paths.some((p) => {  // the opposite of the condition below (are we NOT on this page, or a subpage?)
            const lowerP = p.toLowerCase();
            return (lowerP === '*' || path.startsWith(lowerP) || normalizedPath.startsWith(lowerP));  // are we on this page, or a subpage?
        })) {
            continue;  // not on this page
        }

        promises.push((async () => {
            const startTime = performance.now();

            try {
                const p = featureData.feat.init(normalizedPath);  // initialise it
                if (p && typeof p.then === 'function')
                    await p;  // if the initialiser is async, await it

                const endTime = performance.now();

                debugVerbose(`[loadFeat] initFeatures: ${featureData.name}: Initialised in ${(endTime - startTime).toFixed(1)}ms`);
            } catch (e) {
                console.error(`[loadFeat] initFeatures: ${featureData.name}: Failed to initialise after ${((performance.now() - startTime) * 1000).toFixed(3)}s`, e);
            }

            // Install hooks
            if (typeof featureData.feat.onDOMLoaded === 'function' && document.readyState === 'loading')
                window.addEventListener('DOMContentLoaded', (...args: unknown[]) => featureData.feat.onDOMLoaded(...args));

            if (typeof featureData.feat.onPageLoaded === 'function' && ['loading', 'interactive'].includes(document.readyState))
                window.addEventListener('load', (...args: unknown[]) => featureData.feat.onPageLoaded(...args));

            // Handle DOMContentLoaded or load having already fired
            switch (document.readyState) {
                case "interactive":
                    featureData.feat.onDOMLoaded();
                    break;
                case "complete":
                    featureData.feat.onDOMLoaded();
                    featureData.feat.onPageLoaded();
                    break;
            }
        })());
    }

    await Promise.all(promises);  // Wait for all features to finish initialising
}

export async function init() {
    prepare();
    await initFeatures();
}
