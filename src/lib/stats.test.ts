import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { getOverview, RECENT_FORM_SIZE } from './stats';

const databases: Database.Database[] = [];

function createDatabase() {
	const database = new Database(':memory:');
	database.exec(readFileSync(new URL('./db/schema.sql', import.meta.url), 'utf8'));
	databases.push(database);
	return database;
}

function addMatch(
	database: Database.Database,
	matchId: string,
	startedAt: number,
	won: boolean,
	lineupSize: number,
	participantCount = lineupSize,
) {
	database
		.prepare(
			'INSERT INTO matches (match_id, game_start_ts, duration_s, queue_id) VALUES (?, ?, ?, ?)',
		)
		.run(matchId, startedAt, 1800, 440);

	const insertParticipant = database.prepare(`
		INSERT INTO participants
			(match_id, puuid, champion, role, kills, deaths, assists, win, lineup_size)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	for (let player = 0; player < participantCount; player += 1) {
		insertParticipant.run(matchId, `player-${player}`, 'Aatrox', 'TOP', 1, 0, 2, Number(won), lineupSize);
	}
}

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

describe('getOverview', () => {
	it('returns an empty overview when no full-team matches exist', () => {
		expect(getOverview(createDatabase())).toEqual({
			matchCount: 0,
			winCount: 0,
			lossCount: 0,
			winRate: null,
			firstMatchAt: null,
			lastMatchAt: null,
			currentStreak: { result: null, count: 0 },
			bestWinStreak: 0,
			recentForm: [],
		});
	});

	it('counts only complete five-player matches and computes the latest streak', () => {
		const database = createDatabase();
		addMatch(database, 'old-loss', 100, false, 5);
		addMatch(database, 'partial', 400, true, 4);
		addMatch(database, 'recent-win-1', 250, true, 5);
		addMatch(database, 'recent-win-2', 300, true, 5);

		expect(getOverview(database)).toEqual({
			matchCount: 3,
			winCount: 2,
			lossCount: 1,
			winRate: 2 / 3,
			firstMatchAt: 100,
			lastMatchAt: 300,
			currentStreak: { result: 'win', count: 2 },
			bestWinStreak: 2,
			recentForm: ['loss', 'win', 'win'],
		});
	});

	it('tracks the best win streak and keeps only the most recent form', () => {
		const database = createDatabase();
		const results = [true, true, true, false, ...Array.from({ length: RECENT_FORM_SIZE }, (_, i) => i % 2 === 0)];
		results.forEach((won, index) => addMatch(database, `match-${index}`, index, won, 5));

		const overview = getOverview(database);

		expect(overview.bestWinStreak).toBe(3);
		expect(overview.recentForm).toHaveLength(RECENT_FORM_SIZE);
		expect(overview.recentForm[0]).toBe('win');
		expect(overview.recentForm.at(-1)).toBe('loss');
		expect(overview.currentStreak).toEqual({ result: 'loss', count: 1 });
	});

	it('surfaces inconsistent records marked as a full lineup', () => {
		const database = createDatabase();
		addMatch(database, 'incomplete', 100, true, 5, 4);

		expect(() => getOverview(database)).toThrow('Inconsistent data found in a full-team match.');
	});
});
