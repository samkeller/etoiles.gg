import type Database from 'better-sqlite3';

interface Migration {
	version: number;
	sql: string;
}

const migrations: readonly Migration[] = [
	{
		version: 1,
		sql: `
			CREATE TABLE individual_ingest_cursors (
				puuid TEXT NOT NULL REFERENCES players(puuid),
				queue_id INTEGER NOT NULL CHECK (queue_id = 420),
				start_time INTEGER NOT NULL,
				PRIMARY KEY (puuid, queue_id)
			);

			CREATE TABLE rank_snapshots (
				puuid TEXT NOT NULL REFERENCES players(puuid),
				queue_type TEXT NOT NULL CHECK (queue_type IN ('RANKED_SOLO_5x5', 'RANKED_FLEX_SR')),
				captured_on TEXT NOT NULL,
				tier TEXT,
				division TEXT,
				league_points INTEGER,
				wins INTEGER,
				losses INTEGER,
				PRIMARY KEY (puuid, queue_type, captured_on),
				CHECK (
					(tier IS NULL AND division IS NULL AND league_points IS NULL AND wins IS NULL AND losses IS NULL)
					OR
					(tier IS NOT NULL AND division IS NOT NULL AND league_points IS NOT NULL AND
						wins IS NOT NULL AND losses IS NOT NULL AND league_points >= 0 AND wins >= 0 AND losses >= 0)
				)
			);

			CREATE INDEX rank_snapshots_by_player_date
				ON rank_snapshots(puuid, captured_on DESC);
			CREATE INDEX matches_by_queue_date
				ON matches(queue_id, game_start_ts DESC);
		`,
	},
];

export function migrateDatabase(database: Database.Database): void {
	const currentVersion = Number(database.pragma('user_version', { simple: true }));
	if (!Number.isInteger(currentVersion) || currentVersion < 0) {
		throw new Error('Invalid SQLite schema version.');
	}

	for (const migration of migrations) {
		if (migration.version <= currentVersion) continue;
		const apply = database.transaction(() => {
			database.exec(migration.sql);
			database.pragma(`user_version = ${migration.version}`);
		});
		apply();
	}
}
