import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getMatchDetail, getMatches, isMatchId } from './matches';

afterEach(closeTestDatabases);

function seed() {
	const database = createTestDatabase();
	addPlayer(database, 'player-0', 'Azalea');
	addMatch(database, {
		id: 'EUW1_100',
		startedAt: 100,
		won: true,
		members: fullLineup({ 0: { kills: 4, deaths: 1, assists: 2, champion: 'FiddleSticks' }, 3: { kills: 6 } }),
	});
	addMatch(database, { id: 'EUW1_200', startedAt: 200, won: false, members: fullLineup() });
	addMatch(database, { id: 'EUW1_300', startedAt: 300, won: true, members: fullLineup().slice(0, 3) });
	addMatch(database, { id: 'EUW1_400', startedAt: 400, won: true, members: fullLineup().slice(0, 1) });
	return database;
}

describe('getMatches', () => {
	it('lists only full-team matches by default, newest first', () => {
		const matches = getMatches(seed());

		expect(matches.map((match) => match.id)).toEqual(['EUW1_200', 'EUW1_100']);
		expect(matches[1]).toMatchObject({ outcome: 'win', lineupSize: 5, kills: 10, deaths: 1, assists: 2 });
		expect(matches[1].members.map((member) => member.role)).toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
		expect(matches[1].members[0]).toMatchObject({ name: 'Azalea', champion: 'FiddleSticks' });
	});

	it('keeps partial matches separate and ignores solo games', () => {
		const matches = getMatches(seed(), 'partial');

		expect(matches.map((match) => [match.id, match.lineupSize])).toEqual([['EUW1_300', 3]]);
		const database = seed();
		const raw = database.prepare('SELECT raw_json FROM matches WHERE match_id = ?').get('EUW1_400') as { raw_json: string };
		const solo = JSON.parse(raw.raw_json);
		solo.info.queueId = 420;
		database.prepare('UPDATE matches SET queue_id = 420, raw_json = ? WHERE match_id = ?').run(JSON.stringify(solo), 'EUW1_400');
		expect(getMatches(database, 'partial').map(({ id }) => id)).toEqual(['EUW1_300']);
	});

	it('returns an empty list without data', () => {
		expect(getMatches(createTestDatabase())).toEqual([]);
	});

	it('surfaces inconsistent lineups', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup().slice(0, 4), lineupSize: 5 });

		expect(() => getMatches(database)).toThrow('Inconsistent data found in match EUW1_1.');
	});

	it('rejects Solo/Duo data stored in the Flex queue', () => {
		const database = createTestDatabase();
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		const row = database.prepare('SELECT raw_json AS rawJson FROM matches WHERE match_id = ?').get('EUW1_1') as { rawJson: string };
		const raw = JSON.parse(row.rawJson);
		raw.info.queueId = 420;
		database.prepare('UPDATE matches SET raw_json = ? WHERE match_id = ?').run(JSON.stringify(raw), 'EUW1_1');

		expect(() => getMatches(database)).toThrow('Inconsistent queue in full-team match EUW1_1.');
	});
});

describe('getMatchDetail', () => {
	it('puts the team first and flags its members', () => {
		const detail = getMatchDetail(seed(), 'EUW1_300');

		expect(detail).toMatchObject({
			outcome: 'win',
			lineupSize: 3,
			patch: '16.22',
			externalUrl: 'https://www.leagueofgraphs.com/match/euw/300',
		});
		const [ours, theirs] = detail!.teams;
		expect(ours).toMatchObject({ isOurs: true, side: 'blue', outcome: 'win', objectives: { towers: 3, dragons: 3 } });
		expect(ours.participants.filter((participant) => participant.isMember)).toHaveLength(3);
		expect(theirs).toMatchObject({ isOurs: false, side: 'red', outcome: 'loss', kills: 5 });
	});

	it('returns null for unknown or malformed ids and matches without raw data', () => {
		const database = seed();
		addMatch(database, { id: 'EUW1_500', startedAt: 500, won: true, members: fullLineup(), withRawJson: false });

		expect(getMatchDetail(database, 'EUW1_999')).toBeNull();
		expect(getMatchDetail(database, "EUW1_1' OR 1=1")).toBeNull();
		expect(getMatchDetail(database, 'EUW1_500')).toBeNull();
	});
});

describe('isMatchId', () => {
	it('accepts Riot match ids only', () => {
		expect(isMatchId('EUW1_8037020427')).toBe(true);
		expect(isMatchId('euw1_8037020427')).toBe(false);
		expect(isMatchId('../secrets')).toBe(false);
	});
});
