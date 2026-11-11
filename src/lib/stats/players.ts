import type Database from 'better-sqlite3';
import { cachedRead } from './cache';
import { championId, compareRoles, isPosition } from '../lol';
import type { Position } from '../types';
import { kdaRatio, minutes, validatedLineup, ratio, toOutcome, type MatchOutcome, type StoredMember } from './shared';

/** Fenêtre de la moyenne glissante utilisée pour la courbe de progression. */
export const PROGRESSION_WINDOW = 5;

/** Nombre de matchs considérés comme « récents » pour la comparaison à la moyenne. */
export const RECENT_WINDOW = 10;

export interface ChampionRecord {
	champion: string;
	games: number;
	wins: number;
	lastPlayedAt: number;
}

/** Pick joué à cinq, avec le KDA cumulé sur ses parties. */
export interface TeamChampionRecord extends ChampionRecord {
	kda: number;
}

export interface RoleShare {
	role: Position;
	games: number;
}

export interface PlayerHighlight {
	matchId: string;
	startedAt: number;
	champion: string;
	kills: number;
	deaths: number;
	assists: number;
	outcome: MatchOutcome;
}

export interface PlayerProfile {
	puuid: string;
	name: string;
	tagLine: string | null;
	/** Matchs joués avec les cinq Étoiles. */
	games: number;
	mainRole: Position | null;
	roles: RoleShare[];
	averageKills: number | null;
	averageDeaths: number | null;
	averageAssists: number | null;
	kda: number | null;
	killParticipation: number | null;
	damageShare: number | null;
	csPerMinute: number | null;
	visionPerMinute: number | null;
	/** Champions du plus joué au moins joué. */
	champions: TeamChampionRecord[];
	/** Participation aux kills en moyenne glissante, du plus ancien au plus récent. */
	progression: number[];
	/** Participation aux kills sur les derniers matchs, si l'historique est plus long que la fenêtre. */
	recentKillParticipation: number | null;
	bestGame: PlayerHighlight | null;
}

interface PlayerRow {
	puuid: string;
	name: string | null;
	tagLine: string | null;
}

interface FullMatchRow {
	id: string;
	startedAt: number | null;
	durationS: number | null;
	queueId: number;
	rawJson: string | null;
}

interface GameLine {
	matchId: string;
	startedAt: number;
	minutes: number;
	champion: string;
	role: Position | null;
	won: boolean;
	kills: number;
	deaths: number;
	assists: number;
	teamKills: number;
	damage: number;
	teamDamage: number;
	cs: number;
	vision: number;
}

/** Fiches des joueurs, calculées uniquement sur les matchs joués à cinq. */
export function getPlayers(database: Database.Database): PlayerProfile[] {
	return cachedRead(database, 'players', () => queryPlayers(database));
}

function queryPlayers(database: Database.Database): PlayerProfile[] {
	const players = database
		.prepare('SELECT puuid, game_name AS name, tag_line AS tagLine FROM players')
		.all() as PlayerRow[];
	const matches = database
		.prepare(`
			SELECT m.match_id AS id, m.game_start_ts AS startedAt, m.duration_s AS durationS,
				m.queue_id AS queueId, m.raw_json AS rawJson
			FROM matches AS m
			WHERE m.queue_id = 440 AND m.match_kind = 'team' AND (
				EXISTS (SELECT 1 FROM participants AS p WHERE p.match_id = m.match_id AND p.lineup_size = 5)
				OR (SELECT COUNT(*) FROM participants AS p WHERE p.match_id = m.match_id) >= 5
			)
			ORDER BY m.game_start_ts ASC, m.match_id
		`)
		.all() as FullMatchRow[];

	const lines = new Map<string, GameLine[]>(players.map((player) => [player.puuid, []]));
	const storedRows = database.prepare(`SELECT p.match_id AS id, p.puuid, p.win, p.lineup_size AS lineupSize,
		p.champion, p.role, p.kills, p.deaths, p.assists FROM participants AS p
		WHERE EXISTS (SELECT 1 FROM matches AS m WHERE m.match_id = p.match_id
			AND m.queue_id = 440 AND m.match_kind = 'team')
			AND (
				EXISTS (SELECT 1 FROM participants AS candidate WHERE candidate.match_id = p.match_id AND candidate.lineup_size = 5)
				OR (SELECT COUNT(*) FROM participants AS candidate WHERE candidate.match_id = p.match_id) >= 5
			)`)
		.all() as (StoredMember & { id: string })[];
	const storedByMatch = new Map<string, StoredMember[]>();
	for (const row of storedRows) {
		const members = storedByMatch.get(row.id) ?? [];
		members.push(row);
		storedByMatch.set(row.id, members);
	}

	for (const match of matches) {
		if (match.rawJson === null || match.startedAt === null || match.durationS === null) {
			throw new Error(`Missing raw data for full-team match ${match.id}.`);
		}
		const { info, members } = validatedLineup(database, match.id, match.rawJson, match.startedAt, match.durationS, storedByMatch.get(match.id) ?? []);
		if (info.queueId !== match.queueId || info.queueId !== 440) {
			throw new Error(`Inconsistent queue in full-team match ${match.id}.`);
		}
		const memberIds = new Set(members.map((member) => member.puuid));

		for (const participant of info.participants) {
			if (!memberIds.has(participant.puuid)) continue;
			const playerLines = lines.get(participant.puuid);
			if (!playerLines) continue;

			const team = info.participants.filter((candidate) => candidate.teamId === participant.teamId);
			playerLines.push({
				matchId: match.id,
				startedAt: match.startedAt,
				minutes: minutes(match.durationS),
				champion: championId(participant.championName),
				role: isPosition(participant.individualPosition) ? participant.individualPosition : null,
				won: participant.win,
				kills: participant.kills,
				deaths: participant.deaths,
				assists: participant.assists,
				teamKills: team.reduce((total, ally) => total + ally.kills, 0),
				damage: participant.totalDamageDealtToChampions,
				teamDamage: team.reduce((total, ally) => total + ally.totalDamageDealtToChampions, 0),
				cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
				vision: participant.visionScore,
			});
		}
	}

	return players
		.map((player) => toProfile(player, lines.get(player.puuid) ?? []))
		.sort((left, right) => compareRoles(left.mainRole, right.mainRole) || left.name.localeCompare(right.name, 'fr'));
}

