import { describe, expect, it } from 'vitest';
import {
	compositionsForSeats,
	explorationPicks,
	matchesWithPicks,
	pairRecords,
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
