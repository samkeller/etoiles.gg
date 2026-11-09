import Database from 'better-sqlite3';
import { migrateDatabase } from '../db/migrations';
import type { MatchDto, ParticipantDto, Position, TeamId } from '../types';

const openDatabases: Database.Database[] = [];

export function createTestDatabase(): Database.Database {
	const database = new Database(':memory:');
	migrateDatabase(database);
	openDatabases.push(database);
	return database;
}

export function closeTestDatabases(): void {
	for (const database of openDatabases.splice(0)) database.close();
}

export function addPlayer(database: Database.Database, puuid: string, gameName: string): void {
	database.prepare('INSERT INTO players (puuid, game_name, tag_line) VALUES (?, ?, ?)').run(puuid, gameName, 'EUW');
}

export interface FixtureMember {
	puuid: string;
	champion?: string;
	/** Clé numérique Riot du champion, utile pour résoudre les bans. */
	championKey?: number;
	role?: Position;
	kills?: number;
	deaths?: number;
	assists?: number;
	cs?: number;
	damage?: number;
	vision?: number;
	pentaKills?: number;
	quadraKills?: number;
	earlySurrender?: boolean;
}

export interface FixtureMatch {
	id: string;
	startedAt: number;
	won: boolean;
	members: readonly FixtureMember[];
	/** Valeur stockée dans participants.lineup_size ; par défaut le nombre de membres. */
	lineupSize?: number;
	durationS?: number;
	withRawJson?: boolean;
	queueId?: 420 | 440;
	gameVersion?: string;
	/** Clés numériques bannies par notre équipe (côté 100) ; omis = réponse sans bans. */
	bans?: readonly number[];
	firstDragon?: 'ours' | 'theirs';
}