function toProfile(player: PlayerRow, games: readonly GameLine[]): PlayerProfile {
	const total = (key: { [K in keyof GameLine]: GameLine[K] extends number ? K : never }[keyof GameLine]) =>
		games.reduce((sum, game) => sum + game[key], 0);
	const average = (value: number) => ratio(value, games.length);
	const killParticipation = (subset: readonly GameLine[]) =>
		ratio(
			subset.reduce((sum, game) => sum + game.kills + game.assists, 0),
			subset.reduce((sum, game) => sum + game.teamKills, 0),
		);

	const kills = total('kills');
	const deaths = total('deaths');
	const assists = total('assists');
	const playedMinutes = total('minutes');

	return {
		puuid: player.puuid,
		name: player.name ?? 'Étoile inconnue',
		tagLine: player.tagLine,
		games: games.length,
		mainRole: countRoles(games)[0]?.role ?? null,
		roles: countRoles(games),
		averageKills: average(kills),
		averageDeaths: average(deaths),
		averageAssists: average(assists),
		kda: games.length === 0 ? null : kdaRatio(kills, deaths, assists),
		killParticipation: killParticipation(games),
		damageShare: ratio(total('damage'), total('teamDamage')),
		csPerMinute: ratio(total('cs'), playedMinutes),
		visionPerMinute: ratio(total('vision'), playedMinutes),
		champions: countChampions(games),
		progression: rollingKillParticipation(games),
		recentKillParticipation: games.length > RECENT_WINDOW ? killParticipation(games.slice(-RECENT_WINDOW)) : null,
		bestGame: findBestGame(games),
	};
}

function countRoles(games: readonly GameLine[]): RoleShare[] {
	const counts = new Map<Position, number>();
	for (const { role } of games) if (role !== null) counts.set(role, (counts.get(role) ?? 0) + 1);

	return [...counts]
		.map(([role, count]) => ({ role, games: count }))
		.sort((left, right) => right.games - left.games || compareRoles(left.role, right.role));
}

function countChampions(games: readonly GameLine[]): TeamChampionRecord[] {
	const records = new Map<string, ChampionRecord & { kills: number; deaths: number; assists: number }>();
	for (const game of games) {
		const record = records.get(game.champion) ??
			{ champion: game.champion, games: 0, wins: 0, lastPlayedAt: game.startedAt, kills: 0, deaths: 0, assists: 0 };
		record.games += 1;
		record.wins += Number(game.won);
		record.lastPlayedAt = Math.max(record.lastPlayedAt, game.startedAt);
		record.kills += game.kills;
		record.deaths += game.deaths;
		record.assists += game.assists;
		records.set(game.champion, record);
	}

	return [...records.values()]
		.map(({ kills, deaths, assists, ...record }) => ({ ...record, kda: kdaRatio(kills, deaths, assists) }))
		.sort((left, right) => right.games - left.games || right.wins - left.wins || left.champion.localeCompare(right.champion));
}

function rollingKillParticipation(games: readonly GameLine[]): number[] {
	const perGame = games.filter((game) => game.teamKills > 0).map((game) => (game.kills + game.assists) / game.teamKills);
	if (perGame.length < PROGRESSION_WINDOW) return [];

	return perGame.slice(PROGRESSION_WINDOW - 1).map((_, index) => {
		const window = perGame.slice(index, index + PROGRESSION_WINDOW);
		return window.reduce((sum, value) => sum + value, 0) / PROGRESSION_WINDOW;
	});
}

function findBestGame(games: readonly GameLine[]): PlayerHighlight | null {
	const score = (game: GameLine) => kdaRatio(game.kills, game.deaths, game.assists);
	const best = games.reduce<GameLine | null>(
		(current, game) =>
			current === null ||
			score(game) > score(current) ||
			(score(game) === score(current) && game.kills + game.assists > current.kills + current.assists)
				? game
				: current,
		null,
	);

	return best === null
		? null
		: {
				matchId: best.matchId,
				startedAt: best.startedAt,
				champion: best.champion,
				kills: best.kills,
				deaths: best.deaths,
				assists: best.assists,
				outcome: toOutcome(best.won),
			};
}
