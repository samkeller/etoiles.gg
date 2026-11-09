import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateDatabase } from '../db/migrations';
import { healthResponse } from '../health';
import { getSyncStatus } from '../sync-status';
import { cachedRead, clearReadCache, MAX_READ_CACHE_CHARACTERS, MAX_READ_CACHE_ENTRIES, readCacheMetrics } from './cache';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup, seedRankedHistory } from './fixtures';
import { getMatches } from './matches';
import { getPlayers } from './players';
import { getIndividualProfiles } from './individual';
import { getOverview } from './overview';
import { getCollective } from './collective';
import { getTeamBans } from './bans';
import { getDraftHistory, getSessionHistory } from './read-model';

afterEach(closeTestDatabases);

const readers = [getMatches, getPlayers, getIndividualProfiles, getOverview, getCollective, getTeamBans, getDraftHistory, getSessionHistory] as const;

describe('versioned statistics cache', () => {
	it('preserves every summary and scope, avoids source queries on hits and isolates mutable results', () => {
		const database = createTestDatabase();
		seedRankedHistory(database, 100);
		for (const reader of readers) {
			const expected = database.transaction(() => reader(database))();
			expect(reader(database)).toEqual(expected);
			expect(reader(database)).toEqual(expected);
		}
		const full = database.transaction(() => getMatches(database, 'full'))();
		const partial = database.transaction(() => getMatches(database, 'partial'))();
		expect(getMatches(database, 'full')).toEqual(full);
		expect(getMatches(database, 'partial')).toEqual(partial);
		expect(full.every((match) => match.lineupSize === 5)).toBe(true);
		expect(partial.every((match) => match.lineupSize >= 2 && match.lineupSize < 5)).toBe(true);
		const prepare = vi.spyOn(database, 'prepare');
		try {
			getPlayers(database);
			expect(prepare).toHaveBeenCalledTimes(1);
			expect(prepare).toHaveBeenCalledWith('SELECT version FROM data_revision WHERE id = 1');
		} finally {
			prepare.mockRestore();
		}
		const matches = getMatches(database);
		matches[0].members[0].name = 'Changed by caller';
		matches.reverse();
		expect(getMatches(database)).toEqual(full);
		const players = getPlayers(database);
		players[0].champions.splice(0);
		expect(getPlayers(database)[0].champions.length).toBeGreaterThan(0);
	});

	it('invalidates on inserts, repairs, renames, snapshots and deletions but not operational writes', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		expect(getPlayers(database)[0].name).toBe('Original');
		database.prepare('UPDATE players SET game_name = ?').run('Renamed');
		expect(getPlayers(database)[0].name).toBe('Renamed');
		expect(getMatches(database)).toHaveLength(1);
		addMatch(database, { id: 'EUW1_2', startedAt: 2, won: false, members: fullLineup() });
		database.prepare("INSERT INTO ingest_runs (status) VALUES ('failed')").run();
		expect(getMatches(database)).toHaveLength(2);
		expect(getOverview(database).winRate).toBe(0.5);
		database.exec(`INSERT INTO rank_snapshots
			(puuid, queue_type, captured_on, tier, division, league_points, wins, losses)
			VALUES ('player-0', 'RANKED_SOLO_5x5', '2026-11-09', 'GOLD', 'II', 20, 5, 4)`);
		expect(getIndividualProfiles(database)[0].soloDuo.currentRank?.leaguePoints).toBe(20);
		database.transaction(() => {
			database.exec(`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].kills', 42)
				WHERE match_id = 'EUW1_1';
				UPDATE participants SET kills = 42 WHERE match_id = 'EUW1_1' AND puuid = 'player-0';`);
		})();
		expect(getMatches(database).find((match) => match.id === 'EUW1_1')!.members[0].kills).toBe(42);
		const version = readCacheMetrics(database).version;
		database.exec(`UPDATE players SET game_name = game_name;
			INSERT INTO ingest_pending (match_id) VALUES ('EUW1_999');
			INSERT INTO ingest_cursors VALUES ('player-0', 1);
			INSERT INTO ingest_lock VALUES (1, 'test', 100);
			INSERT INTO ingest_runs (status) VALUES ('ok');`);
		expect(healthResponse(database).status).toBe(200);
		expect(getSyncStatus(database).pendingMatches).toBe(1);
		getPlayers(database);
		expect(readCacheMetrics(database).version).toBe(version);
		database.transaction(() => {
			database.exec("DELETE FROM participants WHERE match_id = 'EUW1_2'; DELETE FROM matches WHERE match_id = 'EUW1_2'");
		})();
		expect(getMatches(database)).toHaveLength(1);
	});

	it('does not hide invalid data or cache failures, and can recover after a repair', () => {
		const database = createTestDatabase();
		seedRankedHistory(database, 10);
		getMatches(database);
		database.exec("UPDATE participants SET kills = 999 WHERE match_id = 'EUW1_5'");
		expect(() => getMatches(database)).toThrow('Inconsistent');
		expect(() => getMatches(database)).toThrow('Inconsistent');
		database.exec(`UPDATE participants SET kills = (
			SELECT json_extract(raw.value, '$.kills') FROM matches,
				json_each(matches.raw_json, '$.info.participants') AS raw
			WHERE matches.match_id = participants.match_id AND json_extract(raw.value, '$.puuid') = participants.puuid
		) WHERE match_id = 'EUW1_5'`);
		expect(getMatches(database)).toHaveLength(4);
	});

	it('does not publish uncommitted reads or lose a valid cache on rollback', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Original');
		getPlayers(database);
		const before = readCacheMetrics(database);
		expect(() => database.transaction(() => {
			database.exec("UPDATE players SET game_name = 'Uncommitted'");
			expect(getPlayers(database)[0].name).toBe('Uncommitted');
			throw new Error('Rollback');
		})()).toThrow('Rollback');
		expect(readCacheMetrics(database)).toEqual(before);
		expect(getPlayers(database)[0].name).toBe('Original');
	});

	it('fails explicitly if revision metadata is missing instead of serving stale results', () => {
		const database = createTestDatabase();
		getPlayers(database);
		database.exec('DELETE FROM data_revision');
		expect(() => getPlayers(database)).toThrow('Invalid statistics data revision');
	});

	it('bounds retained payload and entry count, bypasses oversized values and resets on restart', () => {
		const database = createTestDatabase();
		for (let index = 0; index <= MAX_READ_CACHE_ENTRIES; index += 1) {
			cachedRead(database, `test:${index}`, () => ({ index }));
		}
		expect(readCacheMetrics(database).entries).toBe(MAX_READ_CACHE_ENTRIES);
		const large = 'x'.repeat(Math.floor(MAX_READ_CACHE_CHARACTERS / 2));
		cachedRead(database, 'large:1', () => large);
		cachedRead(database, 'large:2', () => large);
		expect(readCacheMetrics(database).characters).toBeLessThanOrEqual(MAX_READ_CACHE_CHARACTERS);
		const oversized = vi.fn(() => large + large);
		cachedRead(database, 'oversized', oversized);
		cachedRead(database, 'oversized', oversized);
		expect(oversized).toHaveBeenCalledTimes(2);
		clearReadCache(database);
		expect(readCacheMetrics(database)).toMatchObject({ version: null, entries: 0, characters: 0 });
		expect(getOverview(database).matchCount).toBe(0);
	});

	it('detects another process writing while the server uses a read-only connection', () => {
		const directory = mkdtempSync(join(tmpdir(), 'etoiles-cache-'));
		const path = join(directory, 'database.sqlite');
		let reader: Database.Database | undefined;
		try {
			const writer = new Database(path);
			try {
				writer.pragma('journal_mode = WAL');
				migrateDatabase(writer);
				addPlayer(writer, 'player-0', 'Original');
			} finally {
				writer.close();
			}
			reader = new Database(path, { readonly: true });
			expect(getPlayers(reader)[0].name).toBe('Original');
			const result = spawnSync(process.execPath, ['--input-type=module', '-e',
				`import Database from 'better-sqlite3';
				const db = new Database(process.argv[1]);
				db.prepare('UPDATE players SET game_name = ?').run('Manual sync');
				db.close();`, path], { encoding: 'utf8', timeout: 10000 });
			expect(result.stderr).toBe('');
			expect(result.status).toBe(0);
			expect(getPlayers(reader)[0].name).toBe('Manual sync');
		} finally {
			reader?.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