const FILLER_ROLES: readonly Position[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

function participant(member: FixtureMember, teamId: TeamId, win: boolean): ParticipantDto {
	return {
		puuid: member.puuid,
		teamId,
		championName: member.champion ?? 'Aatrox',
		...(member.championKey === undefined ? {} : { championId: member.championKey }),
		champLevel: 16,
		individualPosition: member.role ?? 'TOP',
		kills: member.kills ?? 0,
		deaths: member.deaths ?? 0,
		assists: member.assists ?? 0,
		win,
		riotIdGameName: `Nom ${member.puuid}`,
		riotIdTagline: 'EUW',
		totalMinionsKilled: member.cs ?? 0,
		neutralMinionsKilled: 0,
		goldEarned: 10000,
		totalDamageDealtToChampions: member.damage ?? 0,
		visionScore: member.vision ?? 0,
		...(member.pentaKills === undefined ? {} : { pentaKills: member.pentaKills }),
		...(member.quadraKills === undefined ? {} : { quadraKills: member.quadraKills }),
		...(member.earlySurrender === undefined ? {} : { gameEndedInEarlySurrender: member.earlySurrender }),
	};
}

export function addMatch(database: Database.Database, match: FixtureMatch): void {
	const durationS = match.durationS ?? 1800;
	const allies = [
		...match.members,
		...FILLER_ROLES.slice(match.members.length).map((role, index) => ({ puuid: `ally-${index}`, role })),
	];
	const enemies = FILLER_ROLES.map((role, index) => ({ puuid: `enemy-${index}`, role, champion: 'Ahri', kills: 1 }));
	const objectives = (kills: number) => ({
		baron: { first: false, kills },
		champion: { first: false, kills },
		dragon: { first: false, kills },
		horde: { first: false, kills },
		inhibitor: { first: false, kills },
		riftHerald: { first: false, kills },
		tower: { first: false, kills },
	});
	const raw: MatchDto = {
		metadata: { matchId: match.id },
		info: {
			gameCreation: match.startedAt,
			gameDuration: durationS,
			gameVersion: match.gameVersion ?? '16.22.834.8910',
			platformId: 'EUW1',
			queueId: match.queueId ?? 440,
			participants: [
				...allies.map((member) => participant(member, 100, match.won)),
				...enemies.map((member) => participant(member, 200, !match.won)),
			],
			teams: [
				{
					teamId: 100,
					win: match.won,
					objectives: { ...objectives(match.won ? 3 : 1), dragon: { first: match.firstDragon === 'ours', kills: match.won ? 3 : 1 } },
					...(match.bans ? { bans: match.bans.map((championId, index) => ({ championId, pickTurn: index + 1 })) } : {}),
				},
				{ teamId: 200, win: !match.won, objectives: { ...objectives(match.won ? 1 : 3), dragon: { first: match.firstDragon === 'theirs', kills: match.won ? 1 : 3 } } },
			],
		},
	};

	database
		.prepare('INSERT INTO matches (match_id, game_start_ts, duration_s, queue_id, raw_json) VALUES (?, ?, ?, ?, ?)')
		.run(match.id, match.startedAt, durationS, match.queueId ?? 440, match.withRawJson === false ? null : JSON.stringify(raw));

	const insertParticipant = database.prepare(`
		INSERT INTO participants
			(match_id, puuid, champion, role, kills, deaths, assists, win, lineup_size)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	for (const member of match.members) {
		insertParticipant.run(
			match.id,
			member.puuid,
			member.champion ?? 'Aatrox',
			member.role ?? 'TOP',
			member.kills ?? 0,
			member.deaths ?? 0,
			member.assists ?? 0,
			Number(match.won),
			match.lineupSize ?? match.members.length,
		);
	}
}

/** Cinq membres anonymes, un par rôle. */
export function fullLineup(overrides: Partial<Record<number, Partial<FixtureMember>>> = {}): FixtureMember[] {
	return FILLER_ROLES.map((role, index) => ({ puuid: `player-${index}`, role, ...overrides[index] }));
}

export function timelineFixture(match: MatchDto, deficits: number[] = [0, -6000, 1000]) {
	return {
		metadata: { matchId: match.metadata.matchId },
		info: {
			participants: match.info.participants.map((player, index) => ({ participantId: index + 1, puuid: player.puuid })),
			frames: deficits.map((diff, index) => ({
				timestamp: index * 60_000,
				participantFrames: Object.fromEntries(match.info.participants.map((_player, participantIndex) => [
					String(participantIndex + 1), {
						participantId: participantIndex + 1,
						totalGold: 10000 + index * 5000 + (participantIndex === 0 ? diff : 0),
					},
				])),
				events: index === 1 ? [
					{ type: 'ELITE_MONSTER_KILL', timestamp: 55000, monsterType: 'DRAGON', killerId: 2 },
					{ type: 'BUILDING_KILL', timestamp: 60000, buildingType: 'TOWER_BUILDING', teamId: 100, killerId: 0 },
				] : [],
			})),
		},
	};
}

export function seedRankedHistory(database: Database.Database, count: number): void {
	if (!Number.isSafeInteger(count) || count < 0) throw new Error('Fixture match count must be a nonnegative integer.');
	database.transaction(() => {
		for (let player = 0; player < 5; player += 1) addPlayer(database, `player-${player}`, `Player ${player}`);
		const champions = ['Aatrox', 'Vi', 'Ahri', 'Jinx', 'Nautilus'];
		const championKeys = [266, 254, 103, 222, 111];
		for (let index = 0; index < count; index += 1) {
			const members = fullLineup();
			for (let player = 0; player < 5; player += 1) {
				members[player] = {
					...members[player],
					champion: champions[(player + Math.floor(index / 7)) % champions.length],
					championKey: championKeys[(player + Math.floor(index / 7)) % champions.length],
					kills: (index + player) % 15,
					deaths: (index + player) % 8,
					assists: (index * 3 + player) % 20,
					cs: 50 + (index + player * 30) % 220,
					damage: 10000 + (index * 100 + player * 3000) % 30000,
					vision: 10 + (index + player * 10) % 70,
				};
			}
			const solo = index % 5 < 2;
			const lineup = solo ? [members[index % 5]] : index % 5 === 2 ? members.slice(0, 2 + index % 3) : members;
			addMatch(database, {
				id: `EUW1_${index + 1}`,
				startedAt: Date.UTC(2024, 0, 1) + Math.floor(index / 5) * 86400000 + (index % 5) * 2400000,
				won: index % 3 !== 0,
				members: lineup,
				queueId: solo ? 420 : 440,
				gameVersion: `16.${1 + Math.floor(index / 100) % 24}.1`,
				bans: [266, 103],
			});
		}
		for (let player = 0; player < 5; player += 1) {
			for (const queue of ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR']) {
				database.prepare(`INSERT INTO rank_snapshots
					(puuid, queue_type, captured_on, tier, division, league_points, wins, losses)
					VALUES (?, ?, '2026-11-09', 'GOLD', 'II', 50, 30, 20)`).run(`player-${player}`, queue);
			}
		}
	})();
}
