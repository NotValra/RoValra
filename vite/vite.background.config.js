import { defineConfig } from 'vite';
import { terser } from './shared.terser.js';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        minify: 'terser',
        terserOptions: terser,
        rollupOptions: {
            input: 'src/background/background.js',
            output: {
                format: 'iife',
                inlineDynamicImports: true,
                entryFileNames: 'background.js',
            },
        },
    },
});
