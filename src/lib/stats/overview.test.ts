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
		addMatch(database, { id: 'EUW1_100', startedAt: 100, won: false, members: fullLineup() });
		addMatch(database, { id: 'EUW1_400', startedAt: 400, won: true, members: fullLineup().slice(0, 4) });
		addMatch(database, { id: 'EUW1_250', startedAt: 250, won: true, members: fullLineup() });
		addMatch(database, { id: 'EUW1_300', startedAt: 300, won: true, members: fullLineup() });

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
			addMatch(database, { id: `EUW1_${index + 1}`, startedAt: index, won, members: fullLineup() }),
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
		addMatch(database, { id: 'EUW1_100', startedAt: 100, won: true, members: fullLineup().slice(0, 4), lineupSize: 5 });

		expect(() => getOverview(database)).toThrow('Inconsistent data found in match EUW1_100.');
	});

	it('rejects a raw Solo/Duo payload stored as a Flex team match', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_100', startedAt: 100, won: true, members: fullLineup() });
		const row = database.prepare('SELECT raw_json AS rawJson FROM matches WHERE match_id = ?')
			.get('EUW1_100') as { rawJson: string };
		const raw = JSON.parse(row.rawJson);
		raw.info.queueId = 420;
		database.prepare('UPDATE matches SET raw_json = ? WHERE match_id = ?')
			.run(JSON.stringify(raw), 'EUW1_100');

		expect(() => getOverview(database)).toThrow('Inconsistent queue in full-team match EUW1_100.');
	});
});
