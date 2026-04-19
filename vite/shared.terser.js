import { parseSync } from "vite";

const passesArg = process.argv.find(arg => arg.startsWith('--passes='));
const passes = passesArg ? parseInt(passesArg.split('=')[1], 10) : 1;

export const terser = {
    compress: {
        defaults: true,
        passes: passes,
        unused: true,
        drop_debugger: false,
        ecma: 2020,
        sequences: true,
        reduce_vars: true,
        collapse_vars: true,
        dead_code: true,
        evaluate: true,
        join_vars: true,
        hoist_props: true,
    },
    format: {
        beautify: true,
        comments: true,
        braces: true
    },
    parse: {
        ecma: 2020
    }
};
