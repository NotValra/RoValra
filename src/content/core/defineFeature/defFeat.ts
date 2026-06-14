import { debugVerbose } from "../debug";

export type RawFeatureData = { cl: new (...args: unknown[]) => any, name: string, paths: string[]};

declare global {
    var defFeat_features: Array<RawFeatureData>;
}

export function getAllFeatures(): Array<RawFeatureData> {
    if (globalThis?.defFeat_features === undefined)
        globalThis.defFeat_features = [];

    return globalThis.defFeat_features as Array<RawFeatureData>;
}

// This is a class decorator.
// The class is expected to have the following functions within in:
// [required] constructor(): Initialises state
// [required] init(page): Initialises the feature. May be synchronous or asynchronous -- both are supported
// [optional] onDOMLoaded(): runs on 'DOMContentLoaded'
// [optional] onPageLoaded(): runs on 'load'
//
// After you've defined a class for your feature, export it, and then re-export it from featList.ts (check the file for examples)

export function feature(options: Record<string, any>) {
    if (!options) {
        options = { paths: ['*'], name: undefined };
    }

    let name = options?.name;
    const paths = options?.paths;

    function wrapper(cl: new (...args: unknown[]) => any) {
        name = name ?? cl.name;

        debugVerbose("[defFeat] declaring feature", { class: cl, name: name, paths: paths, options: options });

        getAllFeatures().push({ paths: paths, name: name, cl: cl });
    };

    return wrapper;
}
