import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDatabase } from '../lib/db/open';

describe('production runtime startup gates', () => {
	it.each([
		[{ INGEST_ENABLED: '1' }, 'INGEST_ENABLED'],
		[{ INGEST_ENABLED: 'true', RIOT_API_KEY: '' }, 'RIOT_API_KEY'],
		[{ INGEST_ENABLED: 'true', RIOT_API_KEY: 'RGAPI-00000000-0000-0000-0000-000000000000' }, 'five configured players'],
		[{ RAILWAY_ENVIRONMENT_ID: 'fixture', RAILWAY_VOLUME_MOUNT_PATH: '' }, 'persistent volume'],
	])('rejects unsafe startup before creating the web server', (configuration, message) => {
		const directory = mkdtempSync(join(tmpdir(), 'etoiles-startup-'));
		try {
			const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'serve.ts')], {
				env: {
					...process.env, NODE_ENV: 'production', INGEST_ENABLED: 'false', RIOT_API_KEY: '',
					RAILWAY_ENVIRONMENT_ID: '', RAILWAY_VOLUME_MOUNT_PATH: '',
					DATABASE_PATH: join(directory, 'etoiles.db'), ...configuration,
				},
				encoding: 'utf8', timeout: 10_000,
			});
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(message);
			expect(result.stdout).not.toContain('Next ingestion');
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it('manual ingestion refuses an active lease without recording a misleading failed run', () => {
		const directory = mkdtempSync(join(tmpdir(), 'etoiles-manual-'));
		const path = join(directory, 'etoiles.db');
		const database = openDatabase(path);
		try {
			database.prepare("INSERT INTO ingest_lock VALUES (1, 'fixture', ?)").run(Date.now() + 300_000);
			const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'ingest.ts')], {
				env: { ...process.env, DATABASE_PATH: path, RIOT_API_KEY: '' },
				encoding: 'utf8', timeout: 10_000,
			});
			expect(result.status).toBe(1);
			expect(result.stderr).toContain('already running');
			expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_runs').get()).toEqual({ count: 0 });
		} finally {
			database.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('cannot enable the schedule before the first successful ingestion', () => {
		const directory = mkdtempSync(join(tmpdir(), 'etoiles-activation-'));
		const path = join(directory, 'etoiles.db');
		const database = openDatabase(path);
		try {
			for (let index = 0; index < 5; index++) {
				database.prepare('INSERT INTO players (puuid) VALUES (?)').run(`fixture-${index}`);
			}
			const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('src', 'scripts', 'serve.ts')], {
				env: {
					...process.env, DATABASE_PATH: path, INGEST_ENABLED: 'true',
					RIOT_API_KEY: 'RGAPI-00000000-0000-0000-0000-000000000000',
				},
				encoding: 'utf8', timeout: 10_000,
			});
			expect(result.status).toBe(1);
			expect(result.stderr).toContain('successful manual ingestion first');
		} finally {
			database.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
