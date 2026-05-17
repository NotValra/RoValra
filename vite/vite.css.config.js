import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: {
            input: {
                rovalra: 'src/css/main.scss',
                sitewide: 'src/css/sitewide.css',
            },
            output: {
                assetFileNames: 'css/[name][extname]',
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "../src/content"),
        },
    },
});
