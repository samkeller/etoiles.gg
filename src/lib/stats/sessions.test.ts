import { describe, expect, it } from 'vitest';
import { getTeamSessions } from './sessions';
import type { MatchSummary } from './matches';

function match(id: string, startedAt: number, outcome: MatchSummary['outcome'] = 'win'): MatchSummary {
	return {
		id,
		startedAt,
		durationS: 1800,
		patch: '16.22',
		outcome,
		lineupSize: 5,
		kills: 0,
		deaths: 0,
		assists: 0,
		members: [],
	};
}

describe('getTeamSessions', () => {
	it('groups continuous matches across midnight and returns sessions newest first', () => {
		const matches = [
			match('EUW1_1', Date.parse('2026-11-07T22:30:00Z')),
			match('EUW1_2', Date.parse('2026-11-08T00:10:00Z'), 'loss'),
			match('EUW1_3', Date.parse('2026-11-08T19:00:00Z')),
		];

		expect(getTeamSessions(matches).map((session) => ({
			dateKey: session.dateKey,
			matchIds: session.matches.map(({ id }) => id),
			wins: session.wins,
			losses: session.losses,
		}))).toEqual([
			{ dateKey: '2026-11-08', matchIds: ['EUW1_3'], wins: 1, losses: 0 },
			{ dateKey: '2026-11-07', matchIds: ['EUW1_2', 'EUW1_1'], wins: 1, losses: 1 },
		]);
	});

	it('returns no fabricated sessions for an empty history', () => {
		expect(getTeamSessions([])).toEqual([]);
	});
});
