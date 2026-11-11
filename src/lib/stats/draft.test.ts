import { describe, expect, it } from 'vitest';
import {
	compositionsForSeats,
	explorationPicks,
	matchesWithPicks,
	pairRecords,
	pickSynergy,
	type DraftMatch,
} from './draft';

const match = (id: string, startedAt: number, outcome: 'win' | 'loss', champions: string[]): DraftMatch => ({
	id,
	startedAt,
	outcome,
	picks: champions.map((champion, index) => ({ puuid: `p${index}`, champion })),
});

const matches: DraftMatch[] = [
	match('EUW1_1', 1, 'win', ['Jax', 'Vi', 'Ahri', 'Jinx', 'Lulu']),
	match('EUW1_2', 2, 'loss', ['Jax', 'Vi', 'Lux', 'Jinx', 'Nami']),
	match('EUW1_3', 3, 'win', ['Garen', 'Vi', 'Ahri', 'Jinx', 'Lulu']),
	match('EUW1_4', 4, 'win', ['Jax', 'Vi', 'Ahri', 'Jinx', 'Lulu']),
];

describe('matchesWithPicks', () => {
	it('keeps only matches containing every player + champion pair, newest first', () => {
		const record = matchesWithPicks(matches, [
			{ puuid: 'p0', champion: 'Jax' },
			{ puuid: 'p2', champion: 'Ahri' },
		]);
		expect(record).toMatchObject({ games: 2, wins: 2 });
		expect(record.matches.map((item) => item.id)).toEqual(['EUW1_4', 'EUW1_1']);
	});

	it('does not count a champion played by another Étoile', () => {
		expect(matchesWithPicks(matches, [{ puuid: 'p1', champion: 'Jax' }]).games).toBe(0);
	});

	it('returns an empty record without picks', () => {
		expect(matchesWithPicks(matches, [])).toEqual({ games: 0, wins: 0, matches: [] });
	});
});

describe('pairRecords', () => {
	it('lists every pair once, most observed first', () => {
		const pairs = pairRecords(matches, [
			{ puuid: 'p0', champion: 'Garen' },
			{ puuid: 'p1', champion: 'Vi' },
			{ puuid: 'p2', champion: 'Lux' },
		]);
		expect(pairs).toHaveLength(3);
		expect(pairs.map(({ picks, record }) => [picks[0].champion, picks[1].champion, record.games])).toEqual([
			['Garen', 'Vi', 1],
			['Vi', 'Lux', 1],
			['Garen', 'Lux', 0],
		]);
	});
});

