import type Database from 'better-sqlite3';
import { compareRoles, isPosition } from '../lol';
import type { MatchInfoDto, ObjectiveName, ParticipantDto, Position, TeamId } from '../types';
import {
	FULL_LINEUP_SIZE,
	MIN_PARTIAL_LINEUP_SIZE,
	parseMatchInfo,
	toOutcome,
	type MatchOutcome,
} from './shared';

export type MatchScope = 'full' | 'partial';

export const MATCH_SCOPES: readonly MatchScope[] = ['full', 'partial'];

export interface MatchMember {
	puuid: string;
	name: string;
	champion: string;
	role: Position | null;
	kills: number;
	deaths: number;
	assists: number;
}

export interface MatchSummary {
	id: string;
	startedAt: number;
	durationS: number;
	outcome: MatchOutcome;
	lineupSize: number;
	/** Totaux des Étoiles présentes. */
	kills: number;
	deaths: number;
	assists: number;
	members: MatchMember[];
}

interface MemberRow {
	id: string;
	startedAt: number | null;
	durationS: number | null;
	puuid: string;
	name: string | null;
	champion: string;
	role: string | null;
	kills: number;
	deaths: number;
	assists: number;
	win: number;
	lineupSize: number;
}

/** Matchs du plus récent au plus ancien : complets (5) ou partiels (2 à 4 Étoiles). */
export function getMatches(database: Database.Database, scope: MatchScope = 'full'): MatchSummary[] {
	const [minLineup, maxLineup] =
		scope === 'full' ? [FULL_LINEUP_SIZE, FULL_LINEUP_SIZE] : [MIN_PARTIAL_LINEUP_SIZE, FULL_LINEUP_SIZE - 1];

	const rows = database
		.prepare(`
			SELECT
				m.match_id AS id,
				m.game_start_ts AS startedAt,
				m.duration_s AS durationS,
				p.puuid,
				pl.game_name AS name,
				p.champion,
				p.role,
				p.kills,
				p.deaths,
				p.assists,
				p.win,
				p.lineup_size AS lineupSize
			FROM participants AS p
			INNER JOIN matches AS m ON m.match_id = p.match_id
			LEFT JOIN players AS pl ON pl.puuid = p.puuid
			WHERE p.lineup_size BETWEEN ? AND ?
			ORDER BY m.game_start_ts DESC, m.match_id
		`)
		.all(minLineup, maxLineup) as MemberRow[];

	const grouped = new Map<string, MemberRow[]>();
	for (const row of rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);

	return [...grouped.values()].map(toSummary);
}

function toSummary(rows: MemberRow[]): MatchSummary {
	const [first] = rows;
	const consistent =
		first.startedAt !== null &&
		first.durationS !== null &&
		rows.every((row) => row.lineupSize === rows.length && row.win === first.win);

	if (!consistent) throw new Error(`Inconsistent data found in match ${first.id}.`);

	const members = rows
		.map((row) => ({
			puuid: row.puuid,
			name: row.name ?? 'Étoile inconnue',
			champion: row.champion,
			role: isPosition(row.role) ? row.role : null,
			kills: row.kills,
			deaths: row.deaths,
			assists: row.assists,
		}))
		.sort((left, right) => compareRoles(left.role, right.role));

	const total = (key: 'kills' | 'deaths' | 'assists') => members.reduce((sum, member) => sum + member[key], 0);

	return {
		id: first.id,
		startedAt: first.startedAt as number,
		durationS: first.durationS as number,
		outcome: toOutcome(first.win),
		lineupSize: rows.length,
		kills: total('kills'),
		deaths: total('deaths'),
		assists: total('assists'),
		members,
	};
}

export interface MatchParticipant {
	puuid: string;
	name: string;
	champion: string;
	championLevel: number;
	role: Position | null;
	isMember: boolean;
	kills: number;
	deaths: number;
	assists: number;
	cs: number;
	gold: number;
	damage: number;
	vision: number;
}

export interface MatchTeamObjectives {
	towers: number;
	inhibitors: number;
	dragons: number;
	barons: number;
	heralds: number;
	voidgrubs: number;
}

export interface MatchTeam {
	side: 'blue' | 'red';
	isOurs: boolean;
	outcome: MatchOutcome;
	kills: number;
	gold: number;
	objectives: MatchTeamObjectives;
	participants: MatchParticipant[];
}

export interface MatchDetail {
	id: string;
	startedAt: number;
	durationS: number;
	outcome: MatchOutcome;
	lineupSize: number;
	patch: string;
	externalUrl: string;
	/** Équipe des Étoiles en premier. */
	teams: [MatchTeam, MatchTeam];
}

