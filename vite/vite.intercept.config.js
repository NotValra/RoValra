import { defineConfig } from 'vite';
import { terser } from './shared.terser.js';
import path from 'path';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        minify: false,
        terserOptions: terser,
        rollupOptions: {
            input: 'src/content/core/xhr/intercept.js',
            output: {
                format: 'iife',
                inlineDynamicImports: true,
                entryFileNames: 'intercept.js',
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "../src/content"),
        },
    },
});