describe('pickSynergy', () => {
	const history = Array.from({ length: 20 }, (_, index) =>
		match(`EUW1_${index}`, index, index < 12 ? 'win' : 'loss', [
			'Jax', 'Vi', index < 8 || index >= 12 ? 'Ahri' : 'Lux', 'Jinx', 'Lulu',
		]));
	const candidate = { puuid: 'p0', champion: 'Jax' };

	it('compares the same player and champion with their overall five-player winrate', () => {
		const synergy = pickSynergy(history, [{ puuid: 'p2', champion: 'Lux' }], candidate, 5);
		expect(synergy).toMatchObject({
			baseline: { games: 20, wins: 12 },
			together: { games: 4, wins: 4 },
			delta: null, direction: null,
		});
		expect(pickSynergy(history, [{ puuid: 'p2', champion: 'Ahri' }], candidate, 5))
			.toMatchObject({ together: { games: 16, wins: 8 }, delta: -10, direction: 'down' });
	});

	it('does not signal a synergy without a pick on another seat', () => {
		expect(pickSynergy(history, [], candidate, 5)).toBeNull();
		expect(pickSynergy(history, [candidate], candidate, 5)).toBeNull();
	});

	it('replaces the selected pick on the candidate seat and requires all other picks together', () => {
		const selection = [
			{ puuid: 'p0', champion: 'Garen' },
			{ puuid: 'p2', champion: 'Ahri' },
			{ puuid: 'p4', champion: 'Nami' },
		];
		expect(pickSynergy(history, selection, candidate, 5))
			.toMatchObject({ baseline: { games: 20 }, together: { games: 0 }, delta: null, direction: null });
		expect(pickSynergy(history, selection.slice(0, 2), candidate, 5))
			.toMatchObject({ together: { games: 16, wins: 8 }, direction: 'down' });
	});

	it.each([
		[13, 'up', 5],
		[11, 'down', -5],
		[12, null, 0],
	] as const)('includes exact five-point boundaries: %i wins in the association', (wins, direction, delta) => {
		const boundary = Array.from({ length: 40 }, (_, index) =>
			match(`boundary-${index}`, index, (index < 20 ? index < wins : index < 20 + 24 - wins) ? 'win' : 'loss',
				['Jax', 'Vi', index < 20 ? 'Ahri' : 'Lux']));
		expect(pickSynergy(boundary, [{ puuid: 'p2', champion: 'Ahri' }], candidate, 5))
			.toMatchObject({ delta, direction });
	});

	it.each([56, 64])('does not signal a four-point gap: %i wins in the association', (wins) => {
		const close = Array.from({ length: 200 }, (_, index) =>
			match(`close-${index}`, index, (index < 100 ? index < wins : index < 100 + 120 - wins) ? 'win' : 'loss',
				['Jax', 'Vi', index < 100 ? 'Ahri' : 'Lux']));
		expect(pickSynergy(close, [{ puuid: 'p2', champion: 'Ahri' }], candidate, 5))
			.toMatchObject({ delta: wins - 60, direction: null });
	});

	it('keeps small and unseen samples descriptive, including champions played by someone else', () => {
		expect(pickSynergy(matches, [{ puuid: 'p2', champion: 'Ahri' }], candidate, 5))
			.toMatchObject({ together: { games: 2, wins: 2 }, delta: null, direction: null });
		expect(pickSynergy(history, [{ puuid: 'p2', champion: 'Ahri' }], { puuid: 'p1', champion: 'Jax' }, 5))
			.toMatchObject({ baseline: { games: 0 }, together: { games: 0 }, delta: null, direction: null });
	});

	it('shows a signal at exactly five shared games', () => {
		const five = Array.from({ length: 10 }, (_, index) =>
			match(`five-${index}`, index, index < 5 ? 'win' : 'loss', ['Jax', index < 5 ? 'Vi' : 'LeeSin']));
		expect(pickSynergy(five, [{ puuid: 'p1', champion: 'Vi' }], candidate, 5))
			.toMatchObject({ together: { games: 5, wins: 5 }, delta: 50, direction: 'up' });
	});
});

describe('explorationPicks', () => {
	it('merges personal queues and excludes champions already played as five', () => {
		const picks = explorationPicks(
			[{ champion: 'Ahri' }],
			[
				[
					{ champion: 'Ahri', games: 9, wins: 5, lastPlayedAt: 10 },
					{ champion: 'Syndra', games: 2, wins: 1, lastPlayedAt: 4 },
				],
				[
					{ champion: 'Syndra', games: 1, wins: 1, lastPlayedAt: 8 },
					{ champion: 'FiddleSticks', games: 3, wins: 0, lastPlayedAt: 2 },
					{ champion: 'Zoe', games: 1, wins: 0, lastPlayedAt: 1 },
				],
			],
			2,
		);
		expect(picks).toEqual([
			{ champion: 'Syndra', games: 3, wins: 2, lastPlayedAt: 8 },
			{ champion: 'Fiddlesticks', games: 3, wins: 0, lastPlayedAt: 2 },
		]);
	});
});

describe('compositionsForSeats', () => {
	it('groups identical five-champion compositions in seat order', () => {
		const compositions = compositionsForSeats(matches, ['p0', 'p1', 'p2', 'p3', 'p4']);
		expect(compositions[0]).toEqual({
			champions: ['Jax', 'Vi', 'Ahri', 'Jinx', 'Lulu'],
			games: 2,
			wins: 2,
			lastPlayedAt: 4,
			matchIds: ['EUW1_4', 'EUW1_1'],
		});
		expect(compositions).toHaveLength(3);
	});

	it('ignores matches missing one of the seats', () => {
		expect(compositionsForSeats(matches, ['p0', 'someone-else'])).toEqual([]);
	});
});
