import { describe, expect, it } from 'vitest';
import { sidebarRecords } from './sidebarRecords';

describe('draft sidebar records', () => {
	it('shows the record against each usual ban, not the outcomes of matches where it was banned', () => {
		const bans = [{ champion: 'Ahri', bans: 20 }, { champion: 'Lux', bans: 8 }, { champion: 'Jax', bans: 1 }];
		const opponents = [
			{ champion: 'Lux', games: 5, wins: 5 },
			{ champion: 'Ahri', games: 10, wins: 2 },
		];
		expect(sidebarRecords(bans, opponents).banRecords).toEqual([
			{ champion: 'Ahri', bans: 20, games: 10, wins: 2 },
			{ champion: 'Lux', bans: 8, games: 5, wins: 5 },
			{ champion: 'Jax', bans: 1, games: 0, wins: 0 },
		]);
	});

	it('ranks by lowest observed winrate rather than total losses, breaking ties by sample size', () => {
		const opponents = [
			{ champion: 'Ahri', games: 100, wins: 50 },
			{ champion: 'Lux', games: 5, wins: 1 },
			{ champion: 'Jax', games: 1, wins: 0 },
			{ champion: 'Sion', games: 10, wins: 2 },
			{ champion: 'Gnar', games: 4, wins: 0 },
		];
		expect(sidebarRecords([], opponents).opponentRecords.map(({ champion }) => champion))
			.toEqual(['Gnar', 'Jax', 'Sion', 'Lux', 'Ahri']);
		expect(opponents[0].champion).toBe('Ahri');
	});

	it('keeps champions we always beat and never represents a missing record as an observed 0% winrate', () => {
		const { banRecords, opponentRecords } = sidebarRecords(
			[{ champion: 'Lux', bans: 3 }, { champion: 'Ahri', bans: 1 }],
			[{ champion: 'Lux', games: 5, wins: 5 }],
		);
		expect(opponentRecords).toEqual([{ champion: 'Lux', games: 5, wins: 5 }]);
		expect(banRecords[1].games).toBe(0);
	});

	it('limits both lists to twelve without changing the order of usual bans', () => {
		const opponents = Array.from({ length: 15 }, (_, index) => ({
			champion: `Champion${index}`, games: 20, wins: index,
		}));
		const bans = [...opponents].reverse().map((record, index) => ({ champion: record.champion, bans: 15 - index }));
		const { banRecords, opponentRecords } = sidebarRecords(bans, opponents);
		expect(banRecords).toHaveLength(12);
		expect(banRecords[0].champion).toBe('Champion14');
		expect(opponentRecords).toHaveLength(12);
		expect(opponentRecords[0].champion).toBe('Champion0');
		expect(sidebarRecords([], [])).toEqual({ banRecords: [], opponentRecords: [] });
	});
});
