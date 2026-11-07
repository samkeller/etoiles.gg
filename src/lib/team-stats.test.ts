import { describe, expect, it } from 'vitest';
import { getTeamOverview } from './team-stats';

describe('getTeamOverview', () => {
	it('returns an empty overview when no full-team matches exist', () => {
		expect(getTeamOverview([])).toEqual({
			matchCount: 0,
			winCount: 0,
			winRate: null,
			firstMatchAt: null,
			lastMatchAt: null,
			currentStreak: { result: null, count: 0 },
		});
	});

	it('excludes partial lineups and computes the latest streak', () => {
		const overview = getTeamOverview([
			{ startedAt: 300, won: true, lineupSize: 5 },
			{ startedAt: 100, won: false, lineupSize: 5 },
			{ startedAt: 200, won: false, lineupSize: 3 },
			{ startedAt: 250, won: true, lineupSize: 5 },
		]);

		expect(overview).toEqual({
			matchCount: 3,
			winCount: 2,
			winRate: 2 / 3,
			firstMatchAt: 100,
			lastMatchAt: 300,
			currentStreak: { result: 'win', count: 2 },
		});
	});
});
