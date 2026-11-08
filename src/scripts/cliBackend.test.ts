import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('backend CLI failures', () => {
	it.each(['ingest', 'syncAssets', 'resolvePuids'])('%s exits nonzero and reports errors even with silent logging', (script) => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', `${script}.ts`), 'Name#TAG'], {
			env: { ...process.env, DATABASE_PATH: ':memory:', RIOT_API_KEY: '', LOG_LEVEL: 'silent' },
			encoding: 'utf8',
			timeout: 10_000,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('RIOT_API_KEY');
		expect(result.stdout).not.toContain('✓');
	});
});
