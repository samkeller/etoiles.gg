import { afterEach, describe, expect, it } from 'vitest';
import { addMatch, addPlayer, closeTestDatabases, createTestDatabase, fullLineup } from './fixtures';
import { getPlayers, PROGRESSION_WINDOW, RECENT_WINDOW } from './players';

afterEach(closeTestDatabases);

describe('getPlayers', () => {
	it('builds profiles from full-team matches only', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Liberticide');
		addPlayer(database, 'player-1', 'Azalea');
		addMatch(database, {
			id: 'EUW1_1',
			startedAt: 1,
			won: true,
			durationS: 1200,
			members: fullLineup({
				0: { champion: 'Jax', kills: 4, deaths: 2, assists: 4, cs: 200, damage: 300, vision: 20 },
				1: { kills: 6, damage: 100, role: 'JUNGLE' },
			}),
		});
		addMatch(database, {
			id: 'EUW1_2',
			startedAt: 2,
			won: false,
			durationS: 1800,
			members: fullLineup({
				0: { champion: 'Garen', kills: 0, deaths: 2, assists: 2, cs: 100, damage: 100, vision: 10 },
				1: { kills: 4, damage: 100, role: 'JUNGLE' },
			}),
		});
		addMatch(database, {
			id: 'EUW1_3',
			startedAt: 3,
			won: true,
			members: fullLineup({ 0: { champion: 'Jax', kills: 30 } }).slice(0, 4),
		});

		const [top, jungle] = getPlayers(database);

		expect(top).toMatchObject({
			name: 'Liberticide',
			games: 2,
			mainRole: 'TOP',
			averageKills: 2,
			kda: 10 / 4,
			killParticipation: 10 / 14,
			damageShare: 400 / 600,
			csPerMinute: 300 / 50,
			visionPerMinute: 30 / 50,
			champions: [
				{ champion: 'Jax', games: 1, wins: 1 },
				{ champion: 'Garen', games: 1, wins: 0 },
			],
			progression: [],
			recentKillParticipation: null,
			bestGame: { matchId: 'EUW1_1', champion: 'Jax', kills: 4, deaths: 2, assists: 4, outcome: 'win' },
		});
		expect(jungle).toMatchObject({ name: 'Azalea', mainRole: 'JUNGLE', games: 2 });
	});

	it('returns empty profiles for players without full-team matches', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Solo');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup().slice(0, 2) });

		expect(getPlayers(database)[0]).toMatchObject({
			games: 0,
			mainRole: null,
			kda: null,
			killParticipation: null,
			champions: [],
			progression: [],
			bestGame: null,
		});
	});

	it('computes a rolling progression and recent form once enough matches exist', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Régulier');
		const gameCount = RECENT_WINDOW + 2;
		for (let index = 0; index < gameCount; index += 1) {
			addMatch(database, {
				id: `EUW1_${index}`,
				startedAt: index,
				won: true,
				members: fullLineup({ 0: { kills: 1 }, 1: { kills: index < 2 ? 1 : 3 } }),
			});
		}

		const [player] = getPlayers(database);

		expect(player.progression).toHaveLength(gameCount - PROGRESSION_WINDOW + 1);
		expect(player.progression[0]).toBeCloseTo((2 * 0.5 + 3 * 0.25) / PROGRESSION_WINDOW);
		expect(player.recentKillParticipation).toBeCloseTo(0.25);
	});

	it('surfaces full-team matches without raw data', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Liberticide');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup(), withRawJson: false });

		expect(() => getPlayers(database)).toThrow('Missing raw data for full-team match EUW1_1.');
	});

	it('rejects Solo/Duo payloads stored in the Flex queue', () => {
		const database = createTestDatabase();
		addPlayer(database, 'player-0', 'Liberticide');
		addMatch(database, { id: 'EUW1_1', startedAt: 1, won: true, members: fullLineup() });
		const row = database.prepare('SELECT raw_json AS rawJson FROM matches WHERE match_id = ?')
			.get('EUW1_1') as { rawJson: string };
		const raw = JSON.parse(row.rawJson);
		raw.info.queueId = 420;
		database.prepare('UPDATE matches SET raw_json = ? WHERE match_id = ?')
			.run(JSON.stringify(raw), 'EUW1_1');

		expect(() => getPlayers(database)).toThrow('Inconsistent queue in full-team match EUW1_1.');
	});
});
