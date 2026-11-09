import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getTeamBans } from './bans';

afterEach(closeTestDatabases);

describe('getTeamBans', () => {
	it('counts our bans in full-team matches and resolves keys from stored participants', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Liberticide');
		addMatch(database, {
			id: 'EUW1_1',
			startedAt: 1,
			won: true,
			members: fullLineup({ 0: { champion: 'Yasuo', championKey: 157 }, 1: { champion: 'Zed', championKey: 238 } }),
			bans: [238, -1, 999],
		});
		addMatch(database, {
			id: 'EUW1_2',
			startedAt: 2,
			won: false,
			members: fullLineup({ 0: { champion: 'Jax', championKey: 24 } }),
			bans: [157, 238],
		});
		addMatch(database, { id: 'EUW1_3', startedAt: 3, won: true, members: fullLineup() });

		expect(getTeamBans(database)).toEqual({
			matches: 2,
			records: [
				{ champion: 'Zed', bans: 2, lastBannedAt: 2 },
				{ champion: 'Yasuo', bans: 1, lastBannedAt: 2 },
			],
			unresolved: 1,
		});
	});

	it('ignores incomplete lineups', () => {
		const database = createTestDatabase();
		addMatch(database, {
			id: 'EUW1_1',
			startedAt: 1,
			won: true,
			members: fullLineup({ 0: { champion: 'Zed', championKey: 238 } }).slice(0, 4),
			bans: [238],
		});

		expect(getTeamBans(database)).toEqual({ matches: 0, records: [], unresolved: 0 });
	});
});
