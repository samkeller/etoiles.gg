import type Database from 'better-sqlite3';
import { cachedRead } from './cache';
import { compareRoles, isPosition } from '../lol';
import type { MatchInfoDto, ObjectiveName, ParticipantDto, Position, TeamId } from '../types';
import {
	FULL_LINEUP_SIZE,
	MIN_PARTIAL_LINEUP_SIZE,
	validatedLineup,
	toOutcome,
	parsedMatch,
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
	patch: string;
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
	return cachedRead(database, `matches:${scope}`, () => queryMatches(database, scope));
}

function queryMatches(database: Database.Database, scope: MatchScope): MatchSummary[] {
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
			WHERE m.queue_id = 440 AND m.match_kind = 'team' AND (
				EXISTS (SELECT 1 FROM participants AS candidate WHERE candidate.match_id = m.match_id
					AND candidate.lineup_size BETWEEN ? AND ?)
				OR (SELECT COUNT(*) FROM participants AS candidate WHERE candidate.match_id = m.match_id) BETWEEN ? AND ?
			)
			ORDER BY m.game_start_ts DESC, m.match_id
		`)
		.all(minLineup, maxLineup, minLineup, maxLineup) as MemberRow[];

	const grouped = new Map<string, MemberRow[]>();
	for (const row of rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
	const rawMatches = database.prepare(`SELECT m.match_id AS id, m.raw_json AS rawJson FROM matches AS m
		WHERE m.queue_id = 440 AND m.match_kind = 'team' AND (
			EXISTS (SELECT 1 FROM participants AS p WHERE p.match_id = m.match_id AND p.lineup_size BETWEEN ? AND ?)
			OR (SELECT COUNT(*) FROM participants AS p WHERE p.match_id = m.match_id) BETWEEN ? AND ?
		)`)
		.all(minLineup, maxLineup, minLineup, maxLineup) as { id: string; rawJson: string | null }[];
	const rawById = new Map(rawMatches.map((match) => [match.id, match.rawJson]));

	return [...grouped.values()].map((members) => {
		const first = members[0];
		const rawJson = rawById.get(first.id);
		if (!rawJson || first.startedAt === null || first.durationS === null) {
			throw new Error(`Missing raw data for match ${first.id}.`);
		}
		const { info } = validatedLineup(database, first.id, rawJson, first.startedAt, first.durationS, members.map((member) => ({
			...member, role: member.role ?? '',
		})));
		if (info.queueId !== 440) throw new Error(`Inconsistent queue in full-team match ${first.id}.`);
		return toSummary(members, info.gameVersion);
	});
}

function toSummary(rows: MemberRow[], gameVersion: string): MatchSummary {
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
		patch: gameVersion.split('.').slice(0, 2).join('.'),
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
	summonerSpells: [number | null, number | null];
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
	queueId: 420 | 440;
	isCollision: boolean;
	outcome: MatchOutcome;
	lineupSize: number | null;
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
	queueId: number;
	rawJson: string | null;
	matchKind: 'team' | 'collision';
}

interface DetailMemberRow {
	puuid: string;
	name: string | null;
	win: number;
	lineupSize: number;
	champion: string;
	role: string;
	kills: number;
	deaths: number;
	assists: number;
}

export function getMatchDetail(database: Database.Database, matchId: string): MatchDetail | null {
	if (!isMatchId(matchId)) return null;

	const match = database
		.prepare(`SELECT game_start_ts AS startedAt, duration_s AS durationS, queue_id AS queueId, raw_json AS rawJson,
			match_kind AS matchKind FROM matches WHERE match_id = ?`)
		.get(matchId) as MatchRow | undefined;
	if (!match?.rawJson || match.startedAt === null || match.durationS === null ||
		(match.queueId !== 420 && match.queueId !== 440)) return null;

	const members = database
		.prepare(`
			SELECT p.puuid, pl.game_name AS name, p.win, p.lineup_size AS lineupSize, p.champion, p.role, p.kills, p.deaths, p.assists
			FROM participants AS p
			LEFT JOIN players AS pl ON pl.puuid = p.puuid
			WHERE p.match_id = ?
		`)
		.all(matchId) as DetailMemberRow[];
	if (match.matchKind === 'collision') {
		const raw = parsedMatch(match.rawJson);
		if (raw.metadata.matchId !== matchId || raw.info.gameCreation !== match.startedAt ||
			raw.info.gameDuration !== match.durationS || raw.info.queueId !== match.queueId) {
			throw new Error(`Inconsistent data found in match ${matchId}.`);
		}
		const trackedPlayers = database.prepare('SELECT puuid, game_name AS name FROM players')
			.all() as { puuid: string; name: string | null }[];
		const tracked = new Map(trackedPlayers.map((player) => [player.puuid, player.name]));
		const membersInMatch = raw.info.participants.filter((participant) => tracked.has(participant.puuid));
		if (membersInMatch.length === 0) return null;
		const memberNames = new Map(membersInMatch.map((participant) => [participant.puuid, tracked.get(participant.puuid) ?? null]));
		const [ours, theirs] = ([100, 200] as const).map((teamId) =>
			toTeam(raw.info, teamId, teamId, memberNames, false));
		return {
			id: matchId,
			startedAt: match.startedAt,
			durationS: match.durationS,
			queueId: match.queueId as 420 | 440,
			isCollision: true,
			outcome: toOutcome(membersInMatch[0].win),
			lineupSize: null,
			patch: raw.info.gameVersion.split('.').slice(0, 2).join('.'),
			externalUrl: externalMatchUrl(matchId),
			teams: [ours, theirs],
		};
	}
	if (members.length === 0) return null;

	const { info, teamId: ourTeamId } = validatedLineup(database, matchId, match.rawJson, match.startedAt, match.durationS, members);
	if (info.queueId !== match.queueId) throw new Error(`Inconsistent queue in match ${matchId}.`);
	const memberNames = new Map(members.map((member) => [member.puuid, member.name]));

	const teamIds = [ourTeamId, ourTeamId === 100 ? 200 : 100] as const;
	const [ours, theirs] = teamIds.map((teamId) => toTeam(info, teamId, ourTeamId, memberNames));

	return {
		id: matchId,
		startedAt: match.startedAt,
		durationS: match.durationS,
		queueId: match.queueId,
		isCollision: false,
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
	isOurs = teamId === ourTeamId,
): MatchTeam {
	const team = info.teams.find((candidate) => candidate.teamId === teamId);
	const teamParticipants = info.participants.filter((participant) => participant.teamId === teamId);
	const participants = teamParticipants
		.map((participant) => toParticipant(participant, memberNames))
		.sort((left, right) => compareRoles(left.role, right.role));
	const objective = (name: ObjectiveName) => team?.objectives[name]?.kills ?? 0;

	return {
		side: teamId === 100 ? 'blue' : 'red',
		isOurs,
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
		summonerSpells: [spellId(participant.summoner1Id), spellId(participant.summoner2Id)],
	};
}

function spellId(value: number | undefined): number | null {
	return value ?? null;
}

function externalMatchUrl(matchId: string): string {
	const [platform, gameId] = matchId.split('_');
	const region = platform.replace(/\d+$/, '').toLowerCase();
	return `https://www.leagueofgraphs.com/match/${region}/${gameId}`;
}