const MATCH_ID_PATTERN = /^[A-Z0-9]{2,8}_\d{1,20}$/;

export function isMatchId(value: string): boolean {
	return MATCH_ID_PATTERN.test(value);
}

interface MatchRow {
	startedAt: number | null;
	durationS: number | null;
	rawJson: string | null;
}

interface DetailMemberRow {
	puuid: string;
	name: string | null;
	win: number;
	lineupSize: number;
}

export function getMatchDetail(database: Database.Database, matchId: string): MatchDetail | null {
	if (!isMatchId(matchId)) return null;

	const match = database
		.prepare('SELECT game_start_ts AS startedAt, duration_s AS durationS, raw_json AS rawJson FROM matches WHERE match_id = ?')
		.get(matchId) as MatchRow | undefined;
	if (!match?.rawJson || match.startedAt === null || match.durationS === null) return null;

	const members = database
		.prepare(`
			SELECT p.puuid, pl.game_name AS name, p.win, p.lineup_size AS lineupSize
			FROM participants AS p
			LEFT JOIN players AS pl ON pl.puuid = p.puuid
			WHERE p.match_id = ?
		`)
		.all(matchId) as DetailMemberRow[];
	if (members.length === 0) return null;

	const info = parseMatchInfo(match.rawJson);
	const memberNames = new Map(members.map((member) => [member.puuid, member.name]));
	const ourTeamId = info.participants.find((participant) => memberNames.has(participant.puuid))?.teamId;
	if (ourTeamId === undefined) throw new Error(`Inconsistent data found in match ${matchId}.`);

	const teamIds = [ourTeamId, ourTeamId === 100 ? 200 : 100] as const;
	const [ours, theirs] = teamIds.map((teamId) => toTeam(info, teamId, ourTeamId, memberNames));

	return {
		id: matchId,
		startedAt: match.startedAt,
		durationS: match.durationS,
		outcome: toOutcome(members[0].win),
		lineupSize: members[0].lineupSize,
		patch: info.gameVersion.split('.').slice(0, 2).join('.'),
		externalUrl: externalMatchUrl(matchId),
		teams: [ours, theirs],
	};
}

function toTeam(
	info: MatchInfoDto,
	teamId: TeamId,
	ourTeamId: TeamId,
	memberNames: ReadonlyMap<string, string | null>,
): MatchTeam {
	const team = info.teams.find((candidate) => candidate.teamId === teamId);
	const teamParticipants = info.participants.filter((participant) => participant.teamId === teamId);
	const participants = teamParticipants
		.map((participant) => toParticipant(participant, memberNames))
		.sort((left, right) => compareRoles(left.role, right.role));
	const objective = (name: ObjectiveName) => team?.objectives[name]?.kills ?? 0;

	return {
		side: teamId === 100 ? 'blue' : 'red',
		isOurs: teamId === ourTeamId,
		outcome: toOutcome(teamParticipants[0]?.win ?? false),
		kills: participants.reduce((total, participant) => total + participant.kills, 0),
		gold: participants.reduce((total, participant) => total + participant.gold, 0),
		objectives: {
			towers: objective('tower'),
			inhibitors: objective('inhibitor'),
			dragons: objective('dragon'),
			barons: objective('baron'),
			heralds: objective('riftHerald'),
			voidgrubs: objective('horde'),
		},
		participants,
	};
}

function toParticipant(participant: ParticipantDto, memberNames: ReadonlyMap<string, string | null>): MatchParticipant {
	const isMember = memberNames.has(participant.puuid);
	return {
		puuid: participant.puuid,
		name: (isMember ? memberNames.get(participant.puuid) : null) ?? participant.riotIdGameName ?? 'Invocateur',
		champion: participant.championName,
		championLevel: participant.champLevel,
		role: isPosition(participant.individualPosition) ? participant.individualPosition : null,
		isMember,
		kills: participant.kills,
		deaths: participant.deaths,
		assists: participant.assists,
		cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
		gold: participant.goldEarned,
		damage: participant.totalDamageDealtToChampions,
		vision: participant.visionScore,
	};
}

/**
 * TODO: Remplacer par opgg
 * ex: https://op.gg/lol/summoners/euw/Liberticide-EDL/matches/ta1XN8oiMOIxtKIU8dFJ0SsRrc2O5TfnMD2YRjvyx3Y%3D/1794063465000
 * @param matchId
 * @returns 
 */
function externalMatchUrl(matchId: string): string {
	const [platform, gameId] = matchId.split('_');
	const region = platform.replace(/\d+$/, '').toLowerCase();
	return `https://www.leagueofgraphs.com/match/${region}/${gameId}`;
	
}
