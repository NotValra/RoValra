import { debugVerbose } from "../debug";

export type Optional<T> = T | undefined;
export type Any = any | unknown;
export type ClassConstructor<T extends Any[] = Any[]> = new (...args: T) => Any;

export type RawFeatureData = { cl: ClassConstructor, name: string, paths: string[]};
export type FeatureOptions = {
    paths?: string[],
    name?: string
};

declare global {
    var defFeat_features: Array<RawFeatureData>;
}

export function getAllFeatures(): RawFeatureData[] {
    if (globalThis?.defFeat_features === undefined)
        globalThis.defFeat_features = [];

    return globalThis.defFeat_features;
}

// This is a class decorator.
// The class is expected to have the following functions within in:
// [required] constructor(): Initialises state
// [required] init(page): Initialises the feature. May be synchronous or asynchronous -- both are supported
// [optional] onDOMLoaded(): runs on 'DOMContentLoaded'
// [optional] onPageLoaded(): runs on 'load'
//
// After you've defined a class for your feature, export it, and then re-export it from featList.ts (check the file for examples)

export function feature(options: FeatureOptions) {
    if (!options) {
        options = { paths: ['*'], name: undefined };  // Default options
        // name === undefined means it will be deduced from the class name
    }

    let name = options?.name;
    const paths = options?.paths ?? ['*'];

    function wrapper(cl: ClassConstructor) {  // the actual decorator (cl = class constructor)    !!! This function will be automatically called on file load with wrapper(TargetClass)
        name = name ?? cl.name;  // If undefined, deduce from class name

        debugVerbose("[defFeat] Declaring feature", { class: cl, name: name, paths: paths, options: options });

        getAllFeatures().push({ paths: paths, name: name, cl: cl });  // add it to a global list that loadFeat.ts can loop through
    };

    return wrapper;
}
