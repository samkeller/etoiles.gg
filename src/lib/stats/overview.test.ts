import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getOverview, RECENT_FORM_SIZE } from './overview';

afterEach(closeTestDatabases);

describe('getOverview', () => {
	it('returns an empty overview when no full-team matches exist', () => {
		expect(getOverview(createTestDatabase())).toEqual({
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
		const database = createTestDatabase();
		addMatch(database, { id: 'old-loss', startedAt: 100, won: false, members: fullLineup() });
		addMatch(database, { id: 'partial', startedAt: 400, won: true, members: fullLineup().slice(0, 4) });
		addMatch(database, { id: 'recent-win-1', startedAt: 250, won: true, members: fullLineup() });
		addMatch(database, { id: 'recent-win-2', startedAt: 300, won: true, members: fullLineup() });

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
		const database = createTestDatabase();
		const results = [true, true, true, false, ...Array.from({ length: RECENT_FORM_SIZE }, (_, i) => i % 2 === 0)];
		results.forEach((won, index) =>
			addMatch(database, { id: `match-${index}`, startedAt: index, won, members: fullLineup() }),
		);

		const overview = getOverview(database);

		expect(overview.bestWinStreak).toBe(3);
		expect(overview.recentForm).toHaveLength(RECENT_FORM_SIZE);
		expect(overview.recentForm[0]).toBe('win');
		expect(overview.recentForm.at(-1)).toBe('loss');
		expect(overview.currentStreak).toEqual({ result: 'loss', count: 1 });
	});

	it('surfaces inconsistent records marked as a full lineup', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'incomplete', startedAt: 100, won: true, members: fullLineup().slice(0, 4), lineupSize: 5 });

		expect(() => getOverview(database)).toThrow('Inconsistent data found in a full-team match.');
	});
});
