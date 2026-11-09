import { describe, expect, it } from 'vitest';
import type { RankSnapshot } from './individual';
import { rankCoordinate, rankPoints } from './ranks';

const rank = (capturedOn: string, changes: Partial<RankSnapshot> = {}): RankSnapshot => ({
	capturedOn, tier: 'GOLD', division: 'II', leaguePoints: 20, wins: 10, losses: 8, ...changes,
});
describe('dated rank progression', () => {
	it('keeps divisions and promotions ordered, apex tiers on a shared LP baseline and unranked gaps', () => {
		expect(rankCoordinate(rank('2026-01-01'))).toBe(1420);
		const gold1 = rankCoordinate(rank('2026-01-01', { division: 'I', leaguePoints: 99 }))!;
		expect(rankCoordinate(rank('2026-01-02', { tier: 'PLATINUM', division: 'IV', leaguePoints: 0 }))).toBe(gold1 + 1);
		for (const tier of ['MASTER', 'GRANDMASTER', 'CHALLENGER']) expect(rankCoordinate(rank('2026-01-01', { tier, division: 'I', leaguePoints: 300 }))).toBe(3100);
		expect(rankCoordinate(rank('2026-01-01', { tier: null }))).toBeNull();
	});

	it('uses actual dates and breaks lines on missing days, unranked periods and counter resets', () => {
		const points = rankPoints([
			rank('2026-01-01'), rank('2026-01-02'), rank('2026-01-04'),
			rank('2026-01-05', { tier: null }), rank('2026-01-06'),
			rank('2026-01-07', { wins: 0, losses: 0 }),
		]);
		expect(points.map((point) => point.breakBefore)).toEqual([true, false, true, false, true, true]);
		expect(points[2].at - points[1].at).toBe(2 * 86400000);
	});

	it('refuses fabricated dates, duplicate dates and unsupported ranks', () => {
		expect(() => rankPoints([rank('2026-02-30')])).toThrow('Invalid rank snapshot date');
		expect(() => rankPoints([rank('2026-01-01'), rank('2026-01-01')])).toThrow('Invalid rank snapshot date');
		expect(() => rankCoordinate(rank('2026-01-01', { tier: 'NEW_TIER' }))).toThrow('Unsupported rank');
		expect(() => rankCoordinate(rank('2026-01-01', { leaguePoints: -1 }))).toThrow('Invalid rank snapshot LP');
	});
});
