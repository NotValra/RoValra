import { debugVerbose } from "../debug";

declare global {
    var defFeat_features: Array<Record<string, any>>;
}

export function getAllFeatures(): Array<Record<string, any>> {
    if (globalThis?.defFeat_features === undefined)
        globalThis.defFeat_features = [];

    return globalThis.defFeat_features as Array<Record<string, any>>;
}

export function feature(options: Record<string, any>) {
    if (!options) {
        options = { paths: ['*'], name: undefined };
    }

    let name = options?.name;
    const paths = options?.paths;

    function wrapper(cl: Function) {
        name = name ?? cl.name;

        debugVerbose("[defFeat] declaring feature", { class: cl, name: name, paths: paths, options: options });

        getAllFeatures().push({ paths: paths, name: name, cl: cl });
    };

    return wrapper;
}
