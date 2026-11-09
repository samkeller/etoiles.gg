import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { openDatabase } from '../lib/db/open';

describe('backend CLI failures', () => {
	it('syncAssets exits nonzero and reports errors even with silent logging', () => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'syncAssets.ts')], {
			env: { ...process.env, DATABASE_PATH: ':memory:', RIOT_API_KEY: '', LOG_LEVEL: 'silent' },
			encoding: 'utf8',
			timeout: 10_000,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('RIOT_API_KEY');
		expect(result.stdout).not.toContain('✓');
	});

	it.each([['update'], ['history'], ['setup', 'Name#TAG']])('sync %j reports key failures with silent logging', (...args) => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'sync.ts'), ...args], {
			env: { ...process.env, DATABASE_PATH: ':memory:', RIOT_API_KEY: '', LOG_LEVEL: 'silent' },
			encoding: 'utf8', timeout: 10_000,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('RIOT_API_KEY');
		expect(result.stdout).not.toContain('réussi');
	});

	it.each([['help'], ['--help'], ['status']])('sync %j works without an API key even with silent logging', (...args) => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'sync.ts'), ...args], {
			env: { ...process.env, DATABASE_PATH: ':memory:', RIOT_API_KEY: '', LOG_LEVEL: 'silent' },
			encoding: 'utf8', timeout: 10_000,
		});
		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
		expect(result.stdout).toContain(args[0] === 'status' ? 'Aucun joueur enregistré' : 'Usage:');
	});

	it('sync validates all explicit IDs before checking credentials or opening the database', () => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'sync.ts'), 'setup', 'Good#TAG', 'invalid'], {
			env: { ...process.env, DATABASE_PATH: 'missing-parent\\db.sqlite', RIOT_API_KEY: '', PLAYERS: 'Other#TAG', LOG_LEVEL: 'silent' },
			encoding: 'utf8', timeout: 10_000,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Invalid Riot ID');
		expect(result.stderr).not.toContain('RIOT_API_KEY');
	});

	it('refuses every mutating CLI during an active lease while keeping status readable', () => {
		const path = resolve(`.sync-cli-test-${randomUUID()}.db`);
		const database = openDatabase(path);
		try {
			database.prepare("INSERT INTO ingest_lock VALUES (1, 'fixture', ?)").run(Date.now() + 300_000);
			for (const [script, args] of [
				['sync', ['setup', 'Name#TAG']], ['sync', ['update']], ['sync', ['history', '--max-duration', '1']],
			] as const) {
				const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', `${script}.ts`), ...args], {
					env: { ...process.env, DATABASE_PATH: path, RIOT_API_KEY: '', LOG_LEVEL: 'silent' },
					encoding: 'utf8', timeout: 10_000,
				});
				expect(result.status).toBe(1);
				expect(result.stderr).toContain('already running');
			}
			const status = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'sync.ts'), 'status'], {
				env: { ...process.env, DATABASE_PATH: path, RIOT_API_KEY: '', LOG_LEVEL: 'silent' },
				encoding: 'utf8', timeout: 10_000,
			});
			expect(status.status).toBe(0);
			expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_runs').get()).toEqual({ count: 0 });
			expect(database.prepare('SELECT owner FROM ingest_lock').get()).toEqual({ owner: 'fixture' });
		} finally {
			database.close();
			for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
		}
	});

	it('sync explicit valid IDs override malformed PLAYERS', () => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'sync.ts'), 'setup', 'Name#TAG'], {
			env: { ...process.env, DATABASE_PATH: ':memory:', RIOT_API_KEY: '', PLAYERS: 'invalid', LOG_LEVEL: 'silent' },
			encoding: 'utf8', timeout: 10_000,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('RIOT_API_KEY');
	});

	it('sync falls back to PLAYERS when no IDs are supplied', () => {
		const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'sync.ts'), 'setup'], {
			env: { ...process.env, DATABASE_PATH: ':memory:', RIOT_API_KEY: '', PLAYERS: 'Name#TAG', LOG_LEVEL: 'silent' },
			encoding: 'utf8', timeout: 10_000,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('RIOT_API_KEY');
	});
});
