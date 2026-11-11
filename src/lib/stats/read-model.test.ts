import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getDraftOpponents } from './read-model';

afterEach(closeTestDatabases);

describe('getDraftOpponents', () => {
	it('counts our losses once per opposing champion and includes wins in the denominator', () => {
		const database = createTestDatabase();
		for (let index = 1; index <= 3; index += 1) {
			addMatch(database, {
				id: `EUW1_${index}`, startedAt: index, won: index === 3,
				members: fullLineup({ 0: { champion: 'Jax' } }),
			});
		}
		// Les autres adversaires restent Ahri : un champion n'est compté qu'une fois par match.
		database.exec(`UPDATE matches SET raw_json = json_set(raw_json,
			'$.info.participants[5].championName', 'Lux') WHERE match_id = 'EUW1_1'`);
		expect(getDraftOpponents(database)).toEqual([
			{ champion: 'Ahri', games: 3, wins: 1, lastPlayedAt: 3 },
			{ champion: 'Lux', games: 1, wins: 0, lastPlayedAt: 1 },
		]);
	});

	it('ignores personal queues, partial teams and allies, but retains opponents we always beat', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		addMatch(database, { id: 'EUW1_2', startedAt: 2, won: false, members: fullLineup().slice(0, 4) });
		addMatch(database, { id: 'EUW1_3', startedAt: 3, won: false, members: fullLineup(), queueId: 420 });
		expect(getDraftOpponents(database)).toEqual([{ champion: 'Ahri', games: 1, wins: 1, lastPlayedAt: 1 }]);
	});

	it('identifies our team even when it is on the red side and normalizes champion IDs', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: false, members: fullLineup() });
		database.exec(`UPDATE matches SET raw_json = json_set(raw_json,
			'$.info.participants[0].teamId', 200, '$.info.participants[1].teamId', 200,
			'$.info.participants[2].teamId', 200, '$.info.participants[3].teamId', 200,
			'$.info.participants[4].teamId', 200, '$.info.participants[5].teamId', 100,
			'$.info.participants[6].teamId', 100, '$.info.participants[7].teamId', 100,
			'$.info.participants[8].teamId', 100, '$.info.participants[9].teamId', 100,
			'$.info.participants[5].championName', 'FiddleSticks',
			'$.info.teams[0].win', json('true'), '$.info.teams[1].win', json('false'))`);
		expect(getDraftOpponents(database).map((record) => record.champion)).toEqual(['Ahri', 'Fiddlesticks']);
	});

	it('invalidates cached opponent records after new matches', () => {
		const database = createTestDatabase();
		expect(getDraftOpponents(database)).toEqual([]);
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: false, members: fullLineup() });
		expect(getDraftOpponents(database)).toEqual([{ champion: 'Ahri', games: 1, wins: 0, lastPlayedAt: 1 }]);
	});

	it('does not hide inconsistent raw data', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: false, members: fullLineup() });
		database.exec("UPDATE matches SET raw_json = NULL WHERE match_id = 'EUW1_1'");
		expect(() => getDraftOpponents(database)).toThrow('Missing raw data');
	});
});
