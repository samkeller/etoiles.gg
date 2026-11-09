import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { riotAssets } from './riot-assets.mjs';

it('versions original image bytes in production and leaves development URLs unchanged', async () => {
	const integration = riotAssets();
	const setup = integration.hooks['astro:config:setup']!;
	const configs: unknown[] = [];
	const context = {
		config: { publicDir: new URL('../../public/', import.meta.url), base: '/', build: { assets: '_astro' } },
		command: 'build',
		updateConfig: (value: unknown) => { configs.push(value); },
	};
	// The integration only consumes the configuration/update callback from this hook.
	await Reflect.apply(setup, undefined, [context]);
	const result = configs[0] as { vite: { define: { __RIOT_ASSETS__: string } } };
	const urls = JSON.parse(result.vite.define.__RIOT_ASSETS__) as Record<string, string>;
	const bytes = await readFile(new URL('../../public/riot/champions/Ahri.png', import.meta.url));
	const hash = createHash('sha256').update(bytes).digest('hex');
	expect(urls['/riot/champions/Ahri.png']).toBe(`/_astro/riot/${hash}.png`);
	expect(Object.keys(urls).some((path) => path.startsWith('/riot/profiles/'))).toBe(true);
	expect(Object.keys(urls).some((path) => path.startsWith('/riot/ranks/'))).toBe(true);
	expect(Object.keys(urls).length).toBeGreaterThan(170);
	await Reflect.apply(setup, undefined, [{ ...context, command: 'dev' }]);
	expect(configs[1]).toEqual({ vite: { define: { __RIOT_ASSETS__: '{}' } } });
});
