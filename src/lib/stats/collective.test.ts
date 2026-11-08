import { afterEach, describe, expect, it } from 'vitest';
import { getCollective, MIN_DRAFT_GAMES } from './collective';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';

afterEach(closeTestDatabases);

describe('getCollective', () => {
	it('returns explicit empty data', () => {
		expect(getCollective(createTestDatabase())).toEqual({
			games: 0, winRate: null, minimumGames: 5,
			streaks: [], associations: [], compositions: [],
		});
	});

	it('computes the global baseline independently of insertion order', () => {
		const db = createTestDatabase();
		addMatch(db, { id: 'EUW1_2', startedAt: Date.parse('2026-03-01T12:00:00Z'), won: false, members: fullLineup() });
		addMatch(db, { id: 'EUW1_1', startedAt: Date.parse('2025-12-31T23:30:00Z'), won: true, members: fullLineup() });
		const result = getCollective(db);
		expect(result).toMatchObject({ games: 2, winRate: 0.5 });
		expect(result).not.toHaveProperty('months');
	});

	it('keeps only maximal win streaks including the current streak and excludes partial results', () => {
		const db = createTestDatabase();
		[true, true, false, true, true, true, false, true].forEach((won, index) => {
			addMatch(db, { id: `EUW1_${index}`, startedAt: index * 100, won, members: fullLineup() });
		});
		addMatch(db, { id: 'EUW1_90', startedAt: 50, won: false, members: fullLineup().slice(0, 4) });
		addMatch(db, { id: 'EUW1_91', startedAt: 800, won: true, members: fullLineup().slice(0, 2) });
		addMatch(db, { id: 'EUW1_92', startedAt: 900, won: true, members: fullLineup() });
		const result = getCollective(db);
		expect(result.streaks.map((streak) => streak.matches.map((match) => match.id)))
			.toEqual([['EUW1_3', 'EUW1_4', 'EUW1_5'], ['EUW1_7', 'EUW1_92'], ['EUW1_0', 'EUW1_1']]);
		expect(result.games).toBe(9);
	});

	it('enforces the exact five-match threshold for pairs and compositions, ignoring partial games', () => {
		const db = createTestDatabase();
		for (let i = 0; i < MIN_DRAFT_GAMES - 1; i += 1) {
			addMatch(db, { id: `EUW1_${i}`, startedAt: i, won: i < 2, members: fullLineup() });
		}
		addMatch(db, { id: 'EUW1_99', startedAt: 99, won: true, members: fullLineup().slice(0, 4) });
		expect(getCollective(db).associations).toEqual([]);
		expect(getCollective(db).compositions).toEqual([]);
		addMatch(db, { id: 'EUW1_5', startedAt: 5, won: true, members: fullLineup().reverse() });
		const result = getCollective(db);
		expect(result.associations).toHaveLength(10);
		expect(result.compositions).toHaveLength(1);
		for (const group of [...result.associations, ...result.compositions]) {
			expect(group).toMatchObject({ games: 5, wins: 3, winRate: 0.6, latestMatchId: 'EUW1_5' });
		}
	});

	it('keys associations by player and normalized champion, compositions also by role', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 10; i += 1) {
			addMatch(db, {
				id: `EUW1_${i}`, startedAt: i, won: i < 5,
				members: fullLineup({
					0: { champion: i % 2 ? 'FiddleSticks' : 'Fiddlesticks', role: i < 5 ? 'TOP' : 'MIDDLE' },
					2: { role: i < 5 ? 'MIDDLE' : 'TOP' },
				}),
			});
		}
		addMatch(db, {
			id: 'EUW1_20', startedAt: 20, won: true,
			members: fullLineup({ 0: { champion: 'Ahri' }, 2: { champion: 'Fiddlesticks' } }),
		});
		const result = getCollective(db);
		const pair = result.associations.find((group) =>
			group.members.some((member) => member.puuid === 'player-0') &&
			group.members.some((member) => member.puuid === 'player-2'),
		);
		expect(pair).toMatchObject({ games: 10, wins: 5 });
		expect(result.compositions).toHaveLength(2);
		expect(result.compositions.map((group) => group.games)).toEqual([5, 5]);
	});

	it('orders observations by descending win rate and retains losing samples', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 11; i += 1) {
			addMatch(db, {
				id: `EUW1_${i}`, startedAt: i, won: i >= 6,
				members: fullLineup({ 0: { champion: i < 6 ? 'Ahri' : 'Lux' } }),
			});
		}
		expect(getCollective(db).compositions.map((group) => [group.games, group.winRate]))
			.toEqual([[5, 1], [6, 0]]);
	});

	it('breaks equal win rates by sample size', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 11; i += 1) {
			addMatch(db, { id: `EUW1_${i}`, startedAt: i, won: true,
				members: fullLineup({ 0: { champion: i < 5 ? 'Ahri' : 'Lux' } }) });
		}
		expect(getCollective(db).compositions.map((group) => group.games)).toEqual([6, 5]);
	});

	it('filters one or two roles before aggregating, keeping other collective data unchanged', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 10; i += 1) {
			addMatch(db, { id: `EUW1_${i}`, startedAt: i, won: i < 5,
				members: fullLineup({
					0: { role: i < 5 ? 'TOP' : 'MIDDLE' },
					2: { role: i < 5 ? 'MIDDLE' : 'TOP' },
				}) });
		}
		const all = getCollective(db);
		const jungle = getCollective(db, ['JUNGLE']);
		expect(jungle.associations).toHaveLength(4);
		const pair = getCollective(db, ['TOP', 'JUNGLE']);
		expect(pair.associations).toHaveLength(2);
		expect(pair.associations.map((group) => [group.games, group.wins])).toEqual([[5, 5], [5, 0]]);
		expect(getCollective(db, ['JUNGLE', 'TOP']).associations).toEqual(pair.associations);
		expect(pair.streaks).toEqual(all.streaks);
		expect(pair.compositions).toEqual(all.compositions);
		expect(pair.games).toEqual(all.games);
	});

	it('applies the minimum sample size to the selected roles, not the unfiltered total', () => {
		const db = createTestDatabase();
		for (let i = 0; i < 6; i += 1) {
			addMatch(db, { id: `EUW1_${i}`, startedAt: i, won: true,
				members: fullLineup({
					0: { role: i < 3 ? 'TOP' : 'MIDDLE' },
					2: { role: i < 3 ? 'MIDDLE' : 'TOP' },
				}) });
		}
		expect(getCollective(db).associations).toHaveLength(10);
		expect(getCollective(db, ['TOP', 'JUNGLE']).associations).toEqual([]);
	});

	it('surfaces inconsistent full lineups instead of publishing partial statistics', () => {
		const db = createTestDatabase();
		addMatch(db, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup().slice(0, 4), lineupSize: 5 });
		expect(() => getCollective(db)).toThrow('Inconsistent data found in match EUW1_1.');
	});
});
