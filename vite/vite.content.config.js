import { defineConfig } from 'vite';
import path from 'path';
import { terser } from './shared.terser.js';

import fs from 'fs';
const draco = fs.readFileSync(
    path.resolve(__dirname, '../node_modules/roavatar-renderer/dist/draco_decoder.js'),
    'utf-8'
);

export default defineConfig({
	build: {
		outDir: 'dist',
		emptyOutDir: false,
		minify: 'terser',
		terserOptions: terser,
		rollupOptions: {
			input: path.resolve(__dirname, '../src/content/index.js'),
			output: {
				format: 'iife',
				inlineDynamicImports: true,
				entryFileNames: 'content.js',
				intro: draco
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "../src/content"),
	  	},
	},
});
