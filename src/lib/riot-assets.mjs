import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

/** @returns {import('astro').AstroIntegration} */
export function riotAssets() {
	/** @type {Map<string, Buffer>} */
	const files = new Map();
	/** @type {URL | undefined} */
	let destination;
	return {
		name: 'riot-assets',
		hooks: {
			'astro:config:setup': async ({ config, command, updateConfig }) => {
				/** @type {Record<string, string>} */
				const urls = {};
				if (command === 'build') {
					for (const group of ['champions', 'ranks']) {
						const directory = new URL(`riot/${group}/`, config.publicDir);
						for (const name of await readdir(directory)) {
							if (!name.endsWith('.png')) continue;
							const bytes = await readFile(new URL(name, directory));
							const hash = createHash('sha256').update(bytes).digest('hex');
							const filename = `${hash}.png`;
							files.set(filename, bytes);
							urls[`/riot/${group}/${name}`] = `${config.base.replace(/\/$/, '')}/${config.build.assets}/riot/${filename}`;
						}
					}
				}
				updateConfig({ vite: { define: { __RIOT_ASSETS__: JSON.stringify(urls) } } });
			},
			'astro:config:done': ({ config }) => {
				destination = new URL(`${config.build.assets}/riot/`, config.build.client);
			},
			'astro:build:done': async () => {
				if (!destination) throw new Error('Missing Riot asset build destination');
				await mkdir(destination, { recursive: true });
				await Promise.all([...files].map(([name, bytes]) => writeFile(new URL(name, destination), bytes)));
			},
		},
	};
}
