import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getIndividualProfiles } from './individual';

afterEach(closeTestDatabases);

describe('getIndividualProfiles', () => {
	it('keeps Solo/Duo and Flex activity separate from five-player team statistics', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Étoile');
		addPlayer(database, 'player-1', 'Compagnon');
		addMatch(database, {
			id: 'EUW1_100',
			startedAt: 100,
			won: true,
			members: fullLineup({ 0: { champion: 'Ahri', role: 'MIDDLE' } }),
		});
		addMatch(database, {
			id: 'EUW1_200',
			startedAt: 200,
			won: false,
			members: fullLineup({ 0: { champion: 'Orianna', role: 'MIDDLE' } }),
		});
		const solo = database.prepare('SELECT raw_json AS rawJson FROM matches WHERE match_id = ?').get('EUW1_200') as { rawJson: string };
		const raw = JSON.parse(solo.rawJson);
		raw.info.queueId = 420;
		database.prepare('UPDATE matches SET queue_id = 420, raw_json = ? WHERE match_id = ?').run(JSON.stringify(raw), 'EUW1_200');
		database.prepare("DELETE FROM participants WHERE match_id = 'EUW1_200' AND puuid != 'player-0'").run();
		database.prepare("UPDATE participants SET lineup_size = 1 WHERE match_id = 'EUW1_200'").run();
		database.prepare(`INSERT INTO rank_snapshots
			(puuid, queue_type, captured_on, tier, division, league_points, wins, losses)
			VALUES ('player-0', 'RANKED_SOLO_5x5', '2026-11-08', 'GOLD', 'II', 35, 18, 12)`).run();

		const profile = getIndividualProfiles(database)[0];

		expect(profile.soloDuo).toMatchObject({
			games: 1,
			wins: 0,
			winRate: 0,
			champions: [{ champion: 'Orianna', games: 1, wins: 0 }],
			currentRank: { tier: 'GOLD', division: 'II', leaguePoints: 35 },
		});
		expect(profile.flex).toMatchObject({ games: 1, wins: 1 });
		expect(profile.soloDuo.recentMatches[0]).toMatchObject({
			id: 'EUW1_200', queue: 'soloDuo', outcome: 'loss', teamSize: 2,
		});
		expect(profile.flex.recentMatches[0].teamSize).toBe(2);
	});

	it('does not fabricate personal history or rank snapshots', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Étoile');

		expect(getIndividualProfiles(database)[0]).toMatchObject({
			soloDuo: { games: 0, winRate: null, currentRank: null, rankHistory: [] },
			flex: { games: 0, winRate: null, currentRank: null, rankHistory: [] },
		});
	});

	it('rejects a raw Solo/Duo payload stored in the Flex queue', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Étoile');
		addMatch(database, { id: 'EUW1_300', startedAt: 300, won: true, members: fullLineup() });
		const row = database.prepare('SELECT raw_json AS rawJson FROM matches WHERE match_id = ?')
			.get('EUW1_300') as { rawJson: string };
		const raw = JSON.parse(row.rawJson);
		raw.info.queueId = 420;
		database.prepare('UPDATE matches SET raw_json = ? WHERE match_id = ?')
			.run(JSON.stringify(raw), 'EUW1_300');

		expect(() => getIndividualProfiles(database)).toThrow('Inconsistent queue for ranked match EUW1_300.');
	});
});
