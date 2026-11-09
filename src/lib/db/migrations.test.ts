import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDatabase, SCHEMA_VERSION } from './migrations';
import { SCHEMA } from './schema';
import { addMatch, addPlayer, fullLineup } from '../stats/fixtures';

let database: Database.Database | undefined;

function removeRevisionTracking(database: Database.Database): void {
	const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[];
	for (const { name } of triggers) database.exec(`DROP TRIGGER "${name}"`);
	database.exec('DROP TABLE data_revision');
}

afterEach(() => {
	database?.close();
	database = undefined;
});

describe('database migrations', () => {
	it('adds versioned tables without changing historical match rows and can be rerun', () => {
		database = new Database(':memory:');
		database.exec(SCHEMA);
		addPlayer(database, 'player-0', 'Étoile');
		addMatch(database, { id: 'EUW1_123', startedAt: 123, won: true, members: fullLineup() });
		const historicalMatch = database.prepare('SELECT * FROM matches').get();
		const historicalMembers = database.prepare('SELECT * FROM participants ORDER BY puuid').all();

		migrateDatabase(database);
		migrateDatabase(database);

		expect(database.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 5 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM rank_snapshots').get()).toEqual({ count: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM individual_ingest_cursors').get()).toEqual({ count: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_backfill_cursors').get()).toEqual({ count: 0 });
		expect(database.prepare('SELECT * FROM matches').get()).toEqual(historicalMatch);
		expect(database.prepare('SELECT * FROM participants ORDER BY puuid').all()).toEqual(historicalMembers);
	});

	it('adds resumable backfill state to an already migrated database', () => {
		database = new Database(':memory:');
		database.exec(SCHEMA);
		migrateDatabase(database);
		removeRevisionTracking(database);
		database.exec(`DROP TABLE ingest_backfill_cursors;
			ALTER TABLE ingest_pending DROP COLUMN attempts;
			ALTER TABLE ingest_pending DROP COLUMN next_attempt_at;`);
		addPlayer(database, 'player-0', 'Étoile');
		addMatch(database, { id: 'EUW1_123', startedAt: 123, won: true, members: fullLineup() });
		database.pragma('user_version = 1');

		migrateDatabase(database);

		expect(database.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 5 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_backfill_cursors').get()).toEqual({ count: 0 });
	});

	it('repairs retry columns on a database already marked with the prior version', () => {
		database = new Database(':memory:');
		database.exec(SCHEMA);
		migrateDatabase(database);
		removeRevisionTracking(database);
		database.exec(`DROP TABLE ingest_backfill_cursors;
			ALTER TABLE ingest_pending DROP COLUMN attempts;
			ALTER TABLE ingest_pending DROP COLUMN next_attempt_at;`);
		database.prepare('INSERT INTO ingest_pending (match_id) VALUES (?)').run('EUW1_123');
		database.exec(`CREATE TABLE ingest_backfill_cursors (
			puuid TEXT NOT NULL,
			queue_id INTEGER NOT NULL,
			next_start INTEGER NOT NULL DEFAULT 0,
			is_complete INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (puuid, queue_id)
		)`);
		database.pragma('user_version = 2');

		migrateDatabase(database);

		expect(database.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
		expect((database.pragma('table_info(ingest_pending)') as { name: string }[]).map((column) => column.name))
			.toContain('next_attempt_at');
		expect(database.prepare('SELECT match_id, attempts, next_attempt_at FROM ingest_pending').get())
			.toEqual({ match_id: 'EUW1_123', attempts: 0, next_attempt_at: 0 });
	});

	it('rejects malformed or partial rank snapshots', () => {
		database = new Database(':memory:');
		database.exec(SCHEMA);
		addPlayer(database, 'player-0', 'Étoile');
		migrateDatabase(database);

		expect(() => database!.prepare(`INSERT INTO rank_snapshots
			(puuid, queue_type, captured_on, tier, division, league_points, wins, losses)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('player-0', 'RANKED_SOLO_5x5', '2026-11-08', 'GOLD', 'II', null, 2, 1))
		.toThrow();
	});

	it('bootstraps a fresh database through migrations only', () => {
		database = new Database(':memory:');
		migrateDatabase(database);
		expect(database.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
		expect(database.prepare('SELECT version FROM data_revision').get()).toEqual({ version: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 0 });
	});

	it('rejects future versions without modifying the database', () => {
		database = new Database(':memory:');
		database.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
		expect(() => migrateDatabase(database!)).toThrow('newer than supported');
		expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
	});

	it('rolls back a failed migration and does not advance its version', () => {
		database = new Database(':memory:');
		database.exec('CREATE TABLE individual_ingest_cursors (fixture TEXT)');
		expect(() => migrateDatabase(database!)).toThrow();
		expect(database.pragma('user_version', { simple: true })).toBe(0);
		expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all())
			.toEqual([{ name: 'individual_ingest_cursors' }]);
	});

	it('preserves ranks and resumable state when upgrading an old V3 base', () => {
		database = new Database(':memory:');
		migrateDatabase(database);
		removeRevisionTracking(database);
		database.exec('ALTER TABLE ingest_runs DROP COLUMN finished_at');
		addPlayer(database, 'player-0', 'Étoile');
		addMatch(database, { id: 'EUW1_123', startedAt: 123, won: true, members: fullLineup() });
		database.exec(`INSERT INTO rank_snapshots VALUES ('player-0', 'RANKED_SOLO_5x5', '2026-11-08', 'GOLD', 'II', 50, 20, 10);
			INSERT INTO ingest_cursors VALUES ('player-0', 123);
			INSERT INTO individual_ingest_cursors VALUES ('player-0', 420, 456);
			INSERT INTO ingest_backfill_cursors VALUES ('player-0', 440, 200, 0, 789);
			INSERT INTO ingest_pending VALUES ('EUW1_999', 3, 999);
			INSERT INTO ingest_runs VALUES (100, 2, 'ok');`);
		const tables = ['players', 'matches', 'participants', 'rank_snapshots', 'ingest_cursors',
			'individual_ingest_cursors', 'ingest_backfill_cursors', 'ingest_pending'];
		const previous = tables.map((table) => database!.prepare(`SELECT * FROM ${table}`).all());
		database.pragma('user_version = 3');
		migrateDatabase(database);
		for (const [index, table] of tables.entries()) {
			expect(database.prepare(`SELECT * FROM ${table}`).all()).toEqual(previous[index]);
		}
		expect(database.prepare('SELECT * FROM ingest_runs').get())
			.toEqual({ started_at: 100, new_matches: 2, status: 'ok', finished_at: null });
	});
});
