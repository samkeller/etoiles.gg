import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './open';

const directories: string[] = [];
function temporaryDirectory() {
	const directory = mkdtempSync(join(tmpdir(), 'etoiles-storage-'));
	directories.push(directory);
	return directory;
}
afterEach(() => {
	vi.unstubAllEnvs();
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it('creates local storage and preserves data and migrates old runs across reopen', () => {
	const path = join(temporaryDirectory(), 'nested', 'etoiles.db');
	let database = openDatabase(path);
	database.prepare("INSERT INTO players VALUES ('fixture', 'Fixture', 'EUW')").run();
	database.close();
	database = new Database(path);
	database.exec('DROP TABLE ingest_runs; CREATE TABLE ingest_runs (started_at INTEGER, new_matches INTEGER, status TEXT)');
	database.pragma('user_version = 3');
	database.exec(`DROP TABLE data_revision;
		DROP TRIGGER players_revision_insert; DROP TRIGGER players_revision_update; DROP TRIGGER players_revision_delete;
		DROP TRIGGER matches_revision_insert; DROP TRIGGER matches_revision_update; DROP TRIGGER matches_revision_delete;
		DROP TRIGGER participants_revision_insert; DROP TRIGGER participants_revision_update; DROP TRIGGER participants_revision_delete;
		DROP TRIGGER rank_snapshots_revision_insert; DROP TRIGGER rank_snapshots_revision_update; DROP TRIGGER rank_snapshots_revision_delete;`);
	database.prepare("INSERT INTO ingest_runs VALUES (1000, 2, 'ok')").run();
	database.close();
	database = openDatabase(path);
	try {
		expect(database.prepare('SELECT game_name FROM players').get()).toEqual({ game_name: 'Fixture' });
		expect(database.prepare('SELECT finished_at FROM ingest_runs').get()).toEqual({ finished_at: null });
	} finally { database.close(); }
});

it('requires an attached Railway volume and an absolute path within it', () => {
	vi.stubEnv('RAILWAY_ENVIRONMENT_ID', 'test');
	vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', '');
	expect(() => openDatabase(':memory:')).toThrow('persistent volume');
	const directory = temporaryDirectory();
	vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', directory);
	expect(() => openDatabase('./etoiles.db')).toThrow('inside');
	expect(() => openDatabase(join(directory, '..', 'outside.db'))).toThrow('inside');
	const database = openDatabase(join(directory, 'etoiles.db'));
	database.close();
	vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', join(directory, 'missing'));
	expect(() => openDatabase(join(directory, 'missing', 'etoiles.db'))).toThrow('not mounted');
});

it('rejects empty paths and ephemeral production storage', () => {
	expect(() => openDatabase('')).toThrow('empty');
	vi.stubEnv('NODE_ENV', 'production');
	expect(() => openDatabase(':memory:')).toThrow('persistent');
});
