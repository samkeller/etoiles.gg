import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDatabase } from './migrations';
import { SCHEMA } from './schema';
import { addMatch, addPlayer, fullLineup } from '../stats/fixtures';

let database: Database.Database | undefined;

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

		migrateDatabase(database);
		migrateDatabase(database);

		expect(database.pragma('user_version', { simple: true })).toBe(3);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 5 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM rank_snapshots').get()).toEqual({ count: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM individual_ingest_cursors').get()).toEqual({ count: 0 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_backfill_cursors').get()).toEqual({ count: 0 });
	});

	it('adds resumable backfill state to an already migrated database', () => {
		database = new Database(':memory:');
		database.exec(SCHEMA);
		addPlayer(database, 'player-0', 'Étoile');
		addMatch(database, { id: 'EUW1_123', startedAt: 123, won: true, members: fullLineup() });
		database.pragma('user_version = 1');

		migrateDatabase(database);

		expect(database.pragma('user_version', { simple: true })).toBe(3);
		expect(database.prepare('SELECT COUNT(*) AS count FROM matches').get()).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM participants').get()).toEqual({ count: 5 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM ingest_backfill_cursors').get()).toEqual({ count: 0 });
	});

	it('repairs retry columns on a database already marked with the prior version', () => {
		database = new Database(':memory:');
		database.exec(SCHEMA);
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

		expect(database.pragma('user_version', { simple: true })).toBe(3);
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
});
