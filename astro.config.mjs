// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { riotAssets } from './src/lib/riot-assets.mjs';

export default defineConfig({
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [preact(), riotAssets()],
	vite: {
		plugins: [tailwindcss()],
	},
});
