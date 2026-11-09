import Database from 'better-sqlite3';
import { migrateDatabase } from '../db/migrations';
import { SCHEMA } from '../db/schema';
import type { MatchDto, ParticipantDto, Position, TeamId } from '../types';

const openDatabases: Database.Database[] = [];

export function createTestDatabase(): Database.Database {
	const database = new Database(':memory:');
	database.exec(SCHEMA);
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
	/** Clés numériques bannies par notre équipe (côté 100) ; omis = réponse sans bans. */
	bans?: readonly number[];
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
			gameVersion: '16.22.834.8910',
			platformId: 'EUW1',
			queueId: 440,
			participants: [
				...allies.map((member) => participant(member, 100, match.won)),
				...enemies.map((member) => participant(member, 200, !match.won)),
			],
			teams: [
				{
					teamId: 100,
					win: match.won,
					objectives: objectives(match.won ? 3 : 1),
					...(match.bans ? { bans: match.bans.map((championId, index) => ({ championId, pickTurn: index + 1 })) } : {}),
				},
				{ teamId: 200, win: !match.won, objectives: objectives(match.won ? 1 : 3) },
			],
		},
	};

	database
		.prepare('INSERT INTO matches (match_id, game_start_ts, duration_s, queue_id, raw_json) VALUES (?, ?, ?, ?, ?)')
		.run(match.id, match.startedAt, durationS, 440, match.withRawJson === false ? null : JSON.stringify(raw));

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
