import { defineConfig } from 'vite';

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
});
