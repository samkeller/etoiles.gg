import { afterEach, describe, expect, it, vi } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getMatches, getMatchDetail } from './matches';
import { getPlayers } from './players';

afterEach(closeTestDatabases);

function seed() {
	const database = createTestDatabase();
	addPlayer(database, 'player-0', 'Name');
	addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
	return database;
}

describe('shared persisted match validation', () => {
	it('uses a constant number of queries and reuses validated identical raw JSON', () => {
		const database = seed();
		addMatch(database, { id: 'EUW1_999', startedAt: 999, won: true, members: fullLineup() });
		const prepare = vi.spyOn(database, 'prepare');
		const parse = vi.spyOn(JSON, 'parse');
		try {
			getMatches(database);
			expect(prepare).toHaveBeenCalledTimes(2);
			prepare.mockClear();
			const parsedBefore = parse.mock.calls.length;
			getPlayers(database);
			expect(prepare).toHaveBeenCalledTimes(3);
			expect(parse).toHaveBeenCalledTimes(parsedBefore);
			prepare.mockClear();
			getMatches(database);
			expect(prepare).toHaveBeenCalledTimes(2);
			expect(parse).toHaveBeenCalledTimes(parsedBefore);
			database.exec(`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].kills', 100) WHERE match_id = 'EUW1_999'`);
			expect(() => getMatches(database)).toThrow('Inconsistent');
		} finally {
			prepare.mockRestore();
			parse.mockRestore();
		}
	});

	it.each([
		`UPDATE participants SET lineup_size = 4 WHERE puuid = 'player-1'`,
		`UPDATE participants SET lineup_size = 4`,
		`UPDATE participants SET win = 0 WHERE puuid = 'player-1'`,
		`UPDATE participants SET kills = 999 WHERE puuid = 'player-1'`,
		`UPDATE matches SET duration_s = 9`,
		`UPDATE matches SET raw_json = '{"info":{}}'`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].totalDamageDealtToChampions', 'invalid')`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[1].puuid', 'player-0')`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.teams[0].objectives', json('{}'))`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].summoner1Id', '4')`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].summoner2Id', -1)`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].summoner2Id', 1.5)`,
		`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].summoner1Id', NULL)`,
	])('rejects inconsistent data in every reader: %s', (sql) => {
		const database = seed();
		database.exec(sql);
		expect(() => getMatches(database)).toThrow();
		expect(() => getMatchDetail(database, 'EUW1_1')).toThrow();
		expect(() => getPlayers(database)).toThrow();
	});

	it('does not require all five members to be registered, and normalizes champion pools', () => {
		const database = seed();
		addMatch(database, { id: 'EUW1_2', startedAt: 2, won: true, members: fullLineup({ 0: { champion: 'FiddleSticks' } }) });
		addMatch(database, { id: 'EUW1_3', startedAt: 3, won: true, members: fullLineup({ 0: { champion: 'Fiddlesticks' } }) });
		expect(getMatches(database)).toHaveLength(3);
		expect(getPlayers(database)[0].champions).toContainEqual({ champion: 'Fiddlesticks', games: 2, wins: 2, lastPlayedAt: 3, kda: 0 });
	});

	it('maps summoner spell fields and preserves missing fields as null', () => {
		const database = seed();
		database.exec(`UPDATE matches SET raw_json = json_set(raw_json, '$.info.participants[0].summoner1Id', 4,
			'$.info.participants[0].summoner2Id', 12)`);
		const participants = getMatchDetail(database, 'EUW1_1')!.teams[0].participants;
		expect(participants[0].summonerSpells).toEqual([4, 12]);
		expect(participants[1].summonerSpells).toEqual([null, null]);
	});
});
